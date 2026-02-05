// server/src/routes/reports.js - UPDATED TO USE COLLECTION-BASED SERVICE
import express from 'express';
import zohoReportsService from '../services/zohoReportsService.js';
import admin from 'firebase-admin';
import collectionDashboardService from '../services/collectionDashboardService.js';

const router = express.Router();

// Middleware to validate date range
function validateDateRange(req, res, next) {
  const allowedRanges = [
    'today', '7_days', '30_days', '90_days', 'quarter', 'year', '1_year',
    'this_month', 'last_month', 'this_year', 'custom'
  ];
  const { dateRange } = req.query;
  
  if (dateRange && !allowedRanges.includes(dateRange)) {
    return res.status(400).json({
      success: false,
      error: `Invalid date range. Must be one of: ${allowedRanges.join(', ')}`
    });
  }
  
  // Validate custom date range
  if (dateRange === 'custom') {
    const { startDate, endDate } = req.query;
    if (!startDate || !endDate) {
      return res.status(400).json({
        success: false,
        error: 'Custom date range requires startDate and endDate parameters'
      });
    }
  }
  
  next();
}

/**
 * Middleware to get user context and validate access
 */
async function getUserContext(req, res, next) {
  try {
    const { userId } = req.query;
    
    if (!userId) {
      return res.status(400).json({
        success: false,
        error: 'userId is required'
      });
    }
    
    const db = admin.firestore();
    const userDoc = await db.collection('users').doc(userId).get();
    
    if (!userDoc.exists) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }
    
    const userData = userDoc.data();
    req.userContext = {
      userId,
      role: userData.role,
      agentCRMId: userData.agentID,           // For Firebase customer filtering
      zohospID: userData.zohospID,            // For Inventory API filtering
      email: userData.email,
      name: userData.name
    };
    
    next();
  } catch (error) {
    console.error('❌ Error getting user context:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to validate user access'
    });
  }
}

/**
 * Middleware to check role permissions
 */
function requireRole(allowedRoles) {
  return (req, res, next) => {
    if (!req.userContext) {
      return res.status(401).json({
        success: false,
        error: 'User context required'
      });
    }
    
    if (!allowedRoles.includes(req.userContext.role)) {
      return res.status(403).json({
        success: false,
        error: `Access denied. Required roles: ${allowedRoles.join(', ')}`
      });
    }
    
    next();
  };
}

/**
 * MAIN ENDPOINT: Get comprehensive dashboard data from collections
 * This now uses the collection-based service instead of cached data
 */
