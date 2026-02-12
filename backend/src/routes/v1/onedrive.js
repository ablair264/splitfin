import express from 'express';
import axios from 'axios';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { query } from '../../config/database.js';
import { logger } from '../../utils/logger.js';

const router = express.Router();
const publicRouter = express.Router();

const ALLOWED_AGENT_ID = 'sammie';
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-in-production';
const TENANT = process.env.MS_TENANT || 'consumers';
const AUTH_BASE = `https://login.microsoftonline.com/${TENANT}/oauth2/v2.0`;
const GRAPH_BASE = 'https://graph.microsoft.com/v1.0';
const SCOPES = process.env.MS_SCOPES || 'offline_access Files.Read User.Read';

const {
  MS_CLIENT_ID,
  MS_CLIENT_SECRET,
  MS_REDIRECT_URI,
  FRONTEND_URL,
} = process.env;

// ---------------------------------------------------------------------------
// Lazy-loaded R2 + sharp (used for OneDrive server-side import)
// ---------------------------------------------------------------------------
let _r2 = null;
let _s3Sdk = null;
let _sharp = null;

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

async function getSharp() {
  if (!_sharp) {
    const mod = await import('sharp');
    _sharp = mod.default;
  }
  return _sharp;
}

const MAX_WIDTH = 1200;
const WEBP_QUALITY = 80;

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

function ensureConfigured() {
  if (!MS_CLIENT_ID || !MS_CLIENT_SECRET || !MS_REDIRECT_URI) {
    throw new Error('Missing OneDrive OAuth environment variables');
  }
}

function requireSammie(req, res, next) {
  const agentId = req.agent?.id?.toLowerCase();
  if (agentId !== ALLOWED_AGENT_ID) {
    return res.status(403).json({ error: 'OneDrive access not enabled for this user' });
  }
  next();
}

function createStateToken(agentId) {
  const payload = {
    agent_id: agentId,
    purpose: 'onedrive',
    nonce: crypto.randomBytes(16).toString('hex'),
  };
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '10m' });
}

function decodeStateToken(state) {
  const decoded = jwt.verify(state, JWT_SECRET);
  if (decoded?.purpose !== 'onedrive') {
    throw new Error('Invalid OneDrive state');
  }
  return decoded;
}

function encodePath(path) {
  return path
    .split('/')
    .filter(Boolean)
    .map(segment => encodeURIComponent(segment))
    .join('/');
}

async function getTokenRow(agentId) {
  const { rows } = await query(
    `SELECT agent_id, access_token, refresh_token, expires_at, scope, token_type
     FROM onedrive_tokens
     WHERE agent_id = $1`,
    [agentId]
  );
  return rows[0] || null;
}

async function saveToken(agentId, tokenData) {
  const expiresAt = tokenData.expires_in
    ? new Date(Date.now() + Number(tokenData.expires_in) * 1000).toISOString()
    : null;

  await query(
    `INSERT INTO onedrive_tokens
      (agent_id, access_token, refresh_token, expires_at, scope, token_type, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, NOW())
     ON CONFLICT (agent_id) DO UPDATE SET
      access_token = EXCLUDED.access_token,
      refresh_token = COALESCE(EXCLUDED.refresh_token, onedrive_tokens.refresh_token),
      expires_at = EXCLUDED.expires_at,
      scope = EXCLUDED.scope,
      token_type = EXCLUDED.token_type,
      updated_at = NOW()`,
    [
      agentId,
      tokenData.access_token,
      tokenData.refresh_token || null,
      expiresAt,
      tokenData.scope || null,
      tokenData.token_type || null,
    ]
  );

  return { access_token: tokenData.access_token, expires_at: expiresAt };
}

