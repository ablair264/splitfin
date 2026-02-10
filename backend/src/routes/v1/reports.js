import express from 'express';
import ExcelJS from 'exceljs';
import { query } from '../../config/database.js';
import { logger } from '../../utils/logger.js';

const router = express.Router();

// Helper: parse date range from query params
function getDateRange(req) {
  const { start_date, end_date, range = '12_months' } = req.query;

  if (start_date && end_date) {
    return { start: start_date, end: end_date };
  }

  const now = new Date();
  let start;

  switch (range) {
    case '7_days':
      start = new Date(now);
      start.setDate(start.getDate() - 7);
      break;
    case '30_days':
      start = new Date(now);
      start.setDate(start.getDate() - 30);
      break;
    case '90_days':
      start = new Date(now);
      start.setDate(start.getDate() - 90);
      break;
    case 'this_year':
      start = new Date(now.getFullYear(), 0, 1);
      break;
    case 'all_time':
      start = new Date(2000, 0, 1);
      break;
    default: // 12_months
      start = new Date(now);
      start.setFullYear(start.getFullYear() - 1);
  }

  return {
    start: start.toISOString().split('T')[0],
    end: now.toISOString().split('T')[0],
  };
}

// Helper: build optional filter clauses
function buildFilters(req, tableAlias = 'o') {
  const { agent_id, brand, status, region } = req.query;
  const clauses = [];
  const params = [];
  let idx;

  return {
    addTo(existingParams) {
      idx = existingParams.length;
      if (agent_id) {
        idx++;
        clauses.push(`${tableAlias}.salesperson_id = $${idx}`);
        params.push(agent_id);
      }
      if (brand) {
        idx++;
        clauses.push(`p.brand = $${idx}`);
        params.push(brand);
      }
      if (status) {
        idx++;
        clauses.push(`${tableAlias}.status = $${idx}`);
        params.push(status);
      }
      if (region) {
        idx++;
        clauses.push(`c.location_region = $${idx}`);
        params.push(region);
      }
      return {
        where: clauses.length ? ' AND ' + clauses.join(' AND ') : '',
        params: [...existingParams, ...params],
      };
    },
  };
}

// Helper: convert rows to CSV string
function rowsToCsv(rows, columns) {
  if (!rows.length) return columns.join(',') + '\n';
  const header = columns.join(',');
  const body = rows.map(row =>
    columns.map(col => {
      const val = row[col];
      if (val == null) return '';
      const str = String(val);
      return str.includes(',') || str.includes('"') || str.includes('\n')
        ? `"${str.replace(/"/g, '""')}"`
        : str;
    }).join(',')
  ).join('\n');
  return header + '\n' + body + '\n';
}

// Helper: generate xlsx buffer from rows
async function rowsToXlsx(rows, columns, sheetName = 'Report') {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(sheetName);

  // Header row
  sheet.columns = columns.map(col => ({
    header: col.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
    key: col,
    width: Math.max(col.length + 4, 14),
  }));

  // Style header
  sheet.getRow(1).font = { bold: true };
  sheet.getRow(1).fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF1A1A2E' },
  };
  sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };

  // Data rows
  rows.forEach(row => {
    const data = {};
    columns.forEach(col => { data[col] = row[col]; });
    sheet.addRow(data);
  });

  // Auto-format numbers
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    row.eachCell((cell) => {
      if (typeof cell.value === 'number') {
        cell.numFmt = cell.value % 1 === 0 ? '#,##0' : '#,##0.00';
      }
    });
  });

  return workbook.xlsx.writeBuffer();
}

// GET /api/v1/reports/filter-options
router.get('/filter-options', async (req, res) => {
  try {
    const [agentsResult, brandsResult, regionsResult] = await Promise.all([
      query(`
        SELECT id, name FROM agents
        WHERE active = true AND (is_admin = false OR is_admin IS NULL)
        ORDER BY name
      `),
      query(`
        SELECT DISTINCT brand FROM products
        WHERE status = 'active' AND brand IS NOT NULL AND brand != ''
        ORDER BY brand
      `),
      query(`
        SELECT DISTINCT location_region AS region FROM customers
        WHERE location_region IS NOT NULL AND location_region != ''
        ORDER BY location_region
      `),
    ]);

    res.json({
      agents: agentsResult.rows,
      brands: brandsResult.rows.map(r => r.brand),
      regions: regionsResult.rows.map(r => r.region),
      statuses: ['confirmed', 'fulfilled', 'shipped', 'invoiced', 'draft', 'void'],
    });
  } catch (error) {
    logger.error('Filter options failed:', error);
    res.status(500).json({ error: error.message });
  }
});

