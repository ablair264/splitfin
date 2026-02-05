/**
 * Verification script for customer orders sub-collections
 * This script helps verify that orders are properly synced to customer sub-collections
 */

import { db } from '../config/firebase.js';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

async function verifyCustomerOrders() {
  console.log('🔍 Verifying Customer Orders Sub-collections');
  console.log('===========================================');
  console.log('');
  
  try {
    // 1. Get total counts
    console.log('📊 Getting total counts...');
    const salesOrdersCount = await db.collection('sales_orders').count().get();
    const totalOrders = salesOrdersCount.data().count;
    console.log(`Total sales orders: ${totalOrders}`);
    
    // 2. Sample verification - check random customers
    console.log('');
    console.log('📋 Sampling customer orders...');
    
    const customersSnapshot = await db.collection('customers').limit(10).get();
    let totalSubcollectionOrders = 0;
    
    for (const customerDoc of customersSnapshot.docs) {
      const customerId = customerDoc.id;
      const customerData = customerDoc.data();
      
      // Count orders in main collection for this customer
      const mainCollectionSnapshot = await db.collection('sales_orders')
        .where('customer_id', '==', customerId)
        .count()
        .get();
      const mainCount = mainCollectionSnapshot.data().count;
      
      // Count orders in sub-collection
      const subCollectionSnapshot = await customerDoc.ref
        .collection('customers_orders')
        .count()
        .get();
      const subCount = subCollectionSnapshot.data().count;
      
      totalSubcollectionOrders += subCount;
      
      console.log(`\n👤 Customer: ${customerData.display_name || customerData.customer_name || customerId}`);
      console.log(`   📦 Orders in main collection: ${mainCount}`);
      console.log(`   📂 Orders in sub-collection: ${subCount}`);
      
      if (mainCount !== subCount) {
        console.log(`   ⚠️ MISMATCH: ${Math.abs(mainCount - subCount)} orders difference!`);
      } else {
        console.log(`   ✅ Counts match!`);
      }
    }
    
    // 3. Check for orders without customer_id
    console.log('\n');
    console.log('🔍 Checking for orders without customer_id...');
    const noCustomerSnapshot = await db.collection('sales_orders')
      .where('customer_id', '==', null)
      .count()
      .get();
    const noCustomerCount = noCustomerSnapshot.data().count;
    console.log(`Orders without customer_id: ${noCustomerCount}`);
    
    // 4. Recent orders check
    console.log('\n');
    console.log('📅 Checking recent orders (last 24 hours)...');
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    
    const recentOrdersSnapshot = await db.collection('sales_orders')
      .where('_lastSynced', '>=', yesterday)
      .limit(5)
      .get();
    
    for (const orderDoc of recentOrdersSnapshot.docs) {
      const order = orderDoc.data();
      if (order.customer_id) {
        const customerRef = db.collection('customers').doc(order.customer_id);
        const subOrderDoc = await customerRef.collection('customers_orders').doc(order.salesorder_id).get();
        
        console.log(`\n📦 Order: ${order.salesorder_number}`);
        console.log(`   Customer: ${order.customer_name}`);
        console.log(`   In sub-collection: ${subOrderDoc.exists ? '✅ Yes' : '❌ No'}`);
        
        if (subOrderDoc.exists) {
          const subOrderData = subOrderDoc.data();
          console.log(`   Added to customer: ${subOrderData._addedToCustomer?.toDate?.() || 'N/A'}`);
        }
      }
    }
    
    // 5. Summary
    console.log('\n');
    console.log('========================================');
    console.log('📊 VERIFICATION SUMMARY');
    console.log('========================================');
    console.log(`Total orders in sales_orders: ${totalOrders}`);
    console.log(`Orders without customer_id: ${noCustomerCount}`);
    console.log(`Expected orders in sub-collections: ${totalOrders - noCustomerCount}`);
    console.log('========================================');
    
  } catch (error) {
    console.error('❌ Error during verification:', error);
  }
}

// Run verification
verifyCustomerOrders()
  .then(() => {
    console.log('\n✅ Verification complete');
    process.exit(0);
  })
  .catch(error => {
    console.error('❌ Verification failed:', error);
    process.exit(1);
  });
