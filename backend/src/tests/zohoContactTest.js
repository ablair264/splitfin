// server/src/tests/zohoContactTest.js
import { getAccessToken, ZOHO_CONFIG } from '../api/zoho.js';
import axios from 'axios';
import admin from 'firebase-admin';

class ZohoContactTester {
  constructor() {
    this.results = {
      timestamp: new Date().toISOString(),
      tests: []
    };
  }

  log(message, data = null) {
    console.log(`[ZOHO TEST] ${message}`);
    if (data) {
      console.log(JSON.stringify(data, null, 2));
    }
    this.results.tests.push({ message, data, timestamp: new Date().toISOString() });
  }

  async runAllTests() {
    this.log('🚀 Starting Zoho Contact Tests');
    
    try {
      // Test 1: Verify Configuration
      await this.testConfiguration();
      
      // Test 2: Create Minimal Contact
      const minimalContactId = await this.testCreateMinimalContact();
      
      // Test 3: Verify Created Contact
      if (minimalContactId) {
        await this.testVerifyContact(minimalContactId);
      }
      
      // Test 4: Create Full Contact
      const fullContactId = await this.testCreateFullContact();
      
      // Test 5: Search for Contacts
      await this.testSearchContacts();
      
      // Test 6: List Recent Contacts
      await this.testListRecentContacts();
      
      // Test 7: Test Different Contact Types
      await this.testDifferentContactTypes();
      
    } catch (error) {
      this.log('❌ Test suite failed', {
        error: error.message,
        stack: error.stack
      });
    }
    
    return this.results;
  }

  async testConfiguration() {
    this.log('📋 Test 1: Verifying Configuration');
    
    try {
      const token = await getAccessToken();
      this.log('✅ Access token obtained');
      
      // Get organization details
      const orgResponse = await axios.get(
        `${ZOHO_CONFIG.baseUrls.inventory}/organizations`,
        {
          headers: { 
            'Authorization': `Zoho-oauthtoken ${token}`
          }
        }
      );
      
      const orgs = orgResponse.data.organizations || [];
      const currentOrg = orgs.find(org => org.organization_id === ZOHO_CONFIG.orgId);
      
      this.log('Organization Configuration', {
        configuredOrgId: ZOHO_CONFIG.orgId,
        foundInAPI: !!currentOrg,
        organizationName: currentOrg?.name,
        allOrganizations: orgs.map(org => ({
          id: org.organization_id,
          name: org.name,
          isActive: org.is_active
        }))
      });
      
      if (!currentOrg) {
        throw new Error(`Configured org ID ${ZOHO_CONFIG.orgId} not found in Zoho account`);
      }
      
    } catch (error) {
      this.log('❌ Configuration test failed', {
        error: error.message,
        response: error.response?.data
      });
      throw error;
    }
  }

  async testCreateMinimalContact() {
    this.log('📋 Test 2: Creating Minimal Contact');
    
    try {
      const token = await getAccessToken();
      const timestamp = Date.now();
      
      const minimalPayload = {
        contact_name: `Test Minimal ${timestamp}`,
        contact_type: 'customer'
      };
      
      this.log('Sending minimal payload', minimalPayload);
      
      const response = await axios.post(
        `${ZOHO_CONFIG.baseUrls.inventory}/contacts`,
        minimalPayload,
        {
          headers: {
            'Authorization': `Zoho-oauthtoken ${token}`,
            'Content-Type': 'application/json',
            'X-com-zoho-inventory-organizationid': ZOHO_CONFIG.orgId
          }
        }
      );
      
      this.log('Create response', {
        status: response.status,
        code: response.data.code,
        message: response.data.message,
        hasContact: !!response.data.contact,
        contactId: response.data.contact?.contact_id
      });
      
      if (response.data.code === 0 && response.data.contact) {
        this.log('✅ Minimal contact created successfully', {
          id: response.data.contact.contact_id,
          name: response.data.contact.contact_name
        });
        return response.data.contact.contact_id;
      } else {
        this.log('❌ Failed to create minimal contact', response.data);
        return null;
      }
      
    } catch (error) {
      this.log('❌ Minimal contact creation failed', {
        error: error.message,
        response: error.response?.data
      });
      return null;
    }
  }

