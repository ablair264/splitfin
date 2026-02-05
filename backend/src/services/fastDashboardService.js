// v2 - Updated to be consistent with zohoReportsService changes

import admin from 'firebase-admin';
import cronDataSyncService from './cronDataSyncService.js';
import zohoReportsService from './zohoReportsService.js';
import dataNormalizationService from './dataNormalizerService.js';

class FastDashboardService {
  constructor() {
    this.fallbackTimeout = 5000; // Still unused since fallback is disabled
  }

  /**
   * Fast dashboard data retrieval using cached data only.
   * Throws error if cache is missing or incomplete.
   */
  async getDashboardData(userId, dateRange = '30_days', customDateRange = null) {
    const startTime = Date.now();

    try {
      console.log(`⚡ Fast dashboard data fetch for user ${userId}, range: ${dateRange}`);

      const db = admin.firestore();

      const userDoc = await db.collection('users').doc(userId).get();
      if (!userDoc.exists) {
        throw new Error(`User ${userId} not found`);
      }

      const userData = userDoc.data();
      const isAgent = userData.role === 'salesAgent';
      const agentId = userData.zohospID; // This is the Zoho Inventory salesperson ID

      const cachedData = await this.getCachedDashboardData(userId, dateRange, isAgent, agentId);
      if (!cachedData) {
        throw new Error('❌ Cache is empty or incomplete. Please run a manual data sync.');
      }

      const loadTime = Date.now() - startTime;
      console.log(`🚀 Dashboard loaded from cache in ${loadTime}ms (Stale data allowed)`);

      return {
        ...cachedData,
        loadTime,
        dataSource: 'cache',
        lastUpdated: new Date().toISOString()
      };
    } catch (error) {
      console.error('❌ Fast dashboard error:', error.message);
      throw error;
    }
  }

