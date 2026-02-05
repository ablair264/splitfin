// server/src/routes/createContact.js
import { createInventoryContact } from '../api/zoho.js';

export async function createZohoContact(req, res) {
  try {
    const contactData = req.body;
    
    // Validate required fields (only contact_name is required by Zoho)
    if (!contactData.contact_name) {
      return res.status(400).json({
        success: false,
        message: 'Contact name is required'
      });
    }
    
    // Ensure contact_type is set to 'customer'
    const zohoPayload = {
      contact_type: 'customer', // Always set this
      customer_sub_type: contactData.company_name ? 'business' : 'individual',
      ...contactData
    };
    
    console.log('Creating Zoho contact with payload:', {
      name: zohoPayload.contact_name,
      email: zohoPayload.email || 'No email',
      type: zohoPayload.contact_type
    });
    
    const result = await createInventoryContact(zohoPayload);
    
    // Validate the response
    if (result.code !== 0) {
      throw new Error(result.message || 'Contact creation failed');
    }
    
    // Enhanced success logging
    const createdContact = result.contact;
    console.log('✅ Contact successfully created:', {
      contact_id: createdContact.contact_id,
      contact_name: createdContact.contact_name,
      contact_type: createdContact.contact_type,
      is_customer: createdContact.contact_type === 'customer'
    });
    
    res.json({
      success: true,
      contact: createdContact,
      contactId: createdContact.contact_id,
      message: 'Contact created successfully in Zoho Inventory'
    });
    
  } catch (error) {
    console.error('Error creating Zoho contact:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to create contact in Zoho',
      error: error.response?.data || error.message
    });
  }
}