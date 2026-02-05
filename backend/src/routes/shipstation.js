// server/src/routes/shipstation.js
import express from 'express';
import admin from 'firebase-admin';
import fetch from 'node-fetch';

const router = express.Router();
const db = admin.firestore();

// ShipStation API configuration
const SHIPSTATION_API_URL = 'https://ssapi.shipstation.com';
const SHIPSTATION_API_KEY = process.env.SHIPSTATION_API_KEY;
const SHIPSTATION_API_SECRET = process.env.SHIPSTATION_API_SECRET;

// Helper function to make authenticated requests to ShipStation
const shipstationRequest = async (endpoint, options = {}) => {
  const auth = Buffer.from(`${SHIPSTATION_API_KEY}:${SHIPSTATION_API_SECRET}`).toString('base64');
  
  const response = await fetch(`${SHIPSTATION_API_URL}${endpoint}`, {
    ...options,
    headers: {
      'Authorization': `Basic ${auth}`,
      'Content-Type': 'application/json',
      ...options.headers
    }
  });
  
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`ShipStation API error: ${response.status} - ${error}`);
  }
  
  return response.json();
};

// GET /api/shipstation/carriers - Get all carriers
router.get('/carriers', async (req, res) => {
  try {
    const carriers = await shipstationRequest('/carriers');
    
    res.json({
      success: true,
      data: { carriers: carriers || [] }
    });
  } catch (error) {
    console.error('Error fetching carriers:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// POST /api/shipstation/rates - Get shipping rates
router.post('/rates', async (req, res) => {
  try {
    const { from_address, to_address, package: packageInfo } = req.body;
    
    // Transform the request to ShipStation format
    const rateRequest = {
      carrierCode: null, // Get rates from all carriers
      serviceCode: null,
      packageCode: 'package',
      fromPostalCode: from_address.postal_code,
      toState: to_address.state,
      toCountry: to_address.country || 'GB',
      toPostalCode: to_address.postal_code,
      toCity: to_address.city,
      weight: {
        value: packageInfo.weight,
        units: packageInfo.weight_unit === 'kg' ? 'kilograms' : 'pounds'
      },
      dimensions: {
        units: packageInfo.dimension_unit === 'cm' ? 'centimeters' : 'inches',
        length: packageInfo.length,
        width: packageInfo.width,
        height: packageInfo.height
      }
    };
    
    const rates = await shipstationRequest('/shipments/getrates', {
      method: 'POST',
      body: JSON.stringify(rateRequest)
    });
    
    res.json({
      success: true,
      data: { rates: rates || [] }
    });
  } catch (error) {
    console.error('Error getting rates:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// POST /api/shipstation/pickup/schedule - Schedule a pickup
router.post('/pickup/schedule', async (req, res) => {
  try {
    const pickupRequest = req.body;
    
    // Transform to ShipStation pickup format
    const shipstationPickup = {
      carrierCode: pickupRequest.carrier_id,
      pickupDate: pickupRequest.pickup_date,
      pickupWindow: {
        startTime: pickupRequest.ready_time,
        endTime: pickupRequest.close_time
      },
      contactInfo: {
        name: pickupRequest.contact_name,
        phone: pickupRequest.contact_phone
      },
      location: pickupRequest.location,
      instructions: pickupRequest.special_instructions
    };
    
    const pickup = await shipstationRequest('/carriers/pickups', {
      method: 'POST',
      body: JSON.stringify(shipstationPickup)
    });
    
    res.json({
      success: true,
      data: pickup
    });
  } catch (error) {
    console.error('Error scheduling pickup:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// POST /api/shipstation/customs/generate - Generate customs documents
router.post('/customs/generate', async (req, res) => {
  try {
    const customsData = req.body;
    
    // Transform to ShipStation customs format
    const customsRequest = {
      contents: customsData.contents_type,
      customsItems: customsData.items.map(item => ({
        description: item.description,
        quantity: item.quantity,
        value: item.value,
        harmonizedTariffCode: item.hs_tariff_number,
        countryOfOrigin: item.origin_country
      })),
      nonDelivery: 'return_to_sender'
    };
    
    // Note: ShipStation doesn't have a direct customs generation endpoint
    // This would typically be part of the shipment creation process
    // For now, we'll create a mock response
    const mockDocument = {
      document_url: `/customs/generated-${Date.now()}.pdf`,
      document_type: 'commercial_invoice',
      created_at: new Date().toISOString()
    };
    
    res.json({
      success: true,
      data: mockDocument
    });
  } catch (error) {
    console.error('Error generating customs documents:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// GET /api/shipstation/manifests - Get manifests for a date
router.get('/manifests', async (req, res) => {
  try {
    const { date } = req.query;
    
    const manifests = await shipstationRequest(`/manifests?shipDate=${date}`);
    
    res.json({
      success: true,
      data: { manifests: manifests.manifests || [] }
    });
  } catch (error) {
    console.error('Error fetching manifests:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// GET /api/shipstation/manifests/summary - Get manifest summary
router.get('/manifests/summary', async (req, res) => {
  try {
    const { days = 7 } = req.query;
    
    // Generate date range
    const summaries = [];
    for (let i = parseInt(days) - 1; i >= 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      const dateStr = date.toISOString().split('T')[0];
      
      try {
        const manifests = await shipstationRequest(`/manifests?shipDate=${dateStr}`);
        
        summaries.push({
          date: dateStr,
          total_manifests: manifests.manifests?.length || 0,
          total_shipments: manifests.manifests?.reduce((sum, m) => sum + (m.shipments?.length || 0), 0) || 0,
          total_packages: manifests.manifests?.reduce((sum, m) => sum + (m.packages || 0), 0) || 0,
          carriers: manifests.manifests?.map(m => ({
            carrier_name: m.carrierName,
            shipment_count: m.shipments?.length || 0,
            manifest_status: m.status
          })) || []
        });
      } catch (err) {
        // If no manifests for this date, add empty summary
        summaries.push({
          date: dateStr,
          total_manifests: 0,
          total_shipments: 0,
          total_packages: 0,
          carriers: []
        });
      }
    }
    
    res.json({
      success: true,
      data: { summary: summaries }
    });
  } catch (error) {
    console.error('Error fetching manifest summary:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// POST /api/shipstation/manifests/generate - Generate a new manifest
router.post('/manifests/generate', async (req, res) => {
  try {
    const { carrier_id, warehouse_id, manifest_date, cutoff_time, include_pending, include_processed, manifest_type } = req.body;
    
    let manifestRequest;
    
    if (manifest_type === 'explicit') {
      // Explicit manifest with specific label IDs
      manifestRequest = {
        labelIds: req.body.label_ids || []
      };
    } else {
      // Implicit manifest with criteria
      manifestRequest = {
        carrierCode: carrier_id,
        warehouseId: warehouse_id,
        shipDate: manifest_date
      };
    }
    
    const manifest = await shipstationRequest('/manifests/create', {
      method: 'POST',
      body: JSON.stringify(manifestRequest)
    });
    
    res.json({
      success: true,
      data: manifest
    });
  } catch (error) {
    console.error('Error generating manifest:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// GET /api/shipstation/manifests/:id/download - Download manifest
router.get('/manifests/:id/download', async (req, res) => {
  try {
    const { id } = req.params;
    
    // Get manifest details to check if it exists and has a URL
    const manifest = await shipstationRequest(`/manifests/${id}`);
    
    if (manifest.manifestUrl) {
      // Redirect to the manifest URL
      res.redirect(manifest.manifestUrl);
    } else {
      // Generate manifest PDF if not available
      const manifestPdf = await shipstationRequest(`/manifests/${id}/pdf`);
      
      if (manifestPdf.url) {
        res.redirect(manifestPdf.url);
      } else {
        throw new Error('Manifest PDF not available');
      }
    }
  } catch (error) {
    console.error('Error downloading manifest:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// POST /api/shipstation/manifests/:id/close - Close a manifest
router.post('/manifests/:id/close', async (req, res) => {
  try {
    const { id } = req.params;
    
    const result = await shipstationRequest(`/manifests/${id}/close`, {
      method: 'POST'
    });
    
    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('Error closing manifest:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// POST /api/shipstation/refresh-tracking/:orderId - Refresh tracking data for an order
router.post('/refresh-tracking/:orderId', async (req, res) => {
  try {
    const { orderId } = req.params;
    
    // Get order from Firebase
    const orderDoc = await db.collection('sales_orders').doc(orderId).get();
    if (!orderDoc.exists) {
      return res.status(404).json({
        success: false,
        error: 'Order not found'
      });
    }
    
    const orderData = orderDoc.data();
    
    // Extract tracking numbers from packages
    const trackingNumbers = [];
    if (orderData.packages) {
      Object.values(orderData.packages).forEach(pkg => {
        if (pkg.shipment_order?.tracking_number) {
          trackingNumbers.push(pkg.shipment_order.tracking_number);
        }
      });
    }
    
    if (trackingNumbers.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No tracking numbers found for this order'
      });
    }
    
    // Get tracking information from ShipStation
    const trackingUpdates = [];
    let currentStatus = 'unknown';
    let estimatedDelivery = null;
    let carrierStatus = null;
    
    for (const trackingNumber of trackingNumbers) {
      try {
        const tracking = await shipstationRequest(`/shipments/tracking?trackingNumber=${trackingNumber}`);
        
        if (tracking.trackingEvents && tracking.trackingEvents.length > 0) {
          // Convert ShipStation tracking events to our format
          const events = tracking.trackingEvents.map(event => ({
            timestamp: event.eventDate,
            status: event.eventCode,
            description: event.eventDescription,
            location: event.eventLocation,
            carrier_status_code: event.eventCode
          }));
          
          trackingUpdates.push(...events);
          
          // Get the latest status
          const latestEvent = tracking.trackingEvents[0];
          currentStatus = latestEvent.eventCode || 'in_transit';
          carrierStatus = latestEvent.eventDescription;
        }
        
        if (tracking.estimatedDeliveryDate) {
          estimatedDelivery = tracking.estimatedDeliveryDate;
        }
      } catch (trackingError) {
        console.error(`Error fetching tracking for ${trackingNumber}:`, trackingError);
      }
    }
    
    // Sort tracking updates by timestamp (newest first)
    trackingUpdates.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    
    // Update order with live tracking data
    const shipLiveData = {
      tracking_updates: trackingUpdates,
      current_status: currentStatus,
      estimated_delivery: estimatedDelivery,
      carrier_status: carrierStatus,
      last_updated: new Date().toISOString()
    };
    
    // If the order is delivered, add delivery confirmation
    if (currentStatus.toLowerCase().includes('delivered')) {
      const deliveredEvent = trackingUpdates.find(update => 
        update.status.toLowerCase().includes('delivered')
      );
      
      if (deliveredEvent) {
        shipLiveData.delivery_confirmation = {
          delivered_at: deliveredEvent.timestamp,
          signed_by: deliveredEvent.signed_by || null,
          delivery_notes: deliveredEvent.description
        };
      }
    }
    
    await db.collection('sales_orders').doc(orderId).update({
      ship_live: shipLiveData
    });
    
    res.json({
      success: true,
      data: {
        message: 'Tracking data updated successfully',
        tracking_updates: trackingUpdates.length,
        current_status: currentStatus
      }
    });
    
  } catch (error) {
    console.error('Error refreshing tracking data:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// POST /api/shipstation/create-shipment - Create a shipment from an order
router.post('/create-shipment', async (req, res) => {
  try {
    const { orderId, carrierCode, serviceCode } = req.body;
    
    // Get order from Firebase
    const orderDoc = await db.collection('sales_orders').doc(orderId).get();
    if (!orderDoc.exists) {
      return res.status(404).json({
        success: false,
        error: 'Order not found'
      });
    }
    
    const orderData = orderDoc.data();
    
    // Transform order data to ShipStation shipment format
    const shipment = {
      orderNumber: orderData.salesorder_number,
      orderDate: orderData.date,
      orderStatus: 'awaiting_shipment',
      customerEmail: orderData.contact_person_email,
      customerNotes: orderData.notes,
      internalNotes: `Created from Splitfin order ${orderData.salesorder_number}`,
      gift: false,
      giftMessage: null,
      paymentMethod: null,
      requestedShippingService: serviceCode,
      carrierCode: carrierCode,
      serviceCode: serviceCode,
      packageCode: 'package',
      confirmation: 'none',
      shipDate: new Date().toISOString().split('T')[0],
      weight: {
        value: 1, // Default weight, should be calculated from line items
        units: 'kilograms'
      },
      dimensions: {
        units: 'centimeters',
        length: 10,
        width: 10,
        height: 10
      },
      shipTo: {
        name: orderData.customer_name,
        company: orderData.company_name,
        street1: orderData.shipping_address?.address || orderData.shipping_address?.street,
        street2: null,
        street3: null,
        city: orderData.shipping_address?.city,
        state: orderData.shipping_address?.state,
        postalCode: orderData.shipping_address?.zip,
        country: orderData.shipping_address?.country_code || 'GB',
        phone: orderData.shipping_address?.phone || orderData.mobile,
        residential: true
      },
      shipFrom: {
        name: 'Splitfin',
        company: 'Splitfin Ltd',
        street1: 'Your Warehouse Address',
        city: 'London',
        state: 'England',
        postalCode: 'SW1A 1AA',
        country: 'GB',
        phone: '+44 20 1234 5678'
      }
    };
    
    // Add line items
    if (orderData.line_items && Array.isArray(orderData.line_items)) {
      shipment.items = orderData.line_items.map(item => ({
        lineItemKey: item.id,
        sku: item.sku,
        name: item.item_name || item.name,
        imageUrl: null,
        weight: {
          value: 0.5, // Default weight per item
          units: 'kilograms'
        },
        quantity: item.quantity,
        unitPrice: item.rate,
        taxAmount: null,
        shippingAmount: null,
        warehouseLocation: null,
        options: [],
        productId: item.item_id,
        fulfillmentSku: item.sku,
        adjustment: false,
        upc: null,
        createDate: orderData.created_time
      }));
    }
    
    const createdShipment = await shipstationRequest('/shipments/createshipment', {
      method: 'POST',
      body: JSON.stringify(shipment)
    });
    
    // Update order with ShipStation shipment ID
    await db.collection('sales_orders').doc(orderId).update({
      'ship_live.shipstation_shipment_id': createdShipment.shipmentId,
      'ship_live.last_updated': new Date().toISOString()
    });
    
    res.json({
      success: true,
      data: createdShipment
    });
    
  } catch (error) {
    console.error('Error creating shipment:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// POST /api/shipstation/webhook - Handle ShipStation webhooks
router.post('/webhook', async (req, res) => {
  try {
    const webhookData = req.body;
    
    // Verify webhook authenticity (if ShipStation provides signature verification)
    // const signature = req.headers['x-shipstation-signature'];
    // if (!verifySignature(req.body, signature)) {
    //   return res.status(401).json({ error: 'Invalid signature' });
    // }
    
    console.log('Received ShipStation webhook:', webhookData);
    
    // Handle different webhook events
    switch (webhookData.resource_type) {
      case 'SHIP_NOTIFY':
        await handleShipmentNotification(webhookData);
        break;
      case 'ORDER_NOTIFY':
        await handleOrderNotification(webhookData);
        break;
      case 'ITEM_ORDER_NOTIFY':
        await handleItemOrderNotification(webhookData);
        break;
      default:
        console.log('Unhandled webhook type:', webhookData.resource_type);
    }
    
    res.json({ success: true });
    
  } catch (error) {
    console.error('Error processing webhook:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Helper function to handle shipment notifications
const handleShipmentNotification = async (webhookData) => {
  const { resource_url } = webhookData;
  
  // Extract shipment ID from resource URL
  const shipmentId = resource_url.split('/').pop();
  
  // Get shipment details from ShipStation
  const shipment = await shipstationRequest(`/shipments/${shipmentId}`);
  
  // Find the corresponding order in Firebase using order number
  const ordersQuery = await db.collection('sales_orders')
    .where('salesorder_number', '==', shipment.orderNumber)
    .limit(1)
    .get();
  
  if (!ordersQuery.empty) {
    const orderDoc = ordersQuery.docs[0];
    const orderId = orderDoc.id;
    
    // Update order with shipment information
    const updateData = {
      'ship_live.shipstation_shipment_id': shipment.shipmentId,
      'ship_live.current_status': shipment.shipmentStatus,
      'ship_live.last_updated': new Date().toISOString()
    };
    
    // If shipment has tracking number, update it
    if (shipment.trackingNumber) {
      updateData['packages.package_1.shipment_order.tracking_number'] = shipment.trackingNumber;
      updateData['packages.package_1.shipment_order.carrier'] = shipment.carrierCode;
      updateData['packages.package_1.shipment_order.shipment_date'] = shipment.shipDate;
    }
    
    await db.collection('sales_orders').doc(orderId).update(updateData);
    
    console.log(`Updated order ${orderId} with shipment data`);
  }
};

// Helper function to handle order notifications
const handleOrderNotification = async (webhookData) => {
  // Handle order status updates
  console.log('Order notification received:', webhookData);
};

// Helper function to handle item order notifications
const handleItemOrderNotification = async (webhookData) => {
  // Handle item-specific order updates
  console.log('Item order notification received:', webhookData);
};

export default router;