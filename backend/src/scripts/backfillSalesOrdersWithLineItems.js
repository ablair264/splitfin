// backfillSalesOrdersWithLineItems.js
// Script to backfill sales orders with full details and create order_line_items subcollection

import admin from 'firebase-admin';
import { initializeFirebase } from '../config/firebase.js';
import zohoInventoryService from '../services/zohoInventoryService.js';
import { getAccessToken } from '../api/zoho.js';
import axios from 'axios';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Initialize Firebase
const { db } = initializeFirebase();

// Zoho configuration
const ZOHO_CONFIG = {
  baseUrl: 'https://www.zohoapis.eu/inventory/v1',
  orgId: process.env.ZOHO_ORG_ID
};

// Rate limiting configuration
const RATE_LIMIT = {
  requestsPerMinute: 50,
  delayBetweenRequests: 1500, // 1.5 seconds
  batchSize: 10,
  delayBetweenBatches: 5000 // 5 seconds
};

// Progress tracking
let progress = {
  total: 0,
  processed: 0,
  updated: 0,
  failed: 0,
  skipped: 0
};

/**
 * Fetch detailed sales order from Zoho
 */
async function fetchDetailedSalesOrder(orderId) {
  try {
    const accessToken = await getAccessToken();
    
    const response = await axios.get(
      `${ZOHO_CONFIG.baseUrl}/salesorders/${orderId}`,
      {
        headers: {
          'Authorization': `Zoho-oauthtoken ${accessToken}`
        },
        params: {
          organization_id: ZOHO_CONFIG.orgId
        }
      }
    );
    
    if (response.data?.code === 0) {
      return response.data.salesorder;
    } else {
      console.error(`Zoho API error for order ${orderId}:`, response.data?.message);
      return null;
    }
  } catch (error) {
    console.error(`Error fetching order ${orderId}:`, error.message);
    return null;
  }
}

/**
 * Process line items and create subcollection documents
 */
