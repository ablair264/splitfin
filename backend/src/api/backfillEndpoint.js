// server/src/api/backfillEndpoint.js
// Temporary endpoint to trigger the backfill process

import express from 'express';
import admin from 'firebase-admin';
import { backfillSalesOrders } from '../scripts/backfillSalesOrdersWithLineItems.js';
import { cleanupDuplicateLineItems } from '../scripts/cleanupDuplicateLineItems.js';

const router = express.Router();

// GET endpoint to check status
router.get('/backfill-orders', async (req, res) => {
  res.json({
    message: 'Backfill endpoint ready',
    usage: 'POST to this endpoint to start backfill',
    options: {
      limit: 'Number of orders to process (default: all)',
      startDate: 'YYYY-MM-DD format',
      endDate: 'YYYY-MM-DD format',
      force: 'Boolean to reprocess orders that already have line items'
    }
  });
});

// POST endpoint to trigger backfill
router.post('/backfill-orders', async (req, res) => {
  try {
    // Check for auth token or implement your auth here
    const authToken = req.headers.authorization;
    if (!authToken || authToken !== `Bearer ${process.env.ADMIN_SECRET_TOKEN}`) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const options = {
      limit: req.body.limit ? parseInt(req.body.limit) : undefined,
      startDate: req.body.startDate,
      endDate: req.body.endDate,
      force: req.body.force === true
    };

    // Start the backfill process
    console.log('🚀 Starting backfill via API endpoint...');
    res.json({ 
      message: 'Backfill process started',
      options,
      note: 'Check server logs for progress'
    });

    // Run backfill asynchronously (don't wait for completion)
    backfillSalesOrders(options)
      .then(result => {
        console.log('✅ Backfill completed:', result);
      })
      .catch(error => {
        console.error('❌ Backfill failed:', error);
      });

  } catch (error) {
    console.error('API endpoint error:', error);
    res.status(500).json({ error: error.message });
  }
});

// DELETE endpoint to stop backfill
router.delete('/backfill-orders', async (req, res) => {
  try {
    // Check for auth token
    const authToken = req.headers.authorization;
    if (!authToken || authToken !== `Bearer ${process.env.ADMIN_SECRET_TOKEN}`) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Set kill switch in Firebase
    const db = admin.firestore();
    await db.collection('sync_metadata').doc('sales_orders_backfill').set({
      killSwitch: true,
      stoppedAt: admin.firestore.FieldValue.serverTimestamp(),
      stoppedBy: 'API'
    }, { merge: true });

    res.json({ 
      message: 'Kill switch activated',
      note: 'The backfill process will stop at the next order'
    });

  } catch (error) {
    console.error('API endpoint error:', error);
    res.status(500).json({ error: error.message });
  }
});

// POST endpoint to cleanup duplicate line items
router.post('/cleanup-duplicate-line-items', async (req, res) => {
  try {
    // Check for auth token
    const authToken = req.headers.authorization;
    if (!authToken || authToken !== `Bearer ${process.env.ADMIN_SECRET_TOKEN}`) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    console.log('🧹 Starting duplicate line items cleanup via API endpoint...');
    res.json({ 
      message: 'Cleanup process started',
      note: 'Check server logs for progress'
    });

    // Run cleanup asynchronously
    cleanupDuplicateLineItems()
      .then(result => {
        console.log('✅ Cleanup completed:', result);
      })
      .catch(error => {
        console.error('❌ Cleanup failed:', error);
      });

  } catch (error) {
    console.error('API endpoint error:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
