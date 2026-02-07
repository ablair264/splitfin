import express from 'express';
import { query } from '../../config/database.js';
import { logger } from '../../utils/logger.js';

const router = express.Router();

// GET /api/v1/analytics/dashboard - Dashboard with chart data
router.get('/dashboard', async (req, res) => {
  try {
    const { date_range = '30_days' } = req.query;
    const startDate = getStartDate(date_range);

    const [
      orderMetrics,
      stockTotal,
      topAgent,
      orderChartData,
      revenueChartData
    ] = await Promise.all([
      getOrderMetricsForDashboard(startDate),
      getStockTotal(),
      getTopAgent(startDate),
      getOrderTimeSeries(startDate, date_range, 'count'),
      getOrderTimeSeries(startDate, date_range, 'revenue')
    ]);

    res.json({
      // Main metrics (filterable by date)
      ordersCount: parseInt(orderMetrics.order_count) || 0,
      ordersRevenue: parseFloat(orderMetrics.order_revenue) || 0,
      stockTotal: parseInt(stockTotal) || 0,
      topAgent: topAgent,

      // Chart data for the metric cards
      orderCountChartData: orderChartData,
      orderRevenueChartData: revenueChartData,
      stockChartData: await getStockByBrand(),
      topAgentChartData: await getAgentPerformance(startDate),

      // Secondary metrics
      pendingOrders: parseInt(orderMetrics.pending_orders) || 0,
      avgOrderValue: parseFloat(orderMetrics.avg_order_value) || 0,
      newCustomers: parseInt(orderMetrics.new_customers) || 0,
      lowStockItems: parseInt(orderMetrics.low_stock_items) || 0
    });
  } catch (error) {
    logger.error('Dashboard query failed:', error);
    res.status(500).json({ error: error.message });
  }
});

async function getOrderMetricsForDashboard(startDate) {
  const { rows } = await query(`
    SELECT
      COUNT(*) as order_count,
      COALESCE(SUM(total), 0) as order_revenue,
      COUNT(*) FILTER (WHERE status IN ('pending', 'draft')) as pending_orders,
      COALESCE(AVG(total) FILTER (WHERE total > 0), 0) as avg_order_value,
      (SELECT COUNT(*) FROM customers WHERE created_at >= $1) as new_customers,
      (SELECT COUNT(*) FROM products WHERE stock_on_hand <= 5 AND status = 'active') as low_stock_items
    FROM orders
    WHERE date >= $1
  `, [startDate.toISOString()]);
  return rows[0] || {};
}

async function getStockTotal() {
  const { rows } = await query(`
    SELECT COALESCE(SUM(stock_on_hand), 0) as total_stock
    FROM products
    WHERE status = 'active'
  `);
  return rows[0]?.total_stock || 0;
}

async function getTopAgent(startDate) {
  const { rows } = await query(`
    SELECT
      a.id,
      a.name,
      COUNT(o.id) as order_count,
      COALESCE(SUM(o.total), 0) as total_revenue
    FROM agents a
    LEFT JOIN orders o ON o.agent_id = a.id AND o.date >= $1
    WHERE a.is_admin = false OR a.is_admin IS NULL
    GROUP BY a.id, a.name
    ORDER BY total_revenue DESC
    LIMIT 1
  `, [startDate.toISOString()]);

  if (rows.length === 0) {
    return { name: 'N/A', orderCount: 0, revenue: 0 };
  }

  return {
    id: rows[0].id,
    name: rows[0].name || 'Unknown',
    orderCount: parseInt(rows[0].order_count) || 0,
    revenue: parseFloat(rows[0].total_revenue) || 0
  };
}

/**
 * Smart time-series aggregation that adapts granularity to the date range:
 *   7 days   → daily   (Mon 3, Tue 4 …)
 *   30 days  → daily   (3 Feb, 4 Feb …)
 *   90 days  → weekly  (W1 Jan, W2 Jan …)
 *   this_year / 1 year → monthly (Jan, Feb …)
 *   all_time → yearly  (2021, 2022 …)
 */