async function refreshAccessToken(agentId, refreshToken) {
  ensureConfigured();
  const params = new URLSearchParams({
    client_id: MS_CLIENT_ID,
    client_secret: MS_CLIENT_SECRET,
    redirect_uri: MS_REDIRECT_URI,
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    scope: SCOPES,
  });

  const { data } = await axios.post(
    `${AUTH_BASE}/token`,
    params.toString(),
    { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
  );

  return saveToken(agentId, { ...data, refresh_token: data.refresh_token || refreshToken });
}

async function getValidAccessToken(agentId) {
  ensureConfigured();
  const tokenRow = await getTokenRow(agentId);
  if (!tokenRow) {
    throw new Error('OneDrive not connected');
  }

  const expiresAt = tokenRow.expires_at ? new Date(tokenRow.expires_at).getTime() : 0;
  const isExpired = !expiresAt || expiresAt - Date.now() < 60_000;

  if (!isExpired) {
    return tokenRow.access_token;
  }
  if (!tokenRow.refresh_token) {
    throw new Error('Missing refresh token');
  }

  const refreshed = await refreshAccessToken(agentId, tokenRow.refresh_token);
  return refreshed.access_token;
}

// ============================================
// OAuth: Get authorization URL
// ============================================
router.get('/auth-url', requireSammie, (req, res) => {
  try {
    ensureConfigured();
    const agentId = req.agent?.id;
    const state = createStateToken(agentId);
    const params = new URLSearchParams({
      client_id: MS_CLIENT_ID,
      response_type: 'code',
      redirect_uri: MS_REDIRECT_URI,
      response_mode: 'query',
      scope: SCOPES,
      state,
    });

    res.json({ url: `${AUTH_BASE}/authorize?${params.toString()}` });
  } catch (err) {
    logger.error('[OneDrive] auth-url error:', err);
    res.status(500).json({ error: 'Failed to create OneDrive auth URL' });
  }
});

// ============================================
// OAuth: Callback to exchange code for token
// ============================================
publicRouter.get('/callback', async (req, res) => {
  try {
    ensureConfigured();
    const { code, state, error, error_description } = req.query;

    if (error) {
      return res.status(400).send(`OneDrive OAuth error: ${error_description || error}`);
    }
    if (!code || !state) {
      return res.status(400).send('Missing code or state');
    }

    const decoded = decodeStateToken(String(state));
    const agentId = decoded?.agent_id?.toLowerCase();
    if (agentId !== ALLOWED_AGENT_ID) {
      return res.status(403).send('Unauthorized OneDrive user');
    }

    const params = new URLSearchParams({
      client_id: MS_CLIENT_ID,
      client_secret: MS_CLIENT_SECRET,
      redirect_uri: MS_REDIRECT_URI,
      grant_type: 'authorization_code',
      code: String(code),
      scope: SCOPES,
    });

    const { data } = await axios.post(
      `${AUTH_BASE}/token`,
      params.toString(),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
    );

    await saveToken(agentId, data);

    const redirectBase = FRONTEND_URL || 'https://splitfin.co.uk';
    return res.redirect(`${redirectBase}/dashboard?onedrive=connected`);
  } catch (err) {
    logger.error('[OneDrive] callback error:', err);
    res.status(500).send('OneDrive OAuth failed');
  }
});

// ============================================
// Status
// ============================================
router.get('/status', requireSammie, async (req, res) => {
  try {
    const tokenRow = await getTokenRow(req.agent.id);
    res.json({
      connected: Boolean(tokenRow),
      expires_at: tokenRow?.expires_at || null,
    });
  } catch (err) {
    logger.error('[OneDrive] status error:', err);
    res.status(500).json({ error: 'Failed to fetch OneDrive status' });
  }
});

// ============================================
// Disconnect
// ============================================
router.post('/disconnect', requireSammie, async (req, res) => {
  try {
    await query('DELETE FROM onedrive_tokens WHERE agent_id = $1', [req.agent.id]);
    res.json({ success: true });
  } catch (err) {
    logger.error('[OneDrive] disconnect error:', err);
    res.status(500).json({ error: 'Failed to disconnect OneDrive' });
  }
});

// ============================================
// List image items
// ============================================
router.get('/images', requireSammie, async (req, res) => {
  try {
    const agentId = req.agent.id;
    const accessToken = await getValidAccessToken(agentId);

    const path = typeof req.query.path === 'string' ? req.query.path : '';
    const limit = Math.min(Number(req.query.limit || 200), 200);
    const includeDownloadUrl = String(req.query.includeDownloadUrl || 'true') !== 'false';

    const url = path
      ? `${GRAPH_BASE}/me/drive/root:/${encodePath(path)}:/children`
      : `${GRAPH_BASE}/me/drive/root/children`;

    const { data } = await axios.get(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
      params: { $top: limit },
    });

    const items = Array.isArray(data.value) ? data.value : [];
    const imageItems = items.filter(item => item?.file?.mimeType?.startsWith('image/'));

    let normalized = imageItems.map(item => ({
      id: item.id,
      name: item.name,
      size: item.size,
      mimeType: item.file?.mimeType || null,
      webUrl: item.webUrl || null,
      createdDateTime: item.createdDateTime || null,
      lastModifiedDateTime: item.lastModifiedDateTime || null,
      downloadUrl: item['@microsoft.graph.downloadUrl'] || null,
    }));

    if (includeDownloadUrl) {
      const missing = normalized.filter(item => !item.downloadUrl);
      if (missing.length > 0) {
        const fetched = await Promise.all(
          missing.map(async (item) => {
            const detail = await axios.get(`${GRAPH_BASE}/me/drive/items/${item.id}`, {
              headers: { Authorization: `Bearer ${accessToken}` },
            });
            return {
              id: item.id,
              downloadUrl: detail.data['@microsoft.graph.downloadUrl'] || null,
            };
          })
        );
        const map = new Map(fetched.map(r => [r.id, r.downloadUrl]));
        normalized = normalized.map(item => ({
          ...item,
          downloadUrl: item.downloadUrl || map.get(item.id) || null,
        }));
      }
    }

    res.json({
      items: normalized,
      nextLink: data['@odata.nextLink'] || null,
    });
  } catch (err) {
    logger.error('[OneDrive] images error:', err);
    res.status(500).json({ error: 'Failed to list OneDrive images' });
  }
});

