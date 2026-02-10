import express from 'express';
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

// GET /api/v1/reports/sales-overview
router.get('/sales-overview', async (req, res) => {
  try {
    const { start, end } = getDateRange(req);

    const [summaryResult, trendResult, topProductsResult] = await Promise.all([
      query(`
        SELECT
          COUNT(*) AS total_orders,
          COALESCE(SUM(total), 0) AS total_revenue,
          COALESCE(AVG(total) FILTER (WHERE total > 0), 0) AS avg_order_value,
          COUNT(DISTINCT zoho_customer_id) AS unique_customers
        FROM orders
        WHERE date >= $1 AND date <= $2
          AND status NOT IN ('void', 'draft')
      `, [start, end]),

      query(`
        SELECT
          TO_CHAR(DATE_TRUNC('month', date), 'YYYY-MM') AS month,
          COUNT(*) AS order_count,
          COALESCE(SUM(total), 0) AS revenue
        FROM orders
        WHERE date >= $1 AND date <= $2
          AND status NOT IN ('void', 'draft')
        GROUP BY DATE_TRUNC('month', date)
        ORDER BY month
      `, [start, end]),

      query(`
        SELECT
          p.name, p.sku, p.brand,
          SUM(oli.quantity) AS units_sold,
          COALESCE(SUM(oli.amount), 0) AS revenue
        FROM order_line_items oli
        JOIN products p ON p.zoho_item_id = oli.zoho_item_id
        JOIN orders o ON o.id = oli.order_id
        WHERE o.date >= $1 AND o.date <= $2
          AND o.status NOT IN ('void', 'draft')
        GROUP BY p.id, p.name, p.sku, p.brand
        ORDER BY revenue DESC
        LIMIT 50
      `, [start, end]),
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

// GET /api/v1/reports/brand-analysis
router.get('/brand-analysis', async (req, res) => {
  try {
    const { start, end } = getDateRange(req);

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
        AND p.brand IS NOT NULL AND p.brand != ''
      GROUP BY p.brand
      ORDER BY revenue DESC
    `, [start, end]);

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

    const [segmentResult, regionResult, topCustomersResult] = await Promise.all([
      query(`
        SELECT
          c.segment,
          COUNT(*) AS customer_count,
          COALESCE(SUM(sub.revenue), 0) AS total_revenue,
          COALESCE(AVG(sub.revenue), 0) AS avg_revenue
        FROM customers c
        JOIN (
          SELECT zoho_customer_id, SUM(total) AS revenue
          FROM orders
          WHERE date >= $1 AND date <= $2
            AND status NOT IN ('void', 'draft')
          GROUP BY zoho_customer_id
        ) sub ON sub.zoho_customer_id = c.zoho_contact_id
        WHERE c.segment IS NOT NULL
        GROUP BY c.segment
        ORDER BY total_revenue DESC
      `, [start, end]),

      query(`
        SELECT
          c.region,
          COUNT(DISTINCT c.id) AS customer_count,
          COALESCE(SUM(o.total), 0) AS revenue,
          COUNT(o.id) AS order_count
        FROM customers c
        JOIN orders o ON o.zoho_customer_id = c.zoho_contact_id
        WHERE o.date >= $1 AND o.date <= $2
          AND o.status NOT IN ('void', 'draft')
          AND c.region IS NOT NULL AND c.region != ''
        GROUP BY c.region
        ORDER BY revenue DESC
      `, [start, end]),

      query(`
        SELECT
          c.company_name, c.region, c.segment,
          COUNT(o.id) AS order_count,
          COALESCE(SUM(o.total), 0) AS revenue
        FROM customers c
        JOIN orders o ON o.zoho_customer_id = c.zoho_contact_id
        WHERE o.date >= $1 AND o.date <= $2
          AND o.status NOT IN ('void', 'draft')
        GROUP BY c.id, c.company_name, c.region, c.segment
        ORDER BY revenue DESC
        LIMIT 50
      `, [start, end]),
    ]);

    res.json({
      segments: segmentResult.rows.map(r => ({
        segment: r.segment || 'Unclassified',
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
    const [summaryResult, brandsResult, slowMoversResult] = await Promise.all([
      query(`
        SELECT
          COUNT(*) FILTER (WHERE active = true) AS active_products,
          COUNT(*) FILTER (WHERE stock_on_hand = 0 AND active = true) AS out_of_stock,
          COUNT(*) FILTER (WHERE stock_on_hand > 0 AND stock_on_hand <= 5 AND active = true) AS low_stock,
          COALESCE(SUM(stock_on_hand * rate) FILTER (WHERE active = true), 0) AS stock_value
        FROM products
      `),

      query(`
        SELECT
          brand,
          COUNT(*) AS product_count,
          COALESCE(SUM(stock_on_hand), 0) AS total_stock,
          COUNT(*) FILTER (WHERE stock_on_hand = 0) AS out_of_stock,
          COALESCE(SUM(stock_on_hand * rate), 0) AS stock_value
        FROM products
        WHERE active = true AND brand IS NOT NULL AND brand != ''
        GROUP BY brand
        ORDER BY stock_value DESC
      `),

      query(`
        SELECT
          p.name, p.sku, p.brand, p.stock_on_hand, p.rate,
          MAX(o.date) AS last_sold
        FROM products p
        LEFT JOIN order_line_items oli ON p.zoho_item_id = oli.zoho_item_id
        LEFT JOIN orders o ON o.id = oli.order_id
          AND o.status NOT IN ('void', 'draft')
        WHERE p.active = true AND p.stock_on_hand > 0
        GROUP BY p.id, p.name, p.sku, p.brand, p.stock_on_hand, p.rate
        HAVING MAX(o.date) < NOW() - INTERVAL '90 days' OR MAX(o.date) IS NULL
        ORDER BY p.stock_on_hand * p.rate DESC
        LIMIT 50
      `),
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
        last_sold: r.last_sold ? r.last_sold.toISOString().split('T')[0] : null,
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

    const [summaryResult, ageingResult] = await Promise.all([
      query(`
        SELECT
          COUNT(*) AS total_invoices,
          COALESCE(SUM(total), 0) AS total_invoiced,
          COALESCE(SUM(balance), 0) AS total_outstanding,
          COUNT(*) FILTER (WHERE status = 'overdue') AS overdue_count,
          COALESCE(SUM(balance) FILTER (WHERE status = 'overdue'), 0) AS overdue_amount
        FROM invoices
        WHERE created_at >= $1 AND created_at <= $2
      `, [start, end]),

      query(`
        SELECT
          CASE
            WHEN due_date >= CURRENT_DATE THEN 'Current'
            WHEN due_date >= CURRENT_DATE - 30 THEN '1-30 days'
            WHEN due_date >= CURRENT_DATE - 60 THEN '31-60 days'
            WHEN due_date >= CURRENT_DATE - 90 THEN '61-90 days'
            ELSE '90+ days'
          END AS bucket,
          COUNT(*) AS invoice_count,
          COALESCE(SUM(balance), 0) AS amount
        FROM invoices
        WHERE balance > 0
        GROUP BY bucket
        ORDER BY
          CASE bucket
            WHEN 'Current' THEN 1
            WHEN '1-30 days' THEN 2
            WHEN '31-60 days' THEN 3
            WHEN '61-90 days' THEN 4
            ELSE 5
          END
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

// GET /api/v1/reports/export/:report — CSV download
router.get('/export/:report', async (req, res) => {
  try {
    const { report } = req.params;
    const { start, end } = getDateRange(req);
    let csv = '';
    let filename = '';

    switch (report) {
      case 'sales-overview': {
        const { rows } = await query(`
          SELECT p.name, p.sku, p.brand, SUM(oli.quantity) AS units_sold,
            COALESCE(SUM(oli.amount), 0) AS revenue
          FROM order_line_items oli
          JOIN products p ON p.zoho_item_id = oli.zoho_item_id
          JOIN orders o ON o.id = oli.order_id
          WHERE o.date >= $1 AND o.date <= $2 AND o.status NOT IN ('void','draft')
          GROUP BY p.id, p.name, p.sku, p.brand ORDER BY revenue DESC LIMIT 200
        `, [start, end]);
        csv = rowsToCsv(rows, ['name', 'sku', 'brand', 'units_sold', 'revenue']);
        filename = 'sales-overview';
        break;
      }
      case 'agent-performance': {
        const { rows } = await query(`
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
        csv = rowsToCsv(rows, ['name', 'order_count', 'revenue', 'avg_order_value', 'customer_count']);
        filename = 'agent-performance';
        break;
      }
      case 'brand-analysis': {
        const { rows } = await query(`
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
        csv = rowsToCsv(rows, ['brand', 'order_count', 'units_sold', 'revenue', 'avg_unit_price']);
        filename = 'brand-analysis';
        break;
      }
      case 'customer-insights': {
        const { rows } = await query(`
          SELECT c.company_name, c.region, c.segment,
            COUNT(o.id) AS order_count, COALESCE(SUM(o.total), 0) AS revenue
          FROM customers c JOIN orders o ON o.zoho_customer_id = c.zoho_contact_id
          WHERE o.date >= $1 AND o.date <= $2 AND o.status NOT IN ('void','draft')
          GROUP BY c.id, c.company_name, c.region, c.segment
          ORDER BY revenue DESC LIMIT 200
        `, [start, end]);
        csv = rowsToCsv(rows, ['company_name', 'region', 'segment', 'order_count', 'revenue']);
        filename = 'customer-insights';
        break;
      }
      case 'inventory-health': {
        const { rows } = await query(`
          SELECT p.name, p.sku, p.brand, p.stock_on_hand, p.rate,
            MAX(o.date) AS last_sold
          FROM products p
          LEFT JOIN order_line_items oli ON p.zoho_item_id = oli.zoho_item_id
          LEFT JOIN orders o ON o.id = oli.order_id AND o.status NOT IN ('void','draft')
          WHERE p.active = true AND p.stock_on_hand > 0
          GROUP BY p.id, p.name, p.sku, p.brand, p.stock_on_hand, p.rate
          HAVING MAX(o.date) < NOW() - INTERVAL '90 days' OR MAX(o.date) IS NULL
          ORDER BY p.stock_on_hand * p.rate DESC LIMIT 200
        `);
        csv = rowsToCsv(rows, ['name', 'sku', 'brand', 'stock_on_hand', 'rate', 'last_sold']);
        filename = 'inventory-health';
        break;
      }
      case 'financial': {
        const { rows } = await query(`
          SELECT
            CASE
              WHEN due_date >= CURRENT_DATE THEN 'Current'
              WHEN due_date >= CURRENT_DATE - 30 THEN '1-30 days'
              WHEN due_date >= CURRENT_DATE - 60 THEN '31-60 days'
              WHEN due_date >= CURRENT_DATE - 90 THEN '61-90 days'
              ELSE '90+ days'
            END AS bucket,
            COUNT(*) AS invoice_count,
            COALESCE(SUM(balance), 0) AS amount
          FROM invoices WHERE balance > 0
          GROUP BY bucket ORDER BY CASE bucket
            WHEN 'Current' THEN 1 WHEN '1-30 days' THEN 2
            WHEN '31-60 days' THEN 3 WHEN '61-90 days' THEN 4 ELSE 5 END
        `);
        csv = rowsToCsv(rows, ['bucket', 'invoice_count', 'amount']);
        filename = 'financial-ageing';
        break;
      }
      default:
        return res.status(400).json({ error: 'Unknown report type' });
    }

    const dateStr = new Date().toISOString().split('T')[0];
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}-${dateStr}.csv"`);
    res.send(csv);
  } catch (error) {
    logger.error('CSV export failed:', error);
    res.status(500).json({ error: error.message });
  }
});

export { router as reportsRouter };