// GET /api/v1/reports/sales-overview
router.get('/sales-overview', async (req, res) => {
  try {
    const { start, end } = getDateRange(req);
    const { agent_id, brand } = req.query;

    let agentFilter = '';
    let brandFilter = '';
    const baseParams = [start, end];
    let idx = 2;

    if (agent_id) {
      idx++;
      agentFilter = ` AND o.salesperson_id = $${idx}`;
      baseParams.push(agent_id);
    }
    if (brand) {
      idx++;
      brandFilter = ` AND p.brand = $${idx}`;
      baseParams.push(brand);
    }

    // Summary only needs agent filter (no brand join)
    const summaryParams = [start, end];
    let summaryAgentFilter = '';
    if (agent_id) {
      summaryAgentFilter = ` AND salesperson_id = $3`;
      summaryParams.push(agent_id);
    }

    const [summaryResult, trendResult, topProductsResult] = await Promise.all([
      query(`
        SELECT
          COUNT(*) AS total_orders,
          COALESCE(SUM(total), 0) AS total_revenue,
          COALESCE(AVG(total) FILTER (WHERE total > 0), 0) AS avg_order_value,
          COUNT(DISTINCT zoho_customer_id) AS unique_customers
        FROM orders
        WHERE date >= $1 AND date <= $2
          AND status NOT IN ('void', 'draft')${summaryAgentFilter}
      `, summaryParams),

      query(`
        SELECT
          TO_CHAR(DATE_TRUNC('month', date), 'YYYY-MM') AS month,
          COUNT(*) AS order_count,
          COALESCE(SUM(total), 0) AS revenue
        FROM orders o
        WHERE o.date >= $1 AND o.date <= $2
          AND o.status NOT IN ('void', 'draft')${agentFilter}
        GROUP BY DATE_TRUNC('month', o.date)
        ORDER BY month
      `, agent_id ? [start, end, agent_id] : [start, end]),

      query(`
        SELECT
          p.name, p.sku, p.brand,
          SUM(oli.quantity) AS units_sold,
          COALESCE(SUM(oli.amount), 0) AS revenue
        FROM order_line_items oli
        JOIN products p ON p.zoho_item_id = oli.zoho_item_id
        JOIN orders o ON o.id = oli.order_id
        WHERE o.date >= $1 AND o.date <= $2
          AND o.status NOT IN ('void', 'draft')${agentFilter}${brandFilter}
        GROUP BY p.id, p.name, p.sku, p.brand
        ORDER BY revenue DESC
        LIMIT 50
      `, baseParams),
    ]);

    const s = summaryResult.rows[0];
    res.json({
      summary: {
        total_orders: parseInt(s.total_orders) || 0,
        total_revenue: parseFloat(s.total_revenue) || 0,
        avg_order_value: parseFloat(s.avg_order_value) || 0,
        unique_customers: parseInt(s.unique_customers) || 0,
      },
      monthly_trend: trendResult.rows.map(r => ({
        month: r.month,
        order_count: parseInt(r.order_count) || 0,
        revenue: parseFloat(r.revenue) || 0,
      })),
      top_products: topProductsResult.rows.map(r => ({
        name: r.name,
        sku: r.sku,
        brand: r.brand || 'N/A',
        units_sold: parseInt(r.units_sold) || 0,
        revenue: parseFloat(r.revenue) || 0,
      })),
    });
  } catch (error) {
    logger.error('Sales overview report failed:', error);
    res.status(500).json({ error: error.message });
  }
});

