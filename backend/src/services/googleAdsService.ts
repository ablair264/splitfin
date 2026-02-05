import { GoogleAdsApi, enums } from 'google-ads-api';
import NodeCache from 'node-cache';

export class GoogleAdsService {
  private client: GoogleAdsApi;
  private cache = new NodeCache({ stdTTL: 86400 }); // 24 hour cache
  
  constructor() {
    this.client = new GoogleAdsApi({
      client_id: process.env.GOOGLE_ADS_CLIENT_ID!,
      client_secret: process.env.GOOGLE_ADS_CLIENT_SECRET!,
      developer_token: process.env.GOOGLE_ADS_DEVELOPER_TOKEN!,
      refresh_token: process.env.GOOGLE_ADS_REFRESH_TOKEN!,
    });
  }

  async getKeywordData(keywords: string[]): Promise<KeywordData[]> {
    // Check cache first
    const cacheKey = keywords.sort().join('|');
    const cached = this.cache.get<KeywordData[]>(cacheKey);
    if (cached) return cached;

    const customer = this.client.Customer({
      customer_id: process.env.GOOGLE_ADS_CUSTOMER_ID!,
      refresh_token: process.env.GOOGLE_ADS_REFRESH_TOKEN!,
    });

    try {
      const keywordPlanService = customer.keywordPlanIdeas();
      
      const response = await keywordPlanService.generateKeywordIdeas({
        customer_id: process.env.GOOGLE_ADS_CUSTOMER_ID!,
        language: 'en',
        geo_target_constants: ['geoTargetConstants/2826'], // UK
        keyword_plan_network: enums.KeywordPlanNetwork.GOOGLE_SEARCH,
        keywords: keywords.slice(0, 20), // Limit to 20 keywords per request
      });

      const results = response.results.map(result => ({
        keyword: result.text,
        avgMonthlySearches: result.keyword_idea_metrics?.avg_monthly_searches || 0,
        competition: result.keyword_idea_metrics?.competition || 'UNKNOWN',
        trending: this.calculateTrend(result.keyword_idea_metrics?.monthly_search_volumes || [])
      }));

      this.cache.set(cacheKey, results);
      return results;
    } catch (error) {
      console.error('Google Ads API error:', error);
      return [];
    }
  }

  private calculateTrend(monthlyVolumes: any[]): 'up' | 'down' | 'stable' {
    if (monthlyVolumes.length < 3) return 'stable';
    
    const recent = monthlyVolumes.slice(-3).map(v => v.monthly_searches || 0);
    const older = monthlyVolumes.slice(-6, -3).map(v => v.monthly_searches || 0);
    
    const recentAvg = recent.reduce((a, b) => a + b, 0) / recent.length;
    const olderAvg = older.reduce((a, b) => a + b, 0) / older.length;
    
    if (recentAvg > olderAvg * 1.2) return 'up';
    if (recentAvg < olderAvg * 0.8) return 'down';
    return 'stable';
  }
}

interface KeywordData {
  keyword: string;
  avgMonthlySearches: number;
  competition: string;
  trending: 'up' | 'down' | 'stable';
}