import express from 'express';
import { query, getById, insert, update } from '../../config/database.js';
import { logger } from '../../utils/logger.js';

const router = express.Router();

// GET /api/v1/products
router.get('/', async (req, res) => {
  try {
    const { status, brand, search, limit = 100, offset = 0 } = req.query;

    let sql = 'SELECT * FROM products WHERE 1=1';
    const params = [];
    let paramIdx = 1;

    if (status) {
      sql += ` AND status = $${paramIdx++}`;
      params.push(status);
    }

    if (brand) {
      sql += ` AND brand = $${paramIdx++}`;
      params.push(brand);
    }

    if (search) {
      sql += ` AND (name ILIKE $${paramIdx} OR sku ILIKE $${paramIdx} OR ean ILIKE $${paramIdx})`;
      params.push(`%${search}%`);
      paramIdx++;
    }

    sql += ` ORDER BY name ASC LIMIT $${paramIdx++} OFFSET $${paramIdx++}`;
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
    const { status, brand } = req.query;
    let sql = 'SELECT COUNT(*) as count FROM products WHERE 1=1';
    const params = [];
    let paramIdx = 1;

    if (status) {
      sql += ` AND status = $${paramIdx++}`;
      params.push(status);
    }
    if (brand) {
      sql += ` AND brand = $${paramIdx++}`;
      params.push(brand);
    }

    const { rows } = await query(sql, params);
    res.json({ count: parseInt(rows[0].count) });
  } catch (err) {
    logger.error('[Products] Count error:', err);
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
