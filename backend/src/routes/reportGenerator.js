// server/src/routes/reportGenerator.js
import express from 'express';
import admin from 'firebase-admin';
import reportGeneratorService from '../services/reportGeneratorService.js';
import collectionDashboardService from '../services/collectionDashboardService.js';

const router = express.Router();

/**
 * Middleware to validate user authentication
 */
async function authenticateUser(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required'
      });
    }

    const token = authHeader.split('Bearer ')[1];
    const decodedToken = await admin.auth().verifyIdToken(token);
    req.user = decodedToken;
    next();
  } catch (error) {
    console.error('Auth error:', error);
    res.status(401).json({
      success: false,
      error: 'Invalid authentication token'
    });
  }
}

/**
 * Middleware to get user context
 */
async function getUserContext(req, res, next) {
  try {
    const userId = req.body.userId || req.query.userId || req.user.uid;
    
    if (!userId) {
      return res.status(400).json({
        success: false,
        error: 'User ID is required'
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
      name: userData.name,
      email: userData.email,
      zohospID: userData.zohospID,
      agentID: userData.agentID
    };
    
    next();
  } catch (error) {
    console.error('User context error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get user context'
    });
  }
}

/**
 * Generate a new report based on configuration
 * POST /api/report-generator/generate
 */
router.post('/generate', authenticateUser, getUserContext, async (req, res) => {
  try {
    const { config } = req.body;
    const { userContext } = req;

    console.log(`📊 Generating report: ${config.name} for user ${userContext.name}`);

    // Validate config
    if (!config || !config.name || !config.sections) {
      return res.status(400).json({
        success: false,
        error: 'Invalid report configuration'
      });
    }

    // Validate date range
    if (config.dateRange === 'custom' && (!config.customDateRange || !config.customDateRange.start || !config.customDateRange.end)) {
      return res.status(400).json({
        success: false,
        error: 'Custom date range requires start and end dates'
      });
    }

    // Generate the report
    const reportData = await reportGeneratorService.generateReport(config, userContext);

    res.json({
      success: true,
      data: reportData,
      message: 'Report generated successfully'
    });

  } catch (error) {
    console.error('❌ Report generation error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to generate report',
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

/**
 * Save a report configuration
 * POST /api/report-generator/save
 */
router.post('/save', authenticateUser, getUserContext, async (req, res) => {
  try {
    const { config } = req.body;
    const { userContext } = req;

    if (!config || !config.name) {
      return res.status(400).json({
        success: false,
        error: 'Report configuration and name are required'
      });
    }

    const savedReport = await reportGeneratorService.saveReportConfig(config, userContext);

    res.json({
      success: true,
      data: savedReport,
      message: 'Report configuration saved successfully'
    });

  } catch (error) {
    console.error('❌ Save report error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to save report configuration'
    });
  }
});

/**
 * Get saved report configurations for a user
 * GET /api/report-generator/saved?userId=xxx
 */
router.get('/saved', authenticateUser, getUserContext, async (req, res) => {
  try {
    const { userContext } = req;

    const savedReports = await reportGeneratorService.getSavedReports(userContext.userId);

    res.json({
      success: true,
      data: savedReports
    });

  } catch (error) {
    console.error('❌ Get saved reports error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to get saved reports'
    });
  }
});

/**
 * Delete a saved report configuration
 * DELETE /api/report-generator/saved/:reportId
 */
router.delete('/saved/:reportId', authenticateUser, getUserContext, async (req, res) => {
  try {
    const { reportId } = req.params;
    const { userContext } = req;

    await reportGeneratorService.deleteReportConfig(reportId, userContext.userId);

    res.json({
      success: true,
      message: 'Report configuration deleted successfully'
    });

  } catch (error) {
    console.error('❌ Delete report error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to delete report configuration'
    });
  }
});

/**
 * Get filter options for report configuration
 * GET /api/report-generator/filter-options
 */
router.get('/filter-options', authenticateUser, getUserContext, async (req, res) => {
  try {
    const { userContext } = req;

    const filterOptions = await reportGeneratorService.getFilterOptions(userContext);

    res.json({
      success: true,
      data: filterOptions
    });

  } catch (error) {
    console.error('❌ Get filter options error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to get filter options'
    });
  }
});

/**
 * Generate report template based on user role
 * GET /api/report-generator/template
 */
router.get('/template', authenticateUser, getUserContext, async (req, res) => {
  try {
    const { userContext } = req;

    const template = reportGeneratorService.getReportTemplate(userContext.role);

    res.json({
      success: true,
      data: template
    });

  } catch (error) {
    console.error('❌ Get template error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to get report template'
    });
  }
});

/**
 * Health check for report generator service
 * GET /api/report-generator/health
 */
router.get('/health', async (req, res) => {
  try {
    const health = await reportGeneratorService.healthCheck();
    
    res.json({
      success: true,
      data: health,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

export default router;