// GET /api/v1/reports/agent-performance
router.get('/agent-performance', async (req, res) => {
  try {
    const { start, end } = getDateRange(req);

    const { rows } = await query(`
      SELECT
        a.id, a.name,
        COUNT(o.id) AS order_count,
        COALESCE(SUM(o.total), 0) AS revenue,
        COALESCE(AVG(o.total) FILTER (WHERE o.total > 0), 0) AS avg_order_value,
        COUNT(DISTINCT o.zoho_customer_id) AS customer_count
      FROM agents a
      LEFT JOIN orders o ON (
        o.salesperson_id = a.zoho_id
        OR (o.salesperson_id IS NULL AND LOWER(o.salesperson_name) = LOWER(a.name))
      )
        AND o.date >= $1 AND o.date <= $2
        AND o.status NOT IN ('void', 'draft')
      WHERE a.active = true AND (a.is_admin = false OR a.is_admin IS NULL)
      GROUP BY a.id, a.name
      ORDER BY revenue DESC NULLS LAST
    `, [start, end]);

    res.json({
      agents: rows.map(r => ({
        id: r.id,
        name: r.name || 'Unknown',
        order_count: parseInt(r.order_count) || 0,
        revenue: parseFloat(r.revenue) || 0,
        avg_order_value: parseFloat(r.avg_order_value) || 0,
        customer_count: parseInt(r.customer_count) || 0,
      })),
    });
  } catch (error) {
    logger.error('Agent performance report failed:', error);
    res.status(500).json({ error: error.message });
  }
});

// GET /api/v1/reports/agent-commission
router.get('/agent-commission', async (req, res) => {
  try {
    const { start, end } = getDateRange(req);
    const { agent_id } = req.query;

    let agentFilter = '';
    const params = [start, end];
    if (agent_id) {
      agentFilter = ` AND a.id = $3`;
      params.push(agent_id);
    }

    const { rows } = await query(`
      SELECT
        a.id, a.name,
        COALESCE(a.commission_rate, 0) AS commission_rate,
        COUNT(o.id) AS order_count,
        COALESCE(SUM(o.total), 0) AS revenue,
        COALESCE(AVG(o.total) FILTER (WHERE o.total > 0), 0) AS avg_order_value,
        COUNT(DISTINCT o.zoho_customer_id) AS customer_count,
        COALESCE(SUM(o.total), 0) * COALESCE(a.commission_rate, 0) AS commission_earned
      FROM agents a
      LEFT JOIN orders o ON (
        o.salesperson_id = a.zoho_id
        OR (o.salesperson_id IS NULL AND LOWER(o.salesperson_name) = LOWER(a.name))
      )
        AND o.date >= $1 AND o.date <= $2
        AND o.status NOT IN ('void', 'draft')
      WHERE a.active = true AND (a.is_admin = false OR a.is_admin IS NULL)${agentFilter}
      GROUP BY a.id, a.name, a.commission_rate
      ORDER BY commission_earned DESC NULLS LAST
    `, params);

    const agents = rows.map(r => ({
      id: r.id,
      name: r.name || 'Unknown',
      commission_rate: parseFloat(r.commission_rate) || 0,
      order_count: parseInt(r.order_count) || 0,
      revenue: parseFloat(r.revenue) || 0,
      avg_order_value: parseFloat(r.avg_order_value) || 0,
      customer_count: parseInt(r.customer_count) || 0,
      commission_earned: Math.round(parseFloat(r.commission_earned) || 0),
    }));

    const totals = {
      total_revenue: agents.reduce((s, a) => s + a.revenue, 0),
      total_commission: agents.reduce((s, a) => s + a.commission_earned, 0),
      total_orders: agents.reduce((s, a) => s + a.order_count, 0),
    };

    res.json({ agents, totals });
  } catch (error) {
    logger.error('Agent commission report failed:', error);
    res.status(500).json({ error: error.message });
  }
});