async function getOrderTimeSeries(startDate, dateRange, mode = 'count') {
  const agg = mode === 'revenue' ? 'COALESCE(SUM(total), 0)' : 'COUNT(*)';

  // Pick granularity
  let sqlGroup, sqlOrder, sqlLabel;
  let granularity; // 'day' | 'week' | 'month' | 'year'

  switch (dateRange) {
    case '7_days':
      granularity = 'day';
      sqlLabel = `TO_CHAR(date, 'Dy DD')`;
      sqlGroup = `DATE(date)`;
      sqlOrder = `DATE(date)`;
      break;
    case '30_days':
      granularity = 'day';
      sqlLabel = `TO_CHAR(date, 'DD Mon')`;
      sqlGroup = `DATE(date)`;
      sqlOrder = `DATE(date)`;
      break;
    case '90_days':
    case 'quarter':
      granularity = 'week';
      sqlLabel = `'W' || EXTRACT(WEEK FROM date)::int || ' ' || TO_CHAR(date_trunc('week', date), 'Mon')`;
      sqlGroup = `date_trunc('week', date)`;
      sqlOrder = `date_trunc('week', date)`;
      break;
    case 'all_time':
      // If span > 3 years use yearly, otherwise monthly
      const yearsSpan = (new Date().getFullYear() - startDate.getFullYear());
      if (yearsSpan > 3) {
        granularity = 'year';
        sqlLabel = `EXTRACT(YEAR FROM date)::int::text`;
        sqlGroup = `date_trunc('year', date)`;
        sqlOrder = `date_trunc('year', date)`;
      } else {
        granularity = 'month';
        sqlLabel = `TO_CHAR(date, 'Mon YY')`;
        sqlGroup = `date_trunc('month', date)`;
        sqlOrder = `date_trunc('month', date)`;
      }
      break;
    default: // this_year, 12_months, 1_year, last_year
      granularity = 'month';
      sqlLabel = `TO_CHAR(date, 'Mon')`;
      sqlGroup = `date_trunc('month', date)`;
      sqlOrder = `date_trunc('month', date)`;
      break;
  }

  const { rows } = await query(`
    SELECT
      ${sqlLabel} as name,
      ${agg} as value
    FROM orders
    WHERE date >= $1
    GROUP BY ${sqlGroup}, ${sqlLabel}
    ORDER BY ${sqlOrder}
  `, [startDate.toISOString()]);

  return rows.map(r => ({
    name: r.name,
    value: mode === 'revenue' ? Math.round(parseFloat(r.value)) : parseInt(r.value)
  }));
}

async function getStockByBrand() {
  const { rows } = await query(`
    SELECT brand as name, COALESCE(SUM(stock_on_hand), 0) as value
    FROM products
    WHERE status = 'active' AND brand IS NOT NULL AND brand != ''
    GROUP BY brand
    ORDER BY value DESC
    LIMIT 5
  `);
  return rows.map(r => ({ name: r.name, value: parseInt(r.value) }));
}

async function getAgentPerformance(startDate) {
  const { rows } = await query(`
    SELECT
      COALESCE(a.name, 'Unassigned') as name,
      COALESCE(SUM(o.total), 0) as value
    FROM orders o
    LEFT JOIN agents a ON o.agent_id = a.id
    WHERE o.date >= $1
    GROUP BY a.name
    ORDER BY value DESC
    LIMIT 5
  `, [startDate.toISOString()]);
  return rows.map(r => ({ name: r.name, value: Math.round(parseFloat(r.value)) }));
}

// GET /api/v1/analytics/agents - Agent performance page data
router.get('/agents', async (req, res) => {
  try {
    const { date_range = '30_days' } = req.query;
    const startDate = getStartDate(date_range);

    const [agentSummary, activityData, brandSpreadData] = await Promise.all([
      getAgentSummary(startDate),
      getAgentActivityTimeSeries(startDate, date_range),
      getAgentBrandSpread(startDate),
    ]);

    // Derive chart data from summary
    const ordersByAgentChart = agentSummary.map(a => ({ name: a.name, value: a.orderCount }));
    const revenueByAgentChart = agentSummary.map(a => ({ name: a.name, value: a.revenue }));

    res.json({
      agents: agentSummary,
      ordersByAgentChart,
      revenueByAgentChart,
      activityChart: activityData,
      brandSpreadChart: brandSpreadData,
    });
  } catch (error) {
    logger.error('Agent analytics query failed:', error);
    res.status(500).json({ error: error.message });
  }
});

async function getAgentSummary(startDate) {
  const { rows } = await query(`
    SELECT
      a.id,
      a.name,
      COALESCE(a.commission_rate, 0) as commission_rate,
      COUNT(o.id) as order_count,
      COALESCE(SUM(o.total), 0) as total_revenue,
      (SELECT COUNT(*) FROM customers c WHERE c.agent_id = a.id AND c.created_at >= $1) as new_customers
    FROM agents a
    LEFT JOIN orders o ON o.agent_id = a.id AND o.date >= $1
    WHERE a.is_admin = false OR a.is_admin IS NULL
    GROUP BY a.id, a.name, a.commission_rate
    ORDER BY total_revenue DESC
  `, [startDate.toISOString()]);

  return rows.map(r => ({
    id: r.id,
    name: r.name || 'Unknown',
    orderCount: parseInt(r.order_count) || 0,
    revenue: Math.round(parseFloat(r.total_revenue)) || 0,
    newCustomers: parseInt(r.new_customers) || 0,
    commissionRate: parseFloat(r.commission_rate) || 0,
    commission: Math.round((parseFloat(r.commission_rate) || 0) * (parseFloat(r.total_revenue) || 0)),
  }));
}

