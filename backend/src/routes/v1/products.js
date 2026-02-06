import express from 'express';
import { query, getById, insert, update } from '../../config/database.js';
import { logger } from '../../utils/logger.js';

const router = express.Router();

// Helper: build common WHERE clause for product queries
function buildProductWhere(filters) {
  const { status, brand, search, stock_filter } = filters;
  const conditions = ['1=1'];
  const params = [];
  let idx = 1;

  if (status) {
    conditions.push(`status = $${idx++}`);
    params.push(status);
  }

  if (brand) {
    conditions.push(`brand = $${idx++}`);
    params.push(brand);
  }

  if (search) {
    conditions.push(`(name ILIKE $${idx} OR sku ILIKE $${idx} OR ean ILIKE $${idx})`);
    params.push(`%${search}%`);
    idx++;
  }

  if (stock_filter === 'in-stock') {
    conditions.push('stock_on_hand > 5');
  } else if (stock_filter === 'low-stock') {
    conditions.push('stock_on_hand > 0 AND stock_on_hand <= 5');
  } else if (stock_filter === 'out-of-stock') {
    conditions.push('stock_on_hand = 0');
  }

  return { where: conditions.join(' AND '), params, nextIdx: idx };
}

// GET /api/v1/products
router.get('/', async (req, res) => {
  try {
    const { limit = 100, offset = 0 } = req.query;
    const { where, params, nextIdx } = buildProductWhere(req.query);
    let idx = nextIdx;

    const sql = `SELECT * FROM products WHERE ${where} ORDER BY name ASC LIMIT $${idx++} OFFSET $${idx++}`;
    params.push(parseInt(limit), parseInt(offset));

    const { rows } = await query(sql, params);
    res.json({ data: rows, count: rows.length });
  } catch (err) {
    logger.error('[Products] List error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/v1/products/count
router.get('/count', async (req, res) => {
  try {
    const { where, params } = buildProductWhere(req.query);
    const sql = `SELECT COUNT(*) as count FROM products WHERE ${where}`;

    const { rows } = await query(sql, params);
    res.json({ count: parseInt(rows[0].count) });
  } catch (err) {
    logger.error('[Products] Count error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/v1/products/stock-counts
// Returns breakdown of stock levels for the given filters (excluding stock_filter itself)
router.get('/stock-counts', async (req, res) => {
  try {
    // Build WHERE without stock_filter so we get counts across all stock levels
    const filters = { ...req.query };
    delete filters.stock_filter;
    const { where, params } = buildProductWhere(filters);

    const sql = `
      SELECT
        COUNT(*) FILTER (WHERE stock_on_hand > 5) as in_stock,
        COUNT(*) FILTER (WHERE stock_on_hand > 0 AND stock_on_hand <= 5) as low_stock,
        COUNT(*) FILTER (WHERE stock_on_hand = 0) as out_of_stock
      FROM products
      WHERE ${where}
    `;

    const { rows } = await query(sql, params);
    res.json({
      in_stock: parseInt(rows[0].in_stock),
      low_stock: parseInt(rows[0].low_stock),
      out_of_stock: parseInt(rows[0].out_of_stock),
    });
  } catch (err) {
    logger.error('[Products] Stock counts error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/v1/products/brands
router.get('/brands', async (req, res) => {
  try {
    const { rows } = await query(
      "SELECT DISTINCT brand, COUNT(*) as count FROM products WHERE status = 'active' AND brand != '' GROUP BY brand ORDER BY brand"
    );
    res.json({ data: rows });
  } catch (err) {
    logger.error('[Products] Brands error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/v1/products/:id
router.get('/:id', async (req, res) => {
  try {
    const product = await getById('products', req.params.id);
    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }
    res.json({ data: product });
  } catch (err) {
    logger.error('[Products] Get error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /api/v1/products/:id
router.put('/:id', async (req, res) => {
  try {
    const product = await update('products', req.params.id, req.body);
    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }
    res.json({ data: product });
  } catch (err) {
    logger.error('[Products] Update error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export { router as productsRouter };
