import express from 'express';
import { query } from '../../config/database.js';
import { logger } from '../../utils/logger.js';

const router = express.Router();

// ---------------------------------------------------------------------------
// Lazy-loaded R2 + multer (only initialised when image endpoints are hit)
// ---------------------------------------------------------------------------
let _r2 = null;
let _upload = null;
let _s3Sdk = null;

const R2_BUCKET = process.env.R2_BUCKET_NAME || process.env.R2_BUCKET || 'dmbrands-cdn';
const R2_PUBLIC_URL = (process.env.R2_PUBLIC_URL || 'https://pub-b1c365d59f294b0fbc4c7362679bbaef.r2.dev').replace(/\/$/, '');

async function getR2Client() {
  if (!_r2) {
    const endpoint = process.env.R2_ENDPOINT
      || (process.env.CLOUDFLARE_ACCOUNT_ID && `https://${process.env.CLOUDFLARE_ACCOUNT_ID}.r2.cloudflarestorage.com`);

    const accessKeyId = process.env.R2_ACCESS_KEY_ID || process.env.AWS_ACCESS_KEY_ID;
    const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY || process.env.AWS_SECRET_ACCESS_KEY;

    if (!endpoint || !accessKeyId || !secretAccessKey) {
      throw new Error('R2 not configured — need R2_ENDPOINT (or CLOUDFLARE_ACCOUNT_ID), R2_ACCESS_KEY_ID (or AWS_ACCESS_KEY_ID), R2_SECRET_ACCESS_KEY (or AWS_SECRET_ACCESS_KEY)');
    }
    if (!_s3Sdk) _s3Sdk = await import('@aws-sdk/client-s3');
    _r2 = new _s3Sdk.S3Client({
      region: 'auto',
      endpoint: endpoint.replace(/\/$/, ''),
      credentials: { accessKeyId, secretAccessKey },
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
      limits: { fileSize: 15 * 1024 * 1024 },
      fileFilter: (_req, file, cb) => {
        if (file.mimetype.startsWith('image/')) cb(null, true);
        else cb(new Error('Only image files are allowed'));
      },
    });
  }
  return _upload;
}

// ---------------------------------------------------------------------------
// Lazy-loaded sharp for image processing
// ---------------------------------------------------------------------------
let _sharp = null;

async function getSharp() {
  if (!_sharp) {
    const mod = await import('sharp');
    _sharp = mod.default;
  }
  return _sharp;
}

const MAX_WIDTH = 1200;
const WEBP_QUALITY = 80;

/**
 * Resize + convert to WebP. Returns { buffer, width, height, size, contentType, ext }.
 * If the image is already <= MAX_WIDTH, it still gets converted to WebP for consistency.
 */
async function processImage(inputBuffer) {
  const sharp = await getSharp();
  const processed = sharp(inputBuffer)
    .resize({ width: MAX_WIDTH, withoutEnlargement: true })
    .webp({ quality: WEBP_QUALITY });

  const buffer = await processed.toBuffer();
  const meta = await sharp(buffer).metadata();
  return {
    buffer,
    width: meta.width,
    height: meta.height,
    size: buffer.length,
    contentType: 'image/webp',
    ext: 'webp',
  };
}

// ---------------------------------------------------------------------------
// Allowed sort columns
// ---------------------------------------------------------------------------
const IMAGE_SORT_COLUMNS = {
  created_at: 'created_at',
  filename: 'filename',
  size_bytes: 'size_bytes',
  brand: 'brand',
};

