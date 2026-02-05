// server/src/syncInventory.js
import admin from 'firebase-admin';
import crypto from 'crypto';
import { getInventoryContactIdByEmail, fetchProductsFromInventory, fetchCustomersFromCRM } from './api/zoho.js';
import productSyncService from './services/productSyncService.js';
import zohoInventoryService from './services/zohoInventoryService.js';
import dotenv from 'dotenv';
import { db } from './config/firebase.js'
import { fileURLToPath } from 'url';

// Load environment variables
dotenv.config();

// Environment configuration
const IS_PRODUCTION = process.env.NODE_ENV === 'production';
const BATCH_SIZE = parseInt(process.env.BATCH_SIZE || '100');
const SYNC_INTERVAL = parseInt(process.env.SYNC_INTERVAL_MINUTES || '30') * 60 * 1000;

function logError(context, error) {
  console.error(`❌ Error in ${context}:`, error);
  }
  
/**
 * Check if initial sync has been completed
 */
async function isInitialSyncCompleted(collection) {
  const doc = await db.collection('sync_metadata').doc(collection).get();
  return doc.exists && doc.data().initialSyncCompleted === true;
}

/**
 * Get last successful sync timestamp
 */
async function getLastSyncTimestamp(collection) {
  const doc = await db.collection('sync_metadata').doc(collection).get();
  if (doc.exists && doc.data().lastSync) {
    return doc.data().lastSync.toDate();
  }
  return null;
}

/**
 * Compute a stable hash of relevant fields on a product for change detection
 * Updated for CRM product data
 */
function computeProductHash(product) {
  const relevant = {
    name: product.name,
    sku: product.sku,
    basePrice: product.basePrice,
    retailPrice: product.retailPrice,
    stock_on_hand: product.stock_on_hand,
    available_stock: product.available_stock,
    status: product.status,
    description: product.description,
    brand: product.brand,
    category: product.category
  };
  const str = JSON.stringify(relevant);
  return crypto.createHash('md5').update(str).digest('hex');
}

/**
 * Compute a stable hash of relevant fields on an inventory item for change detection
 * LEGACY - keeping for backward compatibility
 */
function computeItemHash(item) {
  const relevant = {
    name: item.name,
    sku: item.sku,
    rate: item.rate,
    stock_on_hand: item.stock_on_hand,
    available_stock: item.available_stock,
    status: item.status,
    description: item.description,
  };
  const str = JSON.stringify(relevant);
  return crypto.createHash('md5').update(str).digest('hex');
}

/**
 * Compute a stable hash of relevant fields on a customer record for change detection
 */
function computeCustomerHash(customer) {
  const relevant = {
    Account_Name: customer.Account_Name,
    Phone: customer.Phone,
    Primary_Email: customer.Primary_Email,
    Billing_City: customer.Billing_City,
    Billing_Code: customer.Billing_Code,
    Billing_Country: customer.Billing_Country,
    Billing_State: customer.Billing_State,
    Billing_Street: customer.Billing_Street,
    Primary_First_Name: customer.Primary_First_Name,
    Primary_Last_Name: customer.Primary_Last_Name,
    Agent: customer.Agent || null
  };
  const str = JSON.stringify(relevant);
  return crypto.createHash('md5').update(str).digest('hex');
}

/**
 * Normalize brand names for consistent searching
 */
function normalizeBrandName(brandName) {
  if (!brandName) return '';
  
  return brandName
    .toLowerCase()
    .replace(/[äàáâãå]/g, 'a')
    .replace(/[ëèéê]/g, 'e')
    .replace(/[ïìíî]/g, 'i')
    .replace(/[öòóôõø]/g, 'o')
    .replace(/[üùúû]/g, 'u')
    .replace(/[ÿý]/g, 'y')
    .replace(/[ñ]/g, 'n')
    .replace(/[ç]/g, 'c')
    .replace(/[ß]/g, 'ss')
    .replace(/[^\w\s]/g, '')
    .trim();
}

/**
 * Process a batch of products from CRM
 * NEW - replaces processBatch for CRM products
 */