// ============================================
// List children (folders + image files)
// ============================================
router.get('/children', requireSammie, async (req, res) => {
  try {
    const agentId = req.agent.id;
    const accessToken = await getValidAccessToken(agentId);

    const parentId = typeof req.query.parentId === 'string' ? req.query.parentId : '';
    const limit = Math.min(Number(req.query.limit || 200), 200);
    const foldersOnly = String(req.query.foldersOnly || 'false') === 'true';
    const imagesOnly = String(req.query.imagesOnly || 'false') === 'true';
    const includeDownloadUrl = String(req.query.includeDownloadUrl || 'true') !== 'false';
    const nextLink = typeof req.query.nextLink === 'string' ? req.query.nextLink : '';

    const selectFields = [];
    if (foldersOnly) {
      selectFields.push('id', 'name', 'folder');
    } else if (imagesOnly) {
      selectFields.push('id', 'name', 'file', 'size', 'webUrl', 'createdDateTime', 'lastModifiedDateTime');
    } else {
      selectFields.push('id', 'name', 'folder', 'file', 'size', 'webUrl', 'createdDateTime', 'lastModifiedDateTime');
    }

    const url = parentId
      ? `${GRAPH_BASE}/me/drive/items/${encodeURIComponent(parentId)}/children`
      : `${GRAPH_BASE}/me/drive/root/children`;

    const requestUrl = nextLink && nextLink.startsWith(GRAPH_BASE)
      ? nextLink
      : url;

    const { data } = await axios.get(requestUrl, {
      headers: { Authorization: `Bearer ${accessToken}` },
      params: nextLink ? undefined : { $top: limit, $select: selectFields.join(',') },
    });

    const items = Array.isArray(data.value) ? data.value : [];
    const folders = foldersOnly || !imagesOnly
      ? items
          .filter(item => item?.folder)
          .map(item => ({
            id: item.id,
            name: item.name,
            childCount: item.folder?.childCount ?? null,
          }))
      : [];

    let images = imagesOnly || !foldersOnly
      ? items
          .filter(item => item?.file?.mimeType?.startsWith('image/'))
          .map(item => ({
            id: item.id,
            name: item.name,
            size: item.size,
            mimeType: item.file?.mimeType || null,
            webUrl: item.webUrl || null,
            createdDateTime: item.createdDateTime || null,
            lastModifiedDateTime: item.lastModifiedDateTime || null,
            downloadUrl: item['@microsoft.graph.downloadUrl'] || null,
          }))
      : [];

    if (includeDownloadUrl && images.length > 0) {
      const missing = images.filter(item => !item.downloadUrl);
      if (missing.length > 0) {
        const fetched = await Promise.all(
          missing.map(async (item) => {
            const detail = await axios.get(`${GRAPH_BASE}/me/drive/items/${item.id}`, {
              headers: { Authorization: `Bearer ${accessToken}` },
            });
            return {
              id: item.id,
              downloadUrl: detail.data['@microsoft.graph.downloadUrl'] || null,
            };
          })
        );
        const map = new Map(fetched.map(r => [r.id, r.downloadUrl]));
        images = images.map(item => ({
          ...item,
          downloadUrl: item.downloadUrl || map.get(item.id) || null,
        }));
      }
    }

    res.json({
      folders,
      images,
      nextLink: data['@odata.nextLink'] || null,
    });
  } catch (err) {
    logger.error('[OneDrive] children error:', err);
    res.status(500).json({ error: 'Failed to list OneDrive children' });
  }
});

