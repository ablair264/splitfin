// server/src/api/zoho.js
import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

// Centralized configuration
export const ZOHO_CONFIG = {
  clientId: process.env.ZOHO_CLIENT_ID,
  clientSecret: process.env.ZOHO_CLIENT_SECRET,
  refreshToken: process.env.ZOHO_REFRESH_TOKEN,
  orgId: process.env.ZOHO_ORG_ID,
  
  // Base URLs - centralized for easy maintenance
  baseUrls: {
    auth: 'https://accounts.zoho.eu/oauth/v2',
    crm: 'https://www.zohoapis.eu/crm/v5',
    inventory: 'https://www.zohoapis.eu/inventory/v1'
  },
  
  // Standard pagination settings
  pagination: {
    defaultPerPage: 200,
    maxPerPage: 200
  }
};

// Token management
let cachedToken = null;
let cachedExpiry = 0;
let refreshPromise = null;

/**
 * Retrieves a valid Zoho access token, refreshing if necessary.
 */
export async function getAccessToken() {
  const now = Date.now();
  if (cachedToken && now < cachedExpiry) {
    return cachedToken;
  }
  if (refreshPromise) {
    return await refreshPromise;
  }

  refreshPromise = (async () => {
    try {
      const response = await axios.post(
        `${ZOHO_CONFIG.baseUrls.auth}/token`,
        null,
        {
          params: {
            grant_type: 'refresh_token',
            client_id: ZOHO_CONFIG.clientId,
            client_secret: ZOHO_CONFIG.clientSecret,
            refresh_token: ZOHO_CONFIG.refreshToken
          }
        }
      );
      
      const data = response.data;
      if (data.error) {
        throw new Error(data.error_description || data.error);
      }

      cachedToken = data.access_token;
      cachedExpiry = now + (data.expires_in * 1000) - 60000; // 1 minute buffer
      refreshPromise = null;
      return cachedToken;
    } catch (error) {
      refreshPromise = null;
      throw error;
    }
  })();

  return await refreshPromise;
}

/**
 * Generic function for paginated Zoho requests
 */
export async function fetchPaginatedData(url, params = {}, dataKey = 'data') {
  const allData = [];
  let page = 1;
  let pageToken = null;
  const perPage = ZOHO_CONFIG.pagination.defaultPerPage;
  const maxLoops = 100; // Safety break to prevent infinite loops
  let currentLoop = 0;

  console.log(`🔄 Fetching paginated data from ${url}`);

  while (currentLoop < maxLoops) {
    currentLoop++;
    try {
      // Build the parameters for the current request
      const requestParams = { ...params };
      if (pageToken) {
        requestParams.page_token = pageToken;
        delete requestParams.page;
      } else {
        requestParams.page = page;
        requestParams.per_page = perPage;
      }
      
      const token = await getAccessToken();
      const response = await axios.get(url, {
        params: requestParams,
        headers: { Authorization: `Zoho-oauthtoken ${token}` },
        timeout: 30000
      });

      const responseData = response.data;
      const items = Array.isArray(responseData[dataKey]) ? responseData[dataKey] : (responseData.data || []);
      
      if (items.length === 0) {
        console.log(`✅ No more data found on page ${page}, stopping pagination.`);
        break;
      }
      
      allData.push(...items);
      
      const nextPageToken = responseData.info?.next_page_token;

      if (nextPageToken) {
        pageToken = nextPageToken;
        console.log(`   - Got page_token for next page.`);
      } else {
        const hasMoreRecords = responseData.info?.more_records;
        if (hasMoreRecords && page < 10) {
            page++;
        } else {
            console.log(`✅ No more pages or token indicated by API, stopping pagination.`);
            break;
        }
      }
      
      await new Promise(resolve => setTimeout(resolve, 100));

    } catch (error) {
      console.warn(`⚠️ Error on page ${page}:`, error.message);
      break;
    }
  }

  console.log(`✅ Completed pagination: ${allData.length} total items fetched`);
  return allData;
}

