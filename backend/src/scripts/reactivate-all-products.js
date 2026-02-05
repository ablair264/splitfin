#!/usr/bin/env node

// Script to reactivate all products in Firebase items_data collection
// This will mark all products as active and remove deactivation metadata

import { db, initializeFirebase } from '../config/firebase.js';
import admin from 'firebase-admin';

// Ensure Firebase is initialized
initializeFirebase();

async function reactivateAllProducts() {
  console.log('🚀 Starting product reactivation process...\n');
  
  try {
    // Get all items from items_data collection
    const itemsSnapshot = await db.collection('items_data').get();
    const totalItems = itemsSnapshot.size;
    
    console.log(`📊 Found ${totalItems} total items in Firebase\n`);
    
    if (totalItems === 0) {
      console.log('No items found to reactivate.');
      process.exit(0);
    }
    
    // Ask for confirmation
    console.log('⚠️  This will mark ALL products as active.');
    console.log('Press Ctrl+C to cancel, or wait 5 seconds to continue...\n');
    
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    let batch = db.batch();
    let batchCount = 0;
    let reactivatedCount = 0;
    let alreadyActiveCount = 0;
    const batchSize = 400; // Firestore batch limit is 500, using 400 to be safe
    
    console.log('🔄 Processing items...\n');
    
    for (const doc of itemsSnapshot.docs) {
      const item = doc.data();
      const wasInactive = item.status !== 'active';
      
      if (wasInactive) {
        reactivatedCount++;
        console.log(`  ✅ Reactivating: ${item.name || item.item_name} (${item.sku || 'No SKU'})`);
      } else {
        alreadyActiveCount++;
      }
      
      // Update the document
      const updateData = {
        status: 'active',
        _synced_at: admin.firestore.FieldValue.serverTimestamp()
      };
      
      // Use update with merge to ensure we don't overwrite other fields
      batch.update(doc.ref, updateData);
      
      // Delete deactivation fields if they exist
      if (item._deactivated_reason || item._deactivated_at) {
        batch.update(doc.ref, {
          _deactivated_reason: admin.firestore.FieldValue.delete(),
          _deactivated_at: admin.firestore.FieldValue.delete()
        });
      }
      
      batchCount++;
      
      // Commit batch when it reaches the limit
      if (batchCount >= batchSize) {
        await batch.commit();
        console.log(`\n💾 Committed batch of ${batchSize} items...`);
        console.log(`   Progress: ${reactivatedCount + alreadyActiveCount}/${totalItems} items processed\n`);
        
        // Create new batch
        batch = db.batch();
        batchCount = 0;
        
        // Small delay to avoid overwhelming Firestore
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }
    
    // Commit any remaining items
    if (batchCount > 0) {
      await batch.commit();
      console.log(`\n💾 Committed final batch of ${batchCount} items.`);
    }
    
    // Update sync metadata
    await db.collection('sync_metadata').doc('manual_reactivation').set({
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
      reactivatedCount,
      alreadyActiveCount,
      totalProcessed: totalItems,
      reason: 'Manual reactivation after incorrect deactivation'
    });
    
    console.log('\n✅ Product reactivation completed!\n');
    console.log('📊 Summary:');
    console.log(`   Total items processed: ${totalItems}`);
    console.log(`   Items reactivated: ${reactivatedCount}`);
    console.log(`   Items already active: ${alreadyActiveCount}`);
    console.log('\n🎉 All products are now active!');
    
  } catch (error) {
    console.error('\n❌ Error during reactivation:', error);
    process.exit(1);
  }
  
  process.exit(0);
}

// Run the script
reactivateAllProducts().catch(error => {
  console.error('Unhandled error:', error);
  process.exit(1);
});