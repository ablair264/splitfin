import express from 'express';
import { query, getById, insert, update, remove, withTransaction } from '../../config/database.js';
import { logger } from '../../utils/logger.js';

const router = express.Router();

// Lazy-loaded R2 + multer (reuse same pattern as products.js)
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
      throw new Error('R2 not configured');
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

// Pop Home brand whitelist
const POP_HOME_BRANDS = ['Relaxound', 'Remember', 'Ideas 4 Seasons', 'My Flame Lifestyle', 'ppd PAPERPRODUCTS DESIGN GmbH'];

// Sort whitelist
const WP_SORT_COLUMNS = {
  name: 'COALESCE(wp.display_name, p.name)',
  brand: 'p.brand',
  retail_price: 'wp.retail_price',
  category: 'wc.name',
  display_order: 'wp.display_order',
  created_at: 'wp.created_at',
  stock_on_hand: 'p.stock_on_hand',
};

// Build WHERE clause for website product queries
function buildWebsiteProductWhere(filters) {
  const { search, brand, category_id, badge, is_featured, is_active } = filters;
  const conditions = ['1=1'];
  const params = [];
  let idx = 1;

  if (search) {
    conditions.push(`(COALESCE(wp.display_name, p.name) ILIKE $${idx} OR wp.slug ILIKE $${idx} OR p.sku ILIKE $${idx})`);
    params.push(`%${search}%`);
    idx++;
  }

  if (brand) {
    const brands = brand.split(',').map(s => s.trim()).filter(Boolean);
    if (brands.length === 1) {
      conditions.push(`p.brand = $${idx++}`);
      params.push(brands[0]);
    } else if (brands.length > 1) {
      conditions.push(`p.brand = ANY($${idx++}::text[])`);
      params.push(brands);
    }
  }

  if (category_id) {
    conditions.push(`wp.category_id = $${idx++}`);
    params.push(parseInt(category_id));
  }

  if (badge) {
    conditions.push(`wp.badge = $${idx++}`);
    params.push(badge);
  }

  if (is_featured !== undefined && is_featured !== '') {
    conditions.push(`wp.is_featured = $${idx++}`);
    params.push(is_featured === 'true');
  }

  if (is_active !== undefined && is_active !== '') {
    conditions.push(`wp.is_active = $${idx++}`);
    params.push(is_active === 'true');
  }

  return { where: conditions.join(' AND '), params, nextIdx: idx };
}

// Base SELECT for list/get queries
const BASE_SELECT = `
  SELECT
    wp.*,
    p.name AS base_name, p.sku, p.brand, p.stock_on_hand, p.rate AS wholesale_price,
    p.image_url AS base_image_url, p.status AS base_status,
    p.ai_description, p.ai_short_description, p.ai_features, p.dimensions_formatted, p.materials,
    p.color_family, p.image_urls AS base_image_urls,
    wc.name AS category_name, wc.slug AS category_slug,
    (SELECT COALESCE(json_agg(
      json_build_object('id', wpi.id, 'image_url', wpi.image_url, 'alt_text', wpi.alt_text, 'display_order', wpi.display_order, 'is_primary', wpi.is_primary)
      ORDER BY wpi.display_order
    ), '[]'::json)
    FROM website_product_images wpi WHERE wpi.website_product_id = wp.id) AS images
  FROM website_products wp
  JOIN products p ON p.id = wp.product_id
  LEFT JOIN website_categories wc ON wc.id = wp.category_id
`;