async function getAgentActivityTimeSeries(startDate, dateRange) {
  // Pick granularity (same logic as getOrderTimeSeries)
  let sqlLabel, sqlGroup, sqlOrder;

  switch (dateRange) {
    case '7_days':
      sqlLabel = `TO_CHAR(o.date, 'Dy DD')`;
      sqlGroup = `DATE(o.date)`;
      sqlOrder = `DATE(o.date)`;
      break;
    case '30_days':
      sqlLabel = `TO_CHAR(o.date, 'DD Mon')`;
      sqlGroup = `DATE(o.date)`;
      sqlOrder = `DATE(o.date)`;
      break;
    case '90_days':
    case 'quarter':
      sqlLabel = `'W' || EXTRACT(WEEK FROM o.date)::int || ' ' || TO_CHAR(date_trunc('week', o.date), 'Mon')`;
      sqlGroup = `date_trunc('week', o.date)`;
      sqlOrder = `date_trunc('week', o.date)`;
      break;
    case 'all_time': {
      const yearsSpan = (new Date().getFullYear() - startDate.getFullYear());
      if (yearsSpan > 3) {
        sqlLabel = `EXTRACT(YEAR FROM o.date)::int::text`;
        sqlGroup = `date_trunc('year', o.date)`;
        sqlOrder = `date_trunc('year', o.date)`;
      } else {
        sqlLabel = `TO_CHAR(o.date, 'Mon YY')`;
        sqlGroup = `date_trunc('month', o.date)`;
        sqlOrder = `date_trunc('month', o.date)`;
      }
      break;
    }
    default: // this_year, 12_months, etc.
      sqlLabel = `TO_CHAR(o.date, 'Mon')`;
      sqlGroup = `date_trunc('month', o.date)`;
      sqlOrder = `date_trunc('month', o.date)`;
      break;
  }

  const { rows } = await query(`
    SELECT
      ${sqlLabel} as period_label,
      ${sqlGroup} as period_group,
      a.name as agent_name,
      COUNT(o.id) as order_count
    FROM orders o
    JOIN agents a ON o.agent_id = a.id AND (a.is_admin = false OR a.is_admin IS NULL)
    WHERE o.date >= $1
    GROUP BY ${sqlGroup}, ${sqlLabel}, a.name
    ORDER BY ${sqlOrder}
  `, [startDate.toISOString()]);

  // Pivot: group by period, each agent becomes a key
  const periodMap = new Map();
  for (const r of rows) {
    const key = r.period_label;
    if (!periodMap.has(key)) {
      periodMap.set(key, { name: key });
    }
    periodMap.get(key)[r.agent_name || 'Unknown'] = parseInt(r.order_count) || 0;
  }

  return Array.from(periodMap.values());
}

async function getAgentBrandSpread(startDate) {
  const { rows } = await query(`
    SELECT
      a.name as agent_name,
      p.brand,
      COALESCE(SUM(oli.amount), 0) as brand_revenue
    FROM orders o
    JOIN agents a ON o.agent_id = a.id AND (a.is_admin = false OR a.is_admin IS NULL)
    JOIN order_line_items oli ON oli.order_id = o.id
    JOIN products p ON p.zoho_item_id = oli.item_id
    WHERE o.date >= $1 AND p.brand IS NOT NULL AND p.brand != ''
    GROUP BY a.name, p.brand
    ORDER BY brand_revenue DESC
  `, [startDate.toISOString()]);

  // Pivot: group by brand, each agent becomes a key
  const brandMap = new Map();
  for (const r of rows) {
    const brand = r.brand;
    if (!brandMap.has(brand)) {
      brandMap.set(brand, { brand });
    }
    brandMap.get(brand)[r.agent_name || 'Unknown'] = Math.round(parseFloat(r.brand_revenue)) || 0;
  }

  return Array.from(brandMap.values());
}

// GET /api/v1/analytics/recent-orders - Latest orders for dashboard
router.get('/recent-orders', async (req, res) => {
  try {
    const { limit = 5 } = req.query;
    const { rows } = await query(`
      SELECT
        id,
        salesorder_number,
        reference_number,
        customer_name,
        date,
        status,
        total
      FROM orders
      ORDER BY date DESC, created_at DESC
      LIMIT $1
    `, [parseInt(limit)]);

    res.json(rows.map(row => ({
      id: row.id,
      orderNumber: row.salesorder_number,
      referenceNumber: row.reference_number || null,
      customer: row.customer_name,
      date: row.date,
      status: row.status,
      total: parseFloat(row.total) || 0
    })));
  } catch (error) {
    logger.error('Recent orders query failed:', error);
    res.status(500).json({ error: error.message });
  }
});