// ========================================
// ENHANCED INVENTORY CONTACT CREATION
// ========================================

export async function createInventoryContact(contactData) {
  try {
    // Get access token
    const token = await getAccessToken();
    
    // Validate required fields
    if (!contactData.contact_name) {
      throw new Error('Contact name is required');
    }
    
    // Build the payload with defaults and overrides
    const payload = {
      // Spread contactData first
      ...contactData,
      
      // Then apply defaults and ensure critical fields
      contact_type: 'customer', // Always override to ensure it's a customer
      customer_sub_type: contactData.customer_sub_type || (contactData.company_name ? 'business' : 'individual'),
      currency_code: contactData.currency_code || 'GBP',
      payment_terms: contactData.payment_terms || 30,
      credit_limit: contactData.credit_limit || 5000,
      
      // Ensure billing and shipping addresses
      billing_address: contactData.billing_address || {},
      shipping_address: contactData.shipping_address || contactData.billing_address || {},
      
      // Ensure these fields have defaults if empty
      company_name: contactData.company_name || '',
      email: contactData.email || '',
      phone: contactData.phone || '',
      mobile: contactData.mobile || '',
      website: contactData.website || '',
      notes: contactData.notes || '',
    };
    
    // Clean up empty fields that might cause issues
    const cleanedPayload = Object.entries(payload).reduce((acc, [key, value]) => {
      // Keep the field if it has a meaningful value
      if (value !== '' && value !== null && value !== undefined) {
        acc[key] = value;
      }
      return acc;
    }, {});
    
    // Log the request
    console.log('📤 Creating contact in Zoho Inventory:', {
      name: cleanedPayload.contact_name,
      email: cleanedPayload.email || 'No email',
      type: cleanedPayload.contact_type,
      subType: cleanedPayload.customer_sub_type
    });
    
    // Make the API request
    const response = await axios.post(
      `${ZOHO_CONFIG.baseUrls.inventory}/contacts`,
      cleanedPayload,
      {
        headers: {
          'Authorization': `Zoho-oauthtoken ${token}`,
          'Content-Type': 'application/json',
          'X-com-zoho-inventory-organizationid': ZOHO_CONFIG.orgId
        },
        timeout: 30000 // 30 second timeout
      }
    );
    
    // Check for Zoho-specific error code
    if (response.data.code !== 0) {
      throw new Error(response.data.message || 'Failed to create contact in Zoho Inventory');
    }
    
    // Extract the created contact
    const createdContact = response.data.contact;
    
    // Enhanced success logging
    console.log('✅ Contact successfully created in Zoho Inventory:', {
      contact_id: createdContact.contact_id,
      contact_name: createdContact.contact_name,
      contact_type: createdContact.contact_type,
      customer_sub_type: createdContact.customer_sub_type,
      is_customer: createdContact.contact_type === 'customer',
      status: createdContact.status,
      zoho_message: response.data.message
    });
    
    // Additional confirmation for customer creation
    if (createdContact.contact_type === 'customer') {
      console.log(`✅ CUSTOMER "${createdContact.contact_name}" created with ID: ${createdContact.contact_id}`);
    } else {
      console.warn(`⚠️ Contact created but NOT as customer. Type: ${createdContact.contact_type}`);
    }
    
    // Return the full response
    return response.data;
    
  } catch (error) {
    // Enhanced error logging
    console.error('❌ Failed to create Inventory contact:', {
      message: error.message,
      zohoError: error.response?.data?.message,
      statusCode: error.response?.status,
      contactName: contactData.contact_name,
      email: contactData.email
    });
    
    // Log full error details in development
    if (error.response?.data) {
      console.error('Zoho error details:', JSON.stringify(error.response.data, null, 2));
    }
    
    // Re-throw with more context
    if (error.response?.data?.message) {
      throw new Error(`Zoho Error: ${error.response.data.message}`);
    }
    
    throw error;
  }
}

// ========================================
// COMPREHENSIVE DATA FETCHING
// ========================================