async function processProductBatch(products) {
  // Use CRM Product ID as document ID for consistency
  const docRefs = products.map(product => db.collection('products').doc(product.id));
  const existingDocs = await db.getAll(...docRefs);

  const batch = db.batch();
  let addedCount = 0, updatedCount = 0, unchangedCount = 0;

  for (let i = 0; i < products.length; i++) {
    const product = products[i];
    const doc = existingDocs[i];
    
    // Transform CRM product to your existing Firebase structure
    const productData = {
      // IDs for mapping
      zohoCRMId: product.id,                    // CRM Product ID
      zohoItemID: product.id,                   // For backward compatibility, use same ID
      
      // Core product info (matching your existing structure)
      name: product.Product_Name || '',
      sku: product.Product_Code || '',
      description: product.Description || '',
      
      // Pricing (from CRM)
      basePrice: parseFloat(product.Unit_Price) || 0,
      retailPrice: parseFloat(product.List_Price) || parseFloat(product.Unit_Price) || 0,
      
      // Stock info (from CRM - synced from Inventory)
      stockLevel: parseInt(product.Qty_in_Stock) || 0,
      stock_on_hand: parseInt(product.Qty_in_Stock) || 0,
      available_stock: parseInt(product.Qty_Available) || parseInt(product.Qty_in_Stock) || 0,
      actual_available_stock: parseInt(product.Qty_Available) || 0,
      
      // Product status
      status: product.Product_Active !== false ? 'active' : 'inactive',
      
      // Category/Brand info
      brand: product.Manufacturer || '',
      category: product.Product_Category || '',
      
      // Brand normalization (keep your existing logic)
      brand_lowercase: (product.Manufacturer || '').toLowerCase(),
      brand_normalized: normalizeBrandName(product.Manufacturer || ''),
      
      // Image URL (if available from CRM)
      imageURL: product.Product_Image || '',
      
      // Sync metadata
      lastModified: admin.firestore.FieldValue.serverTimestamp(),
      syncedAt: admin.firestore.FieldValue.serverTimestamp(),
      lastSynced: admin.firestore.FieldValue.serverTimestamp(),
      source: 'CRM',
      
      // Keep date added if exists, otherwise set current date
      dateAdded: doc.exists && doc.data().dateAdded ? doc.data().dateAdded : admin.firestore.FieldValue.serverTimestamp()
    };

    const newHash = computeProductHash(productData);

    if (!doc.exists) {
      productData.dataHash = newHash;
      batch.set(db.collection('products').doc(product.id), productData);
      addedCount++;
      console.log(`➕ Adding new product: ${product.Product_Name} (${product.Product_Code})`);
    } else {
      const existingData = doc.data();
      
      // Preserve existing fields that aren't in CRM
      if (existingData.zohoItemID && existingData.zohoItemID !== product.id) {
        productData.zohoItemID = existingData.zohoItemID; // Keep existing Inventory Item ID if different
      }
      
      if (existingData.dataHash !== newHash) {
        productData.dataHash = newHash;
        batch.update(doc.ref, productData);
        updatedCount++;
        console.log(`🔄 Updating product: ${product.Product_Name} (${product.Product_Code})`);
      } else {
        unchangedCount++;
      }
    }
  }

  if (addedCount > 0 || updatedCount > 0) {
    await batch.commit();
  }

  return { added: addedCount, updated: updatedCount, unchanged: unchangedCount };
}

/**
 * Process a batch of items - LEGACY function for backward compatibility
 */
async function processBatch(items) {
  const docRefs = items.map(item => db.collection('products').doc(item.item_id));
  const existingDocs = await db.getAll(...docRefs);

  const batch = db.batch();
  let addedCount = 0, updatedCount = 0, unchangedCount = 0;

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const doc = existingDocs[i];
    const newHash = computeItemHash(item);

    if (!doc.exists) {
      batch.set(db.collection('products').doc(item.item_id), {
        ...item,
        lastModified: admin.firestore.FieldValue.serverTimestamp(),
        syncedAt: admin.firestore.FieldValue.serverTimestamp(),
        dataHash: newHash
      });
      addedCount++;
    } else {
      const existingData = doc.data();
      if (existingData.dataHash !== newHash) {
        batch.update(doc.ref, {
          ...item,
          lastModified: admin.firestore.FieldValue.serverTimestamp(),
          syncedAt: admin.firestore.FieldValue.serverTimestamp(),
          dataHash: newHash
        });
        updatedCount++;
      } else {
        unchangedCount++;
      }
    }
  }

  if (addedCount > 0 || updatedCount > 0) {
    await batch.commit();
  }

  return { added: addedCount, updated: updatedCount, unchanged: unchangedCount };
}

/**
 * Optimized syncInventory - now pulls from CRM instead of Inventory
 * Maintains all timestamp logic and incremental updates
 */
