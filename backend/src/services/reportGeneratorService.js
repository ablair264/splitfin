// server/src/services/reportGeneratorService.js
import admin from 'firebase-admin';

class ReportGeneratorService {
  constructor() {
    this.db = admin.firestore();
  }
  async fetchBaseData(userContext, dateRange, filters) {
    const { start, end } = dateRange;
    
    // 1. Fetch salesorders with correct field names
    let ordersQuery = this.db.collection('salesorders')
      .where('date', '>=', start.toISOString().split('T')[0])
      .where('date', '<=', end.toISOString().split('T')[0]);
      
    // Filter by agent for sales agents using correct field
    if (userContext.role === 'salesAgent') {
      ordersQuery = ordersQuery.where('salesperson_id', '==', userContext.zohospID);
    }
    
    const ordersSnapshot = await ordersQuery.get();
    const orders = ordersSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

    // 2. Fetch sales_transactions to get brand information
    const salesOrderIds = orders.map(order => order.salesorder_id || order.id);
    let transactions = [];
    
    if (salesOrderIds.length > 0) {
      // Firestore 'in' queries are limited to 10 items, so we need to batch them
      const transactionBatches = [];
      for (let i = 0; i < salesOrderIds.length; i += 10) {
        const batch = salesOrderIds.slice(i, i + 10);
        const transactionQuery = this.db.collection('sales_transactions')
          .where('order_id', 'in', batch);
        transactionBatches.push(transactionQuery.get());
      }
      
      const transactionSnapshots = await Promise.all(transactionBatches);
      transactions = transactionSnapshots.flatMap(snapshot => 
        snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }))
      );
    }

    // 3. Fetch invoices
    let invoicesQuery = this.db.collection('invoices')
      .where('date', '>=', start.toISOString().split('T')[0])
      .where('date', '<=', end.toISOString().split('T')[0]);
      
    const invoicesSnapshot = await invoicesQuery.get();
    const invoices = invoicesSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

    // 4. Fetch customers
    const customersSnapshot = await this.db.collection('customer_data').get();
    const customers = customersSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

    // 5. Fetch users for agent information (using zohospID relationship)
    const usersSnapshot = await this.db.collection('users').get();
    const users = usersSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

    return { orders, transactions, invoices, customers, users };
  }

  /**
   * Apply filters with correct relationships
   */
  applyFilters(data, filters) {
    let { orders, transactions, invoices, customers, users } = data;

    // Create lookup maps for efficient filtering
    const transactionsByOrderId = new Map();
    transactions.forEach(transaction => {
      if (!transactionsByOrderId.has(transaction.order_id)) {
        transactionsByOrderId.set(transaction.order_id, []);
      }
      transactionsByOrderId.get(transaction.order_id).push(transaction);
    });

    // Filter by brands using sales_transactions.brand_normalized
    if (filters.brands && filters.brands.length > 0) {
      const ordersWithMatchingBrands = new Set();
      
      transactions.forEach(transaction => {
        if (transaction.brand_normalized && 
            filters.brands.includes(transaction.brand_normalized.toLowerCase())) {
          ordersWithMatchingBrands.add(transaction.order_id);
        }
      });
      
      orders = orders.filter(order => 
        ordersWithMatchingBrands.has(order.salesorder_id || order.id)
      );
    }

    // Filter by agents using correct relationship (salesperson_id -> users.zohospID)
    if (filters.agents && filters.agents.length > 0) {
      orders = orders.filter(order => 
        filters.agents.includes(order.salesperson_id)
      );
    }

    // Filter by invoice status
    if (filters.invoiceStatus && filters.invoiceStatus.length > 0) {
      invoices = invoices.filter(invoice => 
        filters.invoiceStatus.includes(invoice.status)
      );
      
      const invoiceOrderIds = invoices.map(inv => inv.salesorder_id);
      orders = orders.filter(order => invoiceOrderIds.includes(order.salesorder_id || order.id));
    }

    // Filter by customer segments (when the field becomes available)
    if (filters.customerSegments && filters.customerSegments.length > 0) {
      const filteredCustomerIds = customers
        .filter(customer => filters.customerSegments.includes(customer.segment))
        .map(customer => customer.id);
      
      orders = orders.filter(order => 
        filteredCustomerIds.includes(order.customer_id)
      );
    }

    // Filter by regions using users.zohospID relationship
    if (filters.regions && filters.regions.length > 0) {
      const agentsInRegions = users.filter(user => 
        user.region && filters.regions.some(region => 
          user.region.includes(region)
        )
      ).map(user => user.zohospID); // Use zohospID instead of uid
      
      orders = orders.filter(order => 
        agentsInRegions.includes(order.salesperson_id)
      );
    }

    // Exclude marketplace orders if specified
    if (filters.excludeMarketplace) {
      orders = orders.filter(order => !this.isMarketplaceOrder(order));
    }

    return { orders, transactions, invoices, customers, users };
  }

  /**
   * Generate Brand performance report with correct data source
   */
  async generateBrandReport(data, config) {
    const { orders, transactions, users } = data;
    const brandPerformance = new Map();

    // Create lookup for transactions by order_id
    const transactionsByOrderId = new Map();
    transactions.forEach(transaction => {
      if (!transactionsByOrderId.has(transaction.order_id)) {
        transactionsByOrderId.set(transaction.order_id, []);
      }
      transactionsByOrderId.get(transaction.order_id).push(transaction);
    });

    orders.forEach(order => {
      const orderTransactions = transactionsByOrderId.get(order.salesorder_id || order.id) || [];
      
      orderTransactions.forEach(transaction => {
        const brand = transaction.brand_normalized || 'Unknown Brand';
        
        if (!brandPerformance.has(brand)) {
          brandPerformance.set(brand, {
            brandName: brand,
            revenue: 0,
            orders: 0,
            quantity: 0,
            customers: new Set()
          });
        }
        
        const performance = brandPerformance.get(brand);
        performance.revenue += transaction.total_amount || transaction.amount || 0;
        performance.orders += 1;
        performance.quantity += transaction.quantity || 0;
        performance.customers.add(order.customer_id);
      });
    });

    // Convert customers set to count
    brandPerformance.forEach(performance => {
      performance.customers = performance.customers.size;
    });

    return {
      brandPerformance: Array.from(brandPerformance.values())
        .sort((a, b) => b.revenue - a.revenue),
      summary: this.generateSummary(orders, 'brand')
    };
  }

  /**
   * Generate Agent performance report with correct relationships
   */
  async generateAgentReport(data, config) {
    const { orders, users } = data;
    const agentPerformance = new Map();

    orders.forEach(order => {
      // Find agent using salesperson_id -> users.zohospID relationship
      const agent = users.find(u => u.zohospID === order.salesperson_id);
      const agentName = agent?.name || 'Unknown Agent';
      
      if (!agentPerformance.has(order.salesperson_id)) {
        agentPerformance.set(order.salesperson_id, {
          agentName,
          agentId: order.salesperson_id,
          zohospID: agent?.zohospID,
          revenue: 0,
          orders: 0,
          customers: new Set(),
          averageOrderValue: 0
        });
      }
      
      const performance = agentPerformance.get(order.salesperson_id);
      performance.revenue += order.total || 0;
      performance.orders += 1;
      performance.customers.add(order.customer_id);
    });

    // Calculate averages
    agentPerformance.forEach(performance => {
      performance.averageOrderValue = performance.revenue / performance.orders;
      performance.customers = performance.customers.size;
    });

    return {
      agentPerformance: Array.from(agentPerformance.values())
        .sort((a, b) => b.revenue - a.revenue),
      summary: this.generateSummary(orders, 'agent')
    };
  }

  /**
   * Get filter options with correct data sources
   */
  async getFilterOptions(userContext) {
    try {
      // Get brands from sales_transactions.brand_normalized
      const transactionsSnapshot = await this.db.collection('sales_transactions').limit(1000).get();
      const brandSet = new Set();
      
      transactionsSnapshot.docs.forEach(doc => {
        const transaction = doc.data();
        if (transaction.brand_normalized) {
          brandSet.add(transaction.brand_normalized);
        }
      });

      const brands = Array.from(brandSet).map(brand => ({
        id: brand.toLowerCase(),
        name: brand
      }));

      // Get agents from users collection using zohospID
      const usersSnapshot = await this.db.collection('users')
        .where('role', '==', 'salesAgent')
        .get();
      
      const agents = usersSnapshot.docs.map(doc => {
        const user = doc.data();
        return {
          id: user.zohospID, // Use zohospID instead of doc.id
          name: user.name || user.email
        };
      }).filter(agent => agent.id); // Filter out users without zohospID

      // Get regions from users
      const regionSet = new Set();
      usersSnapshot.docs.forEach(doc => {
        const user = doc.data();
        if (user.region && Array.isArray(user.region)) {
          user.region.forEach(r => regionSet.add(r));
        }
      });

      const regions = Array.from(regionSet).map(region => ({
        id: region,
        name: region
      }));

      return {
        brands,
        agents,
        regions
      };

    } catch (error) {
      console.error('Error getting filter options:', error);
      return {
        brands: [],
        agents: [],
        regions: []
      };
    }
  }

  /**
   * Generate Customer performance report
   */
  async generateCustomerReport(data, config) {
    const { orders, customers } = data;
    const customerPerformance = new Map();

    orders.forEach(order => {
      if (!customerPerformance.has(order.customer_id)) {
        const customer = customers.find(c => c.firebase_uid === order.customer_id);
        customerPerformance.set(order.customer_id, {
          customerId: order.customer_id,
          customerName: customer?.zoho_data?.company_name || customer?.zoho_data?.customer_name || order.customer_name,
          revenue: 0,
          orders: 0,
          averageOrderValue: 0,
          lastOrderDate: order.date
        });
      }
      
      const performance = customerPerformance.get(order.customer_id);
      performance.revenue += order.total || 0;
      performance.orders += 1;
      
      // Update last order date if this order is more recent
      if (new Date(order.date) > new Date(performance.lastOrderDate)) {
        performance.lastOrderDate = order.date;
      }
    });

    // Calculate averages
    customerPerformance.forEach(performance => {
      performance.averageOrderValue = performance.revenue / performance.orders;
    });

    return {
      customerPerformance: Array.from(customerPerformance.values())
        .sort((a, b) => b.revenue - a.revenue),
      summary: this.generateSummary(orders, 'customer')
    };
  }

  /**
   * Generate Region performance report
   */
  async generateRegionReport(data, config) {
    const { orders, users } = data;
    const regionPerformance = new Map();

    orders.forEach(order => {
      const agent = users.find(u => u.uid === order.salesperson_uid);
      const regions = agent?.region || ['Unknown Region'];
      
      regions.forEach(region => {
        if (!regionPerformance.has(region)) {
          regionPerformance.set(region, {
            regionName: region,
            revenue: 0,
            orders: 0,
            agents: new Set(),
            customers: new Set()
          });
        }
        
        const performance = regionPerformance.get(region);
        performance.revenue += order.total || 0;
        performance.orders += 1;
        performance.agents.add(order.salesperson_uid);
        performance.customers.add(order.customer_id);
      });
    });

    // Convert sets to counts
    regionPerformance.forEach(performance => {
      performance.agents = performance.agents.size;
      performance.customers = performance.customers.size;
    });

    return {
      regionPerformance: Array.from(regionPerformance.values())
        .sort((a, b) => b.revenue - a.revenue),
      summary: this.generateSummary(orders, 'region')
    };
  }

  /**
   * Generate Popular Items by Brand report
   */
  async generatePopularItemsByBrandReport(data, config) {
    const { orders } = data;
    const brandItems = new Map();

    orders.forEach(order => {
      order.line_items?.forEach(item => {
        const brand = item.brand || 'Unknown Brand';
        const itemKey = `${brand}|${item.item_name || item.name}`;
        
        if (!brandItems.has(itemKey)) {
          brandItems.set(itemKey, {
            brand,
            itemName: item.item_name || item.name,
            quantity: 0,
            revenue: 0,
            orders: 0
          });
        }
        
        const itemData = brandItems.get(itemKey);
        itemData.quantity += item.quantity || 0;
        itemData.revenue += item.item_total || (item.quantity * item.rate) || 0;
        itemData.orders += 1;
      });
    });

    // Group by brand
    const brandItemsGrouped = {};
    brandItems.forEach(item => {
      if (!brandItemsGrouped[item.brand]) {
        brandItemsGrouped[item.brand] = [];
      }
      brandItemsGrouped[item.brand].push(item);
    });

    // Sort items within each brand by quantity
    Object.keys(brandItemsGrouped).forEach(brand => {
      brandItemsGrouped[brand].sort((a, b) => b.quantity - a.quantity);
    });

    return {
      popularItemsByBrand: brandItemsGrouped,
      summary: this.generateSummary(orders, 'popular_items_brand')
    };
  }

  /**
   * Generate Popular Items report
   */
  async generatePopularItemsReport(data, config) {
    const { orders } = data;
    const items = new Map();

    orders.forEach(order => {
      order.line_items?.forEach(item => {
        const itemKey = item.item_name || item.name || 'Unknown Item';
        
        if (!items.has(itemKey)) {
          items.set(itemKey, {
            itemName: itemKey,
            quantity: 0,
            revenue: 0,
            orders: 0,
            brands: new Set()
          });
        }
        
        const itemData = items.get(itemKey);
        itemData.quantity += item.quantity || 0;
        itemData.revenue += item.item_total || (item.quantity * item.rate) || 0;
        itemData.orders += 1;
        itemData.brands.add(item.brand || 'Unknown Brand');
      });
    });

    // Convert brands set to array
    items.forEach(item => {
      item.brands = Array.from(item.brands);
    });

    return {
      popularItems: Array.from(items.values())
        .sort((a, b) => b.quantity - a.quantity),
      summary: this.generateSummary(orders, 'popular_items')
    };
  }

  /**
   * Generate summary statistics for a report
   */
  generateSummary(orders, reportType) {
    const totalRevenue = orders.reduce((sum, order) => sum + (order.total || 0), 0);
    const totalOrders = orders.length;
    const averageOrderValue = totalOrders > 0 ? totalRevenue / totalOrders : 0;
    
    return {
      totalRevenue,
      totalOrders,
      averageOrderValue,
      reportType
    };
  }

  /**
   * Check if an order is from a marketplace
   */
  isMarketplaceOrder(order) {
    return order.customer_name === 'Amazon UK - Customer' || 
           order.is_marketplace_order === true ||
           order.marketplace_source;
  }

  /**
   * Get applied filters for metadata
   */
  getAppliedFilters(filters) {
    const applied = [];
    
    if (filters.excludeMarketplace) applied.push('Exclude Marketplace Orders');
    if (filters.brands?.length) applied.push(`Brands: ${filters.brands.join(', ')}`);
    if (filters.agents?.length) applied.push(`Agents: ${filters.agents.length} selected`);
    if (filters.customerSegments?.length) applied.push(`Customer Segments: ${filters.customerSegments.join(', ')}`);
    if (filters.invoiceStatus?.length) applied.push(`Invoice Status: ${filters.invoiceStatus.join(', ')}`);
    if (filters.shippingStatus?.length) applied.push(`Shipping Status: ${filters.shippingStatus.join(', ')}`);
    if (filters.regions?.length) applied.push(`Regions: ${filters.regions.join(', ')}`);
    
    return applied;
  }

  /**
   * Get date range from config
   */
  getDateRange(dateRange, customDateRange) {
    const now = new Date();
    let start, end;

    switch (dateRange) {
      case 'today':
        start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
        break;
      
      case '7_days':
        start = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        end = now;
        break;
      
      case '30_days':
        start = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        end = now;
        break;
      
      case 'quarter':
        const currentQuarter = Math.floor(now.getMonth() / 3);
        start = new Date(now.getFullYear(), currentQuarter * 3, 1);
        end = new Date(now.getFullYear(), (currentQuarter + 1) * 3, 0, 23, 59, 59);
        break;
      
      case 'year':
        start = new Date(now.getFullYear(), 0, 1);
        end = new Date(now.getFullYear(), 11, 31, 23, 59, 59);
        break;
      
      case 'custom':
        start = new Date(customDateRange.start);
        end = new Date(customDateRange.end);
        end.setHours(23, 59, 59, 999);
        break;
      
      default:
        start = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        end = now;
    }

    return { start, end };
  }

  /**
   * Get filter options for dropdowns
   */
  async getFilterOptions(userContext) {
    try {
      // Get brands from orders
      const ordersSnapshot = await this.db.collection('salesorders').limit(1000).get();
      const brandSet = new Set();
      
      ordersSnapshot.docs.forEach(doc => {
        const order = doc.data();
        order.line_items?.forEach(item => {
          if (item.brand) {
            brandSet.add(item.brand);
          }
        });
      });

      const brands = Array.from(brandSet).map(brand => ({
        id: brand.toLowerCase(),
        name: brand
      }));

      // Get agents from users collection
      const usersSnapshot = await this.db.collection('users')
        .where('role', '==', 'salesAgent')
        .get();
      
      const agents = usersSnapshot.docs.map(doc => {
        const user = doc.data();
        return {
          id: doc.id,
          name: user.name || user.email
        };
      });

      // Get regions from users
      const regionSet = new Set();
      usersSnapshot.docs.forEach(doc => {
        const user = doc.data();
        if (user.region && Array.isArray(user.region)) {
          user.region.forEach(r => regionSet.add(r));
        }
      });

      const regions = Array.from(regionSet).map(region => ({
        id: region,
        name: region
      }));

      return {
        brands,
        agents,
        regions
      };

    } catch (error) {
      console.error('Error getting filter options:', error);
      return {
        brands: [],
        agents: [],
        regions: []
      };
    }
  }

  /**
   * Save report configuration
   */
  async saveReportConfig(config, userContext) {
    const reportDoc = {
      ...config,
      id: config.id || this.db.collection('report_configs').doc().id,
      userId: userContext.userId,
      savedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    await this.db.collection('report_configs').doc(reportDoc.id).set(reportDoc);
    
    return reportDoc;
  }

  /**
   * Get saved reports for a user
   */
  async getSavedReports(userId) {
    const snapshot = await this.db.collection('report_configs')
      .where('userId', '==', userId)
      .orderBy('updatedAt', 'desc')
      .get();

    return snapshot.docs.map(doc => ({
      id: doc.id,
      config: doc.data(),
      savedAt: doc.data().savedAt,
      userId: doc.data().userId
    }));
  }

  /**
   * Delete a report configuration
   */
  async deleteReportConfig(reportId, userId) {
    const reportDoc = await this.db.collection('report_configs').doc(reportId).get();
    
    if (!reportDoc.exists) {
      throw new Error('Report configuration not found');
    }
    
    if (reportDoc.data().userId !== userId) {
      throw new Error('Unauthorized to delete this report configuration');
    }

    await this.db.collection('report_configs').doc(reportId).delete();
  }

  /**
   * Get report template based on user role
   */
  getReportTemplate(role) {
    const baseTemplate = {
      sections: {
        overview: true,
        sales: true,
        orders: true,
        customers: false,
        invoices: false
      },
      filters: {
        excludeMarketplace: false
      },
      charts: {
        includeCharts: true,
        chartTypes: ['revenue', 'orders']
      },
      exportTheme: 'dashboard'
    };

    if (role === 'brandManager') {
      baseTemplate.sections.brands = true;
      baseTemplate.sections.agents = true;
    }

    return baseTemplate;
  }

  /**
   * Health check
   */
  async healthCheck() {
    try {
      // Test Firestore connection
      await this.db.collection('users').limit(1).get();
      
      return {
        status: 'healthy',
        timestamp: new Date().toISOString(),
        services: {
          firestore: 'connected'
        }
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
        error: error.message
      };
    }
  }
}

export default new ReportGeneratorService();