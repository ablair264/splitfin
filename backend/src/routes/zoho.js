// server/src/routes/zoho.js
import express from 'express';
import { getAccessToken } from '../api/zoho.js';
import axios from 'axios';

const router = express.Router();

const ZOHO_CONFIG = {
  baseUrl: 'https://www.zohoapis.eu/inventory/v1',
  orgId: process.env.ZOHO_ORG_ID
};

// Update sales order status
router.put('/update-salesorder-status', async (req, res) => {
  try {
    const { salesorder_id, status } = req.body;
    
    if (!salesorder_id || !status) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: salesorder_id and status'
      });
    }
    
    const token = await getAccessToken();
    
    const response = await axios.put(
      `${ZOHO_CONFIG.baseUrl}/salesorders/${salesorder_id}/status/${status}`,
      {},
      {
        params: {
          organization_id: ZOHO_CONFIG.orgId
        },
        headers: {
          'Authorization': `Zoho-oauthtoken ${token}`,
          'Content-Type': 'application/json'
        }
      }
    );
    
    if (response.data.code === 0) {
      res.json({
        success: true,
        message: response.data.message,
        salesorder: response.data.salesorder
      });
    } else {
      res.status(400).json({
        success: false,
        error: response.data.message || 'Failed to update order status'
      });
    }
  } catch (error) {
    console.error('Error updating sales order status:', error);
    res.status(500).json({
      success: false,
      error: error.response?.data?.message || error.message
    });
  }
});

// Update contact details
router.put('/update-contact', async (req, res) => {
  try {
    const { contactId, updateData } = req.body;
    
    if (!contactId || !updateData) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: contactId and updateData'
      });
    }
    
    const token = await getAccessToken();
    
    const response = await axios.put(
      `${ZOHO_CONFIG.baseUrl}/contacts/${contactId}`,
      updateData,
      {
        params: {
          organization_id: ZOHO_CONFIG.orgId
        },
        headers: {
          'Authorization': `Zoho-oauthtoken ${token}`,
          'Content-Type': 'application/json'
        }
      }
    );
    
    if (response.data.code === 0) {
      res.json({
        success: true,
        message: response.data.message,
        contact: response.data.contact
      });
    } else {
      res.status(400).json({
        success: false,
        error: response.data.message || 'Failed to update contact'
      });
    }
  } catch (error) {
    console.error('Error updating contact:', error);
    res.status(500).json({
      success: false,
      error: error.response?.data?.message || error.message
    });
  }
});

// Get sales order details
router.get('/salesorder/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const token = await getAccessToken();
    
    const response = await axios.get(
      `${ZOHO_CONFIG.baseUrl}/salesorders/${id}`,
      {
        params: {
          organization_id: ZOHO_CONFIG.orgId
        },
        headers: {
          'Authorization': `Zoho-oauthtoken ${token}`
        }
      }
    );
    
    if (response.data.code === 0) {
      res.json({
        success: true,
        salesorder: response.data.salesorder
      });
    } else {
      res.status(404).json({
        success: false,
        error: response.data.message || 'Sales order not found'
      });
    }
  } catch (error) {
    console.error('Error fetching sales order:', error);
    res.status(500).json({
      success: false,
      error: error.response?.data?.message || error.message
    });
  }
});

export default router;
