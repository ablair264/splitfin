// src/services/salesAgentSyncService.js
// Enhanced service to sync and calculate sales agent metrics

import admin from 'firebase-admin';

class SalesAgentSyncService {
  constructor() {
    // Standard date ranges
    this.dateRanges = [
      'this_week',
      'last_week', 
      'this_month',
      'last_month',
      'this_quarter',
      'last_quarter',
      'this_year',
      'last_year',
      '7_days',
      '30_days',
      '90_days'
    ];
  }

  /**
   * Get date range for a specific period
   */
  getDateRange(rangeName) {
    const now = new Date();
    let startDate, endDate;

    switch (rangeName) {
      case '7_days': {
        startDate = new Date(now);
        startDate.setDate(now.getDate() - 7);
        startDate.setHours(0, 0, 0, 0);
        endDate = new Date(now);
        endDate.setHours(23, 59, 59, 999);
        break;
      }
      case '30_days': {
        startDate = new Date(now);
        startDate.setDate(now.getDate() - 30);
        startDate.setHours(0, 0, 0, 0);
        endDate = new Date(now);
        endDate.setHours(23, 59, 59, 999);
        break;
      }
      case '90_days': {
        startDate = new Date(now);
        startDate.setDate(now.getDate() - 90);
        startDate.setHours(0, 0, 0, 0);
        endDate = new Date(now);
        endDate.setHours(23, 59, 59, 999);
        break;
      }
      case 'this_week': {
        const dayOfWeek = now.getDay();
        const daysToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
        startDate = new Date(now);
        startDate.setDate(now.getDate() - daysToMonday);
        startDate.setHours(0, 0, 0, 0);
        endDate = new Date(now);
        endDate.setHours(23, 59, 59, 999);
        break;
      }
      case 'last_week': {
        const dayOfWeek = now.getDay();
        const daysToLastMonday = dayOfWeek === 0 ? 13 : dayOfWeek + 6;
        startDate = new Date(now);
        startDate.setDate(now.getDate() - daysToLastMonday);
        startDate.setHours(0, 0, 0, 0);
        endDate = new Date(startDate);
        endDate.setDate(startDate.getDate() + 6);
        endDate.setHours(23, 59, 59, 999);
        break;
      }
      case 'this_month': {
        startDate = new Date(now.getFullYear(), now.getMonth(), 1);
        endDate = new Date(now);
        endDate.setHours(23, 59, 59, 999);
        break;
      }
      case 'last_month': {
        startDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        endDate = new Date(now.getFullYear(), now.getMonth(), 0);
        endDate.setHours(23, 59, 59, 999);
        break;
      }
      case 'this_quarter': {
        const currentQuarter = Math.floor(now.getMonth() / 3);
        startDate = new Date(now.getFullYear(), currentQuarter * 3, 1);
        endDate = new Date(now);
        endDate.setHours(23, 59, 59, 999);
        break;
      }
      case 'last_quarter': {
        const currentQuarter = Math.floor(now.getMonth() / 3);
        const lastQuarter = currentQuarter - 1;
        const lastQuarterYear = lastQuarter < 0 ? now.getFullYear() - 1 : now.getFullYear();
        const lastQuarterMonth = lastQuarter < 0 ? 9 : lastQuarter * 3;
        startDate = new Date(lastQuarterYear, lastQuarterMonth, 1);
        endDate = new Date(lastQuarterYear, lastQuarterMonth + 3, 0);
        endDate.setHours(23, 59, 59, 999);
        break;
      }
      case 'this_year': {
        startDate = new Date(now.getFullYear(), 0, 1);
        endDate = new Date(now);
        endDate.setHours(23, 59, 59, 999);
        break;
      }
      case 'last_year': {
        startDate = new Date(now.getFullYear() - 1, 0, 1);
        endDate = new Date(now.getFullYear() - 1, 11, 31);
        endDate.setHours(23, 59, 59, 999);
        break;
      }
      default:
        throw new Error(`Unknown date range: ${rangeName}`);
    }

    return { startDate, endDate };
  }