  /**
   * Retrieve cached dashboard data (may be stale).
   * Updated to handle agent-specific filtering
   */
 async getCachedDashboardData(userId, dateRange, isAgent, agentId) {
  try {
    console.log(`📊 Building cached dashboard for ${isAgent ? 'Agent' : 'Brand Manager'}: ${userId}`);
    
    const [
      recentOrders,
      quickMetrics,
      brandPerformance,
      customerAnalytics,
      revenueAnalysis,
      agentPerformance,
      recentInvoices
    ] = await Promise.all([
      cronDataSyncService.getCachedData('recent_orders'),
      cronDataSyncService.getCachedData('quick_metrics'),
      cronDataSyncService.getCachedData('brand_performance'),
      cronDataSyncService.getCachedData('customer_analytics'),
      cronDataSyncService.getCachedData('revenue_analysis'),
      !isAgent ? cronDataSyncService.getCachedData('agent_performance') : null,
      cronDataSyncService.getCachedData('recent_invoices')
    ]);
    
    // Validate critical data
    if (!recentOrders && !quickMetrics) {
      console.warn('⚠️ No cached data available');
      return null;
    }
    
    // Ensure orders is an array
    let ordersArray = [];
    if (Array.isArray(recentOrders)) {
      ordersArray = recentOrders;
    } else if (recentOrders?.orders) {
      ordersArray = recentOrders.orders;
    } else if (recentOrders?.data) {
      ordersArray = recentOrders.data;
    }
    
    // Filter data for agents
    let filteredOrders = ordersArray;
    let filteredCustomers = customerAnalytics || { customers: [] };
    let filteredInvoices = recentInvoices || { outstanding: [], paid: [] };
    
    if (isAgent) {
      console.log(`🔍 Filtering data for agent UID: ${userId}, Zoho ID: ${agentId}`);
      
      // Filter orders by agent - check both IDs for backward compatibility
      // userId is the Firebase UID, agentId is the Zoho salesperson ID
      filteredOrders = ordersArray.filter(order => {
        return order.salesperson_id === agentId || 
               order.salesperson_uid === userId || // Check Firebase UID
               order.agent_id === agentId ||
               order.cf_agent === agentId;
      });
      
      console.log(`📦 Agent has ${filteredOrders.length} orders out of ${ordersArray.length} total`);
      
      // Get unique customer IDs from agent's orders
      const agentCustomerIds = new Set(
        filteredOrders.map(order => order.customer_id).filter(id => id)
      );
      
      // Filter customers
      if (customerAnalytics?.customers) {
        const allCustomers = Array.isArray(customerAnalytics.customers) 
          ? customerAnalytics.customers 
          : [];
          
        filteredCustomers = {
          ...customerAnalytics,
          customers: allCustomers.filter(customer => 
            agentCustomerIds.has(customer.id) || 
            agentCustomerIds.has(customer.customerId)
          )
        };
      }
      
      // Filter invoices
      if (recentInvoices) {
        const filterInvoiceList = (invoices) => {
          if (!Array.isArray(invoices)) return [];
          return invoices.filter(inv => 
            agentCustomerIds.has(inv.customer_id) || 
            agentCustomerIds.has(inv.contact_id)
          );
        };
        
        filteredInvoices = {
          all: filterInvoiceList(recentInvoices.all || []),
          outstanding: filterInvoiceList(recentInvoices.outstanding || []),
          overdue: filterInvoiceList(recentInvoices.overdue || []),
          dueToday: filterInvoiceList(recentInvoices.dueToday || []),
          dueIn30Days: filterInvoiceList(recentInvoices.dueIn30Days || []),
          paid: filterInvoiceList(recentInvoices.paid || []),
          summary: this.recalculateInvoiceSummary(recentInvoices, agentCustomerIds)
        };
      }
    }

    // Calculate totals
    const totalOrdersValue = filteredOrders.reduce((sum, order) => 
      sum + (parseFloat(order.total) || parseFloat(order.amount) || 0), 0
    );

    // Build overview with proper structure
    const overview = {
      sales: {
        totalOrders: filteredOrders.length,
        totalRevenue: revenueAnalysis?.grossRevenue || totalOrdersValue,
        averageOrderValue: filteredOrders.length > 0 
          ? totalOrdersValue / filteredOrders.length 
          : 0,
        completedOrders: filteredOrders.filter(order => 
          order.status === 'confirmed' || 
          order.status === 'completed' ||
          order.status === 'closed'
        ).length,
        pendingOrders: filteredOrders.filter(order => 
          order.status === 'draft' || 
          order.status === 'pending' ||
          order.status === 'open'
        ).length
      },
      topItems: this.calculateTopItems(filteredOrders),
      customers: {
        totalCustomers: filteredCustomers?.customers?.length || 0,
        activeCustomers: (filteredCustomers?.customers || []).filter(c => {
          if (!c.lastOrderDate) return false;
          const daysSince = (Date.now() - new Date(c.lastOrderDate).getTime()) / (1000 * 60 * 60 * 24);
          return daysSince <= 90;
        }).length,
        topCustomers: (filteredCustomers?.customers || [])
          .sort((a, b) => (b.totalSpent || 0) - (a.totalSpent || 0))
          .slice(0, 5)
          .map(c => ({
            id: c.id || c.customerId,
            name: c.name || c.Account_Name || 'Unknown',
            totalSpent: c.totalSpent || 0,
            orderCount: c.orderCount || 0
          })),
        averageOrdersPerCustomer: filteredCustomers?.customers?.length > 0
          ? (filteredCustomers.customers.reduce((sum, c) => sum + (c.orderCount || 0), 0) / 
             filteredCustomers.customers.length)
          : 0
      }
    };

    // Ensure revenue object exists with all required fields
    const revenue = {
      grossRevenue: revenueAnalysis?.grossRevenue || totalOrdersValue,
      netRevenue: revenueAnalysis?.netRevenue || (totalOrdersValue * 0.8),
      taxAmount: revenueAnalysis?.taxAmount || (totalOrdersValue * 0.2),
      paidRevenue: revenueAnalysis?.paidRevenue || 0,
      outstandingRevenue: revenueAnalysis?.outstandingRevenue || 0,
      profitMargin: revenueAnalysis?.profitMargin || 20,
      period: dateRange
    };

    // Build complete dashboard data structure
    const dashboardData = {
      role: isAgent ? 'salesAgent' : 'brandManager',
      dateRange,
      overview,
      revenue,
      orders: {
        salesOrders: {
          total: filteredOrders.length,
          totalValue: totalOrdersValue,
          averageValue: overview.sales.averageOrderValue,
          latest: filteredOrders.slice(0, 10).map(order => ({
            id: order.salesorder_id || order.id,
            salesorder_number: order.salesorder_number || order.order_number || order.id,
            customer_id: order.customer_id,
            customer_name: order.customer_name || order.customer || 'Unknown',
            date: order.date || order.created_at || new Date().toISOString(),
            total: parseFloat(order.total) || parseFloat(order.amount) || 0,
            status: order.status || 'pending',
            salesperson_id: order.salesperson_id,
            salesperson_name: order.salesperson_name,
            line_items: order.line_items || []
          }))
        }
      },
      invoices: {
        outstanding: filteredInvoices.outstanding || [],
        paid: filteredInvoices.paid || [],
        overdue: filteredInvoices.overdue || [],
        dueToday: filteredInvoices.dueToday || [],
        dueIn30Days: filteredInvoices.dueIn30Days || [],
        all: filteredInvoices.all || [],
        summary: filteredInvoices.summary || {
          totalOutstanding: 0,
          totalPaid: 0,
          totalOverdue: 0,
          totalDueToday: 0,
          totalDueIn30Days: 0,
          count: {
            outstanding: 0,
            paid: 0,
            overdue: 0,
            dueToday: 0,
            dueIn30Days: 0
          }
        }
      },
      performance: {
        brands: Array.isArray(brandPerformance?.brands) 
          ? brandPerformance.brands 
          : [],
        customers: (filteredCustomers?.customers || [])
          .slice(0, 10)
          .map(c => ({
            id: c.id || c.customerId,
            name: c.name || c.Account_Name || 'Unknown',
            totalSpent: c.totalSpent || 0,
            orderCount: c.orderCount || 0,
            lastOrderDate: c.lastOrderDate,
            segment: c.segment || 'Low'
          })),
        topItems: overview.topItems || [],
        trends: this.calculateQuickTrends(filteredOrders)
      },
      dataFreshness: {
        orders: 'Cached',
        metrics: 'Cached',
        brands: 'Cached',
        revenue: 'Cached'
      }
    };

    // Add commission for agents
    if (isAgent) {
      const commissionRate = 0.125; // 12.5%
      dashboardData.commission = {
        rate: commissionRate,
        total: totalOrdersValue * commissionRate,
        salesValue: totalOrdersValue
      };
    }

    // Add agent performance for brand managers
    if (!isAgent && agentPerformance) {
      dashboardData.agentPerformance = {
        agents: Array.isArray(agentPerformance?.agents) 
          ? agentPerformance.agents.map(agent => ({
              agentId: agent.agentId || agent.id,
              agentName: agent.agentName || agent.name || 'Unknown',
              totalRevenue: agent.totalRevenue || agent.revenue || 0,
              totalOrders: agent.totalOrders || agent.orders || 0,
              customers: agent.customers || 0,
              averageOrderValue: agent.averageOrderValue || 0
            }))
          : [],
        summary: agentPerformance?.summary || {
          totalAgents: 0,
          totalRevenue: 0,
          averageRevenue: 0,
          topPerformer: null
        }
      };
    }

    console.log('✅ Dashboard data structure built successfully', {
      role: dashboardData.role,
      ordersCount: dashboardData.orders.salesOrders.total,
      revenue: dashboardData.revenue.grossRevenue,
      hasAgentPerformance: !!dashboardData.agentPerformance
    });

    return dashboardData;

  } catch (error) {
    console.error('❌ Error building cached dashboard data:', error);
    return null;
  }
}

