import express from 'express';
import { query } from '../../config/database.js';
import { getZohoInvoice } from '../../services/zohoInvoiceService.js';
import { logger } from '../../utils/logger.js';

const router = express.Router();

/**
 * Webhook authentication middleware.
 * Checks X-Webhook-Secret header against WEBHOOK_SECRET env var.
 */
function authenticateWebhook(req, res, next) {
  const webhookSecret = req.headers['x-webhook-secret'];

  if (!process.env.WEBHOOK_SECRET) {
    logger.warn('No WEBHOOK_SECRET configured - webhook auth disabled');
    return next();
  }

  if (webhookSecret !== process.env.WEBHOOK_SECRET) {
    logger.warn(`Webhook auth failed from IP: ${req.ip}`);
    return res.status(401).json({ success: false, error: 'Unauthorized' });
  }

  next();
}

/**
 * Upsert an invoice from Zoho data into Neon.
 */
async function upsertInvoiceFromZoho(zohoInvoice) {
  const invoiceData = {
    zoho_invoice_id: zohoInvoice.invoice_id,
    invoice_number: zohoInvoice.invoice_number,
    reference_number: zohoInvoice.reference_number || null,
    zoho_customer_id: zohoInvoice.customer_id,
    customer_name: zohoInvoice.customer_name,
    zoho_salesorder_id: zohoInvoice.salesorder_id || null,
    salesorder_number: zohoInvoice.salesorder_number || null,
    invoice_date: zohoInvoice.date || new Date().toISOString().split('T')[0],
    due_date: zohoInvoice.due_date || null,
    status: zohoInvoice.status || 'draft',
    sub_total: parseFloat(zohoInvoice.sub_total) || 0,
    tax_total: parseFloat(zohoInvoice.tax_total) || 0,
    discount_total: parseFloat(zohoInvoice.discount_total) || 0,
    shipping_charge: parseFloat(zohoInvoice.shipping_charge) || 0,
    total: parseFloat(zohoInvoice.total) || 0,
    balance: parseFloat(zohoInvoice.balance) || 0,
    currency_code: zohoInvoice.currency_code || 'GBP',
    payment_terms: zohoInvoice.payment_terms || null,
    payment_terms_label: zohoInvoice.payment_terms_label || null,
    salesperson_id: zohoInvoice.salesperson_id || null,
    salesperson_name: zohoInvoice.salesperson_name || null,
    billing_address: zohoInvoice.billing_address ? JSON.stringify(zohoInvoice.billing_address) : null,
    shipping_address: zohoInvoice.shipping_address ? JSON.stringify(zohoInvoice.shipping_address) : null,
    notes: zohoInvoice.notes || null,
    terms: zohoInvoice.terms || null,
    sync_status: 'synced',
    updated_at: new Date().toISOString(),
  };

  const cols = Object.keys(invoiceData);
  const vals = Object.values(invoiceData);
  const placeholders = cols.map((_, i) => `$${i + 1}`).join(', ');
  const updateCols = cols
    .filter(c => c !== 'zoho_invoice_id')
    .map(c => `${c} = EXCLUDED.${c}`)
    .join(', ');

  const { rows } = await query(
    `INSERT INTO invoices (${cols.join(', ')}) VALUES (${placeholders})
     ON CONFLICT (zoho_invoice_id) DO UPDATE SET ${updateCols}
     RETURNING *`,
    vals
  );

  const invoice = rows[0];

  // Sync line items: delete + re-insert
  if (zohoInvoice.line_items && zohoInvoice.line_items.length > 0) {
    await query('DELETE FROM invoice_line_items WHERE invoice_id = $1', [invoice.id]);

    for (const item of zohoInvoice.line_items) {
      await query(
        `INSERT INTO invoice_line_items (invoice_id, zoho_line_item_id, zoho_item_id, sku, name, description, quantity, rate, amount, discount, discount_amount, tax_name, tax_percentage, tax_amount, sort_order)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)`,
        [
          invoice.id,
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

  return invoice;
}

/**
 * POST /api/v1/webhooks/invoice
 * Handles invoice events from Zoho Inventory.
 */
router.post('/invoice', authenticateWebhook, async (req, res) => {
  // Respond immediately
  res.status(200).json({ success: true, received: true });

  try {
    const { event, invoice_id, data } = req.body;
    const eventType = event || req.body.event_type || 'unknown';

    logger.info(`[Invoice Webhook] Received event: ${eventType}, invoice_id: ${invoice_id || data?.invoice_id}`);

    const zohoInvoiceId = invoice_id || data?.invoice_id;

    if (!zohoInvoiceId) {
      logger.warn('[Invoice Webhook] No invoice_id in payload');
      return;
    }

    if (eventType.includes('delete') || eventType === 'invoice.deleted') {
      // Soft-delete: set status to void
      await query(
        `UPDATE invoices SET status = 'void', sync_status = 'synced', updated_at = NOW() WHERE zoho_invoice_id = $1`,
        [zohoInvoiceId]
      );
      logger.info(`[Invoice Webhook] Invoice ${zohoInvoiceId} marked as void`);
      return;
    }

    // For create/update: fetch full invoice from Zoho and upsert
    const fullInvoice = await getZohoInvoice(zohoInvoiceId);
    const invoice = await upsertInvoiceFromZoho(fullInvoice);

    // Create notification for the assigned agent
    if (invoice.agent_id) {
      const notifType = eventType.includes('create') ? 'invoice_created' : 'invoice_updated';
      const title = eventType.includes('create')
        ? `Invoice ${invoice.invoice_number} created`
        : `Invoice ${invoice.invoice_number} updated`;

      await query(
        `INSERT INTO notifications (agent_id, type, title, body, data) VALUES ($1, $2, $3, $4, $5)`,
        [
          invoice.agent_id,
          notifType,
          title,
          `${invoice.customer_name} - Total: ${invoice.total} ${invoice.currency_code}`,
          JSON.stringify({ invoice_id: invoice.id, zoho_invoice_id: zohoInvoiceId }),
        ]
      );
    }

    logger.info(`[Invoice Webhook] Successfully processed ${eventType} for ${invoice.invoice_number}`);
  } catch (err) {
    logger.error('[Invoice Webhook] Processing error:', err);
  }
});

export { router as invoiceWebhooksRouter };
