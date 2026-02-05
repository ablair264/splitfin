import express from 'express';
import axios from 'axios';
import { query, getById, insert, update } from '../../config/database.js';
import { getAccessToken, ZOHO_CONFIG } from '../../api/zoho.js';
import { logger } from '../../utils/logger.js';

const router = express.Router();

// GET /api/v1/customers
router.get('/', async (req, res) => {
  try {
    const { status, agent_id, search, limit = 100, offset = 0 } = req.query;

    let sql = `SELECT c.*,
      (SELECT MAX(o.date) FROM orders o WHERE o.zoho_customer_id = c.zoho_contact_id) as last_order_date
      FROM customers c WHERE 1=1`;
    const params = [];
    let paramIdx = 1;

    if (status) {
      sql += ` AND c.status = $${paramIdx++}`;
      params.push(status);
    }

    if (agent_id) {
      sql += ` AND c.agent_id = $${paramIdx++}`;
      params.push(agent_id);
    }

    if (search) {
      sql += ` AND (c.company_name ILIKE $${paramIdx} OR c.contact_name ILIKE $${paramIdx} OR c.email ILIKE $${paramIdx})`;
      params.push(`%${search}%`);
      paramIdx++;
    }

    sql += ` ORDER BY c.company_name ASC LIMIT $${paramIdx++} OFFSET $${paramIdx++}`;
    params.push(parseInt(limit), parseInt(offset));

    const { rows } = await query(sql, params);
    res.json({ data: rows, count: rows.length });
  } catch (err) {
    logger.error('[Customers] List error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/v1/customers/count
router.get('/count', async (req, res) => {
  try {
    const { status } = req.query;
    let sql = 'SELECT COUNT(*) as count FROM customers';
    const params = [];

    if (status) {
      sql += ' WHERE status = $1';
      params.push(status);
    }

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