export async function fetchComprehensiveData(brandId, brandName) {
  try {
    const db = admin.firestore();
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
    
    console.log(`🔄 Fetching comprehensive data for brand: ${brandName} (${brandId})`);
    
    // Parallel data fetching
    const [
      salesTransactions,
      salesOrders,
      customerData,
      invoices,
      purchaseOrders,
      zohoInventory
    ] = await Promise.all([
      // 1. Sales Transactions
      fetchSalesTransactions(db, brandId, sixMonthsAgo),
      
      // 2. Sales Orders
      fetchSalesOrders(db, brandName, sixMonthsAgo),
      
      // 3. Customer Data
      fetchCustomerData(db, sixMonthsAgo),
      
      // 4. Invoices
      fetchInvoices(db, sixMonthsAgo),
      
      // 5. Purchase Orders
      fetchPurchaseOrders(db, brandId),
      
      // 6. Zoho Inventory Data
      fetchZohoInventoryData(brandName)
    ]);
    
    // Process and combine all data
    const processedData = {
      salesTransactions: processSalesData(salesTransactions),
      salesOrders: processOrdersData(salesOrders, brandName),
      customerInsights: processCustomerData(customerData),
      invoiceMetrics: processInvoiceData(invoices),
      purchaseHistory: processPurchaseOrders(purchaseOrders),
      zohoMetrics: processZohoData(zohoInventory)
    };
    
    console.log('✅ Comprehensive data fetched successfully');
    return processedData;
    
  } catch (error) {
    console.error('❌ Failed to fetch comprehensive data:', error);
    throw error;
  }
}

// Helper functions for data fetching
async function fetchSalesTransactions(db, brandId, sinceDate) {
  const snapshot = await db.collection('sales_transactions')
    .where('brand_normalized', '==', brandId)
    .where('order_date', '>=', sinceDate.toISOString().split('T')[0])
    .orderBy('order_date', 'desc')
    .limit(1000)
    .get();
  
  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}

async function fetchSalesOrders(db, brandName, sinceDate) {
  const snapshot = await db.collection('sales_orders')
    .where('date', '>=', sinceDate.toISOString().split('T')[0])
    .orderBy('date', 'desc')
    .limit(500)
    .get();
  
  // Filter for orders containing the brand
  return snapshot.docs
    .map(doc => ({ id: doc.id, ...doc.data() }))
    .filter(order => 
      order.line_items?.some(item => 
        item.brand === brandName || 
        item.brand_normalized === brandName.toLowerCase()
      )
    );
}

async function fetchCustomerData(db, sinceDate) {
  const snapshot = await db.collection('customers')
    .where('last_order_date', '>=', sinceDate.toISOString().split('T')[0])
    .limit(500)
    .get();
  
  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}

async function fetchInvoices(db, sinceDate) {
  const snapshot = await db.collection('invoices')
    .where('date', '>=', sinceDate.toISOString().split('T')[0])
    .limit(500)
    .get();
  
  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}

async function fetchPurchaseOrders(db, brandId) {
  const vendorId = {
    'elvang': '310656000000061064',
    'remember': '310656000000194675',
    'relaxound': '310656000001750908',
    'rader': '310656000001553100',
    'myflame': '310656000002243458'
  }[brandId];
  
  if (!vendorId) return [];
  
  const snapshot = await db.collection('purchase_orders')
    .where('vendor_id', '==', vendorId)
    .orderBy('date', 'desc')
    .limit(50)
    .get();
  
  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}

async function fetchZohoInventoryData(brandName) {
  try {
    const token = await getAccessToken();
    
    // Fetch items for the brand
    const response = await axios.get(
      `${ZOHO_CONFIG.baseUrls.inventory}/items`,
      {
        params: {
          search_text: brandName,
          per_page: 200
        },
        headers: {
          'Authorization': `Zoho-oauthtoken ${token}`,
          'X-com-zoho-inventory-organizationid': ZOHO_CONFIG.orgId
        }
      }
    );
    
    return response.data.items || [];
  } catch (error) {
    console.error('Failed to fetch Zoho inventory data:', error);
    return [];
  }
}