async function processLineItems(orderId, lineItems, orderData) {
  const lineItemsRef = db.collection('sales_orders').doc(orderId).collection('order_line_items');
  
  // First, check what line items already exist
  const existingLineItems = await lineItemsRef.get();
  const existingIds = new Set(existingLineItems.docs.map(doc => doc.id));
  
  console.log(`  📋 Order has ${existingLineItems.size} existing line items`);
  
  const batch = db.batch();
  let processedItems = 0;
  let skippedItems = 0;
  
  for (const [index, item] of lineItems.entries()) {
    // Only use the actual line_item_id from Zoho, don't create fallback IDs
    if (!item.line_item_id) {
      console.warn(`  ⚠️  Skipping line item without line_item_id at index ${index}`);
      skippedItems++;
      continue;
    }
    
    const lineItemId = item.line_item_id;
    
    // Skip if this line item already exists
    if (existingIds.has(lineItemId)) {
      skippedItems++;
      continue;
    }
    
    // Get item details from items_data collection to ensure we have manufacturer/brand info
    let itemDetails = {};
    try {
      const itemDoc = await db.collection('items_data').doc(item.item_id).get();
      if (itemDoc.exists) {
        itemDetails = itemDoc.data();
      }
    } catch (error) {
      console.warn(`Could not fetch item details for ${item.item_id}`);
    }
    
    // Create line item document with the structure from order_line_items.txt
    const lineItemData = {
      'Document ID': `/sales_orders/${orderId}/order_line_items/${lineItemId}`,
      
      // Item attributes
      attribute_name1: item.attribute_name1 || "",
      attribute_name2: item.attribute_name2 || "",
      attribute_name3: item.attribute_name3 || "",
      attribute_option_data1: item.attribute_option_data1 || "",
      attribute_option_data2: item.attribute_option_data2 || "",
      attribute_option_data3: item.attribute_option_data3 || "",
      attribute_option_name1: item.attribute_option_name1 || "",
      attribute_option_name2: item.attribute_option_name2 || "",
      attribute_option_name3: item.attribute_option_name3 || "",
      
      // Pricing
      bcy_rate: parseFloat(item.bcy_rate || item.rate || 0),
      rate: parseFloat(item.rate || 0),
      sales_rate: parseFloat(item.sales_rate || item.rate || 0),
      discount: parseFloat(item.discount || 0),
      discount_amount: parseFloat(item.discount_amount || 0),
      discounts: item.discounts || [],
      
      // Brand information - prioritize from item details, fallback to line item
      brand: itemDetails.brand || itemDetails.Manufacturer || item.brand || "Unknown Brand",
      brand_normalized: itemDetails.brand_normalized || itemDetails.manufacturer || 
                       (itemDetails.brand || itemDetails.Manufacturer || item.brand || "unknown").toLowerCase().replace(/\s+/g, '-'),
      
      // Item identification
      item_id: item.item_id,
      line_item_id: lineItemId,
      sku: item.sku || itemDetails.sku || "",
      variant_id: item.variant_id || item.item_id,
      
      // Item details
      name: item.name || item.item_name || "",
      item_name: item.name || item.item_name || "",
      description: item.description || "",
      group_name: item.group_name || item.name || item.item_name || "",
      combo_type: item.combo_type || "",
      is_combo_product: item.is_combo_product || false,
      is_unconfirmed_product: item.is_unconfirmed_product || false,
      
      // Quantities
      quantity: parseInt(item.quantity || 0),
      quantity_backordered: parseInt(item.quantity_backordered || 0),
      quantity_cancelled: parseInt(item.quantity_cancelled || 0),
      quantity_delivered: parseInt(item.quantity_delivered || 0),
      quantity_dropshipped: parseInt(item.quantity_dropshipped || 0),
      quantity_invoiced: parseInt(item.quantity_invoiced || 0),
      quantity_invoiced_cancelled: parseInt(item.quantity_invoiced_cancelled || 0),
      quantity_manuallyfulfilled: parseInt(item.quantity_manuallyfulfilled || 0),
      quantity_packed: parseInt(item.quantity_packed || 0),
      quantity_picked: parseInt(item.quantity_picked || 0),
      quantity_returned: parseInt(item.quantity_returned || 0),
      quantity_shipped: parseInt(item.quantity_shipped || 0),
      
      // Totals
      item_sub_total: parseFloat(item.item_sub_total || item.item_total || (item.quantity * item.rate) || 0),
      item_tax_amount: parseFloat(item.tax_amount || 0),
      item_total: parseFloat(item.item_total || item.total || (item.quantity * item.rate) || 0),
      
      // Tax information
      tax_id: item.tax_id || "",
      tax_name: item.tax_name || "",
      tax_percentage: parseFloat(item.tax_percentage || 0),
      tax_type: item.tax_type || "tax",
      line_item_taxes: JSON.stringify(item.line_item_taxes || []),
      
      // Other metadata
      line_item_type: item.line_item_type || "goods",
      product_type: item.product_type || "goods",
      item_type: item.item_type || "inventory",
      unit: item.unit || "pcs",
      pcs: parseInt(item.pcs || 0),
      item_order: parseInt(item.item_order || index + 1),
      
      // Order reference
      salesorder_id: orderId,
      salesorder_number: orderData.salesorder_number || "",
      customer_id: orderData.customer_id || 0,
      customer_name: orderData.customer_name || "",
      date: orderData.date || "",
      status: orderData.status || "",
      
      // Images
      document_id: item.document_id || itemDetails.image_document_id || "",
      image_document_id: item.image_document_id || itemDetails.image_document_id || "",
      image_name: item.image_name || "",
      image_type: item.image_type || "",
      
      // Warehouse
      warehouse_id: item.warehouse_id || orderData.warehouse_id || "",
      warehouse_name: item.warehouse_name || orderData.warehouse_name || "",
      
      // Package details
      package_details: item.package_details || {
        weight_unit: "kg",
        length: "",
        width: "",
        dimension_unit: "cm",
        weight: "",
        height: ""
      },
      
      // Additional fields
      custom_field_hash: item.custom_field_hash || {},
      item_custom_fields: item.item_custom_fields || [],
      tags: item.tags || [],
      mapped_items: item.mapped_items || [],
      header_id: item.header_id || "",
      header_name: item.header_name || "",
      pricebook_id: item.pricebook_id || "",
      project_id: item.project_id || "",
      is_fulfillable: item.is_fulfillable || 0,
      is_invoiced: item.is_invoiced !== undefined ? item.is_invoiced : true,
      is_returnable: item.is_returnable !== undefined ? item.is_returnable : true,
      
      // Sync metadata
      _source: 'zoho_backfill',
      _synced_at: admin.firestore.FieldValue.serverTimestamp(),
      _backfilled: true
    };
    
    // Add to batch
    const docRef = lineItemsRef.doc(lineItemId);
    batch.set(docRef, lineItemData, { merge: true });
    processedItems++;
  }
  
  // Commit the batch
  if (processedItems > 0) {
    await batch.commit();
    console.log(`  ✅ Created ${processedItems} new line items for order ${orderData.salesorder_number}`);
  }
  
  if (skippedItems > 0) {
    console.log(`  ⏭️  Skipped ${skippedItems} existing line items`);
  }
  
  return processedItems;
}

