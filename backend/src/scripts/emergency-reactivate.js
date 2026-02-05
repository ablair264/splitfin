#!/usr/bin/env node

// Emergency reactivation script - bypasses shared config
// This script directly initializes Firebase to avoid any config issues

import admin from 'firebase-admin';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

console.log('🚨 Emergency Product Reactivation Script\n');

async function emergencyReactivate() {
  try {
    // Directly read service account key
    const serviceAccountPath = join(__dirname, '../../serviceAccountKey.json');
    console.log(`📄 Loading service account from: ${serviceAccountPath}`);
    
    const serviceAccount = JSON.parse(readFileSync(serviceAccountPath, 'utf8'));
    console.log(`✅ Service account loaded for project: ${serviceAccount.project_id}\n`);
    
    // Initialize Firebase directly
    if (!admin.apps.length) {
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        projectId: serviceAccount.project_id
      });
      console.log('✅ Firebase initialized\n');
    }
    
    const db = admin.firestore();
    
    // Get inactive items count first
    const inactiveSnapshot = await db.collection('items_data')
      .where('status', '!=', 'active')
      .get();
    
    const totalInactive = inactiveSnapshot.size;
    
    if (totalInactive === 0) {
      console.log('✅ All products are already active! Nothing to do.');
      return;
    }
    
    console.log(`Found ${totalInactive} inactive products. Starting reactivation...\n`);
    
    let batch = db.batch();
    let count = 0;
    const batchSize = 400;
    
    // Process each inactive item
    for (const doc of inactiveSnapshot.docs) {
      const item = doc.data();
      console.log(`  Reactivating: ${item.name || item.sku || doc.id}`);
      
      // Simple update - just set status to active
      batch.update(doc.ref, {
        status: 'active',
        _reactivated_at: admin.firestore.FieldValue.serverTimestamp()
      });
      
      count++;
      
      if (count % batchSize === 0) {
        await batch.commit();
        console.log(`\n💾 Committed ${count}/${totalInactive} items...\n`);
        batch = db.batch();
      }
    }
    
    // Commit remaining
    if (count % batchSize !== 0) {
      await batch.commit();
    }
    
    console.log(`\n✅ Successfully reactivated ${count} products!`);
    console.log('🎉 All products are now active!\n');
    
  } catch (error) {
    console.error('\n❌ Error:', error.message);
    
    if (error.code === 'auth/invalid-credential' || error.code === 16) {
      console.error('\n💡 Authentication failed. Please:');
      console.error('1. Go to Firebase Console > Project Settings > Service Accounts');
      console.error('2. Click "Generate New Private Key"');
      console.error('3. Save the downloaded file as serviceAccountKey.json in the server directory');
      console.error('4. Run this script again');
    }
  }
}

// Run immediately
emergencyReactivate()
  .then(() => process.exit(0))
  .catch(() => process.exit(1));