/**
 * Import Zoho Package.csv and Shipment_Order.csv into Neon
 *
 * Usage: node backend/src/scripts/import-zoho-csv.js <package_csv> <shipment_csv>
 */

import dotenv from 'dotenv';
dotenv.config();

import fs from 'fs';
import { parse } from 'csv-parse/sync';
import { query, pool } from '../config/database.js';
import { logger } from '../utils/logger.js';

const STATUS_ORDER = ['not_shipped', 'sent_to_packing', 'packed', 'delivery_booked', 'shipped', 'delivered'];

function mapWarehouseStatus(zohoStatus) {
  const s = (zohoStatus || '').toLowerCase();
  if (s === 'delivered') return 'delivered';
  if (s === 'shipped') return 'shipped';
  if (s === 'packed') return 'packed';
  return 'sent_to_packing';
}

async function lookupOrderId(salesorderNumber) {
  if (!salesorderNumber) return null;
  const { rows } = await query('SELECT id FROM orders WHERE salesorder_number = $1 LIMIT 1', [salesorderNumber]);
  return rows[0]?.id || null;
}

async function lookupCustomerId(customerName) {
  if (!customerName) return null;
  const { rows } = await query('SELECT id FROM customers WHERE company_name = $1 LIMIT 1', [customerName]);
  return rows[0]?.id || null;
}

async function lookupOrderLineItemId(orderId, sku) {
  if (!orderId || !sku) return null;
  const { rows } = await query('SELECT id FROM order_line_items WHERE order_id = $1 AND sku = $2 LIMIT 1', [orderId, sku]);
  return rows[0]?.id || null;
}

async function importShipments(csvPath) {
  logger.info(`Importing shipments from ${csvPath}...`);
  const raw = fs.readFileSync(csvPath, 'utf-8');
  const records = parse(raw, { columns: true, skip_empty_lines: true, trim: true });
  logger.info(`Parsed ${records.length} shipment records`);

  // Cache order/customer lookups
  const orderCache = new Map();
  const customerCache = new Map();

  let created = 0, updated = 0, errors = 0;

  for (let i = 0; i < records.length; i++) {
    const r = records[i];
    try {
      const zohoShipmentId = r['Shipment ID'];
      const packingNumber = r['Packing Number'];
      const soNumber = r['SO Number'];
      const customerName = r['Customer Name'];
      const status = (r['Status'] || '').toLowerCase();
      const warehouseStatus = mapWarehouseStatus(status);

      // Lookup order
      if (!orderCache.has(soNumber)) {
        orderCache.set(soNumber, await lookupOrderId(soNumber));
      }
      const orderId = orderCache.get(soNumber);

      // Lookup customer
      if (!customerCache.has(customerName)) {
        customerCache.set(customerName, await lookupCustomerId(customerName));
      }
      const customerId = customerCache.get(customerName);

      // Check existing
      const { rows: existing } = await query(
        `SELECT id, warehouse_status FROM shipments WHERE packing_number = $1 LIMIT 1`,
        [packingNumber]
      );

      if (existing[0]) {
        // Update — only advance warehouse_status forward
        const currentIdx = STATUS_ORDER.indexOf(existing[0].warehouse_status || 'not_shipped');
        const newIdx = STATUS_ORDER.indexOf(warehouseStatus);
        const finalStatus = newIdx > currentIdx ? warehouseStatus : existing[0].warehouse_status;

        await query(
          `UPDATE shipments SET
            zoho_shipment_id = $1, status = $2, warehouse_status = $3,
            shipment_date = $4, shipment_number = $5, carrier_name = $6,
            tracking_number = $7, shipping_charge = $8,
            expected_delivery_date = $9, delivery_date = $10, notes = $11,
            salesorder_number = $12, customer_name = $13,
            order_id = COALESCE($14, order_id), customer_id = COALESCE($15, customer_id),
            shipping_address = $16, shipping_street2 = $17, shipping_city = $18,
            shipping_state = $19, shipping_country = $20, shipping_code = $21,
            shipping_phone = $22, shipping_attention = $23,
            zoho_created_time = $24, zoho_last_modified_time = $25,
            updated_at = NOW()
          WHERE id = $26`,
          [
            zohoShipmentId, status, finalStatus,
            r['Shipment Date'] || null, r['Shipment Number'] || null, r['Carrier Name'] || null,
            r['Tracking Number'] || null, parseFloat(r['Shipping Charge']) || null,
            r['Expected Delivery Date'] || null, r['Delivery Date'] || null, r['Notes'] || null,
            soNumber, customerName,
            orderId, customerId,
            r['Shipping Address'] || null, r['Shipping Street2'] || null, r['Shipping City'] || null,
            r['Shipping State'] || null, r['Shipping Country'] || null, r['Shipping Code'] || null,
            r['Shipping Phone'] || null, r['shipping_attention'] || null,
            r['Created Time'] || null, r['Last Modified Time'] || null,
            existing[0].id,
          ]
        );
        updated++;
      } else {
        // Insert
        await query(
          `INSERT INTO shipments (
            zoho_shipment_id, packing_number, shipment_date, shipment_number, status, warehouse_status,
            shipment_type, carrier_name, tracking_number, shipping_charge,
            zoho_salesorder_id, salesorder_number, customer_name,
            expected_delivery_date, delivery_date, notes,
            shipping_address, shipping_street2, shipping_city, shipping_state,
            shipping_country, shipping_code, shipping_phone, shipping_attention,
            order_id, customer_id,
            zoho_created_time, zoho_last_modified_time,
            created_at, updated_at
          ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,NOW(),NOW())`,
          [
            zohoShipmentId, packingNumber, r['Shipment Date'] || null, r['Shipment Number'] || null,
            status, warehouseStatus,
            r['Shipment Type'] || null, r['Carrier Name'] || null, r['Tracking Number'] || null,
            parseFloat(r['Shipping Charge']) || null,
            r['Sales Order ID'] || null, soNumber, customerName,
            r['Expected Delivery Date'] || null, r['Delivery Date'] || null, r['Notes'] || null,
            r['Shipping Address'] || null, r['Shipping Street2'] || null, r['Shipping City'] || null,
            r['Shipping State'] || null, r['Shipping Country'] || null, r['Shipping Code'] || null,
            r['Shipping Phone'] || null, r['shipping_attention'] || null,
            orderId, customerId,
            r['Created Time'] || null, r['Last Modified Time'] || null,
          ]
        );
        created++;
      }

      if ((i + 1) % 500 === 0) {
        logger.info(`  Shipments: ${i + 1}/${records.length} (${created} created, ${updated} updated)`);
      }
    } catch (err) {
      errors++;
      if (errors <= 5) logger.error(`Error on shipment row ${i + 1}:`, err.message);
    }
  }

  logger.info(`Shipments done: ${created} created, ${updated} updated, ${errors} errors`);
  return { created, updated, errors };
}