  /**
   * Calculate enhanced metrics for a sales agent for a specific date range
   */
  async calculateMetricsForAgent(salesAgentId, dateRange) {
    const db = admin.firestore();
    const { startDate, endDate } = this.getDateRange(dateRange);
    
    try {
      // Get all orders for this agent
      const ordersSnapshot = await db
        .collection('sales_agents')
        .doc(salesAgentId)
        .collection('customers_orders')
        .get();

      // Get all customers for this agent
      const customersSnapshot = await db
        .collection('sales_agents')
        .doc(salesAgentId)
        .collection('assigned_customers')
        .get();

      // Process customers data
      const customersMap = new Map();
      const customerSegments = { new: 0, low: 0, medium: 0, high: 0 };
      
      customersSnapshot.forEach(doc => {
        const customer = doc.data();
        customersMap.set(customer.customer_id, customer);
        
        // Count segments
        const segment = customer.enrichment?.segment || customer.segment || 'new';
        const segmentKey = segment.toLowerCase();
        if (segmentKey in customerSegments) {
          customerSegments[segmentKey]++;
        }
      });

      // Filter orders by date range and process
      const ordersInRange = [];
      const allOrders = [];
      let totalOrdersCount = 0;
      let totalOrdersValue = 0;
      let ordersShippedCount = 0;
      let paidOrdersCount = 0;
      let outstandingAmount = 0;
      let totalFulfillmentTime = 0;
      let onTimeDeliveries = 0;
      let deliveriesWithData = 0;
      
      ordersSnapshot.forEach(doc => {
        const order = doc.data();
        order.id = doc.id;
        allOrders.push(order);
        
        const orderDate = order.order_date || order.date || order.created_time;
        
        if (orderDate) {
          const orderDateObj = new Date(orderDate);
          if (orderDateObj >= startDate && orderDateObj <= endDate) {
            ordersInRange.push(order);
            
            totalOrdersCount++;
            totalOrdersValue += parseFloat(order.total || 0);
            
            if (order.shipped_status === 'shipped' || order.shipment_date) {
              ordersShippedCount++;
              
              // Calculate fulfillment time
              if (order.shipment_date) {
                const shipDate = new Date(order.shipment_date);
                const fulfillmentTime = (shipDate - orderDateObj) / (1000 * 60 * 60 * 24); // days
                totalFulfillmentTime += fulfillmentTime;
                deliveriesWithData++;
                
                // Check if on-time (assuming 5 days is on-time)
                if (fulfillmentTime <= 5) {
                  onTimeDeliveries++;
                }
              }
            }
            
            // Payment status
            if (order.payment_status === 'paid' || order.paid_status === 'paid') {
              paidOrdersCount++;
            } else {
              outstandingAmount += parseFloat(order.total || 0);
            }
          }
        }
      });

      // Calculate average order value
      const averageOrderValue = totalOrdersCount > 0 ? totalOrdersValue / totalOrdersCount : 0;
      
      // Calculate commission (12.5%)
      const totalCommissionEarned = totalOrdersValue * 0.125;
      
      // Calculate payment collection rate
      const paymentCollectionRate = totalOrdersCount > 0 ? (paidOrdersCount / totalOrdersCount) * 100 : 0;
      
      // Calculate average fulfillment time
      const averageFulfillmentTime = deliveriesWithData > 0 ? totalFulfillmentTime / deliveriesWithData : 0;
      
      // Calculate on-time delivery rate
      const onTimeDeliveryRate = deliveriesWithData > 0 ? (onTimeDeliveries / deliveriesWithData) * 100 : 0;

      // Get new customers for this period
      let newCustomersCount = 0;
      const uniqueCustomersInPeriod = new Set();
      
      ordersInRange.forEach(order => {
        uniqueCustomersInPeriod.add(order.customer_id);
      });
      
      // Check which customers are new (first order in this period)
      for (const customerId of uniqueCustomersInPeriod) {
        const customerOrders = allOrders.filter(o => o.customer_id === customerId);
        const firstOrderDate = customerOrders
          .map(o => new Date(o.order_date || o.date || o.created_time))
          .sort((a, b) => a - b)[0];
        
        if (firstOrderDate >= startDate && firstOrderDate <= endDate) {
          newCustomersCount++;
        }
      }

      // Calculate repeat customer rate
      const customerOrderCounts = new Map();
      allOrders.forEach(order => {
        const count = customerOrderCounts.get(order.customer_id) || 0;
        customerOrderCounts.set(order.customer_id, count + 1);
      });
      
      const repeatCustomers = Array.from(customerOrderCounts.values()).filter(count => count > 1).length;
      const totalUniqueCustomers = customerOrderCounts.size;
      const repeatCustomerRate = totalUniqueCustomers > 0 ? (repeatCustomers / totalUniqueCustomers) * 100 : 0;

      // Calculate retention rate (customers who ordered in previous period and current period)
      const prevRange = this.getPreviousDateRange(dateRange);
      const { startDate: prevStart, endDate: prevEnd } = this.getDateRange(prevRange);
      
      const prevPeriodCustomers = new Set();
      const currentPeriodCustomers = new Set(uniqueCustomersInPeriod);
      
      allOrders.forEach(order => {
        const orderDate = new Date(order.order_date || order.date || order.created_time);
        if (orderDate >= prevStart && orderDate <= prevEnd) {
          prevPeriodCustomers.add(order.customer_id);
        }
      });
      
      const retainedCustomers = Array.from(prevPeriodCustomers).filter(id => currentPeriodCustomers.has(id)).length;
      const customerRetentionRate = prevPeriodCustomers.size > 0 ? (retainedCustomers / prevPeriodCustomers.size) * 100 : 0;

      // Calculate top items with enhanced data
      const itemStats = new Map();
      const brandStats = new Map();
      const categoryStats = new Map();
      
      // Process line items for all orders in range
      for (const order of ordersInRange) {
        if (order.salesorder_id) {
          try {
            const salesOrderDoc = await db
              .collection('sales_orders')
              .doc(order.salesorder_id)
              .get();
            
            if (salesOrderDoc.exists) {
              const salesOrderData = salesOrderDoc.data();
              
              // If line_items exist in the main document
              if (salesOrderData.line_items && Array.isArray(salesOrderData.line_items)) {
                salesOrderData.line_items.forEach(item => {
                  this.processLineItem(item, itemStats, brandStats, categoryStats, order);
                });
              } else {
                // Fall back to subcollection
                const lineItemsSnapshot = await salesOrderDoc.ref
                  .collection('order_line_items')
                  .get();
                
                lineItemsSnapshot.forEach(lineItemDoc => {
                  const item = lineItemDoc.data();
                  this.processLineItem(item, itemStats, brandStats, categoryStats, order);
                });
              }
            }
          } catch (error) {
            console.warn(`Error fetching order ${order.salesorder_id}:`, error);
          }
        }
      }

      // Get top 5 items by revenue
      const top5Items = Array.from(itemStats.values())
        .sort((a, b) => b.revenue - a.revenue)
        .slice(0, 5);

      // Get top 5 brands by revenue
      const top5Brands = Array.from(brandStats.values())
        .map(brand => ({
          brand: brand.brand,
          order_count: brand.order_count.size, // Convert Set to number
          total_revenue: brand.total_revenue,
          quantity_sold: brand.quantity_sold
        }))
        .sort((a, b) => b.total_revenue - a.total_revenue)
        .slice(0, 5);

      // Calculate category breakdown with percentages
      const totalCategoryRevenue = Array.from(categoryStats.values())
        .reduce((sum, cat) => sum + cat.revenue, 0);
      
      const categoryBreakdown = Array.from(categoryStats.values())
        .map(cat => ({
          ...cat,
          percentage: totalCategoryRevenue > 0 ? (cat.revenue / totalCategoryRevenue) * 100 : 0
        }))
        .sort((a, b) => b.revenue - a.revenue);

      // Calculate top customers
      const customerStats = new Map();
      
      ordersInRange.forEach(order => {
        const customerId = order.customer_id;
        if (customerId) {
          const existing = customerStats.get(customerId) || {
            customer_id: customerId,
            customer_name: order.customer_name || order.company_name || 'Unknown',
            order_count: 0,
            total_spent: 0
          };
          
          existing.order_count++;
          existing.total_spent += parseFloat(order.total || 0);
          customerStats.set(customerId, existing);
        }
      });

      // Get top 5 customers by value
      const top5Customers = Array.from(customerStats.values())
        .sort((a, b) => b.total_spent - a.total_spent)
        .slice(0, 5);

      // Calculate top regions
      const regionStats = new Map();
      
      ordersInRange.forEach(order => {
        const customer = customersMap.get(order.customer_id);
        const region = customer?.location_region || 
                      customer?.enrichment?.location_region ||
                      order.shipping_address?.state ||
                      order.billing_address?.state ||
                      'Unknown';
        
        const existing = regionStats.get(region) || {
          region,
          customer_count: new Set(),
          total_revenue: 0
        };
        
        existing.customer_count.add(order.customer_id);
        existing.total_revenue += parseFloat(order.total || 0);
        regionStats.set(region, existing);
      });

      const top5Regions = Array.from(regionStats.values())
        .map(r => ({
          region: r.region,
          customer_count: r.customer_count.size,
          total_revenue: r.total_revenue
        }))
        .sort((a, b) => b.total_revenue - a.total_revenue)
        .slice(0, 5);

      // Calculate daily trends (last 30 days of the period)
      const dailyTrends = this.calculateDailyTrends(ordersInRange, Math.min(30, Math.floor((endDate - startDate) / (1000 * 60 * 60 * 24))));

      return {
        // Basic metrics (existing)
        total_orders_count: totalOrdersCount,
        total_orders_value: totalOrdersValue,
        orders_shipped_count: ordersShippedCount,
        new_customers_count: newCustomersCount,
        top_5_items: top5Items,
        top_5_customers: top5Customers,
        
        // Enhanced metrics (new)
        average_order_value: averageOrderValue,
        total_commission_earned: totalCommissionEarned,
        payment_collection_rate: paymentCollectionRate,
        outstanding_amount: outstandingAmount,
        customer_segments: customerSegments,
        repeat_customer_rate: repeatCustomerRate,
        customer_retention_rate: customerRetentionRate,
        top_5_brands: top5Brands,
        top_5_regions: top5Regions,
        daily_order_trend: dailyTrends,
        average_fulfillment_time: averageFulfillmentTime,
        on_time_delivery_rate: onTimeDeliveryRate,
        category_breakdown: categoryBreakdown,
        
        // Metadata
        date_range: dateRange,
        calculated_at: admin.firestore.FieldValue.serverTimestamp()
      };
      
    } catch (error) {
      console.error(`Error calculating metrics for agent ${salesAgentId}:`, error);
      throw error;
    }
  }