/**
 * Update sales order with full details
 */
async function updateSalesOrder(orderId, zohoOrder) {
  try {
    const orderRef = db.collection('sales_orders').doc(orderId);
    
    // Get existing order data
    const existingDoc = await orderRef.get();
    const existingData = existingDoc.exists ? existingDoc.data() : {};
    
    // Merge with new detailed data from Zoho (including line_items)
    const updatedData = {
      ...existingData,
      ...zohoOrder,
      
      // Ensure critical fields are preserved
      salesorder_id: orderId,
      _lastDetailedSync: admin.firestore.FieldValue.serverTimestamp(),
      _hasLineItemsSubcollection: true,
      _backfilled: true
    };
    
    // Update the main order document
    await orderRef.set(updatedData, { merge: true });
    
    // Process line items subcollection
    if (zohoOrder.line_items && Array.isArray(zohoOrder.line_items)) {
      await processLineItems(orderId, zohoOrder.line_items, zohoOrder);
    }
    
    return true;
  } catch (error) {
    console.error(`Error updating order ${orderId}:`, error);
    return false;
  }
}

/**
 * Main backfill function
 */
async function backfillSalesOrders(options = {}) {
  console.log('🚀 Starting sales orders backfill process...');
  console.log('📋 Options:', options);
  
  try {
    // Clear any existing kill switch
    await db.collection('sync_metadata').doc('sales_orders_backfill').set({
      killSwitch: false,
      startedAt: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });
    // Get all sales orders from Firebase
    let query = db.collection('sales_orders');
    
    // Apply filters if provided
    if (options.startDate) {
      query = query.where('date', '>=', options.startDate);
    }
    if (options.endDate) {
      query = query.where('date', '<=', options.endDate);
    }
    if (options.limit) {
      query = query.limit(options.limit);
    }
    
    // Add ordering
    query = query.orderBy('date', 'desc');
    
    const snapshot = await query.get();
    progress.total = snapshot.size;
    
    console.log(`📊 Found ${progress.total} sales orders to process`);
    
    if (progress.total === 0) {
      console.log('No orders found matching criteria');
      return;
    }
    
    // Process in batches
    const orders = [];
    snapshot.forEach(doc => {
      const data = doc.data();
      // Skip if already backfilled (unless force option is set)
      if (!options.force && data._hasLineItemsSubcollection) {
        progress.skipped++;
        return;
      }
      orders.push({ id: doc.id, data });
    });
    
    console.log(`📝 ${orders.length} orders need processing (${progress.skipped} already have line items)`);
    
    // Process orders in batches
    for (let i = 0; i < orders.length; i += RATE_LIMIT.batchSize) {
      const batch = orders.slice(i, i + RATE_LIMIT.batchSize);
      const batchNumber = Math.floor(i / RATE_LIMIT.batchSize) + 1;
      const totalBatches = Math.ceil(orders.length / RATE_LIMIT.batchSize);
      
      console.log(`\n🔄 Processing batch ${batchNumber}/${totalBatches} (${batch.length} orders)...`);
      
      for (const order of batch) {
        try {
          // Check for kill switch
          const killSwitchDoc = await db.collection('sync_metadata').doc('sales_orders_backfill').get();
          if (killSwitchDoc.exists && killSwitchDoc.data().killSwitch) {
            console.log('\n🛑 Kill switch detected! Stopping backfill process...');
            
            // Update metadata with stopped status
            await db.collection('sync_metadata').doc('sales_orders_backfill').set({
              lastRun: admin.firestore.FieldValue.serverTimestamp(),
              progress: progress,
              status: 'stopped',
              stoppedReason: 'Kill switch activated'
            }, { merge: true });
            
            throw new Error('Process stopped by kill switch');
          }
          
          progress.processed++;
          const percent = ((progress.processed + progress.skipped) / progress.total * 100).toFixed(1);
          
          console.log(`\n[${percent}%] Processing order ${order.data.salesorder_number} (${order.id})...`);
          
          // Add delay between requests
          await new Promise(resolve => setTimeout(resolve, RATE_LIMIT.delayBetweenRequests));
          
          // Fetch detailed order from Zoho
          const detailedOrder = await fetchDetailedSalesOrder(order.id);
          
          if (detailedOrder) {
            const success = await updateSalesOrder(order.id, detailedOrder);
            if (success) {
              progress.updated++;
            } else {
              progress.failed++;
            }
          } else {
            console.warn(`  ⚠️  Could not fetch details for order ${order.id}`);
            progress.failed++;
          }
          
        } catch (error) {
          console.error(`  ❌ Error processing order ${order.id}:`, error.message);
          progress.failed++;
        }
      }
      
      // Delay between batches
      if (i + RATE_LIMIT.batchSize < orders.length) {
        console.log(`\n⏳ Waiting ${RATE_LIMIT.delayBetweenBatches / 1000}s before next batch...`);
        await new Promise(resolve => setTimeout(resolve, RATE_LIMIT.delayBetweenBatches));
      }
    }
    
    // Final summary
    console.log('\n' + '='.repeat(60));
    console.log('✅ BACKFILL COMPLETED');
    console.log('='.repeat(60));
    console.log(`Total orders: ${progress.total}`);
    console.log(`Processed: ${progress.processed}`);
    console.log(`Updated: ${progress.updated}`);
    console.log(`Failed: ${progress.failed}`);
    console.log(`Skipped (already had line items): ${progress.skipped}`);
    console.log('='.repeat(60));
    
    // Update sync metadata
    await db.collection('sync_metadata').doc('sales_orders_backfill').set({
      lastRun: admin.firestore.FieldValue.serverTimestamp(),
      progress: progress,
      options: options,
      status: 'completed'
    });
    
  } catch (error) {
    console.error('❌ Backfill process failed:', error);
    
    // Update sync metadata with error
    await db.collection('sync_metadata').doc('sales_orders_backfill').set({
      lastRun: admin.firestore.FieldValue.serverTimestamp(),
      progress: progress,
      error: error.message,
      status: 'failed'
    });
    
    throw error;
  }
}

