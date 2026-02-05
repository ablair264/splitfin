import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import cron from 'node-cron';
import { logger } from './utils/logger.js';

import { syncRouter } from './routes/sync.js';
import { healthRouter } from './routes/health.js';
import { trackingRouter, handleTrackingMoreProxy } from './routes/tracking.js';
import { aiRouter, handleWebSearch } from './routes/ai.js';
import { SyncOrchestrator } from './services/syncOrchestrator.js';

// V1 API routes (Neon-backed)
import { authRouter } from './routes/v1/auth.js';
import { customersRouter } from './routes/v1/customers.js';
import { ordersRouter } from './routes/v1/orders.js';
import { productsRouter } from './routes/v1/products.js';
import { invoicesRouter } from './routes/v1/invoices.js';
import { notificationsRouter } from './routes/v1/notifications.js';
import { analyticsRouter } from './routes/v1/analytics.js';
import { messagesRouter } from './routes/v1/messages.js';
import { agentsRouter } from './routes/v1/agents.js';
import { enquiriesRouter } from './routes/v1/enquiries.js';
import { jwtAuth } from './middleware/jwtAuth.js';

// Security middleware (your existing)
import { ipBlocker, createBlocklistAPI } from './middleware/ipBlocker.js';
import { rateLimiter } from './middleware/rateLimiter.js';
import { apiKeyAuth } from './middleware/auth.js';
import { 
  securityHeaders, 
  secureCors, 
  sanitizeRequest, 
  secureErrorHandler 
} from './middleware/security.js';

// NEW: tiny allowlist/blocklist guard
import { attackSurfaceGuard } from './middleware/attackSurfaceGuard.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// Make Render/Cloudflare IPs resolvable and hide stack
app.set('x-powered-by', false);
app.enable('trust proxy'); // IMPORTANT on Render/behind proxies

// ====================================
// CORS - Must be FIRST to handle preflight OPTIONS requests
// ====================================
const corsOptions = secureCors();
app.use(cors(corsOptions));
// Explicitly handle preflight for all routes BEFORE any blocking middleware
app.options('*', cors(corsOptions));

// ====================================
// LAYER 1: Cheap edge guards (deny fast)
// ====================================

// 1) Known-bad IPs & path probes (make sure ipBlocker includes double-slash guard)
app.use(ipBlocker);

// 2) Global rate limit (includes stricter default for non-/api paths, in your rateLimiter file)
app.use(rateLimiter);

// 3) Attack-surface allowlist + hard blocks for .env/phpunit probes
app.use(attackSurfaceGuard({
  // Allow all your real surfaces; everything else 404s instantly
  allowlist: [
    // Public health
    { method: 'GET', path: '/api/health' },

    // V1 API surface
    { method: 'GET',     path: '/api/v1/:path*' },
    { method: 'POST',    path: '/api/v1/:path*' },
    { method: 'PUT',     path: '/api/v1/:path*' },
    { method: 'PATCH',   path: '/api/v1/:path*' },
    { method: 'DELETE',  path: '/api/v1/:path*' },
    { method: 'OPTIONS', path: '/api/v1/:path*' },

    // Primary API surface (permits all methods under /api/*)
    { method: 'GET',     path: '/api/:path*' },
    { method: 'POST',    path: '/api/:path*' },
    { method: 'PUT',     path: '/api/:path*' },
    { method: 'PATCH',   path: '/api/:path*' },
    { method: 'DELETE',  path: '/api/:path*' },
    { method: 'OPTIONS', path: '/api/:path*' }
  ]
}));

// ====================================
// LAYER 2: Security Headers
// ====================================

// Security headers (CSP, HSTS, frame busting, etc.)
app.use(securityHeaders());

// ====================================
// LAYER 3: Request processing
// ====================================

app.use(sanitizeRequest);

// Parsers with sane body limits
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// ====================================
// LAYER 4: Lightweight request logging
// ====================================

app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    const lvl = res.statusCode >= 400 ? 'warn' : 'info';

    // Keep logs lightweight; avoid dumping large query/body
    logger[lvl](
      `[Request] ${req.method} ${req.originalUrl || req.url} - ${res.statusCode} - ${duration}ms`,
      {
        ip: (req.headers['x-forwarded-for'] || '').toString().split(',')[0].trim() || req.ip,
        ua: req.headers['user-agent'],
        requestId: req.id,
        statusCode: res.statusCode,
        duration
      }
    );
  });
  next();
});

// ====================================
// ROUTES (auth stays per-route as you had it)
// ====================================

// Public health (basic)
app.get('/api/health', healthRouter);

