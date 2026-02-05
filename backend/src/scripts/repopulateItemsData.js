// server/src/scripts/repopulateItemsData.js
import { db, initializeFirebase } from '../config/firebase.js';
import admin from 'firebase-admin';
import zohoInventoryService from '../services/zohoInventoryService.js';

// Ensure Firebase is initialized
initializeFirebase();

// Get storage bucket
const bucket = admin.storage().bucket();

// Brand normalization mapping
const BRAND_MAPPING = {
  'Räder': 'rader',
  'räder': 'rader',
  'RÄDER': 'rader',
  'Blomus': 'blomus',
  'blomus': 'blomus',
  'BLOMUS': 'blomus',
  'Remember': 'remember',
  'remember': 'remember',
  'REMEMBER': 'remember',
  'Relaxound': 'relaxound',
  'relaxound': 'relaxound',
  'RELAXOUND': 'relaxound',
  'My Flame Lifestyle': 'my-flame-lifestyle',
  'my flame lifestyle': 'my-flame-lifestyle',
  'MY FLAME LIFESTYLE': 'my-flame-lifestyle',
  'GEFU': 'gefu',
  'Gefu': 'gefu',
  'gefu': 'gefu',
  'Elvang': 'elvang',
  'elvang': 'elvang',
  'ELVANG': 'elvang'
};

/**
 * Normalize brand name based on mapping
 */
