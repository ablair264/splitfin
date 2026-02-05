// Emergency stop for backfill process
import admin from 'firebase-admin';
import { initializeFirebase } from '../config/firebase.js';

const { db } = initializeFirebase();

async function stopBackfill() {
  console.log('🛑 Setting kill switch for backfill process...');
  
  await db.collection('sync_metadata').doc('sales_orders_backfill').set({
    killSwitch: true,
    stoppedAt: admin.firestore.FieldValue.serverTimestamp()
  }, { merge: true });
  
  console.log('✅ Kill switch set. The backfill process will stop at the next order.');
}

stopBackfill().then(() => process.exit(0));
