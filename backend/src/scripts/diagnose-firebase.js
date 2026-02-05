#!/usr/bin/env node

// Diagnostic script to test Firebase authentication and connection

import { db, initializeFirebase } from '../config/firebase.js';
import admin from 'firebase-admin';
import dotenv from 'dotenv';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// Load environment variables
dotenv.config();

console.log('🔍 Firebase Authentication Diagnostic\n');
console.log('='.repeat(50));

// Check environment
console.log('📋 Environment:');
console.log(`   NODE_ENV: ${process.env.NODE_ENV || 'not set'}`);
console.log(`   FIREBASE_SERVICE_ACCOUNT_JSON: ${process.env.FIREBASE_SERVICE_ACCOUNT_JSON ? 'SET (using env var)' : 'NOT SET (using file)'}`);

// Check service account file
try {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = dirname(__filename);
  const serviceAccountPath = join(__dirname, '../../serviceAccountKey.json');
  
  console.log(`\n📄 Service Account File:`);
  console.log(`   Path: ${serviceAccountPath}`);
  
  const serviceAccount = JSON.parse(readFileSync(serviceAccountPath, 'utf8'));
  console.log(`   Project ID: ${serviceAccount.project_id || 'NOT FOUND'}`);
  console.log(`   Client Email: ${serviceAccount.client_email || 'NOT FOUND'}`);
  console.log(`   Private Key: ${serviceAccount.private_key ? 'Present' : 'MISSING'}`);
  console.log(`   Private Key ID: ${serviceAccount.private_key_id ? 'Present' : 'MISSING'}`);
} catch (error) {
  console.log(`   ❌ Error reading service account: ${error.message}`);
}

console.log('\n' + '='.repeat(50));

// Try to initialize Firebase
console.log('\n🚀 Attempting Firebase initialization...\n');

try {
  // Force re-initialization for testing
  const result = initializeFirebase();
  
  console.log('✅ Firebase initialized successfully!');
  
  // Test Firestore connection
  console.log('\n🔄 Testing Firestore connection...');
  
  // Try to read a simple document
  const testCollection = db.collection('sync_metadata');
  const snapshot = await testCollection.limit(1).get();
  
  console.log(`✅ Firestore connection successful!`);
  console.log(`   Can read collections: Yes`);
  console.log(`   Test query returned ${snapshot.size} document(s)`);
  
  // Try to count items_data collection
  console.log('\n📊 Checking items_data collection...');
  const itemsCount = await db.collection('items_data').count().get();
  console.log(`   Total items in collection: ${itemsCount.data().count}`);
  
  // Check for inactive items
  const inactiveCount = await db.collection('items_data')
    .where('status', '!=', 'active')
    .count()
    .get();
  console.log(`   Inactive items: ${inactiveCount.data().count}`);
  
  console.log('\n✅ All tests passed! Firebase is properly configured.');
  
} catch (error) {
  console.error('\n❌ Firebase initialization or connection failed:');
  console.error(`   Error: ${error.message}`);
  
  if (error.code) {
    console.error(`   Error Code: ${error.code}`);
  }
  
  if (error.code === 16) {
    console.error('\n💡 Authentication Error - Possible causes:');
    console.error('   1. Service account key is invalid or expired');
    console.error('   2. Project ID in service account doesn\'t match your Firebase project');
    console.error('   3. Service account doesn\'t have necessary permissions');
    console.error('   4. Firebase project has been deleted or suspended');
  }
  
  console.error('\n💡 Troubleshooting steps:');
  console.error('   1. Verify the service account key is from the correct Firebase project');
  console.error('   2. Download a fresh service account key from Firebase Console:');
  console.error('      Project Settings > Service Accounts > Generate New Private Key');
  console.error('   3. Replace the existing serviceAccountKey.json with the new one');
  
  process.exit(1);
}

process.exit(0);