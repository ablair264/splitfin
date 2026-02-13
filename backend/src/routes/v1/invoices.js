import express from 'express';
import { query, getById, insert } from '../../config/database.js';
import { logger } from '../../utils/logger.js';
import { createInvoiceFromSalesOrder, getZohoInvoice, recordZohoPayment } from '../../services/zohoInvoiceService.js';
import { sendInvoiceReminder } from '../../services/emailService.js';

const router = express.Router();

// Allowed sort columns (prevents SQL injection)
const INVOICE_SORT_COLUMNS = {
  invoice_date: 'invoice_date',
  due_date: 'due_date',
  invoice_number: 'invoice_number',
  customer_name: 'customer_name',
  salesperson_name: 'salesperson_name',
  status: 'status',
  total: 'total',
  balance: 'balance',
};

// Shared filter builder for invoices
function buildInvoiceFilters(queryParams) {
  let where = 'WHERE 1=1';
  const params = [];
  let idx = 1;

  const {
    status, agent_id, customer_id, search,
    salesperson_name, payment_terms,
    date_from, date_to, due_date_from, due_date_to,
    total_min, total_max, balance_min, balance_max,
    overdue,
  } = queryParams;

  if (status) {
    const statuses = status.split(',').map(s => s.trim()).filter(Boolean);
    if (statuses.length === 1) {
      where += ` AND status = $${idx++}`;
      params.push(statuses[0]);
    } else if (statuses.length > 1) {
      where += ` AND status = ANY($${idx++}::text[])`;
      params.push(statuses);
    }
  }

  if (agent_id) {
    where += ` AND agent_id = $${idx++}`;
    params.push(agent_id);
  }

  if (customer_id) {
    where += ` AND zoho_customer_id = $${idx++}`;
    params.push(customer_id);
  }

  if (salesperson_name) {
    where += ` AND salesperson_name = $${idx++}`;
    params.push(salesperson_name);
  }

  if (payment_terms) {
    where += ` AND payment_terms_label = $${idx++}`;
    params.push(payment_terms);
  }

  if (search) {
    where += ` AND (invoice_number ILIKE $${idx} OR customer_name ILIKE $${idx} OR salesorder_number ILIKE $${idx})`;
    params.push(`%${search}%`);
    idx++;
  }

  if (date_from) {
    where += ` AND invoice_date >= $${idx++}`;
    params.push(date_from);
  }
  if (date_to) {
    where += ` AND invoice_date <= $${idx++}`;
    params.push(date_to);
  }

  if (due_date_from) {
    where += ` AND due_date >= $${idx++}`;
    params.push(due_date_from);
  }
  if (due_date_to) {
    where += ` AND due_date <= $${idx++}`;
    params.push(due_date_to);
  }

  if (total_min) {
    where += ` AND total >= $${idx++}`;
    params.push(parseFloat(total_min));
  }
  if (total_max) {
    where += ` AND total <= $${idx++}`;
    params.push(parseFloat(total_max));
  }

  if (balance_min) {
    where += ` AND balance >= $${idx++}`;
    params.push(parseFloat(balance_min));
  }
  if (balance_max) {
    where += ` AND balance <= $${idx++}`;
    params.push(parseFloat(balance_max));
  }

  if (overdue === 'true') {
    where += ` AND due_date < CURRENT_DATE AND balance > 0`;
  }

  return { where, params, idx };
}

