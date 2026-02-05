// src/routes/cron.js
import express from 'express';
import cronDataSyncService from '../services/cronDataSyncService.js';

const router = express.Router();

// Middleware to validate cron job requests (optional security)
const validateCronRequest = (req, res, next) => {
  const cronSecret = process.env.CRON_SECRET || 'your-secret-key';
  const providedSecret = req.headers['x-cron-secret'] || req.query.secret;
  
  if (cronSecret && providedSecret !== cronSecret) {
    return res.status(401).json({ 
      success: false, 
      error: 'Unauthorized cron request' 
    });
  }
  
  next();
};

/**
 * HIGH FREQUENCY SYNC - Every 15 minutes during business hours
 */
router.post('/high-frequency', validateCronRequest, async (req, res) => {
  try {
    console.log('📅 CRON: High frequency sync triggered');
    const result = await cronDataSyncService.highFrequencySync();
    
    res.json({
      success: true,
      type: 'high-frequency',
      result,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('❌ CRON high frequency failed:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      type: 'high-frequency'
    });
  }
});

router.post('/sync-two-years', async (req, res) => {
  try {
    const result = await cronDataSyncService.syncTwoYearsData();
    res.json(result);
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

/**
 * MEDIUM FREQUENCY SYNC - Every 2 hours
 */
router.post('/medium-frequency', validateCronRequest, async (req, res) => {
  try {
    console.log('📅 CRON: Medium frequency sync triggered');
    const result = await cronDataSyncService.mediumFrequencySync();
    
    res.json({
      success: true,
      type: 'medium-frequency',
      result,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('❌ CRON medium frequency failed:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      type: 'medium-frequency'
    });
  }
});

/**
 * LOW FREQUENCY SYNC - Daily at 2 AM
 */
router.post('/low-frequency', validateCronRequest, async (req, res) => {
  try {
    console.log('📅 CRON: Low frequency sync triggered');
    const result = await cronDataSyncService.lowFrequencySync();
    
    res.json({
      success: true,
      type: 'low-frequency',
      result,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('❌ CRON low frequency failed:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      type: 'low-frequency'
    });
  }
});

/**
 * MANUAL SYNC TRIGGER - For testing
 */
router.post('/manual/:type', validateCronRequest, async (req, res) => {
  try {
    const { type } = req.params;
    let result;
    
    switch (type) {
      case 'high':
        result = await cronDataSyncService.highFrequencySync();
        break;
      case 'medium':
        result = await cronDataSyncService.mediumFrequencySync();
        break;
      case 'low':
        result = await cronDataSyncService.lowFrequencySync();
        break;
      default:
        return res.status(400).json({ 
          success: false, 
          error: 'Invalid sync type. Use: high, medium, or low' 
        });
    }
    
    res.json({
      success: true,
      type: `manual-${type}`,
      result,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error(`❌ Manual ${type} sync failed:`, error);
    res.status(500).json({
      success: false,
      error: error.message,
      type: `manual-${type}`
    });
  }
});

/**
 * SYNC STATUS - For monitoring
 */
router.get('/status', (req, res) => {
  const status = cronDataSyncService.getSyncStatus();
  res.json({
    success: true,
    status,
    timestamp: new Date().toISOString()
  });
});

export default router;