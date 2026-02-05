// server/src/routes/ai-insights.js
import express from 'express';
import admin from 'firebase-admin';
import { 
  generateAIInsights, 
  generateCardInsights, 
  generateDrillDownInsights,
  generateComparativeInsights,
  generateSeasonalInsights,
  generateCustomerInsights,
  generatePurchaseOrderInsights,
  generateProductPurchaseInsights,
  validatePurchaseAdjustments,
  // Add these missing imports:
  generateEnhancedCardInsights,
  fetchSearchTrends,
  generateEnhancedForecast,
  generateAgentInsights
} from '../services/aiAnalyticsService.js';
import { fetchComprehensiveData } from '../api/zoho.js';

const router = express.Router();

/**
 * Rate limiting for AI requests
 */
const aiRequestLimiter = new Map();
const AI_REQUEST_LIMIT = 15;
const AI_WINDOW_MS = 60 * 60 * 1000; // 1 hour window

function checkAIRateLimit(req, res, next) {
  const userId = req.headers['x-user-id'] || req.userId || 'anonymous';
  const now = Date.now();
  
  if (!aiRequestLimiter.has(userId)) {
    aiRequestLimiter.set(userId, { count: 1, window: now });
    return next();
  }
  
  const userLimit = aiRequestLimiter.get(userId);
  
  // Reset window if expired
  if (now - userLimit.window > AI_WINDOW_MS) {
    userLimit.count = 1;
    userLimit.window = now;
    return next();
  }
  
  // Check limit
  if (userLimit.count >= AI_REQUEST_LIMIT) {
    return res.status(429).json({
      success: false,
      error: 'AI request limit exceeded. Please try again later.',
      retryAfter: Math.ceil((AI_WINDOW_MS - (now - userLimit.window)) / 1000 / 60),
      currentUsage: userLimit.count,
      maxRequests: AI_REQUEST_LIMIT
    });
  }
  
  userLimit.count++;
  next();
}

/**
 * Authentication middleware
 */
async function validateUserForAI(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader) {
      console.warn('⚠️ AI request without authentication - development mode');
      req.userId = 'development-user';
      req.userContext = { role: 'brandManager', name: 'Development User' };
      return next();
    }

    if (authHeader.startsWith('Bearer ')) {
      const token = authHeader.split('Bearer ')[1];
      
      try {
        // Attempt to verify the Firebase token
        const decodedToken = await admin.auth().verifyIdToken(token);
        req.userId = decodedToken.uid;
        
        // Get user context from Firestore
        const db = admin.firestore();
        const userDoc = await db.collection('users').doc(req.userId).get();
        
        if (userDoc.exists) {
          req.userContext = userDoc.data();
          console.log(`🤖 AI request from: ${req.userContext.name} (${req.userContext.role})`);
        } else {
          req.userContext = { role: 'user', name: 'Unknown User' };
        }
        
      } catch (tokenError) {
        console.warn('⚠️ Invalid token, using development mode:', tokenError.message);
        req.userId = 'development-user';
        req.userContext = { role: 'brandManager', name: 'Development User' };
      }
    }
    
    next();
  } catch (error) {
    console.error('❌ Error in AI authentication:', error);
    req.userId = 'development-user';
    req.userContext = { role: 'brandManager', name: 'Development User' };
    next();
  }
}

/**
 * Health check endpoint
 */