  /**
   * Recalculate invoice summary for filtered invoices
   */
  recalculateInvoiceSummary(invoices, customerIds) {
    const filterAndSum = (invoiceList, field = 'balance') => {
      if (!Array.isArray(invoiceList)) return 0;
      return invoiceList
        .filter(inv => customerIds.has(inv.customer_id))
        .reduce((sum, inv) => sum + parseFloat(inv[field] || 0), 0);
    };

    const filterAndCount = (invoiceList) => {
      if (!Array.isArray(invoiceList)) return 0;
      return invoiceList.filter(inv => customerIds.has(inv.customer_id)).length;
    };

    return {
      totalOverdue: filterAndSum(invoices.overdue || []),
      totalDueToday: filterAndSum(invoices.dueToday || []),
      totalDueIn30Days: filterAndSum(invoices.dueIn30Days || []),
      totalPaid: filterAndSum(invoices.paid || [], 'total'),
      totalOutstanding: filterAndSum(invoices.outstanding || []),
      count: {
        overdue: filterAndCount(invoices.overdue || []),
        dueToday: filterAndCount(invoices.dueToday || []),
        dueIn30Days: filterAndCount(invoices.dueIn30Days || []),
        paid: filterAndCount(invoices.paid || []),
        outstanding: filterAndCount(invoices.outstanding || [])
      }
    };
  }

