// server/src/services/updateContact.js
import { getAccessToken } from '../api/zoho.js';
import axios from 'axios';

export async function updateZohoContact(req, res) {
  try {
    const { contactId, updateData } = req.body;
    
    if (!contactId || !updateData) {
      return res.status(400).json({ error: 'Missing contactId or updateData' });
    }

    const accessToken = await getAccessToken();
    
    const response = await axios.put(
      `https://www.zohoapis.eu/inventory/v1/contacts/${contactId}`,
      updateData,
      {
        headers: {
          'Authorization': `Zoho-oauthtoken ${accessToken}`,
          'Content-Type': 'application/json',
          'X-com-zoho-inventory-organizationid': process.env.ZOHO_ORG_ID
        }
      }
    );
    
    if (response.data.code === 0) {
      res.json({ 
        success: true, 
        data: response.data.contact 
      });
    } else {
      res.status(400).json({ 
        success: false, 
        error: response.data.message 
      });
    }
  } catch (error) {
    console.error('Error updating Zoho contact:', error);
    res.status(500).json({ 
      success: false, 
      error: error.response?.data?.message || error.message 
    });
  }
}