// GET /api/v1/reports/brand-analysis
router.get('/brand-analysis', async (req, res) => {
  try {
    const { start, end } = getDateRange(req);
    const { agent_id } = req.query;

    let agentFilter = '';
    const params = [start, end];
    if (agent_id) {
      agentFilter = ` AND o.salesperson_id = $3`;
      params.push(agent_id);
    }

    const { rows } = await query(`
      SELECT
        p.brand,
        COUNT(DISTINCT o.id) AS order_count,
        SUM(oli.quantity) AS units_sold,
        COALESCE(SUM(oli.amount), 0) AS revenue,
        COALESCE(AVG(oli.rate), 0) AS avg_unit_price
      FROM order_line_items oli
      JOIN products p ON p.zoho_item_id = oli.zoho_item_id
      JOIN orders o ON o.id = oli.order_id
      WHERE o.date >= $1 AND o.date <= $2
        AND o.status NOT IN ('void', 'draft')
        AND p.brand IS NOT NULL AND p.brand != ''${agentFilter}
      GROUP BY p.brand
      ORDER BY revenue DESC
    `, params);

    res.json({
      brands: rows.map(r => ({
        brand: r.brand,
        order_count: parseInt(r.order_count) || 0,
        units_sold: parseInt(r.units_sold) || 0,
        revenue: parseFloat(r.revenue) || 0,
        avg_unit_price: parseFloat(r.avg_unit_price) || 0,
      })),
    });
  } catch (error) {
    logger.error('Brand analysis report failed:', error);
    res.status(500).json({ error: error.message });
  }
});

// GET /api/v1/reports/customer-insights
router.get('/customer-insights', async (req, res) => {
  try {
    const { start, end } = getDateRange(req);
    const { agent_id, region } = req.query;

    let agentFilter = '';
    let regionFilter = '';
    const baseParams = [start, end];
    let idx = 2;

    if (agent_id) {
      idx++;
      agentFilter = ` AND o.salesperson_id = $${idx}`;
      baseParams.push(agent_id);
    }
    if (region) {
      idx++;
      regionFilter = ` AND c.location_region = $${idx}`;
      baseParams.push(region);
    }

    // Segment query uses subquery for orders so filter differently
    const segmentOrderParams = [start, end];
    let segmentAgentFilter = '';
    if (agent_id) {
      segmentAgentFilter = ` AND salesperson_id = $3`;
      segmentOrderParams.push(agent_id);
    }

    const [segmentResult, regionResult, topCustomersResult] = await Promise.all([
      query(`
        SELECT
          COALESCE(c.segment, 'Unclassified') AS segment,
          COUNT(*) AS customer_count,
          COALESCE(SUM(sub.revenue), 0) AS total_revenue,
          COALESCE(AVG(sub.revenue), 0) AS avg_revenue
        FROM customers c
        JOIN (
          SELECT zoho_customer_id, SUM(total) AS revenue
          FROM orders
          WHERE date >= $1 AND date <= $2
            AND status NOT IN ('void', 'draft')${segmentAgentFilter}
          GROUP BY zoho_customer_id
        ) sub ON sub.zoho_customer_id = c.zoho_contact_id
        GROUP BY COALESCE(c.segment, 'Unclassified')
        ORDER BY total_revenue DESC
      `, segmentOrderParams),

      query(`
        SELECT
          c.location_region AS region,
          COUNT(DISTINCT c.id) AS customer_count,
          COALESCE(SUM(o.total), 0) AS revenue,
          COUNT(o.id) AS order_count
        FROM customers c
        JOIN orders o ON o.zoho_customer_id = c.zoho_contact_id
        WHERE o.date >= $1 AND o.date <= $2
          AND o.status NOT IN ('void', 'draft')
          AND c.location_region IS NOT NULL AND c.location_region != ''${agentFilter}
        GROUP BY c.location_region
        ORDER BY revenue DESC
      `, agent_id ? [start, end, agent_id] : [start, end]),

      query(`
        SELECT
          c.company_name, c.location_region AS region, c.segment,
          COUNT(o.id) AS order_count,
          COALESCE(SUM(o.total), 0) AS revenue
        FROM customers c
        JOIN orders o ON o.zoho_customer_id = c.zoho_contact_id
        WHERE o.date >= $1 AND o.date <= $2
          AND o.status NOT IN ('void', 'draft')${agentFilter}${regionFilter}
        GROUP BY c.id, c.company_name, c.location_region, c.segment
        ORDER BY revenue DESC
        LIMIT 50
      `, baseParams),
    ]);

    res.json({
      segments: segmentResult.rows.map(r => ({
        segment: r.segment,
        customer_count: parseInt(r.customer_count) || 0,
        total_revenue: parseFloat(r.total_revenue) || 0,
        avg_revenue: parseFloat(r.avg_revenue) || 0,
      })),
      regions: regionResult.rows.map(r => ({
        region: r.region,
        customer_count: parseInt(r.customer_count) || 0,
        revenue: parseFloat(r.revenue) || 0,
        order_count: parseInt(r.order_count) || 0,
      })),
      top_customers: topCustomersResult.rows.map(r => ({
        company_name: r.company_name,
        region: r.region || 'N/A',
        segment: r.segment || 'N/A',
        order_count: parseInt(r.order_count) || 0,
        revenue: parseFloat(r.revenue) || 0,
      })),
    });
  } catch (error) {
    logger.error('Customer insights report failed:', error);
    res.status(500).json({ error: error.message });
  }
});

