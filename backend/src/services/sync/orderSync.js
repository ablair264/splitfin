import { BaseSyncService } from './baseSyncService.js';
import { query, insert, update, COMPANY_ID } from '../../config/database.js';
import { logger } from '../../utils/logger.js';
import { zohoAuth } from '../../config/zoho.js';

export class OrderSyncService extends BaseSyncService {
  constructor() {
    super('salesorders', 'salesorders', 'orders');
  }

  async fetchZohoData(params = {}) {
    const allRecords = [];
    let page = 1;
    let hasMore = true;

    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(start.getDate() + 1);
    logger.info('Fetching orders and filtering to today');

    while (hasMore) {
      try {
        const response = await zohoAuth.getInventoryData(this.zohoEndpoint, {
          page,
          per_page: 200,
          ...params,
        });

        const records = response[this.entityName] || [];
        const todays = records.filter((r) => {
          const lc = r.last_modified_time ? new Date(r.last_modified_time) : null;
          const dc = r.created_time ? new Date(r.created_time) : null;
          const od = r.date ? new Date(r.date) : null;
          const d = lc || dc || od;
          return d && d >= start && d < end;
        });
        allRecords.push(...todays);

        hasMore = response.page_context?.has_more_page || false;
        page++;

        if (hasMore) {
          await this.delay(this.delayMs);
        }
      } catch (error) {
        logger.error(`Failed to fetch ${this.entityName} from Zoho:`, error);
        throw error;
      }
    }

    return allRecords;
  }

  mapZohoStatus(zohoStatus) {
    const statusMap = {
      'draft': 'pending',
      'open': 'confirmed',
      'confirmed': 'confirmed',
      'closed': 'delivered',
      'void': 'cancelled',
      'cancelled': 'cancelled',
    };

    return statusMap[zohoStatus?.toLowerCase()] || 'pending';
  }

  async getSalespersonId(zohoSpId) {
    if (!zohoSpId) return null;

    try {
      const { rows } = await query(
        'SELECT id FROM users WHERE zoho_sp_id = $1 LIMIT 1',
        [zohoSpId]
      );
      const data = rows[0];

      return data?.id || null;
    } catch (error) {
      logger.debug(`Salesperson not found for Zoho SP ID: ${zohoSpId}`);
      return null;
    }
  }

  async getCustomerId(zohoCustomerId) {
    if (!zohoCustomerId) return null;

    try {
      const { rows } = await query(
        'SELECT id FROM customers WHERE linked_company = $1 AND zoho_customer_id = $2 LIMIT 1',
        [COMPANY_ID, zohoCustomerId]
      );
      const data = rows[0];

      if (data?.id) {
        logger.debug(`Found customer ${data.id} for Zoho customer ID: ${zohoCustomerId}`);
        return data.id;
      } else {
        // Customer not found, try to create it
        logger.info(`Customer not found for Zoho ID ${zohoCustomerId}, attempting to create...`);
        return await this.createCustomerFromZoho(zohoCustomerId);
      }
    } catch (error) {
      logger.error(`Error looking up customer for Zoho customer ID ${zohoCustomerId}:`, error);
      return null;
    }
  }

  async createCustomerFromZoho(zohoCustomerId) {
    try {
      const { CustomerSyncService } = await import('./customerSync.js');
      const customerSync = new CustomerSyncService();

      const response = await zohoAuth.getInventoryData(`contacts/${zohoCustomerId}`);
      const zohoContact = response.contact;

      if (zohoContact) {
        const transformed = await customerSync.transformRecord(zohoContact);
        const result = await customerSync.upsertRecords([transformed]);

        if (result.created > 0 || result.updated > 0) {
          // Get the created customer ID
          const { rows } = await query(
            'SELECT id FROM customers WHERE linked_company = $1 AND zoho_customer_id = $2 LIMIT 1',
            [COMPANY_ID, zohoCustomerId]
          );
          const data = rows[0];

          logger.info(`Successfully created customer ${data?.id} for Zoho ID ${zohoCustomerId}`);
          return data?.id || null;
        }
      }

      logger.warn(`Failed to create customer for Zoho ID ${zohoCustomerId}`);
      return null;
    } catch (error) {
      logger.error(`Failed to create customer for Zoho ID ${zohoCustomerId}:`, error);
      return null;
    }
  }

