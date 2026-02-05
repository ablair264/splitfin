// cleanupLineItemsFromOrders.js
// Script to remove line_items array from sales_orders documents that have the subcollection

import admin from 'firebase-admin';
import { initializeFirebase } from '../config/firebase.js';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Initialize Firebase
const { db } = initializeFirebase();

async function cleanupLineItems() {
  console.log('🧹 Starting cleanup of line_items from sales_orders documents...');
  
  try {
    // Get all sales orders that have the subcollection flag
    const snapshot = await db.collection('sales_orders')
      .where('_hasLineItemsSubcollection', '==', true)
      .get();
    
    console.log(`📊 Found ${snapshot.size} orders with subcollections`);
    
    let processed = 0;
    let cleaned = 0;
    let batch = db.batch();
    let batchCount = 0;
    const batchSize = 400;
    
    for (const doc of snapshot.docs) {
      const data = doc.data();
      processed++;
      
      // Check if this document has line_items array
      if (data.line_items && Array.isArray(data.line_items)) {
        console.log(`🔧 Removing line_items array from order ${data.salesorder_number} (${doc.id})`);
        
        // Use update with FieldValue.delete() to remove the field
        batch.update(doc.ref, {
          line_items: admin.firestore.FieldValue.delete(),
          _lineItemsCleanedUp: admin.firestore.FieldValue.serverTimestamp()
        });
        
        cleaned++;
        batchCount++;
        
        // Commit batch if size reached
        if (batchCount >= batchSize) {
          await batch.commit();
          console.log(`✅ Committed batch of ${batchCount} updates`);
          batch = db.batch();
          batchCount = 0;
          
          // Add delay to avoid rate limits
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }
      
      if (processed % 100 === 0) {
        console.log(`⏳ Processed ${processed}/${snapshot.size} orders...`);
      }
    }
    
    // Commit any remaining updates
    if (batchCount > 0) {
      await batch.commit();
      console.log(`✅ Committed final batch of ${batchCount} updates`);
    }
    
    console.log('\n' + '='.repeat(60));
    console.log('✅ CLEANUP COMPLETED');
    console.log('='.repeat(60));
    console.log(`Total orders checked: ${processed}`);
    console.log(`Orders cleaned: ${cleaned}`);
    console.log(`Orders already clean: ${processed - cleaned}`);
    console.log('='.repeat(60));
    
  } catch (error) {
    console.error('❌ Cleanup failed:', error);
    throw error;
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  cleanupLineItems()
    .then(() => {
      console.log('✅ Cleanup completed successfully');
      process.exit(0);
    })
    .catch(error => {
      console.error('Fatal error:', error);
      process.exit(1);
    });
}

export { cleanupLineItems };