// GET /api/v1/analytics/recent-products - Recently added products
router.get('/recent-products', async (req, res) => {
  try {
    const { limit = 5 } = req.query;
    const { rows } = await query(`
      SELECT
        id,
        sku,
        name,
        brand,
        rate,
        stock_on_hand,
        image_url,
        created_at
      FROM products
      WHERE status = 'active'
      ORDER BY created_at DESC
      LIMIT $1
    `, [parseInt(limit)]);

    res.json(rows.map(row => ({
      id: row.id,
      sku: row.sku,
      name: row.name,
      brand: row.brand || 'N/A',
      price: parseFloat(row.rate) || 0,
      stock: row.stock_on_hand || 0,
      imageUrl: row.image_url || null,
      addedAt: row.created_at
    })));
  } catch (error) {
    logger.error('Recent products query failed:', error);
    res.status(500).json({ error: error.message });
  }
});

// GET /api/v1/analytics/recent-customers - Recently added customers
router.get('/recent-customers', async (req, res) => {
  try {
    const { limit = 5 } = req.query;
    const { rows } = await query(`
      SELECT
        c.id,
        c.company_name,
        c.contact_name,
        c.email,
        c.status,
        c.total_spent,
        c.created_at,
        COALESCE(oc.order_count, 0) as order_count
      FROM customers c
      LEFT JOIN (
        SELECT zoho_customer_id, COUNT(*) as order_count
        FROM orders
        GROUP BY zoho_customer_id
      ) oc ON oc.zoho_customer_id = c.zoho_contact_id
      ORDER BY c.created_at DESC
      LIMIT $1
    `, [parseInt(limit)]);

    res.json(rows.map(row => ({
      id: row.id,
      companyName: row.company_name,
      contactName: row.contact_name || 'N/A',
      email: row.email || 'N/A',
      status: row.status,
      totalSpent: parseFloat(row.total_spent) || 0,
      orderCount: parseInt(row.order_count) || 0,
      addedAt: row.created_at
    })));
  } catch (error) {
    logger.error('Recent customers query failed:', error);
    res.status(500).json({ error: error.message });
  }
});

// GET /api/v1/analytics - Dashboard analytics
router.get('/', async (req, res) => {
  try {
    const { date_range = '30_days' } = req.query;
    const startDate = getStartDate(date_range);

    const [
      orderMetrics,
      customerMetrics,
      invoiceMetrics,
      previousOrderMetrics
    ] = await Promise.all([
      getOrderMetrics(startDate),
      getCustomerMetrics(startDate),
      getInvoiceMetrics(startDate),
      getPreviousPeriodOrderMetrics(startDate, date_range)
    ]);

    const totalRevenue = parseFloat(orderMetrics.total_revenue) || 0;
    const totalOrders = parseInt(orderMetrics.total_orders) || 0;
    const avgOrderValue = totalOrders > 0 ? totalRevenue / totalOrders : 0;
    const previousTotalOrders = parseInt(previousOrderMetrics.total_orders) || 0;
    const orderConversion = previousTotalOrders > 0
      ? ((totalOrders - previousTotalOrders) / previousTotalOrders) * 100
      : 0;

    res.json({
      totalRevenue,
      totalOrders,
      totalCustomers: parseInt(customerMetrics.total_customers) || 0,
      averageOrderValue: avgOrderValue,
      activeCustomers: parseInt(orderMetrics.unique_customers) || 0,
      newCustomers: parseInt(customerMetrics.new_customers) || 0,
      pendingOrders: parseInt(orderMetrics.pending_orders) || 0,
      confirmedOrders: parseInt(orderMetrics.confirmed_orders) || 0,
      shippedOrders: parseInt(orderMetrics.shipped_orders) || 0,
      deliveredOrders: parseInt(orderMetrics.delivered_orders) || 0,
      orderConversion,
      outstandingInvoices: parseInt(invoiceMetrics.outstanding_invoices) || 0,
      paidInvoices: parseInt(invoiceMetrics.paid_invoices) || 0,
      overdueInvoices: parseInt(invoiceMetrics.overdue_invoices) || 0,
      totalInvoiceAmount: parseFloat(invoiceMetrics.total_invoice_amount) || 0,
      monthlyRevenue: totalRevenue,
      monthlyExpenses: totalRevenue * 0.7,
      profitMargin: totalRevenue > 0 ? 30 : 0,
      teamPerformance: totalRevenue / 1000,
      monthlyTargets: (totalRevenue / 1000) * 1.2,
      conversionRate: parseInt(orderMetrics.unique_customers) > 0
        ? (totalOrders / parseInt(orderMetrics.unique_customers)) * 100
        : 0,
      activeUsers: 1,
      systemHealth: 95,
      storageUsage: 15
    });
  } catch (error) {
    logger.error('Analytics query failed:', error);
    res.status(500).json({ error: error.message });
  }
});

