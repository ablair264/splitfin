import express from 'express';
import { query, getById } from '../../config/database.js';
import { logger } from '../../utils/logger.js';

const router = express.Router();

// GET /api/v1/invoices
router.get('/', async (req, res) => {
  try {
    const { status, agent_id, customer_id, search, limit = 100, offset = 0 } = req.query;

    let sql = 'SELECT * FROM invoices WHERE 1=1';
    const params = [];
    let paramIdx = 1;

    if (status) {
      sql += ` AND status = $${paramIdx++}`;
      params.push(status);
    }

    if (agent_id) {
      sql += ` AND agent_id = $${paramIdx++}`;
      params.push(agent_id);
    }

    if (customer_id) {
      sql += ` AND zoho_customer_id = $${paramIdx++}`;
      params.push(customer_id);
    }

    if (search) {
      sql += ` AND (invoice_number ILIKE $${paramIdx} OR customer_name ILIKE $${paramIdx})`;
      params.push(`%${search}%`);
      paramIdx++;
    }

    sql += ` ORDER BY invoice_date DESC LIMIT $${paramIdx++} OFFSET $${paramIdx++}`;
    params.push(parseInt(limit), parseInt(offset));

    const { rows } = await query(sql, params);
    res.json({ data: rows, count: rows.length });
  } catch (err) {
    logger.error('[Invoices] List error:', err);
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

    // Include line items
    const { rows: lineItems } = await query(
      'SELECT * FROM invoice_line_items WHERE zoho_invoice_id = $1 ORDER BY id',
      [invoice.zoho_invoice_id]
    );

    res.json({ data: { ...invoice, line_items: lineItems } });
  } catch (err) {
    logger.error('[Invoices] Get error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export { router as invoicesRouter };