async function importPackageItems(csvPath) {
  logger.info(`Importing package items from ${csvPath}...`);
  const raw = fs.readFileSync(csvPath, 'utf-8');
  const records = parse(raw, { columns: true, skip_empty_lines: true, trim: true });
  logger.info(`Parsed ${records.length} package item records`);

  // Cache lookups
  const orderCache = new Map();
  const shipmentCache = new Map();
  const oliCache = new Map();

  let created = 0, updated = 0, errors = 0, skippedNoShipment = 0;

  for (let i = 0; i < records.length; i++) {
    const r = records[i];
    try {
      const zohoPackageItemId = r['PackageItemID'];
      const packingNumber = r['Packing Number'];
      const soNumber = r['SO Number'];
      const sku = r['SKU'] || null;
      const status = (r['Status'] || '').toLowerCase();

      // Lookup shipment by packing_number
      if (!shipmentCache.has(packingNumber)) {
        const { rows } = await query('SELECT id FROM shipments WHERE packing_number = $1 LIMIT 1', [packingNumber]);
        shipmentCache.set(packingNumber, rows[0]?.id || null);
      }
      const shipmentId = shipmentCache.get(packingNumber);

      if (!shipmentId) {
        skippedNoShipment++;
        continue;
      }

      // Lookup order
      if (!orderCache.has(soNumber)) {
        orderCache.set(soNumber, await lookupOrderId(soNumber));
      }
      const orderId = orderCache.get(soNumber);

      // Lookup order_line_item
      const oliKey = `${orderId}-${sku}`;
      if (!oliCache.has(oliKey)) {
        oliCache.set(oliKey, await lookupOrderLineItemId(orderId, sku));
      }
      const orderLineItemId = oliCache.get(oliKey);

      // Check existing
      const { rows: existing } = await query(
        `SELECT id FROM package_items WHERE zoho_package_item_id = $1 LIMIT 1`,
        [zohoPackageItemId]
      );

      if (existing[0]) {
        await query(
          `UPDATE package_items SET
            packing_number = $1, packing_date = $2, salesorder_number = $3,
            customer_name = $4, status = $5, item_name = $6,
            quantity_packed = $7, sku = $8, item_price = $9,
            shipping_address = $10, shipping_street2 = $11, shipping_city = $12,
            shipping_state = $13, shipping_country = $14, shipping_code = $15,
            shipping_phone = $16, shipping_attention = $17,
            order_id = COALESCE($18, order_id), shipment_id = $19,
            order_line_item_id = COALESCE($20, order_line_item_id),
            updated_at = NOW()
          WHERE id = $21`,
          [
            packingNumber, r['Packing Date'] || null, soNumber,
            r['Customer Name'] || null, status, r['Item Name'] || null,
            parseFloat(r['Quantity Packed']) || 0, sku, parseFloat(r['Item Price']) || null,
            r['Shipping Address'] || null, (r['Shipping Address'] ? Object.values(r)[29] : null),
            r['Shipping City'] || null, r['Shipping State'] || null,
            r['Shipping Country'] || null, r['Shipping Code'] || null,
            r['Shipping Phone'] || null, r['Shipping Attention'] || null,
            orderId, shipmentId, orderLineItemId,
            existing[0].id,
          ]
        );
        updated++;
      } else {
        await query(
          `INSERT INTO package_items (
            zoho_package_item_id, packing_number, packing_date, salesorder_number,
            customer_name, status, item_name, quantity_packed, sku, item_price,
            shipping_address, shipping_city, shipping_state,
            shipping_country, shipping_code, shipping_phone, shipping_attention,
            order_id, shipment_id, order_line_item_id,
            created_at, updated_at
          ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,NOW(),NOW())`,
          [
            zohoPackageItemId, packingNumber, r['Packing Date'] || null, soNumber,
            r['Customer Name'] || null, status, r['Item Name'] || null,
            parseFloat(r['Quantity Packed']) || 0, sku, parseFloat(r['Item Price']) || null,
            r['Shipping Address'] || null, r['Shipping City'] || null, r['Shipping State'] || null,
            r['Shipping Country'] || null, r['Shipping Code'] || null,
            r['Shipping Phone'] || null, r['Shipping Attention'] || null,
            orderId, shipmentId, orderLineItemId,
          ]
        );
        created++;
      }

      if ((i + 1) % 1000 === 0) {
        logger.info(`  Package items: ${i + 1}/${records.length} (${created} created, ${updated} updated)`);
      }
    } catch (err) {
      errors++;
      if (errors <= 5) logger.error(`Error on package item row ${i + 1}:`, err.message);
    }
  }

  logger.info(`Package items done: ${created} created, ${updated} updated, ${skippedNoShipment} skipped (no shipment), ${errors} errors`);
  return { created, updated, skippedNoShipment, errors };
}