export async function syncInventory(fullSync = false) {
  console.log('📦 Starting inventory sync...');
  
  try {
    const result = await productSyncService.syncProductsToFirebase();
    
    return {
      success: true,
      stats: {
        products: result.count
      }
    };
  } catch (error) {
    console.error('Inventory sync error:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Process a batch of customers
 */
async function processCustomerBatch(accounts) {
  const docRefs = accounts.map(account => db.collection('customers').doc(account.id));
  const existingDocs = await db.getAll(...docRefs);

  const batch = db.batch();
  let addedCount = 0, updatedCount = 0, unchangedCount = 0;

  for (let i = 0; i < accounts.length; i++) {
    const account = accounts[i];
    const doc = existingDocs[i];

    const customerData = {
      zohoCRMId: account.id,
      zohoInventoryId: null,
      Account_Name: account.Account_Name,
      Phone: account.Phone,
      Primary_Email: account.Primary_Email,
      Agent: account.Agent ? {
        id: account.Agent.id,
        name: account.Agent.name
      } : null,
      Billing_City: account.Billing_City,
      Billing_Code: account.Billing_Code,
      Billing_Country: account.Billing_Country,
      Billing_State: account.Billing_State,
      Billing_Street: account.Billing_Street,
      Primary_First_Name: account.Primary_First_Name,
      Primary_Last_Name: account.Primary_Last_Name,
      lastModified: admin.firestore.FieldValue.serverTimestamp(),
      syncedAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    const newHash = computeCustomerHash(customerData);

    if (!doc.exists) {
      customerData.dataHash = newHash;
      batch.set(db.collection('customers').doc(account.id), customerData);
      addedCount++;
    } else {
      const existingData = doc.data();

      if (existingData.zohoInventoryId) {
        customerData.zohoInventoryId = existingData.zohoInventoryId;
      }

      if (existingData.dataHash !== newHash) {
        customerData.dataHash = newHash;
        batch.update(doc.ref, customerData);
        updatedCount++;
      } else {
        unchangedCount++;
      }
    }
  }

  if (addedCount > 0 || updatedCount > 0) {
    await batch.commit();
  }

  return { added: addedCount, updated: updatedCount, unchanged: unchangedCount };
}

/**
 * Optimized syncCustomersFromCRM with incremental updates
 */
export async function syncCustomersFromCRM(forceFullSync = false) {
  console.log('👥 Starting customer sync from CRM...');

  try {
    const isInitialDone = await isInitialSyncCompleted('customers');
    const lastSync = await getLastSyncTimestamp('customers');
    
    // For production, only sync customers modified after last sync
    let accounts;
    if (!forceFullSync && IS_PRODUCTION && isInitialDone && lastSync) {
      console.log(`📅 Fetching customers modified after ${lastSync.toISOString()}`);
      accounts = await fetchCustomersFromCRM({ modifiedAfter: lastSync });
    } else {
      console.log('👥 Performing full customer sync...');
      accounts = await fetchCustomersFromCRM();
    }

    if (accounts.length === 0) {
      console.log('ℹ️ No customers to sync.');
      return { success: true, stats: { added: 0, updated: 0, unchanged: 0 } };
    }

    console.log(`📊 Processing ${accounts.length} customers...`);

    // Process in smaller batches
    let totalAdded = 0, totalUpdated = 0, totalUnchanged = 0;

    for (let i = 0; i < accounts.length; i += BATCH_SIZE) {
      const batchAccounts = accounts.slice(i, i + BATCH_SIZE);
      const result = await processCustomerBatch(batchAccounts);
      
      totalAdded += result.added;
      totalUpdated += result.updated;
      totalUnchanged += result.unchanged;
      
      console.log(`👥 Processed batch ${Math.floor(i/BATCH_SIZE) + 1}/${Math.ceil(accounts.length/BATCH_SIZE)}`);
      
      // Add delay between batches in production
      if (IS_PRODUCTION && i + BATCH_SIZE < accounts.length) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }

    // Update sync metadata
    await db.collection('sync_metadata').doc('customers').set({
      lastSync: admin.firestore.FieldValue.serverTimestamp(),
      customersProcessed: accounts.length,
      added: totalAdded,
      updated: totalUpdated,
      unchanged: totalUnchanged,
      initialSyncCompleted: true
    }, { merge: true });

    console.log(`✅ Customer sync complete: ${totalAdded} added, ${totalUpdated} updated, ${totalUnchanged} unchanged`);
    return { success: true, stats: { added: totalAdded, updated: totalUpdated, unchanged: totalUnchanged } };

  } catch (error) {
    console.error('❌ Customer sync failed:', error);
    throw error;
  }
}

/**
 * Sync Zoho Inventory customer IDs for existing customers
 */
export async function syncInventoryCustomerIds() {
  console.log('🔗 Starting Inventory customer ID sync...');
  
  try {
    const customersSnapshot = await db.collection('customers')
      .where('zohoInventoryId', '==', null)
      .limit(50) // Process in batches to avoid timeouts
      .get();

    if (customersSnapshot.empty) {
      console.log('✅ All customers already have Inventory IDs');
      return { success: true, processed: 0 };
    }

    const batch = db.batch();
    let processedCount = 0;

    for (const doc of customersSnapshot.docs) {
      const customer = doc.data();
      
      if (customer.Primary_Email) {
        const inventoryId = await getInventoryContactIdByEmail(customer.Primary_Email);
        
        if (inventoryId) {
          batch.update(doc.ref, {
            zohoInventoryId: inventoryId,
            inventoryIdSyncedAt: admin.firestore.FieldValue.serverTimestamp()
          });
          processedCount++;
          console.log(`📋 Mapped ${customer.Account_Name} to Inventory ID: ${inventoryId}`);
        }
      }
      
      // Add small delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    if (processedCount > 0) {
      await batch.commit();
    }

    console.log(`✅ Inventory ID sync complete: ${processedCount} customers mapped`);
    
    return { success: true, processed: processedCount };
    
  } catch (error) {
    console.error('❌ Inventory ID sync failed:', error);
    throw error;
  }
}

/**
 * Get last sync timestamps
 */
export async function getSyncStatus() {
  try {
    const inventorySync = await db.collection('sync_metadata').doc('inventory').get();
    const customerSync = await db.collection('sync_metadata').doc('customers').get();
    
    return {
      inventory: inventorySync.exists ? inventorySync.data() : null,
      customers: customerSync.exists ? customerSync.data() : null,
      environment: IS_PRODUCTION ? 'production' : 'development',
      config: {
        batchSize: BATCH_SIZE,
        syncInterval: SYNC_INTERVAL
      }
    };
  } catch (error) {
    console.error('❌ Error getting sync status:', error);
    return null;
  }
}

/**
 * Smart sync with configurable intervals
 */
export async function smartSync(forceSync = false) {
  const now = Date.now();
  
  try {
    // Check last sync times from database
    const inventoryMeta = await db.collection('sync_metadata').doc('inventory').get();
    const customerMeta = await db.collection('sync_metadata').doc('customers').get();
    
    const lastInventorySync = inventoryMeta.exists && inventoryMeta.data().lastSync 
      ? inventoryMeta.data().lastSync.toMillis() 
      : 0;
    const lastCustomerSync = customerMeta.exists && customerMeta.data().lastSync 
      ? customerMeta.data().lastSync.toMillis() 
      : 0;
    
    let shouldSyncInventory = forceSync || (now - lastInventorySync) > SYNC_INTERVAL;
    let shouldSyncCustomers = forceSync || (now - lastCustomerSync) > SYNC_INTERVAL;
    
    const results = {};
    
    if (shouldSyncInventory) {
      results.inventory = await syncInventory(forceSync);
    } else {
      console.log(`⏭️ Skipping inventory sync - ${Math.round((SYNC_INTERVAL - (now - lastInventorySync)) / 60000)} minutes until next sync`);
      results.inventory = { skipped: true, reason: 'Recent sync' };
    }
    
    if (shouldSyncCustomers) {
      results.customers = await syncCustomersFromCRM(forceSync);
      
      // Also run inventory ID sync for new customers
      if (!forceSync) {
        results.inventoryIds = await syncInventoryCustomerIds();
      }
    } else {
      console.log(`⏭️ Skipping customer sync - ${Math.round((SYNC_INTERVAL - (now - lastCustomerSync)) / 60000)} minutes until next sync`);
      results.customers = { skipped: true, reason: 'Recent sync' };
    }
    
    return results;
    
  } catch (error) {
    console.error('❌ Smart sync failed:', error);
    throw error;
  }
}

/**
 * Perform initial sync for production deployment
 */
export async function performInitialSync() {
  console.log('🚀 Starting initial sync for production...');
  
  try {
    // First sync inventory (now from CRM)
    console.log('📦 Phase 1: Syncing products from CRM...');
    const inventoryResult = await syncInventory(true);
    
    // Then sync customers
    console.log('👥 Phase 2: Syncing customers...');
    const customerResult = await syncCustomersFromCRM(true);
    
    // Finally sync inventory IDs
    console.log('🔗 Phase 3: Mapping inventory IDs...');
    const inventoryIdResult = await syncInventoryCustomerIds();
    
    console.log('✅ Initial sync completed successfully!');
    
    return {
      success: true,
      inventory: inventoryResult,
      customers: customerResult,
      inventoryIds: inventoryIdResult
    };
    
  } catch (error) {
    console.error('❌ Initial sync failed:', error);
    throw error;
  }
}