  async testVerifyContact(contactId) {
    this.log(`📋 Test 3: Verifying Contact ${contactId}`);
    
    try {
      const token = await getAccessToken();
      
      // Method 1: Direct fetch
      try {
        const directResponse = await axios.get(
          `${ZOHO_CONFIG.baseUrls.inventory}/contacts/${contactId}`,
          {
            headers: {
              'Authorization': `Zoho-oauthtoken ${token}`,
              'X-com-zoho-inventory-organizationid': ZOHO_CONFIG.orgId
            }
          }
        );
        
        this.log('✅ Direct fetch successful', {
          found: true,
          contact: {
            id: directResponse.data.contact.contact_id,
            name: directResponse.data.contact.contact_name,
            status: directResponse.data.contact.status,
            created_time: directResponse.data.contact.created_time
          }
        });
        
      } catch (directError) {
        this.log('❌ Direct fetch failed', {
          status: directError.response?.status,
          error: directError.response?.data
        });
      }
      
      // Method 2: Search by contact_id parameter
      await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1 second
      
      const searchResponse = await axios.get(
        `${ZOHO_CONFIG.baseUrls.inventory}/contacts`,
        {
          params: {
            contact_id: contactId
          },
          headers: {
            'Authorization': `Zoho-oauthtoken ${token}`,
            'X-com-zoho-inventory-organizationid': ZOHO_CONFIG.orgId
          }
        }
      );
      
      const contacts = searchResponse.data.contacts || [];
      const found = contacts.find(c => c.contact_id === contactId);
      
      this.log('Search by ID result', {
        searchMethod: 'contact_id parameter',
        found: !!found,
        totalResults: contacts.length
      });
      
    } catch (error) {
      this.log('❌ Verification failed', {
        error: error.message,
        response: error.response?.data
      });
    }
  }

  async testCreateFullContact() {
    this.log('📋 Test 4: Creating Full Contact');
    
    try {
      const token = await getAccessToken();
      const timestamp = Date.now();
      
      const fullPayload = {
        contact_name: `Test Full ${timestamp}`,
        company_name: `Test Company ${timestamp}`,
        contact_type: 'customer',
        customer_sub_type: 'business',
        email: `test${timestamp}@example.com`,
        phone: '+44 20 1234 5678',
        currency_code: 'GBP',
        payment_terms: 30,
        credit_limit: 5000,
        status: 'active',
        is_portal_enabled: true,
        billing_address: {
          attention: `Test Full ${timestamp}`,
          address: '123 Test Street',
          city: 'London',
          state: 'Greater London',
          zip: 'SW1A 1AA',
          country: 'GB'
        },
        shipping_address: {
          attention: `Test Full ${timestamp}`,
          address: '123 Test Street',
          city: 'London',
          state: 'Greater London',
          zip: 'SW1A 1AA',
          country: 'GB'
        }
      };
      
      this.log('Sending full payload', fullPayload);
      
      const response = await axios.post(
        `${ZOHO_CONFIG.baseUrls.inventory}/contacts`,
        fullPayload,
        {
          headers: {
            'Authorization': `Zoho-oauthtoken ${token}`,
            'Content-Type': 'application/json',
            'X-com-zoho-inventory-organizationid': ZOHO_CONFIG.orgId
          }
        }
      );
      
      this.log('Full contact response', {
        status: response.status,
        code: response.data.code,
        message: response.data.message,
        hasContact: !!response.data.contact,
        contactId: response.data.contact?.contact_id,
        contactDetails: response.data.contact ? {
          id: response.data.contact.contact_id,
          name: response.data.contact.contact_name,
          email: response.data.contact.email,
          status: response.data.contact.status
        } : null
      });
      
      return response.data.contact?.contact_id;
      
    } catch (error) {
      this.log('❌ Full contact creation failed', {
        error: error.message,
        response: error.response?.data
      });
      return null;
    }
  }