function normalizeBrandName(manufacturer) {
  if (!manufacturer) return 'unknown';
  
  // Check if exact match exists in mapping
  if (BRAND_MAPPING[manufacturer]) {
    return BRAND_MAPPING[manufacturer];
  }
  
  // Try case-insensitive match
  const manufacturerLower = manufacturer.toLowerCase();
  for (const [key, value] of Object.entries(BRAND_MAPPING)) {
    if (key.toLowerCase() === manufacturerLower) {
      return value;
    }
  }
  
  // If no match found, normalize using standard method
  return manufacturer
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Get download URLs for product images
 */
async function getImageUrls(sku, brandNormalized) {
  const imageUrls = {
    imageUrl: null,
    thumbnailUrl: null
  };

  try {
    // Try to get the main image
    const mainImagePath = `brand-images/${brandNormalized}/${sku}_1.webp`;
    const thumbnailPath = `brand-images/${brandNormalized}/${sku}_1_400x400.webp`;

    // Check if files exist and get download URLs
    try {
      const [mainImageExists] = await bucket.file(mainImagePath).exists();
      if (mainImageExists) {
        const [mainImageUrl] = await bucket.file(mainImagePath).getSignedUrl({
          action: 'read',
          expires: '01-01-2030' // Long expiry for product images
        });
        imageUrls.imageUrl = mainImageUrl;
      }
    } catch (error) {
      console.log(`Main image not found for SKU ${sku}`);
    }

    try {
      const [thumbnailExists] = await bucket.file(thumbnailPath).exists();
      if (thumbnailExists) {
        const [thumbnailUrl] = await bucket.file(thumbnailPath).getSignedUrl({
          action: 'read',
          expires: '01-01-2030'
        });
        imageUrls.thumbnailUrl = thumbnailUrl;
      }
    } catch (error) {
      console.log(`Thumbnail not found for SKU ${sku}`);
    }

  } catch (error) {
    console.error(`Error getting image URLs for SKU ${sku}:`, error.message);
  }

  return imageUrls;
}

/**
 * Clear all documents in the items_data collection
 */
async function clearItemsCollection() {
  console.log('🗑️  Clearing items_data collection...');
  
  const batchSize = 500;
  const collectionRef = db.collection('items_data');
  
  let totalDeleted = 0;
  
  while (true) {
    const snapshot = await collectionRef.limit(batchSize).get();
    
    if (snapshot.empty) {
      break;
    }
    
    const batch = db.batch();
    snapshot.docs.forEach(doc => {
      batch.delete(doc.ref);
    });
    
    await batch.commit();
    totalDeleted += snapshot.size;
    console.log(`  Deleted ${totalDeleted} documents...`);
    
    // Small delay to avoid overloading
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  
  console.log(`✅ Cleared ${totalDeleted} documents from items_data collection`);
  return totalDeleted;
}

/**
 * Main function to repopulate items_data
 */
async function repopulateItemsData() {
  console.log('🚀 Starting items_data repopulation process...\n');
  
  try {
    // Step 1: Clear existing data
    const deletedCount = await clearItemsCollection();
    
    // Step 2: Fetch all products from Zoho
    console.log('\n📦 Fetching all products from Zoho Inventory...');
    const zohoProducts = await zohoInventoryService.fetchAllProducts();
    console.log(`✅ Fetched ${zohoProducts.length} products from Zoho\n`);
    
    // Step 3: Process and filter products
    console.log('🔄 Processing and filtering products...');
    
    const stats = {
      total: zohoProducts.length,
      added: 0,
      filtered: {
        inactive: 0,
        zeroPrice: 0,
        xxxSku: 0,
        total: 0
      },
      errors: 0
    };
    
    let batch = db.batch();
    let batchCount = 0;
    const batchSize = 400;
    
    for (const zohoProduct of zohoProducts) {
      try {
        // Apply filters
        const isInactive = zohoProduct.status === 'inactive';
        const hasZeroPrice = parseFloat(zohoProduct.rate || 0) === 0;
        const hasXXXSku = zohoProduct.sku && zohoProduct.sku.startsWith('XXX');
        
        if (isInactive) {
          stats.filtered.inactive++;
          stats.filtered.total++;
          continue;
        }
        
        if (hasZeroPrice) {
          stats.filtered.zeroPrice++;
          stats.filtered.total++;
          console.log(`  Skipping ${zohoProduct.name} - Zero price`);
          continue;
        }
        
        if (hasXXXSku) {
          stats.filtered.xxxSku++;
          stats.filtered.total++;
          console.log(`  Skipping ${zohoProduct.name} - SKU starts with XXX`);
          continue;
        }
        
        // Get manufacturer and normalize brand
        const manufacturer = zohoProduct.vendor_name || zohoProduct.brand || zohoProduct.cf_brand || '';
        const brandNormalized = normalizeBrandName(manufacturer);
        
        // Get image URLs
        const imageUrls = await getImageUrls(zohoProduct.sku, brandNormalized);
        
        // Prepare the product document
        const productDoc = {
          // Core identifiers
          item_id: zohoProduct.item_id,
          name: zohoProduct.name || '',
          item_name: zohoProduct.name || '', // Alias for compatibility
          sku: zohoProduct.sku || '',
          ean: zohoProduct.ean || zohoProduct.upc || '',
          
          // Pricing
          rate: parseFloat(zohoProduct.rate || 0),
          selling_price: parseFloat(zohoProduct.rate || 0), // Alias
          purchase_rate: parseFloat(zohoProduct.purchase_rate || 0),
          
          // Manufacturer/Brand
          manufacturer: manufacturer,
          Manufacturer: manufacturer, // Keep original case for compatibility
          brand_normalized: brandNormalized,
          vendor_id: zohoProduct.vendor_id || '',
          vendor_name: zohoProduct.vendor_name || '',
          
          // Stock levels
          available_stock: parseInt(zohoProduct.available_for_sale_stock || 0),
          actual_available_stock: parseInt(zohoProduct.actual_available_for_sale_stock || 0),
          stock_on_hand: parseInt(zohoProduct.stock_on_hand || 0),
          reorder_level: parseInt(zohoProduct.reorder_level || 0),
          
          // Product details
          description: zohoProduct.description || '',
          category: zohoProduct.category_name || '',
          status: zohoProduct.status || 'active',
          unit: zohoProduct.unit || '',
          
          // Images
          imageUrl: imageUrls.imageUrl || zohoProduct.image_url || '',
          thumbnailUrl: imageUrls.thumbnailUrl || '',
          zoho_image_url: zohoProduct.image_url || '', // Keep original Zoho image URL
          image_document_id: zohoProduct.image_document_id || '',
          
          // Timestamps
          created_time: zohoProduct.created_time,
          last_modified_time: zohoProduct.last_modified_time,
          _source: 'zoho_inventory',
          _synced_at: admin.firestore.FieldValue.serverTimestamp(),
          _repopulated_at: admin.firestore.FieldValue.serverTimestamp()
        };
        
        // Add to batch
        const docRef = db.collection('items_data').doc(zohoProduct.item_id);
        batch.set(docRef, productDoc);
        batchCount++;
        stats.added++;
        
        // Log progress for items with images
        if (imageUrls.imageUrl || imageUrls.thumbnailUrl) {
          console.log(`  ✅ Added ${zohoProduct.name} (${zohoProduct.sku}) with images`);
        }
        
        // Commit batch if needed
        if (batchCount >= batchSize) {
          await batch.commit();
          batch = db.batch();
          batchCount = 0;
          console.log(`💾 Committed batch of ${batchSize} items (${stats.added} total)...`);
          
          // Small delay between batches
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
        
      } catch (error) {
        console.error(`❌ Error processing product ${zohoProduct.name}:`, error.message);
        stats.errors++;
      }
    }
    
    // Commit remaining items
    if (batchCount > 0) {
      await batch.commit();
      console.log(`💾 Committed final batch of ${batchCount} items`);
    }
    
    // Update sync metadata
    await db.collection('sync_metadata').doc('items_repopulation').set({
      lastRun: admin.firestore.FieldValue.serverTimestamp(),
      stats: stats,
      status: 'completed'
    });
    
    // Print summary
    console.log('\n' + '='.repeat(60));
    console.log('✅ REPOPULATION COMPLETED!');
    console.log('='.repeat(60));
    console.log(`📊 Summary:`);
    console.log(`   Items cleared: ${deletedCount}`);
    console.log(`   Total fetched from Zoho: ${stats.total}`);
    console.log(`   Items added: ${stats.added}`);
    console.log(`   Items filtered out: ${stats.filtered.total}`);
    console.log(`     - Inactive: ${stats.filtered.inactive}`);
    console.log(`     - Zero price: ${stats.filtered.zeroPrice}`);
    console.log(`     - XXX SKU: ${stats.filtered.xxxSku}`);
    console.log(`   Errors: ${stats.errors}`);
    console.log('='.repeat(60) + '\n');
    
    return { success: true, stats };
    
  } catch (error) {
    console.error('❌ Repopulation failed:', error);
    
    // Update sync metadata with error
    await db.collection('sync_metadata').doc('items_repopulation').set({
      lastRun: admin.firestore.FieldValue.serverTimestamp(),
      status: 'failed',
      error: error.message
    });
    
    throw error;
  }
}

// Run the script
if (import.meta.url === `file://${process.argv[1]}`) {
  repopulateItemsData()
    .then(() => {
      console.log('Script completed successfully');
      process.exit(0);
    })
    .catch(error => {
      console.error('Script failed:', error);
      process.exit(1);
    });
}

export { repopulateItemsData };