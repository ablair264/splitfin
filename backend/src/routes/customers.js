// server/src/routes/customers.js (or add to existing routes)
import express from 'express';
import { 
  createCustomerAuth, 
  bulkCreateCustomerAuth, 
  createAuthForAllCustomers 
} from '../services/customerAuthService.js';

const router = express.Router();

// Create auth for single customer
router.post('/create-auth/:customerId', async (req, res) => {
  try {
    const { customerId } = req.params;
    const result = await createCustomerAuth(customerId);
    
    res.json({
      success: true,
      ...result
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Create auth for multiple customers
router.post('/bulk-create-auth', async (req, res) => {
  try {
    const { customerIds } = req.body;
    
    if (!Array.isArray(customerIds)) {
      return res.status(400).json({
        success: false,
        error: 'customerIds must be an array'
      });
    }
    
    const results = await bulkCreateCustomerAuth(customerIds);
    res.json({
      success: true,
      results
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Create auth for all customers without auth
router.post('/create-auth-all', async (req, res) => {
  try {
    const results = await createAuthForAllCustomers();
    res.json({
      success: true,
      results
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

export default router;