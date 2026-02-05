import admin from 'firebase-admin';
import dotenv from 'dotenv';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// Load environment variables
dotenv.config();

// Singleton pattern to ensure single initialization
let isInitialized = false;
let db = null;
let auth = null;

// Function to initialize Firebase
function initializeFirebase() {
  if (isInitialized) {
    console.log('✅ Firebase already initialized, skipping...');
    return { db, auth };
  }
  
  if (admin.apps.length > 0) {
    console.log('✅ Firebase app already exists, using existing instance');
    db = admin.firestore();
    auth = admin.auth();
    isInitialized = true;
    return { db, auth };
  }

  try {
    let serviceAccount;
    
    // First, try to get service account from environment variable
    if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
      console.log('🔍 Using Firebase service account from environment variable');
      try {
        serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
      } catch (parseError) {
        console.error('❌ Failed to parse FIREBASE_SERVICE_ACCOUNT_JSON:', parseError.message);
        throw new Error('Invalid JSON in FIREBASE_SERVICE_ACCOUNT_JSON environment variable');
      }
    } else {
      // Fallback to reading from file (for local development)
      console.log('🔍 Using Firebase service account from file');
      try {
        const __filename = fileURLToPath(import.meta.url);
        const __dirname = dirname(__filename);
        const serviceAccountPath = join(__dirname, '../../serviceAccountKey.json');
        serviceAccount = JSON.parse(readFileSync(serviceAccountPath, 'utf8'));
      } catch (fileError) {
        console.error('❌ Failed to read service account file:', fileError.message);
        throw new Error('No Firebase credentials found. Set FIREBASE_SERVICE_ACCOUNT_JSON environment variable or provide serviceAccountKey.json file');
      }
    }
    
    // Validate service account has required fields
    if (!serviceAccount.project_id || !serviceAccount.private_key || !serviceAccount.client_email) {
      throw new Error('Invalid service account: missing required fields');
    }
    
    // Initialize the app
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      // Add project ID explicitly
      projectId: serviceAccount.project_id,
      // Add storage bucket
      storageBucket: process.env.FIREBASE_STORAGE_BUCKET || `${serviceAccount.project_id}.appspot.com`
    });
    
    console.log('✅ Firebase Admin SDK initialized successfully.');
    console.log(`📊 Connected to project: ${serviceAccount.project_id}`);
    
    // Initialize Firestore with error handling
    try {
      db = admin.firestore();
      // Configure Firestore settings
      db.settings({
        ignoreUndefinedProperties: true,
        preferRest: true // This can help with module resolution issues
      });
      console.log('✅ Firestore configured successfully.');
    } catch (firestoreError) {
      console.error('❌ Failed to initialize Firestore:', firestoreError.message);
      throw firestoreError;
    }
    
    // Initialize Auth
    auth = admin.auth();
    isInitialized = true;
    
  } catch (error) {
    console.error('❌ Firebase Admin SDK initialization failed:', error.message);
    
    // Provide helpful error messages
    if (process.env.NODE_ENV === 'production') {
      console.error('💡 In production: Ensure FIREBASE_SERVICE_ACCOUNT_JSON is set in your environment variables');
      console.error('💡 The value should be the entire JSON content of your service account key file');
    } else {
      console.error('💡 In development: Either set FIREBASE_SERVICE_ACCOUNT_JSON or ensure serviceAccountKey.json exists');
    }
    
    // Don't exit immediately in production - let the error bubble up
    throw error;
  }
  
  return { db, auth };
}

// Initialize on module load
try {
  const result = initializeFirebase();
  db = result.db;
  auth = result.auth;
} catch (error) {
  console.error('Failed to initialize Firebase on module load:', error.message);
  // In production, we might want to retry or handle this differently
  if (process.env.NODE_ENV !== 'production') {
    process.exit(1);
  }
}

// Export the initialized services
export { db, auth, initializeFirebase };
export default admin;