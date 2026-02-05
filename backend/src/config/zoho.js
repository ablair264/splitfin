import axios from 'axios';
import { logger } from '../utils/logger.js';

class ZohoAuth {
  constructor() {
    this.clientId = process.env.ZOHO_CLIENT_ID;
    this.clientSecret = process.env.ZOHO_CLIENT_SECRET;
    this.refreshToken = process.env.ZOHO_REFRESH_TOKEN;
    this.orgId = process.env.ZOHO_ORG_ID;
    this.accessToken = null;
    this.tokenExpiry = null;
    
    this.authUrl = 'https://accounts.zoho.eu/oauth/v2/token';
    this.inventoryApiUrl = 'https://www.zohoapis.eu/inventory/v1';
    this.crmApiUrl = 'https://www.zohoapis.eu/crm/v5';
  }

  async getAccessToken() {
    if (this.accessToken && this.tokenExpiry && new Date() < this.tokenExpiry) {
      return this.accessToken;
    }

    try {
      const response = await axios.post(
        this.authUrl,
        new URLSearchParams({
          refresh_token: this.refreshToken,
          client_id: this.clientId,
          client_secret: this.clientSecret,
          grant_type: 'refresh_token',
        }),
        {
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        }
      );

      this.accessToken = response.data.access_token;
      this.tokenExpiry = new Date(Date.now() + 3500 * 1000); // 58 minutes
      
      logger.info('Zoho access token refreshed successfully');
      return this.accessToken;
    } catch (error) {
      logger.error('Failed to refresh Zoho access token:', error.response?.data || error.message);
      throw error;
    }
  }

  async makeRequest(url, method = 'GET', data = null, retries = 3) {
    const accessToken = await this.getAccessToken();
    
    try {
      const response = await axios({
        method,
        url,
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'X-com-zoho-inventory-organizationid': this.orgId,
          'Content-Type': 'application/json',
        },
        data,
        params: method === 'GET' ? data : undefined,
        timeout: 30000, // 30 second timeout
      });

      return response.data;
    } catch (error) {
      // Enhanced error handling with exponential backoff
      if (error.response?.status === 429 && retries > 0) {
        const retryAfter = parseInt(error.response.headers['retry-after'] || '5');
        const baseDelay = retryAfter * 1000;
        const jitter = Math.random() * 1000; // Add jitter to prevent thundering herd
        const delay = Math.min(baseDelay + jitter, 60000); // Cap at 1 minute max
        
        logger.warn(`Rate limit hit, waiting ${Math.round(delay)}ms before retry (retry-after: ${retryAfter}s, retries left: ${retries})...`);
        await new Promise(resolve => setTimeout(resolve, delay));
        return this.makeRequest(url, method, data, retries - 1);
      }
      
      if (error.response?.status === 401 && retries > 0) {
        logger.warn('Access token expired, refreshing...');
        this.accessToken = null;
        return this.makeRequest(url, method, data, retries - 1);
      }

      // Log detailed error information for debugging
      if (error.response) {
        logger.error(`Zoho API error - Status: ${error.response.status}, URL: ${url}`, {
          status: error.response.status,
          data: error.response.data,
          headers: error.response.headers,
        });
      } else if (error.request) {
        logger.error('Zoho API network error:', error.message);
      } else {
        logger.error('Zoho API request setup error:', error.message);
      }

      throw error;
    }
  }

  async getInventoryData(endpoint, params = {}) {
    const url = `${this.inventoryApiUrl}/${endpoint}`;
    return this.makeRequest(url, 'GET', params);
  }

  async getCRMData(endpoint, params = {}) {
    const url = `${this.crmApiUrl}/${endpoint}`;
    return this.makeRequest(url, 'GET', params);
  }
}

export const zohoAuth = new ZohoAuth();