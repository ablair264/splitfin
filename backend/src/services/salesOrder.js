// server/src/services/salesOrder.js
import { getAccessToken } from '../api/zoho.js';
import axios from 'axios';
import qs from 'qs';

export async function createZohoSalesOrder(req, res) {
  try {
    const orderData = req.body;
    
    console.log('📦 Received order data:', JSON.stringify(orderData, null, 2));
    
    if (!orderData || Object.keys(orderData).length === 0) {
      return res.status(400).json({ 
        error: 'Missing or empty order data',
        received: orderData 
      });
    }

    const accessToken = await getAccessToken();
    console.log('🔑 Got access token');
    
    // Zoho expects form-encoded data with JSONString parameter
    const formData = qs.stringify({
      JSONString: JSON.stringify(orderData)
    });
    
    const response = await axios.post(
      `https://www.zohoapis.eu/inventory/v1/salesorders?organization_id=${process.env.ZOHO_ORG_ID}`,
      formData,
      {
        headers: {
          'Authorization': `Zoho-oauthtoken ${accessToken}`,
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      }
    );
    
    console.log('✅ Zoho response:', response.data);
    
    if (response.data.code === 0) {
      const salesOrder = response.data.salesorder;
      res.json({ 
        success: true, 
        salesorder_id: salesOrder.salesorder_id,
        salesorder_number: salesOrder.salesorder_number,
        zohoSalesOrder: salesOrder
      });
    } else {
      console.error('❌ Zoho API error:', response.data);
      res.status(400).json({ 
        success: false, 
        error: response.data.message,
        code: response.data.code
      });
    }
  } catch (error) {
    console.error('❌ Error creating Zoho sales order:', error.response?.data || error.message);
    
    res.status(500).json({ 
      success: false, 
      error: error.response?.data?.message || error.message,
      code: error.response?.data?.code || 'UNKNOWN_ERROR',
      details: error.response?.data
    });
  }
}