// GET /api/v1/reports/inventory-health
router.get('/inventory-health', async (req, res) => {
  try {
    const { brand } = req.query;
    let brandFilter = '';
    const brandParams = [];

    if (brand) {
      brandFilter = ` AND brand = $1`;
      brandParams.push(brand);
    }

    const [summaryResult, brandsResult, slowMoversResult] = await Promise.all([
      query(`
        SELECT
          COUNT(*) FILTER (WHERE status = 'active') AS active_products,
          COUNT(*) FILTER (WHERE stock_on_hand = 0 AND status = 'active') AS out_of_stock,
          COUNT(*) FILTER (WHERE stock_on_hand > 0 AND stock_on_hand <= 5 AND status = 'active') AS low_stock,
          COALESCE(SUM(stock_on_hand * rate) FILTER (WHERE status = 'active'), 0) AS stock_value
        FROM products
        WHERE 1=1${brandFilter}
      `, brandParams),

      query(`
        SELECT
          brand,
          COUNT(*) AS product_count,
          COALESCE(SUM(stock_on_hand), 0) AS total_stock,
          COUNT(*) FILTER (WHERE stock_on_hand = 0) AS out_of_stock,
          COALESCE(SUM(stock_on_hand * rate), 0) AS stock_value
        FROM products
        WHERE status = 'active' AND brand IS NOT NULL AND brand != ''${brandFilter}
        GROUP BY brand
        ORDER BY stock_value DESC
      `, brandParams),

      query(`
        SELECT
          p.name, p.sku, p.brand, p.stock_on_hand, p.rate,
          MAX(o.date) AS last_sold
        FROM products p
        LEFT JOIN order_line_items oli ON p.zoho_item_id = oli.zoho_item_id
        LEFT JOIN orders o ON o.id = oli.order_id
          AND o.status NOT IN ('void', 'draft')
        WHERE p.status = 'active' AND p.stock_on_hand > 0${brand ? ` AND p.brand = $1` : ''}
        GROUP BY p.id, p.name, p.sku, p.brand, p.stock_on_hand, p.rate
        HAVING MAX(o.date) < NOW() - INTERVAL '90 days' OR MAX(o.date) IS NULL
        ORDER BY p.stock_on_hand * p.rate DESC
        LIMIT 50
      `, brandParams),
    ]);

    const s = summaryResult.rows[0];
    res.json({
      summary: {
        active_products: parseInt(s.active_products) || 0,
        out_of_stock: parseInt(s.out_of_stock) || 0,
        low_stock: parseInt(s.low_stock) || 0,
        stock_value: parseFloat(s.stock_value) || 0,
      },
      brands: brandsResult.rows.map(r => ({
        brand: r.brand,
        product_count: parseInt(r.product_count) || 0,
        total_stock: parseInt(r.total_stock) || 0,
        out_of_stock: parseInt(r.out_of_stock) || 0,
        stock_value: parseFloat(r.stock_value) || 0,
      })),
      slow_movers: slowMoversResult.rows.map(r => ({
        name: r.name,
        sku: r.sku,
        brand: r.brand || 'N/A',
        stock_on_hand: parseInt(r.stock_on_hand) || 0,
        rate: parseFloat(r.rate) || 0,
        last_sold: r.last_sold ? new Date(r.last_sold).toISOString().split('T')[0] : null,
      })),
    });
  } catch (error) {
    logger.error('Inventory health report failed:', error);
    res.status(500).json({ error: error.message });
  }
});