  /**
   * Process line item data
   */
  processLineItem(item, itemStats, brandStats, categoryStats, order) {
    // Item stats
    const itemId = item.item_id || item.product_id;
    if (itemId) {
      const existing = itemStats.get(itemId) || {
        item_id: itemId,
        item_name: item.name || item.item_name || 'Unknown',
        sku: item.sku || '',
        quantity: 0,
        revenue: 0
      };
      
      existing.quantity += parseInt(item.quantity || 0);
      existing.revenue += parseFloat(item.item_total || item.total || 0);
      itemStats.set(itemId, existing);
    }
    
    // Brand stats
    const brand = item.brand || item.group_name?.split(' ')[0] || 'Unknown';
    const brandKey = brand.toLowerCase();
    
    if (!brandStats.has(brandKey)) {
      brandStats.set(brandKey, {
        brand: brand,
        order_count: new Set(),
        total_revenue: 0,
        quantity_sold: 0
      });
    }
    
    const brandStat = brandStats.get(brandKey);
    brandStat.order_count.add(order.id);
    brandStat.total_revenue += parseFloat(item.item_total || item.total || 0);
    brandStat.quantity_sold += parseInt(item.quantity || 0);
    
    // Category stats
    const category = item.category || item.item_type || 'Uncategorized';
    const categoryKey = category.toLowerCase();
    
    if (!categoryStats.has(categoryKey)) {
      categoryStats.set(categoryKey, {
        category: category,
        revenue: 0
      });
    }
    
    categoryStats.get(categoryKey).revenue += parseFloat(item.item_total || item.total || 0);
  }

