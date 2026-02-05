import express from 'express';
import { query, getById, insert, update } from '../../config/database.js';
import { logger } from '../../utils/logger.js';

const router = express.Router();

// GET /api/v1/orders
router.get('/', async (req, res) => {
  try {
    const { status, agent_id, customer_id, search, limit = 100, offset = 0 } = req.query;

    let sql = 'SELECT * FROM orders WHERE 1=1';
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
      sql += ` AND (salesorder_number ILIKE $${paramIdx} OR customer_name ILIKE $${paramIdx} OR reference_number ILIKE $${paramIdx})`;
      params.push(`%${search}%`);
      paramIdx++;
    }

    sql += ` ORDER BY date DESC LIMIT $${paramIdx++} OFFSET $${paramIdx++}`;
    params.push(parseInt(limit), parseInt(offset));

    const { rows } = await query(sql, params);
    res.json({ data: rows, count: rows.length });
  } catch (err) {
    logger.error('[Orders] List error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/v1/orders/count
router.get('/count', async (req, res) => {
  try {
    const { status, agent_id } = req.query;
    let sql = 'SELECT COUNT(*) as count FROM orders WHERE 1=1';
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

    const { rows } = await query(sql, params);
    res.json({ count: parseInt(rows[0].count) });
  } catch (err) {
    logger.error('[Orders] Count error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/v1/orders/:id
router.get('/:id', async (req, res) => {
  try {
    const order = await getById('orders', req.params.id);
    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }

    // Include line items
    const { rows: lineItems } = await query(
      'SELECT * FROM order_line_items WHERE order_id = $1 ORDER BY sort_order, id',
      [order.id]
    );

    res.json({ data: { ...order, line_items: lineItems } });
  } catch (err) {
    logger.error('[Orders] Get error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/v1/orders
router.post('/', async (req, res) => {
  try {
    const order = await insert('orders', req.body);
    res.status(201).json({ data: order });
  } catch (err) {
    logger.error('[Orders] Create error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /api/v1/orders/:id
router.put('/:id', async (req, res) => {
  try {
    const order = await update('orders', req.params.id, req.body);
    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }
    res.json({ data: order });
  } catch (err) {
    logger.error('[Orders] Update error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export { router as ordersRouter };
