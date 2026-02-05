import { BaseSyncService } from './baseSyncService.js';
import { query, insert, update, COMPANY_ID } from '../../config/database.js';
import { zohoAuth } from '../../config/zoho.js';
import { logger } from '../../utils/logger.js';

export class InvoiceSyncService extends BaseSyncService {
  constructor() {
    super('invoices', 'invoices', 'invoices');
  }

  async fetchZohoData(params = {}) {
    const allRecords = [];
    let page = 1;
    let hasMore = true;

    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(start.getDate() + 1);
    const ymd = start.toISOString().split('T')[0];
    const q = { ...params, date_start: ymd, date_end: ymd };

    while (hasMore) {
      try {
        const response = await zohoAuth.getInventoryData(this.zohoEndpoint, {
          page,
          per_page: 200,
          ...q,
        });

        const records = response[this.entityName] || [];
        const todays = records.filter((r) => {
          const lm = r.last_modified_time ? new Date(r.last_modified_time) : null;
          const ct = r.created_time ? new Date(r.created_time) : null;
          const id = r.date ? new Date(r.date) : null;
          const d = lm || ct || id;
          return d && d >= start && d < end;
        });
        allRecords.push(...todays);

        hasMore = response.page_context?.has_more_page || false;
        page++;

        if (hasMore) {
          await this.delay(this.delayMs);
        }
      } catch (error) {
        logger.error('Failed to fetch invoices from Zoho:', error);
        throw error;
      }
    }

    return allRecords;
  }

  mapZohoInvoiceStatus(zohoStatus, balance) {
    if (zohoStatus === 'void') return 'cancelled';
    if (parseFloat(balance) === 0) return 'paid';
    if (zohoStatus === 'overdue') return 'overdue';
    if (zohoStatus === 'sent') return 'sent';
    return 'draft';
  }

  async getOrderId(zohoOrderId) {
    if (!zohoOrderId) return null;

    try {
      const { rows } = await query(
        'SELECT id FROM orders WHERE company_id = $1 AND legacy_order_id = $2 LIMIT 1',
        [COMPANY_ID, zohoOrderId]
      );
      const data = rows[0];
      return data?.id || null;
    } catch (error) {
      logger.debug(`Order not found for Zoho order ID: ${zohoOrderId}`);
      return null;
    }
  }

  async getCustomerId(zohoCustomerId) {
    if (!zohoCustomerId) return null;

    try {
      const { rows } = await query(
        'SELECT id FROM customers WHERE company_id = $1 AND zoho_customer_id = $2 LIMIT 1',
        [COMPANY_ID, zohoCustomerId]
      );
      const data = rows[0];
      return data?.id || null;
    } catch (error) {
      logger.debug(`Customer not found for Zoho customer ID: ${zohoCustomerId}`);
      return null;
    }
  }

  async transformRecord(zohoInvoice) {
    const [customerId, orderId] = await Promise.all([
      this.getCustomerId(zohoInvoice.customer_id),
      this.getOrderId(zohoInvoice.reference_number),
    ]);

    return {
      invoice_number: zohoInvoice.invoice_number,
      customer_id: customerId,
      order_id: orderId,
      status: this.mapZohoInvoiceStatus(zohoInvoice.status, zohoInvoice.balance),
      invoice_date: zohoInvoice.date || new Date().toISOString(),
      due_date: zohoInvoice.due_date || null,
      subtotal: parseFloat(zohoInvoice.sub_total) || 0,
      tax_amount: parseFloat(zohoInvoice.tax_total) || 0,
      shipping_charge: parseFloat(zohoInvoice.shipping_charge) || 0,
      discount_amount: parseFloat(zohoInvoice.discount_total) || 0,
      total_amount: parseFloat(zohoInvoice.total) || 0,
      paid_amount: parseFloat(zohoInvoice.payment_made) || 0,
      balance_due: parseFloat(zohoInvoice.balance) || 0,
      currency_code: zohoInvoice.currency_code || 'USD',
      payment_terms: zohoInvoice.payment_terms || null,
      notes: zohoInvoice.notes || null,
      terms_conditions: zohoInvoice.terms || null,
      billing_address: zohoInvoice.billing_address || null,
      shipping_address: zohoInvoice.shipping_address || null,
      company_id: COMPANY_ID,
      created_at: zohoInvoice.created_time || new Date().toISOString(),
      updated_at: zohoInvoice.last_modified_time || new Date().toISOString(),
      legacy_invoice_id: zohoInvoice.invoice_id,
      legacy_invoice_number: zohoInvoice.invoice_number,
      line_items: zohoInvoice.line_items || [],
      custom_fields: zohoInvoice.custom_fields || [],
      zoho_data: zohoInvoice,
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
          'SELECT id FROM ' + this.dbTable + ' WHERE company_id = $1 AND legacy_invoice_id = $2 LIMIT 1',
          [COMPANY_ID, record.legacy_invoice_id]
        );
        const existingInvoice = rows[0];

        if (existingInvoice) {
          await update(this.dbTable, existingInvoice.id, record);
          results.updated++;
        } else {
          await insert(this.dbTable, record);
          results.created++;
        }

        await this.syncInvoiceItems(record.legacy_invoice_id, record.line_items);
      } catch (error) {
        results.errors.push({
          invoice: record.invoice_number,
          error: error.message,
        });
      }
    }

    return results;
  }

  async syncInvoiceItems(invoiceId, lineItems) {
    if (!lineItems || lineItems.length === 0) return;

    try {
      const { rows } = await query(
        'SELECT id FROM invoices WHERE company_id = $1 AND legacy_invoice_id = $2 LIMIT 1',
        [COMPANY_ID, invoiceId]
      );
      const invoice = rows[0];

      if (!invoice) return;

      const invoiceItems = await Promise.all(lineItems.map(async (item) => {
        const { rows: productRows } = await query(
          'SELECT id FROM products WHERE company_id = $1 AND sku = $2 LIMIT 1',
          [COMPANY_ID, item.sku || item.item_id]
        );
        const product = productRows[0];

        return {
          invoice_id: invoice.id,
          product_id: product?.id || null,
          product_sku: item.sku || item.item_id,
          product_name: item.name || item.item_name,
          quantity: parseFloat(item.quantity) || 0,
          unit_price: parseFloat(item.rate) || 0,
          discount_amount: parseFloat(item.discount_amount) || 0,
          tax_amount: parseFloat(item.tax_total) || 0,
          total_price: parseFloat(item.item_total) || 0,
          description: item.description || null,
          company_id: COMPANY_ID,
        };
      }));

      for (const invoiceItem of invoiceItems) {
        const columns = Object.keys(invoiceItem);
        const values = Object.values(invoiceItem);
        const placeholders = columns.map((_, i) => `$${i + 1}`).join(', ');
        const updateCols = columns
          .filter(c => !['invoice_id', 'product_sku', 'company_id'].includes(c))
          .map(c => `${c} = EXCLUDED.${c}`)
          .join(', ');

        await query(
          `INSERT INTO invoice_items (${columns.join(', ')})
           VALUES (${placeholders})
           ON CONFLICT (invoice_id, product_sku, company_id) DO UPDATE SET ${updateCols}`,
          values
        );
      }
    } catch (error) {
      logger.error(`Failed to sync invoice items for invoice ${invoiceId}:`, error);
    }
  }
}