// Data processing functions
function processSalesData(salesData) {
  const productSales = new Map();
  const monthlyRevenue = {};
  const customerPurchasePatterns = new Map();
  
  let totalRevenue = 0;
  let totalUnits = 0;
  
  salesData.forEach(sale => {
    const saleDate = new Date(sale.order_date);
    const month = saleDate.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
    
    const quantity = parseInt(sale.quantity?.toString() || '0');
    const total = parseFloat(sale.total?.toString() || '0');
    
    // Monthly aggregation
    monthlyRevenue[month] = (monthlyRevenue[month] || 0) + total;
    totalRevenue += total;
    totalUnits += quantity;
    
    // Product-level tracking
    if (sale.sku) {
      if (!productSales.has(sale.sku)) {
        productSales.set(sale.sku, { 
          sku: sale.sku,
          name: sale.item_name || sale.sku,
          units: 0, 
          revenue: 0, 
          customers: new Set(),
          orders: 0
        });
      }
      const current = productSales.get(sale.sku);
      current.units += quantity;
      current.revenue += total;
      current.orders += 1;
      if (sale.customer_id) {
        current.customers.add(sale.customer_id);
      }
    }
    
    // Customer patterns
    if (sale.customer_id) {
      if (!customerPurchasePatterns.has(sale.customer_id)) {
        customerPurchasePatterns.set(sale.customer_id, { 
          frequency: 0, 
          totalSpent: 0,
          items: new Set()
        });
      }
      const customer = customerPurchasePatterns.get(sale.customer_id);
      customer.frequency += 1;
      customer.totalSpent += total;
      if (sale.sku) customer.items.add(sale.sku);
    }
  });
  
  // Calculate velocity and trends
  const productMetrics = Array.from(productSales.values()).map(data => ({
    ...data,
    uniqueCustomers: data.customers.size,
    velocity: data.units / 6, // units per month average
    customerDiversity: data.customers.size / Math.max(data.units, 1),
    avgOrderSize: data.units / Math.max(data.orders, 1)
  }));
  
  return {
    totalRevenue,
    totalUnits,
    monthlyRevenue,
    productMetrics: productMetrics.sort((a, b) => b.revenue - a.revenue),
    topProducts: productMetrics.slice(0, 10),
    customerPatterns: Array.from(customerPurchasePatterns.entries()).map(([id, data]) => ({
      customerId: id,
      ...data,
      avgOrderValue: data.totalSpent / data.frequency,
      uniqueItems: data.items.size
    })),
    seasonalPattern: monthlyRevenue
  };
}

function processOrdersData(ordersData, brandName) {
  const orderPatterns = {
    totalOrders: 0,
    totalValue: 0,
    avgOrderValue: 0,
    orderFrequency: new Map(),
    bundleAnalysis: new Map(),
    channelBreakdown: { direct: 0, marketplace: 0 },
    timeDistribution: {},
    topBundles: []
  };
  
  ordersData.forEach(order => {
    const brandItems = (order.line_items || []).filter(item => 
      item.brand === brandName || item.brand_normalized === brandName.toLowerCase()
    );
    
    if (brandItems.length > 0) {
      orderPatterns.totalOrders += 1;
      const orderValue = brandItems.reduce((sum, item) => 
        sum + (item.quantity * item.rate), 0
      );
      orderPatterns.totalValue += orderValue;
      
      // Track order frequency by customer
      if (order.customer_id) {
        orderPatterns.orderFrequency.set(
          order.customer_id, 
          (orderPatterns.orderFrequency.get(order.customer_id) || 0) + 1
        );
      }
      
      // Bundle analysis
      if (brandItems.length > 1) {
        const skus = brandItems.map(item => item.sku).sort();
        const bundleKey = skus.join('|');
        orderPatterns.bundleAnalysis.set(
          bundleKey, 
          (orderPatterns.bundleAnalysis.get(bundleKey) || 0) + 1
        );
      }
      
      // Channel breakdown
      if (order.is_marketplace_order) {
        orderPatterns.channelBreakdown.marketplace += 1;
      } else {
        orderPatterns.channelBreakdown.direct += 1;
      }
      
      // Time distribution
      const orderHour = new Date(order.date).getHours();
      const timeSlot = `${Math.floor(orderHour / 4) * 4}-${Math.floor(orderHour / 4) * 4 + 4}`;
      orderPatterns.timeDistribution[timeSlot] = 
        (orderPatterns.timeDistribution[timeSlot] || 0) + 1;
    }
  });
  
  orderPatterns.avgOrderValue = orderPatterns.totalValue / Math.max(orderPatterns.totalOrders, 1);
  
  // Get top bundles
  orderPatterns.topBundles = Array.from(orderPatterns.bundleAnalysis.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([bundle, count]) => ({
      items: bundle.split('|'),
      count,
      percentage: (count / orderPatterns.totalOrders) * 100
    }));
  
  return orderPatterns;
}

