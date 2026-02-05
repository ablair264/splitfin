// middleware/rateLimiter.js
import { logger } from '../utils/logger.js';

// In-memory counters (use Redis in production for multiple instances)
const requestCounts = new Map(); // key -> { windowStart, count }
const blockedIPs = new Map();    // ip -> blockedUntil

const RATE_LIMIT_CONFIG = {
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '60000', 10),      // 1m
  maxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '300', 10),  // increased for bulk operations
  blockDurationMs: parseInt(process.env.RATE_LIMIT_BLOCK_DURATION_MS || '300000', 10), // reduced to 5m
  // IP whitelist - these IPs bypass rate limiting entirely
  whitelist: (process.env.RATE_LIMIT_WHITELIST || '').split(',').map(ip => ip.trim()).filter(Boolean),
  endpoints: {
    '/v1/auth/login': { maxRequests: 10, windowMs: 60_000 },
    '/v1/orders':     { maxRequests: 60, windowMs: 60_000 },
    '/v1/products':   { maxRequests: 300, windowMs: 60_000 },
    // add more as needed
  }
};

function getClientIP(req) {
  const xf = (req.headers['x-forwarded-for'] || '').toString();
  const first = xf.split(',')[0].trim();
  return first || req.ip || req.connection?.remoteAddress || 'unknown';
}

function matchEndpointConfig(path) {
  // Treat /api/* as in-API. Only apply strict edge defaults to non-API paths.
  // Provide a higher, configurable limit for AI proxy to support bulk operations.
  if (path.startsWith('/api/ai') || path.startsWith('/api/smart-search')) {
    return {
      maxRequests: parseInt(process.env.AI_RATE_LIMIT_MAX_REQUESTS || '1000', 10), // Much higher for AI bulk operations
      windowMs: parseInt(process.env.AI_RATE_LIMIT_WINDOW_MS || '60000', 10)
    };
  }
  // Stricter defaults only for paths outside /v1/ and /api/
  if (!path.startsWith('/v1/') && !path.startsWith('/api/')) {
    return { maxRequests: 10, windowMs: 60_000 };
  }

  // Specific patterns (mainly /v1/*). Add more as needed.
  for (const [pattern, cfg] of Object.entries(RATE_LIMIT_CONFIG.endpoints)) {
    if (pattern.endsWith('*')) {
      const base = pattern.slice(0, -1);
      if (path.startsWith(base)) return cfg;
    } else if (path === pattern) {
      return cfg;
    }
  }
  // Default for API routes (both /v1/* and /api/*)
  return { maxRequests: RATE_LIMIT_CONFIG.maxRequests, windowMs: RATE_LIMIT_CONFIG.windowMs };
}

export function rateLimiter(req, res, next) {
  const ip = getClientIP(req);
  const path = req.path || req.url || '';
  const method = req.method;

  // Check if IP is whitelisted - bypass rate limiting entirely
  if (RATE_LIMIT_CONFIG.whitelist.includes(ip)) {
    logger.debug(`[RateLimiter] Whitelisted IP ${ip} bypassing rate limit for ${method} ${path}`);
    return next();
  }

  // Check if request has valid API key - give higher limits to authenticated users
  const hasValidApiKey = req.headers['x-api-key'] === process.env.API_KEY;
  const isAuthenticatedRequest = hasValidApiKey && (path.startsWith('/api/') || path.startsWith('/v1/'));
  
  if (isAuthenticatedRequest) {
    // Authenticated users get 10x higher limits
    logger.debug(`[RateLimiter] Authenticated request from ${ip} for ${method} ${path}`);
  }

  const now = Date.now();

  if (blockedIPs.has(ip)) {
    const until = blockedIPs.get(ip);
    if (now < until) {
      const retrySec = Math.ceil((until - now) / 1000);
      logger.warn(`[RateLimiter] Blocked IP ${ip} attempted ${method} ${path}`);
      res.set({
        'Retry-After': retrySec,
        'X-RateLimit-Limit': '0',
        'X-RateLimit-Remaining': '0',
        'X-RateLimit-Reset': new Date(until).toISOString()
      });
      return res.status(429).json({ error: 'Too Many Requests', message: 'Temporarily blocked' });
    }
    blockedIPs.delete(ip);
  }

  let cfg = matchEndpointConfig(path);
  
  // Apply higher limits for authenticated users
  if (isAuthenticatedRequest) {
    cfg = {
      maxRequests: cfg.maxRequests * 10, // 10x higher for authenticated users
      windowMs: cfg.windowMs
    };
  }
  
  const authSuffix = isAuthenticatedRequest ? 'auth' : 'unauth';
  const key = `${ip}:${Math.floor(now / cfg.windowMs)}:${method}:${cfg.windowMs}:${cfg.maxRequests}:${path.startsWith('/v1/') ? 'api' : 'edge'}:${authSuffix}`;
  const rec = requestCounts.get(key) || { windowStart: now, count: 0 };
  if (now - rec.windowStart >= cfg.windowMs) {
    rec.windowStart = now;
    rec.count = 0;
  }
  rec.count += 1;
  requestCounts.set(key, rec);

  const remaining = Math.max(0, cfg.maxRequests - rec.count);
  res.set({
    'X-RateLimit-Limit': String(cfg.maxRequests),
    'X-RateLimit-Remaining': String(remaining),
    'X-RateLimit-Window': String(cfg.windowMs)
  });

  if (rec.count > cfg.maxRequests) {
    const until = now + RATE_LIMIT_CONFIG.blockDurationMs;
    blockedIPs.set(ip, until);
    logger.warn(`[RateLimiter] ${ip} exceeded limit on ${method} ${path} — blocking for ${RATE_LIMIT_CONFIG.blockDurationMs / 1000}s`);
    res.set('Retry-After', Math.ceil(RATE_LIMIT_CONFIG.blockDurationMs / 1000));
    return res.status(429).json({ error: 'Too Many Requests' });
  }

  return next();
}