async function alignStalePackages() {
  // Align warehouse_status for fully shipped/delivered orders
  const { rows } = await query(`
    UPDATE shipments s SET warehouse_status = 'delivered'
    FROM orders o
    WHERE o.id = s.order_id
    AND o.status IN ('fulfilled', 'closed')
    AND s.warehouse_status IN ('not_shipped', 'sent_to_packing')
    RETURNING s.id
  `);
  logger.info(`Aligned ${rows.length} stale packages to 'delivered'`);
}

async function run() {
  const packageCsv = process.argv[2] || '/home/alastair/Downloads/Package.csv';
  const shipmentCsv = process.argv[3] || '/home/alastair/Downloads/Shipment_Order.csv';

  if (!fs.existsSync(packageCsv)) { logger.error(`File not found: ${packageCsv}`); process.exit(1); }
  if (!fs.existsSync(shipmentCsv)) { logger.error(`File not found: ${shipmentCsv}`); process.exit(1); }

  const startTime = Date.now();
  logger.info('=== Zoho CSV Import ===');

  try {
    // 1. Import shipments first (package_items reference them)
    await importShipments(shipmentCsv);

    // 2. Import package items
    await importPackageItems(packageCsv);

    // 3. Align stale packages
    await alignStalePackages();

    // 4. Final stats
    const { rows: statusCounts } = await query(
      `SELECT warehouse_status, count(*) FROM shipments GROUP BY warehouse_status ORDER BY count(*) DESC`
    );
    logger.info('Final warehouse_status distribution:');
    for (const row of statusCounts) {
      logger.info(`  ${row.warehouse_status}: ${row.count}`);
    }

    const { rows: [piCount] } = await query(`SELECT count(*) FROM package_items`);
    const { rows: [linkedCount] } = await query(`SELECT count(*) FROM package_items WHERE order_line_item_id IS NOT NULL`);
    logger.info(`Package items total: ${piCount.count}, linked to line items: ${linkedCount.count}`);

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    logger.info(`=== Import complete in ${elapsed}s ===`);
  } catch (err) {
    logger.error('Fatal import error:', err);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

run();
