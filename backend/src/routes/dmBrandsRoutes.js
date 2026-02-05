// server/src/routes/dmBrandsRoutes.js
import express from 'express';
import admin from 'firebase-admin';
import { getAccessToken } from './auth.js';

const router = express.Router();
const db = admin.firestore();

// ── BRANDS ENDPOINTS ──────────────────────────────────────────────────────

/**
 * Get all brands with product counts
 * GET /api/dm-brands/brands
 */
router.get('/brands', async (req, res) => {
  try {
    console.log('🔄 Fetching brands from Firebase...');
    
    const brandsSnapshot = await db.collection('items_data')
      .where('status', '==', 'active')
      .get();
    
    // Group products by brand
    const brandMap = new Map();
    
    brandsSnapshot.forEach(doc => {
      const product = doc.data();
      const brandName = product.brand || product.Manufacturer || 'Unknown';
      const brandNormalized = product.brand_normalized || brandName.toLowerCase().replace(/[^a-z0-9]/g, '');
      
      if (!brandMap.has(brandNormalized)) {
        brandMap.set(brandNormalized, {
          id: brandNormalized,
          name: brandName,
          productCount: 0,
          lastOrdered: null,
          logoUrl: null
        });
      }
      
      const brand = brandMap.get(brandNormalized);
      brand.productCount++;
    });
    
    const brands = Array.from(brandMap.values())
      .sort((a, b) => a.name.localeCompare(b.name));
    
    console.log(`✅ Found ${brands.length} brands`);
    res.json({
      success: true,
      data: brands
    });
    
  } catch (error) {
    console.error('❌ Error fetching brands:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Get products by brand
 * GET /api/dm-brands/brands/:brandId/products
 */
router.get('/brands/:brandId/products', async (req, res) => {
  try {
    const { brandId } = req.params;
    const { search, category, status, limit = 50, offset = 0 } = req.query;
    
    console.log(`🔄 Fetching products for brand: ${brandId}`);
    
    let query = db.collection('items_data')
      .where('brand_normalized', '==', brandId)
      .where('status', '==', 'active');
    
    // Apply filters
    if (category) {
      query = query.where('category', '==', category);
    }
    
    const snapshot = await query.get();
    
    let products = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
    
    // Apply search filter (client-side for now)
    if (search) {
      const searchLower = search.toLowerCase();
      products = products.filter(product => 
        product.name?.toLowerCase().includes(searchLower) ||
        product.sku?.toLowerCase().includes(searchLower) ||
        product.description?.toLowerCase().includes(searchLower)
      );
    }
    
    // Apply pagination
    const total = products.length;
    products = products.slice(parseInt(offset), parseInt(offset) + parseInt(limit));
    
    console.log(`✅ Found ${products.length} products for brand ${brandId}`);
    res.json({
      success: true,
      data: {
        products,
        pagination: {
          total,
          limit: parseInt(limit),
          offset: parseInt(offset),
          hasMore: parseInt(offset) + parseInt(limit) < total
        }
      }
    });
    
  } catch (error) {
    console.error('❌ Error fetching brand products:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ── CUSTOMERS ENDPOINTS ───────────────────────────────────────────────────

/**
 * Get customers for DM Brands ordering
 * GET /api/dm-brands/customers
 */
router.get('/customers', async (req, res) => {
  try {
    const { search, limit = 100 } = req.query;
    
    console.log('🔄 Fetching customers for DM Brands...');
    
    let query = db.collection('customers')
      .where('status', '==', 'active')
      .orderBy('customer_name')
      .limit(parseInt(limit));
    
    const snapshot = await query.get();
    
    let customers = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
    
    // Apply search filter
    if (search) {
      const searchLower = search.toLowerCase();
      customers = customers.filter(customer => 
        customer.customer_name?.toLowerCase().includes(searchLower) ||
        customer.email?.toLowerCase().includes(searchLower) ||
        customer.company_name?.toLowerCase().includes(searchLower)
      );
    }
    
    console.log(`✅ Found ${customers.length} customers`);
    res.json({
      success: true,
      data: customers
    });
    
  } catch (error) {
    console.error('❌ Error fetching customers:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Get customer by ID
 * GET /api/dm-brands/customers/:customerId
 */
router.get('/customers/:customerId', async (req, res) => {
  try {
    const { customerId } = req.params;
    
    const customerDoc = await db.collection('customers').doc(customerId).get();
    
    if (!customerDoc.exists) {
      return res.status(404).json({
        success: false,
        error: 'Customer not found'
      });
    }
    
    res.json({
      success: true,
      data: {
        id: customerDoc.id,
        ...customerDoc.data()
      }
    });
    
  } catch (error) {
    console.error('❌ Error fetching customer:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ── ORDERS ENDPOINTS ──────────────────────────────────────────────────────

/**
 * Create a new order
 * POST /api/dm-brands/orders
 */
router.post('/orders', async (req, res) => {
  try {
    const { customerId, items, notes, agentId } = req.body;
    
    if (!customerId || !items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Customer ID and items array are required'
      });
    }
    
    console.log(`🔄 Creating order for customer: ${customerId}`);
    
    // Get customer data to find salesperson_zoho_id
    const customerDoc = await db.collection('customers').doc(customerId).get();
    if (!customerDoc.exists) {
      return res.status(404).json({
        success: false,
        error: 'Customer not found'
      });
    }
    
    const customerData = customerDoc.data();
    const salespersonZohoId = customerData.salesperson_zoho_id;
    
    // Calculate order total
    const orderTotal = items.reduce((total, item) => {
      return total + (item.quantity * item.price);
    }, 0);
    
    // Create order document in sales_orders collection
    const orderData = {
      customerId,
      customerName: customerData.customer_name || customerData.name,
      items,
      orderTotal,
      notes: notes || '',
      agentId: agentId || null,
      salespersonZohoId: salespersonZohoId || null,
      source: 'website',
      status: 'pending',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    };
    
    const orderRef = await db.collection('sales_orders').add(orderData);
    
    // If we have a salesperson_zoho_id, add order to sales_agent collection
    if (salespersonZohoId) {
      try {
        // Find the sales agent by zohospID
        const salesAgentQuery = await db.collection('sales_agent')
          .where('zohospID', '==', salespersonZohoId)
          .limit(1)
          .get();
        
        if (!salesAgentQuery.empty) {
          const salesAgentDoc = salesAgentQuery.docs[0];
          const salesAgentId = salesAgentDoc.id;
          
          // Add order to customers_orders subcollection
          await db.collection('sales_agent')
            .doc(salesAgentId)
            .collection('customers_orders')
            .doc(orderRef.id)
            .set({
              orderId: orderRef.id,
              customerId,
              customerName: customerData.customer_name || customerData.name,
              orderTotal,
              status: 'pending',
              source: 'website',
              createdAt: admin.firestore.FieldValue.serverTimestamp()
            });
          
          console.log(`✅ Order added to sales agent ${salesAgentId} customers_orders collection`);
        } else {
          console.warn(`⚠️ No sales agent found with zohospID: ${salespersonZohoId}`);
        }
      } catch (error) {
        console.error('❌ Error adding order to sales agent collection:', error);
        // Don't fail the order creation if this step fails
      }
    }
    
    console.log(`✅ Order created with ID: ${orderRef.id}`);
    
    res.json({
      success: true,
      data: {
        orderId: orderRef.id,
        orderNumber: `DM-${orderRef.id.slice(-8).toUpperCase()}`,
        orderTotal,
        status: 'pending',
        salespersonZohoId
      }
    });
    
  } catch (error) {
    console.error('❌ Error creating order:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Get order by ID
 * GET /api/dm-brands/orders/:orderId
 */
router.get('/orders/:orderId', async (req, res) => {
  try {
    const { orderId } = req.params;
    
    const orderDoc = await db.collection('sales_orders').doc(orderId).get();
    
    if (!orderDoc.exists) {
      return res.status(404).json({
        success: false,
        error: 'Order not found'
      });
    }
    
    const orderData = orderDoc.data();
    
    // Get customer details
    const customerDoc = await db.collection('customers').doc(orderData.customerId).get();
    const customerData = customerDoc.exists ? customerDoc.data() : null;
    
    res.json({
      success: true,
      data: {
        id: orderDoc.id,
        ...orderData,
        customer: customerData ? {
          id: customerDoc.id,
          ...customerData
        } : null
      }
    });
    
  } catch (error) {
    console.error('❌ Error fetching order:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Update order status
 * PATCH /api/dm-brands/orders/:orderId/status
 */
router.patch('/orders/:orderId/status', async (req, res) => {
  try {
    const { orderId } = req.params;
    const { status } = req.body;
    
    if (!status) {
      return res.status(400).json({
        success: false,
        error: 'Status is required'
      });
    }
    
    const validStatuses = ['pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid status'
      });
    }
    
    // Update order in sales_orders collection
    await db.collection('sales_orders').doc(orderId).update({
      status,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });
    
    // Also update in sales_agent collection if it exists
    try {
      const orderDoc = await db.collection('sales_orders').doc(orderId).get();
      if (orderDoc.exists) {
        const orderData = orderDoc.data();
        const salespersonZohoId = orderData.salespersonZohoId;
        
        if (salespersonZohoId) {
          // Find the sales agent
          const salesAgentQuery = await db.collection('sales_agent')
            .where('zohospID', '==', salespersonZohoId)
            .limit(1)
            .get();
          
          if (!salesAgentQuery.empty) {
            const salesAgentDoc = salesAgentQuery.docs[0];
            const salesAgentId = salesAgentDoc.id;
            
            // Update order in customers_orders subcollection
            await db.collection('sales_agent')
              .doc(salesAgentId)
              .collection('customers_orders')
              .doc(orderId)
              .update({
                status,
                updatedAt: admin.firestore.FieldValue.serverTimestamp()
              });
            
            console.log(`✅ Order status updated in sales agent ${salesAgentId} customers_orders collection`);
          }
        }
      }
    } catch (error) {
      console.error('❌ Error updating order in sales agent collection:', error);
      // Don't fail the status update if this step fails
    }
    
    console.log(`✅ Order ${orderId} status updated to: ${status}`);
    
    res.json({
      success: true,
      data: { status }
    });
    
  } catch (error) {
    console.error('❌ Error updating order status:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ── PRODUCT SEARCH ENDPOINTS ──────────────────────────────────────────────

/**
 * Search products across all brands
 * GET /api/dm-brands/products/search
 */
router.get('/products/search', async (req, res) => {
  try {
    const { q, brand, category, limit = 50, offset = 0 } = req.query;
    
    if (!q) {
      return res.status(400).json({
        success: false,
        error: 'Search query is required'
      });
    }
    
    console.log(`🔄 Searching products with query: ${q}`);
    
    let query = db.collection('items_data')
      .where('status', '==', 'active');
    
    // Apply brand filter if specified
    if (brand) {
      query = query.where('brand_normalized', '==', brand);
    }
    
    const snapshot = await query.get();
    
    let products = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
    
    // Apply search filter
    const searchLower = q.toLowerCase();
    products = products.filter(product => 
      product.name?.toLowerCase().includes(searchLower) ||
      product.sku?.toLowerCase().includes(searchLower) ||
      product.description?.toLowerCase().includes(searchLower) ||
      product.brand?.toLowerCase().includes(searchLower)
    );
    
    // Apply category filter
    if (category) {
      products = products.filter(product => 
        product.category?.toLowerCase() === category.toLowerCase()
      );
    }
    
    // Apply pagination
    const total = products.length;
    products = products.slice(parseInt(offset), parseInt(offset) + parseInt(limit));
    
    console.log(`✅ Found ${products.length} products matching search`);
    res.json({
      success: true,
      data: {
        products,
        pagination: {
          total,
          limit: parseInt(limit),
          offset: parseInt(offset),
          hasMore: parseInt(offset) + parseInt(limit) < total
        }
      }
    });
    
  } catch (error) {
    console.error('❌ Error searching products:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

export default router; 