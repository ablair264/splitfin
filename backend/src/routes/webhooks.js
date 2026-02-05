// server/src/routes/webhooks.js
import express from 'express';
import { createSalesOrder } from '../api/zoho.js';
import admin from 'firebase-admin';
import cronDataSyncService from '../services/cronDataSyncService.js';
import zohoReportsService from '../services/zohoReportsService.js';
import { createCustomerAuth } from '../services/customerAuthService.js';

const router = express.Router();

/**
 * Webhook authentication middleware
 */
function authenticateWebhook(req, res, next) {
    const webhookSecret = req.headers['x-webhook-secret'];
    
    // Skip auth if no secret is configured (for testing)
    if (!process.env.WEBHOOK_SECRET) {
        console.warn('⚠️  No WEBHOOK_SECRET configured - webhook auth disabled');
        return next();
    }
    
    // Check if secret matches
    if (webhookSecret !== process.env.WEBHOOK_SECRET) {
        console.warn(`Webhook auth failed from IP: ${req.ip}`);
        return res.status(401).json({ 
            success: false,
            error: 'Unauthorized - Invalid webhook secret' 
        });
    }
    
    next();
}

/**
 * Enhanced validation middleware with agent ID handling
 */
function validateOrderData(req, res, next) {
    const { firebaseUID, customer_id, line_items } = req.body;
    
    if (!firebaseUID) {
        return res.status(400).json({ 
            success: false,
            error: 'firebaseUID is required' 
        });
    }
    
    if (!customer_id) {
        return res.status(400).json({ 
            success: false,
            error: 'customer_id is required' 
        });
    }
    
    if (!line_items || !Array.isArray(line_items) || line_items.length === 0) {
        return res.status(400).json({ 
            success: false,
            error: 'line_items array is required and must not be empty' 
        });
    }
    
    // Validate each line item
    for (let i = 0; i < line_items.length; i++) {
        const item = line_items[i];
        if (!item.item_id || !item.name || !item.quantity || !item.item_total) {
            return res.status(400).json({ 
                success: false,
                error: `Invalid line item at index ${i}. Required fields: item_id, name, quantity, item_total` 
            });
        }
        
        // Ensure numeric values
        if (typeof item.quantity !== 'number' || typeof item.item_total !== 'number') {
            return res.status(400).json({ 
                success: false,
                error: `Line item at index ${i}: quantity and item_total must be numbers` 
            });
        }
    }
    
    next();
}

/**
 * Middleware to get user context and agent IDs
 */
async function getUserAgentContext(req, res, next) {
    try {
        const { firebaseUID } = req.body;
        
        if (!firebaseUID) {
            return next(); // Skip if no firebaseUID (validation will catch this)
        }
        
        const db = admin.firestore();
        const userDoc = await db.collection('users').doc(firebaseUID).get();
        
        if (!userDoc.exists) {
            return res.status(404).json({
                success: false,
                error: 'User not found'
            });
        }
        
        const userData = userDoc.data();
        
        // Add agent context to request
        req.agentContext = {
            firebaseUID,
            agentCRMId: userData.agentID,           // CRM Agent ID
            agentInventoryId: userData.zohospID,    // Inventory Salesperson ID  
            email: userData.email,
            name: userData.name,
            role: userData.role
        };
        
        console.log(`👤 User context: ${userData.name} (${userData.email})`);
        console.log(`🔑 Agent IDs - CRM: ${userData.agentID}, Inventory: ${userData.zohospID}`);
        
        next();
    } catch (error) {
        console.error('❌ Error getting user agent context:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to validate user context'
        });
    }
}

// Test endpoint - enhanced with agent ID info
router.get('/test', (req, res) => {
    res.status(200).json({
        success: true,
        message: 'Webhook endpoint is working',
        timestamp: new Date().toISOString(),
        agentIdStrategy: 'CRM-first with Inventory fallback',
        server: {
            uptime: process.uptime(),
            memory: process.memoryUsage(),
            nodeVersion: process.version
        },
        dataFlow: {
            step1: 'Receive order with firebaseUID',
            step2: 'Get user context (CRM ID + Inventory ID)',
            step3: 'Create order with Inventory Salesperson ID',
            step4: 'Store order with both agent IDs for tracking'
        }
    });
});

