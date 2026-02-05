// fullZohoDataSync.js
import admin from 'firebase-admin';
import axios from 'axios';
import { getAccessToken } from './api/zoho.js'; // Adjust path as needed

// Initialize Firebase Admin if not already initialized
if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();

const ZOHO_CONFIG = {
  baseUrl: 'https://www.zohoapis.eu/inventory/v1',
  orgId: process.env.ZOHO_ORG_ID,
  pagination: {
    defaultPerPage: 200,
    maxPerPage: 200
  }
};

class ZohoFullDataSync {
  constructor() {
    this.stats = {
      customers: { total: 0, processed: 0, errors: 0 },
      orders: { total: 0, processed: 0, errors: 0 },
      invoices: { total: 0, processed: 0, errors: 0 },
      purchaseOrders: { total: 0, processed: 0, errors: 0 },
      salesTransactions: { total: 0, processed: 0, errors: 0 }
    };
    this.errors = [];
    this.startTime = Date.now();
  }

  /**
   * Generic paginated fetch function
   */
  async fetchPaginatedData(endpoint, dataKey, params = {}) {
    console.log(`🔄 Fetching ${endpoint}...`);
    
    const allData = [];
    let page = 1;
    let hasMore = true;
    
    while (hasMore) {
      try {
        const token = await getAccessToken();
        
        const response = await axios.get(`${ZOHO_CONFIG.baseUrl}/${endpoint}`, {
          params: {
            organization_id: ZOHO_CONFIG.orgId,
            page: page,
            per_page: ZOHO_CONFIG.pagination.defaultPerPage,
            ...params
          },
          headers: {
            'Authorization': `Zoho-oauthtoken ${token}`
          },
          timeout: 30000
        });

        const data = response.data;
        
        if (data.code !== 0) {
          throw new Error(`Zoho API error: ${data.message}`);
        }

        const items = data[dataKey] || [];
        
        if (items.length === 0) {
          hasMore = false;
          break;
        }

        allData.push(...items);
        console.log(`  📄 Page ${page}: Found ${items.length} items`);

        // Check if there are more pages
        const pageContext = data.page_context || {};
        hasMore = pageContext.has_more_page || false;
        
        page++;
        
        // Rate limiting
        await new Promise(resolve => setTimeout(resolve, 200));
        
      } catch (error) {
        console.error(`  ❌ Error on page ${page}:`, error.message);
        this.errors.push({ type: endpoint, page, error: error.message });
        hasMore = false;
      }
    }

    console.log(`  ✅ Total ${endpoint}: ${allData.length}`);
    return allData;
  }

  /**
   * Fetch detailed information for a single item
   */
  async fetchItemDetails(endpoint, itemId) {
    try {
      const token = await getAccessToken();
      
      const response = await axios.get(`${ZOHO_CONFIG.baseUrl}/${endpoint}/${itemId}`, {
        params: { organization_id: ZOHO_CONFIG.orgId },
        headers: { 'Authorization': `Zoho-oauthtoken ${token}` },
        timeout: 15000
      });

      if (response.data.code === 0) {
        // Extract the single item from the response
        const key = endpoint.slice(0, -1); // Remove 's' from endpoint
        return response.data[key];
      }
    } catch (error) {
      console.error(`Error fetching ${endpoint}/${itemId}:`, error.message);
    }
    return null;
  }

  /**
   * Store data in Firebase with batching
   */
  async storeInFirebase(collection, items, idField) {
    console.log(`  💾 Storing ${items.length} items in ${collection}...`);
    
    const BATCH_SIZE = 400;
    let successCount = 0;
    
    for (let i = 0; i < items.length; i += BATCH_SIZE) {
      const batch = db.batch();
      const batchItems = items.slice(i, i + BATCH_SIZE);
      
      try {
        for (const item of batchItems) {
          const docId = item[idField];
          if (!docId) continue;
          
          const docRef = db.collection(collection).doc(String(docId));
          batch.set(docRef, {
            ...item,
            _synced_at: admin.firestore.FieldValue.serverTimestamp(),
            _source: 'zoho_inventory',
            _sync_version: '3.0'
          }, { merge: true });
        }
        
        await batch.commit();
        successCount += batchItems.length;
        
      } catch (error) {
        console.error(`    ❌ Batch error:`, error.message);
        this.errors.push({ 
          collection, 
          batch: Math.floor(i/BATCH_SIZE) + 1, 
          error: error.message 
        });
      }
    }
    
    return successCount;
  }

