import express from 'express';
import { query, withTransaction } from '../../config/database.js';
import { logger } from '../../utils/logger.js';
import ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';
import postmark from 'postmark';

const router = express.Router();

// Sort whitelist for list endpoint
const LIST_SORT = {
  created_at: 'po.created_at',
  po_number: 'po.po_number',
  brand: 'po.brand',
  subtotal: 'po.subtotal',
  status: 'po.status',
};

// ── Shared helpers ──────────────────────────────────────────

/**
 * Fetch a PO with its items by ID.
 * Returns { po, items } or null if not found.
 */
async function fetchPOWithItems(poId) {
  const [poResult, itemsResult] = await Promise.all([
    query('SELECT po.* FROM purchase_orders po WHERE po.id = $1', [poId]),
    query('SELECT * FROM purchase_order_items WHERE purchase_order_id = $1 ORDER BY id', [poId]),
  ]);

  if (poResult.rows.length === 0) return null;
  return { po: poResult.rows[0], items: itemsResult.rows };
}

/**
 * Build an ExcelJS workbook for a PO.
 */
function buildExcelWorkbook(po, items) {
  const workbook = new ExcelJS.Workbook();
  const ws = workbook.addWorksheet(po.po_number);

  // Column widths
  ws.getColumn('A').width = 15;
  ws.getColumn('B').width = 40;
  ws.getColumn('C').width = 10;
  ws.getColumn('D').width = 12;
  ws.getColumn('E').width = 12;
  ws.getColumn('F').width = 10;
  ws.getColumn('G').width = 10;

  // Row 1: Company name
  ws.mergeCells('A1:F1');
  const titleCell = ws.getCell('A1');
  titleCell.value = 'DM Brands Ltd';
  titleCell.font = { bold: true, size: 14 };

  // Row 2: Document type
  ws.getCell('A2').value = 'Purchase Order';
  ws.getCell('A2').font = { size: 12 };

  // Row 3: blank

  // Row 4: PO details
  ws.getCell('A4').value = 'PO Number:';
  ws.getCell('A4').font = { bold: true };
  ws.getCell('B4').value = po.po_number;
  ws.getCell('C4').value = 'Date:';
  ws.getCell('C4').font = { bold: true };
  ws.getCell('D4').value = new Date(po.created_at).toLocaleDateString('en-GB');
  ws.getCell('E4').value = 'Status:';
  ws.getCell('E4').font = { bold: true };
  ws.getCell('F4').value = po.status;

  // Row 5: Brand and recipient
  ws.getCell('A5').value = 'Brand:';
  ws.getCell('A5').font = { bold: true };
  ws.getCell('B5').value = po.brand;
  ws.getCell('C5').value = 'Recipient:';
  ws.getCell('C5').font = { bold: true };
  ws.getCell('D5').value = po.recipient_email || 'N/A';

  // Row 6: blank

  // Row 7: Table headers
  const headerRow = ws.getRow(7);
  const headers = ['SKU', 'Product', 'Qty', 'Unit Cost (\u00a3)', 'Line Total (\u00a3)', 'Stock', 'Daily Rate'];
  headers.forEach((h, i) => {
    const cell = headerRow.getCell(i + 1);
    cell.value = h;
    cell.font = { bold: true };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD9D9D9' } };
  });

  // Data rows
  let rowNum = 8;
  for (const item of items) {
    const row = ws.getRow(rowNum);
    row.getCell(1).value = item.sku || '';
    row.getCell(2).value = item.product_name || '';
    row.getCell(3).value = parseInt(item.quantity) || 0;
    row.getCell(4).value = parseFloat(item.unit_cost) || 0;
    row.getCell(4).numFmt = '#,##0.00';
    row.getCell(5).value = parseFloat(item.line_total) || 0;
    row.getCell(5).numFmt = '#,##0.00';
    row.getCell(6).value = parseInt(item.stock_on_hand) || 0;
    row.getCell(7).value = parseFloat(item.daily_velocity) || 0;
    rowNum++;
  }

  // Total row
  const totalRow = ws.getRow(rowNum);
  totalRow.getCell(4).value = 'TOTAL';
  totalRow.getCell(4).font = { bold: true };
  totalRow.getCell(5).value = parseFloat(po.subtotal) || 0;
  totalRow.getCell(5).numFmt = '#,##0.00';
  totalRow.getCell(5).font = { bold: true };

  return workbook;
}