// Health check specifically for webhooks
router.get('/health', (req, res) => {
    res.status(200).json({
        success: true,
        message: 'Webhook service is healthy',
        timestamp: new Date().toISOString(),
        endpoints: {
            'POST /api/webhooks/create-order': 'Create sales order with proper agent tracking',
            'POST /api/webhooks/sync-customer': 'Sync customer from Zoho to Firebase',
            'POST /api/webhooks/sync-customers': 'Sync all customers from Zoho to Firebase',
            'POST /api/webhooks/sync-order': 'Sync order from Zoho to Firebase',
            'POST /api/webhooks/trigger-sync': 'Trigger manual sync process',
            'GET /api/webhooks/order-status/:id': 'Get order status',
            'GET /api/webhooks/user-orders/:userId': 'Get user recent orders',
            'GET /api/webhooks/test': 'Test endpoint',
            'GET /api/webhooks/health': 'Health check'
        },
        syncTypes: {
            high: 'Sync last hour data',
            medium: 'Sync last 24 hours',
            low: 'Sync last 7 days + cleanup',
            customers: 'Sync only customers',
            orders: 'Sync only orders'
        }
    });
});

// Main webhook endpoint with enhanced agent handling
router.post('/create-order', validateOrderData, getUserAgentContext, async (req, res) => {
    // Set a shorter timeout to prevent Render timeout
    const timeout = setTimeout(() => {
        if (!res.headersSent) {
            res.status(408).json({
                success: false,
                message: 'Request timeout - order processing is taking too long',
                error: 'TIMEOUT'
            });
        }
    }, 12000); // 12 seconds to stay under Render's 15-second limit

    try {
        console.log('📥 Received order creation request:', JSON.stringify(req.body, null, 2));
        
        const { customer_id, line_items } = req.body;
        const agentContext = req.agentContext;
        
        // ENHANCED: Transform with proper agent ID mapping
        const orderData = {
            zohoCustID: customer_id,
            // FIXED: Use Inventory Salesperson ID for sales order creation
            agentZohoCRMId: agentContext.agentInventoryId, // This goes to Inventory API
            items: line_items.map(item => ({
                item_id: item.item_id,
                name: item.name,
                quantity: item.quantity,
                item_total: item.item_total
            })),
            // Enhanced metadata for tracking
            metadata: {
                createdBy: agentContext.name,
                createdByEmail: agentContext.email,
                firebaseUID: agentContext.firebaseUID,
                agentCRMId: agentContext.agentCRMId,
                agentInventoryId: agentContext.agentInventoryId,
                source: 'webhook'
            }
        };
        
        console.log('🔄 Transformed order data for Zoho:');
        console.log(`   Customer ID: ${orderData.zohoCustID}`);
        console.log(`   Agent Inventory ID: ${orderData.agentZohoCRMId}`);
        console.log(`   Items: ${orderData.items.length}`);
        
        // Create sales order using your existing function
        const result = await createSalesOrder(orderData);
        
        // ENHANCED: Store order in Firebase with both agent IDs for proper tracking
        if (result.success && result.salesorder) {
            const db = admin.firestore();
            const orderDoc = {
                // Zoho data
                zohoOrderID: result.salesorder.salesorder_id,
                zohoOrderNumber: result.salesorder.salesorder_number,
                
                // Agent tracking (BOTH IDs for complete mapping)
                agentCRMId: agentContext.agentCRMId,           // For customer filtering
                agentInventoryId: agentContext.agentInventoryId, // For Inventory operations
                agent: agentContext.email,                     // For backward compatibility
                firebaseUID: agentContext.firebaseUID,
                
                // Order details
                customer_id: customer_id,
                line_items: line_items,
                totalAmount: parseFloat(result.salesorder.total || 0),
                status: result.salesorder.status || 'draft',
                
                // Timestamps
                createdAt: admin.firestore.FieldValue.serverTimestamp(),
                submittedAt: admin.firestore.FieldValue.serverTimestamp(),
                
                // Source tracking
                source: 'webhook',
                isDraft: false,
                needsZohoUpload: false,
                zohoUploaded: true,
                zohoUploadedAt: admin.firestore.FieldValue.serverTimestamp(),
                
                // Enhanced response data
                zohoResponse: {
                    code: result.code || 0,
                    message: result.message || 'Sales Order created successfully',
                    salesorder: result.salesorder
                }
            };
            
            // Generate order ID
            const orderID = `WH-${Date.now()}-${Math.random().toString(36).substr(2, 9).toUpperCase()}`;
            
            await db.collection('orders').doc(orderID).set({
                orderID,
                ...orderDoc
            });
            
            console.log(`💾 Order stored in Firebase with ID: ${orderID}`);
        }
        
        // Clear timeout since we got a response
        clearTimeout(timeout);
        
        if (res.headersSent) {
            console.log('⚠️ Response already sent due to timeout');
            return;
        }
        
        console.log('✅ Sales order created successfully:', result.salesorder?.salesorder_number);
        
        res.status(200).json({
            success: true,
            message: 'Sales order created successfully',
            data: {
                salesorder_id: result.salesorder?.salesorder_id,
                salesorder_number: result.salesorder?.salesorder_number,
                total: result.salesorder?.total,
                status: result.salesorder?.status,
                firebaseUID: agentContext.firebaseUID,
                agentTracking: {
                    agentName: agentContext.name,
                    agentEmail: agentContext.email,
                    agentCRMId: agentContext.agentCRMId,
                    agentInventoryId: agentContext.agentInventoryId
                }
            }
        });
        
    } catch (error) {
        clearTimeout(timeout);
        
        if (res.headersSent) {
            console.log('⚠️ Response already sent due to timeout');
            return;
        }
        
        console.error('❌ Webhook error:', error.message);
        console.error('Full error:', error);
        
        // Handle specific Zoho API errors
        if (error.response?.data) {
            const zohoError = error.response.data;
            return res.status(400).json({
                success: false,
                message: 'Zoho API error',
                error: zohoError.message || 'Unknown Zoho error',
                code: zohoError.code,
                agentContext: req.agentContext ? {
                    name: req.agentContext.name,
                    email: req.agentContext.email
                } : null
            });
        }
        
        res.status(500).json({
            success: false,
            message: 'Failed to create sales order',
            error: error.message,
            agentContext: req.agentContext ? {
                name: req.agentContext.name,
                email: req.agentContext.email
            } : null
        });
    }
});