  /**
   * SYNC CUSTOMERS
   */
  async syncCustomers() {
    console.log('\n📥 SYNCING CUSTOMERS...');
    
    const customers = await this.fetchPaginatedData('contacts', 'contacts', {
      // Optional: filter only customers
      // contact_type: 'customer'
    });
    
    this.stats.customers.total = customers.length;
    
    // Transform customers
    const transformedCustomers = customers.map(contact => ({
      // IDs
      customer_id: contact.contact_id,
      contact_id: contact.contact_id,
      
      // Names - multiple fields to prevent "Unknown Customer"
      customer_name: contact.contact_name || contact.company_name || 
                     `${contact.first_name || ''} ${contact.last_name || ''}`.trim() || 
                     'Unknown Customer',
      name: contact.contact_name || contact.company_name || 'Unknown Customer',
      company_name: contact.company_name || contact.contact_name || '',
      company: contact.company_name || contact.contact_name || '',
      contact_name: contact.contact_name || '',
      first_name: contact.first_name || '',
      last_name: contact.last_name || '',
      
      // Contact info
      email: contact.email || '',
      phone: contact.phone || '',
      
      // Address
      billing_address: contact.billing_address || {},
      shipping_address: contact.shipping_address || {},
      billing_city: contact.billing_address?.city || '',
      billing_state: contact.billing_address?.state || '',
      billing_zip: contact.billing_address?.zip || '',
      billing_country: contact.billing_address?.country || '',
      
      // Financial
      currency_code: contact.currency_code || 'GBP',
      outstanding_receivable_amount: parseFloat(contact.outstanding_receivable_amount || 0),
      unused_credits_receivable_amount: parseFloat(contact.unused_credits_receivable_amount || 0),
      
      // Status
      status: contact.status || 'active',
      contact_type: contact.contact_type || 'customer',
      
      // UK specific
      place_of_contact: contact.place_of_contact || '',
      vat_treatment: contact.vat_treatment || '',
      vat_reg_no: contact.vat_reg_no || '',
      
      // Timestamps
      created_time: contact.created_time || new Date().toISOString(),
      last_modified_time: contact.last_modified_time || new Date().toISOString()
    }));
    
    this.stats.customers.processed = await this.storeInFirebase(
      'customers', 
      transformedCustomers, 
      'customer_id'
    );
  }