// ============================================
// Search images by name
// ============================================
router.get('/search', requireSammie, async (req, res) => {
  try {
    const agentId = req.agent.id;
    const accessToken = await getValidAccessToken(agentId);

    const queryText = typeof req.query.query === 'string' ? req.query.query.trim() : '';
    if (!queryText) {
      return res.status(400).json({ error: 'Query is required' });
    }

    const limit = Math.min(Number(req.query.limit || 50), 200);
    const searchUrl = `${GRAPH_BASE}/me/drive/root/search(q='${encodeURIComponent(queryText)}')`;

    const { data } = await axios.get(searchUrl, {
      headers: { Authorization: `Bearer ${accessToken}` },
      params: { $top: limit },
    });

    const items = Array.isArray(data.value) ? data.value : [];
    const images = items
      .filter(item => item?.file?.mimeType?.startsWith('image/'))
      .map(item => ({
        id: item.id,
        name: item.name,
        size: item.size,
        mimeType: item.file?.mimeType || null,
        webUrl: item.webUrl || null,
        createdDateTime: item.createdDateTime || null,
        lastModifiedDateTime: item.lastModifiedDateTime || null,
      }));

    res.json({ images });
  } catch (err) {
    const message = err?.response?.data?.error?.message || err?.message || 'Failed to search OneDrive';
    logger.error('[OneDrive] search error:', message);
    res.status(500).json({ error: message });
  }
});

// ============================================
// Match missing product images (SKU-only)
// ============================================
router.get('/match-missing', requireSammie, async (req, res) => {
  try {
    const agentId = req.agent.id;
    const accessToken = await getValidAccessToken(agentId);

    const limit = Math.min(Number(req.query.limit || 20), 50);
    const offset = Math.max(Number(req.query.offset || 0), 0);

    const { rows: products } = await query(
      `SELECT p.id, p.sku, p.name, p.brand, p.image_url
       FROM products p
       WHERE p.status = 'active'
         AND (p.image_url IS NULL OR p.image_url = '')
         AND NOT EXISTS (
           SELECT 1 FROM product_images pi
            WHERE pi.product_id = p.id
               OR (pi.matched_sku IS NOT NULL AND TRIM(pi.matched_sku) = TRIM(p.sku))
         )
       ORDER BY p.id DESC
       LIMIT $1 OFFSET $2`,
      [limit, offset]
    );

    const results = [];
    for (const p of products) {
      if (!p.sku) {
        results.push({ product: p, matches: [], reason: 'missing_sku' });
        continue;
      }

      const searchUrl = `${GRAPH_BASE}/me/drive/root/search(q='${encodeURIComponent(String(p.sku))}')`;
      try {
        const { data } = await axios.get(searchUrl, {
          headers: { Authorization: `Bearer ${accessToken}` },
          params: { $top: 10 },
        });

        const items = Array.isArray(data.value) ? data.value : [];
        const images = items
          .filter(item => item?.file?.mimeType?.startsWith('image/'))
          .map(item => ({
            id: item.id,
            name: item.name,
            size: item.size,
            mimeType: item.file?.mimeType || null,
            webUrl: item.webUrl || null,
            createdDateTime: item.createdDateTime || null,
            lastModifiedDateTime: item.lastModifiedDateTime || null,
          }));

        results.push({ product: p, matches: images });
      } catch (err) {
        const message = err?.response?.data?.error?.message || err?.message || 'search_failed';
        results.push({ product: p, matches: [], reason: message });
      }
    }

    res.json({ data: results, count: results.length, meta: { limit, offset } });
  } catch (err) {
    const message = err?.response?.data?.error?.message || err?.message || 'Failed to match missing images';
    logger.error('[OneDrive] match-missing error:', message);
    res.status(500).json({ error: message });
  }
});

