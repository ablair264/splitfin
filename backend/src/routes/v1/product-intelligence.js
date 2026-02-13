import express from 'express';
import { query } from '../../config/database.js';
import { logger } from '../../utils/logger.js';

const router = express.Router();

// Only surface these brands in intelligence data
const ALLOWED_BRANDS = ['Relaxound', 'Remember', 'Ideas 4 Seasons', 'My Flame Lifestyle', 'ppd PAPERPRODUCTS DESIGN GmbH'];

// ── Date range helpers ───────────────────────────────────────

function dateFromRange(range) {
  const now = new Date();
  switch (range) {
    case '30d': return new Date(now - 30 * 86400000).toISOString();
    case '90d': return new Date(now - 90 * 86400000).toISOString();
    case '6m':  return new Date(now - 180 * 86400000).toISOString();
    case '12m': return new Date(now - 365 * 86400000).toISOString();
    case 'all': return '2000-01-01';
    default:    return new Date(now - 90 * 86400000).toISOString();
  }
}

// Sort whitelist
const POPULARITY_SORT = {
  unique_customers: 'pt.unique_customers',
  total_orders: 'pt.total_orders',
  total_quantity: 'pt.total_quantity',
  total_revenue: 'pt.total_revenue',
  trend: 'COALESCE(r.qty, 0)',
  stock_on_hand: 'p.stock_on_hand',
  name: 'p.name',
};

// ── GET /popularity ──────────────────────────────────────────