function processCustomerData(customerData) {
  const customerMetrics = {
    totalActiveCustomers: 0,
    newCustomers: 0,
    repeatCustomers: 0,
    customerLifetimeValues: [],
    avgOrdersPerCustomer: 0,
    customerSegments: {
      vip: [],
      regular: [],
      occasional: []
    },
    retentionRate: 0,
    churnRisk: []
  };
  
  const threeMonthsAgo = new Date();
  threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
  
  const oneMonthAgo = new Date();
  oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);
  
  customerData.forEach(customer => {
    customerMetrics.totalActiveCustomers += 1;
    
    // New vs repeat
    if (new Date(customer.created_at) > threeMonthsAgo) {
      customerMetrics.newCustomers += 1;
    }
    if ((customer.order_count || 0) > 1) {
      customerMetrics.repeatCustomers += 1;
    }
    
    // Lifetime value
    const ltv = customer.total_spent || 0;
    customerMetrics.customerLifetimeValues.push(ltv);
    
    // Segmentation
    if (ltv > 5000) {
      customerMetrics.customerSegments.vip.push({
        id: customer.id,
        name: customer.customer_name,
        email: customer.email,
        value: ltv,
        orders: customer.order_count || 0,
        lastOrder: customer.last_order_date
      });
    } else if (ltv > 1000) {
      customerMetrics.customerSegments.regular.push({
        id: customer.id,
        name: customer.customer_name,
        email: customer.email,
        value: ltv,
        orders: customer.order_count || 0,
        lastOrder: customer.last_order_date
      });
    } else {
      customerMetrics.customerSegments.occasional.push({
        id: customer.id,
        name: customer.customer_name,
        email: customer.email,
        value: ltv,
        orders: customer.order_count || 0,
        lastOrder: customer.last_order_date
      });
    }
    
    // Churn risk
    const lastOrderDate = customer.last_order_date ? new Date(customer.last_order_date) : null;
    if (lastOrderDate && lastOrderDate < oneMonthAgo && customer.order_count > 2) {
      customerMetrics.churnRisk.push({
        id: customer.id,
        name: customer.customer_name,
        daysSinceLastOrder: Math.floor((Date.now() - lastOrderDate.getTime()) / (1000 * 60 * 60 * 24)),
        totalSpent: ltv,
        orderCount: customer.order_count
      });
    }
  });
  
  const totalOrders = customerData.reduce((sum, customer) => 
    sum + (customer.order_count || 0), 0
  );
  customerMetrics.avgOrdersPerCustomer = totalOrders / Math.max(customerMetrics.totalActiveCustomers, 1);
  customerMetrics.retentionRate = (customerMetrics.repeatCustomers / customerMetrics.totalActiveCustomers) * 100;
  
  return customerMetrics;
}

