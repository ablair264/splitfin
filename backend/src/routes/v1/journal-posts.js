import express from 'express';
import { query, getById, insert, update, remove, withTransaction } from '../../config/database.js';
import { logger } from '../../utils/logger.js';

const router = express.Router();

// Lazy-loaded R2 + multer
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

// Sort whitelist
const SORT_COLUMNS = {
  title: 'jp.title',
  status: 'jp.status',
  published_at: 'jp.published_at',
  created_at: 'jp.created_at',
  display_order: 'jp.display_order',
};

// Build WHERE clause
function buildWhere(filters) {
  const { search, status, is_featured, tag_id } = filters;
  const conditions = ['1=1'];
  const params = [];
  let idx = 1;

  if (search) {
    conditions.push(`(jp.title ILIKE $${idx} OR jp.slug ILIKE $${idx})`);
    params.push(`%${search}%`);
    idx++;
  }

  if (status) {
    conditions.push(`jp.status = $${idx++}`);
    params.push(status);
  }

  if (is_featured !== undefined && is_featured !== '') {
    conditions.push(`jp.is_featured = $${idx++}`);
    params.push(is_featured === 'true');
  }

  if (tag_id) {
    conditions.push(`jp.id IN (SELECT journal_post_id FROM journal_post_tags WHERE tag_id = $${idx++})`);
    params.push(parseInt(tag_id));
  }

  return { where: conditions.join(' AND '), params, nextIdx: idx };
}

// Base SELECT with tags subquery
const BASE_SELECT = `
  SELECT
    jp.*,
    (SELECT COALESCE(json_agg(
      json_build_object('id', t.id, 'name', t.name, 'slug', t.slug)
    ), '[]'::json)
    FROM website_tags t
    JOIN journal_post_tags jpt ON jpt.tag_id = t.id
    WHERE jpt.journal_post_id = jp.id) AS tags
  FROM journal_posts jp
`;