router.get('/popularity', async (req, res) => {
  try {
    const {
      date_range = '90d',
      brand,
      min_orders = 2,
      sort_by = 'unique_customers',
      sort_order = 'desc',
      limit = 50,
      offset = 0,
      website_only,
      website_not_live,
    } = req.query;

    const dateFrom = dateFromRange(date_range);
    const minOrd = parseInt(min_orders) || 2;
    const lim = Math.min(parseInt(limit) || 50, 200);
    const off = parseInt(offset) || 0;
    const col = POPULARITY_SORT[sort_by] || 'pt.unique_customers';
    const dir = sort_order === 'asc' ? 'ASC' : 'DESC';

    // Build dynamic WHERE conditions after the CTEs
    const conditions = [`pt.total_orders >= $1`];
    const params = [minOrd];
    let idx = 2;

    // Date param for CTEs
    params.push(dateFrom); // $2
    idx++;

    // Always restrict to allowed brands
    conditions.push(`p.brand = ANY($${idx++}::text[])`);
    params.push(ALLOWED_BRANDS);

    if (brand) {
      const brands = brand.split(',').map(s => s.trim()).filter(Boolean);
      if (brands.length === 1) {
        conditions.push(`p.brand = $${idx++}`);
        params.push(brands[0]);
      } else if (brands.length > 1) {
        conditions.push(`p.brand = ANY($${idx++}::text[])`);
        params.push(brands);
      }
    }

    if (website_only === 'true') {
      conditions.push('wp.id IS NOT NULL AND wp.is_active = true');
    } else if (website_not_live === 'true') {
      conditions.push('(wp.id IS NULL OR wp.is_active = false)');
    }

    const where = conditions.join(' AND ');

    const sql = `
      WITH sales AS (
        SELECT
          oli.zoho_item_id,
          o.zoho_customer_id,
          o.customer_name,
          SUM(oli.quantity) AS qty,
          SUM(oli.amount) AS revenue,
          COUNT(DISTINCT o.id) AS order_count
        FROM order_line_items oli
        JOIN orders o ON o.id = oli.order_id
        WHERE o.date >= $2
          AND o.status NOT IN ('cancelled', 'void')
        GROUP BY oli.zoho_item_id, o.zoho_customer_id, o.customer_name
      ),
      product_totals AS (
        SELECT
          zoho_item_id,
          COUNT(DISTINCT zoho_customer_id) AS unique_customers,
          SUM(order_count)::int AS total_orders,
          SUM(qty)::int AS total_quantity,
          ROUND(SUM(revenue)::numeric, 2) AS total_revenue,
          ROUND(SUM(qty)::numeric / NULLIF(SUM(order_count), 0), 1) AS avg_qty_per_order,
          ROUND(MAX(qty)::numeric / NULLIF(SUM(qty), 0) * 100, 1) AS max_customer_share,
          (ARRAY_AGG(customer_name ORDER BY qty DESC))[1] AS top_customer_name
        FROM sales
        GROUP BY zoho_item_id
      ),
      recent AS (
        SELECT oli.zoho_item_id, SUM(oli.quantity)::int AS qty
        FROM order_line_items oli
        JOIN orders o ON o.id = oli.order_id
        WHERE o.date >= NOW() - INTERVAL '30 days'
          AND o.status NOT IN ('cancelled', 'void')
        GROUP BY oli.zoho_item_id
      ),
      previous AS (
        SELECT oli.zoho_item_id, SUM(oli.quantity)::int AS qty
        FROM order_line_items oli
        JOIN orders o ON o.id = oli.order_id
        WHERE o.date >= NOW() - INTERVAL '60 days'
          AND o.date < NOW() - INTERVAL '30 days'
          AND o.status NOT IN ('cancelled', 'void')
        GROUP BY oli.zoho_item_id
      )
      SELECT
        pt.unique_customers, pt.total_orders, pt.total_quantity,
        pt.total_revenue, pt.avg_qty_per_order, pt.max_customer_share,
        pt.top_customer_name,
        p.id AS product_id, p.name, p.sku, p.brand,
        p.stock_on_hand, p.rate AS wholesale_price, p.image_url,
        wp.id AS website_product_id,
        COALESCE(wp.is_active, false) AS on_website,
        wp.badge, wp.retail_price,
        COALESCE(r.qty, 0) AS recent_qty,
        COALESCE(prev.qty, 0) AS previous_qty
      FROM product_totals pt
      JOIN products p ON p.zoho_item_id = pt.zoho_item_id
      LEFT JOIN website_products wp ON wp.product_id = p.id
      LEFT JOIN recent r ON r.zoho_item_id = pt.zoho_item_id
      LEFT JOIN previous prev ON prev.zoho_item_id = pt.zoho_item_id
      WHERE ${where}
      ORDER BY ${col} ${dir} NULLS LAST, p.id ASC
    `;

    // Count query (same CTEs, just count)
    const countSql = `
      WITH sales AS (
        SELECT
          oli.zoho_item_id,
          o.zoho_customer_id,
          o.customer_name,
          SUM(oli.quantity) AS qty,
          SUM(oli.amount) AS revenue,
          COUNT(DISTINCT o.id) AS order_count
        FROM order_line_items oli
        JOIN orders o ON o.id = oli.order_id
        WHERE o.date >= $2
          AND o.status NOT IN ('cancelled', 'void')
        GROUP BY oli.zoho_item_id, o.zoho_customer_id, o.customer_name
      ),
      product_totals AS (
        SELECT
          zoho_item_id,
          COUNT(DISTINCT zoho_customer_id) AS unique_customers,
          SUM(order_count)::int AS total_orders,
          SUM(qty)::int AS total_quantity,
          ROUND(SUM(revenue)::numeric, 2) AS total_revenue,
          ROUND(SUM(qty)::numeric / NULLIF(SUM(order_count), 0), 1) AS avg_qty_per_order,
          ROUND(MAX(qty)::numeric / NULLIF(SUM(qty), 0) * 100, 1) AS max_customer_share,
          (ARRAY_AGG(customer_name ORDER BY qty DESC))[1] AS top_customer_name
        FROM sales
        GROUP BY zoho_item_id
      ),
      recent AS (
        SELECT oli.zoho_item_id, SUM(oli.quantity)::int AS qty
        FROM order_line_items oli JOIN orders o ON o.id = oli.order_id
        WHERE o.date >= NOW() - INTERVAL '30 days' AND o.status NOT IN ('cancelled', 'void')
        GROUP BY oli.zoho_item_id
      ),
      previous AS (
        SELECT oli.zoho_item_id, SUM(oli.quantity)::int AS qty
        FROM order_line_items oli JOIN orders o ON o.id = oli.order_id
        WHERE o.date >= NOW() - INTERVAL '60 days' AND o.date < NOW() - INTERVAL '30 days'
          AND o.status NOT IN ('cancelled', 'void')
        GROUP BY oli.zoho_item_id
      )
      SELECT COUNT(*) AS total
      FROM product_totals pt
      JOIN products p ON p.zoho_item_id = pt.zoho_item_id
      LEFT JOIN website_products wp ON wp.product_id = p.id
      LEFT JOIN recent r ON r.zoho_item_id = pt.zoho_item_id
      LEFT JOIN previous prev ON prev.zoho_item_id = pt.zoho_item_id
      WHERE ${where}
    `;

    const dataParams = [...params, lim, off];
    const dataSql = sql + ` LIMIT $${idx++} OFFSET $${idx++}`;

    const [countResult, dataResult] = await Promise.all([
      query(countSql, params),
      query(dataSql, dataParams),
    ]);

    const total = parseInt(countResult.rows[0].total);

    // Compute trend and skew flags in JS
    const data = dataResult.rows.map(row => {
      const recent = parseInt(row.recent_qty) || 0;
      const prev = parseInt(row.previous_qty) || 0;
      let trend = 'stable';
      if (prev === 0 && recent > 0) trend = 'new';
      else if (prev > 0 && recent / prev > 1.2) trend = 'up';
      else if (prev > 0 && recent / prev < 0.8) trend = 'down';

      return {
        product_id: row.product_id,
        name: row.name,
        sku: row.sku,
        brand: row.brand,
        image_url: row.image_url,
        stock_on_hand: parseInt(row.stock_on_hand) || 0,
        wholesale_price: parseFloat(row.wholesale_price) || 0,
        unique_customers: parseInt(row.unique_customers) || 0,
        total_orders: parseInt(row.total_orders) || 0,
        total_quantity: parseInt(row.total_quantity) || 0,
        total_revenue: parseFloat(row.total_revenue) || 0,
        avg_qty_per_order: parseFloat(row.avg_qty_per_order) || 0,
        max_customer_share: parseFloat(row.max_customer_share) || 0,
        top_customer_name: row.top_customer_name || 'Unknown',
        is_skewed: parseFloat(row.max_customer_share) > 40,
        recent_qty: recent,
        previous_qty: prev,
        trend,
        on_website: row.on_website === true,
        website_product_id: row.website_product_id ? parseInt(row.website_product_id) : null,
        badge: row.badge || null,
        retail_price: row.retail_price ? parseFloat(row.retail_price) : null,
      };
    });

    res.json({
      data,
      count: data.length,
      meta: { total, limit: lim, offset: off, has_more: off + lim < total },
    });
  } catch (err) {
    logger.error('[ProductIntelligence] Popularity error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── GET /reorder-alerts ──────────────────────────────────────

router.get('/reorder-alerts', async (req, res) => {
  try {
    const { threshold = 10, limit = 50, offset = 0 } = req.query;
    const thresh = parseInt(threshold) || 10;
    const lim = Math.min(parseInt(limit) || 50, 200);
    const off = parseInt(offset) || 0;

    const sql = `
      WITH velocity AS (
        SELECT oli.zoho_item_id, SUM(oli.quantity)::int AS qty_30d
        FROM order_line_items oli
        JOIN orders o ON o.id = oli.order_id
        WHERE o.date >= NOW() - INTERVAL '30 days'
          AND o.status NOT IN ('cancelled', 'void')
        GROUP BY oli.zoho_item_id
      )
      SELECT
        p.id AS product_id, p.name, p.sku, p.brand,
        p.stock_on_hand, p.image_url,
        wp.id AS website_product_id, wp.retail_price, wp.badge, wp.is_active,
        COALESCE(v.qty_30d, 0) AS sold_last_30d,
        ROUND(COALESCE(v.qty_30d, 0) / 30.0, 2) AS daily_velocity,
        CASE
          WHEN COALESCE(v.qty_30d, 0) = 0 THEN NULL
          ELSE ROUND(p.stock_on_hand / (v.qty_30d / 30.0))
        END AS days_remaining
      FROM website_products wp
      JOIN products p ON p.id = wp.product_id
      LEFT JOIN velocity v ON v.zoho_item_id = p.zoho_item_id
      WHERE wp.is_active = true
        AND p.stock_on_hand <= $1
        AND p.brand = ANY($4::text[])
      ORDER BY days_remaining ASC NULLS LAST, p.stock_on_hand ASC
    `;

    const countSql = `
      WITH velocity AS (
        SELECT oli.zoho_item_id, SUM(oli.quantity)::int AS qty_30d
        FROM order_line_items oli
        JOIN orders o ON o.id = oli.order_id
        WHERE o.date >= NOW() - INTERVAL '30 days'
          AND o.status NOT IN ('cancelled', 'void')
        GROUP BY oli.zoho_item_id
      )
      SELECT COUNT(*) AS total
      FROM website_products wp
      JOIN products p ON p.id = wp.product_id
      LEFT JOIN velocity v ON v.zoho_item_id = p.zoho_item_id
      WHERE wp.is_active = true AND p.stock_on_hand <= $1 AND p.brand = ANY($2::text[])
    `;

    const [countResult, dataResult] = await Promise.all([
      query(countSql, [thresh, ALLOWED_BRANDS]),
      query(sql + ' LIMIT $2 OFFSET $3', [thresh, lim, off, ALLOWED_BRANDS]),
    ]);

    const total = parseInt(countResult.rows[0].total);

    const data = dataResult.rows.map(row => {
      const daysRemaining = row.days_remaining != null ? parseInt(row.days_remaining) : null;
      let priority = 'monitor';
      if (daysRemaining !== null && daysRemaining <= 7) priority = 'critical';
      else if (daysRemaining !== null && daysRemaining <= 21) priority = 'warning';

      return {
        product_id: row.product_id,
        name: row.name,
        sku: row.sku,
        brand: row.brand,
        image_url: row.image_url,
        stock_on_hand: parseInt(row.stock_on_hand) || 0,
        retail_price: row.retail_price ? parseFloat(row.retail_price) : 0,
        sold_last_30d: parseInt(row.sold_last_30d) || 0,
        daily_velocity: parseFloat(row.daily_velocity) || 0,
        days_remaining: daysRemaining,
        priority,
        website_product_id: parseInt(row.website_product_id),
        badge: row.badge || null,
        is_active: row.is_active,
      };
    });

    res.json({
      data,
      count: data.length,
      meta: { total, limit: lim, offset: off, has_more: off + lim < total },
    });
  } catch (err) {
    logger.error('[ProductIntelligence] Reorder alerts error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── POST /price-check ────────────────────────────────────────

/**
 * Search Google Shopping via Serper for structured price results.
 * Falls back to regular search + price regex if no Serper key or shopping fails.
 */
async function searchPrices(productName, brand) {
  const serperKey = process.env.SERPER_API_KEY || process.env.SERP_API_KEY || '';
  const searchQuery = `${productName} ${brand}`;

  // 1. Try Serper Shopping endpoint — returns structured price data
  if (serperKey) {
    try {
      const r = await fetch('https://google.serper.dev/shopping', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-API-KEY': serperKey },
        body: JSON.stringify({ q: searchQuery, gl: 'uk', num: 10 }),
      });
      if (r.ok) {
        const data = await r.json();
        const shopping = data.shopping || [];
        if (shopping.length > 0) {
          return shopping
            .filter(item => item.price != null)
            .map(item => ({
              retailer: item.source || extractDomain(item.link) || 'Unknown',
              price: parsePrice(item.price),
              url: item.link || '',
            }))
            .filter(item => item.price > 0);
        }
      }
    } catch (err) {
      logger.warn('[PriceCheck] Serper shopping failed:', err.message);
    }

    // 2. Fallback: Serper regular search + extract prices from snippets
    try {
      const r = await fetch('https://google.serper.dev/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-API-KEY': serperKey },
        body: JSON.stringify({ q: `${searchQuery} price buy UK`, gl: 'uk', num: 10 }),
      });
      if (r.ok) {
        const data = await r.json();
        const results = [];

        // Extract from organic results
        for (const item of (data.organic || [])) {
          const text = `${item.title || ''} ${item.snippet || ''}`;
          const prices = extractGBPPrices(text);
          for (const price of prices) {
            results.push({
              retailer: extractDomain(item.link) || item.title?.slice(0, 40) || 'Unknown',
              price,
              url: item.link || '',
            });
          }
        }

        // Extract from knowledge graph / answer box if present
        if (data.answerBox?.snippet) {
          const prices = extractGBPPrices(data.answerBox.snippet);
          for (const price of prices) {
            results.push({ retailer: 'Google', price, url: '' });
          }
        }

        if (results.length > 0) return results;
      }
    } catch (err) {
      logger.warn('[PriceCheck] Serper search failed:', err.message);
    }
  }

  // 3. No Serper key — try DuckDuckGo lite
  try {
    const ddgUrl = `https://lite.duckduckgo.com/lite/?q=${encodeURIComponent(`${searchQuery} price buy UK`)}`;
    const r = await fetch(ddgUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; PriceBot/1.0)' },
    });
    const html = await r.text();
    const results = [];

    // DDG lite uses simple table rows with links and snippets
    const linkRe = /<a[^>]+href="([^"]+)"[^>]*class="result-link"[^>]*>(.*?)<\/a>/gi;
    const snippetRe = /<td[^>]*class="result-snippet"[^>]*>([\s\S]*?)<\/td>/gi;

    const links = [];
    let m;
    while ((m = linkRe.exec(html))) {
      links.push({ url: m[1], title: m[2].replace(/<[^>]+>/g, '') });
    }
    const snippets = [];
    while ((m = snippetRe.exec(html))) {
      snippets.push(m[1].replace(/<[^>]+>/g, ''));
    }

    for (let i = 0; i < Math.min(links.length, snippets.length, 10); i++) {
      const text = `${links[i].title} ${snippets[i]}`;
      const prices = extractGBPPrices(text);
      for (const price of prices) {
        results.push({
          retailer: extractDomain(links[i].url) || links[i].title.slice(0, 40),
          price,
          url: links[i].url,
        });
      }
    }

    return results;
  } catch (err) {
    logger.warn('[PriceCheck] DDG fallback failed:', err.message);
    return [];
  }
}

/** Parse a price string like "£49.99", "$29.99", or "49.99" into a number */
function parsePrice(priceStr) {
  if (typeof priceStr === 'number') return priceStr;
  if (!priceStr) return 0;
  const cleaned = String(priceStr).replace(/[^0-9.,]/g, '').replace(',', '');
  return parseFloat(cleaned) || 0;
}

/** Extract all £XX.XX prices from a text string */
function extractGBPPrices(text) {
  if (!text) return [];
  const re = /£\s?(\d{1,6}(?:[.,]\d{2})?)/g;
  const prices = [];
  let match;
  while ((match = re.exec(text)) !== null) {
    const val = parseFloat(match[1].replace(',', ''));
    if (val > 0.5 && val < 100000) prices.push(val);
  }
  return prices;
}

function extractDomain(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return null;
  }
}

