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

export { router as onedriveRouter, publicRouter as onedrivePublicRouter };