// GET /api/v1/analytics/timeseries - Time series data
router.get('/timeseries', async (req, res) => {
  try {
    const { date_range = '30_days' } = req.query;
    const startDate = getStartDate(date_range);

    const { rows } = await query(
      `SELECT
        DATE(created_at) as date,
        COALESCE(SUM(total), 0) as revenue,
        COUNT(*) as orders,
        COUNT(DISTINCT zoho_customer_id) as customers
      FROM orders
      WHERE created_at >= $1
      GROUP BY DATE(created_at)
      ORDER BY date ASC`,
      [startDate.toISOString()]
    );

    // Fill in gaps for days with no data
    const timeSeriesData = [];
    const currentDate = new Date(startDate);
    const endDate = new Date();
    const dataMap = new Map(rows.map(r => [r.date.toISOString().split('T')[0], r]));

    while (currentDate <= endDate) {
      const dateStr = currentDate.toISOString().split('T')[0];
      const dayData = dataMap.get(dateStr);

      timeSeriesData.push({
        name: currentDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        date: dateStr,
        value: parseFloat(dayData?.revenue) || 0,
        revenue: parseFloat(dayData?.revenue) || 0,
        orders: parseInt(dayData?.orders) || 0,
        customers: parseInt(dayData?.customers) || 0
      });

      currentDate.setDate(currentDate.getDate() + 1);
    }

    res.json(timeSeriesData);
  } catch (error) {
    logger.error('Time series query failed:', error);
    res.status(500).json({ error: error.message });
  }
});

// GET /api/v1/analytics/activities - Recent activities
router.get('/activities', async (req, res) => {
  try {
    const { limit = 10 } = req.query;
    const activities = [];

    // Recent orders
    const { rows: recentOrders } = await query(
      `SELECT id, created_at, total, status, customer_name
       FROM orders
       ORDER BY created_at DESC
       LIMIT $1`,
      [Math.min(parseInt(limit), 5)]
    );

    for (const order of recentOrders) {
      activities.push({
        id: `order-${order.id}`,
        action: 'New Order',
        description: `Order ${order.status}`,
        customerName: order.customer_name || 'Unknown Customer',
        time: order.created_at,
        amount: parseFloat(order.total),
        type: 'order',
        status: order.status
      });
    }

    // Recent invoices
    const { rows: recentInvoices } = await query(
      `SELECT id, created_at, total, status, customer_name
       FROM invoices
       ORDER BY created_at DESC
       LIMIT $1`,
      [Math.min(parseInt(limit), 5)]
    );

    for (const invoice of recentInvoices) {
      activities.push({
        id: `invoice-${invoice.id}`,
        action: 'Invoice',
        description: `Invoice ${invoice.status}`,
        customerName: invoice.customer_name || 'Unknown Customer',
        time: invoice.created_at,
        amount: parseFloat(invoice.total),
        type: 'invoice',
        status: invoice.status
      });
    }

    // Recent customers
    const { rows: recentCustomers } = await query(
      `SELECT id, created_at, company_name
       FROM customers
       ORDER BY created_at DESC
       LIMIT 3`
    );

    for (const customer of recentCustomers) {
      activities.push({
        id: `customer-${customer.id}`,
        action: 'New Customer',
        description: 'Customer registered',
        customerName: customer.company_name,
        time: customer.created_at,
        type: 'customer'
      });
    }

    // Sort by time descending
    activities.sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime());

    res.json(activities.slice(0, parseInt(limit)));
  } catch (error) {
    logger.error('Activities query failed:', error);
    res.status(500).json({ error: error.message });
  }
});

// GET /api/v1/analytics/top-customers
router.get('/top-customers', async (req, res) => {
  try {
    const { limit = 10 } = req.query;

    const { rows } = await query(
      `SELECT id, company_name, total_spent, status, created_at
       FROM customers
       ORDER BY total_spent DESC NULLS LAST
       LIMIT $1`,
      [parseInt(limit)]
    );

    res.json(rows.map(c => ({
      id: c.id,
      name: c.company_name,
      orders: 0,
      revenue: parseFloat(c.total_spent) || 0,
      lastOrder: '',
      status: c.status === 'active' ? 'Active' : 'Inactive'
    })));
  } catch (error) {
    logger.error('Top customers query failed:', error);
    res.status(500).json({ error: error.message });
  }
});

