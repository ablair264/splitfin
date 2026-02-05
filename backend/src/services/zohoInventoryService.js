// server/src/services/zohoInventoryService.js
import axios from 'axios';
import admin from 'firebase-admin';
import { getAccessToken } from '../api/zoho.js';
import { zohoRateLimitedRequest } from './zohoRateLimiter.js';

// Salesperson name to ID mapping (Zoho Inventory returns names, not IDs)
const SALESPERSON_MAPPING = {
  'Hannah Neale': '310656000000642003',
  'Dave Roberts': '310656000000642005',
  'Kate Ellis': '310656000000642007',
  'Stephen Stroud': '310656000000642009',
  'Nick Barr': '310656000000642011',
  'Gay Croker': '310656000000642013',
  'Steph Gillard': '310656000002136698',
  'Marcus Johnson': '310656000002136700',
  'Georgia Middler': '310656000026622107',
  'matt': '310656000000059361'
};

const ZOHO_CONFIG = {
  baseUrls: {
    crm: 'https://www.zohoapis.eu/crm/v5',
    inventory: 'https://www.zohoapis.eu/inventory/v1',
    analytics: 'https://analyticsapi.zoho.eu/restapi/v2'
  },
  orgId: process.env.ZOHO_ORG_ID,
  pagination: {
    defaultPerPage: 200,
    maxPerPage: 200
  },
  rateLimit: {
    maxRequestsPerMinute: 50, // Conservative limit (Zoho allows 60)
    delayBetweenRequests: 1500, // 1.5 seconds between requests
    delayBetweenBatches: 3000, // 3 seconds between batches
    retryDelay: 5000, // 5 seconds initial retry delay
    maxRetries: 3
  }
};

// Request queue and rate limiter
class RateLimiter {
  constructor() {
    this.queue = [];
    this.processing = false;
    this.requestCount = 0;
    this.windowStart = Date.now();
    this.requestTimes = [];
  }

  async addRequest(fn) {
    return new Promise((resolve, reject) => {
      this.queue.push({ fn, resolve, reject });
      this.processQueue();
    });
  }

  async processQueue() {
    if (this.processing || this.queue.length === 0) return;
    
    this.processing = true;
    
    while (this.queue.length > 0) {
      // Clean up old request times (older than 1 minute)
      const oneMinuteAgo = Date.now() - 60000;
      this.requestTimes = this.requestTimes.filter(time => time > oneMinuteAgo);
      
      // Check if we're within rate limit
      if (this.requestTimes.length >= ZOHO_CONFIG.rateLimit.maxRequestsPerMinute) {
        // Wait until the oldest request is more than 1 minute old
        const oldestRequest = this.requestTimes[0];
        const waitTime = oldestRequest + 60000 - Date.now() + 1000; // Add 1s buffer
        console.log(`⏳ Rate limit approaching, waiting ${Math.ceil(waitTime/1000)}s...`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
        continue;
      }
      
      const { fn, resolve, reject } = this.queue.shift();
      
      try {
        // Record request time
        this.requestTimes.push(Date.now());
        
        // Execute the request
        const result = await fn();
        resolve(result);
        
        // Delay before next request
        await new Promise(resolve => setTimeout(resolve, ZOHO_CONFIG.rateLimit.delayBetweenRequests));
      } catch (error) {
        reject(error);
      }
    }
    
    this.processing = false;
  }
}

const rateLimiter = new RateLimiter();

class ZohoInventoryService {
  constructor() {
    this.db = admin.firestore();
    this.baseUrl = ZOHO_CONFIG.baseUrls.inventory;
    this.organizationId = ZOHO_CONFIG.orgId;
    this.cache = new Map();
    this.cacheTimeout = 5 * 60 * 1000; // 5 minutes
  }

  /**
   * Get a valid access token
   */
  async getAccessToken() {
    return await getAccessToken();
  }