// GET /api/v1/website-products
router.get('/', async (req, res) => {
  try {
    const { sort_by = 'display_order', sort_order = 'asc', limit = 50, offset = 0 } = req.query;
    const { where, params, nextIdx } = buildWebsiteProductWhere(req.query);
    let idx = nextIdx;

    const col = WP_SORT_COLUMNS[sort_by] || 'wp.display_order';
    const dir = sort_order === 'desc' ? 'DESC' : 'ASC';
    const lim = parseInt(limit);
    const off = parseInt(offset);

    const countSql = `
      SELECT COUNT(*) as total
      FROM website_products wp
      JOIN products p ON p.id = wp.product_id
      LEFT JOIN website_categories wc ON wc.id = wp.category_id
      WHERE ${where}
    `;
    const dataSql = `
      ${BASE_SELECT}
      WHERE ${where}
      ORDER BY ${col} ${dir} NULLS LAST, wp.id ASC
      LIMIT $${idx++} OFFSET $${idx++}
    `;
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
    logger.error('[WebsiteProducts] List error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/v1/website-products/count
router.get('/count', async (req, res) => {
  try {
    const { where, params } = buildWebsiteProductWhere(req.query);
    const sql = `
      SELECT COUNT(*) as count
      FROM website_products wp
      JOIN products p ON p.id = wp.product_id
      LEFT JOIN website_categories wc ON wc.id = wp.category_id
      WHERE ${where}
    `;
    const { rows } = await query(sql, params);
    res.json({ count: parseInt(rows[0].count) });
  } catch (err) {
    logger.error('[WebsiteProducts] Count error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/v1/website-products/categories
router.get('/categories', async (_req, res) => {
  try {
    const { rows } = await query(
      'SELECT * FROM website_categories ORDER BY display_order ASC'
    );
    res.json({ data: rows });
  } catch (err) {
    logger.error('[WebsiteProducts] Categories error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/v1/website-products/brands
router.get('/brands', async (_req, res) => {
  try {
    const { rows } = await query(`
      SELECT p.brand, COUNT(*) as count
      FROM website_products wp
      JOIN products p ON p.id = wp.product_id
      GROUP BY p.brand
      ORDER BY p.brand
    `);
    res.json({ data: rows });
  } catch (err) {
    logger.error('[WebsiteProducts] Brands error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/v1/website-products/available
// Products NOT yet on the website, for the "Add Product" picker
router.get('/available', async (req, res) => {
  try {
    const { search = '', brand, limit = 50, offset = 0 } = req.query;
    const conditions = [
      "p.status = 'active'",
      `p.brand = ANY($1::text[])`,
      'p.id NOT IN (SELECT product_id FROM website_products)',
      'p.stock_on_hand > 0',
    ];
    const params = [POP_HOME_BRANDS];
    let idx = 2;

    if (search) {
      conditions.push(`(p.name ILIKE $${idx} OR p.sku ILIKE $${idx})`);
      params.push(`%${search}%`);
      idx++;
    }

    if (brand) {
      const brands = brand.split(',').map(s => s.trim()).filter(Boolean);
      if (brands.length === 1) {
        conditions.push(`p.brand = $${idx++}`);
        params.push(brands[0]);
      } else if (brands.length > 1) {
        conditions.push(`p.brand = ANY($${idx++}::text[])`);
        params.push(brands);
      }
    }

    const lim = parseInt(limit);
    const off = parseInt(offset);

    const where = conditions.join(' AND ');
    const countSql = `SELECT COUNT(*) as total FROM products p WHERE ${where}`;
    const dataSql = `
      SELECT p.id, p.sku, p.name, p.brand, p.rate, p.stock_on_hand, p.image_url, p.image_urls,
             p.ai_description, p.ai_short_description, p.ai_features, p.dimensions_formatted, p.materials, p.color_family
      FROM products p
      WHERE ${where}
      ORDER BY p.brand, p.name
      LIMIT $${idx++} OFFSET $${idx++}
    `;
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
    logger.error('[WebsiteProducts] Available error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/v1/website-products/batch
router.post('/batch', async (req, res) => {
  try {
    const { product_ids, defaults = {} } = req.body;

    if (!Array.isArray(product_ids) || product_ids.length === 0) {
      return res.status(400).json({ error: 'product_ids array is required' });
    }
    if (product_ids.length > 200) {
      return res.status(400).json({ error: 'Maximum 200 products per batch' });
    }

    const markup = defaults.markup || 2.0;
    const categoryId = defaults.category_id || null;
    const badge = defaults.badge || null;
    const isActive = defaults.is_active !== false;

    const result = await withTransaction(async (client) => {
      // Fetch base product data for all requested IDs
      const { rows: baseProducts } = await client.query(
        `SELECT id, name, rate, ai_short_description, image_url, image_urls
         FROM products WHERE id = ANY($1::int[])`,
        [product_ids]
      );

      // Get existing product_ids already on website to skip
      const { rows: existingRows } = await client.query(
        `SELECT product_id FROM website_products WHERE product_id = ANY($1::int[])`,
        [product_ids]
      );
      const existingIds = new Set(existingRows.map(r => r.product_id));

      // Get existing slugs to avoid collisions
      const { rows: slugRows } = await client.query(
        `SELECT slug FROM website_products`
      );
      const existingSlugs = new Set(slugRows.map(r => r.slug));

      const created = [];
      let skipped = 0;

      for (const base of baseProducts) {
        if (existingIds.has(base.id)) {
          skipped++;
          continue;
        }

        // Generate unique slug
        let baseSlug = base.name
          .toLowerCase()
          .replace(/[^\w\s-]/g, '')
          .replace(/\s+/g, '-')
          .replace(/-+/g, '-')
          .trim();
        let slug = baseSlug;
        let counter = 2;
        while (existingSlugs.has(slug)) {
          slug = `${baseSlug}-${counter}`;
          counter++;
        }
        existingSlugs.add(slug);

        const retailPrice = base.rate ? parseFloat((base.rate * markup).toFixed(2)) : 0;

        const { rows } = await client.query(
          `INSERT INTO website_products (
            product_id, slug, display_name, short_description, retail_price,
            category_id, badge, is_active, display_order, placeholder_class, published_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 0, 'bg-cream-200', $9)
          RETURNING *`,
          [
            base.id, slug, base.name, base.ai_short_description || null, retailPrice,
            categoryId, badge, isActive, isActive ? new Date().toISOString() : null,
          ]
        );

        const wp = rows[0];

        // Import images from base product
        const imageUrls = [];
        if (base.image_url) imageUrls.push(base.image_url);
        if (base.image_urls && Array.isArray(base.image_urls)) {
          for (const url of base.image_urls) {
            if (url && !imageUrls.includes(url)) imageUrls.push(url);
          }
        }
        for (let i = 0; i < imageUrls.length; i++) {
          await client.query(
            `INSERT INTO website_product_images (website_product_id, image_url, display_order, is_primary)
             VALUES ($1, $2, $3, $4)`,
            [wp.id, imageUrls[i], i, i === 0]
          );
        }

        created.push(wp);
      }

      return { created, skipped };
    });

    logger.info(`[WebsiteProducts] Batch created ${result.created.length}, skipped ${result.skipped}`);

    // Auto-enhance newly created products if requested (fire-and-forget)
    if (defaults.enhance && result.created.length > 0) {
      const ids = result.created.map(wp => wp.id);
      const authToken = req.headers.authorization;
      // Fetch categories for AI
      const { rows: catRows } = await query('SELECT id, name FROM website_categories WHERE is_active = true ORDER BY name');
      const categoryNames = catRows.map(c => c.name);
      const categoryMap = Object.fromEntries(catRows.map(c => [c.name, c.id]));

      // Run enhance in background (don't block response)
      (async () => {
        for (const wpId of ids) {
          try {
            const { rows } = await query(`
              SELECT wp.id, wp.display_name, wp.short_description, wp.long_description, wp.category_id, wp.colours,
                     p.name AS base_name, p.brand, p.description AS base_description,
                     p.ai_description, p.ai_short_description, p.dimensions_formatted
              FROM website_products wp JOIN products p ON p.id = wp.product_id
              WHERE wp.id = $1
            `, [wpId]);
            if (rows.length === 0) continue;
            const wp = rows[0];
            const existingDesc = wp.ai_description || wp.ai_short_description || wp.base_description || '';
            const ai = await callEnhanceProduct({
              name: wp.base_name,
              brand: wp.brand,
              description: existingDesc,
              dimensions: wp.dimensions_formatted || '',
              categories: categoryNames,
            }, authToken);
            const updates = {};
            if (ai.display_name) updates.display_name = ai.display_name;
            if (ai.short_description) updates.short_description = ai.short_description;
            if (ai.long_description) updates.long_description = ai.long_description;
            if (ai.colour) updates.colours = JSON.stringify([{ name: ai.colour, hex: ai.colour_hex || '#000000' }]);
            if (ai.category && categoryMap[ai.category]) updates.category_id = categoryMap[ai.category];
            if (Object.keys(updates).length > 0) {
              const setClauses = [];
              const vals = [];
              let idx = 1;
              for (const [key, val] of Object.entries(updates)) {
                setClauses.push(`${key} = $${idx++}`);
                vals.push(val);
              }
              vals.push(wpId);
              await query(`UPDATE website_products SET ${setClauses.join(', ')}, updated_at = NOW() WHERE id = $${idx}`, vals);
            }
            if (ai.tags && ai.tags.length > 0) {
              for (const tagName of ai.tags) {
                const slug = tagName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
                const { rows: tagRows } = await query(
                  `INSERT INTO website_tags (name, slug) VALUES ($1, $2) ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name RETURNING id`,
                  [tagName, slug]
                );
                await query(`INSERT INTO website_product_tags (website_product_id, tag_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`, [wpId, tagRows[0].id]);
              }
            }
          } catch (err) {
            logger.warn(`[WebsiteProducts] Auto-enhance failed for wp ${wpId}: ${err.message}`);
          }
        }
        logger.info(`[WebsiteProducts] Auto-enhance completed for ${ids.length} products`);
      })();
    }

    res.status(201).json({
      created: result.created.length,
      skipped: result.skipped,
      data: result.created,
    });
  } catch (err) {
    logger.error('[WebsiteProducts] Batch create error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── Tags ────────────────────────────────────────────────────

// GET /api/v1/website-products/tags — list all tags with product counts
router.get('/tags', async (_req, res) => {
  try {
    const { rows } = await query(`
      SELECT t.*, COUNT(pt.website_product_id)::int AS product_count
      FROM website_tags t
      LEFT JOIN website_product_tags pt ON pt.tag_id = t.id
      GROUP BY t.id
      ORDER BY t.name
    `);
    res.json({ data: rows });
  } catch (err) {
    logger.error('[WebsiteProducts] Tags list error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/v1/website-products/tags — create a tag
router.post('/tags', async (req, res) => {
  try {
    const { name } = req.body;
    if (!name) return res.status(400).json({ error: 'name is required' });
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
    const result = await insert('website_tags', { name, slug });
    res.status(201).json({ data: result });
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Tag already exists' });
    logger.error('[WebsiteProducts] Tag create error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── Batch Enhance ───────────────────────────────────────────

// Helper: call the AI enhance-product endpoint internally
async function callEnhanceProduct({ name, brand, description, dimensions, categories }, token) {
  const port = process.env.PORT || 3001;
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = token;
  const resp = await fetch(`http://localhost:${port}/api/ai/enhance-product`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ name, brand, description, dimensions, categories }),
  });
  if (!resp.ok) {
    const t = await resp.text();
    throw new Error(`AI enhance failed: ${t}`);
  }
  return resp.json();
}

// POST /api/v1/website-products/batch-enhance
router.post('/batch-enhance', async (req, res) => {
  try {
    const { website_product_ids, options = {} } = req.body;

    if (!Array.isArray(website_product_ids) || website_product_ids.length === 0) {
      return res.status(400).json({ error: 'website_product_ids array is required' });
    }
    if (website_product_ids.length > 50) {
      return res.status(400).json({ error: 'Maximum 50 products per batch enhance' });
    }

    const overwriteNames = options.overwrite_names !== false;
    const overwriteDescriptions = options.overwrite_descriptions !== false;
    const assignCategories = options.assign_categories !== false;
    const assignTags = options.assign_tags !== false;

    // Fetch website categories for AI to pick from
    const { rows: catRows } = await query('SELECT id, name FROM website_categories WHERE is_active = true ORDER BY name');
    const categoryNames = catRows.map(c => c.name);
    const categoryMap = Object.fromEntries(catRows.map(c => [c.name, c.id]));

    // Fetch all website products with base product data
    const { rows: wpRows } = await query(`
      SELECT wp.id, wp.display_name, wp.short_description, wp.long_description, wp.category_id, wp.colours,
             p.name AS base_name, p.brand, p.description AS base_description,
             p.ai_description, p.ai_short_description, p.dimensions_formatted
      FROM website_products wp
      JOIN products p ON p.id = wp.product_id
      WHERE wp.id = ANY($1::int[])
    `, [website_product_ids]);

    const authToken = req.headers.authorization;
    const results = [];

    for (const wp of wpRows) {
      try {
        const existingDesc = wp.ai_description || wp.ai_short_description || wp.base_description || '';

        const ai = await callEnhanceProduct({
          name: wp.base_name,
          brand: wp.brand,
          description: (!overwriteDescriptions && wp.short_description) ? wp.short_description : existingDesc,
          dimensions: wp.dimensions_formatted || '',
          categories: categoryNames,
        }, authToken);

        // Build update payload
        const updates = {};

        if (overwriteNames || !wp.display_name || wp.display_name === wp.base_name) {
          updates.display_name = ai.display_name;
        }

        if (overwriteDescriptions || !wp.short_description) {
          updates.short_description = ai.short_description;
        }
        if (overwriteDescriptions || !wp.long_description) {
          updates.long_description = ai.long_description;
        }

        // Colours
        if (ai.colour) {
          updates.colours = JSON.stringify([{ name: ai.colour, hex: ai.colour_hex || '#000000' }]);
        }

        // Category
        if (assignCategories && ai.category && categoryMap[ai.category]) {
          if (!wp.category_id || overwriteNames) {
            updates.category_id = categoryMap[ai.category];
          }
        }

        // Apply updates
        if (Object.keys(updates).length > 0) {
          const setClauses = [];
          const vals = [];
          let idx = 1;
          for (const [key, val] of Object.entries(updates)) {
            setClauses.push(`${key} = $${idx++}`);
            vals.push(val);
          }
          vals.push(wp.id);
          await query(
            `UPDATE website_products SET ${setClauses.join(', ')}, updated_at = NOW() WHERE id = $${idx}`,
            vals
          );
        }

        // Tags
        let assignedTags = [];
        if (assignTags && ai.tags && ai.tags.length > 0) {
          for (const tagName of ai.tags) {
            const slug = tagName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
            // Upsert tag
            const { rows: tagRows } = await query(
              `INSERT INTO website_tags (name, slug) VALUES ($1, $2)
               ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name
               RETURNING id, name, slug`,
              [tagName, slug]
            );
            const tagId = tagRows[0].id;
            // Link to product (ignore if already linked)
            await query(
              `INSERT INTO website_product_tags (website_product_id, tag_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
              [wp.id, tagId]
            );
            assignedTags.push(tagRows[0]);
          }
        }

        results.push({
          id: wp.id,
          status: 'done',
          original_name: wp.base_name,
          display_name: updates.display_name || wp.display_name,
          colour: ai.colour || null,
          category: ai.category || null,
          tags: assignedTags.map(t => t.name),
        });
      } catch (err) {
        results.push({ id: wp.id, status: 'error', original_name: wp.base_name, error: err.message });
      }
    }

    const success = results.filter(r => r.status === 'done').length;
    const errors = results.filter(r => r.status === 'error').length;
    logger.info(`[WebsiteProducts] Batch enhance: ${success} done, ${errors} errors`);
    res.json({ results, summary: { total: results.length, success, errors } });
  } catch (err) {
    logger.error('[WebsiteProducts] Batch enhance error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/v1/website-products/:id/tags
router.get('/:id/tags', async (req, res) => {
  try {
    const { rows } = await query(`
      SELECT t.* FROM website_tags t
      JOIN website_product_tags pt ON pt.tag_id = t.id
      WHERE pt.website_product_id = $1
      ORDER BY t.name
    `, [req.params.id]);
    res.json({ data: rows });
  } catch (err) {
    logger.error('[WebsiteProducts] Get product tags error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /api/v1/website-products/:id/tags — replace all tags for a product
router.put('/:id/tags', async (req, res) => {
  try {
    const { tag_ids } = req.body;
    if (!Array.isArray(tag_ids)) return res.status(400).json({ error: 'tag_ids array is required' });

    await withTransaction(async (client) => {
      await client.query('DELETE FROM website_product_tags WHERE website_product_id = $1', [req.params.id]);
      for (const tagId of tag_ids) {
        await client.query(
          'INSERT INTO website_product_tags (website_product_id, tag_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
          [req.params.id, tagId]
        );
      }
    });

    // Return updated tags
    const { rows } = await query(`
      SELECT t.* FROM website_tags t
      JOIN website_product_tags pt ON pt.tag_id = t.id
      WHERE pt.website_product_id = $1
      ORDER BY t.name
    `, [req.params.id]);
    res.json({ data: rows });
  } catch (err) {
    logger.error('[WebsiteProducts] Set product tags error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/v1/website-products/:id
router.get('/:id', async (req, res) => {
  try {
    const { rows } = await query(
      `${BASE_SELECT} WHERE wp.id = $1`,
      [req.params.id]
    );
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Website product not found' });
    }
    res.json({ data: rows[0] });
  } catch (err) {
    logger.error('[WebsiteProducts] Get error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/v1/website-products
router.post('/', async (req, res) => {
  try {
    const {
      product_id, slug, display_name, short_description, long_description,
      retail_price, compare_at_price, category_id, badge, is_featured,
      featured_span, colours, features, specs, meta_title, meta_description,
      is_active, display_order, placeholder_class, import_images,
    } = req.body;

    if (!product_id || !slug || !retail_price) {
      return res.status(400).json({ error: 'product_id, slug, and retail_price are required' });
    }

    const result = await withTransaction(async (client) => {
      // Insert website product
      const wpData = {
        product_id,
        slug: slug.toLowerCase().replace(/[^a-z0-9-]/g, '-'),
        display_name: display_name || null,
        short_description: short_description || null,
        long_description: long_description || null,
        retail_price,
        compare_at_price: compare_at_price || null,
        category_id: category_id || null,
        badge: badge || null,
        is_featured: is_featured || false,
        featured_span: featured_span || null,
        colours: JSON.stringify(colours || []),
        features: JSON.stringify(features || []),
        specs: JSON.stringify(specs || []),
        meta_title: meta_title || null,
        meta_description: meta_description || null,
        is_active: is_active !== false,
        display_order: display_order || 0,
        placeholder_class: placeholder_class || 'bg-cream-200',
        published_at: is_active !== false ? new Date().toISOString() : null,
      };

      const cols = Object.keys(wpData);
      const vals = Object.values(wpData);
      const placeholders = cols.map((_, i) => `$${i + 1}`).join(', ');
      const { rows } = await client.query(
        `INSERT INTO website_products (${cols.join(', ')}) VALUES (${placeholders}) RETURNING *`,
        vals
      );
      const wp = rows[0];

      // Optionally import images from the base product
      if (import_images) {
        const baseProduct = await client.query('SELECT image_url, image_urls FROM products WHERE id = $1', [product_id]);
        if (baseProduct.rows[0]) {
          const base = baseProduct.rows[0];
          const imageUrls = [];
          if (base.image_url) imageUrls.push(base.image_url);
          if (base.image_urls && Array.isArray(base.image_urls)) {
            for (const url of base.image_urls) {
              if (url && !imageUrls.includes(url)) imageUrls.push(url);
            }
          }
          for (let i = 0; i < imageUrls.length; i++) {
            await client.query(
              `INSERT INTO website_product_images (website_product_id, image_url, display_order, is_primary)
               VALUES ($1, $2, $3, $4)`,
              [wp.id, imageUrls[i], i, i === 0]
            );
          }
        }
      }

      return wp;
    });

    // Fetch full joined record
    const { rows } = await query(`${BASE_SELECT} WHERE wp.id = $1`, [result.id]);
    res.status(201).json({ data: rows[0] });
  } catch (err) {
    if (err.code === '23505') {
      // Unique constraint violation
      const detail = err.detail || '';
      if (detail.includes('product_id')) {
        return res.status(409).json({ error: 'This product is already on the website' });
      }
      if (detail.includes('slug')) {
        return res.status(409).json({ error: 'This slug is already in use' });
      }
    }
    logger.error('[WebsiteProducts] Create error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /api/v1/website-products/:id
router.put('/:id', async (req, res) => {
  try {
    const id = req.params.id;
    const existing = await getById('website_products', id);
    if (!existing) {
      return res.status(404).json({ error: 'Website product not found' });
    }

    // Whitelist updatable fields
    const allowed = [
      'slug', 'display_name', 'short_description', 'long_description',
      'retail_price', 'compare_at_price', 'category_id', 'badge',
      'is_featured', 'featured_span', 'colours', 'features', 'specs',
      'meta_title', 'meta_description', 'is_active', 'display_order', 'placeholder_class',
    ];

    const updates = {};
    for (const key of allowed) {
      if (req.body[key] !== undefined) {
        if (['colours', 'features', 'specs'].includes(key)) {
          updates[key] = JSON.stringify(req.body[key]);
        } else {
          updates[key] = req.body[key];
        }
      }
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: 'No valid fields to update' });
    }

    await update('website_products', id, updates);

    // Return full joined record
    const { rows } = await query(`${BASE_SELECT} WHERE wp.id = $1`, [id]);
    res.json({ data: rows[0] });
  } catch (err) {
    logger.error('[WebsiteProducts] Update error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/v1/website-products/:id
router.delete('/:id', async (req, res) => {
  try {
    const existing = await getById('website_products', req.params.id);
    if (!existing) {
      return res.status(404).json({ error: 'Website product not found' });
    }

    // Images are CASCADE deleted. Try to clean up R2 files.
    try {
      const { rows: images } = await query(
        'SELECT image_url FROM website_product_images WHERE website_product_id = $1',
        [req.params.id]
      );
      if (images.length > 0) {
        const r2 = await getR2Client();
        if (!_s3Sdk) _s3Sdk = await import('@aws-sdk/client-s3');
        for (const img of images) {
          if (img.image_url && img.image_url.includes(R2_PUBLIC_URL)) {
            const key = img.image_url.replace(`${R2_PUBLIC_URL}/`, '');
            await r2.send(new _s3Sdk.DeleteObjectCommand({ Bucket: R2_BUCKET, Key: key })).catch(() => {});
          }
        }
      }
    } catch (r2Err) {
      logger.warn('[WebsiteProducts] R2 cleanup failed (non-fatal):', r2Err.message);
    }

    await remove('website_products', req.params.id);
    res.json({ success: true });
  } catch (err) {
    logger.error('[WebsiteProducts] Delete error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/v1/website-products/:id/images
router.post('/:id/images', async (req, res) => {
  try {
    const uploadMiddleware = await getUploadMiddleware();
    await new Promise((resolve, reject) => {
      uploadMiddleware.single('image')(req, res, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });

    const wp = await getById('website_products', req.params.id);
    if (!wp) {
      return res.status(404).json({ error: 'Website product not found' });
    }

    if (!req.file) {
      return res.status(400).json({ error: 'No image file provided' });
    }

    const r2 = await getR2Client();
    if (!_s3Sdk) _s3Sdk = await import('@aws-sdk/client-s3');

    const ext = req.file.originalname.split('.').pop()?.toLowerCase() || 'jpg';
    const safeName = wp.slug.replace(/[^a-zA-Z0-9-_]/g, '_').toLowerCase();
    const timestamp = Date.now();
    const key = `website-products/${wp.id}/${timestamp}-${safeName}.${ext}`;

    await r2.send(new _s3Sdk.PutObjectCommand({
      Bucket: R2_BUCKET,
      Key: key,
      Body: req.file.buffer,
      ContentType: req.file.mimetype,
    }));

    const imageUrl = `${R2_PUBLIC_URL}/${key}`;

    // Get current max display_order
    const { rows: maxRows } = await query(
      'SELECT COALESCE(MAX(display_order), -1) as max_order FROM website_product_images WHERE website_product_id = $1',
      [wp.id]
    );
    const nextOrder = parseInt(maxRows[0].max_order) + 1;

    // Check if this is the first image
    const { rows: countRows } = await query(
      'SELECT COUNT(*) as count FROM website_product_images WHERE website_product_id = $1',
      [wp.id]
    );
    const isPrimary = parseInt(countRows[0].count) === 0;

    const image = await insert('website_product_images', {
      website_product_id: wp.id,
      image_url: imageUrl,
      alt_text: req.body?.alt_text || null,
      display_order: nextOrder,
      is_primary: isPrimary,
    });

    logger.info(`[WebsiteProducts] Image uploaded for ${wp.slug}: ${imageUrl}`);
    res.status(201).json({ data: image });
  } catch (err) {
    logger.error('[WebsiteProducts] Image upload error:', err);
    if (err.message === 'Only image files are allowed') {
      return res.status(400).json({ error: err.message });
    }
    res.status(500).json({ error: 'Failed to upload image' });
  }
});

// DELETE /api/v1/website-products/:id/images/:imageId
router.delete('/:id/images/:imageId', async (req, res) => {
  try {
    const image = await getById('website_product_images', req.params.imageId);
    if (!image || image.website_product_id !== parseInt(req.params.id)) {
      return res.status(404).json({ error: 'Image not found' });
    }

    // Delete from R2
    if (image.image_url && image.image_url.includes(R2_PUBLIC_URL)) {
      try {
        const r2 = await getR2Client();
        if (!_s3Sdk) _s3Sdk = await import('@aws-sdk/client-s3');
        const key = image.image_url.replace(`${R2_PUBLIC_URL}/`, '');
        await r2.send(new _s3Sdk.DeleteObjectCommand({ Bucket: R2_BUCKET, Key: key }));
      } catch (r2Err) {
        logger.warn('[WebsiteProducts] R2 delete failed (non-fatal):', r2Err.message);
      }
    }

    await remove('website_product_images', req.params.imageId);
    logger.info(`[WebsiteProducts] Image deleted: ${image.image_url}`);
    res.json({ success: true });
  } catch (err) {
    logger.error('[WebsiteProducts] Image delete error:', err);
    res.status(500).json({ error: 'Failed to delete image' });
  }
});

// PUT /api/v1/website-products/:id/images/reorder
router.put('/:id/images/reorder', async (req, res) => {
  try {
    const { order } = req.body; // [{id, display_order}]
    if (!Array.isArray(order)) {
      return res.status(400).json({ error: 'order must be an array of {id, display_order}' });
    }

    await withTransaction(async (client) => {
      for (const item of order) {
        await client.query(
          'UPDATE website_product_images SET display_order = $1 WHERE id = $2 AND website_product_id = $3',
          [item.display_order, item.id, req.params.id]
        );
      }
    });

    res.json({ success: true });
  } catch (err) {
    logger.error('[WebsiteProducts] Reorder error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export { router as websiteProductsRouter };
