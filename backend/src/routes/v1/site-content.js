import express from 'express';
import { query, getById, insert, update } from '../../config/database.js';
import { logger } from '../../utils/logger.js';

const router = express.Router();

// Lazy-loaded R2 + multer + sharp
let _r2 = null;
let _upload = null;
let _s3Sdk = null;
let _sharp = null;

const R2_BUCKET = process.env.R2_BUCKET_NAME || process.env.R2_BUCKET || 'dmbrands-cdn';
const R2_PUBLIC_URL = (process.env.R2_PUBLIC_URL || 'https://pub-b1c365d59f294b0fbc4c7362679bbaef.r2.dev').replace(/\/$/, '');

const WEBP_QUALITY = 80;

async function getR2Client() {
  if (!_r2) {
    const endpoint = process.env.R2_ENDPOINT
      || (process.env.CLOUDFLARE_ACCOUNT_ID && `https://${process.env.CLOUDFLARE_ACCOUNT_ID}.r2.cloudflarestorage.com`);
    const accessKeyId = process.env.R2_ACCESS_KEY_ID || process.env.AWS_ACCESS_KEY_ID;
    const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY || process.env.AWS_SECRET_ACCESS_KEY;
    if (!endpoint || !accessKeyId || !secretAccessKey) throw new Error('R2 not configured');
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
      limits: { fileSize: 10 * 1024 * 1024 },
      fileFilter: (_req, file, cb) => {
        if (file.mimetype.startsWith('image/')) cb(null, true);
        else cb(new Error('Only image files are allowed'));
      },
    });
  }
  return _upload;
}

async function getSharp() {
  if (!_sharp) {
    const mod = await import('sharp');
    _sharp = mod.default;
  }
  return _sharp;
}

async function processImage(inputBuffer, maxWidth = 1200) {
  const sharp = await getSharp();
  const processed = sharp(inputBuffer)
    .resize({ width: maxWidth, withoutEnlargement: true })
    .webp({ quality: WEBP_QUALITY });
  const buffer = await processed.toBuffer();
  const meta = await sharp(buffer).metadata();
  return { buffer, width: meta.width, height: meta.height, size: buffer.length, contentType: 'image/webp', ext: 'webp' };
}

async function uploadToR2(key, buffer, contentType) {
  const r2 = await getR2Client();
  if (!_s3Sdk) _s3Sdk = await import('@aws-sdk/client-s3');
  await r2.send(new _s3Sdk.PutObjectCommand({
    Bucket: R2_BUCKET,
    Key: key,
    Body: buffer,
    ContentType: contentType,
  }));
  return `${R2_PUBLIC_URL}/${key}`;
}

async function deleteFromR2(url) {
  if (!url || !url.startsWith(R2_PUBLIC_URL)) return;
  const key = url.replace(`${R2_PUBLIC_URL}/`, '');
  try {
    const r2 = await getR2Client();
    if (!_s3Sdk) _s3Sdk = await import('@aws-sdk/client-s3');
    await r2.send(new _s3Sdk.DeleteObjectCommand({ Bucket: R2_BUCKET, Key: key }));
  } catch (err) {
    logger.warn(`[SiteContent] R2 delete failed for ${key}:`, err.message);
  }
}