/**
 * Build a PDF buffer for a PO.
 * Returns a Promise that resolves to a Buffer.
 */
function buildPDFBuffer(po, items) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50 });
    const chunks = [];

    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    // Title
    doc.fontSize(18).font('Helvetica-Bold').text('DM Brands Ltd', { align: 'left' });
    doc.fontSize(14).font('Helvetica').text('Purchase Order', { align: 'left' });
    doc.moveDown();

    // PO details
    doc.fontSize(10).font('Helvetica-Bold');
    doc.text(`PO Number: `, { continued: true }).font('Helvetica').text(po.po_number);
    doc.font('Helvetica-Bold').text(`Date: `, { continued: true })
      .font('Helvetica').text(new Date(po.created_at).toLocaleDateString('en-GB'));
    doc.font('Helvetica-Bold').text(`Brand: `, { continued: true })
      .font('Helvetica').text(po.brand || '');
    doc.font('Helvetica-Bold').text(`Recipient: `, { continued: true })
      .font('Helvetica').text(po.recipient_email || 'N/A');
    doc.font('Helvetica-Bold').text(`Status: `, { continued: true })
      .font('Helvetica').text(po.status || '');
    doc.moveDown();

    // Table header
    const tableTop = doc.y;
    const colX = [50, 115, 320, 370, 420, 475, 520];
    const colHeaders = ['SKU', 'Product', 'Qty', 'Cost', 'Total', 'Stock', 'Rate'];

    doc.font('Helvetica-Bold').fontSize(9);
    colHeaders.forEach((h, i) => {
      doc.text(h, colX[i], tableTop, { width: (colX[i + 1] || 560) - colX[i], align: 'left' });
    });

    doc.moveTo(50, tableTop + 14).lineTo(560, tableTop + 14).stroke();

    // Table rows
    let y = tableTop + 20;
    doc.font('Helvetica').fontSize(8);
    for (const item of items) {
      if (y > 700) {
        doc.addPage();
        y = 50;
      }
      doc.text(item.sku || '', colX[0], y, { width: 65 });
      doc.text(item.product_name || '', colX[1], y, { width: 200 });
      doc.text(String(parseInt(item.quantity) || 0), colX[2], y, { width: 45, align: 'right' });
      doc.text((parseFloat(item.unit_cost) || 0).toFixed(2), colX[3], y, { width: 45, align: 'right' });
      doc.text((parseFloat(item.line_total) || 0).toFixed(2), colX[4], y, { width: 50, align: 'right' });
      doc.text(String(parseInt(item.stock_on_hand) || 0), colX[5], y, { width: 40, align: 'right' });
      doc.text(String(parseFloat(item.daily_velocity) || 0), colX[6], y, { width: 40, align: 'right' });
      y += 16;
    }

    // Total
    doc.moveTo(50, y).lineTo(560, y).stroke();
    y += 6;
    doc.font('Helvetica-Bold').fontSize(10);
    doc.text('TOTAL', colX[3], y, { width: 45, align: 'right' });
    doc.text(`\u00a3${(parseFloat(po.subtotal) || 0).toFixed(2)}`, colX[4], y, { width: 50, align: 'right' });

    doc.end();
  });
}

// ── 1. GET /reorder-intelligence ────────────────────────────