function processInvoiceData(invoiceData) {
  const invoiceMetrics = {
    totalOutstanding: 0,
    totalPaid: 0,
    totalOverdue: 0,
    avgPaymentDays: 0,
    overdueAmount: 0,
    cashFlowProjection: {},
    paymentTrends: {},
    riskAssessment: {
      high: [],
      medium: [],
      low: []
    }
  };
  
  let totalPaymentDays = 0;
  let paidCount = 0;
  
  invoiceData.forEach(invoice => {
    const amount = invoice.amount || invoice.total || 0;
    
    if (invoice.status === 'paid') {
      invoiceMetrics.totalPaid += amount;
      
      // Calculate payment days
      if (invoice.paid_date && invoice.date) {
        const daysToPay = Math.floor(
          (new Date(invoice.paid_date).getTime() - new Date(invoice.date).getTime()) 
          / (1000 * 60 * 60 * 24)
        );
        totalPaymentDays += daysToPay;
        paidCount += 1;
        
        // Payment trends by month
        const paidMonth = new Date(invoice.paid_date).toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
        if (!invoiceMetrics.paymentTrends[paidMonth]) {
          invoiceMetrics.paymentTrends[paidMonth] = {
            total: 0,
            count: 0,
            avgDays: 0
          };
        }
        invoiceMetrics.paymentTrends[paidMonth].total += amount;
        invoiceMetrics.paymentTrends[paidMonth].count += 1;
      }
    } else if (invoice.status === 'outstanding' || invoice.status === 'overdue') {
      invoiceMetrics.totalOutstanding += invoice.balance || amount;
      
      if (invoice.days_overdue > 0) {
        invoiceMetrics.totalOverdue += invoice.balance || amount;
        invoiceMetrics.overdueAmount += invoice.balance || amount;
        
        // Risk assessment
        if (invoice.days_overdue > 60) {
          invoiceMetrics.riskAssessment.high.push({
            invoiceNumber: invoice.invoice_number,
            customerName: invoice.customer_name,
            amount: invoice.balance || amount,
            daysOverdue: invoice.days_overdue
          });
        } else if (invoice.days_overdue > 30) {
          invoiceMetrics.riskAssessment.medium.push({
            invoiceNumber: invoice.invoice_number,
            customerName: invoice.customer_name,
            amount: invoice.balance || amount,
            daysOverdue: invoice.days_overdue
          });
        } else {
          invoiceMetrics.riskAssessment.low.push({
            invoiceNumber: invoice.invoice_number,
            customerName: invoice.customer_name,
            amount: invoice.balance || amount,
            daysOverdue: invoice.days_overdue
          });
        }
      }
    }
  });
  
  invoiceMetrics.avgPaymentDays = paidCount > 0 ? totalPaymentDays / paidCount : 30;
  
  // Cash flow projection
  const next30Days = invoiceMetrics.totalOutstanding * 0.6;
  const next60Days = invoiceMetrics.totalOutstanding * 0.3;
  const beyond60Days = invoiceMetrics.totalOutstanding * 0.1;
  
  invoiceMetrics.cashFlowProjection = {
    next30Days,
    next60Days,
    beyond60Days,
    totalExpected: invoiceMetrics.totalOutstanding
  };
  
  return invoiceMetrics;
}

