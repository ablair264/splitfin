// server/src/services/productSync.js
import { fetchProductsFromInventory } from '../api/zoho.js';

export class ProductSyncService {
  constructor(firestore) {
    this.firestore = firestore;
  }

  /**
   * Sync all products from Zoho CRM to Firestore
   */
  async syncAllProducts() {
    try {
      // Fetch products from Zoho CRM
      const products = await fetchProductsFromInventory();
      
      // Batch write to Firestore
      const batch = this.firestore.batch();
      const productsCollection = this.firestore.collection('products');

      products.forEach(product => {
        const docRef = productsCollection.doc(product.id);
        batch.set(docRef, {
          ...product,
          // Normalize brand information
          normalizedBrand: this.normalizeBrand(product.Manufacturer || product.Product_Category || 'Unknown'),
          // Add timestamp for tracking
          syncedAt: new Date().toISOString()
        });
      });

      // Commit the batch
      await batch.commit();

      return {
        totalProducts: products.length,
        syncedAt: new Date().toISOString()
      };
    } catch (error) {
      console.error('Product sync failed:', error);
      throw error;
    }
  }

  /**
   * Sync a single product by Zoho ID
   */
  async syncSingleProduct(zohoId) {
    try {
      // Fetch specific product from Zoho CRM
      const products = await fetchProductsFromInventory({ 
        criteria: `id:equals:${zohoId}` 
      });

      if (products.length === 0) {
        throw new Error(`No product found with ID ${zohoId}`);
      }

      const product = products[0];
      const docRef = this.firestore.collection('products').doc(product.id);

      await docRef.set({
        ...product,
        normalizedBrand: this.normalizeBrand(product.Manufacturer || product.Product_Category || 'Unknown'),
        syncedAt: new Date().toISOString()
      });

      return product;
    } catch (error) {
      console.error(`Product sync failed for ${zohoId}:`, error);
      throw error;
    }
  }

  /**
   * Get products by brand (normalized search)
   */
  async getProductsByBrand(brandName) {
    try {
      const normalizedBrand = this.normalizeBrand(brandName);
      
      const snapshot = await this.firestore
        .collection('products')
        .where('normalizedBrand', '==', normalizedBrand)
        .get();

      return snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
    } catch (error) {
      console.error(`Brand search failed for ${brandName}:`, error);
      throw error;
    }
  }

  /**
   * Search products by name, SKU, or brand
   */
  async searchProducts(searchTerm) {
    try {
      // Normalize search term
      const normalizedSearch = this.normalizeSearchTerm(searchTerm);
      
      // Multiple query approach for comprehensive search
      const nameQuery = this.firestore
        .collection('products')
        .where('normalizedName', '>=', normalizedSearch)
        .where('normalizedName', '<=', normalizedSearch + '\uf8ff')
        .limit(50);

      const skuQuery = this.firestore
        .collection('products')
        .where('Product_Code', '>=', searchTerm)
        .where('Product_Code', '<=', searchTerm + '\uf8ff')
        .limit(50);

      const brandQuery = this.firestore
        .collection('products')
        .where('normalizedBrand', '==', this.normalizeBrand(searchTerm))
        .limit(50);

      const [nameSnapshot, skuSnapshot, brandSnapshot] = await Promise.all([
        nameQuery.get(),
        skuQuery.get(),
        brandQuery.get()
      ]);

      // Combine and deduplicate results
      const resultsSet = new Set();
      const combinedResults = [
        ...nameSnapshot.docs,
        ...skuSnapshot.docs,
        ...brandSnapshot.docs
      ];

      return combinedResults
        .filter(doc => {
          if (resultsSet.has(doc.id)) return false;
          resultsSet.add(doc.id);
          return true;
        })
        .map(doc => ({
          id: doc.id,
          ...doc.data()
        }))
        .slice(0, 50); // Limit to 50 results
    } catch (error) {
      console.error(`Product search failed for ${searchTerm}:`, error);
      throw error;
    }
  }

  /**
   * Migrate and normalize brand information
   */
  async migrateBrandNormalization() {
    try {
      const snapshot = await this.firestore.collection('products').get();
      const batch = this.firestore.batch();

      let updatedCount = 0;
      snapshot.docs.forEach(doc => {
        const productData = doc.data();
        const normalizedBrand = this.normalizeBrand(
          productData.Manufacturer || 
          productData.Product_Category || 
          productData.brand || 
          'Unknown'
        );

        // Update only if brand is different
        if (normalizedBrand !== productData.normalizedBrand) {
          batch.update(doc.ref, { 
            normalizedBrand,
            brandMigrationAt: new Date().toISOString()
          });
          updatedCount++;
        }
      });

      await batch.commit();

      return {
        totalProducts: snapshot.size,
        updatedProducts: updatedCount,
        migrationCompletedAt: new Date().toISOString()
      };
    } catch (error) {
      console.error('Brand migration failed:', error);
      throw error;
    }
  }

  // Utility method to normalize brand names
  normalizeBrand(brand) {
    return brand
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '')
      .trim();
  }

  // Utility method to normalize search terms
  normalizeSearchTerm(term) {
    return term
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '')
      .trim();
  }
}

export default new ProductSyncService();