  /**
   * Make a rate-limited request with retry logic
   */
  async makeRateLimitedRequest(requestFn, retryCount = 0) {
    try {
      return await rateLimiter.addRequest(requestFn);
    } catch (error) {
      if (error.response?.status === 429 || error.message?.includes('exceeded the maximum')) {
        if (retryCount < ZOHO_CONFIG.rateLimit.maxRetries) {
          const delay = ZOHO_CONFIG.rateLimit.retryDelay * Math.pow(2, retryCount);
          console.log(`🔄 Rate limit hit, retrying in ${delay/1000}s... (attempt ${retryCount + 1}/${ZOHO_CONFIG.rateLimit.maxRetries})`);
          await new Promise(resolve => setTimeout(resolve, delay));
          return this.makeRateLimitedRequest(requestFn, retryCount + 1);
        }
      }
      throw error;
    }
  }

  /**
   * Generic paginated fetch with caching and rate limiting
   */
  async fetchPaginatedData(url, params = {}, dataKey = 'data', useCache = true) {
    const cacheKey = `${url}_${JSON.stringify(params)}`;
    
    if (useCache && this.cache.has(cacheKey)) {
      const cached = this.cache.get(cacheKey);
      if (Date.now() - cached.timestamp < this.cacheTimeout) {
        console.log(`📄 Using cached data for ${url}`);
        return cached.data;
      }
    }

    const allData = [];
    let page = 1;
    let hasMore = true;

    console.log(`🔄 Fetching paginated data from ${url}`);

    while (hasMore) {
      try {
        const response = await zohoRateLimitedRequest(async () => axios.get(url, {
          params: {
            ...params,
            organization_id: this.organizationId,
            page,
            per_page: ZOHO_CONFIG.pagination.defaultPerPage
          },
          headers: { Authorization: `Zoho-oauthtoken ${await this.getAccessToken()}` },
          timeout: 30000
        }));

        const items = response.data[dataKey] || [];
        
        // Log total count if available (helpful for debugging)
        if (response.data.page_context?.total) {
          console.log(`  Total records available: ${response.data.page_context.total}`);
        }
        
        if (items.length === 0) {
          console.log(`✅ No more data found on page ${page}, stopping pagination.`);
          hasMore = false;
        } else {
          allData.push(...items);
          console.log(`  Page ${page}: Fetched ${items.length} items (total: ${allData.length})`);
          
          // Check if we got less than the requested amount - indicates last page
          if (items.length < ZOHO_CONFIG.pagination.defaultPerPage) {
            console.log(`  Page ${page} returned ${items.length} items (less than ${ZOHO_CONFIG.pagination.defaultPerPage}), this is likely the last page.`);
            hasMore = false;
          } else {
            // Continue to next page
            page++;
            
            // Check page_context if available (Zoho sometimes provides this)
            if (response.data.page_context) {
              hasMore = response.data.page_context.has_more_page || false;
              if (!hasMore) {
                console.log(`  Page context indicates no more pages.`);
              }
            }
          }
        }

      } catch (error) {
        console.error(`⚠️ Error on page ${page}:`, error.message);
        if (error.response?.status === 429) {
          throw error; // Re-throw rate limit errors to trigger retry
        }
        hasMore = false;
        break;
      }
    }

    console.log(`✅ Completed pagination: ${allData.length} total items fetched`);

    if (useCache && allData.length > 0) {
      this.cache.set(cacheKey, {
        data: allData,
        timestamp: Date.now()
      });
    }

    return allData;
  }