// Helper functions
function getStartDate(range) {
  const startDate = new Date();

  switch (range) {
    case '7_days':
      startDate.setDate(startDate.getDate() - 7);
      break;
    case '90_days':
      startDate.setDate(startDate.getDate() - 90);
      break;
    case '12_months':
    case '1_year':
    case 'last_year':
      startDate.setFullYear(startDate.getFullYear() - 1);
      break;
    case 'this_year':
      startDate.setFullYear(startDate.getFullYear(), 0, 1);
      break;
    case 'last_month':
      startDate.setMonth(startDate.getMonth() - 1);
      break;
    case 'quarter':
      startDate.setMonth(startDate.getMonth() - 3);
      break;
    case 'last_quarter':
      startDate.setMonth(startDate.getMonth() - 6);
      break;
    case 'all_time':
      startDate.setFullYear(2000, 0, 1); // Far enough back to include all data
      break;
    default: // 30_days
      startDate.setDate(startDate.getDate() - 30);
  }

  return startDate;
}

async function getOrderMetrics(startDate) {
  const { rows } = await query(
    `SELECT
      COALESCE(SUM(total), 0) as total_revenue,
      COUNT(*) as total_orders,
      COUNT(DISTINCT zoho_customer_id) as unique_customers,
      COUNT(*) FILTER (WHERE status = 'pending') as pending_orders,
      COUNT(*) FILTER (WHERE status = 'confirmed') as confirmed_orders,
      COUNT(*) FILTER (WHERE status = 'shipped') as shipped_orders,
      COUNT(*) FILTER (WHERE status = 'delivered') as delivered_orders
    FROM orders
    WHERE created_at >= $1`,
    [startDate.toISOString()]
  );
  return rows[0] || {};
}

async function getCustomerMetrics(startDate) {
  const { rows } = await query(
    `SELECT
      COUNT(*) as total_customers,
      COUNT(*) FILTER (WHERE created_at >= $1) as new_customers
    FROM customers
    WHERE status = 'active'`,
    [startDate.toISOString()]
  );
  return rows[0] || {};
}

async function getInvoiceMetrics(startDate) {
  const { rows } = await query(
    `SELECT
      COUNT(*) FILTER (WHERE status IN ('sent', 'overdue')) as outstanding_invoices,
      COUNT(*) FILTER (WHERE status = 'paid') as paid_invoices,
      COUNT(*) FILTER (WHERE status = 'overdue') as overdue_invoices,
      COALESCE(SUM(total), 0) as total_invoice_amount
    FROM invoices
    WHERE created_at >= $1`,
    [startDate.toISOString()]
  );
  return rows[0] || {};
}

async function getPreviousPeriodOrderMetrics(startDate, dateRange) {
  const periodLength = new Date().getTime() - startDate.getTime();
  const previousStart = new Date(startDate.getTime() - periodLength);

  const { rows } = await query(
    `SELECT COUNT(*) as total_orders
     FROM orders
     WHERE created_at >= $1 AND created_at < $2`,
    [previousStart.toISOString(), startDate.toISOString()]
  );
  return rows[0] || {};
}

// POST /api/v1/analytics/ai-summary - Generate AI business summary
router.post('/ai-summary', async (req, res) => {
  try {
    const { detailed = false } = req.body;

    // Fetch real business data from Neon
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const weekStart = new Date(today);
    weekStart.setDate(weekStart.getDate() - 7);

    const [
      todayMetrics,
      weekMetrics,
      totalCounts,
      lowStockItems,
      recentOrders,
      topAgent
    ] = await Promise.all([
      getTodayMetrics(today),
      getWeekMetrics(weekStart),
      getTotalCounts(),
      getLowStockItems(),
      getRecentOrdersWithCustomers(),
      getTopAgentToday(today)
    ]);

    // Build context for AI
    const businessContext = {
      today: {
        orders: parseInt(todayMetrics.order_count) || 0,
        revenue: parseFloat(todayMetrics.revenue) || 0,
        newCustomers: parseInt(todayMetrics.new_customers) || 0
      },
      week: {
        orders: parseInt(weekMetrics.order_count) || 0,
        revenue: parseFloat(weekMetrics.revenue) || 0,
        newCustomers: parseInt(weekMetrics.new_customers) || 0
      },
      totals: {
        customers: parseInt(totalCounts.customer_count) || 0,
        orders: parseInt(totalCounts.order_count) || 0,
        products: parseInt(totalCounts.product_count) || 0
      },
      pendingOrders: parseInt(todayMetrics.pending_orders) || 0,
      lowStockCount: lowStockItems.length,
      lowStockItems: lowStockItems.slice(0, 5),
      recentOrders: recentOrders.slice(0, 5),
      topAgent: topAgent
    };

    // Generate AI summary via OpenAI (with fallback)
    const apiKey = process.env.OPENAI_API_KEY;
    let summary;

    if (!apiKey) {
      // Fallback to a simple generated summary without AI
      logger.warn('OPENAI_API_KEY not configured - using fallback summary');
      summary = generateFallbackSummary(businessContext, detailed);
    } else {
      try {
        const prompt = detailed ? buildDetailedPrompt(businessContext) : buildCompactPrompt(businessContext);

        const openaiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
          },
          body: JSON.stringify({
            model: 'gpt-3.5-turbo',
            messages: [
              { role: 'system', content: 'You are a helpful business analyst assistant for a B2B sales platform. Be concise and actionable.' },
              { role: 'user', content: prompt }
            ],
            max_tokens: detailed ? 800 : 200,
            temperature: 0.7
          })
        });

        if (!openaiResponse.ok) {
          const errorText = await openaiResponse.text();
          logger.error('OpenAI API error:', errorText);
          summary = generateFallbackSummary(businessContext, detailed);
        } else {
          const aiData = await openaiResponse.json();
          summary = aiData.choices[0]?.message?.content || generateFallbackSummary(businessContext, detailed);
        }
      } catch (aiError) {
        logger.error('OpenAI request failed:', aiError);
        summary = generateFallbackSummary(businessContext, detailed);
      }
    }

    res.json({
      summary,
      context: businessContext,
      generatedAt: new Date().toISOString()
    });

  } catch (error) {
    logger.error('AI summary generation failed:', error);
    res.status(500).json({ error: error.message });
  }
});

