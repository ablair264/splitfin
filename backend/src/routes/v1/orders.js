import express from 'express';
import { query, getById, insert, update } from '../../config/database.js';
import { logger } from '../../utils/logger.js';

const router = express.Router();

// Allowed sort columns for orders (prevents SQL injection)
const ORDER_SORT_COLUMNS = {
  date: 'date',
  salesorder_number: 'salesorder_number',
  customer_name: 'customer_name',
  salesperson_name: 'salesperson_name',
  status: 'status',
  total: 'total',
};

// GET /api/v1/orders
router.get('/', async (req, res) => {
  try {
    const {
      status, agent_id, customer_id, search,
      salesperson_name, shipped_status, invoiced_status,
      date_from, date_to, total_min, total_max,
      sort_by = 'date', sort_order = 'desc',
      limit = 50, offset = 0,
    } = req.query;

    let where = 'WHERE 1=1';
    const params = [];
    let idx = 1;

    if (status) {
      // Support comma-separated multi-status
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

    if (shipped_status) {
      where += ` AND shipped_status = $${idx++}`;
      params.push(shipped_status);
    }

    if (invoiced_status) {
      where += ` AND invoiced_status = $${idx++}`;
      params.push(invoiced_status);
    }

    if (search) {
      where += ` AND (salesorder_number ILIKE $${idx} OR customer_name ILIKE $${idx} OR reference_number ILIKE $${idx})`;
      params.push(`%${search}%`);
      idx++;
    }

    if (date_from) {
      where += ` AND date >= $${idx++}`;
      params.push(date_from);
    }

    if (date_to) {
      where += ` AND date <= $${idx++}`;
      params.push(date_to);
    }

    if (total_min) {
      where += ` AND total >= $${idx++}`;
      params.push(parseFloat(total_min));
    }

    if (total_max) {
      where += ` AND total <= $${idx++}`;
      params.push(parseFloat(total_max));
    }

    const col = ORDER_SORT_COLUMNS[sort_by] || 'date';
    const dir = sort_order === 'asc' ? 'ASC' : 'DESC';
    const lim = parseInt(limit);
    const off = parseInt(offset);

    const countSql = `SELECT COUNT(*) as total FROM orders ${where}`;
    const dataSql = `SELECT * FROM orders ${where} ORDER BY ${col} ${dir} LIMIT $${idx++} OFFSET $${idx++}`;
    params.push(lim, off);

    // Run count and data queries in parallel (count uses params without limit/offset)
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
    logger.error('[Orders] List error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/v1/orders/count
router.get('/count', async (req, res) => {
  try {
    const { status, agent_id, salesperson_name, shipped_status, invoiced_status, search, date_from, date_to, total_min, total_max } = req.query;
    let sql = 'SELECT COUNT(*) as count FROM orders WHERE 1=1';
    const params = [];
    let idx = 1;

    if (status) {
      const statuses = status.split(',').map(s => s.trim()).filter(Boolean);
      if (statuses.length === 1) {
        sql += ` AND status = $${idx++}`;
        params.push(statuses[0]);
      } else if (statuses.length > 1) {
        sql += ` AND status = ANY($${idx++}::text[])`;
        params.push(statuses);
      }
    }
    if (agent_id) { sql += ` AND agent_id = $${idx++}`; params.push(agent_id); }
    if (salesperson_name) { sql += ` AND salesperson_name = $${idx++}`; params.push(salesperson_name); }
    if (shipped_status) { sql += ` AND shipped_status = $${idx++}`; params.push(shipped_status); }
    if (invoiced_status) { sql += ` AND invoiced_status = $${idx++}`; params.push(invoiced_status); }
    if (search) { sql += ` AND (salesorder_number ILIKE $${idx} OR customer_name ILIKE $${idx} OR reference_number ILIKE $${idx})`; params.push(`%${search}%`); idx++; }
    if (date_from) { sql += ` AND date >= $${idx++}`; params.push(date_from); }
    if (date_to) { sql += ` AND date <= $${idx++}`; params.push(date_to); }
    if (total_min) { sql += ` AND total >= $${idx++}`; params.push(parseFloat(total_min)); }
    if (total_max) { sql += ` AND total <= $${idx++}`; params.push(parseFloat(total_max)); }

    const { rows } = await query(sql, params);
    res.json({ count: parseInt(rows[0].count) });
  } catch (err) {
    logger.error('[Orders] Count error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/v1/orders/salespersons
// Accepts optional filters: status, search, date_from, date_to
router.get('/salespersons', async (req, res) => {
  try {
    const { status, search, date_from, date_to } = req.query;
    let where = `WHERE salesperson_name IS NOT NULL AND salesperson_name != ''`;
    const params = [];
    let idx = 1;

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
    if (search) {
      where += ` AND (salesorder_number ILIKE $${idx} OR customer_name ILIKE $${idx})`;
      params.push(`%${search}%`);
      idx++;
    }
    if (date_from) { where += ` AND date >= $${idx++}`; params.push(date_from); }
    if (date_to) { where += ` AND date <= $${idx++}`; params.push(date_to); }

    const { rows } = await query(
      `SELECT salesperson_name, COUNT(*) as count FROM orders ${where} GROUP BY salesperson_name ORDER BY salesperson_name`,
      params
    );
    res.json({ data: rows });
  } catch (err) {
    logger.error('[Orders] Salespersons error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/v1/orders/statuses
// Accepts optional filters: salesperson_name, search, date_from, date_to
router.get('/statuses', async (req, res) => {
  try {
    const { salesperson_name, search, date_from, date_to } = req.query;
    let where = 'WHERE 1=1';
    const params = [];
    let idx = 1;

    if (salesperson_name) {
      where += ` AND salesperson_name = $${idx++}`;
      params.push(salesperson_name);
    }
    if (search) {
      where += ` AND (salesorder_number ILIKE $${idx} OR customer_name ILIKE $${idx})`;
      params.push(`%${search}%`);
      idx++;
    }
    if (date_from) { where += ` AND date >= $${idx++}`; params.push(date_from); }
    if (date_to) { where += ` AND date <= $${idx++}`; params.push(date_to); }

    const { rows } = await query(
      `SELECT status, COUNT(*) as count FROM orders ${where} GROUP BY status ORDER BY count DESC`,
      params
    );
    res.json({ data: rows });
  } catch (err) {
    logger.error('[Orders] Statuses error:', err);
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
