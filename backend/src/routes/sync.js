import { Router } from 'express';
import { SyncOrchestrator } from '../services/syncOrchestrator.js';
import { logger } from '../utils/logger.js';

export const syncRouter = Router();

const syncOrchestrator = new SyncOrchestrator();

const authenticate = (req, res, next) => {
  // Temporarily disable API key requirement for testing
  if (process.env.API_KEY) {
    const apiKey = req.headers['x-api-key'];
    
    if (!apiKey || apiKey !== process.env.API_KEY) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
  }
  
  next();
};

syncRouter.use(authenticate);

syncRouter.post('/full', async (req, res) => {
  try {
    logger.info('Manual full sync triggered via API');
    
    const syncPromise = syncOrchestrator.runFullSync();
    
    if (req.query.async === 'true') {
      res.json({
        status: 'started',
        message: 'Full sync started in background',
        timestamp: new Date().toISOString(),
      });
    } else {
      const results = await syncPromise;
      res.json({
        status: 'completed',
        results,
        timestamp: new Date().toISOString(),
      });
    }
  } catch (error) {
    logger.error('Full sync failed:', error);
    res.status(500).json({
      status: 'error',
      error: error.message,
      timestamp: new Date().toISOString(),
    });
  }
});

syncRouter.post('/test/:entity', async (req, res) => {
  const { entity } = req.params;
  const validEntities = ['items', 'customers', 'orders', 'invoices', 'packages'];
  
  if (!validEntities.includes(entity)) {
    return res.status(400).json({
      error: `Invalid entity. Valid entities are: ${validEntities.join(', ')}`,
    });
  }

  try {
    logger.info(`Manual ${entity} TEST sync triggered via API (limit: 5 records)`);
    
    // Override the sync method to add limit
    const syncOrchestrator = new (await import('../services/syncOrchestrator.js')).SyncOrchestrator();
    const service = syncOrchestrator.services[entity];
    
    // Add limit to params
    const originalFetch = service.fetchZohoData.bind(service);
    service.fetchZohoData = async (params) => {
      return originalFetch({ ...params, limit: 5 });
    };
    
    const result = await service.sync();
    
    res.json({
      status: 'completed',
      entity,
      result,
      note: 'Limited to 5 records for testing',
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error(`${entity} test sync failed:`, error);
    res.status(500).json({
      status: 'error',
      entity,
      error: error.message,
      timestamp: new Date().toISOString(),
    });
  }
});

syncRouter.post('/:entity', async (req, res) => {
  const { entity } = req.params;
  const validEntities = ['items', 'customers', 'orders', 'invoices', 'packages'];
  
  if (!validEntities.includes(entity)) {
    return res.status(400).json({
      error: `Invalid entity. Valid entities are: ${validEntities.join(', ')}`,
    });
  }

  try {
    logger.info(`Manual ${entity} sync triggered via API`);
    
    const result = await syncOrchestrator.syncEntity(entity);
    
    res.json({
      status: 'completed',
      entity,
      result,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error(`${entity} sync failed:`, error);
    res.status(500).json({
      status: 'error',
      entity,
      error: error.message,
      timestamp: new Date().toISOString(),
    });
  }
});

syncRouter.get('/status', async (req, res) => {
  try {
    const status = await syncOrchestrator.getLastSyncStatus();
    
    res.json({
      status: 'ok',
      lastSyncs: status,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error('Failed to get sync status:', error);
    res.status(500).json({
      status: 'error',
      error: error.message,
      timestamp: new Date().toISOString(),
    });
  }
});

syncRouter.get('/test', async (req, res) => {
  try {
    const { query: dbQuery, insert, COMPANY_ID } = await import('../config/database.js');

    // Test 1: Check if we can read from the database
    const { rows: testData } = await dbQuery('SELECT * FROM sync_logs LIMIT 1');

    // Test 2: Try inserting a test sync log
    const insertData = await insert('sync_logs', {
      company_id: COMPANY_ID,
      entity_type: 'test',
      status: 'success',
      details: JSON.stringify({ test: true }),
      synced_at: new Date().toISOString(),
    });

    // Test 3: Check Zoho connection
    const { zohoAuth } = await import('../config/zoho.js');
    const token = await zohoAuth.getAccessToken();

    res.json({
      status: 'success',
      tests: {
        database_read: 'passed',
        database_write: 'passed',
        zoho_auth: token ? 'passed' : 'failed',
      },
      inserted_record: insertData,
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: 'Test failed',
      error: error.message,
    });
  }
});

syncRouter.get('/logs', async (req, res) => {
  try {
    const { limit = 50, entity, status } = req.query;

    const { query: dbQuery } = await import('../config/database.js');

    const conditions = [];
    const params = [];
    let paramIdx = 1;

    if (entity) {
      conditions.push(`entity_type = $${paramIdx++}`);
      params.push(entity);
    }
    if (status) {
      conditions.push(`status = $${paramIdx++}`);
      params.push(status);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    params.push(parseInt(limit));

    const { rows: data } = await dbQuery(
      `SELECT * FROM sync_logs ${whereClause} ORDER BY created_at DESC LIMIT $${paramIdx}`,
      params
    );

    res.json({
      status: 'ok',
      logs: data,
      count: data.length,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error('Failed to get sync logs:', error);
    res.status(500).json({
      status: 'error',
      error: error.message,
      timestamp: new Date().toISOString(),
    });
  }
});