  /**
   * Calculate daily trends
   */
  calculateDailyTrends(orders, daysToShow = 30) {
    const dailyData = new Map();
    const today = new Date();
    today.setHours(23, 59, 59, 999);
    
    // Initialize all days with zero values
    for (let i = 0; i < daysToShow; i++) {
      const date = new Date(today);
      date.setDate(today.getDate() - i);
      const dateStr = date.toISOString().split('T')[0];
      dailyData.set(dateStr, { date: dateStr, orders: 0, revenue: 0 });
    }
    
    // Populate with actual data
    orders.forEach(order => {
      const orderDate = new Date(order.order_date || order.date || order.created_time);
      const dateStr = orderDate.toISOString().split('T')[0];
      
      if (dailyData.has(dateStr)) {
        const day = dailyData.get(dateStr);
        day.orders++;
        day.revenue += parseFloat(order.total || 0);
      }
    });
    
    // Convert to array and sort by date
    return Array.from(dailyData.values())
      .sort((a, b) => a.date.localeCompare(b.date));
  }

  /**
   * Get previous date range name
   */
  getPreviousDateRange(currentRange) {
    const rangeMap = {
      'this_week': 'last_week',
      'last_week': 'last_week', // stays the same
      'this_month': 'last_month',
      'last_month': 'last_month',
      'this_quarter': 'last_quarter',
      'last_quarter': 'last_quarter',
      'this_year': 'last_year',
      'last_year': 'last_year',
      '7_days': '7_days',
      '30_days': '30_days',
      '90_days': '90_days'
    };
    
    return rangeMap[currentRange] || currentRange;
  }