router.get('/dashboard', validateDateRange, getUserContext, async (req, res) => {
  try {
    const { dateRange = '30_days', startDate, endDate } = req.query;
    const { userId } = req.userContext;
    
    const customDateRange = dateRange === 'custom' 
      ? { start: startDate, end: endDate }
      : null;
    
    console.log(`📊 Dashboard request: User ${userId}, Range: ${dateRange}`);
    
    // Use the collection-based dashboard service
    const dashboardData = await collectionDashboardService.getDashboardData(
      userId, 
      dateRange, 
      customDateRange
    );
    
    // The collectionDashboardService already returns properly structured data
    // No normalization needed
    
    // Log data structure for debugging
    console.log('📊 Dashboard data structure:', {
      hasMetrics: !!dashboardData.metrics,
      ordersCount: dashboardData.orders?.length || 0,
      invoicesCount: dashboardData.invoices?.all?.length || 0,
      brandsCount: dashboardData.performance?.brands?.length || 0,
      hasCommission: !!dashboardData.commission,
      hasAgentPerformance: !!dashboardData.agentPerformance,
      role: dashboardData.role
    });
    
    res.json({
      success: true,
      data: dashboardData,
      userContext: {
        role: req.userContext.role,
        userId: req.userContext.userId,
        name: req.userContext.name
      },
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('❌ Error fetching dashboard data:', error);
    
    // Check if it was a timeout error
    if (error.message && error.message.includes('timeout')) {
      return res.status(408).json({
        success: false,
        error: 'Dashboard query timed out. Try a smaller date range.',
        suggestion: 'Use 7_days or today for faster loading',
        details: process.env.NODE_ENV === 'development' ? error.stack : undefined
      });
    }
    
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch dashboard data',
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

/**
 * Dashboard health check endpoint
 */
router.get('/dashboard/health', async (req, res) => {
  try {
    const health = await collectionDashboardService.healthCheck();
    res.json({
      success: true,
      health,
      dataStrategy: 'collection-based queries',
      features: [
        'Real-time date filtering',
        'Agent-specific data isolation',
        'Role-based access control',
        'Direct collection queries'
      ],
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Force refresh data - triggers CRON sync manually
 */
router.post('/dashboard/refresh', getUserContext, async (req, res) => {
  try {
    const { syncType = 'medium' } = req.body;
    
    // Import cronDataSyncService dynamically to avoid circular dependencies
    const { default: cronDataSyncService } = await import('../services/cronDataSyncService.js');
    
    let result;
    switch (syncType) {
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
      message: 'Data refresh initiated',
      syncType,
      result,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('❌ Error refreshing data:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Get raw collection data with filters (for debugging)
 */
router.get('/collections/:collection', validateDateRange, getUserContext, async (req, res) => {
  try {
    const { collection } = req.params;
    const { dateRange = '30_days', startDate, endDate, limit = 100 } = req.query;
    
    const validCollections = ['sales_orders', 'invoices', 'sales_transactions', 'customers', 'products'];
    if (!validCollections.includes(collection)) {
      return res.status(400).json({
        success: false,
        error: `Invalid collection. Must be one of: ${validCollections.join(', ')}`
      });
    }
    
    const db = admin.firestore();
    const customDateRange = dateRange === 'custom' 
      ? { start: startDate, end: endDate }
      : null;
    
    const { startDate: startISO, endDate: endISO } = collectionDashboardService.getDateRange(dateRange, customDateRange);
    
    let query = db.collection(collection);
    
    // Apply date filters based on collection
    if (collection === 'sales_orders') {
      query = query.where('date', '>=', startISO.toISOString())
                   .where('date', '<=', endISO.toISOString());
    } else if (collection === 'invoices') {
      query = query.where('date', '>=', startISO.toISOString())
                   .where('date', '<=', endISO.toISOString());
    } else if (collection === 'sales_transactions') {
      query = query.where('order_date', '>=', startISO.toISOString())
                   .where('order_date', '<=', endISO.toISOString());
    }
    
    // Apply agent filter if sales agent
    if (req.userContext.role === 'salesAgent' && req.userContext.zohospID) {
      if (collection === 'sales_orders' || collection === 'sales_transactions') {
        query = query.where('salesperson_id', '==', req.userContext.zohospID);
      }
    }
    
    // Apply limit
    query = query.limit(parseInt(limit));
    
    const snapshot = await query.get();
    const data = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
    
    res.json({
      success: true,
      collection,
      count: data.length,
      data,
      filters: {
        dateRange,
        startDate: startISO,
        endDate: endISO,
        role: req.userContext.role,
        agentId: req.userContext.zohospID
      },
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('❌ Error fetching collection data:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Keep existing endpoints for specific reports that need direct Zoho API access

router.get('/purchase-orders', 
  validateDateRange, 
  getUserContext, 
  async (req, res) => {
    try {
      const { status = 'open' } = req.query;
      
      const purchaseOrders = await zohoReportsService.getPurchaseOrders(status);
      
      res.json({
        success: true,
        data: {
          purchaseorders: purchaseOrders,
          summary: {
            total: purchaseOrders.length,
            totalValue: purchaseOrders.reduce((sum, po) => 
              sum + parseFloat(po.total || 0), 0
            )
          }
        },
        dataSource: 'Zoho Inventory API',
        timestamp: new Date().toISOString()
      });
      
    } catch (error) {
      console.error('❌ Error fetching purchase orders:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to fetch purchase orders'
      });
    }
  }
);

/**
 * Get sync status for collections
 */
router.get('/sync-status', getUserContext, async (req, res) => {
  try {
    const db = admin.firestore();
    
    // Get last sync metadata
    const syncMeta = await db.collection('sync_metadata').doc('last_full_sync').get();
    const syncData = syncMeta.exists ? syncMeta.data() : null;
    
    // Get collection counts
    const [ordersCount, invoicesCount, transactionsCount, customersCount] = await Promise.all([
      db.collection('sales_orders').count().get(),
      db.collection('invoices').count().get(),
      db.collection('sales_transactions').count().get(),
      db.collection('customers').count().get()
    ]);
    
    res.json({
      success: true,
      lastSync: syncData,
      collections: {
        orders: ordersCount.data().count,
        invoices: invoicesCount.data().count,
        sales_transactions: transactionsCount.data().count,
        customers: customersCount.data().count
      },
      dataStrategy: 'collection-based with CRON sync',
      syncFrequency: {
        high: 'Every 15 minutes (today\'s data)',
        medium: 'Every 2 hours (30 days)',
        low: 'Daily at 2 AM (full sync)'
      },
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('❌ Error getting sync status:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Enhanced metadata endpoint
 */
router.get('/metadata', (req, res) => {
  res.json({
    success: true,
    data: {
      dateRanges: [
        { value: 'today', label: 'Today' },
        { value: '7_days', label: 'Last 7 days' },
        { value: '30_days', label: 'Last 30 days' },
        { value: 'quarter', label: 'Last Quarter' },
        { value: 'year', label: 'Last Year' },
        { value: 'this_month', label: 'This month' },
        { value: 'last_month', label: 'Last month' },
        { value: 'this_year', label: 'This year' },
        { value: 'custom', label: 'Custom Date Range' }
      ],
      roles: [
        { value: 'brandManager', label: 'Brand Manager' },
        { value: 'salesAgent', label: 'Sales Agent' },
        { value: 'admin', label: 'Administrator' }
      ],
      dataSource: 'Firestore Collections (CRON-synced from Zoho)',
      dataStrategy: 'Collection-based queries with date filtering',
      features: [
        'Real-time date range filtering',
        'Agent-specific data isolation',
        'Role-based access control',
        'No API rate limits',
        'Offline capability'
      ],
      endpoints: {
        dashboard: '/api/reports/dashboard',
        dashboardHealth: '/api/reports/dashboard/health',
        dashboardRefresh: '/api/reports/dashboard/refresh',
        collections: '/api/reports/collections/:collection',
        syncStatus: '/api/reports/sync-status',
        metadata: '/api/reports/metadata'
      }
    },
    timestamp: new Date().toISOString()
  });
});


router.get('/dashboard/overview', validateDateRange, getUserContext, async (req, res) => {
  try {
    const { dateRange = '30_days' } = req.query;
    const { userId } = req.userContext;
    const data = await collectionDashboardService.getOverviewData(userId, dateRange);
    res.json({ success: true, data });
  } catch (error) {
    console.error('Error fetching overview data:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/dashboard/orders', validateDateRange, getUserContext, async (req, res) => {
  try {
    const { dateRange = '30_days' } = req.query;
    const { userId } = req.userContext;
    const data = await collectionDashboardService.getOrdersData(userId, dateRange);
    res.json({ success: true, data });
  } catch (error) {
    console.error('Error fetching orders data:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/dashboard/revenue', validateDateRange, getUserContext, async (req, res) => {
  try {
    const { dateRange = '30_days' } = req.query;
    const { userId } = req.userContext;
    const data = await collectionDashboardService.getRevenueData(userId, dateRange);
    res.json({ success: true, data });
  } catch (error) {
    console.error('Error fetching revenue data:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/dashboard/invoices', validateDateRange, getUserContext, async (req, res) => {
  try {
    const { dateRange = '30_days' } = req.query;
    const { userId } = req.userContext;
    const data = await collectionDashboardService.getInvoicesData(userId, dateRange);
    res.json({ success: true, data });
  } catch (error) {
    console.error('Error fetching invoices data:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/dashboard/brands', validateDateRange, getUserContext, async (req, res) => {
  try {
    const { dateRange = '30_days' } = req.query;
    const { userId } = req.userContext;
    const data = await collectionDashboardService.getBrandsData(userId, dateRange);
    res.json({ success: true, data });
  } catch (error) {
    console.error('Error fetching brands data:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/dashboard/forecasting', validateDateRange, getUserContext, async (req, res) => {
  try {
    const { dateRange = '30_days' } = req.query;
    const { userId } = req.userContext;
    const data = await collectionDashboardService.getForecastingData(userId, dateRange);
    res.json({ success: true, data });
  } catch (error) {
    console.error('Error fetching forecasting data:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});
export default router;