// ===========================================================================
// 1. GET / — List images
// ===========================================================================
router.get('/', async (req, res) => {
  try {
    const {
      brand,
      search,
      sort_by = 'created_at',
      sort_order = 'desc',
      limit: rawLimit = '50',
      offset: rawOffset = '0',
    } = req.query;

    const limit = Math.min(Math.max(parseInt(rawLimit, 10) || 50, 1), 200);
    const offset = Math.max(parseInt(rawOffset, 10) || 0, 0);

    const conditions = [];
    const params = [];

    if (brand) {
      params.push(brand);
      conditions.push(`brand = $${params.length}`);
    }

    if (search) {
      params.push(`%${search}%`);
      conditions.push(`(filename ILIKE $${params.length} OR matched_sku ILIKE $${params.length})`);
    }

    const whereClause = conditions.length > 0
      ? `WHERE ${conditions.join(' AND ')}`
      : '';

    const sortColumn = IMAGE_SORT_COLUMNS[sort_by] || 'created_at';
    const sortDir = sort_order === 'asc' ? 'ASC' : 'DESC';

    // Count total
    const countResult = await query(
      `SELECT COUNT(*)::int AS total FROM product_images ${whereClause}`,
      params
    );
    const total = countResult.rows[0].total;

    // Fetch rows
    const dataParams = [...params, limit, offset];
    const dataResult = await query(
      `SELECT * FROM product_images ${whereClause}
       ORDER BY ${sortColumn} ${sortDir}
       LIMIT $${dataParams.length - 1} OFFSET $${dataParams.length}`,
      dataParams
    );

    res.json({
      data: dataResult.rows,
      meta: {
        total,
        limit,
        offset,
        has_more: offset + limit < total,
      },
    });
  } catch (err) {
    logger.error('[Images] List error:', err);
    res.status(500).json({ error: 'Failed to list images' });
  }
});

// ===========================================================================
// 2. GET /brands — Brand options
// ===========================================================================
router.get('/brands', async (_req, res) => {
  try {
    const result = await query(`
      SELECT brand, COUNT(*)::int AS image_count
      FROM product_images
      GROUP BY brand
      ORDER BY image_count DESC
    `);
    res.json({ data: result.rows });
  } catch (err) {
    logger.error('[Images] Brands error:', err);
    res.status(500).json({ error: 'Failed to fetch brands' });
  }
});

// ===========================================================================
// 2b. GET /sku-patterns — Brand SKU format patterns for frontend matching
// ===========================================================================
router.get('/sku-patterns', async (_req, res) => {
  try {
    const result = await query(
      'SELECT brand_name, pattern, description FROM brand_sku_patterns ORDER BY brand_name'
    );
    res.json({ data: result.rows });
  } catch (err) {
    logger.error('[Images] SKU patterns error:', err);
    res.status(500).json({ error: 'Failed to fetch SKU patterns' });
  }
});