router.get('/health', (req, res) => {
  const googleApiConfigured = !!process.env.GOOGLE_API_KEY;
  
  res.json({
    success: true,
    message: 'AI Insights service is operational',
    status: googleApiConfigured ? 'fully_operational' : 'limited_mode',
    aiEnabled: googleApiConfigured,
    googleApiConfigured,
    features: {
      cardInsights: googleApiConfigured,
      dashboardInsights: googleApiConfigured,
      drillDownInsights: googleApiConfigured,
      comparativeInsights: googleApiConfigured,
      seasonalInsights: googleApiConfigured,
      purchaseOrderInsights: googleApiConfigured,
      comprehensiveData: true
    },
    businessIntelligence: {
      dmBrandsContext: true,
      brandPortfolioAnalysis: true,
      luxuryImportFocus: true,
      agentPerformanceAnalysis: true,
      seasonalPlanningSupport: true,
      cashFlowAnalysis: true,
      customerSegmentation: true,
      inventoryOptimization: true
    },
    dataIntegration: {
      firebase: {
        salesTransactions: true,
        salesOrders: true,
        customerData: true,
        invoices: true,
        purchaseOrders: true
      },
      zoho: {
        inventory: true,
        contacts: true,
        crm: true
      }
    },
    rateLimit: {
      requestsPerHour: AI_REQUEST_LIMIT,
      windowMinutes: AI_WINDOW_MS / 1000 / 60
    },
    endpoints: [
      'GET /api/ai-insights/health',
      'POST /api/ai-insights/card-insights',
      'POST /api/ai-insights/dashboard-insights',
      'POST /api/ai-insights/drill-down-insights',
      'POST /api/ai-insights/comparative-insights',
      'POST /api/ai-insights/seasonal-insights',
      'POST /api/ai-insights/customer-insights',
      'POST /api/ai-insights/purchase-order-insights',
      'POST /api/ai-insights/product-purchase-insights',
      'POST /api/ai-insights/validate-adjustments',
      'GET /api/ai-insights/usage-stats'
    ],
    timestamp: new Date().toISOString()
  });
});

/**
 * Card-specific insights with comprehensive data
 */