router.post('/create-customer-auth/:customerId', authenticateWebhook, async (req, res) => {
  try {
    const { customerId } = req.params;
    
    // Import the function at the top of webhooks.js
    const { createCustomerAuth } = await import('../services/customerAuthService.js');
    
    const result = await createCustomerAuth(customerId);
    
    res.json({
      success: true,
      ...result
    });
    
  } catch (error) {
    console.error('❌ Customer auth error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Enhanced endpoint to get order status with agent filtering
router.get('/order-status/:id', async (req, res) => {
    try {
        const orderId = req.params.id;
        const { userId } = req.query; // Optional user filtering
        
        // Validate orderId
        if (!orderId) {
            return res.status(400).json({
                success: false,
                error: 'Order ID is required'
            });
        }
        
        const db = admin.firestore();
        
        // Get order from Firebase
        const orderDoc = await db.collection('orders').doc(orderId).get();
        
        if (!orderDoc.exists) {
            return res.status(404).json({
                success: false,
                error: 'Order not found'
            });
        }
        
        const orderData = orderDoc.data();
        
        // ENHANCED: If userId provided, verify user has access to this order
        if (userId) {
            const userDoc = await db.collection('users').doc(userId).get();
            
            if (userDoc.exists) {
                const userData = userDoc.data();
                
                // Check if user is the order creator or has access
                if (userData.role === 'salesAgent' && orderData.firebaseUID !== userId) {
                    return res.status(403).json({
                        success: false,
                        error: 'Access denied - not your order'
                    });
                }
            }
        }
        
        res.status(200).json({
            success: true,
            message: 'Order status retrieved',
            data: {
                orderID: orderData.orderID,
                zohoOrderID: orderData.zohoOrderID,
                zohoOrderNumber: orderData.zohoOrderNumber,
                status: orderData.status,
                totalAmount: orderData.totalAmount,
                createdAt: orderData.createdAt,
                agentInfo: {
                    agentEmail: orderData.agent,
                    agentCRMId: orderData.agentCRMId,
                    agentInventoryId: orderData.agentInventoryId
                },
                customerInfo: {
                    customer_id: orderData.customer_id
                },
                lineItems: orderData.line_items?.length || 0
            }
        });
        
    } catch (error) {
        console.error('❌ Error fetching order status:', error.message);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch order status',
            error: error.message
        });
    }
});

// Endpoint to get user's recent orders
router.get('/user-orders/:userId', async (req, res) => {
    try {
        const { userId } = req.params;
        const { limit = 10 } = req.query;
        
        const db = admin.firestore();
        
        // Get user context first
        const userDoc = await db.collection('users').doc(userId).get();
        if (!userDoc.exists) {
            return res.status(404).json({
                success: false,
                error: 'User not found'
            });
        }
        
        const userData = userDoc.data();
        
        // Query orders based on role
        let ordersQuery = db.collection('orders');
        
        if (userData.role === 'salesAgent') {
            // Sales agents see only their orders
            ordersQuery = ordersQuery.where('firebaseUID', '==', userId);
        }
        // Brand managers see all orders (no additional filter)
        
        const ordersSnapshot = await ordersQuery
            .orderBy('createdAt', 'desc')
            .limit(parseInt(limit))
            .get();
        
        const orders = ordersSnapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        }));
        
        res.json({
            success: true,
            data: {
                orders,
                total: orders.length,
                userRole: userData.role
            }
        });
        
    } catch (error) {
        console.error('❌ Error fetching user orders:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

router.post('/sync-customers', authenticateWebhook, async (req, res) => {
    try {
        const { 
            dateRange = '7_days',
            customDateRange = null 
        } = req.body;
        
        console.log(`👥 Customer sync webhook triggered for ${dateRange}`);
        
        // Call the sync function from zohoReportsService
        const result = await zohoReportsService.syncCustomers(dateRange);
        
        console.log(`✅ Customer sync completed: ${result.synced} synced, ${result.enriched} enriched`);
        
        res.json({
            success: true,
            message: 'Customer sync completed successfully',
            data: {
                synced: result.synced,
                enriched: result.enriched,
                dateRange: dateRange,
                timestamp: new Date().toISOString()
            }
        });
        
    } catch (error) {
        console.error('❌ Customer sync webhook error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to sync customers',
            details: error.message
        });
    }
});

/**
 * Handle Make.com webhook after customer creation in Zoho
 */
router.post('/sync-customer', authenticateWebhook, async (req, res) => {
    try {
        const { 
            firebase_doc_id, 
            zoho_customer_id,
            zoho_contact_data 
        } = req.body;

        console.log('📥 Received customer sync request:', {
            firebase_doc_id,
            zoho_customer_id
        });

        if (!firebase_doc_id || !zoho_customer_id) {
            return res.status(400).json({ 
                success: false,
                error: 'Missing required fields: firebase_doc_id or zoho_customer_id' 
            });
        }

        const db = admin.firestore();
        
        // Prepare update data matching your existing structure
        const updateData = {
            customer_id: zoho_customer_id,
            sync_status: 'synced',
            _lastSynced: admin.firestore.FieldValue.serverTimestamp(),
            last_modified_time: new Date().toISOString()
        };

        // If full Zoho contact data is provided, add it
        if (zoho_contact_data) {
            updateData.zoho_data = JSON.stringify(zoho_contact_data);
            updateData._source = 'make_webhook';
            
            // Extract key fields to top level for easier querying
            updateData.customer_name = zoho_contact_data.contact_name || zoho_contact_data.customer_name;
            updateData.company_name = zoho_contact_data.company_name || '';
            updateData.email = zoho_contact_data.email || '';
            updateData.phone = zoho_contact_data.phone || '';
            updateData.currency_code = zoho_contact_data.currency_code || 'GBP';
            updateData.payment_terms = zoho_contact_data.payment_terms || 30;
            updateData.status = zoho_contact_data.status || 'active';
            updateData.outstanding_receivable_amount = zoho_contact_data.outstanding_receivable_amount || 0;
            
            // Handle addresses
            if (zoho_contact_data.billing_address) {
                updateData.billing_address = zoho_contact_data.billing_address;
            }
            if (zoho_contact_data.shipping_address) {
                updateData.shipping_address = zoho_contact_data.shipping_address;
            }
        }

        // Update the Firebase document
        await db.collection('customer_data').doc(firebase_doc_id).update(updateData);

        console.log(`✅ Customer ${zoho_customer_id} synced to Firebase doc ${firebase_doc_id}`);
        
        res.json({ 
            success: true, 
            message: 'Customer synced successfully',
            firebase_doc_id,
            zoho_customer_id,
            sync_fields_updated: Object.keys(updateData).length
        });
        
    } catch (error) {
        console.error('❌ Customer sync error:', error);
        res.status(500).json({ 
            success: false,
            error: 'Failed to sync customer',
            details: error.message 
        });
    }
});

/**
 * Handle Make.com webhook after sales order creation in Zoho
 */
router.post('/sync-order', authenticateWebhook, async (req, res) => {
    try {
        const { 
            salesorder_id,
            salesorder_number,
            customer_id,
            refresh_from_zoho = true
        } = req.body;

        console.log('📥 Received order sync request:', {
            salesorder_id,
            salesorder_number,
            customer_id
        });

        if (!salesorder_id) {
            return res.status(400).json({ 
                success: false,
                error: 'Missing required field: salesorder_id' 
            });
        }

        const db = admin.firestore();
        
        if (refresh_from_zoho) {
            // Fetch the complete order from Zoho
            const orderDetails = await zohoReportsService.getSalesOrderById(salesorder_id);
            
            if (orderDetails) {
                // Enrich the order with UIDs
                const enrichedOrders = await cronDataSyncService.enrichOrdersWithUIDs([orderDetails]);
                const enrichedOrder = enrichedOrders[0];
                
                // Save to salesorders collection
                await db.collection('salesorders').doc(salesorder_id).set({
                    ...enrichedOrder,
                    _lastSynced: admin.firestore.FieldValue.serverTimestamp(),
                    _syncSource: 'webhook_make'
                });
                
                // Process sales transactions
                const transactions = await cronDataSyncService.processSalesTransactions(
                    [enrichedOrder], 
                    db
                );
                
                // Save transactions using the batch write method
                if (transactions.length > 0) {
                    await cronDataSyncService._batchWrite(
                        db, 
                        'sales_transactions', 
                        transactions, 
                        'transaction_id'
                    );
                    
                    // Update brand statistics
                    await cronDataSyncService.updateBrandStatistics(transactions, '30_days');
                }
                
                console.log(`✅ Sales order ${salesorder_id} synced with ${transactions.length} transactions`);
                
                res.json({ 
                    success: true, 
                    salesorder_id,
                    salesorder_number: orderDetails.salesorder_number,
                    transactions_created: transactions.length,
                    sync_source: 'zoho_refresh'
                });
                
            } else {
                throw new Error('Could not fetch order details from Zoho');
            }
        } else {
            // Just update the reference in existing order
            const existingOrder = await db.collection('orders')
                .where('zohoOrderID', '==', salesorder_id)
                .limit(1)
                .get();
                
            if (!existingOrder.empty) {
                await existingOrder.docs[0].ref.update({
                    zohoSynced: true,
                    zohoSyncedAt: admin.firestore.FieldValue.serverTimestamp()
                });
            }
            
            res.json({ 
                success: true, 
                salesorder_id,
                sync_source: 'reference_update'
            });
        }
        
    } catch (error) {
        console.error('❌ Order sync error:', error);
        res.status(500).json({ 
            success: false,
            error: 'Failed to sync order',
            details: error.message 
        });
    }
});

/**
 * Trigger a manual sync
 */
router.post('/trigger-sync', authenticateWebhook, async (req, res) => {
    try {
        const { 
            sync_type = 'high',
            target_date = 'today' 
        } = req.body;
        
        console.log(`🔄 Manual sync triggered: ${sync_type} for ${target_date}`);
        
        let result;
        switch (sync_type) {
            case 'high':
                result = await cronDataSyncService.highFrequencySync();
                break;
            case 'medium':
                result = await cronDataSyncService.mediumFrequencySync();
                break;
            case 'low':
                result = await cronDataSyncService.lowFrequencySync();
                break;
            case 'customers':
                result = await zohoReportsService.syncCustomers(target_date);
                break;
            case 'orders':
                const orders = await zohoReportsService.getSalesOrders(target_date);
                const enrichedOrders = await cronDataSyncService.enrichOrdersWithUIDs(orders);
                await cronDataSyncService._batchWrite(
                    admin.firestore(), 
                    'salesorders', 
                    enrichedOrders, 
                    'salesorder_id'
                );
                result = { success: true, orders_synced: enrichedOrders.length };
                break;
            default:
                return res.status(400).json({ 
                    success: false,
                    error: 'Invalid sync type. Valid types: high, medium, low, customers, orders' 
                });
        }
        
        res.json({
            success: true,
            sync_type,
            result
        });
        
    } catch (error) {
        console.error('❌ Manual sync error:', error);
        res.status(500).json({ 
            success: false,
            error: error.message 
        });
    }
});

export default router;