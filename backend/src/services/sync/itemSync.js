import { BaseSyncService } from './baseSyncService.js';
import { query, insert, update, COMPANY_ID } from '../../config/database.js';
import { zohoAuth } from '../../config/zoho.js';
import { logger } from '../../utils/logger.js';

export class ItemSyncService extends BaseSyncService {
  constructor() {
    super('items', 'items', 'items'); // Changed from 'products' to 'items'
  }

  async fetchZohoData(params = {}) {
    const allRecords = [];
    let page = 1;
    let hasMore = true;
    const maxRecords = params.limit || 1000;

    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(start.getDate() + 1);
    const cleanParams = { ...params };
    delete cleanParams.last_modified_time;

    while (hasMore && allRecords.length < maxRecords) {
      try {
        const response = await zohoAuth.getInventoryData('items', {
          page,
          per_page: Math.min(200, maxRecords - allRecords.length),
          ...cleanParams,
        });

        const records = response.items || [];
        const todays = records.filter((r) => {
          const lm = r.last_modified_time ? new Date(r.last_modified_time) : null;
          const ct = r.created_time ? new Date(r.created_time) : null;
          const d = lm || ct;
          return d && d >= start && d < end;
        });
        allRecords.push(...todays);

        hasMore = response.page_context?.has_more_page || false;
        page++;

        if (hasMore && allRecords.length < maxRecords) {
          await this.delay(this.delayMs);
        }
      } catch (error) {
        logger.error('Failed to fetch items from Zoho:', error);
        throw error;
      }
    }

    if (allRecords.length >= maxRecords) {
      logger.warn(`Reached record limit of ${maxRecords} for items`);
    }

    return allRecords;
  }

  extractBrandFromName(name) {
    const brands = ['Pernod Ricard', 'PR', 'Moet Hennessy', 'MH', 'Brown Foreman', 'BF'];

    for (const brand of brands) {
      if (name && name.toUpperCase().includes(brand.toUpperCase())) {
        return brand;
      }
    }

    return null;
  }

  async getBrandId(brandName) {
    if (!brandName) return null;

    try {
      const { rows } = await query(
        'SELECT id FROM brands WHERE company_id = $1 AND brand_normalized = $2 LIMIT 1',
        [COMPANY_ID, brandName.toUpperCase()]
      );
      const data = rows[0];
      return data?.id || null;
    } catch (error) {
      return null;
    }
  }

  async transformRecord(zohoItem) {
    const brandName = this.extractBrandFromName(zohoItem.name) ||
                      this.extractBrandFromName(zohoItem.description);

    const brandId = await this.getBrandId(brandName);

    return {
      name: zohoItem.name,
      description: zohoItem.description || '',
      category: zohoItem.category_name || null,
      sku: zohoItem.sku || zohoItem.item_id,
      ean: zohoItem.ean || null,
      purchase_price: parseFloat(zohoItem.purchase_rate) || 0,
      retail_price: parseFloat(zohoItem.rate) || 0,
      brand_id: brandId,
      gross_stock_level: parseInt(zohoItem.stock_on_hand) || 0,
      committed_stock: parseInt(zohoItem.committed_stock) || 0,
      reorder_level: parseInt(zohoItem.reorder_level) || 0,
      status: zohoItem.status === 'active' ? 'active' : 'inactive',
      created_date: zohoItem.created_time || new Date().toISOString(),
      updated_at: zohoItem.last_modified_time || new Date().toISOString(),
      legacy_item_id: zohoItem.item_id,
      image_url: zohoItem.image_url || null,
      weight: parseFloat(zohoItem.weight) || null,
      dimensions: zohoItem.dimension ? `${zohoItem.dimension.length}x${zohoItem.dimension.width}x${zohoItem.dimension.height} ${zohoItem.dimension.unit}` : null,
    };
  }

  async upsertRecords(records) {
    const results = {
      created: 0,
      updated: 0,
      errors: [],
    };

    for (const record of records) {
      try {
        const { rows } = await query(
          `SELECT id FROM ${this.dbTable} WHERE legacy_item_id = $1 LIMIT 1`,
          [record.legacy_item_id]
        );
        const existingItem = rows[0];

        if (existingItem) {
          await update(this.dbTable, existingItem.id, record);
          results.updated++;
        } else {
          await insert(this.dbTable, record);
          results.created++;
        }
      } catch (error) {
        results.errors.push({
          sku: record.sku,
          error: error.message,
        });
      }
    }

    return results;
  }

  async syncSpecificIds(itemIds) {
    const results = {
      created: 0,
      updated: 0,
      errors: [],
    };

    logger.info(`Syncing ${itemIds.length} specific items`);

    for (const itemId of itemIds) {
      try {
        const response = await zohoAuth.getInventoryData(`items/${itemId}`);
        const zohoItem = response.item;

        if (zohoItem) {
          const transformed = await this.transformRecord(zohoItem);
          const result = await this.upsertRecords([transformed]);

          results.created += result.created;
          results.updated += result.updated;
          results.errors.push(...result.errors);
        }

        await this.delay(500); // Increased delay for rate limiting
      } catch (error) {
        logger.error(`Failed to sync item ${itemId}:`, error);
        results.errors.push({
          item_id: itemId,
          error: error.message,
        });
      }
    }

    return results;
  }
}