  /**
   * Get specific sales order with line items (with rate limiting)
   */
  async getSalesOrder(orderId) {
    try {
      const response = await zohoRateLimitedRequest(async () => {
        const accessToken = await this.getAccessToken();
        
        return await axios.get(
          `${this.baseUrl}/salesorders/${orderId}`,
          {
            headers: {
              'Authorization': `Zoho-oauthtoken ${accessToken}`
            },
            params: {
              organization_id: this.organizationId
            }
          }
        );
      });
      
      const order = response.data?.salesorder;
      
      if (order) {
        // Ensure customer name is included
        if (!order.customer_name && order.customer_id) {
          order.customer_name = `Customer ${order.customer_id}`;
        }
        
        // Add salesperson_id from name if not present
        if (!order.salesperson_id && order.salesperson_name) {
          // Try exact match first
          if (SALESPERSON_MAPPING[order.salesperson_name]) {
            order.salesperson_id = SALESPERSON_MAPPING[order.salesperson_name];
          } else {
            // Try case-insensitive match
            const lowerName = order.salesperson_name.toLowerCase();
            for (const [name, id] of Object.entries(SALESPERSON_MAPPING)) {
              if (name.toLowerCase() === lowerName) {
                order.salesperson_id = id;
                break;
              }
            }
          }
        }
        
        // Process line items
        if (order.line_items && Array.isArray(order.line_items)) {
          order.line_items = order.line_items.map(item => ({
            ...item,
            item_id: item.item_id,
            item_name: item.name || item.item_name,
            quantity: item.quantity || 0,
            rate: item.rate || 0,
            total: item.item_total || (item.quantity * item.rate) || 0
          }));
        }
      }
      
      return order;
      
    } catch (error) {
      if (error.response?.status === 404) {
        console.log(`Order ${orderId} not found in Zoho`);
        return null;
      }
      throw error;
    }
  }

  /**
   * Fetch all products with full details (using pagination) - SORTING REMOVED
   */
  async fetchAllProducts() {
    console.log('🔄 Fetching all products from Zoho Inventory...');
    
    try {
      const allItems = [];
      const seenItemIds = new Set(); // Track unique items
      let page = 1;
      let hasMore = true;
      const perPage = 200; // Maximum allowed by Zoho
      const maxPages = 50; // Safety limit
      let consecutiveEmptyPages = 0;
      
      while (hasMore && page <= maxPages) {
        try {
          console.log(`📄 Fetching page ${page}...`);
          const response = await zohoRateLimitedRequest(async () => {
            const token = await this.getAccessToken();
            return axios.get(`${this.baseUrl}/items`, {
              params: {
                organization_id: this.organizationId,
                page,
                per_page: perPage
                // REMOVED: sort_column and sort_order parameters
              },
              headers: { 
                Authorization: `Zoho-oauthtoken ${token}` 
              },
              timeout: 30000
            });
          });
          
          const items = response.data.items || [];
          const pageContext = response.data.page_context || {};
          
          // Log page context info if available
          if (pageContext.total) {
            console.log(`  Total items available: ${pageContext.total}`);
          }
          
          if (items.length === 0) {
            consecutiveEmptyPages++;
            console.log(`  No items on page ${page} (${consecutiveEmptyPages} consecutive empty pages)`);
            
            // Stop if we get 2 consecutive empty pages
            if (consecutiveEmptyPages >= 2) {
              console.log(`  Stopping due to consecutive empty pages`);
              hasMore = false;
            } else {
              page++;
            }
          } else {
            consecutiveEmptyPages = 0; // Reset counter
            
            // Add only unique items
            let newItemsCount = 0;
            for (const item of items) {
              if (!seenItemIds.has(item.item_id)) {
                seenItemIds.add(item.item_id);
                allItems.push(item);
                newItemsCount++;
              }
            }
            
            console.log(`  Page ${page}: ${items.length} items received, ${newItemsCount} new unique items added (total: ${allItems.length})`);
            
            // Determine if we should continue
            if (newItemsCount === 0) {
              console.log(`  No new items found, stopping pagination`);
              hasMore = false;
            } else if (items.length < perPage) {
              console.log(`  Received ${items.length} items (less than ${perPage}), this is the last page`);
              hasMore = false;
            } else if (pageContext.has_more_page === false) {
              console.log(`  API indicates no more pages`);
              hasMore = false;
            } else if (pageContext.total && allItems.length >= pageContext.total) {
              console.log(`  Reached total item count (${pageContext.total})`);
              hasMore = false;
            } else {
              page++;
              // Add delay between pages
              await new Promise(resolve => setTimeout(resolve, ZOHO_CONFIG.rateLimit.delayBetweenRequests));
            }
          }
        } catch (error) {
          console.error(`❌ Error fetching page ${page}:`, error.message);
          
          // Check for specific errors
          if (error.response?.status === 404) {
            console.log(`  404 error - no more pages available`);
            hasMore = false;
          } else if (error.response?.data?.message?.includes('page parameter is invalid')) {
            console.log(`  Invalid page parameter - likely exceeded available pages`);
            hasMore = false;
          } else if (allItems.length > 0) {
            // Continue with what we have
            console.log(`⚠️  Continuing with ${allItems.length} items fetched so far`);
            hasMore = false;
          } else {
            throw error;
          }
        }
      }
      
      if (page > maxPages) {
        console.warn(`⚠️  Reached maximum page limit (${maxPages})`);
      }
      
      console.log(`✅ Fetched ${allItems.length} unique products from Zoho`);
      
      // Process and normalize the items
      return allItems.map(item => ({
        ...item,
        brand_normalized: this.normalizeBrandName(item.vendor_name || item.brand || item.cf_brand || item.brand_name || '')
      }));
      
    } catch (error) {
      console.error('❌ Error fetching products:', error);
      throw error;
    }
  }

