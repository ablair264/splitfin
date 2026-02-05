import { logger } from '../utils/logger.js';
import { ItemSyncService } from './sync/itemSync.js';
import { OrderSyncService } from './sync/orderSync.js';
import { InvoiceSyncService } from './sync/invoiceSync.js';
import { PackageSyncService } from './sync/packageSync.js';
import { CustomerSyncService } from './sync/customerSync.js';

export class SyncOrchestrator {
  constructor() {
    this.services = {
      items: new ItemSyncService(),
      customers: new CustomerSyncService(),
      orders: new OrderSyncService(),
      invoices: new InvoiceSyncService(),
      packages: new PackageSyncService(),
    };
    
    this.syncOrder = ['items', 'customers', 'orders', 'invoices', 'packages'];
  }

  async runFullSync() {
    const results = {
      success: [],
      failed: [],
      timestamp: new Date().toISOString(),
    };

    // Test database connection first
    try {
      const { healthCheck } = await import('../config/database.js');
      await healthCheck();
      logger.info('Database connection test passed');
    } catch (error) {
      logger.error('Failed to connect to database:', error);
      throw error;
    }

    logger.info('Starting order-driven sync process...');

    try {
      // Step 1: Get the unique customer and item IDs from recent orders FIRST
      const { customerIds, itemIds } = await this.getOrderRelatedIds();
      
      // Step 2: Sync customers first so they exist when we sync orders
      if (customerIds.length > 0) {
        logger.info(`Syncing ${customerIds.length} customers from recent orders...`);
        const customerResult = await this.services.customers.syncSpecificIds(customerIds);
        results.success.push({
          entity: 'customers',
          ...customerResult,
        });
        logger.info('customers sync completed:', customerResult);
      }

      // Step 3: Sync items so they exist when we sync orders
      if (itemIds.length > 0) {
        logger.info(`Syncing ${itemIds.length} items from recent orders...`);
        const itemResult = await this.services.items.syncSpecificIds(itemIds);
        results.success.push({
          entity: 'items',
          ...itemResult,
        });
        logger.info('items sync completed:', itemResult);
      }

      // Step 4: Now sync orders (customers and items should exist now)
      logger.info('Syncing orders...');
      const orderResult = await this.services.orders.sync();
      results.success.push({
        entity: 'orders',
        ...orderResult,
      });
      logger.info('orders sync completed:', orderResult);

      // Step 4: Sync invoices (today only)
      logger.info('Syncing invoices...');
      const invoiceResult = await this.services.invoices.sync();
      results.success.push({
        entity: 'invoices',
        ...invoiceResult,
      });

      // Step 5: Sync packages (last month)
      logger.info('Syncing packages...');
      const packageResult = await this.services.packages.sync();
      results.success.push({
        entity: 'packages',
        ...packageResult,
      });

    } catch (error) {
      logger.error('Order-driven sync failed:', error);
      results.failed.push({
        entity: 'full_sync',
        error: error.message,
      });
    }

    logger.info('Full sync completed:', {
      successful: results.success.length,
      failed: results.failed.length,
    });

    return results;
  }

  async getOrderRelatedIds() {
    try {
      const { zohoAuth } = await import('../config/zoho.js');
      
      // Get recent orders (last few days to avoid date filtering issues)
      const response = await zohoAuth.getInventoryData('salesorders', {
        per_page: 200,
        sort_column: 'date',
        sort_order: 'D', // Descending - get most recent first
      });

      const orders = response.salesorders || [];
      const customerIds = new Set();
      const itemIds = new Set();

      // Filter to recent orders (last 7 days) and extract unique customer and item IDs
      const oneWeekAgo = new Date();
      oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
      
      const recentOrders = orders.filter(order => {
        const orderDate = new Date(order.date);
        return orderDate >= oneWeekAgo;
      });

      logger.info(`Processing ${recentOrders.length} recent orders (last 7 days) out of ${orders.length} total`);

      for (const order of recentOrders) {
        if (order.customer_id) {
          customerIds.add(order.customer_id);
        }
        
        // Get detailed order to access line items
        try {
          const detailResponse = await zohoAuth.getInventoryData(`salesorders/${order.salesorder_id}`);
          const lineItems = detailResponse.salesorder?.line_items || [];
          
          for (const item of lineItems) {
            if (item.item_id) {
              itemIds.add(item.item_id);
            }
          }
        } catch (error) {
          logger.warn(`Failed to get details for order ${order.salesorder_id}:`, error.message);
        }
        
        // Add delay to respect rate limits
        await new Promise(resolve => setTimeout(resolve, 500));
      }

      logger.info(`Found ${customerIds.size} unique customers and ${itemIds.size} unique items in today's orders`);
      
      return {
        customerIds: Array.from(customerIds),
        itemIds: Array.from(itemIds),
      };
    } catch (error) {
      logger.error('Failed to get order-related IDs:', error);
      return { customerIds: [], itemIds: [] };
    }
  }

  async syncEntity(entityName) {
    if (!this.services[entityName]) {
      throw new Error(`Unknown entity: ${entityName}`);
    }

    logger.info(`Running single entity sync for: ${entityName}`);
    return await this.services[entityName].sync();
  }

  async getLastSyncStatus() {
    const status = {};
    
    for (const [name, service] of Object.entries(this.services)) {
      try {
        status[name] = await service.getLastSyncInfo();
      } catch (error) {
        status[name] = { error: error.message };
      }
    }
    
    return status;
  }
}