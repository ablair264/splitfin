// cleanupDuplicateLineItems.js
// Script to delete duplicate order_line_items entries that end with _number

import admin from 'firebase-admin';
import { initializeFirebase } from '../config/firebase.js';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Initialize Firebase
const { db } = initializeFirebase();

async function cleanupDuplicateLineItems() {
  console.log('🧹 Starting cleanup of duplicate line items...');
  
  try {
    // Get all sales orders
    const ordersSnapshot = await db.collection('sales_orders').get();
    console.log(`📊 Found ${ordersSnapshot.size} sales orders to check`);
    
    let totalDeleted = 0;
    let ordersProcessed = 0;
    let ordersWithDuplicates = 0;
    
    for (const orderDoc of ordersSnapshot.docs) {
      ordersProcessed++;
      const orderData = orderDoc.data();
      
      // Get all line items for this order
      const lineItemsSnapshot = await orderDoc.ref.collection('order_line_items').get();
      
      if (lineItemsSnapshot.empty) {
        continue;
      }
      
      // Find duplicates (IDs ending with _number)
      const duplicatePattern = /_\d+$/; // Ends with underscore followed by one or more digits
      const toDelete = [];
      
      lineItemsSnapshot.forEach(doc => {
        if (duplicatePattern.test(doc.id)) {
          toDelete.push(doc);
        }
      });
      
      if (toDelete.length > 0) {
        ordersWithDuplicates++;
        console.log(`\n🔍 Order ${orderData.salesorder_number} (${orderDoc.id}) has ${toDelete.length} duplicate line items`);
        
        // Delete in batches
        const batch = db.batch();
        let batchCount = 0;
        
        for (const doc of toDelete) {
          console.log(`  - Deleting duplicate: ${doc.id}`);
          batch.delete(doc.ref);
          batchCount++;
          totalDeleted++;
          
          // Commit batch if it reaches 500 (Firestore limit)
          if (batchCount >= 500) {
            await batch.commit();
            batchCount = 0;
          }
        }
        
        // Commit remaining deletes
        if (batchCount > 0) {
          await batch.commit();
        }
      }
      
      // Progress update
      if (ordersProcessed % 100 === 0) {
        console.log(`⏳ Processed ${ordersProcessed}/${ordersSnapshot.size} orders...`);
      }
    }
    
    console.log('\n' + '='.repeat(60));
    console.log('✅ CLEANUP COMPLETED');
    console.log('='.repeat(60));
    console.log(`Total orders checked: ${ordersProcessed}`);
    console.log(`Orders with duplicates: ${ordersWithDuplicates}`);
    console.log(`Total line items deleted: ${totalDeleted}`);
    console.log('='.repeat(60));
    
  } catch (error) {
    console.error('❌ Cleanup failed:', error);
    throw error;
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  cleanupDuplicateLineItems()
    .then(() => {
      console.log('✅ Cleanup completed successfully');
      process.exit(0);
    })
    .catch(error => {
      console.error('Fatal error:', error);
      process.exit(1);
    });
}

export { cleanupDuplicateLineItems };