  /**
   * Build overview section from available data.
   * Updated to handle agent-specific calculations
   */
  buildOverview(orders = [], customers = null, metrics = null, isAgent = false) {
    const totalRevenue = orders.reduce((sum, order) => sum + parseFloat(order.total || 0), 0);

    return {
      sales: {
        totalOrders: orders.length,
        totalRevenue: isAgent ? totalRevenue : (metrics?.todayRevenue || totalRevenue),
        averageOrderValue: orders.length > 0 ? totalRevenue / orders.length : 0,
        completedOrders: orders.filter(order => order.status === 'confirmed').length,
        pendingOrders: orders.filter(order => order.status === 'draft').length
      },
      topItems: this.calculateTopItems(orders),
      customers: {
        totalCustomers: customers?.customers?.length || 0,
        activeCustomers: customers?.customers?.filter(c => {
          if (!c.lastOrderDate) return false;
          const daysSinceLastOrder = (Date.now() - new Date(c.lastOrderDate).getTime()) / (1000 * 60 * 60 * 24);
          return daysSinceLastOrder <= 90;
        }).length || 0,
        topCustomers: customers?.customers?.slice(0, 5) || [],
        averageOrdersPerCustomer: customers?.customers?.length > 0
          ? customers.customers.reduce((sum, c) => sum + (c.orderCount || 0), 0) / customers.customers.length
          : 0
      }
    };
  }

  /**
   * Calculate top selling items from sales orders.
   * Updated to include brand information
   */
  calculateTopItems(salesOrders) {
    const itemStats = new Map();

    salesOrders.forEach(order => {
      if (order.line_items && Array.isArray(order.line_items)) {
        order.line_items.forEach(item => {
          if (!itemStats.has(item.item_id)) {
            itemStats.set(item.item_id, {
              itemId: item.item_id,
              name: item.name || 'Unknown Item',
              sku: item.sku || '',
              brand: item.brand || 'Unknown Brand',
              quantity: 0,
              revenue: 0
            });
          }

          const stats = itemStats.get(item.item_id);
          stats.quantity += parseInt(item.quantity || 0);
          stats.revenue += parseFloat(item.item_total || item.total || 0);
        });
      }
    });

    return Array.from(itemStats.values())
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 10);
  }

  /**
   * Calculate quick trends from recent orders.
   */
  calculateQuickTrends(salesOrders) {
    const trends = new Map();

    salesOrders.forEach(order => {
      const date = new Date(order.date);
      const period = date.toISOString().split('T')[0]; // YYYY-MM-DD

      if (!trends.has(period)) {
        trends.set(period, {
          period,
          orders: 0,
          revenue: 0,
          date: period
        });
      }

      const trend = trends.get(period);
      trend.orders++;
      trend.revenue += parseFloat(order.total || 0);
    });

    return Array.from(trends.values())
      .sort((a, b) => new Date(a.date) - new Date(b.date))
      .slice(-30); // Last 30 days
  }

  /**
   * Get data freshness information.
   */
  getDataFreshness(cacheKey) {
    // This would need to be implemented to check cache timestamps.
    return 'Cached (< 2hr)';
  }

  /**
   * Health check for the fast dashboard service.
   */
  async healthCheck() {
    try {
      const cacheStatus = await Promise.all([
        cronDataSyncService.getCachedData('recent_orders'),
        cronDataSyncService.getCachedData('quick_metrics'),
        cronDataSyncService.getCachedData('brand_performance')
      ]);

      const cacheHealth = {
        recentOrders: !!cacheStatus[0],
        quickMetrics: !!cacheStatus[1],
        brandPerformance: !!cacheStatus[2]
      };

      const healthScore = Object.values(cacheHealth).filter(Boolean).length / Object.keys(cacheHealth).length;

      return {
        status: healthScore > 0.5 ? 'healthy' : 'degraded',
        healthScore: Math.round(healthScore * 100),
        cache: cacheHealth,
        recommendation: healthScore < 0.5
          ? 'Run manual sync to populate cache'
          : 'All systems operational',
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      return {
        status: 'error',
        error: error.message,
        timestamp: new Date().toISOString()
      };
    }
  }
}

export default new FastDashboardService();