function processPurchaseOrders(purchaseOrderData) {
  const purchaseMetrics = {
    recentOrders: [],
    avgLeadTime: 0,
    stockTurnover: 0,
    reorderPatterns: {},
    pendingOrders: [],
    completedOrders: [],
    totalPending: 0,
    totalCompleted: 0
  };
  
  let totalLeadTime = 0;
  let completedCount = 0;
  
  purchaseOrderData.forEach(po => {
    const orderInfo = {
      id: po.id,
      date: po.date,
      expectedDate: po.expected_delivery_date,
      status: po.status,
      items: po.line_items?.length || 0,
      total: po.total || 0,
      vendor: po.vendor_name
    };
    
    purchaseMetrics.recentOrders.push(orderInfo);
    
    if (po.status === 'open' || po.status === 'pending') {
      purchaseMetrics.pendingOrders.push(orderInfo);
      purchaseMetrics.totalPending += po.total || 0;
    } else if (po.status === 'billed' || po.status === 'closed') {
      purchaseMetrics.completedOrders.push(orderInfo);
      purchaseMetrics.totalCompleted += po.total || 0;
      
      // Calculate lead time
      if (po.date && po.delivery_date) {
        const leadTime = Math.floor(
          (new Date(po.delivery_date).getTime() - new Date(po.date).getTime()) 
          / (1000 * 60 * 60 * 24)
        );
        totalLeadTime += leadTime;
        completedCount += 1;
      }
    }
    
    // Track reorder patterns
    (po.line_items || []).forEach(item => {
      const sku = item.sku || item.item_code;
      if (sku) {
        if (!purchaseMetrics.reorderPatterns[sku]) {
          purchaseMetrics.reorderPatterns[sku] = {
            count: 0,
            quantities: [],
            avgQuantity: 0
          };
        }
        purchaseMetrics.reorderPatterns[sku].count += 1;
        purchaseMetrics.reorderPatterns[sku].quantities.push(item.quantity);
      }
    });
  });
  
  purchaseMetrics.avgLeadTime = completedCount > 0 ? totalLeadTime / completedCount : 14;
  
  // Calculate average quantities for reorder patterns
  Object.keys(purchaseMetrics.reorderPatterns).forEach(sku => {
    const pattern = purchaseMetrics.reorderPatterns[sku];
    pattern.avgQuantity = pattern.quantities.reduce((a, b) => a + b, 0) / pattern.quantities.length;
  });
  
  return purchaseMetrics;
}

function processZohoData(zohoItems) {
  const inventoryMetrics = {
    totalItems: zohoItems.length,
    totalStock: 0,
    totalValue: 0,
    lowStockItems: [],
    outOfStockItems: [],
    overstockItems: [],
    turnoverRate: 0
  };
  
  zohoItems.forEach(item => {
    const stock = item.stock_on_hand || 0;
    const value = stock * (item.rate || 0);
    
    inventoryMetrics.totalStock += stock;
    inventoryMetrics.totalValue += value;
    
    // Stock level analysis
    if (stock === 0) {
      inventoryMetrics.outOfStockItems.push({
        sku: item.sku,
        name: item.name,
        lastStockDate: item.last_stock_update_time
      });
    } else if (stock < (item.reorder_level || 10)) {
      inventoryMetrics.lowStockItems.push({
        sku: item.sku,
        name: item.name,
        currentStock: stock,
        reorderLevel: item.reorder_level || 10
      });
    } else if (stock > (item.reorder_level || 10) * 5) {
      inventoryMetrics.overstockItems.push({
        sku: item.sku,
        name: item.name,
        currentStock: stock,
        excessStock: stock - (item.reorder_level || 10) * 3
      });
    }
  });
  
  return inventoryMetrics;
}

// ========================================
// CRM FUNCTIONS
// ========================================

export async function fetchCustomersFromCRM() {
  const fields = [
    'Account_Name',
    'Phone', 
    'Primary_Email',
    'Agent',
    'Billing_City',
    'Billing_Code',
    'Billing_Country',
    'Billing_State',
    'Billing_Street',
    'Primary_First_Name',
    'Primary_Last_Name',
    'id'
  ];

  return await fetchPaginatedData(
    `${ZOHO_CONFIG.baseUrls.crm}/Accounts`,
    { fields: fields.join(',') }
  );
}