// ===========================================================================
// 3. GET /stats — Summary statistics
// ===========================================================================
router.get('/stats', async (_req, res) => {
  try {
    const result = await query(`
      SELECT
        COUNT(*)::int AS total_images,
        COALESCE(SUM(size_bytes), 0)::bigint AS total_size_bytes,
        COUNT(DISTINCT brand)::int AS brand_count
      FROM product_images
    `);
    res.json({ data: result.rows[0] });
  } catch (err) {
    logger.error('[Images] Stats error:', err);
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
});

// ===========================================================================
// 3a. GET /by-product/:id — List images for a product
// ===========================================================================
router.get('/by-product/:id', async (req, res) => {
  try {
    const productId = Number(req.params.id);
    if (!Number.isFinite(productId)) {
      return res.status(400).json({ error: 'Invalid product id' });
    }

    const productResult = await query('SELECT id, sku FROM products WHERE id = $1 LIMIT 1', [productId]);
    if (productResult.rows.length === 0) {
      return res.status(404).json({ error: 'Product not found' });
    }
    const sku = productResult.rows[0].sku || null;

    const params = [productId, sku];
    const dataResult = await query(
      `SELECT * FROM product_images
       WHERE product_id = $1
          OR ($2::text IS NOT NULL AND TRIM(matched_sku) = TRIM($2::text))
       ORDER BY created_at DESC`,
      params
    );

    res.json({ data: dataResult.rows });
  } catch (err) {
    logger.error('[Images] by-product error:', err);
    res.status(500).json({ error: 'Failed to fetch product images' });
  }
});

// ===========================================================================
// 4. POST /upload — Single image upload
// ===========================================================================
router.post('/upload', async (req, res) => {
  try {
    const upload = await getUploadMiddleware();

    // Run multer as middleware manually
    await new Promise((resolve, reject) => {
      upload.single('image')(req, res, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });

    if (!req.file) {
      return res.status(400).json({ error: 'No image file provided' });
    }

    const { brand, matched_sku, sku_confidence, original_filename } = req.body;

    if (!brand) {
      return res.status(400).json({ error: 'Brand is required' });
    }

    // Resize + convert to WebP
    const processed = await processImage(req.file.buffer);

    // Build R2 key (always .webp after processing)
    const brandSlug = brand.toLowerCase().replace(/\s+/g, '-');
    const baseName = req.file.originalname.replace(/\.[^.]+$/, '');
    const key = `images/${brandSlug}/${baseName}.webp`;

    // Upload to R2
    const r2 = await getR2Client();
    if (!_s3Sdk) _s3Sdk = await import('@aws-sdk/client-s3');

    await r2.send(new _s3Sdk.PutObjectCommand({
      Bucket: R2_BUCKET,
      Key: key,
      Body: processed.buffer,
      ContentType: processed.contentType,
    }));

    const publicUrl = `${R2_PUBLIC_URL}/${key}`;

    // Look up product if matched_sku provided
    let productId = null;
    if (matched_sku) {
      const prodResult = await query('SELECT id FROM products WHERE sku = $1 LIMIT 1', [matched_sku]);
      if (prodResult.rows.length > 0) {
        productId = prodResult.rows[0].id;
      }
    }

    // AI analysis (non-fatal)
    let aiProductType = null;
    let aiColor = null;
    let aiConfidence = null;

    try {
      const apiKey = process.env.OPENAI_API_KEY;
      if (apiKey) {
        const base64 = processed.buffer.toString('base64');
        const aiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model: 'gpt-4o',
            messages: [{
              role: 'user',
              content: [
                {
                  type: 'text',
                  text: 'Analyze this product image. Output JSON only: {"productType": "...", "color": "...", "confidence": 0-1}. Be specific for productType. Report OBJECT color only, ignore backgrounds.',
                },
                {
                  type: 'image_url',
                  image_url: {
                    url: `data:image/webp;base64,${base64}`,
                    detail: 'low',
                  },
                },
              ],
            }],
            max_tokens: 300,
            temperature: 0.1,
          }),
        });

        if (aiResponse.ok) {
          const aiData = await aiResponse.json();
          const content = aiData.choices?.[0]?.message?.content || '';
          const jsonMatch = content.match(/\{[\s\S]*?\}/);
          if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0]);
            aiProductType = parsed.productType || null;
            aiColor = parsed.color || null;
            aiConfidence = typeof parsed.confidence === 'number' ? parsed.confidence : null;
          }
        }
      }
    } catch (aiErr) {
      logger.warn('[Images] AI analysis failed (non-fatal):', aiErr.message);
    }

    // INSERT into product_images
    const insertParams = [
      `${baseName}.webp`,                                 // filename
      publicUrl,                                          // url
      key,                                                // r2_key
      processed.contentType,                              // content_type
      processed.size,                                     // size_bytes
      brand,                                              // brand
      matched_sku || null,                                // matched_sku
      parseFloat(sku_confidence) || null,                 // sku_confidence
      productId,                                          // product_id
      processed.width,                                    // width
      processed.height,                                   // height
      aiProductType,                                      // ai_product_type
      aiColor,                                            // ai_color
      aiConfidence,                                       // ai_confidence
      original_filename || req.file.originalname,         // original_filename
    ];

    const insertResult = await query(
      `INSERT INTO product_images
        (filename, url, r2_key, content_type, size_bytes, brand,
         matched_sku, sku_confidence, product_id, width, height,
         ai_product_type, ai_color, ai_confidence, original_filename)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
       RETURNING *`,
      insertParams
    );

    const imageRow = insertResult.rows[0];

    // If product found and it has no image_url, set it
    if (productId) {
      try {
        const prodCheck = await query('SELECT image_url FROM products WHERE id = $1', [productId]);
        if (prodCheck.rows.length > 0 && !prodCheck.rows[0].image_url) {
          await query('UPDATE products SET image_url = $1, updated_at = NOW() WHERE id = $2', [publicUrl, productId]);
          logger.info(`[Images] Updated product ${productId} image_url to ${publicUrl}`);
        }
      } catch (prodErr) {
        logger.warn('[Images] Failed to update product image_url (non-fatal):', prodErr.message);
      }
    }

    // Normalise column name for frontend
    imageRow.url = imageRow.url || publicUrl;

    logger.info(`[Images] Uploaded: ${key} (brand=${brand}, sku=${matched_sku || 'none'})`);
    res.status(201).json({ data: imageRow });
  } catch (err) {
    logger.error('[Images] Upload error:', err);
    res.status(500).json({ error: 'Failed to upload image' });
  }
});