  async testSearchContacts() {
    this.log('📋 Test 5: Searching Contacts');
    
    try {
      const token = await getAccessToken();
      
      // Search by different criteria
      const searchQueries = [
        { search_text: 'Test' },
        { email: 'test@example.com' },
        { contact_name: 'Test' }
      ];
      
      for (const query of searchQueries) {
        const response = await axios.get(
          `${ZOHO_CONFIG.baseUrls.inventory}/contacts`,
          {
            params: {
              ...query,
              contact_type: 'customer'
            },
            headers: {
              'Authorization': `Zoho-oauthtoken ${token}`,
              'X-com-zoho-inventory-organizationid': ZOHO_CONFIG.orgId
            }
          }
        );
        
        this.log(`Search with ${JSON.stringify(query)}`, {
          totalFound: response.data.contacts?.length || 0,
          pageContext: response.data.page_context,
          firstFewResults: response.data.contacts?.slice(0, 3).map(c => ({
            id: c.contact_id,
            name: c.contact_name,
            email: c.email
          }))
        });
      }
      
    } catch (error) {
      this.log('❌ Search test failed', {
        error: error.message,
        response: error.response?.data
      });
    }
  }

  async testListRecentContacts() {
    this.log('📋 Test 6: Listing Recent Contacts');
    
    try {
      const token = await getAccessToken();
      
      const response = await axios.get(
        `${ZOHO_CONFIG.baseUrls.inventory}/contacts`,
        {
          params: {
            sort_column: 'created_time',
            sort_order: 'D',
            per_page: 20,
            filter_by: 'Status.All'
          },
          headers: {
            'Authorization': `Zoho-oauthtoken ${token}`,
            'X-com-zoho-inventory-organizationid': ZOHO_CONFIG.orgId
          }
        }
      );
      
      this.log('Recent contacts', {
        total: response.data.page_context?.total || 0,
        showing: response.data.contacts?.length || 0,
        recentContacts: response.data.contacts?.slice(0, 10).map(c => ({
          id: c.contact_id,
          name: c.contact_name,
          email: c.email,
          status: c.status,
          type: c.contact_type,
          created: c.created_time,
          isActive: c.status === 'active'
        }))
      });
      
    } catch (error) {
      this.log('❌ List recent contacts failed', {
        error: error.message,
        response: error.response?.data
      });
    }
  }

  async testDifferentContactTypes() {
    this.log('📋 Test 7: Testing Different Contact Types');
    
    try {
      const token = await getAccessToken();
      const timestamp = Date.now();
      
      const contactTypes = [
        { contact_type: 'customer', customer_sub_type: 'individual' },
        { contact_type: 'customer', customer_sub_type: 'business' },
        { contact_type: 'vendor' }
      ];
      
      for (const typeConfig of contactTypes) {
        const payload = {
          contact_name: `Test ${typeConfig.contact_type} ${timestamp}`,
          ...typeConfig
        };
        
        try {
          const response = await axios.post(
            `${ZOHO_CONFIG.baseUrls.inventory}/contacts`,
            payload,
            {
              headers: {
                'Authorization': `Zoho-oauthtoken ${token}`,
                'Content-Type': 'application/json',
                'X-com-zoho-inventory-organizationid': ZOHO_CONFIG.orgId
              }
            }
          );
          
          this.log(`Contact type ${JSON.stringify(typeConfig)}`, {
            success: response.data.code === 0,
            contactId: response.data.contact?.contact_id,
            message: response.data.message
          });
          
        } catch (error) {
          this.log(`Failed type ${JSON.stringify(typeConfig)}`, {
            error: error.response?.data?.message || error.message
          });
        }
      }
      
    } catch (error) {
      this.log('❌ Contact types test failed', {
        error: error.message
      });
    }
  }
}

// Express endpoint to run tests
export async function runZohoContactTests(req, res) {
  try {
    const tester = new ZohoContactTester();
    const results = await tester.runAllTests();
    
    // Save results to Firestore for review
    const db = admin.firestore();
    const testDoc = await db.collection('zoho_test_results').add({
      ...results,
      ranBy: req.user?.email || 'anonymous',
      ranAt: admin.firestore.FieldValue.serverTimestamp()
    });
    
    res.json({
      success: true,
      testId: testDoc.id,
      results: results,
      summary: {
        totalTests: results.tests.length,
        failures: results.tests.filter(t => t.message.includes('❌')).length
      }
    });
    
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
      stack: error.stack
    });
  }
}

// Add this route to your server
// app.post('/api/zoho/test/contacts', runZohoContactTests);