// ── GET / ─────────────────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const { section } = req.query;
    let sql = 'SELECT * FROM site_sections';
    const params = [];
    if (section) {
      sql += ' WHERE section = $1';
      params.push(section);
    }
    sql += ' ORDER BY section, display_order ASC';
    const { rows } = await query(sql, params);
    res.json({ data: rows, count: rows.length });
  } catch (err) {
    logger.error('[SiteContent] List error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── GET /:id ──────────────────────────────────────────────────
router.get('/:id', async (req, res) => {
  try {
    const row = await getById('site_sections', req.params.id);
    if (!row) return res.status(404).json({ error: 'Section item not found' });
    res.json({ data: row });
  } catch (err) {
    logger.error('[SiteContent] Get error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── POST / ────────────────────────────────────────────────────
router.post('/', async (req, res) => {
  try {
    const { section, slot_key, ...fields } = req.body;
    if (!section || !slot_key) return res.status(400).json({ error: 'section and slot_key are required' });

    const data = { section, slot_key, ...fields };
    const result = await insert('site_sections', data);
    res.status(201).json({ data: result });
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Duplicate section/slot_key combination' });
    logger.error('[SiteContent] Create error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── PUT /:id ──────────────────────────────────────────────────
router.put('/:id', async (req, res) => {
  try {
    const existing = await getById('site_sections', req.params.id);
    if (!existing) return res.status(404).json({ error: 'Section item not found' });

    const allowed = [
      'title', 'subtitle', 'cta_label', 'cta_link',
      'secondary_cta_label', 'secondary_cta_link',
      'video_url', 'image_alt', 'placeholder_gradient',
      'overlay_position', 'text_colour', 'display_order', 'is_active',
    ];
    const updates = {};
    for (const key of allowed) {
      if (req.body[key] !== undefined) updates[key] = req.body[key];
    }
    updates.updated_at = new Date().toISOString();

    const result = await update('site_sections', req.params.id, updates);
    res.json({ data: result });
  } catch (err) {
    logger.error('[SiteContent] Update error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── DELETE /:id ───────────────────────────────────────────────
router.delete('/:id', async (req, res) => {
  try {
    const existing = await getById('site_sections', req.params.id);
    if (!existing) return res.status(404).json({ error: 'Section item not found' });

    // Clean up R2 images
    await deleteFromR2(existing.image_url);
    await deleteFromR2(existing.poster_url);

    await query('DELETE FROM site_sections WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    logger.error('[SiteContent] Delete error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── POST /:id/image ──────────────────────────────────────────
router.post('/:id/image', async (req, res) => {
  try {
    const uploadMiddleware = await getUploadMiddleware();
    await new Promise((resolve, reject) => {
      uploadMiddleware.single('image')(req, res, (err) => {
        if (err) reject(err); else resolve();
      });
    });

    const section = await getById('site_sections', req.params.id);
    if (!section) return res.status(404).json({ error: 'Section item not found' });
    if (!req.file) return res.status(400).json({ error: 'No image file provided' });

    const maxWidth = section.section === 'hero_slides' ? 1920 : 1200;
    const processed = await processImage(req.file.buffer, maxWidth);

    const timestamp = Date.now();
    const key = `site-content/${section.section}/${section.slot_key}/${timestamp}.webp`;
    const imageUrl = await uploadToR2(key, processed.buffer, processed.contentType);

    // Delete old image from R2 if it was an R2 URL
    await deleteFromR2(section.image_url);

    await update('site_sections', section.id, { image_url: imageUrl, updated_at: new Date().toISOString() });

    logger.info(`[SiteContent] Image uploaded: ${key} (${processed.width}x${processed.height})`);
    res.json({ image_url: imageUrl, width: processed.width, height: processed.height });
  } catch (err) {
    logger.error('[SiteContent] Image upload error:', err);
    if (err.message === 'Only image files are allowed') return res.status(400).json({ error: err.message });
    res.status(500).json({ error: 'Failed to upload image' });
  }
});

// ── POST /:id/poster ─────────────────────────────────────────
router.post('/:id/poster', async (req, res) => {
  try {
    const uploadMiddleware = await getUploadMiddleware();
    await new Promise((resolve, reject) => {
      uploadMiddleware.single('image')(req, res, (err) => {
        if (err) reject(err); else resolve();
      });
    });

    const section = await getById('site_sections', req.params.id);
    if (!section) return res.status(404).json({ error: 'Section item not found' });
    if (!req.file) return res.status(400).json({ error: 'No image file provided' });

    const processed = await processImage(req.file.buffer, 1200);
    const timestamp = Date.now();
    const key = `site-content/${section.section}/${section.slot_key}/${timestamp}-poster.webp`;
    const posterUrl = await uploadToR2(key, processed.buffer, processed.contentType);

    await deleteFromR2(section.poster_url);
    await update('site_sections', section.id, { poster_url: posterUrl, updated_at: new Date().toISOString() });

    logger.info(`[SiteContent] Poster uploaded: ${key}`);
    res.json({ poster_url: posterUrl });
  } catch (err) {
    logger.error('[SiteContent] Poster upload error:', err);
    if (err.message === 'Only image files are allowed') return res.status(400).json({ error: err.message });
    res.status(500).json({ error: 'Failed to upload poster' });
  }
});

// ── POST /categories/:id/hero-image ──────────────────────────
router.post('/categories/:id/hero-image', async (req, res) => {
  try {
    const uploadMiddleware = await getUploadMiddleware();
    await new Promise((resolve, reject) => {
      uploadMiddleware.single('image')(req, res, (err) => {
        if (err) reject(err); else resolve();
      });
    });

    const category = await getById('website_categories', req.params.id);
    if (!category) return res.status(404).json({ error: 'Category not found' });
    if (!req.file) return res.status(400).json({ error: 'No image file provided' });

    const processed = await processImage(req.file.buffer, 1920);
    const timestamp = Date.now();
    const key = `categories/${category.id}/${timestamp}-hero.webp`;
    const imageUrl = await uploadToR2(key, processed.buffer, processed.contentType);

    await deleteFromR2(category.hero_image_url);
    await update('website_categories', category.id, { hero_image_url: imageUrl, updated_at: new Date().toISOString() });

    logger.info(`[SiteContent] Category hero uploaded: ${key} for ${category.name}`);
    res.json({ hero_image_url: imageUrl });
  } catch (err) {
    logger.error('[SiteContent] Category hero upload error:', err);
    if (err.message === 'Only image files are allowed') return res.status(400).json({ error: err.message });
    res.status(500).json({ error: 'Failed to upload hero image' });
  }
});

// ── GET /categories ──────────────────────────────────────────
// List categories with hero image info (for the admin UI)
router.get('/categories', async (req, res) => {
  try {
    const { rows } = await query('SELECT id, name, slug, hero_image_url, hero_placeholder FROM website_categories WHERE is_active = true ORDER BY display_order ASC');
    res.json({ data: rows });
  } catch (err) {
    logger.error('[SiteContent] Categories list error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── PUT /categories/:id ──────────────────────────────────────
// Update category hero fields (placeholder class, etc.)
router.put('/categories/:id', async (req, res) => {
  try {
    const category = await getById('website_categories', req.params.id);
    if (!category) return res.status(404).json({ error: 'Category not found' });

    const allowed = ['hero_placeholder', 'description'];
    const updates = {};
    for (const key of allowed) {
      if (req.body[key] !== undefined) updates[key] = req.body[key];
    }
    updates.updated_at = new Date().toISOString();

    const result = await update('website_categories', category.id, updates);
    res.json({ data: result });
  } catch (err) {
    logger.error('[SiteContent] Category update error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export { router as siteContentRouter };
