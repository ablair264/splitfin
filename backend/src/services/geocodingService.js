import axios from 'axios';

class GeocodingService {
  constructor() {
    this.cache = new Map();
  }

  /**
   * Validate UK postcode format
   */
  isValidUKPostcode(postcode) {
    if (!postcode) return false;
    // UK postcode regex - handles various formats
    const ukPostcodeRegex = /^([A-Z]{1,2}\d[A-Z\d]? ?\d[A-Z]{2}|GIR ?0A{2})$/i;
    return ukPostcodeRegex.test(postcode.trim());
  }

  /**
   * Check if postcode is Irish (Eircode)
   */
  isIrishPostcode(postcode) {
    if (!postcode) return false;
    // Irish Eircode format: A65 F4E2 or D6W FD93
    const irishPostcodeRegex = /^[A-Z]\d{2}\s*[A-Z0-9]{4}$/i;
    return irishPostcodeRegex.test(postcode.trim());
  }

  /**
   * Clean and format postcode
   */
  cleanPostcode(postcode) {
    if (!postcode) return null;
    
    // Remove extra spaces and convert to uppercase
    let cleaned = postcode.trim().toUpperCase();
    
    // Remove any non-alphanumeric characters except spaces
    cleaned = cleaned.replace(/[^A-Z0-9\s]/g, '');
    
    // Normalize spacing for UK postcodes (add space before last 3 chars if missing)
    if (this.isValidUKPostcode(cleaned.replace(/\s/g, ''))) {
      const noSpace = cleaned.replace(/\s/g, '');
      if (noSpace.length >= 5) {
        cleaned = noSpace.slice(0, -3) + ' ' + noSpace.slice(-3);
      }
    }
    
    return cleaned;
  }

  /**
   * Get coordinates from UK postcode
   */
  async getCoordinatesFromPostcode(postcode) {
    if (!postcode) return null;
    
    // Clean the postcode
    const cleanedPostcode = this.cleanPostcode(postcode);
    if (!cleanedPostcode) return null;
    
    // Check cache first
    const cacheKey = cleanedPostcode.replace(/\s+/g, '');
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey);
    }
    
    try {
      // Handle non-postcode values
      if (cleanedPostcode === 'IRELAND' || cleanedPostcode === 'UK' || cleanedPostcode === 'ENGLAND') {
        console.log(`⚠️ Skipping geocoding for country name: ${cleanedPostcode}`);
        return {
          latitude: null,
          longitude: null,
          region: 'Unknown',
          country: cleanedPostcode,
          error: 'Country name, not postcode'
        };
      }
      
      // Handle Irish postcodes
      if (this.isIrishPostcode(cleanedPostcode)) {
        console.log(`⚠️ Irish postcode detected: ${cleanedPostcode} - skipping UK geocoding`);
        return {
          latitude: null,
          longitude: null,
          region: 'Ireland',
          country: 'Ireland',
          error: 'Irish postcode - UK geocoding not applicable'
        };
      }
      
      // Validate UK postcode format
      if (!this.isValidUKPostcode(cleanedPostcode)) {
        console.log(`⚠️ Invalid UK postcode format: ${cleanedPostcode}`);
        return {
          latitude: null,
          longitude: null,
          region: 'Unknown',
          country: 'Unknown',
          error: 'Invalid postcode format'
        };
      }
      
      // Make API request to postcodes.io
      const response = await axios.get(
        `https://api.postcodes.io/postcodes/${encodeURIComponent(cacheKey)}`,
        {
          timeout: 5000,
          validateStatus: function (status) {
            return status < 500; // Don't throw on 404s
          }
        }
      );
      
      if (response.status === 404) {
        console.log(`⚠️ Postcode not found in UK database: ${cleanedPostcode}`);
        return {
          latitude: null,
          longitude: null,
          region: 'Unknown',
          country: 'Unknown',
          error: 'Postcode not found'
        };
      }
      
      if (response.data.status === 200 && response.data.result) {
        const result = {
          latitude: response.data.result.latitude,
          longitude: response.data.result.longitude,
          region: response.data.result.european_electoral_region,
          country: response.data.result.country,
          admin_district: response.data.result.admin_district
        };
        
        // Cache the result
        this.cache.set(cacheKey, result);
        
        return result;
      }
      
      return null;
    } catch (error) {
      // Only log unexpected errors, not 404s
      if (error.response?.status !== 404) {
        console.error(`Geocoding error for ${postcode}:`, error.message);
      }
      return null;
    }
  }

  /**
   * Determine UK region from location data
   */
  determineUKRegion(locationData) {
    if (!locationData) return 'Unknown';
    
    // Handle Irish postcodes
    if (locationData.country === 'Ireland' || locationData.region === 'Ireland') {
      return 'Ireland';
    }
    
    const region = locationData.region?.toLowerCase() || '';
    const country = locationData.country?.toLowerCase() || '';
    const district = locationData.admin_district?.toLowerCase() || '';
    
    if (country === 'scotland') return 'Scotland';
    if (country === 'wales') return 'Wales';
    if (region.includes('london') || district.includes('london')) return 'London';
    if (region.includes('north east')) return 'North East';
    if (region.includes('north west')) return 'North West';
    if (region.includes('yorkshire')) return 'North East';
    if (region.includes('east midlands') || region.includes('west midlands')) return 'Midlands';
    if (region.includes('south east')) return 'South East';
    if (region.includes('south west')) return 'South West';
    if (region.includes('eastern')) return 'South East';
    
    return 'Unknown';
  }

  /**
   * Process customer location data
   */
  async processCustomerLocation(customerData) {
    const postcode = customerData.postcode || customerData.postal_code || customerData.zip_code;
    
    if (!postcode) {
      return {
        ...customerData,
        location_region: 'Unknown',
        location_error: 'No postcode provided'
      };
    }
    
    const locationData = await this.getCoordinatesFromPostcode(postcode);
    
    if (locationData) {
      // Even if we couldn't geocode, we might know the country
      if (locationData.error && locationData.country === 'Ireland') {
        return {
          ...customerData,
          postcode: this.cleanPostcode(postcode),
          location_region: 'Ireland',
          location_country: 'Ireland',
          location_error: locationData.error,
          location_updated: new Date().toISOString()
        };
      }
      
      if (locationData.latitude && locationData.longitude) {
        return {
          ...customerData,
          postcode: this.cleanPostcode(postcode),
          coordinates: {
            latitude: locationData.latitude,
            longitude: locationData.longitude
          },
          location_region: this.determineUKRegion(locationData),
          location_country: locationData.country,
          location_district: locationData.admin_district,
          location_updated: new Date().toISOString()
        };
      }
    }
    
    return {
      ...customerData,
      postcode: this.cleanPostcode(postcode),
      location_region: 'Unknown',
      location_error: 'Unable to geocode',
      location_updated: new Date().toISOString()
    };
  }
}

export default new GeocodingService();