/**
 * Command line interface
 */
async function main() {
  const args = process.argv.slice(2);
  const options = {};
  
  // Parse command line arguments
  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--start-date':
        options.startDate = args[++i];
        break;
      case '--end-date':
        options.endDate = args[++i];
        break;
      case '--limit':
        options.limit = parseInt(args[++i]);
        break;
      case '--force':
        options.force = true;
        break;
      case '--dry-run':
        options.dryRun = true;
        break;
      case '--help':
        console.log(`
Sales Orders Backfill Script
============================

This script fetches detailed sales order information from Zoho and creates 
the order_line_items subcollection for each order.

Usage:
  node backfillSalesOrdersWithLineItems.js [options]

Options:
  --start-date YYYY-MM-DD   Process orders from this date onwards
  --end-date YYYY-MM-DD     Process orders up to this date
  --limit NUMBER            Process only this many orders (for testing)
  --force                   Re-process orders that already have line items
  --dry-run                 Show what would be processed without making changes
  --help                    Show this help message

Examples:
  # Process all orders
  node backfillSalesOrdersWithLineItems.js

  # Process orders from last 7 days
  node backfillSalesOrdersWithLineItems.js --start-date 2025-07-14

  # Process first 10 orders for testing
  node backfillSalesOrdersWithLineItems.js --limit 10

  # Re-process all orders (force update)
  node backfillSalesOrdersWithLineItems.js --force
        `);
        process.exit(0);
        break;
    }
  }
  
  // Dry run mode
  if (options.dryRun) {
    console.log('🔍 DRY RUN MODE - No changes will be made');
    
    let query = db.collection('sales_orders');
    if (options.startDate) query = query.where('date', '>=', options.startDate);
    if (options.endDate) query = query.where('date', '<=', options.endDate);
    if (options.limit) query = query.limit(options.limit);
    
    const snapshot = await query.get();
    const needsProcessing = [];
    
    snapshot.forEach(doc => {
      const data = doc.data();
      if (!options.force && data._hasLineItemsSubcollection) return;
      needsProcessing.push({
        id: doc.id,
        salesorder_number: data.salesorder_number,
        date: data.date,
        customer_name: data.customer_name,
        total: data.total
      });
    });
    
    console.log(`\nWould process ${needsProcessing.length} orders:`);
    needsProcessing.slice(0, 10).forEach(order => {
      console.log(`  - ${order.salesorder_number} (${order.date}) - ${order.customer_name} - £${order.total}`);
    });
    if (needsProcessing.length > 10) {
      console.log(`  ... and ${needsProcessing.length - 10} more`);
    }
    
    process.exit(0);
  }
  
  // Run the backfill
  await backfillSalesOrders(options);
  
  process.exit(0);
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

export { backfillSalesOrders };