  /**
   * Get full item details (only if needed, with rate limiting)
   */
  async getItemDetails(itemId, token) {
    try {
      const response = await zohoRateLimitedRequest(async () => {
        return await axios.get(`${this.baseUrl}/items/${itemId}`, {
          params: {
            organization_id: this.organizationId
          },
          headers: {
            Authorization: `Zoho-oauthtoken ${token || await this.getAccessToken()}`
          },
          timeout: 30000
        });
      });
      
      return response.data.item;
      
    } catch (error) {
      console.error(`Error fetching details for item ${itemId}:`, error.message);
      return null;
    }
  }

  /**
   * Sync products to Firebase (optimized)
   */
  async syncProductsToFirebase() {
    console.log('🚀 Starting product sync to Firebase...');
    
    try {
      const zohoProducts = await this.fetchAllProducts();
      
      if (zohoProducts.length === 0) {
        console.log('No products found in Zoho');
        return { success: true, count: 0 };
      }
      
      let batch = this.db.batch();
      let count = 0;
      const batchSize = 400;
      
      for (const zohoProduct of zohoProducts) {
        const firebaseProduct = {
          item_id: zohoProduct.item_id,
          name: zohoProduct.name || '',
          sku: zohoProduct.sku || '',
          ean: zohoProduct.ean || zohoProduct.upc || '',
          
          rate: parseFloat(zohoProduct.rate || 0),
          purchase_rate: parseFloat(zohoProduct.purchase_rate || 0),
          
          vendor_id: zohoProduct.vendor_id || '',
          vendor_name: zohoProduct.vendor_name || '',
          brand: zohoProduct.vendor_name || '',
          brand_normalized: this.normalizeBrandName(zohoProduct.vendor_name || ''),
          
          available_stock: parseInt(zohoProduct.available_for_sale_stock || 0),
          actual_available_stock: parseInt(zohoProduct.actual_available_for_sale_stock || 0),
          stock_on_hand: parseInt(zohoProduct.stock_on_hand || 0),
          
          description: zohoProduct.description || '',
          category: zohoProduct.category_name || '',
          status: zohoProduct.status || 'active',
          unit: zohoProduct.unit || '',
          
          imageUrl: zohoProduct.image_url || '',
          image_document_id: zohoProduct.image_document_id || '',
          
          created_time: zohoProduct.created_time,
          last_modified_time: zohoProduct.last_modified_time,
          _source: 'zoho_inventory',
          _synced_at: admin.firestore.FieldValue.serverTimestamp()
        };
        
        const docRef = this.db.collection('items_data').doc(zohoProduct.item_id);
        batch.set(docRef, firebaseProduct, { merge: true });
        count++;
        
        if (count % batchSize === 0) {
          await batch.commit();
          console.log(`✅ Synced ${count} products...`);
          batch = this.db.batch();
          
          // Add delay between batches
          await new Promise(resolve => setTimeout(resolve, ZOHO_CONFIG.rateLimit.delayBetweenBatches));
        }
      }
      
      if (count % batchSize !== 0) {
        await batch.commit();
      }
      
      console.log(`✅ Successfully synced ${count} products to Firebase`);
      
      await this.db.collection('sync_metadata').doc('products_sync').set({
        lastSync: admin.firestore.FieldValue.serverTimestamp(),
        productCount: count,
        status: 'completed'
      });
      
      return { success: true, count };
      
    } catch (error) {
      console.error('❌ Product sync failed:', error);
      throw error;
    }
  }