router.get('/reorder-intelligence', async (req, res) => {
  try {
    const {
      threshold = 20,
      brand,
      limit = 50,
      offset = 0,
    } = req.query;

    const thresh = parseInt(threshold) || 20;
    const lim = Math.min(parseInt(limit) || 50, 200);
    const off = parseInt(offset) || 0;

    const conditions = ['p.status = \'active\'', 'p.stock_on_hand <= $1'];
    const params = [thresh];
    let idx = 2;

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

    const where = conditions.join(' AND ');

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
        p.stock_on_hand, p.image_url, p.cost_price,
        COALESCE(v.qty_30d, 0) AS sold_last_30d,
        ROUND(COALESCE(v.qty_30d, 0) / 30.0, 2) AS daily_velocity,
        CASE
          WHEN COALESCE(v.qty_30d, 0) = 0 THEN NULL
          ELSE ROUND(p.stock_on_hand / (v.qty_30d / 30.0))
        END AS days_remaining,
        CASE WHEN wp.id IS NOT NULL AND wp.is_active = true THEN true ELSE false END AS on_website
      FROM products p
      LEFT JOIN velocity v ON v.zoho_item_id = p.zoho_item_id
      LEFT JOIN website_products wp ON wp.product_id = p.id
      WHERE ${where}
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
      FROM products p
      LEFT JOIN velocity v ON v.zoho_item_id = p.zoho_item_id
      LEFT JOIN website_products wp ON wp.product_id = p.id
      WHERE ${where}
    `;

    const dataParams = [...params, lim, off];
    const dataSql = sql + ` LIMIT $${idx++} OFFSET $${idx++}`;

    const [countResult, dataResult] = await Promise.all([
      query(countSql, params),
      query(dataSql, dataParams),
    ]);

    const total = parseInt(countResult.rows[0].total);

    const data = dataResult.rows.map(row => {
      const daysRemaining = row.days_remaining != null ? parseInt(row.days_remaining) : null;
      const dailyVelocity = parseFloat(row.daily_velocity) || 0;
      const stockOnHand = parseInt(row.stock_on_hand) || 0;

      let priority = 'monitor';
      if (daysRemaining !== null && daysRemaining <= 7) priority = 'critical';
      else if (daysRemaining !== null && daysRemaining <= 21) priority = 'warning';

      const suggestedQty = Math.max(1, Math.ceil(30 * dailyVelocity) - stockOnHand);

      return {
        product_id: row.product_id,
        name: row.name,
        sku: row.sku,
        brand: row.brand,
        image_url: row.image_url,
        stock_on_hand: stockOnHand,
        cost_price: parseFloat(row.cost_price) || 0,
        sold_last_30d: parseInt(row.sold_last_30d) || 0,
        daily_velocity: dailyVelocity,
        days_remaining: daysRemaining,
        priority,
        suggested_qty: suggestedQty,
        on_website: row.on_website === true,
      };
    });

    res.json({
      data,
      count: data.length,
      meta: { total, limit: lim, offset: off, has_more: off + lim < total },
    });
  } catch (err) {
    logger.error('[PurchaseOrders] Reorder intelligence error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── 2. GET /brands ──────────────────────────────────────────

router.get('/brands', async (_req, res) => {
  try {
    const { rows } = await query(`
      SELECT DISTINCT p.brand, COUNT(*)::int AS product_count
      FROM products p
      WHERE p.status = 'active' AND p.brand IS NOT NULL AND p.brand != ''
      GROUP BY p.brand
      ORDER BY product_count DESC
    `);
    res.json({ data: rows });
  } catch (err) {
    logger.error('[PurchaseOrders] Brands error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── 3. POST /generate ───────────────────────────────────────

router.post('/generate', async (req, res) => {
  try {
    const { items, notes } = req.body;

    // Validation
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'items array is required and must not be empty' });
    }
    for (const item of items) {
      if (!item.product_id || !item.quantity || item.quantity <= 0) {
        return res.status(400).json({ error: 'Each item must have product_id and quantity > 0' });
      }
    }

    const agentId = req.agent?.id;
    if (!agentId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const productIds = items.map(i => i.product_id);

    // Fetch product details
    const { rows: products } = await query(
      'SELECT id, name, sku, brand, cost_price, stock_on_hand FROM products WHERE id = ANY($1::int[])',
      [productIds]
    );

    if (products.length === 0) {
      return res.status(404).json({ error: 'No products found for the given IDs' });
    }

    // Build product lookup
    const productMap = new Map(products.map(p => [p.id, p]));

    // Get velocity data for these products
    const { rows: velocityRows } = await query(`
      WITH velocity AS (
        SELECT oli.zoho_item_id, SUM(oli.quantity)::int AS qty_30d
        FROM order_line_items oli
        JOIN orders o ON o.id = oli.order_id
        WHERE o.date >= NOW() - INTERVAL '30 days'
          AND o.status NOT IN ('cancelled', 'void')
        GROUP BY oli.zoho_item_id
      )
      SELECT p.id AS product_id,
        COALESCE(v.qty_30d, 0) AS sold_last_30d,
        ROUND(COALESCE(v.qty_30d, 0) / 30.0, 2) AS daily_velocity,
        CASE
          WHEN COALESCE(v.qty_30d, 0) = 0 THEN NULL
          ELSE ROUND(p.stock_on_hand / (v.qty_30d / 30.0))
        END AS days_remaining
      FROM products p
      LEFT JOIN velocity v ON v.zoho_item_id = p.zoho_item_id
      WHERE p.id = ANY($1::int[])
    `, [productIds]);

    const velocityMap = new Map(velocityRows.map(v => [v.product_id, v]));

    // Group requested items by brand
    const brandGroups = new Map();
    for (const item of items) {
      const product = productMap.get(item.product_id);
      if (!product) continue;
      const brand = product.brand || 'Unknown';
      if (!brandGroups.has(brand)) brandGroups.set(brand, []);
      brandGroups.get(brand).push({ ...item, product });
    }

    const createdPOs = [];

    for (const [brand, brandItems] of brandGroups) {
      await withTransaction(async (client) => {
        // Generate PO number
        const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
        const { rows: seqRows } = await client.query(
          `SELECT COUNT(*)::int + 1 AS seq FROM purchase_orders WHERE po_number LIKE 'PO-' || TO_CHAR(NOW(), 'YYYYMMDD') || '-%'`
        );
        const seq = seqRows[0].seq;
        const poNumber = `PO-${dateStr}-${String(seq).padStart(3, '0')}`;

        // Pre-fill recipient email from most recent PO for this brand
        const { rows: emailRows } = await client.query(
          `SELECT recipient_email FROM purchase_orders WHERE brand = $1 AND recipient_email IS NOT NULL ORDER BY created_at DESC LIMIT 1`,
          [brand]
        );
        const recipientEmail = emailRows.length > 0 ? emailRows[0].recipient_email : null;

        // Insert purchase order
        const { rows: poRows } = await client.query(
          `INSERT INTO purchase_orders (po_number, brand, status, created_by, recipient_email, notes, subtotal, created_at, updated_at)
           VALUES ($1, $2, 'draft', $3, $4, $5, 0, NOW(), NOW())
           RETURNING *`,
          [poNumber, brand, agentId, recipientEmail, notes || null]
        );
        const po = poRows[0];

        // Insert items
        const insertedItems = [];
        for (const bi of brandItems) {
          const product = bi.product;
          const vel = velocityMap.get(bi.product_id);
          const unitCost = parseFloat(product.cost_price) || 0;
          const lineTotal = unitCost * bi.quantity;

          const { rows: itemRows } = await client.query(
            `INSERT INTO purchase_order_items (purchase_order_id, product_id, product_name, sku, quantity, unit_cost, stock_on_hand, daily_velocity, days_remaining)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
             RETURNING *`,
            [
              po.id,
              bi.product_id,
              product.name,
              product.sku,
              bi.quantity,
              unitCost,
              parseInt(product.stock_on_hand) || 0,
              vel ? parseFloat(vel.daily_velocity) || 0 : 0,
              vel?.days_remaining != null ? parseInt(vel.days_remaining) : null,
            ]
          );
          insertedItems.push(itemRows[0]);
        }

        // Update subtotal
        const { rows: subtotalRows } = await client.query(
          `UPDATE purchase_orders SET subtotal = (SELECT SUM(quantity * unit_cost) FROM purchase_order_items WHERE purchase_order_id = $1), updated_at = NOW() WHERE id = $1 RETURNING *`,
          [po.id]
        );

        createdPOs.push({ ...subtotalRows[0], items: insertedItems });
      });
    }

    res.json({ purchase_orders: createdPOs });
  } catch (err) {
    logger.error('[PurchaseOrders] Generate error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── 4. GET / ────────────────────────────────────────────────

router.get('/', async (req, res) => {
  try {
    const {
      status,
      brand,
      sort_by = 'created_at',
      sort_order = 'desc',
      limit = 25,
      offset = 0,
    } = req.query;

    const lim = Math.min(parseInt(limit) || 25, 200);
    const off = parseInt(offset) || 0;
    const col = LIST_SORT[sort_by] || 'po.created_at';
    const dir = sort_order === 'asc' ? 'ASC' : 'DESC';

    const conditions = [];
    const params = [];
    let idx = 1;

    if (status) {
      conditions.push(`po.status = $${idx++}`);
      params.push(status);
    }
    if (brand) {
      conditions.push(`po.brand = $${idx++}`);
      params.push(brand);
    }

    const where = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : '';

    const sql = `
      SELECT po.*,
        (SELECT COUNT(*)::int FROM purchase_order_items WHERE purchase_order_id = po.id) AS item_count
      FROM purchase_orders po
      ${where}
      ORDER BY ${col} ${dir}
      LIMIT $${idx++} OFFSET $${idx++}
    `;

    const countSql = `SELECT COUNT(*) AS total FROM purchase_orders po ${where}`;

    const dataParams = [...params, lim, off];

    const [countResult, dataResult] = await Promise.all([
      query(countSql, params),
      query(sql, dataParams),
    ]);

    const total = parseInt(countResult.rows[0].total);

    const data = dataResult.rows.map(row => ({
      ...row,
      subtotal: parseFloat(row.subtotal) || 0,
      item_count: parseInt(row.item_count) || 0,
    }));

    res.json({
      data,
      count: data.length,
      meta: { total, limit: lim, offset: off, has_more: off + lim < total },
    });
  } catch (err) {
    logger.error('[PurchaseOrders] List error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── 8. GET /saved-emails ────────────────────────────────────
// NOTE: Must be registered before /:id to avoid "saved-emails" matching as :id

router.get('/saved-emails', async (req, res) => {
  try {
    const { brand } = req.query;

    const conditions = ['recipient_email IS NOT NULL'];
    const params = [];
    let idx = 1;

    if (brand) {
      conditions.push(`brand = $${idx++}`);
      params.push(brand);
    }

    const where = conditions.join(' AND ');

    const { rows } = await query(`
      SELECT DISTINCT recipient_email, MAX(sent_at) AS last_used
      FROM purchase_orders
      WHERE ${where}
      GROUP BY recipient_email
      ORDER BY last_used DESC NULLS LAST
      LIMIT 20
    `, params);

    res.json({ data: rows.map(r => r.recipient_email) });
  } catch (err) {
    logger.error('[PurchaseOrders] Saved emails error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── 5. GET /:id ─────────────────────────────────────────────

router.get('/:id', async (req, res) => {
  try {
    const poId = parseInt(req.params.id);
    if (isNaN(poId)) {
      return res.status(400).json({ error: 'Invalid purchase order ID' });
    }

    const result = await fetchPOWithItems(poId);
    if (!result) {
      return res.status(404).json({ error: 'Purchase order not found' });
    }

    res.json({
      data: {
        ...result.po,
        subtotal: parseFloat(result.po.subtotal) || 0,
        items: result.items.map(item => ({
          ...item,
          quantity: parseInt(item.quantity) || 0,
          unit_cost: parseFloat(item.unit_cost) || 0,
          line_total: parseFloat(item.line_total) || 0,
          stock_on_hand: parseInt(item.stock_on_hand) || 0,
          daily_velocity: parseFloat(item.daily_velocity) || 0,
        })),
      },
    });
  } catch (err) {
    logger.error('[PurchaseOrders] Get by ID error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── 6. GET /:id/export ──────────────────────────────────────

router.get('/:id/export', async (req, res) => {
  try {
    const poId = parseInt(req.params.id);
    if (isNaN(poId)) {
      return res.status(400).json({ error: 'Invalid purchase order ID' });
    }

    const format = req.query.format || 'xlsx';
    if (!['xlsx', 'pdf'].includes(format)) {
      return res.status(400).json({ error: 'Format must be xlsx or pdf' });
    }

    const result = await fetchPOWithItems(poId);
    if (!result) {
      return res.status(404).json({ error: 'Purchase order not found' });
    }

    const { po, items } = result;
    const filename = `${po.po_number}.${format}`;

    if (format === 'xlsx') {
      const workbook = buildExcelWorkbook(po, items);

      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

      await workbook.xlsx.write(res);
      res.end();
    } else {
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

      const doc = new PDFDocument({ margin: 50 });
      doc.pipe(res);

      // Title
      doc.fontSize(18).font('Helvetica-Bold').text('DM Brands Ltd', { align: 'left' });
      doc.fontSize(14).font('Helvetica').text('Purchase Order', { align: 'left' });
      doc.moveDown();

      // PO details
      doc.fontSize(10).font('Helvetica-Bold');
      doc.text('PO Number: ', { continued: true }).font('Helvetica').text(po.po_number);
      doc.font('Helvetica-Bold').text('Date: ', { continued: true })
        .font('Helvetica').text(new Date(po.created_at).toLocaleDateString('en-GB'));
      doc.font('Helvetica-Bold').text('Brand: ', { continued: true })
        .font('Helvetica').text(po.brand || '');
      doc.font('Helvetica-Bold').text('Recipient: ', { continued: true })
        .font('Helvetica').text(po.recipient_email || 'N/A');
      doc.font('Helvetica-Bold').text('Status: ', { continued: true })
        .font('Helvetica').text(po.status || '');
      doc.moveDown();

      // Table header
      const tableTop = doc.y;
      const colX = [50, 115, 320, 370, 420, 475, 520];
      const colHeaders = ['SKU', 'Product', 'Qty', 'Cost', 'Total', 'Stock', 'Rate'];

      doc.font('Helvetica-Bold').fontSize(9);
      colHeaders.forEach((h, i) => {
        doc.text(h, colX[i], tableTop, { width: (colX[i + 1] || 560) - colX[i], align: 'left' });
      });
      doc.moveTo(50, tableTop + 14).lineTo(560, tableTop + 14).stroke();

      // Table rows
      let y = tableTop + 20;
      doc.font('Helvetica').fontSize(8);
      for (const item of items) {
        if (y > 700) {
          doc.addPage();
          y = 50;
        }
        doc.text(item.sku || '', colX[0], y, { width: 65 });
        doc.text(item.product_name || '', colX[1], y, { width: 200 });
        doc.text(String(parseInt(item.quantity) || 0), colX[2], y, { width: 45, align: 'right' });
        doc.text((parseFloat(item.unit_cost) || 0).toFixed(2), colX[3], y, { width: 45, align: 'right' });
        doc.text((parseFloat(item.line_total) || 0).toFixed(2), colX[4], y, { width: 50, align: 'right' });
        doc.text(String(parseInt(item.stock_on_hand) || 0), colX[5], y, { width: 40, align: 'right' });
        doc.text(String(parseFloat(item.daily_velocity) || 0), colX[6], y, { width: 40, align: 'right' });
        y += 16;
      }

      // Total
      doc.moveTo(50, y).lineTo(560, y).stroke();
      y += 6;
      doc.font('Helvetica-Bold').fontSize(10);
      doc.text('TOTAL', colX[3], y, { width: 45, align: 'right' });
      doc.text(`\u00a3${(parseFloat(po.subtotal) || 0).toFixed(2)}`, colX[4], y, { width: 50, align: 'right' });

      doc.end();
    }
  } catch (err) {
    logger.error('[PurchaseOrders] Export error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── 7. POST /:id/send ───────────────────────────────────────

router.post('/:id/send', async (req, res) => {
  try {
    if (!process.env.POSTMARK_SERVER_TOKEN) {
      return res.status(503).json({ error: 'Email service not configured' });
    }

    const poId = parseInt(req.params.id);
    if (isNaN(poId)) {
      return res.status(400).json({ error: 'Invalid purchase order ID' });
    }

    const { email, format, message } = req.body;
    if (!email) {
      return res.status(400).json({ error: 'email is required' });
    }
    if (!format || !['xlsx', 'pdf'].includes(format)) {
      return res.status(400).json({ error: 'format must be xlsx or pdf' });
    }

    const result = await fetchPOWithItems(poId);
    if (!result) {
      return res.status(404).json({ error: 'Purchase order not found' });
    }

    const { po, items } = result;

    // Generate file buffer
    let fileBuffer;
    let contentType;

    if (format === 'xlsx') {
      const workbook = buildExcelWorkbook(po, items);
      fileBuffer = await workbook.xlsx.writeBuffer();
      contentType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    } else {
      fileBuffer = await buildPDFBuffer(po, items);
      contentType = 'application/pdf';
    }

    // Send via Postmark
    const postmarkClient = new postmark.ServerClient(process.env.POSTMARK_SERVER_TOKEN);
    const sendResult = await postmarkClient.sendEmail({
      From: process.env.EMAIL_FROM || 'sales@dmbrands.co.uk',
      To: email,
      Subject: `Purchase Order ${po.po_number} \u2014 ${po.brand}`,
      HtmlBody: `<p>${message || `Please find attached purchase order ${po.po_number} for ${po.brand}.`}</p><p>Kind regards,<br>DM Brands</p>`,
      Attachments: [{
        Name: `${po.po_number}.${format === 'xlsx' ? 'xlsx' : 'pdf'}`,
        Content: Buffer.from(fileBuffer).toString('base64'),
        ContentType: contentType,
      }],
    });

    // Update PO status to sent
    await query(
      `UPDATE purchase_orders SET status = 'sent', sent_at = NOW(), recipient_email = $2, updated_at = NOW() WHERE id = $1`,
      [poId, email]
    );

    res.json({ success: true, message_id: sendResult.MessageID });
  } catch (err) {
    logger.error('[PurchaseOrders] Send error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── 9. PATCH /:id ───────────────────────────────────────────

router.patch('/:id', async (req, res) => {
  try {
    const poId = parseInt(req.params.id);
    if (isNaN(poId)) {
      return res.status(400).json({ error: 'Invalid purchase order ID' });
    }

    // Verify PO exists
    const existing = await fetchPOWithItems(poId);
    if (!existing) {
      return res.status(404).json({ error: 'Purchase order not found' });
    }

    const { status, notes, items } = req.body;

    // Update status if provided
    if (status) {
      await query(
        'UPDATE purchase_orders SET status = $2, updated_at = NOW() WHERE id = $1',
        [poId, status]
      );
    }

    // Update notes if provided
    if (notes !== undefined) {
      await query(
        'UPDATE purchase_orders SET notes = $2, updated_at = NOW() WHERE id = $1',
        [poId, notes]
      );
    }

    // Update items if provided
    if (Array.isArray(items) && items.length > 0) {
      for (const item of items) {
        if (!item.id || !item.quantity || item.quantity <= 0) continue;

        // Get current unit_cost to recalculate line_total
        const { rows: currentItem } = await query(
          'SELECT unit_cost FROM purchase_order_items WHERE id = $1 AND purchase_order_id = $2',
          [item.id, poId]
        );

        if (currentItem.length > 0) {
          const unitCost = parseFloat(currentItem[0].unit_cost) || 0;
          const lineTotal = unitCost * item.quantity;

          await query(
            'UPDATE purchase_order_items SET quantity = $2, line_total = $3 WHERE id = $1 AND purchase_order_id = $4',
            [item.id, item.quantity, lineTotal, poId]
          );
        }
      }

      // Recalculate subtotal
      await query(
        `UPDATE purchase_orders SET subtotal = (SELECT COALESCE(SUM(quantity * unit_cost), 0) FROM purchase_order_items WHERE purchase_order_id = $1), updated_at = NOW() WHERE id = $1`,
        [poId]
      );
    }

    // Return updated PO with items
    const updated = await fetchPOWithItems(poId);

    res.json({
      data: {
        ...updated.po,
        subtotal: parseFloat(updated.po.subtotal) || 0,
        items: updated.items.map(item => ({
          ...item,
          quantity: parseInt(item.quantity) || 0,
          unit_cost: parseFloat(item.unit_cost) || 0,
          line_total: parseFloat(item.line_total) || 0,
          stock_on_hand: parseInt(item.stock_on_hand) || 0,
          daily_velocity: parseFloat(item.daily_velocity) || 0,
        })),
      },
    });
  } catch (err) {
    logger.error('[PurchaseOrders] Patch error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export { router as purchaseOrdersRouter };