export async function fetchProductsFromInventory(options = {}) {
  console.log('🔄 Starting product sync from Inventory...');
  
  try {
    const params = {
      sort_column: 'last_modified_time',
      sort_order: 'D',
    };
    
    if (options.modifiedAfter) {
      const isoDate = new Date(options.modifiedAfter).toISOString();
      params.last_modified_since = isoDate;
    }
    
    const items = await fetchPaginatedData(
      `${ZOHO_CONFIG.baseUrls.inventory}/items`, 
      params,
      'items'
    );
    
    const products = items.map(item => ({
      id: item.item_id,
      Product_Name: item.name,
      Product_Code: item.sku,
      Unit_Price: item.rate,
      List_Price: item.rate,
      Product_Category: item.category_name || '',
      Product_Active: item.status === 'active',
      Qty_in_Stock: item.stock_on_hand || 0,
      Qty_Available: item.available_stock || 0,
      Description: item.description || '',
      Manufacturer: item.brand || '',
      Product_Image: item.image_url || '',
      Reorder_Level: item.reorder_level || 0,
      Modified_Time: item.last_modified_time,
      inventory_account_name: item.inventory_account_name,
      purchase_rate: item.purchase_rate,
      initial_stock: item.initial_stock,
      warehouse_data: item.warehouses || []
    }));
    
    console.log(`✅ Fetched ${products.length} products from Inventory`);
    return products;
    
  } catch (error) {
    console.error('❌ Failed to fetch products from Inventory:', error);
    throw error;
  }
}

export async function findAccountByEmail(email) {
  const token = await getAccessToken();
  const url = `${ZOHO_CONFIG.baseUrls.crm}/Accounts/search`;
  
  try {
    const response = await axios.get(url, {
      params: {
        email: email,
        fields: 'Account_Name,Primary_Email,id'
      },
      headers: { Authorization: `Zoho-oauthtoken ${token}` }
    });
    
    const accounts = response.data?.data || [];
    return accounts.length > 0 ? accounts[0] : null;
  } catch (error) {
    console.error(`Failed to find account by email ${email}:`, error.response?.data || error.message);
    return null;
  }
}

export async function createSalesOrder(order) {
  const token = await getAccessToken();

  const payload = {
    customer_id: order.zohoCustID,
    reference_number: `WebOrder-${Date.now()}`,
    date: new Date().toISOString().split('T')[0],
    line_items: order.items.map(item => ({
      item_id: item.item_id,
      name: item.name,
      quantity: item.quantity,
      rate: item.item_total / item.quantity,
    })),
    cf_agent: order.agentZohoCRMId
  };

  try {
    const response = await axios.post(
      `${ZOHO_CONFIG.baseUrls.inventory}/salesorders`,
      payload,
      {
        headers: {
          Authorization: `Zoho-oauthtoken ${token}`,
          'Content-Type': 'application/json',
          'X-com-zoho-inventory-organizationid': ZOHO_CONFIG.orgId,
        }
      }
    );

    if (response.data.code !== 0) {
      throw new Error(response.data.message || 'Zoho Sales Order creation failed');
    }

    console.log('✅ Sales Order created:', response.data.salesorder.salesorder_number);
    return response.data;
  } catch (error) {
    console.error('❌ Sales Order creation failed:', error.response?.data || error.message);
    throw error;
  }
}

export async function getInventoryContactIdByEmail(email) {
  if (!email) {
    return null;
  }

  try {
    const token = await getAccessToken();
    const url = `${ZOHO_CONFIG.baseUrls.inventory}/contacts`;
    
    const response = await axios.get(url, {
      params: {
        organization_id: ZOHO_CONFIG.orgId,
        email: email
      },
      headers: { Authorization: `Zoho-oauthtoken ${token}` }
    });

    const contacts = response.data?.contacts;

    if (contacts && contacts.length > 0) {
      return contacts[0].contact_id;
    }

    return null;

  } catch (error) {
    console.error(`❌ Failed to find Zoho Inventory contact by email ${email}:`, error.message);
    return null;
  }
}

// ========================================
// UTILITY FUNCTIONS
// ========================================

export async function checkZohoConnection() {
  try {
    const token = await getAccessToken();
    const response = await axios.get(`${ZOHO_CONFIG.baseUrls.crm}/org`, {
      headers: { Authorization: `Zoho-oauthtoken ${token}` }
    });
    return { connected: true, org: response.data };
  } catch (error) {
    return { connected: false, error: error.message };
  }
}

export function getTokenInfo() {
  return {
    hasToken: !!cachedToken,
    expiresAt: new Date(cachedExpiry),
    timeUntilExpiry: cachedExpiry - Date.now()
  };
}