  /**
   * Get sales orders for a date range (optimized to avoid individual detail fetches)
   */
  async getSalesOrders(dateRange = '30_days', customDateRange = null, agentId = null) {
    try {
      const { startDate, endDate } = this.getDateRange(dateRange, customDateRange);
      
      const params = {
        date_start: startDate.toISOString().split('T')[0],
        date_end: endDate.toISOString().split('T')[0]
      };

      if (agentId) {
        params.salesperson_id = agentId;
      }

      // Helper to get salesperson ID from name
      const getSalespersonId = (salespersonName) => {
        if (!salespersonName) return null;
        
        // Try exact match first
        if (SALESPERSON_MAPPING[salespersonName]) {
          return SALESPERSON_MAPPING[salespersonName];
        }
        
        // Try case-insensitive match
        const lowerName = salespersonName.toLowerCase();
        for (const [name, id] of Object.entries(SALESPERSON_MAPPING)) {
          if (name.toLowerCase() === lowerName) {
            return id;
          }
        }
        
        return null;
      };

      // Fetch all orders with pagination
      const salesOrderList = await zohoRateLimitedRequest(async () => axios.get(
        `${this.baseUrl}/salesorders`,
        {
          params: {
            ...params,
            organization_id: this.organizationId,
            per_page: ZOHO_CONFIG.pagination.defaultPerPage
          },
          headers: { Authorization: `Zoho-oauthtoken ${await this.getAccessToken()}` },
          timeout: 30000
        }
      ));
      
      console.log(`Found ${salesOrderList.data.salesorders.length} orders.`);

      // Add salesperson_id to each order if missing
      salesOrderList.data.salesorders.forEach(order => {
        if (!order.salesperson_id && order.salesperson_name) {
          const id = getSalespersonId(order.salesperson_name);
          if (id) {
            order.salesperson_id = id;
          }
        }
      });

      // Only fetch details if line items are not included in list response
      // Check if first order has line_items
      if (salesOrderList.data.salesorders.length > 0 && !salesOrderList.data.salesorders[0].line_items) {
        console.log('Line items not included in list response, fetching details...');
        
        // Fetch details in smaller batches to avoid rate limits
        const detailBatchSize = 10;
        const detailedOrders = [];
        
        for (let i = 0; i < salesOrderList.data.salesorders.length; i += detailBatchSize) {
          const batch = salesOrderList.data.salesorders.slice(i, i + detailBatchSize);
          const batchDetails = await Promise.all(
            batch.map(orderHeader => this.getSalesOrder(orderHeader.salesorder_id))
          );
          
          detailedOrders.push(...batchDetails.filter(order => order !== null));
          
          if (i + detailBatchSize < salesOrderList.data.salesorders.length) {
            console.log(`  Fetched details for ${detailedOrders.length}/${salesOrderList.data.salesorders.length} orders...`);
            await new Promise(resolve => setTimeout(resolve, ZOHO_CONFIG.rateLimit.delayBetweenBatches));
          }
        }
        
        console.log(`✅ Successfully fetched details for ${detailedOrders.length} orders.`);
        return detailedOrders;
      } else {
        // Line items already included, return as-is
        return salesOrderList.data.salesorders;
      }

    } catch (error) {
      console.error('❌ Error fetching sales orders:', error);
      throw error;
    }
  }
  
