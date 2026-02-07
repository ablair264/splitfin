import express from 'express';
import { query, getById, insert, update } from '../../config/database.js';
import { logger } from '../../utils/logger.js';

const router = express.Router();

// Lazy-loaded R2 + multer (only initialised when image endpoints are hit)
let _r2 = null;
let _upload = null;
let _s3Sdk = null;

const R2_BUCKET = process.env.R2_BUCKET_NAME || process.env.R2_BUCKET || 'dmbrands-cdn';
const R2_PUBLIC_URL = (process.env.R2_PUBLIC_URL || 'https://pub-b1c365d59f294b0fbc4c7362679bbaef.r2.dev').replace(/\/$/, '');

async function getR2Client() {
  if (!_r2) {
    const endpoint = process.env.R2_ENDPOINT
      || (process.env.CLOUDFLARE_ACCOUNT_ID && `https://${process.env.CLOUDFLARE_ACCOUNT_ID}.r2.cloudflarestorage.com`);

    if (!endpoint || !process.env.R2_ACCESS_KEY_ID || !process.env.R2_SECRET_ACCESS_KEY) {
      throw new Error('R2 not configured — need R2_ENDPOINT (or CLOUDFLARE_ACCOUNT_ID), R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY');
    }
    if (!_s3Sdk) _s3Sdk = await import('@aws-sdk/client-s3');
    _r2 = new _s3Sdk.S3Client({
      region: 'auto',
      endpoint: endpoint.replace(/\/$/, ''),
      credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY_ID,
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
      },
    });
  }
  return _r2;
}

async function getUploadMiddleware() {
  if (!_upload) {
    const multerMod = await import('multer');
    const multer = multerMod.default;
    _upload = multer({
      storage: multer.memoryStorage(),
      limits: { fileSize: 5 * 1024 * 1024 },
      fileFilter: (_req, file, cb) => {
        if (file.mimetype.startsWith('image/')) cb(null, true);
        else cb(new Error('Only image files are allowed'));
      },
    });
  }
  return _upload;
}

// Allowed sort columns for products
const PRODUCT_SORT_COLUMNS = {
  name: 'name',
  sku: 'sku',
  brand: 'brand',
  stock_on_hand: 'stock_on_hand',
  rate: 'rate',
  cost_price: 'cost_price',
  category_name: 'category_name',
};

// Helper: build common WHERE clause for product queries
function buildProductWhere(filters) {
  const { status, brand, search, stock_filter, price_min, price_max, category } = filters;
  const conditions = ['1=1'];
  const params = [];
  let idx = 1;

  if (status) {
    conditions.push(`status = $${idx++}`);
    params.push(status);
  }

  if (brand) {
    // Support comma-separated multi-brand
    const brands = brand.split(',').map(s => s.trim()).filter(Boolean);
    if (brands.length === 1) {
      conditions.push(`brand = $${idx++}`);
      params.push(brands[0]);
    } else if (brands.length > 1) {
      conditions.push(`brand = ANY($${idx++}::text[])`);
      params.push(brands);
    }
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

  if (price_min) {
    conditions.push(`rate >= $${idx++}`);
    params.push(parseFloat(price_min));
  }

  if (price_max) {
    conditions.push(`rate <= $${idx++}`);
    params.push(parseFloat(price_max));
  }

  if (category) {
    conditions.push(`category_name = $${idx++}`);
    params.push(category);
  }

  return { where: conditions.join(' AND '), params, nextIdx: idx };
}

// GET /api/v1/products
router.get('/', async (req, res) => {
  try {
    const { sort_by = 'name', sort_order = 'asc', limit = 50, offset = 0 } = req.query;
    const { where, params, nextIdx } = buildProductWhere(req.query);
    let idx = nextIdx;

    const col = PRODUCT_SORT_COLUMNS[sort_by] || 'name';
    const dir = sort_order === 'desc' ? 'DESC' : 'ASC';
    const lim = parseInt(limit);
    const off = parseInt(offset);

    const countSql = `SELECT COUNT(*) as total FROM products WHERE ${where}`;
    const dataSql = `SELECT * FROM products WHERE ${where} ORDER BY ${col} ${dir} NULLS LAST LIMIT $${idx++} OFFSET $${idx++}`;
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

// POST /api/v1/products/:id/image
router.post('/:id/image', async (req, res) => {
  try {
    // Lazy-load multer and run it as middleware
    const uploadMiddleware = await getUploadMiddleware();
    await new Promise((resolve, reject) => {
      uploadMiddleware.single('image')(req, res, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });

    const product = await getById('products', req.params.id);
    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }

    if (!req.file) {
      return res.status(400).json({ error: 'No image file provided' });
    }

    const r2 = await getR2Client();
    if (!_s3Sdk) _s3Sdk = await import('@aws-sdk/client-s3');

    // Build R2 key: products/{id}/{sanitised-sku}.{ext}
    const ext = req.file.originalname.split('.').pop()?.toLowerCase() || 'jpg';
    const safeName = product.sku.replace(/[^a-zA-Z0-9-_]/g, '_').toLowerCase();
    const key = `products/${product.id}/${safeName}.${ext}`;

    await r2.send(new _s3Sdk.PutObjectCommand({
      Bucket: R2_BUCKET,
      Key: key,
      Body: req.file.buffer,
      ContentType: req.file.mimetype,
    }));

    const imageUrl = `${R2_PUBLIC_URL}/${key}`;
    await update('products', product.id, { image_url: imageUrl });

    logger.info(`[Products] Image uploaded for ${product.sku}: ${imageUrl}`);
    res.json({ data: { image_url: imageUrl } });
  } catch (err) {
    logger.error('[Products] Image upload error:', err);
    if (err.message === 'Only image files are allowed') {
      return res.status(400).json({ error: err.message });
    }
    res.status(500).json({ error: 'Failed to upload image' });
  }
});

// DELETE /api/v1/products/:id/image
router.delete('/:id/image', async (req, res) => {
  try {
    const product = await getById('products', req.params.id);
    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }

    // Try to delete from R2 if it's our URL
    if (product.image_url && product.image_url.includes(R2_PUBLIC_URL)) {
      const key = product.image_url.replace(`${R2_PUBLIC_URL}/`, '');
      try {
        const r2 = await getR2Client();
        if (!_s3Sdk) _s3Sdk = await import('@aws-sdk/client-s3');
        await r2.send(new _s3Sdk.DeleteObjectCommand({ Bucket: R2_BUCKET, Key: key }));
      } catch (r2Err) {
        logger.warn('[Products] R2 delete failed (non-fatal):', r2Err.message);
      }
    }

    await update('products', product.id, { image_url: null });
    logger.info(`[Products] Image removed for ${product.sku}`);
    res.json({ data: { image_url: null } });
  } catch (err) {
    logger.error('[Products] Image delete error:', err);
    res.status(500).json({ error: 'Failed to remove image' });
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
