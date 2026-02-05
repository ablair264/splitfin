// server/src/routes/products.js (update your existing file)
import express from 'express';
import productSyncService from '../services/productSyncService.js';

const router = express.Router();

// Manual product sync endpoint
router.post('/sync-from-zoho', async (req, res) => {
  try {
    console.log('📦 Manual product sync requested');
    
    // Check if sync is already running
    const status = await productSyncService.getSyncStatus();
    if (status && status.status === 'running') {
      return res.status(409).json({
        success: false,
        message: 'Sync already in progress'
      });
    }
    
    // Run the sync
    const result = await productSyncService.syncProductsToFirebase();
    
    res.json({
      success: true,
      message: `Successfully synced ${result.count} products`,
      count: result.count
    });
    
  } catch (error) {
    console.error('Product sync error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Get sync status
router.get('/sync-status', async (req, res) => {
  try {
    const status = await productSyncService.getSyncStatus();
    res.json({
      success: true,
      data: status
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

export default router;