  async syncProductsWithChangeDetection() {
    console.log('🔄 Starting product sync with change detection...');
    
    try {
      const startTime = Date.now();
      const stats = {
        total: 0,
        updated: 0,
        new: 0,
        deactivated: 0,
        errors: 0
      };
      
      // Get all current items from Firebase
      const firebaseItemsSnapshot = await this.db.collection('items_data').get();
      const firebaseItemsMap = new Map();
      
      firebaseItemsSnapshot.forEach(doc => {
        firebaseItemsMap.set(doc.id, doc.data());
      });
      
      console.log(`📊 Found ${firebaseItemsMap.size} items in Firebase`);
      
      // Fetch all products from Zoho
      const zohoProducts = await this.fetchAllProducts();
      console.log(`📊 Found ${zohoProducts.length} items in Zoho`);
      
      // Track which Zoho items we've seen
      const zohoItemIds = new Set();
      
      let batch = this.db.batch();
      let batchCount = 0;
      
      // Process each Zoho product
      for (const zohoProduct of zohoProducts) {
        stats.total++;
        zohoItemIds.add(zohoProduct.item_id);
        
        const firebaseItem = firebaseItemsMap.get(zohoProduct.item_id);
        
        // Prepare the updated product data
        const updatedProduct = {
          item_id: zohoProduct.item_id,
          name: zohoProduct.name || '',
          item_name: zohoProduct.name || '', // Some queries use item_name
          sku: zohoProduct.sku || '',
          ean: zohoProduct.ean || zohoProduct.upc || '',
          
          // Pricing
          rate: parseFloat(zohoProduct.rate || 0),
          selling_price: parseFloat(zohoProduct.rate || 0), // Alias for compatibility
          purchase_rate: parseFloat(zohoProduct.purchase_rate || 0),
          
          // Manufacturer/Brand (ensure compatibility with your brand queries)
          // Check multiple possible fields for brand information
          Manufacturer: zohoProduct.brand || zohoProduct.cf_brand || zohoProduct.vendor_name || zohoProduct.brand_name || '',
          manufacturer: (zohoProduct.brand || zohoProduct.cf_brand || zohoProduct.vendor_name || zohoProduct.brand_name || '').toLowerCase(),
          brand: zohoProduct.brand || zohoProduct.cf_brand || zohoProduct.vendor_name || zohoProduct.brand_name || '',
          brand_normalized: this.normalizeBrandName(zohoProduct.brand || zohoProduct.cf_brand || zohoProduct.vendor_name || zohoProduct.brand_name || ''),
          vendor_id: zohoProduct.vendor_id || '',
          vendor_name: zohoProduct.vendor_name || '',
          
          // Stock levels
          available_stock: parseInt(zohoProduct.available_for_sale_stock || 0),
          actual_available_stock: parseInt(zohoProduct.actual_available_for_sale_stock || 0),
          stock_on_hand: parseInt(zohoProduct.stock_on_hand || 0),
          reorder_level: parseInt(zohoProduct.reorder_level || 0),
          
          // Product details
          description: zohoProduct.description || '',
          category: zohoProduct.category_name || '',
          status: zohoProduct.status || 'active',
          unit: zohoProduct.unit || '',
          
          // Images
          imageUrl: zohoProduct.image_url || '',
          image_document_id: zohoProduct.image_document_id || '',
          
          // Timestamps
          created_time: zohoProduct.created_time,
          last_modified_time: zohoProduct.last_modified_time,
          _source: 'zoho_inventory',
          _synced_at: admin.firestore.FieldValue.serverTimestamp()
        };
        
        // Check if this is a new item or an update
        if (!firebaseItem) {
          stats.new++;
          console.log(`✨ New item: ${zohoProduct.name} (${zohoProduct.sku})`);
        } else {
          // Check for changes
          const hasChanges = this.detectProductChanges(firebaseItem, updatedProduct);
          
          if (hasChanges) {
            stats.updated++;
            console.log(`📝 Updated item: ${zohoProduct.name} - Changes detected`);
            
            // Log specific status changes
            if (firebaseItem.status !== updatedProduct.status) {
              console.log(`   Status changed: ${firebaseItem.status} → ${updatedProduct.status}`);
              if (updatedProduct.status === 'inactive') {
                stats.deactivated++;
              }
            }
          }
        }
        
        // Add to batch
        const docRef = this.db.collection('items_data').doc(zohoProduct.item_id);
        batch.set(docRef, updatedProduct, { merge: true });
        batchCount++;
        
        // Commit batch if needed
        if (batchCount >= 400) {
          await batch.commit();
          batch = this.db.batch();
          batchCount = 0;
          console.log(`💾 Committed batch of 400 items...`);
          
          // Add delay between batches
          await new Promise(resolve => setTimeout(resolve, ZOHO_CONFIG.rateLimit.delayBetweenBatches));
        }
      }
      
      // Commit remaining items
      if (batchCount > 0) {
        await batch.commit();
      }
      
      // DEACTIVATION REMOVED: Commenting out to prevent incorrect deactivation of products
      // This was causing issues where active products were being marked as inactive
      // even though they exist in Zoho Inventory
      /*
      // Check for items that exist in Firebase but not in Zoho (possibly deleted)
      const missingInZoho = [];
      firebaseItemsMap.forEach((item, itemId) => {
        if (!zohoItemIds.has(itemId) && item.status === 'active') {
          // Only mark as missing if it's not a manually created item
          if (item._source === 'zoho_inventory') {
            missingInZoho.push({
              item_id: itemId,
              name: item.name,
              sku: item.sku
            });
          }
        }
      });
      
      // Mark missing items as inactive (but be conservative)
      if (missingInZoho.length > 0) {
        console.log(`⚠️  Found ${missingInZoho.length} items in Firebase that are missing in Zoho`);
        
        // If more than 100 items are missing, there might be an API issue
        if (missingInZoho.length > 100) {
          console.log(`❌ Too many missing items (${missingInZoho.length}). Skipping deactivation to prevent data loss.`);
          console.log('   This might indicate an API pagination issue or incomplete sync.');
        } else {
          batch = this.db.batch();
          batchCount = 0;
          
          for (const item of missingInZoho) {
            console.log(`   Marking as inactive: ${item.name} (${item.sku})`);
            const docRef = this.db.collection('items_data').doc(item.item_id);
            batch.update(docRef, {
              status: 'inactive',
              _deactivated_reason: 'Not found in Zoho Inventory',
              _deactivated_at: admin.firestore.FieldValue.serverTimestamp()
            });
            stats.deactivated++;
            batchCount++;
            
            if (batchCount >= 400) {
              await batch.commit();
              batch = this.db.batch();
              batchCount = 0;
              
              // Add delay between batches
              await new Promise(resolve => setTimeout(resolve, ZOHO_CONFIG.rateLimit.delayBetweenBatches));
            }
          }
          
          if (batchCount > 0) {
            await batch.commit();
          }
        }
      }
      */
      
      // Update sync metadata
      await this.db.collection('sync_metadata').doc('products_sync').set({
        lastSync: admin.firestore.FieldValue.serverTimestamp(),
        duration: Date.now() - startTime,
        stats: stats,
        status: 'completed'
      });
      
      console.log('\n✅ Product sync completed!');
      console.log(`📊 Summary:`);
      console.log(`   Total processed: ${stats.total}`);
      console.log(`   New items: ${stats.new}`);
      console.log(`   Updated items: ${stats.updated}`);
      // console.log(`   Deactivated items: ${stats.deactivated}`);
      console.log(`   Duration: ${((Date.now() - startTime) / 1000).toFixed(2)}s`);
      
      return { success: true, stats };
      
    } catch (error) {
      console.error('❌ Product sync failed:', error);
      
      // Update sync metadata with error
      await this.db.collection('sync_metadata').doc('products_sync').set({
        lastSync: admin.firestore.FieldValue.serverTimestamp(),
        status: 'failed',
        error: error.message
      }, { merge: true });
      
      throw error;
    }
  }