// GET /api/v1/reports/financial
router.get('/financial', async (req, res) => {
  try {
    const { start, end } = getDateRange(req);
    const { status: invoiceStatus } = req.query;

    let statusFilter = '';
    const summaryParams = [start, end];
    if (invoiceStatus) {
      statusFilter = ` AND status = $3`;
      summaryParams.push(invoiceStatus);
    }

    const [summaryResult, ageingResult] = await Promise.all([
      query(`
        SELECT
          COUNT(*) AS total_invoices,
          COALESCE(SUM(total), 0) AS total_invoiced,
          COALESCE(SUM(balance), 0) AS total_outstanding,
          COUNT(*) FILTER (WHERE status = 'overdue') AS overdue_count,
          COALESCE(SUM(balance) FILTER (WHERE status = 'overdue'), 0) AS overdue_amount
        FROM invoices
        WHERE invoice_date >= $1 AND invoice_date <= $2${statusFilter}
      `, summaryParams),

      query(`
        SELECT bucket, invoice_count, amount FROM (
          SELECT
            CASE
              WHEN due_date IS NULL THEN '90+ days'
              WHEN due_date >= CURRENT_DATE THEN 'Current'
              WHEN due_date >= CURRENT_DATE - 30 THEN '1-30 days'
              WHEN due_date >= CURRENT_DATE - 60 THEN '31-60 days'
              WHEN due_date >= CURRENT_DATE - 90 THEN '61-90 days'
              ELSE '90+ days'
            END AS bucket,
            CASE
              WHEN due_date IS NULL THEN 5
              WHEN due_date >= CURRENT_DATE THEN 1
              WHEN due_date >= CURRENT_DATE - 30 THEN 2
              WHEN due_date >= CURRENT_DATE - 60 THEN 3
              WHEN due_date >= CURRENT_DATE - 90 THEN 4
              ELSE 5
            END AS sort_order,
            COUNT(*) AS invoice_count,
            COALESCE(SUM(balance), 0) AS amount
          FROM invoices
          WHERE balance > 0
          GROUP BY 1, 2
        ) sub
        ORDER BY sort_order
      `),
    ]);

    const s = summaryResult.rows[0];
    res.json({
      summary: {
        total_invoices: parseInt(s.total_invoices) || 0,
        total_invoiced: parseFloat(s.total_invoiced) || 0,
        total_outstanding: parseFloat(s.total_outstanding) || 0,
        overdue_count: parseInt(s.overdue_count) || 0,
        overdue_amount: parseFloat(s.overdue_amount) || 0,
      },
      ageing: ageingResult.rows.map(r => ({
        bucket: r.bucket,
        invoice_count: parseInt(r.invoice_count) || 0,
        amount: parseFloat(r.amount) || 0,
      })),
    });
  } catch (error) {
    logger.error('Financial report failed:', error);
    res.status(500).json({ error: error.message });
  }
});

