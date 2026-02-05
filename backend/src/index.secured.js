import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import cron from 'node-cron';
import { logger } from './utils/logger.js';
import { syncRouter } from './routes/sync.js';
import { healthRouter } from './routes/health.js';
import { shopifyRouter } from './routes/shopify.js';
import { shopifyAppRouter } from './routes/shopify-app.js';
import { trackingRouter } from './routes/tracking.js';
import { SyncOrchestrator } from './services/syncOrchestrator.js';

// Import security middleware
import { ipBlocker, createBlocklistAPI } from './middleware/ipBlocker.js';
import { rateLimiter } from './middleware/rateLimiter.js';
import { apiKeyAuth } from './middleware/auth.js';
import { 
  securityHeaders, 
  secureCors, 
  sanitizeRequest, 
  secureErrorHandler 
} from './middleware/security.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// ====================================
// SECURITY LAYER 1: IP Blocking & Rate Limiting
// ====================================

// Apply IP blocker first to reject known malicious IPs immediately
app.use(ipBlocker);

// Apply rate limiting to prevent abuse
app.use(rateLimiter);

// ====================================
// SECURITY LAYER 2: Headers & CORS
// ====================================

// Apply security headers
app.use(securityHeaders());

// Apply secure CORS configuration
const corsOptions = secureCors();
app.use(cors(corsOptions));

// ====================================
// SECURITY LAYER 3: Request Processing
// ====================================

// Sanitize requests and add request ID
app.use(sanitizeRequest);

// Parse JSON with size limit
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// ====================================
// SECURITY LAYER 4: Request Logging
// ====================================

// Log all requests for audit trail
app.use((req, res, next) => {
  const start = Date.now();
  
  res.on('finish', () => {
    const duration = Date.now() - start;
    const logLevel = res.statusCode >= 400 ? 'warn' : 'info';
    
    logger[logLevel](`[Request] ${req.method} ${req.path} - ${res.statusCode} - ${duration}ms`, {
      ip: req.ip,
      userAgent: req.headers['user-agent'],
      requestId: req.id,
      query: req.query,
      statusCode: res.statusCode,
      duration
    });
  });
  
  next();
});

// ====================================
// ROUTES (Protected by Authentication)
// ====================================

// Public health check (basic)
app.get('/api/health', healthRouter);

// Protected health check (detailed)
app.use('/api/health/detailed', apiKeyAuth, healthRouter);

// Protected sync endpoints
app.use('/api/sync', apiKeyAuth, syncRouter);

// Protected Shopify endpoints
app.use('/api/shopify', apiKeyAuth, shopifyRouter);
app.use('/shopify-app', apiKeyAuth, shopifyAppRouter);

// Protected tracking endpoints
app.use('/api/tracking', apiKeyAuth, trackingRouter);

// Admin endpoints for security management (requires special admin key)
if (process.env.ADMIN_API_KEY) {
  app.use('/api/admin/security', createBlocklistAPI(process.env.ADMIN_API_KEY));
}

// ====================================
// 404 HANDLER
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
// SERVER STARTUP
// ====================================

// Graceful shutdown handler
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

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  logger.error('[Server] Uncaught Exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('[Server] Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

// Start server
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
  
  // Run initial sync
  syncOrchestrator.runFullSync()
    .then(() => logger.info('[Startup] Initial sync completed'))
    .catch(err => logger.error('[Startup] Initial sync failed:', err));
});

export default app;