  /**
   * Detect changes between Firebase and Zoho product data
   */
  detectProductChanges(firebaseItem, zohoItem) {
    // Fields to check for changes
    const fieldsToCheck = [
      'name',
      'sku',
      'status',
      'rate',
      'selling_price',
      'available_stock',
      'actual_available_stock',
      'stock_on_hand',
      'vendor_name',
      'description',
      'category',
      'reorder_level'
    ];
    
    for (const field of fieldsToCheck) {
      // Handle numeric comparisons
      if (['rate', 'selling_price', 'available_stock', 'actual_available_stock', 'stock_on_hand', 'reorder_level'].includes(field)) {
        const fbValue = parseFloat(firebaseItem[field] || 0);
        const zohoValue = parseFloat(zohoItem[field] || 0);
        
        if (Math.abs(fbValue - zohoValue) > 0.01) {
          return true;
        }
      } else {
        // String comparison
        if ((firebaseItem[field] || '') !== (zohoItem[field] || '')) {
          return true;
        }
      }
    }
    
    // Check if last_modified_time is different
    if (firebaseItem.last_modified_time !== zohoItem.last_modified_time) {
      return true;
    }
    
    return false;
  }

  /**
   * Get purchase orders
   */
  async getPurchaseOrders(dateRange = '30_days', customDateRange = null) {
    try {
      const { startDate, endDate } = this.getDateRange(dateRange, customDateRange);
      
      const params = {
        date_start: startDate.toISOString().split('T')[0],
        date_end: endDate.toISOString().split('T')[0]
      };

      const purchaseOrderList = await zohoRateLimitedRequest(async () => axios.get(
        `${this.baseUrl}/purchaseorders`,
        {
          params: {
            ...params,
            organization_id: this.organizationId,
            per_page: ZOHO_CONFIG.pagination.defaultPerPage
          },
          headers: { Authorization: `Zoho-oauthtoken ${await this.getAccessToken()}` },
          timeout: 30000
        }
      ));

      console.log(`Found ${purchaseOrderList.data.purchaseorders.length} purchase orders.`);

      // Return list data if it contains necessary fields
      // Only fetch details if absolutely needed
      return purchaseOrderList.data.purchaseorders;

    } catch (error) {
      console.error('❌ Error fetching purchase orders:', error);
      throw error;
    }
  }