  /**
   * Update counters for all sales agents
   */
  async updateAllAgentCounters() {
    const db = admin.firestore();
    
    try {
      console.log('🚀 Starting enhanced sales agent counters update...');
      
      // Get all sales agents
      const usersSnapshot = await db
        .collection('users')
        .where('role', '==', 'salesAgent')
        .get();
      
      console.log(`Found ${usersSnapshot.size} sales agents to process`);
      
      let processedCount = 0;
      let errorCount = 0;
      
      for (const userDoc of usersSnapshot.docs) {
        const userData = userDoc.data();
        const salesAgentId = userData.zohospID;
        
        if (!salesAgentId) {
          console.warn(`User ${userDoc.id} has no zohospID, skipping...`);
          errorCount++;
          continue;
        }
        
        try {
          // Check if sales_agents document exists
          const agentDoc = await db.collection('sales_agents').doc(salesAgentId).get();
          if (!agentDoc.exists) {
            console.warn(`No sales_agents document for ${salesAgentId}, skipping...`);
            errorCount++;
            continue;
          }
          
          // Calculate metrics for each date range
          const batch = db.batch();
          
          for (const dateRange of this.dateRanges) {
            console.log(`  Calculating ${dateRange} for agent ${salesAgentId}...`);
            
            const metrics = await this.calculateMetricsForAgent(salesAgentId, dateRange);
            
            // Update counter document
            const counterRef = db
              .collection('sales_agents')
              .doc(salesAgentId)
              .collection('counters')
              .doc(dateRange);
            
            batch.set(counterRef, metrics, { merge: true });
          }
          
          // Commit batch for this agent
          await batch.commit();
          processedCount++;
          
          console.log(`✅ Updated enhanced counters for agent ${salesAgentId} (${processedCount}/${usersSnapshot.size})`);
          
          // Add a small delay to avoid overwhelming Firestore
          await new Promise(resolve => setTimeout(resolve, 100));
          
        } catch (agentError) {
          console.error(`Error processing agent ${salesAgentId}:`, agentError);
          errorCount++;
        }
      }
      
      console.log(`✅ Enhanced sales agent counters update completed:`);
      console.log(`   - Processed: ${processedCount}`);
      console.log(`   - Errors: ${errorCount}`);
      
      return {
        success: true,
        processed: processedCount,
        errors: errorCount,
        timestamp: new Date().toISOString()
      };
      
    } catch (error) {
      console.error('❌ Error updating sales agent counters:', error);
      return {
        success: false,
        error: error.message,
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * Get current metrics for a sales agent
   */
  async getCurrentMetrics(salesAgentId, dateRange = 'this_month') {
    const db = admin.firestore();
    
    try {
      const counterDoc = await db
        .collection('sales_agents')
        .doc(salesAgentId)
        .collection('counters')
        .doc(dateRange)
        .get();
      
      if (counterDoc.exists) {
        return counterDoc.data();
      }
      
      // If no cached data, calculate on the fly
      console.log(`No cached data for ${salesAgentId}/${dateRange}, calculating...`);
      return await this.calculateMetricsForAgent(salesAgentId, dateRange);
      
    } catch (error) {
      console.error(`Error getting metrics for agent ${salesAgentId}:`, error);
      return null;
    }
  }
}

export default new SalesAgentSyncService();