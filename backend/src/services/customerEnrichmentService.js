// src/services/customerEnrichmentService.js
import admin from 'firebase-admin';
import axios from 'axios';

class CustomerEnrichmentService {
  constructor() {
    this.db = admin.firestore();
    this.GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY || 'AIzaSyB3fpUZexx1zRETMigOVtWFUNDe9Xe_sfs';
    
    // UK Region mapping based on coordinates
    this.UK_REGIONS = {
      'Scotland': {
        bounds: { minLat: 54.5, maxLat: 61, minLng: -8, maxLng: -0.5 }
      },
      'North East': {
        bounds: { minLat: 54.5, maxLat: 55.8, minLng: -2.7, maxLng: -0.5 }
      },
      'North West': {
        bounds: { minLat: 53, maxLat: 55, minLng: -3.5, maxLng: -2 }
      },
      'Wales': {
        bounds: { minLat: 51.3, maxLat: 53.5, minLng: -5.5, maxLng: -2.5 }
      },
      'Midlands': {
        bounds: { minLat: 51.8, maxLat: 53.5, minLng: -3, maxLng: -0.5 }
      },
      'London': {
        bounds: { minLat: 51.2, maxLat: 51.7, minLng: -0.6, maxLng: 0.3 }
      },
      'South East': {
        bounds: { minLat: 50.5, maxLat: 52, minLng: -1, maxLng: 1.8 }
      },
      'South West': {
        bounds: { minLat: 49.9, maxLat: 51.5, minLng: -6, maxLng: -2 }
      },
      'Ireland': {
        bounds: { minLat: 51.3, maxLat: 55.5, minLng: -11, maxLng: -5.5 }
      }
    };
    
    // Brand mappings
    this.brandMappings = {
      'rader': ['rader', 'räder', 'Rader', 'Räder'],
      'relaxound': ['relaxound', 'Relaxound'],
      'myflame': ['my flame', 'My Flame', 'myflame', 'MyFlame', 'My Flame Lifestyle'],
      'blomus': ['blomus', 'Blomus'],
      'remember': ['remember', 'Remember'],
      'elvang': ['elvang', 'Elvang']
    };
  }

  /**
   * Geocode a UK postcode to coordinates
   */
  async geocodePostcode(postcode) {
    if (!postcode) return null;
    
    try {
      const cleanPostcode = postcode.replace(/\s+/g, '').toUpperCase();
      const url = `https://maps.googleapis.com/maps/api/geocode/json`;
      
      const response = await axios.get(url, {
        params: {
          address: `${cleanPostcode}, UK`,
          key: this.GOOGLE_MAPS_API_KEY,
          region: 'uk'
        }
      });
      
      if (response.data.results && response.data.results.length > 0) {
        const location = response.data.results[0].geometry.location;
        return {
          latitude: location.lat,
          longitude: location.lng
        };
      }
      
      return null;
    } catch (error) {
      console.error(`Error geocoding postcode ${postcode}:`, error.message);
      return null;
    }
  }

  /**
   * Determine UK region from coordinates
   */
  determineRegion(coordinates) {
    if (!coordinates || !coordinates.latitude || !coordinates.longitude) return 'Unknown';
    
    const { latitude, longitude } = coordinates;
    
    for (const [region, config] of Object.entries(this.UK_REGIONS)) {
      const { bounds } = config;
      if (latitude >= bounds.minLat && latitude <= bounds.maxLat &&
          longitude >= bounds.minLng && longitude <= bounds.maxLng) {
        return region;
      }
    }
    
    return 'Unknown';
  }

  /**
   * Calculate brand preferences for a customer
   */
  async calculateBrandPreferences(customerId) {
    try {
      // Get all sales transactions for this customer
      const transactionsSnapshot = await this.db.collection('sales_transactions')
        .where('customer_id', '==', customerId)
        .get();
      
      if (transactionsSnapshot.empty) {
        return [];
      }
      
      // Aggregate by brand
      const brandStats = new Map();
      let totalRevenue = 0;
      
      transactionsSnapshot.forEach(doc => {
        const trans = doc.data();
        const brand = trans.brand || 'Unknown';
        
        if (!brandStats.has(brand)) {
          brandStats.set(brand, {
            brand: brand,
            revenue: 0,
            quantity: 0
          });
        }
        
        const stats = brandStats.get(brand);
        stats.revenue += trans.total || 0;
        stats.quantity += trans.quantity || 0;
        totalRevenue += trans.total || 0;
      });
      
      // Convert to array and calculate percentages
      const brandPreferences = Array.from(brandStats.values())
        .map(stats => ({
          brand: stats.brand,
          revenue: stats.revenue,
          quantity: stats.quantity,
          percentage: totalRevenue > 0 ? (stats.revenue / totalRevenue) * 100 : 0
        }))
        .sort((a, b) => b.revenue - a.revenue);
      
      return brandPreferences;
    } catch (error) {
      console.error(`Error calculating brand preferences for ${customerId}:`, error);
      return [];
    }
  }

