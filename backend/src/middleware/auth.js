// middleware/auth.js
import crypto from 'crypto';
import { logger } from '../utils/logger.js';

// In-memory token store (consider Redis in prod)
const apiTokens = new Map();      // token -> { userId, scopes, createdAt, expiresAt }
const tokenAttempts = new Map();  // ip -> { count, lockedUntil }

const AUTH_CONFIG = {
  maxAttempts: 5,
  lockoutDuration: 15 * 60 * 1000, // 15m
  tokenExpiry: 24 * 60 * 60 * 1000, // 24h
  requireHttps: process.env.NODE_ENV === 'production',
};

function getClientIP(req) {
  const xf = (req.headers['x-forwarded-for'] || '').toString();
  const first = xf.split(',')[0].trim();
  return first || req.ip || req.connection?.remoteAddress || 'unknown';
}

function isLocked(ip) {
  const info = tokenAttempts.get(ip);
  return info && info.lockedUntil && Date.now() < info.lockedUntil;
}

function noteFailedAttempt(ip) {
  const now = Date.now();
  const info = tokenAttempts.get(ip) || { count: 0, lockedUntil: 0, last: 0 };
  info.count += 1;
  info.last = now;
  if (info.count >= AUTH_CONFIG.maxAttempts) {
    info.lockedUntil = now + AUTH_CONFIG.lockoutDuration;
    logger.warn(`[Auth] Locking IP ${ip} for ${AUTH_CONFIG.lockoutDuration / 1000}s`);
  }
  tokenAttempts.set(ip, info);
}

function resetAttempts(ip) {
  tokenAttempts.delete(ip);
}

function getAuthHeader(req) {
  const h = req.headers['authorization'] || '';
  if (typeof h !== 'string') return null;
  if (!h.startsWith('Bearer ')) return null;
  return h.slice(7).trim();
}

function validateToken(token) {
  const record = apiTokens.get(token);
  if (!record) return null;
  if (record.expiresAt && Date.now() > record.expiresAt) {
    apiTokens.delete(token);
    return null;
  }
  return record;
}

// housekeeping: clear stale attempt records occasionally
setInterval(() => {
  const now = Date.now();
  let cleaned = 0;
  for (const [ip, info] of tokenAttempts) {
    if (info.lockedUntil && now > info.lockedUntil + 10 * 60 * 1000) {
      tokenAttempts.delete(ip); cleaned++;
    }
  }
  if (cleaned) logger.debug(`[Auth] Cleaned ${cleaned} old attempt records`);
}, 10 * 60 * 1000);

export function issueToken({ userId, scopes = [] }, ttlMs = AUTH_CONFIG.tokenExpiry) {
  const token = crypto.randomBytes(24).toString('hex');
  apiTokens.set(token, {
    userId,
    scopes,
    createdAt: Date.now(),
    expiresAt: Date.now() + ttlMs
  });
  return token;
}

export function revokeToken(token) {
  apiTokens.delete(token);
}

function authenticate({ requireHttps = AUTH_CONFIG.requireHttps } = {}) {
  return (req, res, next) => {
    const ip = getClientIP(req);
    const path = req.path || req.url || '';
    const method = req.method;

    if (requireHttps && req.protocol !== 'https' && req.headers['x-forwarded-proto'] !== 'https') {
      logger.warn(`[Auth] Non-HTTPS request blocked from ${ip} to ${method} ${path}`);
      return res.status(400).json({ error: 'Bad Request', message: 'HTTPS required' });
    }

    if (isLocked(ip)) {
      return res.status(429).json({ error: 'Too Many Requests', message: 'Auth temporarily locked' });
    }

    // Never allow API key in query string (bots love this)
    if (typeof req.query?.api_key !== 'undefined') {
      logger.warn(`[Auth] API key in query string blocked for ${method} ${path} from ${ip}`);
      return res.status(400).json({ error: 'Bad Request', message: 'API key must be sent in Authorization header' });
    }

    // Prefer Bearer token if present
    const token = getAuthHeader(req);
    if (token) {
      const record = validateToken(token);
      if (!record) {
        noteFailedAttempt(ip);
        return res.status(401).json({ error: 'Unauthorized' });
      }
      resetAttempts(ip);
      req.auth = { userId: record.userId, scopes: record.scopes, token };
      return next();
    }

    // Fallback: static X-API-Key header (env-driven). Useful for simple server-to-server calls.
    const headerApiKey = req.headers['x-api-key'];
    const envApiKey = process.env.API_KEY;
    if (envApiKey && headerApiKey && headerApiKey === envApiKey) {
      resetAttempts(ip);
      req.auth = { userId: 'api-key', scopes: ['api'], token: 'x-api-key' };
      return next();
    }

    // No valid credentials
    noteFailedAttempt(ip);
    return res.status(401).json({ error: 'Unauthorized' });
  };
}

// Default auth for API routes
export const apiKeyAuth = authenticate();

// Stricter admin auth (e.g., mount on /admin/* if present)
export const adminAuth = authenticate({ requireHttps: true });