  /**
   * SYNC SALES ORDERS
   */
  async syncSalesOrders() {
    console.log('\n📥 SYNCING SALES ORDERS...');
    
    const orders = await this.fetchPaginatedData('salesorders', 'salesorders');
    this.stats.orders.total = orders.length;
    
    // Get detailed order information for line items
    console.log('  🔍 Fetching order details for line items...');
    const ordersWithDetails = [];
    
    for (let i = 0; i < orders.length; i++) {
      const order = orders[i];
      
      // Show progress every 50 orders
      if (i > 0 && i % 50 === 0) {
        console.log(`    Progress: ${i}/${orders.length} orders`);
      }
      
      // Try to get detailed order info
      const detailedOrder = await this.fetchItemDetails('salesorders', order.salesorder_id);
      
      if (detailedOrder && detailedOrder.line_items) {
        ordersWithDetails.push({
          ...order,
          line_items: detailedOrder.line_items,
          billing_address: detailedOrder.billing_address,
          shipping_address: detailedOrder.shipping_address,
          taxes: detailedOrder.taxes
        });
      } else {
        ordersWithDetails.push(order);
      }
      
      // Rate limiting
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    // Store orders
    this.stats.orders.processed = await this.storeInFirebase(
      'orders', 
      ordersWithDetails, 
      'salesorder_id'
    );
    
    // Process sales transactions from line items
    console.log('  📊 Processing sales transactions...');
    const transactions = [];
    
    ordersWithDetails.forEach(order => {
      if (order.line_items && Array.isArray(order.line_items)) {
        order.line_items.forEach(item => {
          transactions.push({
            transaction_id: `${order.salesorder_id}_${item.item_id}`,
            item_id: item.item_id,
            item_name: item.name || item.description || '',
            sku: item.sku || '',
            quantity: parseInt(item.quantity || 0),
            price: parseFloat(item.rate || 0),
            total: parseFloat(item.item_total || 0),
            order_id: order.salesorder_id,
            order_number: order.salesorder_number,
            order_date: order.date,
            customer_id: order.customer_id,
            customer_name: order.customer_name,
            salesperson_id: order.salesperson_id || '',
            salesperson_name: order.salesperson_name || '',
            created_at: order.date,
            last_modified: new Date().toISOString()
          });
        });
      }
    });
    
    this.stats.salesTransactions.total = transactions.length;
    this.stats.salesTransactions.processed = await this.storeInFirebase(
      'sales_transactions', 
      transactions, 
      'transaction_id'
    );
  }

  /**
   * SYNC INVOICES
   */
  async syncInvoices() {
    console.log('\n📥 SYNCING INVOICES...');
    
    const invoices = await this.fetchPaginatedData('invoices', 'invoices');
    this.stats.invoices.total = invoices.length;
    
    // Transform invoices
    const transformedInvoices = invoices.map(invoice => ({
      invoice_id: invoice.invoice_id,
      invoice_number: invoice.invoice_number,
      invoice_date: invoice.date,
      date: invoice.date,
      due_date: invoice.due_date,
      status: invoice.status,
      customer_id: invoice.customer_id,
      customer_name: invoice.customer_name,
      email: invoice.email || '',
      total: parseFloat(invoice.total || 0),
      balance: parseFloat(invoice.balance || 0),
      payment_terms: invoice.payment_terms || 0,
      payment_terms_label: invoice.payment_terms_label || '',
      is_emailed: invoice.is_emailed || false,
      currency_code: invoice.currency_code || 'GBP',
      exchange_rate: parseFloat(invoice.exchange_rate || 1),
      salesperson_id: invoice.salesperson_id || '',
      salesperson_name: invoice.salesperson_name || '',
      custom_fields: invoice.custom_fields || [],
      billing_address: invoice.billing_address || {},
      shipping_address: invoice.shipping_address || {},
      created_time: invoice.created_time || invoice.date,
      last_modified_time: invoice.last_modified_time || new Date().toISOString()
    }));
    
    this.stats.invoices.processed = await this.storeInFirebase(
      'invoices', 
      transformedInvoices, 
      'invoice_id'
    );
  }

  /**
   * SYNC PURCHASE ORDERS
   */
  async syncPurchaseOrders() {
    console.log('\n📥 SYNCING PURCHASE ORDERS...');
    
    const purchaseOrders = await this.fetchPaginatedData('purchaseorders', 'purchaseorders');
    this.stats.purchaseOrders.total = purchaseOrders.length;
    
    // Get detailed PO information for line items
    console.log('  🔍 Fetching purchase order details...');
    const posWithDetails = [];
    
    for (let i = 0; i < purchaseOrders.length; i++) {
      const po = purchaseOrders[i];
      
      if (i > 0 && i % 50 === 0) {
        console.log(`    Progress: ${i}/${purchaseOrders.length} POs`);
      }
      
      const detailedPO = await this.fetchItemDetails('purchaseorders', po.purchaseorder_id);
      
      if (detailedPO && detailedPO.line_items) {
        posWithDetails.push({
          ...po,
          line_items: detailedPO.line_items,
          billing_address: detailedPO.billing_address,
          taxes: detailedPO.taxes
        });
      } else {
        posWithDetails.push(po);
      }
      
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    this.stats.purchaseOrders.processed = await this.storeInFirebase(
      'purchase_orders', 
      posWithDetails, 
      'purchaseorder_id'
    );
  }

  /**
   * Clear collections before sync (optional)
   */
  async clearCollections() {
    console.log('\n🗑️  CLEARING EXISTING DATA...');
    
    const collections = ['customers', 'orders', 'invoices', 'purchase_orders', 'sales_transactions'];
    
    for (const collection of collections) {
      try {
        const snapshot = await db.collection(collection).limit(500).get();
        
        if (snapshot.empty) {
          console.log(`  ✅ ${collection} is already empty`);
          continue;
        }
        
        // Delete in batches
        const batch = db.batch();
        snapshot.docs.forEach(doc => {
          batch.delete(doc.ref);
        });
        
        await batch.commit();
        console.log(`  ✅ Cleared ${snapshot.size} documents from ${collection}`);
        
        // If there are more documents, recursively delete
        if (snapshot.size === 500) {
          await this.clearCollection(collection);
        }
        
      } catch (error) {
        console.error(`  ❌ Error clearing ${collection}:`, error.message);
      }
    }
  }

  /**
   * Main sync function
   */
  async runFullSync(clearFirst = false) {
    console.log('🚀 STARTING FULL ZOHO DATA SYNC');
    console.log(`📅 Timestamp: ${new Date().toISOString()}`);
    console.log(`🏢 Organization ID: ${ZOHO_CONFIG.orgId}`);
    console.log('================================\n');
    
    try {
      // Optional: Clear existing data
      if (clearFirst) {
        await this.clearCollections();
      }
      
      // Sync all data types
      await this.syncCustomers();
      await this.syncSalesOrders();
      await this.syncInvoices();
      await this.syncPurchaseOrders();
      
      // Update sync metadata
      await db.collection('sync_metadata').doc('full_sync').set({
        lastSync: new Date().toISOString(),
        stats: this.stats,
        errors: this.errors,
        duration: Date.now() - this.startTime,
        status: this.errors.length === 0 ? 'success' : 'partial_success'
      });
      
      // Print summary
      const duration = (Date.now() - this.startTime) / 1000;
      console.log('\n================================');
      console.log('📊 SYNC SUMMARY:');
      console.log('================================');
      console.log(`Total Duration: ${duration.toFixed(2)} seconds`);
      console.log('\nRecords Processed:');
      
      Object.entries(this.stats).forEach(([type, stats]) => {
        console.log(`  ${type}:`);
        console.log(`    - Fetched: ${stats.total}`);
        console.log(`    - Stored: ${stats.processed}`);
        if (stats.total !== stats.processed) {
          console.log(`    - Failed: ${stats.total - stats.processed}`);
        }
      });
      
      if (this.errors.length > 0) {
        console.log(`\n❌ Errors encountered: ${this.errors.length}`);
        this.errors.slice(0, 10).forEach(err => {
          console.log(`  - ${err.type || err.collection}: ${err.error}`);
        });
        if (this.errors.length > 10) {
          console.log(`  ... and ${this.errors.length - 10} more errors`);
        }
      }
      
      console.log('\n✅ FULL SYNC COMPLETED');
      
      return {
        success: true,
        stats: this.stats,
        errors: this.errors,
        duration: Date.now() - this.startTime
      };
      
    } catch (error) {
      console.error('\n❌ FATAL ERROR:', error);
      return {
        success: false,
        error: error.message,
        stats: this.stats,
        duration: Date.now() - this.startTime
      };
    }
  }
}

// Run the sync if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const sync = new ZohoFullDataSync();
  
  // Check for command line arguments
  const clearFirst = process.argv.includes('--clear');
  
  if (clearFirst) {
    console.log('⚠️  WARNING: --clear flag detected. This will DELETE all existing data before syncing.');
    console.log('Press Ctrl+C to cancel, or wait 5 seconds to continue...\n');
    setTimeout(() => {
      sync.runFullSync(true)
        .then(result => {
          process.exit(result.success ? 0 : 1);
        })
        .catch(error => {
          console.error('❌ Sync failed:', error);
          process.exit(1);
        });
    }, 5000);
  } else {
    sync.runFullSync(false)
      .then(result => {
        process.exit(result.success ? 0 : 1);
      })
      .catch(error => {
        console.error('❌ Sync failed:', error);
        process.exit(1);
      });
  }
}

export default ZohoFullDataSync;