  /**
   * Enrich a single customer with coordinates and brand preferences
   */
  async enrichCustomer(customerId) {
    try {
      const customerDoc = await this.db.collection('customers').doc(customerId).get();
      
      if (!customerDoc.exists) {
        console.log(`Customer ${customerId} not found`);
        return null;
      }
      
      const customer = customerDoc.data();
      const updates = {};
      
      // Geocode postcode if coordinates don't exist
      if (customer.postcode && (!customer.coordinates || !customer.coordinates.latitude)) {
        const coordinates = await this.geocodePostcode(customer.postcode);
        if (coordinates) {
          updates.coordinates = coordinates;
          updates.location_region = this.determineRegion(coordinates);
        }
      }
      
      // Calculate brand preferences
      const brandPreferences = await this.calculateBrandPreferences(customer.customer_id);
      if (brandPreferences.length > 0) {
        updates.brand_preferences = brandPreferences;
      }
      
      // Update customer if there are changes
      if (Object.keys(updates).length > 0) {
        updates._enriched_at = admin.firestore.FieldValue.serverTimestamp();
        await this.db.collection('customers').doc(customerId).update(updates);
        console.log(`✅ Enriched customer ${customer.customer_name}`);
        return updates;
      }
      
      return null;
    } catch (error) {
      console.error(`Error enriching customer ${customerId}:`, error);
      return null;
    }
  }

  /**
   * Enrich all customers in batches
   */
  async enrichAllCustomers(batchSize = 10) {
    try {
      console.log('🔄 Starting customer enrichment...');
      
      const customersSnapshot = await this.db.collection('customers').get();
      const customers = customersSnapshot.docs.map(doc => ({
        docId: doc.id,
        ...doc.data()
      }));
      
      console.log(`Found ${customers.length} customers to process`);
      
      let enrichedCount = 0;
      let errorCount = 0;
      
      // Process in batches to avoid rate limits
      for (let i = 0; i < customers.length; i += batchSize) {
        const batch = customers.slice(i, i + batchSize);
        
        console.log(`Processing batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(customers.length / batchSize)}`);
        
        const promises = batch.map(customer => 
          this.enrichCustomer(customer.docId)
            .then(result => {
              if (result) enrichedCount++;
              return result;
            })
            .catch(error => {
              errorCount++;
              console.error(`Failed to enrich ${customer.customer_name}:`, error.message);
              return null;
            })
        );
        
        await Promise.all(promises);
        
        // Add delay between batches to avoid Google Maps API rate limits
        if (i + batchSize < customers.length) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }
      
      console.log(`✅ Customer enrichment complete: ${enrichedCount} enriched, ${errorCount} errors`);
      
      return {
        total: customers.length,
        enriched: enrichedCount,
        errors: errorCount
      };
      
    } catch (error) {
      console.error('❌ Error in enrichAllCustomers:', error);
      throw error;
    }
  }

  /**
   * Enrich customers that are missing coordinates or brand preferences
   */
  async enrichMissingCustomers() {
    try {
      // Find customers missing coordinates
      const missingCoords = await this.db.collection('customers')
        .where('postcode', '!=', '')
        .get();
      
      const needsEnrichment = [];
      
      missingCoords.forEach(doc => {
        const data = doc.data();
        if (!data.coordinates || !data.coordinates.latitude || !data.brand_preferences) {
          needsEnrichment.push({
            docId: doc.id,
            ...data
          });
        }
      });
      
      console.log(`Found ${needsEnrichment.length} customers needing enrichment`);
      
      let enrichedCount = 0;
      
      for (const customer of needsEnrichment) {
        const result = await this.enrichCustomer(customer.docId);
        if (result) enrichedCount++;
        
        // Small delay to avoid rate limits
        await new Promise(resolve => setTimeout(resolve, 200));
      }
      
      return {
        needsEnrichment: needsEnrichment.length,
        enriched: enrichedCount
      };
      
    } catch (error) {
      console.error('Error enriching missing customers:', error);
      throw error;
    }
  }
}

export default new CustomerEnrichmentService();