// GET /api/v1/reports/export/:report — CSV or XLSX download
router.get('/export/:report', async (req, res) => {
  try {
    const { report } = req.params;
    const { format = 'csv' } = req.query;
    const { start, end } = getDateRange(req);
    let rows = [];
    let columns = [];
    let filename = '';
    let sheetName = '';

    switch (report) {
      case 'sales-overview': {
        const result = await query(`
          SELECT p.name, p.sku, p.brand, SUM(oli.quantity) AS units_sold,
            COALESCE(SUM(oli.amount), 0) AS revenue
          FROM order_line_items oli
          JOIN products p ON p.zoho_item_id = oli.zoho_item_id
          JOIN orders o ON o.id = oli.order_id
          WHERE o.date >= $1 AND o.date <= $2 AND o.status NOT IN ('void','draft')
          GROUP BY p.id, p.name, p.sku, p.brand ORDER BY revenue DESC LIMIT 500
        `, [start, end]);
        rows = result.rows;
        columns = ['name', 'sku', 'brand', 'units_sold', 'revenue'];
        filename = 'sales-overview';
        sheetName = 'Sales Overview';
        break;
      }
      case 'agent-performance': {
        const result = await query(`
          SELECT a.name, COUNT(o.id) AS order_count,
            COALESCE(SUM(o.total), 0) AS revenue,
            COALESCE(AVG(o.total) FILTER (WHERE o.total > 0), 0) AS avg_order_value,
            COUNT(DISTINCT o.zoho_customer_id) AS customer_count
          FROM agents a LEFT JOIN orders o ON (
            o.salesperson_id = a.zoho_id
            OR (o.salesperson_id IS NULL AND LOWER(o.salesperson_name) = LOWER(a.name))
          ) AND o.date >= $1 AND o.date <= $2 AND o.status NOT IN ('void','draft')
          WHERE a.active = true AND (a.is_admin = false OR a.is_admin IS NULL)
          GROUP BY a.id, a.name ORDER BY revenue DESC NULLS LAST
        `, [start, end]);
        rows = result.rows;
        columns = ['name', 'order_count', 'revenue', 'avg_order_value', 'customer_count'];
        filename = 'agent-performance';
        sheetName = 'Agent Performance';
        break;
      }
      case 'agent-commission': {
        const { agent_id: exportAgentId } = req.query;

        if (exportAgentId) {
          // Per-agent detailed export: individual orders with commission
          const agentRes = await query(
            'SELECT id, name, zoho_id, COALESCE(commission_rate, 0) AS commission_rate FROM agents WHERE id = $1',
            [exportAgentId]
          );
          if (!agentRes.rows.length) return res.status(404).json({ error: 'Agent not found' });
          const agent = agentRes.rows[0];
          const rate = parseFloat(agent.commission_rate) || 0;

          const result = await query(`
            SELECT
              o.zoho_salesorder_number AS order_number,
              o.date::text AS order_date,
              c.company_name AS customer,
              COALESCE(o.total, 0) AS order_total,
              ROUND(COALESCE(o.total, 0) * $3, 2) AS commission_earned
            FROM orders o
            LEFT JOIN customers c ON c.zoho_contact_id = o.zoho_customer_id
            WHERE o.date >= $1 AND o.date <= $2
              AND o.status NOT IN ('void', 'draft')
              AND (
                o.salesperson_id = $4
                OR (o.salesperson_id IS NULL AND LOWER(o.salesperson_name) = LOWER($5))
              )
            ORDER BY o.date DESC
          `, [start, end, rate, agent.zoho_id || '__NO_MATCH__', agent.name]);

          rows = result.rows;
          columns = ['order_number', 'order_date', 'customer', 'order_total', 'commission_earned'];
          filename = `commission-${agent.name.toLowerCase().replace(/\s+/g, '-')}`;
          sheetName = `${agent.name} Commission`;
        } else {
          // Summary export: all agents
          const result = await query(`
            SELECT a.name,
              COALESCE(a.commission_rate, 0) AS commission_rate,
              COUNT(o.id) AS order_count,
              COALESCE(SUM(o.total), 0) AS revenue,
              COALESCE(SUM(o.total), 0) * COALESCE(a.commission_rate, 0) AS commission_earned,
              COUNT(DISTINCT o.zoho_customer_id) AS customer_count
            FROM agents a LEFT JOIN orders o ON (
              o.salesperson_id = a.zoho_id
              OR (o.salesperson_id IS NULL AND LOWER(o.salesperson_name) = LOWER(a.name))
            ) AND o.date >= $1 AND o.date <= $2 AND o.status NOT IN ('void','draft')
            WHERE a.active = true AND (a.is_admin = false OR a.is_admin IS NULL)
            GROUP BY a.id, a.name, a.commission_rate ORDER BY commission_earned DESC NULLS LAST
          `, [start, end]);
          rows = result.rows;
          columns = ['name', 'commission_rate', 'order_count', 'revenue', 'commission_earned', 'customer_count'];
          filename = 'agent-commission';
          sheetName = 'Agent Commission';
        }
        break;
      }
      case 'brand-analysis': {
        const result = await query(`
          SELECT p.brand, COUNT(DISTINCT o.id) AS order_count,
            SUM(oli.quantity) AS units_sold, COALESCE(SUM(oli.amount), 0) AS revenue,
            COALESCE(AVG(oli.rate), 0) AS avg_unit_price
          FROM order_line_items oli
          JOIN products p ON p.zoho_item_id = oli.zoho_item_id
          JOIN orders o ON o.id = oli.order_id
          WHERE o.date >= $1 AND o.date <= $2 AND o.status NOT IN ('void','draft')
            AND p.brand IS NOT NULL AND p.brand != ''
          GROUP BY p.brand ORDER BY revenue DESC
        `, [start, end]);
        rows = result.rows;
        columns = ['brand', 'order_count', 'units_sold', 'revenue', 'avg_unit_price'];
        filename = 'brand-analysis';
        sheetName = 'Brand Analysis';
        break;
      }
      case 'customer-insights': {
        const result = await query(`
          SELECT c.company_name, c.location_region AS region, c.segment,
            COUNT(o.id) AS order_count, COALESCE(SUM(o.total), 0) AS revenue
          FROM customers c JOIN orders o ON o.zoho_customer_id = c.zoho_contact_id
          WHERE o.date >= $1 AND o.date <= $2 AND o.status NOT IN ('void','draft')
          GROUP BY c.id, c.company_name, c.location_region, c.segment
          ORDER BY revenue DESC LIMIT 500
        `, [start, end]);
        rows = result.rows;
        columns = ['company_name', 'region', 'segment', 'order_count', 'revenue'];
        filename = 'customer-insights';
        sheetName = 'Customer Insights';
        break;
      }
      case 'inventory-health': {
        const result = await query(`
          SELECT p.name, p.sku, p.brand, p.stock_on_hand, p.rate,
            MAX(o.date) AS last_sold
          FROM products p
          LEFT JOIN order_line_items oli ON p.zoho_item_id = oli.zoho_item_id
          LEFT JOIN orders o ON o.id = oli.order_id AND o.status NOT IN ('void','draft')
          WHERE p.status = 'active' AND p.stock_on_hand > 0
          GROUP BY p.id, p.name, p.sku, p.brand, p.stock_on_hand, p.rate
          HAVING MAX(o.date) < NOW() - INTERVAL '90 days' OR MAX(o.date) IS NULL
          ORDER BY p.stock_on_hand * p.rate DESC LIMIT 500
        `);
        rows = result.rows;
        columns = ['name', 'sku', 'brand', 'stock_on_hand', 'rate', 'last_sold'];
        filename = 'inventory-health';
        sheetName = 'Inventory Health';
        break;
      }
      case 'financial': {
        const result = await query(`
          SELECT bucket, invoice_count, amount FROM (
            SELECT
              CASE
                WHEN due_date IS NULL THEN '90+ days'
                WHEN due_date >= CURRENT_DATE THEN 'Current'
                WHEN due_date >= CURRENT_DATE - 30 THEN '1-30 days'
                WHEN due_date >= CURRENT_DATE - 60 THEN '31-60 days'
                WHEN due_date >= CURRENT_DATE - 90 THEN '61-90 days'
                ELSE '90+ days'
              END AS bucket,
              CASE
                WHEN due_date IS NULL THEN 5
                WHEN due_date >= CURRENT_DATE THEN 1
                WHEN due_date >= CURRENT_DATE - 30 THEN 2
                WHEN due_date >= CURRENT_DATE - 60 THEN 3
                WHEN due_date >= CURRENT_DATE - 90 THEN 4
                ELSE 5
              END AS sort_order,
              COUNT(*) AS invoice_count,
              COALESCE(SUM(balance), 0) AS amount
            FROM invoices WHERE balance > 0
            GROUP BY 1, 2
          ) sub ORDER BY sort_order
        `);
        rows = result.rows;
        columns = ['bucket', 'invoice_count', 'amount'];
        filename = 'financial-ageing';
        sheetName = 'Financial Ageing';
        break;
      }
      default:
        return res.status(400).json({ error: 'Unknown report type' });
    }

    const dateStr = new Date().toISOString().split('T')[0];

    if (format === 'xlsx') {
      const buffer = await rowsToXlsx(rows, columns, sheetName);
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}-${dateStr}.xlsx"`);
      res.send(Buffer.from(buffer));
    } else {
      const csv = rowsToCsv(rows, columns);
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}-${dateStr}.csv"`);
      res.send(csv);
    }
  } catch (error) {
    logger.error('Export failed:', error);
    res.status(500).json({ error: error.message });
  }
});

export { router as reportsRouter };