  /**
   * Get purchase order detail (with rate limiting)
   */
  async getPurchaseOrderDetail(purchaseorder_id) {
    try {
      const response = await zohoRateLimitedRequest(async () => {
        const token = await this.getAccessToken();
        
        return await axios.get(
          `${this.baseUrl}/purchaseorders/${purchaseorder_id}`,
          {
            params: { organization_id: this.organizationId },
            headers: { Authorization: `Zoho-oauthtoken ${token}` }
          }
        );
      });

      return response.data?.purchaseorder;

    } catch (error) {
      console.error(`❌ Error fetching purchase order ${purchaseorder_id}:`, error.message);
      return null;
    }
  }

  /**
   * Normalize brand name
   */
  normalizeBrandName(brandName) {
    if (!brandName) return 'unknown';
    
    // Normalize special characters (ä→a, ö→o, etc.)
    const normalized = brandName
      .normalize('NFD') // Decompose combined characters
      .replace(/[\u0300-\u036f]/g, '') // Remove diacritical marks
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
    
    return normalized;
  }

  /**
   * Get date range utility
   */
  getDateRange(dateRange, customDateRange = null) {
    const now = new Date();
    let startDate, endDate;

    switch (dateRange) {
      case 'today':
        startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        endDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
        break;
      case '7_days':
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        endDate = now;
        break;
      case '30_days':
        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        endDate = now;
        break;
      default:
        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        endDate = now;
    }

    return { startDate, endDate };
  }

  /**
   * Clear cache
   */
  clearCache() {
    this.cache.clear();
    console.log('📄 Cache cleared');
  }
}

export default new ZohoInventoryService();