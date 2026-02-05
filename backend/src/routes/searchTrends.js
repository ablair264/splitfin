// server/src/routes/searchTrends.js
import express from 'express';
import axios from 'axios';
import NodeCache from 'node-cache';

const router = express.Router();
const cache = new NodeCache({ stdTTL: 86400 }); // 24 hour cache

// DataForSEO configuration
const DATAFORSEO_API = {
  baseURL: 'https://api.dataforseo.com/v3',
  auth: {
    username: process.env.DATAFORSEO_LOGIN,
    password: process.env.DATAFORSEO_PASSWORD
  }
};

// Get search volume and trends for a brand
router.get('/brand/:brandName', async (req, res) => {
  try {
    const { brandName } = req.params;
    console.log('[Search Trends] Request for brand:', brandName);

    // Check cache first
    const cacheKey = `trends_${brandName}`;
    const cached = cache.get(cacheKey);

    if (cached && Date.now() - cached.timestamp < 86400000) { // 24 hour cache
      console.log('[Search Trends] Returning cached data for', brandName);
      return res.json({
        success: true,
        trends: cached.data,
        cached: true
      });
    }

    console.log('[Search Trends] Fetching fresh data from DataForSEO for', brandName);

    // Build keyword list for the brand
    const keywords = buildKeywordList(brandName);
    
    // Get current date and 3 months ago
    const endDate = new Date();
    const startDate = new Date();
    startDate.setMonth(startDate.getMonth() - 3);

    try {
      // Call DataForSEO API
      const response = await axios.post(
        `${DATAFORSEO_API.baseURL}/keywords_data/google_ads/search_volume/live`,
        [{
          keywords: keywords,
          location_code: 2826, // UK location code
          language_code: "en",
          date_from: startDate.toISOString().split('T')[0],
          date_to: endDate.toISOString().split('T')[0],
          sort_by: "relevance",
          include_seed_keyword: true
        }],
        {
          auth: DATAFORSEO_API.auth,
          headers: {
            'Content-Type': 'application/json'
          }
        }
      );

      // Process the response
      const results = response.data?.tasks?.[0]?.result || [];
      const trends = processDataForSEOResults(results, brandName);

      // Cache the results
      cache.set(cacheKey, {
        data: trends,
        timestamp: Date.now()
      });

      return res.json({
        success: true,
        trends: trends,
        cached: false,
        source: 'dataforseo'
      });

    } catch (apiError) {
      console.error('[Search Trends] DataForSEO API error:', apiError.response?.data || apiError.message);
      
      // Return fallback data
      return res.json({
        success: true,
        trends: getFallbackTrends(brandName),
        cached: false,
        fallback: true
      });
    }

  } catch (error) {
    console.error('[Search Trends] Error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch search trends'
    });
  }
});

// Get historical trend data
router.get('/historical/:brandName', async (req, res) => {
  try {
    const { brandName } = req.params;
    const { timeRange = 'today 12-m' } = req.query;
    
    console.log('[Search Trends] Historical data request for:', brandName);

    // For DataForSEO, we'll use the Explore endpoint for trend data
    const response = await axios.post(
      `${DATAFORSEO_API.baseURL}/keywords_data/google_trends/explore/live`,
      [{
        keywords: [brandName],
        location_code: 2826, // UK
        language_code: "en",
        type: "querytime",
        date_from: "2024-01-01",
        date_to: new Date().toISOString().split('T')[0],
        include_serp_info: false
      }],
      {
        auth: DATAFORSEO_API.auth,
        headers: {
          'Content-Type': 'application/json'
        }
      }
    );

    const trendData = response.data?.tasks?.[0]?.result?.[0] || null;
    
    return res.json({
      success: true,
      data: {
        brand: brandName,
        interest_over_time: trendData?.items || [],
        averageInterest: trendData?.items?.reduce((sum, item) => sum + (item.values?.[0] || 0), 0) / (trendData?.items?.length || 1)
      }
    });

  } catch (error) {
    console.error('[Search Trends] Historical error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch historical trends'
    });
  }
});

// Helper function to build keyword variations
function buildKeywordList(brandName) {
  const brand = brandName.toLowerCase();
  const keywords = [brandName];
  
  // Add brand-specific variations based on your product knowledge
  const brandVariations = {
    'blomus': ['blomus furniture', 'blomus outdoor', 'blomus home', 'blomus kitchen'],
    'elvang': ['elvang blanket', 'elvang cushion', 'alpaca wool blanket'],
    'rader': ['rader porcelain', 'rader vase', 'rader bowl', 'rader plate', 'rader gift', 'rader home', 'rader kitchen'],
    'relaxound': ['relaxound box', 'relaxound nature', 'nature sound box', 'junglebox', 'oceanbox', 'zwitscherbox', 'birdybox'],
    'remember': ['remember fan flow', 'remember beach bag']
  };
  
  if (brandVariations[brand]) {
    keywords.push(...brandVariations[brand]);
  } else {
    // Generic variations
    keywords.push(
      `${brandName} products`,
      `${brandName} shop`,
      `buy ${brandName}`,
      `${brandName} uk`
    );
  }
  
  return keywords;
}

// Process DataForSEO results into our format
function processDataForSEOResults(results, brandName) {
  if (!results || results.length === 0) {
    return getFallbackTrends(brandName);
  }

  return results.map(item => {
    const keyword = item.keyword || brandName;
    const currentVolume = item.search_volume || 0;
    const previousVolume = item.monthly_searches?.[item.monthly_searches.length - 2]?.search_volume || currentVolume;
    
    // Calculate trend
    let trend = 'stable';
    let percentageChange = 0;
    
    if (previousVolume > 0) {
      percentageChange = ((currentVolume - previousVolume) / previousVolume) * 100;
      if (percentageChange > 10) trend = 'rising';
      else if (percentageChange < -10) trend = 'falling';
    }
    
    return {
      keyword: keyword,
      volume: currentVolume,
      trend: trend,
      percentageChange: Math.round(percentageChange),
      competition: item.competition || 'MEDIUM',
      cpc: item.cpc || 0,
      monthlySearches: item.monthly_searches || [],
      relatedQueries: [] // DataForSEO doesn't provide this in search volume endpoint
    };
  }).sort((a, b) => b.volume - a.volume); // Sort by volume
}

// Fallback trends when API fails
function getFallbackTrends(brandName) {
  return [{
    keyword: brandName,
    volume: 1000,
    trend: 'stable',
    percentageChange: 0,
    competition: 'MEDIUM',
    cpc: 0,
    monthlySearches: [],
    relatedQueries: []
  }];
}

export default router;