// Helper functions for AI summary
async function getTodayMetrics(today) {
  const { rows } = await query(`
    SELECT
      COUNT(*) as order_count,
      COALESCE(SUM(total), 0) as revenue,
      COUNT(*) FILTER (WHERE status IN ('pending', 'draft')) as pending_orders,
      (SELECT COUNT(*) FROM customers WHERE created_at >= $1) as new_customers
    FROM orders
    WHERE date >= $1
  `, [today.toISOString()]);
  return rows[0] || {};
}

async function getWeekMetrics(weekStart) {
  const { rows } = await query(`
    SELECT
      COUNT(*) as order_count,
      COALESCE(SUM(total), 0) as revenue,
      (SELECT COUNT(*) FROM customers WHERE created_at >= $1) as new_customers
    FROM orders
    WHERE date >= $1
  `, [weekStart.toISOString()]);
  return rows[0] || {};
}

async function getTotalCounts() {
  const { rows } = await query(`
    SELECT
      (SELECT COUNT(*) FROM customers WHERE status = 'active') as customer_count,
      (SELECT COUNT(*) FROM orders) as order_count,
      (SELECT COUNT(*) FROM products WHERE status = 'active') as product_count
  `);
  return rows[0] || {};
}

async function getLowStockItems() {
  const { rows } = await query(`
    SELECT name, stock_on_hand, sku
    FROM products
    WHERE status = 'active' AND stock_on_hand <= 5
    ORDER BY stock_on_hand ASC
    LIMIT 10
  `);
  return rows;
}

async function getRecentOrdersWithCustomers() {
  const { rows } = await query(`
    SELECT
      o.id,
      o.salesorder_number,
      o.customer_name,
      o.total,
      o.status,
      o.date
    FROM orders o
    ORDER BY o.date DESC, o.created_at DESC
    LIMIT 5
  `);
  return rows;
}

async function getTopAgentToday(today) {
  const { rows } = await query(`
    SELECT
      a.name,
      COUNT(o.id) as order_count,
      COALESCE(SUM(o.total), 0) as revenue
    FROM agents a
    LEFT JOIN orders o ON o.agent_id = a.id AND o.date >= $1
    WHERE a.is_admin = false OR a.is_admin IS NULL
    GROUP BY a.id, a.name
    ORDER BY revenue DESC
    LIMIT 1
  `, [today.toISOString()]);
  return rows[0] || { name: 'N/A', order_count: 0, revenue: 0 };
}

