/**
 * Backfill script to add all existing sales_orders to customer sub-collections
 * This script reads all sales orders from the sales_orders collection and
 * adds them to the corresponding customer's customers_orders sub-collection
 */

import admin from 'firebase-admin';
import { db } from '../config/firebase.js';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

class CustomerOrdersBackfill {
  constructor() {
    this.stats = {
      totalOrders: 0,
      processedOrders: 0,
      skippedOrders: 0,
      errors: 0,
      customersProcessed: new Set(),
      startTime: Date.now()
    };
    
    this.BATCH_SIZE = 400;
    this.PAGE_SIZE = 1000; // Firestore query limit
  }
  
  /**
   * Main backfill process
   */
  async runBackfill() {
    console.log('🚀 Starting customer orders backfill...');
    console.log('📅 Timestamp:', new Date().toISOString());
    console.log('');
    
    try {
      // Get total count first
      const countSnapshot = await db.collection('sales_orders').count().get();
      this.stats.totalOrders = countSnapshot.data().count;
      
      console.log(`📊 Found ${this.stats.totalOrders} total sales orders to process`);
      console.log('');
      
      // Process orders in pages
      let lastDoc = null;
      let pageNumber = 0;
      
      while (true) {
        pageNumber++;
        console.log(`📄 Processing page ${pageNumber}...`);
        
        // Build query
        let query = db.collection('sales_orders')
          .orderBy('salesorder_id')
          .limit(this.PAGE_SIZE);
        
        if (lastDoc) {
          query = query.startAfter(lastDoc);
        }
        
        const snapshot = await query.get();
        
        if (snapshot.empty) {
          console.log('✅ No more orders to process');
          break;
        }
        
        // Process this page of orders
        const orders = snapshot.docs.map(doc => ({
          ...doc.data(),
          _docId: doc.id
        }));
        
        await this.processOrderBatch(orders);
        
        // Update last document for pagination
        lastDoc = snapshot.docs[snapshot.docs.length - 1];
        
        // Show progress
        this.showProgress();
        
        // Add a small delay between pages to avoid overwhelming the system
        if (this.stats.processedOrders < this.stats.totalOrders) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }
      
      // Final summary
      this.showFinalSummary();
      
    } catch (error) {
      console.error('❌ Fatal error during backfill:', error);
      this.showFinalSummary();
      process.exit(1);
    }
  }
  
