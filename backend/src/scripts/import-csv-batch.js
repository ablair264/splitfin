/**
 * Fast batch CSV import using ON CONFLICT upserts.
 * Runs batches of 100 rows in single INSERT statements for speed.
 *
 * Usage: node backend/src/scripts/import-csv-batch.js
 */

import dotenv from 'dotenv';
dotenv.config();

import fs from 'fs';
import pg from 'pg';
import { parse } from 'csv-parse/sync';

const { Pool } = pg;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 5,
});

function esc(val) {
  if (val === null || val === undefined || val === '') return null;
  return String(val);
}

function mapWarehouseStatus(status) {
  const s = (status || '').toLowerCase();
  if (s === 'delivered') return 'delivered';
  if (s === 'shipped') return 'shipped';
  if (s === 'packed') return 'packed';
  return 'sent_to_packing';
}

async function importShipments(csvPath) {
  console.log(`Importing shipments from ${csvPath}...`);
  const raw = fs.readFileSync(csvPath, 'utf-8');
  const records = parse(raw, { columns: true, skip_empty_lines: true, trim: true });
  console.log(`Parsed ${records.length} shipment records`);

  // Need a unique constraint on packing_number for ON CONFLICT
  try {
    await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_shipments_packing_number_unique ON shipments (packing_number) WHERE packing_number IS NOT NULL`);
  } catch (e) {
    console.log('Index may already exist:', e.message);
  }

  const BATCH = 50;
  let created = 0, updated = 0, errors = 0;

  for (let i = 0; i < records.length; i += BATCH) {
    const batch = records.slice(i, i + BATCH);
    const values = [];
    const params = [];
    let pIdx = 1;

    for (const r of batch) {
      const ws = mapWarehouseStatus(r['Status']);
      const pNums = [];
      for (const val of [
        esc(r['Shipment ID']), esc(r['Packing Number']),
        esc(r['Shipment Date']) || null, esc(r['Shipment Number']),
        (r['Status'] || '').toLowerCase(), ws,
        esc(r['Shipment Type']), esc(r['Carrier Name']),
        esc(r['Tracking Number']), r['Shipping Charge'] ? parseFloat(r['Shipping Charge']) : null,
        esc(r['Sales Order ID']), esc(r['SO Number']),
        esc(r['Customer Name']),
        esc(r['Expected Delivery Date']) || null, esc(r['Delivery Date']) || null,
        esc(r['Notes']),
        esc(r['Shipping Address']), esc(r['Shipping Street2']),
        esc(r['Shipping City']), esc(r['Shipping State']),
        esc(r['Shipping Country']), esc(r['Shipping Code']),
        esc(r['Shipping Phone']), esc(r['shipping_attention']),
        esc(r['Created Time']) || null, esc(r['Last Modified Time']) || null,
      ]) {
        params.push(val);
        pNums.push(`$${pIdx++}`);
      }
      values.push(`(${pNums.join(',')})`);
    }

    try {
      const result = await pool.query(`
        INSERT INTO shipments (
          zoho_shipment_id, packing_number,
          shipment_date, shipment_number,
          status, warehouse_status,
          shipment_type, carrier_name,
          tracking_number, shipping_charge,
          zoho_salesorder_id, salesorder_number,
          customer_name,
          expected_delivery_date, delivery_date,
          notes,
          shipping_address, shipping_street2,
          shipping_city, shipping_state,
          shipping_country, shipping_code,
          shipping_phone, shipping_attention,
          zoho_created_time, zoho_last_modified_time
        ) VALUES ${values.join(',')}
        ON CONFLICT (packing_number) DO UPDATE SET
          zoho_shipment_id = COALESCE(EXCLUDED.zoho_shipment_id, shipments.zoho_shipment_id),
          status = EXCLUDED.status,
          warehouse_status = CASE
            WHEN array_position(ARRAY['not_shipped','sent_to_packing','packed','delivery_booked','shipped','delivered'], EXCLUDED.warehouse_status)
               > COALESCE(array_position(ARRAY['not_shipped','sent_to_packing','packed','delivery_booked','shipped','delivered'], shipments.warehouse_status), 0)
            THEN EXCLUDED.warehouse_status
            ELSE shipments.warehouse_status
          END,
          shipment_date = COALESCE(EXCLUDED.shipment_date, shipments.shipment_date),
          shipment_number = COALESCE(EXCLUDED.shipment_number, shipments.shipment_number),
          carrier_name = COALESCE(EXCLUDED.carrier_name, shipments.carrier_name),
          tracking_number = COALESCE(EXCLUDED.tracking_number, shipments.tracking_number),
          shipping_charge = COALESCE(EXCLUDED.shipping_charge, shipments.shipping_charge),
          zoho_salesorder_id = COALESCE(EXCLUDED.zoho_salesorder_id, shipments.zoho_salesorder_id),
          delivery_date = COALESCE(EXCLUDED.delivery_date, shipments.delivery_date),
          zoho_created_time = COALESCE(EXCLUDED.zoho_created_time, shipments.zoho_created_time),
          zoho_last_modified_time = COALESCE(EXCLUDED.zoho_last_modified_time, shipments.zoho_last_modified_time),
          updated_at = NOW()
      `, params);

      updated += batch.length;
    } catch (err) {
      errors += batch.length;
      console.error(`Error on batch starting at row ${i}:`, err.message);
    }

    if ((i + BATCH) % 500 === 0 || i + BATCH >= records.length) {
      console.log(`  Shipments: ${Math.min(i + BATCH, records.length)}/${records.length}`);
    }
  }

  console.log(`Shipments: ${updated} processed, ${errors} errors`);

  // Link order_id
  console.log('Linking shipments to orders...');
  const linkResult = await pool.query(`
    UPDATE shipments s SET order_id = o.id
    FROM orders o
    WHERE o.salesorder_number = s.salesorder_number
    AND s.order_id IS NULL
    AND s.salesorder_number IS NOT NULL
  `);
  console.log(`Linked ${linkResult.rowCount} shipments to orders`);

  // Link customer_id
  console.log('Linking shipments to customers...');
  const custResult = await pool.query(`
    UPDATE shipments s SET customer_id = c.id
    FROM customers c
    WHERE c.company_name = s.customer_name
    AND s.customer_id IS NULL
    AND s.customer_name IS NOT NULL
  `);
  console.log(`Linked ${custResult.rowCount} shipments to customers`);
}

async function importPackageItems(csvPath) {
  console.log(`\nImporting package items from ${csvPath}...`);
  const raw = fs.readFileSync(csvPath, 'utf-8');
  const records = parse(raw, { columns: true, skip_empty_lines: true, trim: true });
  console.log(`Parsed ${records.length} package item records`);

  const BATCH = 50;
  let processed = 0, errors = 0;

  for (let i = 0; i < records.length; i += BATCH) {
    const batch = records.slice(i, i + BATCH);
    const values = [];
    const params = [];
    let pIdx = 1;

    for (const r of batch) {
      const cols = Object.keys(r);
      const pNums = [];
      for (const val of [
        esc(r['PackageItemID']), esc(r['Packing Number']),
        esc(r['Packing Date']) || null, esc(r['SO Number']),
        esc(r['Customer Name']), (r['Status'] || '').toLowerCase(),
        esc(r['Item Name']), r['Quantity Packed'] ? parseFloat(r['Quantity Packed']) : null,
        esc(r['SKU']), r['Item Price'] ? parseFloat(r['Item Price']) : null,
        esc(r[cols[27]]) || null, esc(r[cols[28]]) || null,
        esc(r['Shipping City']), esc(r['Shipping State']),
        esc(r['Shipping Country']), esc(r['Shipping Code']),
        esc(r['Shipping Phone']), esc(r['Shipping Attention']),
      ]) {
        params.push(val);
        pNums.push(`$${pIdx++}`);
      }
      values.push(`(${pNums.join(',')})`);
    }

    try {
      await pool.query(`
        INSERT INTO package_items (
          zoho_package_item_id, packing_number,
          packing_date, salesorder_number,
          customer_name, status,
          item_name, quantity_packed,
          sku, item_price,
          shipping_address, shipping_street2,
          shipping_city, shipping_state,
          shipping_country, shipping_code,
          shipping_phone, shipping_attention
        ) VALUES ${values.join(',')}
        ON CONFLICT (zoho_package_item_id) DO UPDATE SET
          status = EXCLUDED.status,
          quantity_packed = COALESCE(EXCLUDED.quantity_packed, package_items.quantity_packed),
          item_price = COALESCE(EXCLUDED.item_price, package_items.item_price),
          packing_number = EXCLUDED.packing_number,
          updated_at = NOW()
      `, params);

      processed += batch.length;
    } catch (err) {
      errors += batch.length;
      if (errors <= 200) console.error(`Error on batch starting at row ${i}:`, err.message);
    }

    if ((i + BATCH) % 2000 === 0 || i + BATCH >= records.length) {
      console.log(`  Package items: ${Math.min(i + BATCH, records.length)}/${records.length}`);
    }
  }

  console.log(`Package items: ${processed} processed, ${errors} errors`);

  // Link shipment_id
  console.log('Linking package items to shipments...');
  const linkResult = await pool.query(`
    UPDATE package_items pi SET shipment_id = s.id
    FROM shipments s
    WHERE s.packing_number = pi.packing_number
    AND pi.shipment_id IS NULL
  `);
  console.log(`Linked ${linkResult.rowCount} package items to shipments`);

  // Link order_id
  console.log('Linking package items to orders...');
  const orderResult = await pool.query(`
    UPDATE package_items pi SET order_id = o.id
    FROM orders o
    WHERE o.salesorder_number = pi.salesorder_number
    AND pi.order_id IS NULL
    AND pi.salesorder_number IS NOT NULL
  `);
  console.log(`Linked ${orderResult.rowCount} package items to orders`);

  // Link order_line_item_id
  console.log('Linking package items to order line items...');
  const oliResult = await pool.query(`
    UPDATE package_items pi SET order_line_item_id = oli.id
    FROM order_line_items oli
    WHERE oli.order_id = pi.order_id
    AND oli.sku = pi.sku
    AND pi.order_line_item_id IS NULL
    AND pi.sku IS NOT NULL
    AND pi.order_id IS NOT NULL
  `);
  console.log(`Linked ${oliResult.rowCount} package items to order line items`);
}

async function alignStatuses() {
  console.log('\nAligning stale packages...');
  const result = await pool.query(`
    UPDATE shipments s SET warehouse_status = 'delivered'
    FROM orders o
    WHERE o.id = s.order_id
    AND o.status IN ('fulfilled', 'closed')
    AND s.warehouse_status IN ('not_shipped', 'sent_to_packing')
  `);
  console.log(`Aligned ${result.rowCount} stale packages to delivered`);
}

async function printStats() {
  const { rows: statusCounts } = await pool.query(
    `SELECT warehouse_status, count(*) FROM shipments GROUP BY warehouse_status ORDER BY count(*) DESC`
  );
  console.log('\nFinal warehouse_status distribution:');
  for (const row of statusCounts) {
    console.log(`  ${row.warehouse_status}: ${row.count}`);
  }

  const { rows: [piTotal] } = await pool.query(`SELECT count(*) FROM package_items`);
  const { rows: [piLinked] } = await pool.query(`SELECT count(*) FROM package_items WHERE shipment_id IS NOT NULL`);
  const { rows: [piOli] } = await pool.query(`SELECT count(*) FROM package_items WHERE order_line_item_id IS NOT NULL`);
  console.log(`\nPackage items: ${piTotal.count} total, ${piLinked.count} linked to shipments, ${piOli.count} linked to line items`);
}

async function run() {
  const start = Date.now();
  console.log('=== Batch CSV Import ===\n');

  try {
    await importShipments('/home/alastair/Downloads/Shipment_Order.csv');
    await importPackageItems('/home/alastair/Downloads/Package.csv');
    await alignStatuses();
    await printStats();

    const elapsed = ((Date.now() - start) / 1000).toFixed(1);
    console.log(`\n=== Done in ${elapsed}s ===`);
  } catch (err) {
    console.error('Fatal error:', err);
  } finally {
    await pool.end();
  }
}

run();