// Protected health (detailed)
app.use('/api/health/detailed', apiKeyAuth, healthRouter);

// Protected sync
app.use('/api/sync', apiKeyAuth, syncRouter);

// Protected tracking
app.use('/api/tracking', apiKeyAuth, trackingRouter);
// Protected AI proxy
app.use('/api/ai', apiKeyAuth, aiRouter);
// Back-compat aliases for clients that call alternate paths
app.use('/api/ai-web-search', apiKeyAuth, aiRouter);

// Smart Search alias for other clients
app.get('/api/smart-search', apiKeyAuth, (req, res) => handleWebSearch(req, res));
app.post('/api/smart-search', apiKeyAuth, (req, res) => handleWebSearch(req, res));

// Alias for client calls: /api/trackingmore-proxy
app.get('/api/trackingmore-proxy', apiKeyAuth, (req, res) => handleTrackingMoreProxy(req, res));
app.post('/api/trackingmore-proxy', apiKeyAuth, (req, res) => handleTrackingMoreProxy(req, res));

// Admin endpoints for security management
if (process.env.ADMIN_API_KEY) {
  app.use('/api/admin/security', createBlocklistAPI(process.env.ADMIN_API_KEY));
}

// ====================================
// V1 API ROUTES (Neon PostgreSQL backed)
// ====================================

// Auth is public (no JWT required to login)
app.use('/api/v1/auth', authRouter);

// Protected v1 routes (JWT required)
app.use('/api/v1/customers', jwtAuth, customersRouter);
app.use('/api/v1/orders', jwtAuth, ordersRouter);
app.use('/api/v1/products', jwtAuth, productsRouter);
app.use('/api/v1/invoices', jwtAuth, invoicesRouter);
app.use('/api/v1/notifications', jwtAuth, notificationsRouter);
app.use('/api/v1/analytics', jwtAuth, analyticsRouter);
app.use('/api/v1/messages', jwtAuth, messagesRouter);
app.use('/api/v1/agents', jwtAuth, agentsRouter);
app.use('/api/v1/enquiries', jwtAuth, enquiriesRouter);

// ====================================
// 404 HANDLER (silent + cheap is fine; your JSON is okay too)
// ====================================

app.use((req, res) => {
  logger.warn(`[404] ${req.method} ${req.path} from ${req.ip}`);
  res.status(404).json({
    error: 'Not Found',
    message: 'The requested resource was not found',
    requestId: req.id
  });
});

// ====================================
// ERROR HANDLER
// ====================================

app.use(secureErrorHandler);

// ====================================
// SCHEDULED SYNC
// ====================================

const syncOrchestrator = new SyncOrchestrator();

if (process.env.ENABLE_SCHEDULED_SYNC === 'true') {
  const syncInterval = process.env.SYNC_INTERVAL_MINUTES || 30;

  cron.schedule(`*/${syncInterval} * * * *`, async () => {
    logger.info('[Scheduler] Starting scheduled sync...');
    try {
      await syncOrchestrator.runFullSync();
      logger.info('[Scheduler] Scheduled sync completed successfully');
    } catch (error) {
      logger.error('[Scheduler] Scheduled sync failed:', error);
    }
  });

  logger.info(`[Scheduler] Scheduled sync enabled - running every ${syncInterval} minutes`);
}

// ====================================
// UPS TRACKING REFRESH (every 30 minutes)
// ====================================
import { query, update as dbUpdate } from './config/database.js';

const UPS_BASE = (process.env.UPS_ENV || 'production') === 'sandbox'
  ? 'https://wwwcie.ups.com'
  : 'https://onlinetools.ups.com';
const UPS_API_BASE = `${UPS_BASE}/api`;
const UPS_AUTH_URL = `${UPS_BASE}/security/v1/oauth/token`;

function isUPSTrackingNumber(tracking) {
  if (!tracking) return false;
  return /^1Z[A-Z0-9]{16}$/i.test(tracking) || /^T\d{10}$/.test(tracking);
}

async function fetchUPSToken() {
  const { UPS_CLIENT_ID, UPS_CLIENT_SECRET } = process.env;
  if (!UPS_CLIENT_ID || !UPS_CLIENT_SECRET) return null;
  const authHeader = 'Basic ' + Buffer.from(`${UPS_CLIENT_ID}:${UPS_CLIENT_SECRET}`).toString('base64');
  const resp = await fetch(UPS_AUTH_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Authorization': authHeader },
    body: 'grant_type=client_credentials'
  });
  if (!resp.ok) return null;
  const data = await resp.json();
  return data.access_token;
}

