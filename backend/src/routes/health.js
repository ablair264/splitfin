import { Router } from 'express';
import { query, healthCheck } from '../config/database.js';
import { zohoAuth } from '../config/zoho.js';

export const healthRouter = Router();

healthRouter.get('/', async (req, res) => {
  const health = {
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV,
  };

  try {
    await healthCheck();
    health.database = 'ok';

    const zohoToken = await zohoAuth.getAccessToken();
    health.zoho = zohoToken ? 'ok' : 'error';
  } catch (error) {
    health.status = 'degraded';
    health.error = error.message;
  }

  res.status(health.status === 'ok' ? 200 : 503).json(health);
});

healthRouter.get('/detailed', async (req, res) => {
  if (req.headers['x-api-key'] !== process.env.API_KEY) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const health = {
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV,
    checks: {},
  };

  try {
    const { rows: lastSync } = await query(
      'SELECT * FROM sync_logs ORDER BY created_at DESC LIMIT 5'
    );

    health.checks.database = {
      status: 'ok',
      lastSyncs: lastSync,
    };

    try {
      const zohoToken = await zohoAuth.getAccessToken();
      health.checks.zoho = {
        status: zohoToken ? 'ok' : 'error',
        tokenExpiry: zohoAuth.tokenExpiry,
      };
    } catch (zohoError) {
      health.checks.zoho = {
        status: 'error',
        error: zohoError.message,
      };
    }

    health.checks.memory = {
      used: process.memoryUsage(),
    };

  } catch (error) {
    health.status = 'error';
    health.checks.database = { status: 'error', error: error.message };
  }

  res.status(health.status === 'ok' ? 200 : 503).json(health);
});
