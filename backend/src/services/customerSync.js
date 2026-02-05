// server/src/services/customerSync.js
import { getAccessToken } from '../api/zoho.js';
import admin from '../config/firebase.js';
import axios from 'axios';

const db = admin.firestore();

export async function syncCustomerWithZoho(req, res) {
  try {
    const { customerId } = req.body; // Firebase customer ID
    
    if (!customerId) {
      return res.status(400).json({ error: 'Customer ID required' });
    }

    console.log(`🔄 Starting sync for customer: ${customerId}`);

    // Get customer from Firebase
    const customerDoc = await db.collection('customer_data')
      .where('firebase_uid', '==', customerId)
      .get();
    
    if (customerDoc.empty) {
      return res.status(404).json({ error: 'Customer not found' });
    }

    const customerData = customerDoc.docs[0].data();
    const docId = customerDoc.docs[0].id;
    
    console.log('📋 Customer data:', {
      name: customerData.customer_name || customerData.company_name,
      email: customerData.email
    });

    // If customer already has Zoho ID, return it
    if (customerData.customer_id) {
      console.log('✅ Customer already has Zoho ID:', customerData.customer_id);
      return res.json({
        success: true,
        message: 'Customer already synced',
        zohoCustomerId: customerData.customer_id
      });
    }

    const accessToken = await getAccessToken();

    // Search for customer in Zoho by email
    let zohoCustomerId = null;
    const searchEmail = customerData.email || customerData.Primary_Email;
    
    if (searchEmail) {
      console.log(`🔍 Searching Zoho for email: ${searchEmail}`);
      
      try {
        const searchResponse = await axios.get(
          `https://www.zohoapis.eu/inventory/v1/contacts`,
          {
            params: {
              email: searchEmail,
              organization_id: process.env.ZOHO_ORG_ID
            },
            headers: {
              'Authorization': `Zoho-oauthtoken ${accessToken}`
            }
          }
        );

        const contacts = searchResponse.data.contacts || [];
        if (contacts.length > 0) {
          zohoCustomerId = contacts[0].contact_id;
          console.log('✅ Found existing Zoho contact:', zohoCustomerId);
        }
      } catch (searchError) {
        console.log('⚠️ No existing contact found, will create new');
      }
    }

    // If not found, create new contact in Zoho
    if (!zohoCustomerId) {
      console.log('📝 Creating new Zoho contact...');
      
      const contactData = {
        contact_name: customerData.customer_name || customerData.company_name || 'Unknown Customer',
        company_name: customerData.company_name || customerData.customer_name || '',
        contact_type: 'customer',
        customer_sub_type: 'business',
        email: searchEmail || '',
        phone: customerData.phone || '',
        mobile: customerData.mobile || '',
        website: customerData.website || '',
        billing_address: {
          address: customerData.billing_address?.address || '',
          city: customerData.billing_address?.city || '',
          state: customerData.billing_address?.state || '',
          zip: customerData.billing_address?.zip || customerData.postcode || '',
          country: customerData.billing_address?.country || 'United Kingdom'
        },
        shipping_address: {
          address: customerData.shipping_address?.address || customerData.billing_address?.address || '',
          city: customerData.shipping_address?.city || customerData.billing_address?.city || '',
          state: customerData.shipping_address?.state || customerData.billing_address?.state || '',
          zip: customerData.shipping_address?.zip || customerData.billing_address?.zip || customerData.postcode || '',
          country: customerData.shipping_address?.country || 'United Kingdom'
        },
        payment_terms: customerData.payment_terms || 30,
        currency_code: 'GBP'
      };

      const createResponse = await axios.post(
        `https://www.zohoapis.eu/inventory/v1/contacts?organization_id=${process.env.ZOHO_ORG_ID}`,
        { JSONString: JSON.stringify(contactData) },
        {
          headers: {
            'Authorization': `Zoho-oauthtoken ${accessToken}`,
            'Content-Type': 'application/x-www-form-urlencoded'
          }
        }
      );

      if (createResponse.data.code === 0) {
        zohoCustomerId = createResponse.data.contact.contact_id;
        console.log('✅ Created new Zoho contact:', zohoCustomerId);
      } else {
        throw new Error(createResponse.data.message);
      }
    }

    // Update Firebase with Zoho customer ID
    await db.collection('customer_data').doc(docId).update({
      customer_id: zohoCustomerId,
      zoho_sync_date: new Date().toISOString(),
      sync_status: 'success'
    });

    console.log('✅ Updated Firebase with Zoho ID');

    res.json({
      success: true,
      message: 'Customer synced successfully',
      zohoCustomerId: zohoCustomerId
    });

  } catch (error) {
    console.error('❌ Customer sync error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}

// Sync all customers without Zoho IDs
export async function syncAllCustomers(req, res) {
  try {
    console.log('🔄 Starting bulk customer sync...');
    
    // Get all customers without customer_id
    const customersSnapshot = await db.collection('customer_data')
      .where('customer_id', '==', null)
      .limit(50) // Process in batches
      .get();
    
    const results = {
      total: customersSnapshot.size,
      synced: 0,
      failed: 0,
      errors: []
    };

    for (const doc of customersSnapshot.docs) {
      try {
        const customerData = doc.data();
        console.log(`Processing: ${customerData.customer_name || customerData.email}`);
        
        // Call sync function for each customer
        const response = await fetch(`http://localhost:${process.env.PORT || 3001}/api/customers/sync`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ customerId: customerData.firebase_uid })
        });
        
        if (response.ok) {
          results.synced++;
        } else {
          results.failed++;
          results.errors.push({
            customer: customerData.customer_name || customerData.email,
            error: await response.text()
          });
        }
      } catch (error) {
        results.failed++;
        results.errors.push({
          customer: doc.data().customer_name || doc.data().email,
          error: error.message
        });
      }
    }

    console.log('✅ Bulk sync complete:', results);
    res.json(results);

  } catch (error) {
    console.error('❌ Bulk sync error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}