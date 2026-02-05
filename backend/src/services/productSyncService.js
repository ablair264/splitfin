import axios from 'axios';
import admin from 'firebase-admin';
import { getAccessToken } from '../api/zoho.js';

// Rate Limiter Class
class RateLimiter {
  constructor(maxRequests = 8, perSeconds = 1) {
    this.maxRequests = maxRequests;
    this.perMilliseconds = perSeconds * 1000;
    this.queue = [];
    this.processing = false;
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
    
    // Remove old request times
    const now = Date.now();
    this.requestTimes = this.requestTimes.filter(
      time => now - time < this.perMilliseconds
    );
    
    // Check if we can make more requests
    const availableSlots = this.maxRequests - this.requestTimes.length;
    if (availableSlots <= 0) {
      // Wait until we can make a request
      const oldestRequest = Math.min(...this.requestTimes);
      const waitTime = this.perMilliseconds - (now - oldestRequest) + 100;
      
      setTimeout(() => {
        this.processing = false;
        this.processQueue();
      }, waitTime);
      return;
    }
    
    // Process available requests
    const batch = this.queue.splice(0, availableSlots);
    
    for (const { fn, resolve, reject } of batch) {
      this.requestTimes.push(Date.now());
      fn().then(resolve).catch(reject);
    }
    
    this.processing = false;
    
    // Continue processing if there are more requests
    if (this.queue.length > 0) {
      setTimeout(() => this.processQueue(), 100);
    }
  }
}

