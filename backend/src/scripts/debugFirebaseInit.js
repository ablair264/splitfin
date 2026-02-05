// server/src/scripts/debugFirebaseInit.js
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import admin from 'firebase-admin';

// Load environment variables
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: join(__dirname, '../../.env') });

console.log('🔍 Debugging Firebase Initialization\n');
console.log('Environment Variables Check:');
console.log('---------------------------');
console.log(`FIREBASE_PROJECT_ID: ${process.env.FIREBASE_PROJECT_ID ? '✅ Set' : '❌ Missing'}`);
console.log(`FIREBASE_CLIENT_EMAIL: ${process.env.FIREBASE_CLIENT_EMAIL ? '✅ Set' : '❌ Missing'}`);
console.log(`FIREBASE_PRIVATE_KEY: ${process.env.FIREBASE_PRIVATE_KEY ? '✅ Set (' + process.env.FIREBASE_PRIVATE_KEY.substring(0, 50) + '...)' : '❌ Missing'}`);
console.log(`FIREBASE_STORAGE_BUCKET: ${process.env.FIREBASE_STORAGE_BUCKET || 'Not set (will use default)'}`);

console.log('\nAttempting Firebase initialization...\n');

try {
  // Try to get existing app
  const existingApp = admin.app();
  console.log('✅ Firebase app already exists:', existingApp.name);
} catch (error) {
  console.log('📝 No existing Firebase app found, initializing...');
  
  try {
    // Check if we have all required credentials
    if (!process.env.FIREBASE_PROJECT_ID || !process.env.FIREBASE_CLIENT_EMAIL || !process.env.FIREBASE_PRIVATE_KEY) {
      throw new Error('Missing required Firebase credentials in environment variables');
    }
    
    const serviceAccount = {
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
    };
    
    // Initialize with explicit storage bucket
    const app = admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      storageBucket: process.env.FIREBASE_STORAGE_BUCKET || `${process.env.FIREBASE_PROJECT_ID}.appspot.com`
    });
    
    console.log('✅ Firebase initialized successfully!');
    console.log(`   Project ID: ${app.options.projectId}`);
    console.log(`   Storage Bucket: ${app.options.storageBucket}`);
    
    // Test Firestore connection
    console.log('\nTesting Firestore connection...');
    const testDoc = await admin.firestore().collection('_test').doc('connection').get();
    console.log('✅ Firestore connection successful!');
    
    // Test Storage connection
    console.log('\nTesting Storage connection...');
    const bucket = admin.storage().bucket();
    console.log(`✅ Storage bucket accessible: ${bucket.name}`);
    
  } catch (initError) {
    console.error('❌ Failed to initialize Firebase:', initError.message);
    console.error('\nFull error:', initError);
  }
}

process.exit(0);