  async transformRecord(zohoOrder) {
    const [customerId, salespersonId] = await Promise.all([
      this.getCustomerId(zohoOrder.customer_id),
      this.getSalespersonId(zohoOrder.salesperson_id),
    ]);

    return {
      company_id: COMPANY_ID,
      legacy_order_number: zohoOrder.salesorder_number,
      order_date: zohoOrder.date ? new Date(zohoOrder.date).toISOString() : new Date().toISOString(),
      order_status: this.mapZohoStatus(zohoOrder.status),
      sub_total: parseFloat(zohoOrder.sub_total) || 0,
      discount_applied: zohoOrder.discount > 0,
      discount_percentage: zohoOrder.discount_percent || null,
      total: parseFloat(zohoOrder.total) || 0,
      customer_id: customerId,
      sales_id: salespersonId,
      notes: zohoOrder.notes || null,
      legacy_order_id: zohoOrder.salesorder_id,
      created_at: zohoOrder.created_time || new Date().toISOString(),
      updated_at: zohoOrder.last_modified_time || new Date().toISOString(),
    };
  }

  async fetchDetailedOrdersBatch(salesOrderIds) {
    const detailedOrders = new Map();

    // Process orders sequentially to avoid rate limits
    for (const salesOrderId of salesOrderIds) {
      try {
        const detailedOrder = await zohoAuth.getInventoryData(`salesorders/${salesOrderId}`);
        detailedOrders.set(salesOrderId, detailedOrder.salesorder);
      } catch (error) {
        logger.error(`Failed to fetch detailed order ${salesOrderId}:`, error);
        detailedOrders.set(salesOrderId, null);
      }

      // Add delay between each request to respect rate limits
      await this.delay(this.delayMs);
    }

    return detailedOrders;
  }

  async upsertRecords(records) {
    const results = {
      created: 0,
      updated: 0,
      errors: [],
    };

    // Filter records that have customers and collect order IDs
    const validRecords = records.filter(record => {
      if (!record.customer_id) {
        logger.warn(`Skipping order ${record.legacy_order_number} - no matching customer found`);
        return false;
      }
      return true;
    });

    // Fetch all detailed orders in batches
    const orderIds = validRecords.map(record => record.legacy_order_id);
    const detailedOrders = await this.fetchDetailedOrdersBatch(orderIds);

    // Process each order
    for (const record of validRecords) {
      try {
        const { rows } = await query(
          `SELECT id FROM ${this.dbTable} WHERE company_id = $1 AND legacy_order_id = $2 LIMIT 1`,
          [COMPANY_ID, record.legacy_order_id]
        );
        const existingOrder = rows[0];

        let orderId;
        if (existingOrder) {
          await update(this.dbTable, existingOrder.id, record);
          orderId = existingOrder.id;
          results.updated++;
        } else {
          const insertedOrder = await insert(this.dbTable, record);
          orderId = insertedOrder.id;
          results.created++;
        }

        // Sync order line items if we have detailed order data
        const detailedOrder = detailedOrders.get(record.legacy_order_id);
        if (detailedOrder?.line_items && orderId) {
          await this.syncOrderItems(orderId, detailedOrder.line_items);
        }
      } catch (error) {
        results.errors.push({
          order: record.legacy_order_number,
          error: error.message,
        });
      }
    }

    return results;
  }

  async syncOrderItems(orderId, lineItems) {
    if (!lineItems || lineItems.length === 0) return;

    try {
      // First, delete existing line items for this order to handle updates
      await query('DELETE FROM order_line_items WHERE order_id = $1', [orderId]);

      const orderItems = [];

      for (const item of lineItems) {
        const { rows } = await query(
          'SELECT id FROM items WHERE legacy_item_id = $1 LIMIT 1',
          [item.item_id]
        );
        const product = rows[0];

        // Only add line items where we found a matching product
        if (product?.id) {
          orderItems.push({
            order_id: orderId,
            item_id: product.id,
            item_name: item.name || item.item_name,
            item_sku: item.sku || item.item_id,
            legacy_item_id: item.item_id,
            quantity: parseInt(item.quantity) || 0,
            unit_price: parseFloat(item.rate) || 0,
            total_price: parseFloat(item.item_total) || 0,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          });
        } else {
          logger.warn(`Skipping line item for item_id ${item.item_id} - no matching product found`);
        }
      }

      if (orderItems.length > 0) {
        for (const orderItem of orderItems) {
          await insert('order_line_items', orderItem);
        }
      }
    } catch (error) {
      logger.error(`Failed to sync order items for order ${orderId}:`, error);
    }
  }
}