function generateFallbackSummary(ctx, detailed) {
  // Determine if we should show today or week (fallback to week if today has < 2 orders)
  const showWeekly = ctx.today.orders < 2;
  const orders = showWeekly ? ctx.week.orders : ctx.today.orders;
  const revenue = showWeekly ? ctx.week.revenue : ctx.today.revenue;

  // Only show top agent if they have actual revenue
  const topAgentRevenue = parseFloat(ctx.topAgent?.revenue || 0);
  const showTopAgent = ctx.topAgent && ctx.topAgent.name !== 'N/A' && topAgentRevenue > 0;

  // Format revenue nicely
  const formatRevenue = (val) => {
    if (val >= 1000) {
      return `£${(val / 1000).toFixed(1)}k`;
    }
    return `£${val.toFixed(0)}`;
  };

  if (detailed) {
    const lines = [];

    if (showWeekly) {
      lines.push(`This Week: ${ctx.week.orders} orders, ${formatRevenue(ctx.week.revenue)}`);
      if (ctx.week.newCustomers > 0) lines.push(`New customers: ${ctx.week.newCustomers}`);
    } else {
      lines.push(`Today: ${ctx.today.orders} orders, ${formatRevenue(ctx.today.revenue)}`);
      lines.push(`Week total: ${ctx.week.orders} orders, ${formatRevenue(ctx.week.revenue)}`);
    }

    if (ctx.pendingOrders > 0) lines.push(`Pending: ${ctx.pendingOrders}`);
    if (ctx.lowStockCount > 0) lines.push(`Low stock items: ${ctx.lowStockCount}`);
    if (showTopAgent) lines.push(`Top sales: ${ctx.topAgent.name} - ${formatRevenue(topAgentRevenue)}`);

    return lines.join('\n');
  }

  // Compact summary - just the facts
  const parts = [];

  if (showWeekly) {
    parts.push(`${orders} orders this week, ${formatRevenue(revenue)}`);
  } else {
    parts.push(`${orders} orders today, ${formatRevenue(revenue)}`);
    if (ctx.week.orders > ctx.today.orders) {
      parts.push(`week total: ${ctx.week.orders} orders, ${formatRevenue(ctx.week.revenue)}`);
    }
  }

  if (ctx.pendingOrders > 0) {
    parts.push(`${ctx.pendingOrders} pending`);
  }

  return parts.join('. ') + '.';
}

function buildCompactPrompt(ctx) {
  // Determine if we should focus on today or week (fallback to week if today has < 2 orders)
  const showWeekly = ctx.today.orders < 2;

  // Only mention top agent if they actually have revenue
  const topAgentRevenue = parseFloat(ctx.topAgent?.revenue || 0);
  const showTopAgent = ctx.topAgent && ctx.topAgent.name !== 'N/A' && topAgentRevenue > 0;

  const prompt = showWeekly ?
    `State the weekly business numbers in 1-2 plain sentences. No enthusiasm, no exclamation marks, no "team" language. Just facts.

Data:
- This week: ${ctx.week.orders} orders, £${ctx.week.revenue.toFixed(2)} revenue
- New customers: ${ctx.week.newCustomers}
- Pending orders: ${ctx.pendingOrders}
${showTopAgent ? `- Top sales: ${ctx.topAgent.name} with £${topAgentRevenue.toFixed(2)}` : ''}

Write 1-2 matter-of-fact sentences. Example tone: "81 orders this week for £41k. 30 new customers, nothing pending."`
    :
    `State today's business numbers in 1-2 plain sentences. No enthusiasm, no exclamation marks, no "team" language. Just facts.

Data:
- Today: ${ctx.today.orders} orders, £${ctx.today.revenue.toFixed(2)} revenue
- This week so far: ${ctx.week.orders} orders, £${ctx.week.revenue.toFixed(2)}
- Pending orders: ${ctx.pendingOrders}
${showTopAgent ? `- Top sales: ${ctx.topAgent.name} with £${topAgentRevenue.toFixed(2)}` : ''}

Write 1-2 matter-of-fact sentences. Example tone: "12 orders today worth £3.2k. Week's at 45 orders, £18k total."`;

  return prompt;
}

function buildDetailedPrompt(ctx) {
  // Determine primary focus based on today's activity
  const showWeekly = ctx.today.orders < 2;

  // Only show top agent if they have actual revenue
  const topAgentRevenue = parseFloat(ctx.topAgent?.revenue || 0);
  const showTopAgent = ctx.topAgent && ctx.topAgent.name !== 'N/A' && topAgentRevenue > 0;

  return `Write a brief factual business summary. No enthusiasm, no exclamation marks. Plain language.

${showWeekly ? `This week: ${ctx.week.orders} orders, £${ctx.week.revenue.toFixed(2)}` : `Today: ${ctx.today.orders} orders, £${ctx.today.revenue.toFixed(2)}
Week so far: ${ctx.week.orders} orders, £${ctx.week.revenue.toFixed(2)}`}

Pending: ${ctx.pendingOrders}
Low stock items: ${ctx.lowStockCount}
${showTopAgent ? `Top sales: ${ctx.topAgent.name} - £${topAgentRevenue.toFixed(2)}` : ''}

${ctx.recentOrders.length > 0 ? `Recent orders:
${ctx.recentOrders.map(order => `- ${order.customer_name || 'Unknown'}: £${parseFloat(order.total || 0).toFixed(2)}`).join('\n')}` : ''}

Write a straightforward summary in 3-4 sentences. State the numbers, note anything that needs attention (pending orders, low stock). No motivational language.`;
}

export { router as analyticsRouter };