// ===========================================================================
// 5. POST /upload-batch — Multi-file upload
// ===========================================================================
router.post('/upload-batch', async (req, res) => {
  try {
    const upload = await getUploadMiddleware();

    // Run multer for multiple files
    await new Promise((resolve, reject) => {
      upload.array('images', 20)(req, res, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });

    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: 'No image files provided' });
    }

    const { brand } = req.body;
    if (!brand) {
      return res.status(400).json({ error: 'Brand is required' });
    }

    // Parse optional per-file metadata
    let metadataMap = {};
    if (req.body.metadata) {
      try {
        metadataMap = JSON.parse(req.body.metadata);
      } catch {
        logger.warn('[Images] Could not parse metadata JSON, ignoring');
      }
    }

    const r2 = await getR2Client();
    if (!_s3Sdk) _s3Sdk = await import('@aws-sdk/client-s3');

    const results = [];
    let successCount = 0;
    let errorCount = 0;

    for (const file of req.files) {
      try {
        const fileMeta = metadataMap[file.originalname] || {};

        // Resize + convert to WebP
        const processed = await processImage(file.buffer);

        // Build R2 key (always .webp after processing)
        const brandSlug = brand.toLowerCase().replace(/\s+/g, '-');
        const baseName = file.originalname.replace(/\.[^.]+$/, '');
        const key = `images/${brandSlug}/${baseName}.webp`;

        // Upload to R2
        await r2.send(new _s3Sdk.PutObjectCommand({
          Bucket: R2_BUCKET,
          Key: key,
          Body: processed.buffer,
          ContentType: processed.contentType,
        }));

        const publicUrl = `${R2_PUBLIC_URL}/${key}`;

        // Look up product if matched_sku provided
        let productId = null;
        const matchedSku = fileMeta.matched_sku || null;
        if (matchedSku) {
          const prodResult = await query('SELECT id FROM products WHERE sku = $1 LIMIT 1', [matchedSku]);
          if (prodResult.rows.length > 0) {
            productId = prodResult.rows[0].id;
          }
        }

        // AI analysis (non-fatal)
        let aiProductType = null;
        let aiColor = null;
        let aiConfidence = null;

        try {
          const apiKey = process.env.OPENAI_API_KEY;
          if (apiKey) {
            const base64 = processed.buffer.toString('base64');
            const aiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`,
              },
              body: JSON.stringify({
                model: 'gpt-4o',
                messages: [{
                  role: 'user',
                  content: [
                    {
                      type: 'text',
                      text: 'Analyze this product image. Output JSON only: {"productType": "...", "color": "...", "confidence": 0-1}. Be specific for productType. Report OBJECT color only, ignore backgrounds.',
                    },
                    {
                      type: 'image_url',
                      image_url: {
                        url: `data:image/webp;base64,${base64}`,
                        detail: 'low',
                      },
                    },
                  ],
                }],
                max_tokens: 300,
                temperature: 0.1,
              }),
            });

            if (aiResponse.ok) {
              const aiData = await aiResponse.json();
              const content = aiData.choices?.[0]?.message?.content || '';
              const jsonMatch = content.match(/\{[\s\S]*?\}/);
              if (jsonMatch) {
                const parsed = JSON.parse(jsonMatch[0]);
                aiProductType = parsed.productType || null;
                aiColor = parsed.color || null;
                aiConfidence = typeof parsed.confidence === 'number' ? parsed.confidence : null;
              }
            }
          }
        } catch (aiErr) {
          logger.warn(`[Images] AI analysis failed for ${file.originalname} (non-fatal):`, aiErr.message);
        }

        // INSERT into product_images
        const insertParams = [
          `${baseName}.webp`,
          publicUrl,
          key,
          processed.contentType,
          processed.size,
          brand,
          matchedSku,
          parseFloat(fileMeta.sku_confidence) || null,
          productId,
          processed.width,
          processed.height,
          aiProductType,
          aiColor,
          aiConfidence,
          fileMeta.original_filename || file.originalname,
        ];

        const insertResult = await query(
          `INSERT INTO product_images
            (filename, url, r2_key, content_type, size_bytes, brand,
             matched_sku, sku_confidence, product_id, width, height,
             ai_product_type, ai_color, ai_confidence, original_filename)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
           RETURNING *`,
          insertParams
        );

        const imageRow = insertResult.rows[0];

        // If product found and it has no image_url, set it
        if (productId) {
          try {
            const prodCheck = await query('SELECT image_url FROM products WHERE id = $1', [productId]);
            if (prodCheck.rows.length > 0 && !prodCheck.rows[0].image_url) {
              await query('UPDATE products SET image_url = $1, updated_at = NOW() WHERE id = $2', [publicUrl, productId]);
            }
          } catch (prodErr) {
            logger.warn('[Images] Failed to update product image_url (non-fatal):', prodErr.message);
          }
        }

        results.push({ success: true, data: imageRow });
        successCount++;
      } catch (fileErr) {
        logger.error(`[Images] Batch upload failed for ${file.originalname}:`, fileErr);
        results.push({ success: false, error: fileErr.message, filename: file.originalname });
        errorCount++;
      }
    }

    logger.info(`[Images] Batch upload complete: ${successCount} success, ${errorCount} errors`);
    res.status(201).json({
      results,
      summary: {
        total: req.files.length,
        success: successCount,
        errors: errorCount,
      },
    });
  } catch (err) {
    logger.error('[Images] Batch upload error:', err);
    res.status(500).json({ error: 'Failed to process batch upload' });
  }
});

// ===========================================================================
// 6. POST /bulk-delete — Bulk delete images
// ===========================================================================
router.post('/bulk-delete', async (req, res) => {
  try {
    const { ids } = req.body;

    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: 'ids array is required' });
    }

    let r2;
    try {
      r2 = await getR2Client();
      if (!_s3Sdk) _s3Sdk = await import('@aws-sdk/client-s3');
    } catch (r2Err) {
      logger.warn('[Images] R2 client init failed, will skip R2 deletes:', r2Err.message);
      r2 = null;
    }

    let deletedCount = 0;
    let errorCount = 0;

    for (const id of ids) {
      try {
        // Fetch image record
        const imgResult = await query('SELECT * FROM product_images WHERE id = $1', [id]);
        if (imgResult.rows.length === 0) {
          errorCount++;
          continue;
        }

        const image = imgResult.rows[0];

        // Delete from R2 (non-fatal)
        if (r2 && image.r2_key) {
          try {
            await r2.send(new _s3Sdk.DeleteObjectCommand({
              Bucket: R2_BUCKET,
              Key: image.r2_key,
            }));
          } catch (r2DelErr) {
            logger.warn(`[Images] R2 delete failed for ${image.r2_key} (non-fatal):`, r2DelErr.message);
          }
        }

        // If product's image_url matches, clear it
        if (image.product_id && image.url) {
          try {
            await query(
              `UPDATE products SET image_url = NULL, updated_at = NOW()
               WHERE id = $1 AND image_url = $2`,
              [image.product_id, image.url]
            );
          } catch (prodErr) {
            logger.warn('[Images] Failed to clear product image_url (non-fatal):', prodErr.message);
          }
        }

        // DELETE from product_images
        await query('DELETE FROM product_images WHERE id = $1', [id]);
        deletedCount++;
      } catch (delErr) {
        logger.error(`[Images] Bulk delete failed for id ${id}:`, delErr);
        errorCount++;
      }
    }

    logger.info(`[Images] Bulk delete: ${deletedCount} deleted, ${errorCount} errors`);
    res.json({ deleted: deletedCount, errors: errorCount });
  } catch (err) {
    logger.error('[Images] Bulk delete error:', err);
    res.status(500).json({ error: 'Failed to bulk delete images' });
  }
});

// ===========================================================================
// 7. PATCH /:id — Update image metadata
// ===========================================================================
router.patch('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { brand, matched_sku, product_id, ai_product_type, ai_color } = req.body;

    // Check image exists
    const existing = await query('SELECT * FROM product_images WHERE id = $1', [id]);
    if (existing.rows.length === 0) {
      return res.status(404).json({ error: 'Image not found' });
    }

    const sets = [];
    const params = [];

    if (brand !== undefined) {
      params.push(brand);
      sets.push(`brand = $${params.length}`);
    }
    if (matched_sku !== undefined) {
      params.push(matched_sku || null);
      sets.push(`matched_sku = $${params.length}`);
    }
    if (product_id !== undefined) {
      params.push(product_id || null);
      sets.push(`product_id = $${params.length}`);
    }
    if (ai_product_type !== undefined) {
      params.push(ai_product_type || null);
      sets.push(`ai_product_type = $${params.length}`);
    }
    if (ai_color !== undefined) {
      params.push(ai_color || null);
      sets.push(`ai_color = $${params.length}`);
    }

    if (sets.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    params.push(id);
    const result = await query(
      `UPDATE product_images SET ${sets.join(', ')} WHERE id = $${params.length} RETURNING *`,
      params
    );

    // If product_id changed and image has a URL, optionally update product image_url
    const updated = result.rows[0];
    if (product_id && updated.url) {
      try {
        const prodCheck = await query('SELECT image_url FROM products WHERE id = $1', [product_id]);
        if (prodCheck.rows.length > 0 && !prodCheck.rows[0].image_url) {
          await query('UPDATE products SET image_url = $1, updated_at = NOW() WHERE id = $2', [updated.url, product_id]);
        }
      } catch (prodErr) {
        logger.warn('[Images] Failed to update product image_url (non-fatal):', prodErr.message);
      }
    }

    logger.info(`[Images] Updated image ${id}: ${sets.join(', ')}`);
    res.json({ data: updated });
  } catch (err) {
    logger.error('[Images] Update error:', err);
    res.status(500).json({ error: 'Failed to update image' });
  }
});

// ===========================================================================
// 8. POST /refresh-sizes — Fetch file sizes from R2 for images with size_bytes = 0
// ===========================================================================
router.post('/refresh-sizes', async (_req, res) => {
  try {
    const r2 = await getR2Client();
    if (!_s3Sdk) _s3Sdk = await import('@aws-sdk/client-s3');

    // Get images missing sizes (batch of 500)
    const { rows } = await query(
      `SELECT id, r2_key FROM product_images WHERE size_bytes = 0 AND r2_key IS NOT NULL LIMIT 500`
    );

    if (rows.length === 0) {
      return res.json({ updated: 0, message: 'All images already have sizes' });
    }

    let updated = 0;
    let errors = 0;

    for (const row of rows) {
      try {
        const head = await r2.send(new _s3Sdk.HeadObjectCommand({
          Bucket: R2_BUCKET,
          Key: row.r2_key,
        }));

        if (head.ContentLength) {
          await query(
            'UPDATE product_images SET size_bytes = $1 WHERE id = $2',
            [head.ContentLength, row.id]
          );
          updated++;
        }
      } catch (headErr) {
        // Object might not exist in R2
        errors++;
      }
    }

    logger.info(`[Images] Refresh sizes: ${updated} updated, ${errors} errors out of ${rows.length}`);
    res.json({ updated, errors, total: rows.length });
  } catch (err) {
    logger.error('[Images] Refresh sizes error:', err);
    res.status(500).json({ error: 'Failed to refresh sizes' });
  }
});

// ===========================================================================
// 9. GET /:id — Single image
// ===========================================================================
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await query('SELECT * FROM product_images WHERE id = $1', [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Image not found' });
    }

    res.json({ data: result.rows[0] });
  } catch (err) {
    logger.error('[Images] Get by ID error:', err);
    res.status(500).json({ error: 'Failed to fetch image' });
  }
});

// ===========================================================================
// 8. DELETE /:id — Delete single image
// ===========================================================================
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    // Fetch image record
    const imgResult = await query('SELECT * FROM product_images WHERE id = $1', [id]);
    if (imgResult.rows.length === 0) {
      return res.status(404).json({ error: 'Image not found' });
    }

    const image = imgResult.rows[0];

    // Delete from R2 (non-fatal)
    try {
      const r2 = await getR2Client();
      if (!_s3Sdk) _s3Sdk = await import('@aws-sdk/client-s3');

      if (image.r2_key) {
        await r2.send(new _s3Sdk.DeleteObjectCommand({
          Bucket: R2_BUCKET,
          Key: image.r2_key,
        }));
      }
    } catch (r2Err) {
      logger.warn(`[Images] R2 delete failed for ${image.r2_key} (non-fatal):`, r2Err.message);
    }

    // If product's image_url matches, clear it
    if (image.product_id && image.url) {
      try {
        await query(
          `UPDATE products SET image_url = NULL, updated_at = NOW()
           WHERE id = $1 AND image_url = $2`,
          [image.product_id, image.url]
        );
      } catch (prodErr) {
        logger.warn('[Images] Failed to clear product image_url (non-fatal):', prodErr.message);
      }
    }

    // DELETE from product_images
    await query('DELETE FROM product_images WHERE id = $1', [id]);

    logger.info(`[Images] Deleted image ${id}: ${image.r2_key}`);
    res.json({ success: true });
  } catch (err) {
    logger.error('[Images] Delete error:', err);
    res.status(500).json({ error: 'Failed to delete image' });
  }
});

export { router as imagesRouter };