// ============================================
// Import OneDrive images server-side
// ============================================
router.post('/import', requireSammie, async (req, res) => {
  try {
    const agentId = req.agent.id;
    const accessToken = await getValidAccessToken(agentId);

    const { brand, items, product_id } = req.body || {};
    if (!brand) {
      return res.status(400).json({ error: 'Brand is required' });
    }
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'Items array is required' });
    }

    const r2 = await getR2Client();
    if (!_s3Sdk) _s3Sdk = await import('@aws-sdk/client-s3');

    const results = [];
    let successCount = 0;
    let errorCount = 0;

    for (const item of items) {
      const itemId = item?.id;
      const itemName = item?.name || 'onedrive-image';
      const matchedSku = item?.matched_sku || null;
      const skuConfidence = Number.isFinite(item?.sku_confidence) ? item.sku_confidence : null;
      const originalFilename = item?.original_filename || itemName;
      const productIdOverride = Number.isFinite(product_id) ? Number(product_id) : null;

      if (!itemId) {
        results.push({
          success: false,
          originalFilename,
          finalFilename: '',
          error: 'Missing item id',
        });
        errorCount++;
        continue;
      }

      try {
        const download = await axios.get(
          `${GRAPH_BASE}/me/drive/items/${encodeURIComponent(itemId)}/content`,
          {
            headers: { Authorization: `Bearer ${accessToken}` },
            responseType: 'arraybuffer',
          }
        );

        const buffer = Buffer.from(download.data);
        const processed = await processImage(buffer);

        const brandSlug = String(brand).toLowerCase().replace(/\s+/g, '-');
        const baseName = String(itemName).replace(/\.[^.]+$/, '');
        const key = `images/${brandSlug}/${baseName}.webp`;

        await r2.send(new _s3Sdk.PutObjectCommand({
          Bucket: R2_BUCKET,
          Key: key,
          Body: processed.buffer,
          ContentType: processed.contentType,
        }));

        const publicUrl = `${R2_PUBLIC_URL}/${key}`;

        let productId = productIdOverride;
        if (!productId && matchedSku) {
          const prodResult = await query('SELECT id FROM products WHERE sku = $1 LIMIT 1', [matchedSku]);
          if (prodResult.rows.length > 0) {
            productId = prodResult.rows[0].id;
          }
        }

        const insertParams = [
          `${baseName}.webp`,
          publicUrl,
          key,
          processed.contentType,
          processed.size,
          brand,
          matchedSku,
          skuConfidence,
          productId,
          processed.width,
          processed.height,
          null,
          null,
          null,
          originalFilename,
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

        if (productId && imageRow?.url) {
          try {
            const prodCheck = await query('SELECT image_url FROM products WHERE id = $1', [productId]);
            if (prodCheck.rows.length > 0 && !prodCheck.rows[0].image_url) {
              await query('UPDATE products SET image_url = $1, updated_at = NOW() WHERE id = $2', [imageRow.url, productId]);
            }
          } catch (prodErr) {
            logger.warn('[OneDrive] Failed to update product image_url (non-fatal):', prodErr.message);
          }
        }

        results.push({
          success: true,
          originalFilename,
          finalFilename: imageRow?.filename || `${baseName}.webp`,
          matchedSku: matchedSku || undefined,
          confidence: skuConfidence || undefined,
          webpUrl: imageRow?.url || publicUrl,
        });
        successCount++;
      } catch (fileErr) {
        logger.error(`[OneDrive] Import failed for ${itemName}:`, fileErr);
        results.push({
          success: false,
          originalFilename,
          finalFilename: '',
          error: fileErr?.message || 'Import failed',
        });
        errorCount++;
      }
    }

    res.json({
      results,
      summary: {
        total: items.length,
        success: successCount,
        errors: errorCount,
      },
    });
  } catch (err) {
    logger.error('[OneDrive] import error:', err);
    res.status(500).json({ error: 'Failed to import OneDrive images' });
  }
});

export { router as onedriveRouter, publicRouter as onedrivePublicRouter };