router.post('/card-insights', validateUserForAI, checkAIRateLimit, async (req, res) => {
  try {
    const { cardType, cardData, fullDashboardData } = req.body;
    
    if (!cardType) {
      return res.status(400).json({
        success: false,
        error: 'cardType is required',
        supportedTypes: ['revenue', 'orders', 'agents', 'customers', 'products', 'brands', 'invoices', 'aov']
      });
    }

    console.log(`🤖 Generating AI insights for ${cardType} card (User: ${req.userContext?.name})`);
    
    // For purchase-related cards, fetch comprehensive data
    let enrichedDashboardData = fullDashboardData;
    if (cardType === 'orders' || cardType === 'revenue' || cardType === 'aov') {
      try {
        const brandId = fullDashboardData.selectedBrand || 'all';
        if (brandId !== 'all') {
          const comprehensiveData = await fetchComprehensiveData(brandId, fullDashboardData.selectedBrandName);
          enrichedDashboardData = {
            ...fullDashboardData,
            comprehensiveData
          };
        }
      } catch (dataError) {
        console.warn('Could not fetch comprehensive data:', dataError.message);
      }
    }
    
    const insights = await generateCardInsights(cardType, cardData, enrichedDashboardData);
    
    res.json({
      success: true,
      data: insights,
      cardType,
      analysisLevel: 'comprehensive_business_intelligence',
      businessContext: 'dm_brands_luxury_imports',
      generatedAt: new Date().toISOString(),
      userRole: req.userContext?.role || 'unknown',
      aiProvider: 'google_gemini_with_dm_brands_context'
    });
    
  } catch (error) {
    console.error(`❌ Error generating ${req.body?.cardType || 'unknown'} AI insights:`, error);
    
    res.status(500).json({
      success: false,
      error: 'AI insights temporarily unavailable',
      fallback: {
        insight: `Analysis for ${req.body?.cardType || 'this metric'} is temporarily unavailable.`,
        trend: "Unable to analyze current trends",
        action: "Please try again in a few minutes",
        priority: "medium",
        impact: "Limited impact on immediate operations"
      },
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * Comprehensive dashboard insights
 */
router.post('/dashboard-insights', validateUserForAI, checkAIRateLimit, async (req, res) => {
  try {
    const { dashboardData } = req.body;
    
    if (!dashboardData) {
      return res.status(400).json({
        success: false,
        error: 'Dashboard data is required for comprehensive analysis'
      });
    }
    
    console.log(`🤖 Generating comprehensive dashboard insights for user ${req.userId}`);
    
    const insights = await generateAIInsights(dashboardData);
    
    res.json({
      success: true,
      data: insights,
      analysisType: 'comprehensive_dashboard_intelligence',
      businessContext: 'dm_brands_european_luxury_imports',
      includedAnalysis: [
        'executive_summary',
        'key_performance_drivers', 
        'strategic_recommendations',
        'critical_alerts',
        'growth_opportunities'
      ],
      generatedAt: new Date().toISOString(),
      userRole: req.userContext?.role
    });
    
  } catch (error) {
    console.error('❌ Error generating comprehensive dashboard insights:', error);
    res.status(500).json({
      success: false,
      error: 'Comprehensive analysis temporarily unavailable',
      fallback: {
        summary: "Dashboard analysis is temporarily unavailable.",
        keyDrivers: ["System temporarily unavailable"],
        recommendations: ["Please try again in a few minutes"],
        criticalAlerts: [],
        opportunities: ["Contact support if issues persist"]
      }
    });
  }
});

// Continuing ai-insights.js...

/**
 * Purchase order insights with comprehensive data
 */
router.post('/purchase-order-insights', validateUserForAI, checkAIRateLimit, async (req, res) => {
  try {
    const { brand, suggestions, historicalSales, marketData } = req.body;
    
    if (!brand || !suggestions) {
      return res.status(400).json({
        success: false,
        error: 'Brand and suggestions are required for purchase order analysis'
      });
    }
    
    console.log(`🤖 Generating purchase order insights for ${brand} (User: ${req.userContext?.name})`);
    
    // If historical sales not provided, fetch comprehensive data
    let enhancedHistoricalSales = historicalSales;
    if (!historicalSales || Object.keys(historicalSales).length === 0) {
      try {
        const brandId = brand.toLowerCase().replace(/\s+/g, '_');
        const comprehensiveData = await fetchComprehensiveData(brandId, brand);
        
        enhancedHistoricalSales = {
          totalRevenue: comprehensiveData.salesTransactions.totalRevenue,
          totalUnits: comprehensiveData.salesTransactions.totalUnits,
          topProducts: comprehensiveData.salesTransactions.topProducts,
          seasonalPattern: comprehensiveData.salesTransactions.seasonalPattern,
          salesOrders: comprehensiveData.salesOrders,
          customerMetrics: comprehensiveData.customerInsights,
          invoiceMetrics: comprehensiveData.invoiceMetrics,
          purchaseHistory: comprehensiveData.purchaseHistory,
          zohoMetrics: comprehensiveData.zohoMetrics
        };
      } catch (dataError) {
        console.warn('Could not fetch comprehensive data:', dataError.message);
      }
    }
    
    const insights = await generatePurchaseOrderInsights(
      brand,
      suggestions,
      enhancedHistoricalSales || {},
      marketData || {}
    );
    
    res.json({
      success: true,
      data: insights,
      analysisType: 'purchase_order_intelligence',
      businessContext: 'dm_brands_inventory_optimization',
      brand,
      suggestionsAnalyzed: suggestions.length,
      dataCompleteness: enhancedHistoricalSales ? 'comprehensive' : 'limited',
      generatedAt: new Date().toISOString(),
      userRole: req.userContext?.role
    });
    
  } catch (error) {
    console.error('❌ Error generating purchase order insights:', error);
    res.status(500).json({
      success: false,
      error: 'Purchase order analysis temporarily unavailable',
      fallback: {
        executiveSummary: "AI analysis temporarily unavailable",
        marketTiming: "Unable to assess",
        riskAssessment: "Analysis pending",
        categoryOptimization: "Review manually",
        cashFlowImpact: "Unknown",
        customerImpact: "Unable to determine",
        channelStrategy: "Review channel performance",
        inventoryOptimization: "Check stock levels",
        confidenceAssessment: "Low confidence due to error"
      }
    });
  }
});

/**
 * Product-specific purchase insights
 */
router.post('/product-purchase-insights', validateUserForAI, checkAIRateLimit, async (req, res) => {
  try {
    const { product, suggestion, competitorData, searchTrends } = req.body;
    
    if (!product || !suggestion) {
      return res.status(400).json({
        success: false,
        error: 'Product and suggestion data are required'
      });
    }
    
    console.log(`🤖 Generating product insights for ${product.sku} - ${product.name}`);
    
    const insights = await generateProductPurchaseInsights(
      product,
      suggestion,
      competitorData || {},
      searchTrends || {}
    );
    
    res.json({
      success: true,
      data: insights,
      productSku: product.sku,
      analysisType: 'product_purchase_intelligence',
      generatedAt: new Date().toISOString()
    });
    
  } catch (error) {
    console.error(`❌ Error generating product insights for ${req.body?.product?.sku}:`, error);
    res.status(500).json({
      success: false,
      error: 'Product analysis temporarily unavailable',
      fallback: {
        purchaseRationale: "Analysis pending - review manually",
        seasonalConsiderations: "Consider seasonal demand patterns",
        competitiveAdvantage: "Unique product positioning",
        targetCustomers: "Premium UK retailers",
        pricingStrategy: "Competitive luxury pricing",
        displaySuggestions: "Premium display recommended"
      }
    });
  }
});

/**
 * Validate purchase order adjustments
 */
router.post('/validate-adjustments', validateUserForAI, checkAIRateLimit, async (req, res) => {
  try {
    const { originalSuggestions, userAdjustments, brand } = req.body;
    
    if (!originalSuggestions || !userAdjustments || !brand) {
      return res.status(400).json({
        success: false,
        error: 'Original suggestions, adjustments, and brand are required'
      });
    }
    
    console.log(`🤖 Validating ${userAdjustments.length} adjustments for ${brand}`);
    
    const validation = await validatePurchaseAdjustments(
      originalSuggestions,
      userAdjustments,
      brand
    );
    
    res.json({
      success: true,
      data: validation,
      brand,
      adjustmentsCount: userAdjustments.length,
      analysisType: 'purchase_adjustment_validation',
      generatedAt: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('❌ Error validating purchase adjustments:', error);
    res.status(500).json({
      success: false,
      error: 'Adjustment validation temporarily unavailable',
      fallback: {
        adjustmentAssessment: "Unable to validate adjustments",
        potentialRisks: ["Review adjustments manually"],
        improvements: ["User expertise applied"],
        alternativeSuggestions: [],
        confidenceInAdjustments: 50
      }
    });
  }
});

/**
 * Drill-down analysis
 */
router.post('/drill-down-insights', validateUserForAI, checkAIRateLimit, async (req, res) => {
  try {
    const { viewType, detailData, summaryData } = req.body;
    
    if (!viewType || !detailData) {
      return res.status(400).json({
        success: false,
        error: 'viewType and detailData are required',
        supportedViews: ['orders', 'invoices', 'revenue', 'customers', 'agents', 'brands', 'products']
      });
    }
    
    console.log(`🤖 Generating drill-down insights for ${viewType} view`);
    
    const insights = await generateDrillDownInsights(
      viewType, 
      detailData, 
      summaryData,
      req.userContext?.role,
      req.userId
    );
    
    res.json({
      success: true,
      data: insights,
      viewType,
      analysisDepth: 'detailed_operational_intelligence',
      businessFocus: 'dm_brands_luxury_import_operations',
      generatedAt: new Date().toISOString(),
      userRole: req.userContext?.role
    });
    
  } catch (error) {
    console.error(`❌ Error generating drill-down insights for ${req.body?.viewType}:`, error);
    res.status(500).json({
      success: false,
      error: `Drill-down analysis for ${req.body?.viewType} temporarily unavailable`
    });
  }
});

/**
 * Comparative analysis
 */
router.post('/comparative-insights', validateUserForAI, checkAIRateLimit, async (req, res) => {
  try {
    const { currentData, previousData, comparisonType = 'period' } = req.body;
    
    if (!currentData || !previousData) {
      return res.status(400).json({
        success: false,
        error: 'Both currentData and previousData are required for comparison'
      });
    }
    
    console.log(`🤖 Generating comparative insights (${comparisonType})`);
    
    const insights = await generateComparativeInsights(
      currentData, 
      previousData, 
      comparisonType,
      req.userContext?.role,
      req.userId
    );
    
    res.json({
      success: true,
      data: insights,
      comparisonType,
      analysisType: 'period_comparison_intelligence',
      generatedAt: new Date().toISOString(),
      userRole: req.userContext?.role
    });
    
  } catch (error) {
    console.error('❌ Error generating comparative insights:', error);
    res.status(500).json({
      success: false,
      error: 'Comparative analysis temporarily unavailable'
    });
  }
});

/**
 * Seasonal planning insights
 */
router.post('/seasonal-insights', validateUserForAI, checkAIRateLimit, async (req, res) => {
  try {
    const { historicalData, currentSeason } = req.body;
    
    if (!historicalData) {
      return res.status(400).json({
        success: false,
        error: 'Historical data is required for seasonal analysis'
      });
    }
    
    // Determine current season if not provided
    const season = currentSeason || getCurrentSeason();
    
    console.log(`🤖 Generating seasonal insights for ${season}`);
    
    const insights = await generateSeasonalInsights(
      historicalData, 
      season,
      req.userContext?.role,
      req.userId
    );
    
    res.json({
      success: true,
      data: insights,
      season,
      analysisType: 'seasonal_planning_intelligence',
      businessFocus: 'luxury_home_giftware_seasonality',
      generatedAt: new Date().toISOString(),
      userRole: req.userContext?.role
    });
    
  } catch (error) {
    console.error('❌ Error generating seasonal insights:', error);
    res.status(500).json({
      success: false,
      error: 'Seasonal analysis temporarily unavailable'
    });
  }
});

/**
 * Customer insights
 */
router.post('/customer-insights', validateUserForAI, checkAIRateLimit, async (req, res) => {
  try {
    const { customer, orderHistory, userRole, agentId } = req.body;
    
    if (!customer) {
      return res.status(400).json({
        success: false,
        error: 'Customer data is required'
      });
    }
    
    console.log(`🤖 Generating customer insights for ${customer.name || customer.id}`);
    
    const insights = await generateCustomerInsights(
      customer,
      orderHistory || [],
      userRole || req.userContext?.role,
      agentId || req.userId
    );
    
    res.json({
      success: true,
      data: insights,
      customerId: customer.id,
      analysisType: 'customer_relationship_intelligence',
      generatedAt: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('❌ Error generating customer insights:', error);
    res.status(500).json({
      success: false,
      error: 'Customer analysis temporarily unavailable',
      fallback: {
        customerProfile: "Analysis unavailable",
        orderTrends: {
          frequency: "Unknown",
          averageValue: "Unable to calculate",
          seasonalPatterns: "Analysis pending",
          brandPreferences: []
        },
        opportunities: ["Manual review recommended"],
        riskFactors: ["Unable to assess"],
        recommendedActions: ["Contact customer"],
        relationshipStrategy: "Maintain engagement",
        nextSteps: ["Follow up"]
      }
    });
  }
});

/**
 * Get AI usage statistics
 */
router.get('/usage-stats', validateUserForAI, (req, res) => {
  try {
    const userId = req.userId;
    const userLimit = aiRequestLimiter.get(userId);
    
    const stats = {
      requestsUsed: userLimit ? userLimit.count : 0,
      requestsRemaining: AI_REQUEST_LIMIT - (userLimit ? userLimit.count : 0),
      windowResetTime: userLimit ? userLimit.window + AI_WINDOW_MS : Date.now() + AI_WINDOW_MS,
      limitPerHour: AI_REQUEST_LIMIT,
      usagePercentage: userLimit ? (userLimit.count / AI_REQUEST_LIMIT) * 100 : 0,
      canMakeRequest: !userLimit || userLimit.count < AI_REQUEST_LIMIT
    };
    
    res.json({
      success: true,
      data: stats,
      userId: req.userId,
      businessContext: 'dm_brands_ai_analytics',
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('❌ Error getting AI usage stats:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get usage statistics'
    });
  }
});

router.post('/enhanced-card-insights', validateUserForAI, checkAIRateLimit, async (req, res) => {
  try {
    const { cardType, cardData, fullDashboardData } = req.body;
    
    console.log(`🧠 Generating enhanced insights for ${cardType}`);
    
    const insights = await generateEnhancedCardInsights(
      cardType, 
      cardData, 
      fullDashboardData
    );
    
    res.json({
      success: true,
      data: insights,
      analysisType: 'enhanced_card_analysis',
      includedAnalysis: [
        'historical_comparison',
        'trend_analysis',
        'predictive_insights',
        'actionable_recommendations'
      ],
      generatedAt: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('Error in enhanced card insights:', error);
    res.status(500).json({
      success: false,
      error: 'Enhanced analysis temporarily unavailable'
    });
  }
});

// Search trends endpoint
router.post('/search-trends', validateUserForAI, async (req, res) => {
  try {
    const { brand, products } = req.body;
    
    const trends = await fetchSearchTrends(brand);
    
    res.json({
      success: true,
      data: trends,
      brand,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('Error fetching search trends:', error);
    res.status(500).json({
      success: false,
      error: 'Search trends unavailable'
    });
  }
});

// Enhanced forecast endpoint
router.post('/enhanced-forecast', validateUserForAI, checkAIRateLimit, async (req, res) => {
  try {
    const { dashboardData } = req.body;
    
    const forecast = await generateEnhancedForecast(dashboardData);
    
    res.json({
      success: true,
      data: forecast,
      analysisType: 'comprehensive_forecast',
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('Error generating forecast:', error);
    res.status(500).json({
      success: false,
      error: 'Forecast generation failed'
    });
  }
});

// Agent insights endpoint
router.post('/agent-insights', validateUserForAI, checkAIRateLimit, async (req, res) => {
  try {
    const { agentData, performanceHistory, customerBase } = req.body;
    
    const insights = await generateAgentInsights(
      agentData,
      performanceHistory,
      customerBase
    );
    
    res.json({
      success: true,
      data: insights,
      agentId: agentData.uid,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('Error generating agent insights:', error);
    res.status(500).json({
      success: false,
      error: 'Agent analysis failed'
    });
  }
});

/**
 * Test endpoint
 */
router.get('/test', (req, res) => {
  res.json({
    success: true,
    message: 'AI Insights test endpoint working perfectly',
    systemStatus: {
      routes: 'operational',
      authentication: 'flexible_development_mode',
      googleApi: !!process.env.GOOGLE_API_KEY ? 'configured' : 'needs_configuration',
      businessIntelligence: 'dm_brands_context_loaded',
      aiService: 'sophisticated_analysis_available',
      dataIntegration: 'firebase_and_zoho_connected'
    },
    availableEndpoints: {
      health: 'GET /api/ai-insights/health',
      cardInsights: 'POST /api/ai-insights/card-insights',
      dashboardInsights: 'POST /api/ai-insights/dashboard-insights',
      purchaseOrderInsights: 'POST /api/ai-insights/purchase-order-insights',
      productInsights: 'POST /api/ai-insights/product-purchase-insights',
      validateAdjustments: 'POST /api/ai-insights/validate-adjustments',
      drillDown: 'POST /api/ai-insights/drill-down-insights',
      comparative: 'POST /api/ai-insights/comparative-insights',
      seasonal: 'POST /api/ai-insights/seasonal-insights',
      customer: 'POST /api/ai-insights/customer-insights',
      usageStats: 'GET /api/ai-insights/usage-stats'
    },
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development'
  });
});

// Helper function to determine current season
function getCurrentSeason() {
  const month = new Date().getMonth() + 1; // 1-12
  
  if (month >= 3 && month <= 5) return 'spring';
  if (month >= 6 && month <= 8) return 'summer';
  if (month >= 9 && month <= 11) return 'autumn';
  return 'winter';
}

export default router;
    
    