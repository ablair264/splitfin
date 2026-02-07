import express from 'express';
import axios from 'axios';
import { query, getById, insert, update } from '../../config/database.js';
import { getAccessToken, ZOHO_CONFIG } from '../../api/zoho.js';
import { logger } from '../../utils/logger.js';

const router = express.Router();

// Allowed sort columns for customers
const CUSTOMER_SORT_COLUMNS = {
  company_name: 'c.company_name',
  email: 'c.email',
  total_spent: 'c.total_spent',
  outstanding_receivable: 'c.outstanding_receivable',
  location_region: 'c.location_region',
  payment_terms_label: 'c.payment_terms_label',
  segment: 'c.segment',
  last_order_date: 'last_order_date',
};

// GET /api/v1/customers
router.get('/', async (req, res) => {
  try {
    const {
      status, agent_id, search,
      region, payment_terms, segment, has_transaction,
      spent_min, spent_max,
      sort_by = 'company_name', sort_order = 'asc',
      limit = 25, offset = 0,
    } = req.query;

    let where = 'WHERE 1=1';
    const params = [];
    let idx = 1;

    if (status) {
      where += ` AND c.status = $${idx++}`;
      params.push(status);
    }

    if (agent_id) {
      where += ` AND c.agent_id = $${idx++}`;
      params.push(agent_id);
    }

    if (search) {
      where += ` AND (c.company_name ILIKE $${idx} OR c.contact_name ILIKE $${idx} OR c.email ILIKE $${idx} OR c.phone ILIKE $${idx})`;
      params.push(`%${search}%`);
      idx++;
    }

    if (region) {
      const regions = region.split(',').map(s => s.trim()).filter(Boolean);
      if (regions.length === 1) {
        where += ` AND c.location_region = $${idx++}`;
        params.push(regions[0]);
      } else if (regions.length > 1) {
        where += ` AND c.location_region = ANY($${idx++}::text[])`;
        params.push(regions);
      }
    }

    if (payment_terms) {
      where += ` AND c.payment_terms_label ILIKE $${idx++}`;
      params.push(payment_terms);
    }

    if (segment) {
      where += ` AND c.segment = $${idx++}`;
      params.push(segment);
    }

    if (has_transaction === 'true') {
      where += ' AND c.has_transaction = true';
    } else if (has_transaction === 'false') {
      where += ' AND (c.has_transaction = false OR c.has_transaction IS NULL)';
    }

    if (spent_min) {
      where += ` AND c.total_spent >= $${idx++}`;
      params.push(parseFloat(spent_min));
    }

    if (spent_max) {
      where += ` AND c.total_spent <= $${idx++}`;
      params.push(parseFloat(spent_max));
    }

    const col = CUSTOMER_SORT_COLUMNS[sort_by] || 'c.company_name';
    const dir = sort_order === 'desc' ? 'DESC' : 'ASC';
    const lim = parseInt(limit);
    const off = parseInt(offset);

    const countSql = `SELECT COUNT(*) as total FROM customers c ${where}`;
    const dataSql = `SELECT c.*,
      (SELECT MAX(o.date) FROM orders o WHERE o.zoho_customer_id = c.zoho_contact_id) as last_order_date
      FROM customers c ${where} ORDER BY ${col} ${dir} NULLS LAST LIMIT $${idx++} OFFSET $${idx++}`;
    params.push(lim, off);

    const countParams = params.slice(0, -2);
    const [countResult, dataResult] = await Promise.all([
      query(countSql, countParams),
      query(dataSql, params),
    ]);

    const total = parseInt(countResult.rows[0].total);
    res.json({
      data: dataResult.rows,
      count: dataResult.rows.length,
      meta: { total, limit: lim, offset: off, has_more: off + lim < total },
    });
  } catch (err) {
    logger.error('[Customers] List error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/v1/customers/count
router.get('/count', async (req, res) => {
  try {
    const { status, agent_id, search, region, payment_terms, segment, has_transaction, spent_min, spent_max } = req.query;
    let sql = 'SELECT COUNT(*) as count FROM customers c WHERE 1=1';
    const params = [];
    let idx = 1;

    if (status) { sql += ` AND c.status = $${idx++}`; params.push(status); }
    if (agent_id) { sql += ` AND c.agent_id = $${idx++}`; params.push(agent_id); }
    if (search) { sql += ` AND (c.company_name ILIKE $${idx} OR c.contact_name ILIKE $${idx} OR c.email ILIKE $${idx} OR c.phone ILIKE $${idx})`; params.push(`%${search}%`); idx++; }
    if (region) {
      const regions = region.split(',').map(s => s.trim()).filter(Boolean);
      if (regions.length === 1) { sql += ` AND c.location_region = $${idx++}`; params.push(regions[0]); }
      else if (regions.length > 1) { sql += ` AND c.location_region = ANY($${idx++}::text[])`; params.push(regions); }
    }
    if (payment_terms) { sql += ` AND c.payment_terms_label ILIKE $${idx++}`; params.push(payment_terms); }
    if (segment) { sql += ` AND c.segment = $${idx++}`; params.push(segment); }
    if (has_transaction === 'true') sql += ' AND c.has_transaction = true';
    else if (has_transaction === 'false') sql += ' AND (c.has_transaction = false OR c.has_transaction IS NULL)';
    if (spent_min) { sql += ` AND c.total_spent >= $${idx++}`; params.push(parseFloat(spent_min)); }
    if (spent_max) { sql += ` AND c.total_spent <= $${idx++}`; params.push(parseFloat(spent_max)); }

    const { rows } = await query(sql, params);
    res.json({ count: parseInt(rows[0].count) });
  } catch (err) {
    logger.error('[Customers] Count error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/v1/customers/:id
router.get('/:id', async (req, res) => {
  try {
    const customer = await getById('customers', req.params.id);
    if (!customer) {
      return res.status(404).json({ error: 'Customer not found' });
    }
    res.json({ data: customer });
  } catch (err) {
    logger.error('[Customers] Get error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/v1/customers
router.post('/', async (req, res) => {
  try {
    const customer = await insert('customers', req.body);
    res.status(201).json({ data: customer });
  } catch (err) {
    logger.error('[Customers] Create error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /api/v1/customers/:id
router.put('/:id', async (req, res) => {
  try {
    // Save to Neon first
    const customer = await update('customers', req.params.id, req.body);
    if (!customer) {
      return res.status(404).json({ error: 'Customer not found' });
    }

    // Push to Zoho Inventory if this customer has a zoho_contact_id
    if (customer.zoho_contact_id) {
      try {
        const token = await getAccessToken();
        const zohoPayload = {
          contact_name: customer.company_name,
          company_name: customer.company_name,
          ...(customer.email && { email: customer.email }),
          ...(customer.phone && { phone: customer.phone }),
          ...(customer.mobile && { mobile: customer.mobile }),
          ...(customer.website && { website: customer.website }),
          ...(customer.payment_terms && { payment_terms: Number(customer.payment_terms) || customer.payment_terms }),
          ...(customer.billing_address && { billing_address: customer.billing_address }),
          ...(customer.shipping_address && { shipping_address: customer.shipping_address }),
        };

        await axios.put(
          `${ZOHO_CONFIG.baseUrls.inventory}/contacts/${customer.zoho_contact_id}`,
          zohoPayload,
          {
            headers: {
              'Authorization': `Zoho-oauthtoken ${token}`,
              'Content-Type': 'application/json',
              'X-com-zoho-inventory-organizationid': ZOHO_CONFIG.orgId,
            },
            timeout: 15000,
          }
        );

        // Mark as synced
        await update('customers', req.params.id, { sync_status: 'synced', sync_error: null });
        customer.sync_status = 'synced';
        customer.sync_error = null;
        logger.info(`[Customers] Zoho sync success for contact ${customer.zoho_contact_id}`);
      } catch (zohoErr) {
        // Zoho failure should not block the local save — mark as pending
        const errorMsg = zohoErr.response?.data?.message || zohoErr.message;
        await update('customers', req.params.id, { sync_status: 'pending_push', sync_error: errorMsg });
        customer.sync_status = 'pending_push';
        customer.sync_error = errorMsg;
        logger.warn(`[Customers] Zoho sync failed for contact ${customer.zoho_contact_id}: ${errorMsg}`);
      }
    }

    res.json({ data: customer });
  } catch (err) {
    logger.error('[Customers] Update error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export { router as customersRouter };