  /**
   * Process a batch of orders
   */
  async processOrderBatch(orders) {
    const batches = [];
    let currentBatch = db.batch();
    let currentBatchCount = 0;
    
    for (const order of orders) {
      if (!order.customer_id) {
        console.warn(`⚠️ Order ${order.salesorder_id} has no customer_id, skipping...`);
        this.stats.skippedOrders++;
        continue;
      }
      
      try {
        // Reference to the customer document and sub-collection
        const customerRef = db.collection('customers').doc(order.customer_id.trim());
        const customerOrderRef = customerRef.collection('customers_orders').doc(order.salesorder_id);
        
        // Track unique customers
        this.stats.customersProcessed.add(order.customer_id);
        
        // Create order data for sub-collection
        const orderData = {
          ...order,
          _addedToCustomer: admin.firestore.FieldValue.serverTimestamp(),
          _backfilled: true,
          _backfillDate: new Date().toISOString()
        };
        
        // Remove internal fields
        delete orderData._docId;
        
        currentBatch.set(customerOrderRef, orderData, { merge: true });
        currentBatchCount++;
        
        // If batch is full, save it and create a new one
        if (currentBatchCount >= this.BATCH_SIZE) {
          batches.push(currentBatch);
          currentBatch = db.batch();
          currentBatchCount = 0;
        }
        
      } catch (error) {
        console.error(`❌ Error processing order ${order.salesorder_id}:`, error.message);
        this.stats.errors++;
      }
    }
    
    // Add the last batch if it has any operations
    if (currentBatchCount > 0) {
      batches.push(currentBatch);
    }
    
    // Commit all batches
    console.log(`💾 Committing ${batches.length} batches...`);
    
    for (let i = 0; i < batches.length; i++) {
      try {
        await batches[i].commit();
        this.stats.processedOrders += (i === batches.length - 1 ? currentBatchCount : this.BATCH_SIZE);
      } catch (error) {
        console.error(`❌ Error committing batch ${i + 1}:`, error.message);
        this.stats.errors += this.BATCH_SIZE;
      }
      
      // Rate limiting between batch commits
      if (i < batches.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }
  }
  
  /**
   * Show progress
   */
  showProgress() {
    const processed = this.stats.processedOrders + this.stats.skippedOrders + this.stats.errors;
    const percentage = ((processed / this.stats.totalOrders) * 100).toFixed(2);
    const elapsed = Math.floor((Date.now() - this.stats.startTime) / 1000);
    const rate = processed > 0 ? Math.floor(processed / elapsed) : 0;
    
    console.log(`📊 Progress: ${processed}/${this.stats.totalOrders} (${percentage}%)`);
    console.log(`   ✅ Processed: ${this.stats.processedOrders}`);
    console.log(`   ⏭️ Skipped: ${this.stats.skippedOrders}`);
    console.log(`   ❌ Errors: ${this.stats.errors}`);
    console.log(`   👥 Unique customers: ${this.stats.customersProcessed.size}`);
    console.log(`   ⏱️ Elapsed: ${elapsed}s (${rate} orders/second)`);
    console.log('');
  }
  
  /**
   * Show final summary
   */
  showFinalSummary() {
    const elapsed = Math.floor((Date.now() - this.stats.startTime) / 1000);
    const minutes = Math.floor(elapsed / 60);
    const seconds = elapsed % 60;
    
    console.log('');
    console.log('========================================');
    console.log('📊 BACKFILL COMPLETE - FINAL SUMMARY');
    console.log('========================================');
    console.log(`✅ Successfully processed: ${this.stats.processedOrders} orders`);
    console.log(`⏭️ Skipped (no customer_id): ${this.stats.skippedOrders} orders`);
    console.log(`❌ Errors: ${this.stats.errors}`);
    console.log(`👥 Unique customers with orders: ${this.stats.customersProcessed.size}`);
    console.log(`⏱️ Total time: ${minutes}m ${seconds}s`);
    console.log(`📈 Average rate: ${Math.floor(this.stats.processedOrders / elapsed)} orders/second`);
    console.log('========================================');
  }
  
  /**
   * Verify backfill by sampling some customers
   */
  async verifyBackfill(sampleSize = 5) {
    console.log('');
    console.log('🔍 Verifying backfill with sample customers...');
    
    try {
      // Get a sample of customers
      const customersSnapshot = await db.collection('customers')
        .limit(sampleSize)
        .get();
      
      for (const customerDoc of customersSnapshot.docs) {
        const customerId = customerDoc.id;
        const customerData = customerDoc.data();
        
        // Count orders in sub-collection
        const ordersSnapshot = await customerDoc.ref
          .collection('customers_orders')
          .count()
          .get();
        
        const orderCount = ordersSnapshot.data().count;
        
        console.log(`👤 Customer: ${customerData.display_name || customerId}`);
        console.log(`   📦 Orders in sub-collection: ${orderCount}`);
      }
      
    } catch (error) {
      console.error('❌ Error during verification:', error);
    }
  }
}

// Run the backfill
async function main() {
  const backfill = new CustomerOrdersBackfill();
  
  // Add command line argument parsing
  const args = process.argv.slice(2);
  const isDryRun = args.includes('--dry-run');
  const shouldVerify = args.includes('--verify');
  
  if (isDryRun) {
    console.log('🔍 DRY RUN MODE - No changes will be made');
    console.log('');
    // In dry run, just show what would be done
    const countSnapshot = await db.collection('sales_orders').count().get();
    console.log(`Would process ${countSnapshot.data().count} sales orders`);
    process.exit(0);
  }
  
  // Run the actual backfill
  await backfill.runBackfill();
  
  // Optionally verify the results
  if (shouldVerify) {
    await backfill.verifyBackfill(10);
  }
  
  console.log('');
  console.log('✅ Backfill script completed');
  process.exit(0);
}

// Handle errors
process.on('unhandledRejection', (error) => {
  console.error('❌ Unhandled promise rejection:', error);
  process.exit(1);
});

// Run the script
main().catch(error => {
  console.error('❌ Script failed:', error);
  process.exit(1);
});