// GET /api/v1/invoices
router.get('/', async (req, res) => {
  try {
    const { sort_by = 'invoice_date', sort_order = 'desc', limit = 50, offset = 0 } = req.query;
    const { where, params, idx } = buildInvoiceFilters(req.query);

    const col = INVOICE_SORT_COLUMNS[sort_by] || 'invoice_date';
    const dir = sort_order === 'asc' ? 'ASC' : 'DESC';
    const lim = parseInt(limit);
    const off = parseInt(offset);

    let paramIdx = idx;
    const countSql = `SELECT COUNT(*) as total FROM invoices ${where}`;
    const dataSql = `SELECT * FROM invoices ${where} ORDER BY ${col} ${dir} LIMIT $${paramIdx++} OFFSET $${paramIdx++}`;
    const dataParams = [...params, lim, off];

    const [countResult, dataResult] = await Promise.all([
      query(countSql, params),
      query(dataSql, dataParams),
    ]);

    const total = parseInt(countResult.rows[0].total);
    res.json({
      data: dataResult.rows,
      count: dataResult.rows.length,
      meta: { total, limit: lim, offset: off, has_more: off + lim < total },
    });
  } catch (err) {
    logger.error('[Invoices] List error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/v1/invoices/statuses
router.get('/statuses', async (req, res) => {
  try {
    const { where, params } = buildInvoiceFilters({ ...req.query, status: undefined });
    const { rows } = await query(
      `SELECT status, COUNT(*) as count FROM invoices ${where} GROUP BY status ORDER BY count DESC`,
      params
    );
    res.json({ data: rows });
  } catch (err) {
    logger.error('[Invoices] Statuses error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/v1/invoices/salespersons
router.get('/salespersons', async (req, res) => {
  try {
    const { where, params } = buildInvoiceFilters({ ...req.query, salesperson_name: undefined });
    const { rows } = await query(
      `SELECT salesperson_name, COUNT(*) as count FROM invoices ${where} AND salesperson_name IS NOT NULL AND salesperson_name != '' GROUP BY salesperson_name ORDER BY salesperson_name`,
      params
    );
    res.json({ data: rows });
  } catch (err) {
    logger.error('[Invoices] Salespersons error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/v1/invoices/summary
router.get('/summary', async (req, res) => {
  try {
    const { where, params } = buildInvoiceFilters(req.query);
    const { rows } = await query(
      `SELECT
        COALESCE(SUM(total), 0) as total_invoiced,
        COALESCE(SUM(balance), 0) as total_outstanding,
        COALESCE(SUM(CASE WHEN due_date < CURRENT_DATE AND balance > 0 THEN balance ELSE 0 END), 0) as total_overdue,
        COUNT(CASE WHEN due_date < CURRENT_DATE AND balance > 0 THEN 1 END) as overdue_count
      FROM invoices ${where}`,
      params
    );
    res.json({ data: rows[0] });
  } catch (err) {
    logger.error('[Invoices] Summary error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/v1/invoices/from-order
router.post('/from-order', async (req, res) => {
  try {
    const { zoho_salesorder_id, agent_id } = req.body;

    if (!zoho_salesorder_id) {
      return res.status(400).json({ error: 'zoho_salesorder_id is required' });
    }

    // Check order exists
    const { rows: orderRows } = await query(
      'SELECT id, salesorder_number, zoho_customer_id, customer_name FROM orders WHERE zoho_salesorder_id = $1 LIMIT 1',
      [zoho_salesorder_id]
    );
    if (orderRows.length === 0) {
      return res.status(404).json({ error: 'Order not found' });
    }

    // Check no invoice already exists for this SO
    const { rows: existingInvoices } = await query(
      'SELECT id, invoice_number FROM invoices WHERE zoho_salesorder_id = $1 LIMIT 1',
      [zoho_salesorder_id]
    );
    if (existingInvoices.length > 0) {
      return res.status(409).json({
        error: `Invoice ${existingInvoices[0].invoice_number} already exists for this order`,
        existing_invoice_id: existingInvoices[0].id,
      });
    }

    // Create invoice in Zoho
    const zohoInvoice = await createInvoiceFromSalesOrder(zoho_salesorder_id);

    // Fetch the full invoice from Zoho to get all fields + line items
    const fullInvoice = await getZohoInvoice(zohoInvoice.invoice_id);

    // Upsert invoice into Neon
    const invoiceData = {
      zoho_invoice_id: fullInvoice.invoice_id,
      invoice_number: fullInvoice.invoice_number,
      reference_number: fullInvoice.reference_number || null,
      zoho_customer_id: fullInvoice.customer_id,
      customer_name: fullInvoice.customer_name,
      agent_id: agent_id || null,
      zoho_salesorder_id: zoho_salesorder_id,
      salesorder_number: fullInvoice.salesorder_number || orderRows[0].salesorder_number,
      invoice_date: fullInvoice.date || new Date().toISOString().split('T')[0],
      due_date: fullInvoice.due_date || null,
      status: fullInvoice.status || 'draft',
      sub_total: parseFloat(fullInvoice.sub_total) || 0,
      tax_total: parseFloat(fullInvoice.tax_total) || 0,
      discount_total: parseFloat(fullInvoice.discount_total) || 0,
      shipping_charge: parseFloat(fullInvoice.shipping_charge) || 0,
      total: parseFloat(fullInvoice.total) || 0,
      balance: parseFloat(fullInvoice.balance) || 0,
      currency_code: fullInvoice.currency_code || 'GBP',
      payment_terms: fullInvoice.payment_terms || null,
      payment_terms_label: fullInvoice.payment_terms_label || null,
      salesperson_id: fullInvoice.salesperson_id || null,
      salesperson_name: fullInvoice.salesperson_name || null,
      billing_address: fullInvoice.billing_address ? JSON.stringify(fullInvoice.billing_address) : null,
      shipping_address: fullInvoice.shipping_address ? JSON.stringify(fullInvoice.shipping_address) : null,
      notes: fullInvoice.notes || null,
      terms: fullInvoice.terms || null,
      sync_status: 'synced',
    };

    // Insert invoice
    const insertCols = Object.keys(invoiceData);
    const insertVals = Object.values(invoiceData);
    const placeholders = insertCols.map((_, i) => `$${i + 1}`).join(', ');
    const { rows: inserted } = await query(
      `INSERT INTO invoices (${insertCols.join(', ')}) VALUES (${placeholders}) RETURNING *`,
      insertVals
    );
    const newInvoice = inserted[0];

    // Insert line items
    if (fullInvoice.line_items && fullInvoice.line_items.length > 0) {
      for (const item of fullInvoice.line_items) {
        await query(
          `INSERT INTO invoice_line_items (invoice_id, zoho_line_item_id, zoho_item_id, sku, name, description, quantity, rate, amount, discount, discount_amount, tax_name, tax_percentage, tax_amount, sort_order)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)`,
          [
            newInvoice.id,
            item.line_item_id || null,
            item.item_id || '',
            item.sku || null,
            item.name || item.item_name || '',
            item.description || null,
            parseInt(item.quantity) || 1,
            parseFloat(item.rate) || 0,
            parseFloat(item.item_total) || 0,
            parseFloat(item.discount) || 0,
            parseFloat(item.discount_amount) || 0,
            item.tax_name || null,
            parseFloat(item.tax_percentage) || 0,
            parseFloat(item.tax_amount) || 0,
            item.sort_order || 0,
          ]
        );
      }
    }

    // Create notification for agent
    if (agent_id) {
      try {
        await query(
          `INSERT INTO notifications (agent_id, type, title, body, data) VALUES ($1, $2, $3, $4, $5)`,
          [
            agent_id,
            'invoice_created',
            `Invoice ${newInvoice.invoice_number} generated`,
            `Invoice created for ${newInvoice.customer_name} from order ${orderRows[0].salesorder_number}`,
            JSON.stringify({ invoice_id: newInvoice.id, invoice_number: newInvoice.invoice_number }),
          ]
        );
      } catch (notifErr) {
        logger.warn('[Invoices] Notification creation failed:', notifErr.message);
      }
    }

    // Fetch with line items for response
    const { rows: lineItems } = await query(
      'SELECT * FROM invoice_line_items WHERE invoice_id = $1 ORDER BY sort_order, id',
      [newInvoice.id]
    );

    res.status(201).json({ data: { ...newInvoice, line_items: lineItems } });
  } catch (err) {
    logger.error('[Invoices] Create from order error:', err);
    res.status(500).json({ error: err.message || 'Failed to create invoice' });
  }
});

// GET /api/v1/invoices/reminder-global — master on/off for auto-reminders
router.get('/reminder-global', async (req, res) => {
  try {
    const { rows } = await query(
      "SELECT data FROM app_cache WHERE cache_key = 'invoice_reminders_enabled' LIMIT 1"
    );
    const enabled = rows[0]?.data?.enabled ?? false;
    res.json({ data: { enabled } });
  } catch (err) {
    logger.error('[Invoices] Get global reminder status error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /api/v1/invoices/reminder-global — toggle master on/off
router.put('/reminder-global', async (req, res) => {
  try {
    const { enabled } = req.body;
    await query(
      `INSERT INTO app_cache (cache_key, data, updated_at)
       VALUES ('invoice_reminders_enabled', $1, NOW())
       ON CONFLICT (cache_key) DO UPDATE SET data = $1, updated_at = NOW()`,
      [JSON.stringify({ enabled: !!enabled })]
    );
    res.json({ data: { enabled: !!enabled } });
  } catch (err) {
    logger.error('[Invoices] Set global reminder status error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/v1/invoices/reminder-settings/:customerId
// Must be before /:id to avoid Express matching "reminder-settings" as an id
router.get('/reminder-settings/:customerId', async (req, res) => {
  try {
    const { rows } = await query(
      'SELECT * FROM invoice_reminder_settings WHERE customer_id = $1 LIMIT 1',
      [parseInt(req.params.customerId)]
    );
    res.json({
      data: rows[0] || {
        customer_id: parseInt(req.params.customerId),
        is_enabled: true,
        days_before_due: [7, 3, 1],
        days_after_due: [1, 7, 14, 30],
        max_reminders: 5,
        cc_agent: true,
        custom_message: null,
      },
    });
  } catch (err) {
    logger.error('[Invoices] Reminder settings get error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /api/v1/invoices/reminder-settings/:customerId
router.put('/reminder-settings/:customerId', async (req, res) => {
  try {
    const customerId = parseInt(req.params.customerId);
    const { is_enabled, days_before_due, days_after_due, max_reminders, cc_agent, custom_message } = req.body;

    const { rows } = await query(
      `INSERT INTO invoice_reminder_settings (customer_id, is_enabled, days_before_due, days_after_due, max_reminders, cc_agent, custom_message, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
       ON CONFLICT (customer_id) DO UPDATE SET
         is_enabled = COALESCE($2, invoice_reminder_settings.is_enabled),
         days_before_due = COALESCE($3, invoice_reminder_settings.days_before_due),
         days_after_due = COALESCE($4, invoice_reminder_settings.days_after_due),
         max_reminders = COALESCE($5, invoice_reminder_settings.max_reminders),
         cc_agent = COALESCE($6, invoice_reminder_settings.cc_agent),
         custom_message = $7,
         updated_at = NOW()
       RETURNING *`,
      [
        customerId,
        is_enabled ?? true,
        days_before_due || [7, 3, 1],
        days_after_due || [1, 7, 14, 30],
        max_reminders ?? 5,
        cc_agent ?? true,
        custom_message || null,
      ]
    );

    res.json({ data: rows[0] });
  } catch (err) {
    logger.error('[Invoices] Reminder settings update error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/v1/invoices/:id
router.get('/:id', async (req, res) => {
  try {
    const invoice = await getById('invoices', req.params.id);
    if (!invoice) {
      return res.status(404).json({ error: 'Invoice not found' });
    }

    // Include line items (FK is invoice_id integer)
    const { rows: lineItems } = await query(
      'SELECT * FROM invoice_line_items WHERE invoice_id = $1 ORDER BY sort_order, id',
      [invoice.id]
    );

    // Get customer info
    const { rows: customerRows } = await query(
      'SELECT id, email, phone, mobile, contact_name FROM customers WHERE zoho_contact_id = $1 LIMIT 1',
      [invoice.zoho_customer_id]
    );

    res.json({
      data: {
        ...invoice,
        line_items: lineItems,
        customer_info: customerRows[0] || null,
      },
    });
  } catch (err) {
    logger.error('[Invoices] Get error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/v1/invoices/:id/payments
router.get('/:id/payments', async (req, res) => {
  try {
    const invoice = await getById('invoices', req.params.id);
    if (!invoice) {
      return res.status(404).json({ error: 'Invoice not found' });
    }

    const { rows } = await query(
      'SELECT * FROM invoice_payments WHERE invoice_id = $1 ORDER BY payment_date DESC, id DESC',
      [invoice.id]
    );
    res.json({ data: rows });
  } catch (err) {
    logger.error('[Invoices] Get payments error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/v1/invoices/:id/payments
router.post('/:id/payments', async (req, res) => {
  try {
    const invoice = await getById('invoices', req.params.id);
    if (!invoice) {
      return res.status(404).json({ error: 'Invoice not found' });
    }

    const { amount, payment_date, payment_mode, reference_number, description, recorded_by } = req.body;

    if (!amount || parseFloat(amount) <= 0) {
      return res.status(400).json({ error: 'amount must be greater than 0' });
    }

    if (parseFloat(amount) > parseFloat(invoice.balance)) {
      return res.status(400).json({ error: `Amount (${amount}) exceeds balance (${invoice.balance})` });
    }

    // Try to record in Zoho first
    let zohoPaymentId = null;
    let syncStatus = 'pending_push';

    try {
      const zohoPayment = await recordZohoPayment(
        invoice.zoho_customer_id,
        invoice.zoho_invoice_id,
        {
          amount: parseFloat(amount),
          date: payment_date || new Date().toISOString().split('T')[0],
          payment_mode: payment_mode || 'cash',
          reference_number: reference_number || '',
        }
      );
      zohoPaymentId = zohoPayment?.payment_id || null;
      syncStatus = 'synced';
      logger.info(`[Invoices] Payment recorded in Zoho: ${zohoPaymentId}`);
    } catch (zohoErr) {
      logger.warn('[Invoices] Zoho payment failed, saving locally:', zohoErr.message);
    }

    // Insert payment record
    const { rows: paymentRows } = await query(
      `INSERT INTO invoice_payments (invoice_id, zoho_payment_id, amount, payment_date, payment_mode, reference_number, description, recorded_by, sync_status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
      [
        invoice.id,
        zohoPaymentId,
        parseFloat(amount),
        payment_date || new Date().toISOString().split('T')[0],
        payment_mode || 'cash',
        reference_number || null,
        description || null,
        recorded_by || null,
        syncStatus,
      ]
    );

    // Update invoice balance
    const newBalance = Math.max(0, parseFloat(invoice.balance) - parseFloat(amount));
    const newStatus = newBalance === 0 ? 'paid' : invoice.status;

    await query(
      `UPDATE invoices SET balance = $1, status = $2, last_payment_date = $3, updated_at = NOW() WHERE id = $4`,
      [newBalance, newStatus, paymentRows[0].payment_date, invoice.id]
    );

    // Create notification
    if (recorded_by) {
      try {
        await query(
          `INSERT INTO notifications (agent_id, type, title, body, data) VALUES ($1, $2, $3, $4, $5)`,
          [
            recorded_by,
            'payment_recorded',
            `Payment recorded for ${invoice.invoice_number}`,
            `${formatGBP(parseFloat(amount))} ${payment_mode || 'cash'} payment recorded`,
            JSON.stringify({ invoice_id: invoice.id, payment_id: paymentRows[0].id }),
          ]
        );
      } catch (notifErr) {
        logger.warn('[Invoices] Notification creation failed:', notifErr.message);
      }
    }

    res.status(201).json({
      data: {
        ...paymentRows[0],
        new_balance: newBalance,
        invoice_status: newStatus,
      },
    });
  } catch (err) {
    logger.error('[Invoices] Record payment error:', err);
    res.status(500).json({ error: err.message || 'Failed to record payment' });
  }
});

function formatGBP(value) {
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format(value);
}

// POST /api/v1/invoices/:id/send-reminder
router.post('/:id/send-reminder', async (req, res) => {
  try {
    const invoice = await getById('invoices', req.params.id);
    if (!invoice) {
      return res.status(404).json({ error: 'Invoice not found' });
    }

    const { to, cc, custom_message, sent_by } = req.body;
    if (!to) {
      return res.status(400).json({ error: 'Recipient email (to) is required' });
    }

    // Get customer info for the email
    const { rows: customerRows } = await query(
      'SELECT id, contact_name, company_name, email FROM customers WHERE zoho_contact_id = $1 LIMIT 1',
      [invoice.zoho_customer_id]
    );
    const customer = customerRows[0] || { company_name: invoice.customer_name };

    const subject = `Payment Reminder: Invoice ${invoice.invoice_number} - ${formatGBP(invoice.balance)} due`;

    const result = await sendInvoiceReminder({
      to,
      cc: cc || undefined,
      subject,
      invoice,
      customer,
      customMessage: custom_message,
    });

    // Log the reminder
    await query(
      `INSERT INTO invoice_reminder_log (invoice_id, customer_id, reminder_type, sent_to, cc_to, subject, resend_message_id, status, error, sent_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [
        invoice.id,
        customer?.id || null,
        'manual',
        to,
        cc || null,
        subject,
        result.message_id || null,
        result.success ? 'sent' : 'failed',
        result.error || null,
        sent_by || null,
      ]
    );

    if (result.success) {
      res.json({ data: { success: true, message_id: result.message_id } });
    } else {
      res.status(500).json({ error: result.error || 'Failed to send reminder' });
    }
  } catch (err) {
    logger.error('[Invoices] Send reminder error:', err);
    res.status(500).json({ error: 'Failed to send reminder' });
  }
});

// GET /api/v1/invoices/:id/reminder-log
router.get('/:id/reminder-log', async (req, res) => {
  try {
    const { rows } = await query(
      'SELECT * FROM invoice_reminder_log WHERE invoice_id = $1 ORDER BY created_at DESC',
      [parseInt(req.params.id)]
    );
    res.json({ data: rows });
  } catch (err) {
    logger.error('[Invoices] Reminder log error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export { router as invoicesRouter };