async function getUPSStatus(tracking) {
  const token = await fetchUPSToken();
  if (!token) return null;
  const resp = await fetch(`${UPS_API_BASE}/track/v1/details/${encodeURIComponent(tracking)}`, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      'transId': `splitfin-${Date.now()}`,
      'transactionSrc': 'Splitfin'
    }
  });
  if (!resp.ok) return null;
  const data = await resp.json();
  const pkg = data?.trackResponse?.shipment?.[0]?.package?.[0];
  const code = pkg?.currentStatus?.code; // e.g. 'D','I','O'
  let status = 'in_transit';
  if (code === 'D' || code === 'DO' || code === 'DD') status = 'delivered';
  else if (code === 'O') status = 'in_transit';
  const deliveryDate = pkg?.deliveryDate?.[0]?.date || null;
  return { status, delivery_date: deliveryDate };
}

async function refreshUpsTracking() {
  try {
    logger.info('[UPS Refresh] Starting');
    // Get all non-delivered packages with UPS courier or UPS-style tracking
    const { rows: pkgs } = await query(
      `SELECT p.id, p.tracking_number, p.courier_id, p.status,
              c.courier_name, c.tracking_slug
       FROM packages p
       LEFT JOIN couriers c ON c.id = p.courier_id
       WHERE p.status != 'delivered'
         AND p.tracking_number IS NOT NULL
       LIMIT 200`
    );
    if (!pkgs || pkgs.length === 0) { logger.info('[UPS Refresh] No packages to refresh'); return; }

    for (const p of pkgs) {
      const isUPS = (p.courier_name || '').toLowerCase().includes('ups') ||
                    (p.tracking_slug || '').toLowerCase() === 'ups' ||
                    isUPSTrackingNumber(p.tracking_number);
      if (!isUPS || !p.tracking_number) continue;
      const info = await getUPSStatus(p.tracking_number);
      if (!info) continue;

      const updateData = { updated_at: new Date().toISOString() };
      if (info.status === 'delivered') {
        updateData['status'] = 'delivered';
        if (info.delivery_date) {
          updateData['actual_delivery_date'] = info.delivery_date;
          updateData['delivered_at'] = info.delivery_date;
        }
      } else if (info.status === 'in_transit' || info.status === 'out_for_delivery') {
        updateData['status'] = 'in_transit';
      }

      await dbUpdate('packages', p.id, updateData);
    }
    logger.info('[UPS Refresh] Completed');
  } catch (e) {
    logger.error('[UPS Refresh] Failed', e);
  }
}

if (process.env.ENABLE_UPS_REFRESH === 'true') {
  cron.schedule('*/30 * * * *', refreshUpsTracking);
  logger.info('[UPS Refresh] Scheduled every 30 minutes');
}

// ====================================
// SERVER STARTUP + SHUTDOWN
// ====================================

process.on('SIGTERM', () => {
  logger.info('[Server] SIGTERM signal received - closing HTTP server');
  server.close(() => {
    logger.info('[Server] HTTP server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  logger.info('[Server] SIGINT signal received - closing HTTP server');
  server.close(() => {
    logger.info('[Server] HTTP server closed');
    process.exit(0);
  });
});

process.on('uncaughtException', (error) => {
  logger.error('[Server] Uncaught Exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('[Server] Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

const server = app.listen(PORT, () => {
  logger.info(`[Server] Zoho Sync Service started`, {
    port: PORT,
    environment: process.env.NODE_ENV,
    nodeVersion: process.version,
    security: {
      ipBlocking: 'enabled',
      rateLimiting: 'enabled',
      authentication: process.env.API_KEY ? 'enabled' : 'DISABLED - CONFIGURE API_KEY!',
      cors: corsOptions.origin ? 'restricted' : 'disabled',
      https: process.env.NODE_ENV === 'production' ? 'required' : 'optional'
    }
  });

  // Verify security configuration
  if (!process.env.API_KEY) {
    logger.error('[Security] WARNING: API_KEY not configured - service is vulnerable!');
  }
  if (!process.env.ALLOWED_ORIGINS) {
    logger.warn('[Security] ALLOWED_ORIGINS not configured - CORS is disabled');
  }
  if (!process.env.ADMIN_API_KEY) {
    logger.warn('[Security] ADMIN_API_KEY not configured - admin endpoints disabled');
  }

  // Initial sync
  syncOrchestrator.runFullSync()
    .then(() => logger.info('[Startup] Initial sync completed'))
    .catch(err => logger.error('[Startup] Initial sync failed:', err));
});

export default app;
