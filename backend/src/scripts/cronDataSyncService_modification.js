// cronDataSyncService_modification.js
// This file shows the modifications needed for cronDataSyncService.js
// to create order_line_items subcollection for new orders

// Add this new method to the CronDataSyncService class:

/**
 * Create order_line_items subcollection for a sales order
 */
async createOrderLineItemsSubcollection(orderId, lineItems, orderData, db) {
  if (!lineItems || !Array.isArray(lineItems) || lineItems.length === 0) {
    return 0;
  }
  
  const lineItemsRef = db.collection('sales_orders').doc(orderId).collection('order_line_items');
  
  // First, check what line items already exist
  const existingLineItems = await lineItemsRef.get();
  const existingIds = new Set(existingLineItems.docs.map(doc => doc.id));
  
  const batch = db.batch();
  let processedItems = 0;
  let skippedItems = 0;
  
  // Get item details for brand information
  const itemIds = [...new Set(lineItems.map(item => item.item_id).filter(id => id))];
  const itemDetailsMap = new Map();
  
  // Batch fetch item details
  if (itemIds.length > 0) {
    for (let i = 0; i < itemIds.length; i += 10) {
      const batchIds = itemIds.slice(i, i + 10);
      const itemsSnapshot = await db.collection('items_data')
        .where('item_id', 'in', batchIds)
        .get();
      
      itemsSnapshot.forEach(doc => {
        itemDetailsMap.set(doc.id, doc.data());
      });
    }
  }
  
  for (const [index, item] of lineItems.entries()) {
    // Only use the actual line_item_id from Zoho
    if (!item.line_item_id) {
      console.warn(`Skipping line item without line_item_id for order ${orderId}`);
      skippedItems++;
      continue;
    }
    
    const lineItemId = item.line_item_id;
    
    // Skip if this line item already exists
    if (existingIds.has(lineItemId)) {
      skippedItems++;
      continue;
    }
    
    const itemDetails = itemDetailsMap.get(item.item_id) || {};
    
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
      
      // Brand information
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
      _source: 'zoho_api',
      _synced_at: admin.firestore.FieldValue.serverTimestamp(),
      _batchId: 0
    };
    
    const docRef = lineItemsRef.doc(lineItemId);
    batch.set(docRef, lineItemData, { merge: true });
    processedItems++;
  }
  
  if (processedItems > 0) {
    await batch.commit();
  }
  
  return processedItems;
}

// MODIFY the existing _batchWrite method to handle order_line_items:
// Replace the existing _batchWrite method with this enhanced version:

async _batchWrite(db, collectionName, dataArray, idKey) {
  if (!dataArray || dataArray.length === 0) {
    console.log(`📝 No data to write to ${collectionName}`);
    return { success: true, count: 0 };
  }

  const collectionRef = db.collection(collectionName);
  const BATCH_SIZE = this.batchConfig.firestoreBatchSize;
  
  let currentBatch = db.batch();
  let currentBatchSize = 0;
  let batchCount = 0;
  let successCount = 0;
  let skippedCount = 0;
  let errorCount = 0;
  let lineItemsCreated = 0;
  
  console.log(`📝 Writing ${dataArray.length} items to ${collectionName} in batches of ${BATCH_SIZE}...`);
  
  for (let i = 0; i < dataArray.length; i++) {
    const item = dataArray[i];
    const docId = item[idKey];
    
    if (!docId || String(docId).trim() === '') {
      skippedCount++;
      continue;
    }
    
    const cleanDocId = String(docId).trim();
    
    try {
      if (currentBatchSize >= BATCH_SIZE) {
        await currentBatch.commit();
        batchCount++;
        successCount += currentBatchSize;
        currentBatch = db.batch();
        currentBatchSize = 0;
        
        // Progress logging
        if (batchCount % 5 === 0) {
          console.log(`  📦 Batch ${batchCount}: ${successCount}/${dataArray.length} items written`);
        }
        
        // Rate limiting between batches
        if (i < dataArray.length - 1) {
          await new Promise(resolve => setTimeout(resolve, this.batchConfig.delayBetweenBatches));
        }
      }
      
      const docRef = collectionRef.doc(cleanDocId);
      const itemWithMetadata = {
        ...item,
        _lastSynced: admin.firestore.FieldValue.serverTimestamp(),
        _syncSource: 'zoho_api',
        _batchId: batchCount
      };
      
      // Special handling for sales_orders collection
      if (collectionName === 'sales_orders' && item.line_items && Array.isArray(item.line_items)) {
        itemWithMetadata._hasLineItemsSubcollection = true;
      }
      
      currentBatch.set(docRef, itemWithMetadata, { merge: true });
      currentBatchSize++;
      
    } catch (error) {
      console.error(`❌ Error processing document ${cleanDocId}:`, error.message);
      errorCount++;
    }
  }
  
  // Commit final batch
  if (currentBatchSize > 0) {
    try {
      await currentBatch.commit();
      batchCount++;
      successCount += currentBatchSize;
    } catch (error) {
      console.error(`❌ Error committing final batch:`, error.message);
      errorCount += currentBatchSize;
    }
  }
  
  // Now process order_line_items subcollections if this is sales_orders
  if (collectionName === 'sales_orders') {
    console.log('📝 Creating order_line_items subcollections...');
    
    for (const order of dataArray) {
      if (order.salesorder_id && order.line_items && Array.isArray(order.line_items)) {
        try {
          const itemsCreated = await this.createOrderLineItemsSubcollection(
            order.salesorder_id,
            order.line_items,
            order,
            db
          );
          lineItemsCreated += itemsCreated;
        } catch (error) {
          console.error(`❌ Error creating line items for order ${order.salesorder_id}:`, error.message);
        }
      }
    }
    
    console.log(`✅ Created ${lineItemsCreated} line items across all orders`);
  }
  
  console.log(`✅ ${collectionName}: ${successCount} written, ${skippedCount} skipped, ${errorCount} errors in ${batchCount} batches`);
  
  return { 
    success: errorCount === 0, 
    count: successCount, 
    skipped: skippedCount, 
    errors: errorCount,
    batches: batchCount,
    lineItemsCreated: lineItemsCreated
  };
}

// ALSO MODIFY the highFrequencySync method to fetch detailed orders:
// In the highFrequencySync method, after filtering new orders, add:

if (newOrders.length > 0) {
  console.log(`Found ${newOrders.length} new/modified orders`);
  
  // Fetch detailed order information for each order
  console.log('📋 Fetching detailed order information...');
  const detailedOrders = [];
  
  for (let i = 0; i < newOrders.length; i += 5) { // Process in small batches
    const batch = newOrders.slice(i, i + 5);
    const batchDetails = await Promise.all(
      batch.map(async (order) => {
        try {
          // If order doesn't have line_items, fetch detailed version
          if (!order.line_items || order.line_items.length === 0) {
            const detailed = await zohoInventoryService.getSalesOrder(order.salesorder_id);
            return detailed || order;
          }
          return order;
        } catch (error) {
          console.warn(`Could not fetch details for order ${order.salesorder_id}:`, error.message);
          return order;
        }
      })
    );
    
    detailedOrders.push(...batchDetails);
    
    // Add delay between batches
    if (i + 5 < newOrders.length) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }
  
  // Enrich orders with UIDs
  const enrichedOrders = await this.enrichOrdersWithUIDs(detailedOrders);
  await this._batchWrite(db, 'sales_orders', enrichedOrders, 'salesorder_id');
  orderCount = enrichedOrders.length;
  
  // Process transactions
  const transactions = await this.processSalesTransactions(enrichedOrders, db);
  if (transactions.length > 0) {
    await this._batchWrite(db, 'sales_transactions', transactions, 'transaction_id');
    transactionCount = transactions.length;
    
    // Update brand statistics
    await this.updateBrandStatistics(transactions, '30_days');
  }
}