// Exponential backoff utility
async function withExponentialBackoff(fn, maxRetries = 5, initialDelay = 1000) {
  let lastError;
  
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      
      if (error.response?.status === 429) {
        // Calculate exponential backoff with jitter
        const baseDelay = initialDelay * Math.pow(2, attempt);
        const jitter = Math.random() * 0.3 * baseDelay; // 30% jitter
        const delay = baseDelay + jitter;
        
        console.log(`⏳ Rate limited (attempt ${attempt + 1}/${maxRetries}), waiting ${Math.round(delay)}ms...`);
        
        // Check for Retry-After header
        const retryAfter = error.response?.headers?.['retry-after'];
        if (retryAfter) {
          const retryDelay = parseInt(retryAfter) * 1000;
          console.log(`⏳ Server requested retry after ${retryAfter} seconds`);
          await new Promise(resolve => setTimeout(resolve, retryDelay));
        } else {
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      } else if (error.code === 'ECONNRESET' || error.code === 'ETIMEDOUT') {
        // Network errors - retry with backoff
        const delay = initialDelay * Math.pow(1.5, attempt);
        console.log(`🔄 Network error, retrying in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      } else {
        // Don't retry other errors
        throw error;
      }
    }
  }
  
  throw lastError;
}

class ProductSyncService {
  constructor() {
    this.db = admin.firestore();
    this.baseUrl = 'https://www.zohoapis.eu/inventory/v1';
    this.orgId = process.env.ZOHO_ORG_ID;
    // Create rate limiter - 8 requests per second to be safe
    this.rateLimiter = new RateLimiter(8, 1);
  }

  /**
   * Fetch all products from Zoho Inventory with proper fields
   */
  async fetchAllProducts() {
    console.log('🔄 Fetching all products from Zoho Inventory...');
    
    try {
      const token = await getAccessToken();
      const allProducts = [];
      let page = 1;
      let hasMore = true;
      
      while (hasMore) {
        // Use rate limiter for the list request
        const response = await this.rateLimiter.addRequest(() => 
          withExponentialBackoff(() =>
            axios.get(`${this.baseUrl}/items`, {
              params: {
                organization_id: this.orgId,
                page: page,
                per_page: 200 // Max allowed
              },
              headers: {
                Authorization: `Zoho-oauthtoken ${token}`
              },
              timeout: 30000
            })
          )
        );
        
        const items = response.data.items || [];
        
        if (items.length === 0) {
          hasMore = false;
        } else {
          console.log(`📦 Fetched page ${page} with ${items.length} items. Getting details...`);
          
          // Process items in batches to avoid overwhelming the API
          const BATCH_SIZE = 10;
          for (let i = 0; i < items.length; i += BATCH_SIZE) {
            const batch = items.slice(i, i + BATCH_SIZE);
            
            // Fetch details for batch in parallel (but rate limited)
            const detailPromises = batch.map(item => 
              this.getItemDetails(item.item_id, token)
            );
            
            const batchResults = await Promise.all(detailPromises);
            
            // Add successful results to allProducts
            for (const fullItem of batchResults) {
              if (fullItem) {
                allProducts.push(fullItem);
              }
            }
            
            // Log progress every 50 items
            if ((i + BATCH_SIZE) % 50 === 0 || i + BATCH_SIZE >= items.length) {
              console.log(`📊 Progress: ${Math.min(i + BATCH_SIZE, items.length)}/${items.length} items from page ${page}`);
            }
            
            // Add a small delay between batches
            if (i + BATCH_SIZE < items.length) {
              await new Promise(resolve => setTimeout(resolve, 200));
            }
          }
          
          console.log(`✅ Completed page ${page}, total products so far: ${allProducts.length}`);
          page++;
          
          // Add delay between pages
          if (hasMore) {
            await new Promise(resolve => setTimeout(resolve, 500));
          }
        }
      }
      
      console.log(`✅ Fetched ${allProducts.length} products from Zoho`);
      return allProducts;
      
    } catch (error) {
      console.error('❌ Error fetching products:', error);
      throw error;
    }
  }

  /**
   * Get full item details including vendor info
   */
  async getItemDetails(itemId, token) {
    try {
      // Use rate limiter and exponential backoff
      const response = await this.rateLimiter.addRequest(() =>
        withExponentialBackoff(() =>
          axios.get(`${this.baseUrl}/items/${itemId}`, {
            params: {
              organization_id: this.orgId
            },
            headers: {
              Authorization: `Zoho-oauthtoken ${token}`
            },
            timeout: 30000
          })
        )
      );
      
      return response.data.item;
      
    } catch (error) {
      // Log error but don't throw - we'll skip this item
      console.error(`⚠️ Error fetching details for item ${itemId}:`, error.message);
      return null;
    }
  }

  /**
   * Sync products to Firebase with correct field mapping
   */
  async syncProductsToFirebase() {
    console.log('🚀 Starting product sync to Firebase...');
    
    try {
      // Fetch all products from Zoho
      const zohoProducts = await this.fetchAllProducts();
      
      if (zohoProducts.length === 0) {
        console.log('No products found in Zoho');
        return { success: true, count: 0 };
      }
      
      // Process and save to Firebase
      let batch = this.db.batch();
      let count = 0;
      const batchSize = 400;
      
      for (const zohoProduct of zohoProducts) {
        // Map Zoho fields to Firebase fields
        const firebaseProduct = {
          // Core identifiers
          item_id: zohoProduct.item_id,
          name: zohoProduct.name || '',
          sku: zohoProduct.sku || '',
          ean: zohoProduct.ean || zohoProduct.upc || '', // EAN might be stored as UPC
          
          // Pricing
          rate: parseFloat(zohoProduct.rate || 0),
          purchase_rate: parseFloat(zohoProduct.purchase_rate || 0),
          
          // Vendor/Brand info
          vendor_id: zohoProduct.vendor_id || '',
          vendor_name: zohoProduct.vendor_name || '',
          Manufacturer: zohoProduct.vendor_name || '', // Use capital M for compatibility
          brand: zohoProduct.vendor_name || '', // Also store as brand for compatibility
          brand_normalized: this.normalizeBrandName(zohoProduct.vendor_name || ''),
          
          // Stock levels
          available_stock: parseInt(zohoProduct.available_for_sale_stock || 0),
          actual_available_stock: parseInt(zohoProduct.actual_available_for_sale_stock || 0),
          stock_on_hand: parseInt(zohoProduct.stock_on_hand || 0),
          
          // Additional useful fields
          description: zohoProduct.description || '',
          category: zohoProduct.category_name || '',
          status: zohoProduct.status || 'active',
          unit: zohoProduct.unit || '',
          
          // Images
          imageUrl: zohoProduct.image_url || '',
          image_document_id: zohoProduct.image_document_id || '',
          
          // Metadata
          created_time: zohoProduct.created_time,
          last_modified_time: zohoProduct.last_modified_time,
          _source: 'zoho_inventory',
          _synced_at: admin.firestore.FieldValue.serverTimestamp()
        };
        
        // Use item_id as document ID
        const docRef = this.db.collection('items').doc(zohoProduct.item_id); // Changed to 'items' collection
        batch.set(docRef, firebaseProduct, { merge: true });
        count++;
        
        // Commit batch when limit reached
        if (count % batchSize === 0) {
          await batch.commit();
          console.log(`✅ Synced ${count} products...`);
          batch = this.db.batch();
        }
      }
      
      // Commit remaining
      if (count % batchSize !== 0) {
        await batch.commit();
      }
      
      console.log(`✅ Successfully synced ${count} products to Firebase`);
      
      // Update sync metadata
      await this.db.collection('sync_metadata').doc('products_sync').set({
        lastSync: admin.firestore.FieldValue.serverTimestamp(),
        productCount: count,
        status: 'completed'
      });
      
      return { success: true, count };
      
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
   * Normalize brand name for consistency
   */
  normalizeBrandName(brandName) {
    if (!brandName) return 'unknown';
    
    return brandName
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  /**
   * Get sync status
   */
  async getSyncStatus() {
    try {
      const metadata = await this.db.collection('sync_metadata').doc('products_sync').get();
      const productCount = await this.db.collection('items').count().get(); // Changed to 'items'
      
      return {
        lastSync: metadata.exists ? metadata.data().lastSync : null,
        productCount: productCount.data().count,
        status: metadata.exists ? metadata.data().status : 'never_run'
      };
    } catch (error) {
      console.error('Error getting sync status:', error);
      return null;
    }
  }
}

export default new ProductSyncService();