// GET /api/v1/journal-posts
router.get('/', async (req, res) => {
  try {
    const { sort_by = 'created_at', sort_order = 'desc', limit = 50, offset = 0 } = req.query;
    const { where, params, nextIdx } = buildWhere(req.query);
    let idx = nextIdx;

    const col = SORT_COLUMNS[sort_by] || 'jp.created_at';
    const dir = sort_order === 'desc' ? 'DESC' : 'ASC';
    const lim = parseInt(limit);
    const off = parseInt(offset);

    const countSql = `SELECT COUNT(*) as total FROM journal_posts jp WHERE ${where}`;
    const dataSql = `
      ${BASE_SELECT}
      WHERE ${where}
      ORDER BY ${col} ${dir} NULLS LAST, jp.id ASC
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
    logger.error('[JournalPosts] List error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/v1/journal-posts/:id
router.get('/:id', async (req, res) => {
  try {
    const { rows } = await query(`${BASE_SELECT} WHERE jp.id = $1`, [req.params.id]);
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Journal post not found' });
    }
    res.json({ data: rows[0] });
  } catch (err) {
    logger.error('[JournalPosts] Get error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/v1/journal-posts
router.post('/', async (req, res) => {
  try {
    const { title, slug, excerpt, body, cover_image, cover_alt, author, status, is_featured, display_order, meta_title, meta_description } = req.body;

    if (!title) return res.status(400).json({ error: 'title is required' });

    const postSlug = (slug || title)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '');

    const data = {
      title,
      slug: postSlug,
      excerpt: excerpt || null,
      body: body || null,
      cover_image: cover_image || null,
      cover_alt: cover_alt || null,
      author: author || 'Pop! Home',
      status: status || 'draft',
      is_featured: is_featured || false,
      display_order: display_order || 0,
      meta_title: meta_title || null,
      meta_description: meta_description || null,
      published_at: status === 'published' ? new Date().toISOString() : null,
    };

    const result = await insert('journal_posts', data);

    // Return with tags
    const { rows } = await query(`${BASE_SELECT} WHERE jp.id = $1`, [result.id]);
    res.status(201).json({ data: rows[0] });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'A post with this slug already exists' });
    }
    logger.error('[JournalPosts] Create error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /api/v1/journal-posts/:id
router.put('/:id', async (req, res) => {
  try {
    const id = req.params.id;
    const existing = await getById('journal_posts', id);
    if (!existing) {
      return res.status(404).json({ error: 'Journal post not found' });
    }

    const allowed = [
      'slug', 'title', 'excerpt', 'body', 'cover_image', 'cover_alt',
      'author', 'status', 'is_featured', 'display_order',
      'meta_title', 'meta_description',
    ];

    const updates = {};
    for (const key of allowed) {
      if (req.body[key] !== undefined) {
        updates[key] = req.body[key];
      }
    }

    // Auto-set published_at on first publish
    if (updates.status === 'published' && !existing.published_at) {
      updates.published_at = new Date().toISOString();
    }

    updates.updated_at = new Date().toISOString();

    if (Object.keys(updates).length <= 1) {
      return res.status(400).json({ error: 'No valid fields to update' });
    }

    await update('journal_posts', id, updates);

    const { rows } = await query(`${BASE_SELECT} WHERE jp.id = $1`, [id]);
    res.json({ data: rows[0] });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'A post with this slug already exists' });
    }
    logger.error('[JournalPosts] Update error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/v1/journal-posts/:id
router.delete('/:id', async (req, res) => {
  try {
    const existing = await getById('journal_posts', req.params.id);
    if (!existing) {
      return res.status(404).json({ error: 'Journal post not found' });
    }

    // Clean up R2 images
    try {
      const { rows: images } = await query(
        'SELECT image_url FROM journal_post_images WHERE journal_post_id = $1',
        [req.params.id]
      );
      // Also clean cover image
      if (existing.cover_image && existing.cover_image.includes(R2_PUBLIC_URL)) {
        images.push({ image_url: existing.cover_image });
      }
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
      logger.warn('[JournalPosts] R2 cleanup failed (non-fatal):', r2Err.message);
    }

    await remove('journal_posts', req.params.id);
    res.json({ success: true });
  } catch (err) {
    logger.error('[JournalPosts] Delete error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── Tags ────────────────────────────────────────────────────

// GET /api/v1/journal-posts/:id/tags
router.get('/:id/tags', async (req, res) => {
  try {
    const { rows } = await query(`
      SELECT t.* FROM website_tags t
      JOIN journal_post_tags jpt ON jpt.tag_id = t.id
      WHERE jpt.journal_post_id = $1
      ORDER BY t.name
    `, [req.params.id]);
    res.json({ data: rows });
  } catch (err) {
    logger.error('[JournalPosts] Get tags error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /api/v1/journal-posts/:id/tags — replace all tags
router.put('/:id/tags', async (req, res) => {
  try {
    const { tag_ids } = req.body;
    if (!Array.isArray(tag_ids)) return res.status(400).json({ error: 'tag_ids array is required' });

    await withTransaction(async (client) => {
      await client.query('DELETE FROM journal_post_tags WHERE journal_post_id = $1', [req.params.id]);
      for (const tagId of tag_ids) {
        await client.query(
          'INSERT INTO journal_post_tags (journal_post_id, tag_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
          [req.params.id, tagId]
        );
      }
    });

    const { rows } = await query(`
      SELECT t.* FROM website_tags t
      JOIN journal_post_tags jpt ON jpt.tag_id = t.id
      WHERE jpt.journal_post_id = $1
      ORDER BY t.name
    `, [req.params.id]);
    res.json({ data: rows });
  } catch (err) {
    logger.error('[JournalPosts] Set tags error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── Images ──────────────────────────────────────────────────

// POST /api/v1/journal-posts/:id/images
router.post('/:id/images', async (req, res) => {
  try {
    const uploadMiddleware = await getUploadMiddleware();
    await new Promise((resolve, reject) => {
      uploadMiddleware.single('image')(req, res, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });

    const post = await getById('journal_posts', req.params.id);
    if (!post) {
      return res.status(404).json({ error: 'Journal post not found' });
    }

    if (!req.file) {
      return res.status(400).json({ error: 'No image file provided' });
    }

    const r2 = await getR2Client();
    if (!_s3Sdk) _s3Sdk = await import('@aws-sdk/client-s3');

    const ext = req.file.originalname.split('.').pop()?.toLowerCase() || 'jpg';
    const safeName = post.slug.replace(/[^a-zA-Z0-9-_]/g, '_').toLowerCase();
    const timestamp = Date.now();
    const key = `journal-posts/${post.id}/${timestamp}-${safeName}.${ext}`;

    await r2.send(new _s3Sdk.PutObjectCommand({
      Bucket: R2_BUCKET,
      Key: key,
      Body: req.file.buffer,
      ContentType: req.file.mimetype,
    }));

    const imageUrl = `${R2_PUBLIC_URL}/${key}`;

    // If type=cover, update the post's cover_image directly
    if (req.body?.type === 'cover') {
      await update('journal_posts', post.id, { cover_image: imageUrl, updated_at: new Date().toISOString() });
      res.status(201).json({ data: { image_url: imageUrl, type: 'cover' } });
      return;
    }

    // Otherwise track as inline image
    const image = await insert('journal_post_images', {
      journal_post_id: post.id,
      image_url: imageUrl,
      alt_text: req.body?.alt_text || null,
    });

    logger.info(`[JournalPosts] Image uploaded for ${post.slug}: ${imageUrl}`);
    res.status(201).json({ data: image });
  } catch (err) {
    logger.error('[JournalPosts] Image upload error:', err);
    if (err.message === 'Only image files are allowed') {
      return res.status(400).json({ error: err.message });
    }
    res.status(500).json({ error: 'Failed to upload image' });
  }
});

// DELETE /api/v1/journal-posts/:id/images/:imageId
router.delete('/:id/images/:imageId', async (req, res) => {
  try {
    const image = await getById('journal_post_images', req.params.imageId);
    if (!image || image.journal_post_id !== parseInt(req.params.id)) {
      return res.status(404).json({ error: 'Image not found' });
    }

    if (image.image_url && image.image_url.includes(R2_PUBLIC_URL)) {
      try {
        const r2 = await getR2Client();
        if (!_s3Sdk) _s3Sdk = await import('@aws-sdk/client-s3');
        const key = image.image_url.replace(`${R2_PUBLIC_URL}/`, '');
        await r2.send(new _s3Sdk.DeleteObjectCommand({ Bucket: R2_BUCKET, Key: key }));
      } catch (r2Err) {
        logger.warn('[JournalPosts] R2 delete failed (non-fatal):', r2Err.message);
      }
    }

    await remove('journal_post_images', req.params.imageId);
    res.json({ success: true });
  } catch (err) {
    logger.error('[JournalPosts] Image delete error:', err);
    res.status(500).json({ error: 'Failed to delete image' });
  }
});

export { router as journalPostsRouter };