router.post('/price-check', async (req, res) => {
  try {
    const { product_ids } = req.body;
    if (!Array.isArray(product_ids) || product_ids.length === 0) {
      return res.status(400).json({ error: 'product_ids array is required' });
    }
    if (product_ids.length > 25) {
      return res.status(400).json({ error: 'Maximum 25 products per price check' });
    }

    const { rows: products } = await query(`
      SELECT p.id, p.name, p.brand, p.rate AS wholesale_price,
             wp.retail_price
      FROM products p
      LEFT JOIN website_products wp ON wp.product_id = p.id
      WHERE p.id = ANY($1::int[]) AND p.brand = ANY($2::text[])
    `, [product_ids, ALLOWED_BRANDS]);

    if (products.length === 0) {
      return res.json({ results: [] });
    }

    const results = await Promise.all(
      products.map(async (p) => {
        const rawPrices = await searchPrices(p.name, p.brand);

        // Dedupe by retailer+price
        const seen = new Set();
        const unique = rawPrices.filter((fp) => {
          const key = `${fp.retailer}:${fp.price}`;
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });

        // Sort by price ascending
        unique.sort((a, b) => a.price - b.price);

        return {
          product_id: p.id,
          name: p.name,
          brand: p.brand,
          our_price: parseFloat(p.retail_price) || parseFloat(p.wholesale_price) || 0,
          found_prices: unique,
        };
      })
    );

    res.json({ results });
  } catch (err) {
    logger.error('[ProductIntelligence] Price check error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── GET /brands ──────────────────────────────────────────────

router.get('/brands', async (_req, res) => {
  try {
    const { rows } = await query(`
      SELECT DISTINCT p.brand, COUNT(DISTINCT oli.zoho_item_id)::int AS product_count
      FROM order_line_items oli
      JOIN orders o ON o.id = oli.order_id
      JOIN products p ON p.zoho_item_id = oli.zoho_item_id
      WHERE o.status NOT IN ('cancelled', 'void')
        AND p.brand = ANY($1::text[])
      GROUP BY p.brand
      ORDER BY product_count DESC
    `, [ALLOWED_BRANDS]);
    res.json({ data: rows });
  } catch (err) {
    logger.error('[ProductIntelligence] Brands error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export { router as productIntelligenceRouter };
