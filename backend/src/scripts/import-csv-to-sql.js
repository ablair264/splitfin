/**
 * Generates SQL upsert files from Zoho CSVs for direct execution against Neon.
 *
 * Usage: node backend/src/scripts/import-csv-to-sql.js
 *
 * Outputs:
 *   /tmp/shipments-upsert.sql  (batch upsert for shipments)
 *   /tmp/package-items-upsert.sql (batch upsert for package_items)
 */

import fs from 'fs';
import { parse } from 'csv-parse/sync';

function escSql(val) {
  if (val === null || val === undefined || val === '') return 'NULL';
  return `'${String(val).replace(/'/g, "''")}'`;
}

function escNum(val) {
  if (val === null || val === undefined || val === '') return 'NULL';
  const n = parseFloat(val);
  return isNaN(n) ? 'NULL' : String(n);
}

function escDate(val) {
  if (!val || val === '') return 'NULL';
  return escSql(val);
}

function mapWarehouseStatus(status) {
  const s = (status || '').toLowerCase();
  if (s === 'delivered') return 'delivered';
  if (s === 'shipped') return 'shipped';
  if (s === 'packed') return 'packed';
  return 'sent_to_packing';
}

// ── Generate Shipments SQL ──────────────────────────────────────────

function generateShipmentsSql(csvPath) {
  const raw = fs.readFileSync(csvPath, 'utf-8');
  const records = parse(raw, { columns: true, skip_empty_lines: true, trim: true });

  const lines = [];
  const BATCH = 100;

  for (let i = 0; i < records.length; i += BATCH) {
    const batch = records.slice(i, i + BATCH);

    const values = batch.map(r => {
      const ws = mapWarehouseStatus(r['Status']);
      return `(
        ${escSql(r['Shipment ID'])}, ${escSql(r['Packing Number'])},
        ${escDate(r['Shipment Date'])}, ${escSql(r['Shipment Number'])},
        ${escSql((r['Status'] || '').toLowerCase())}, ${escSql(ws)},
        ${escSql(r['Shipment Type'])}, ${escSql(r['Carrier Name'])},
        ${escSql(r['Tracking Number'])}, ${escNum(r['Shipping Charge'])},
        ${escSql(r['Sales Order ID'])}, ${escSql(r['SO Number'])},
        ${escSql(r['Customer Name'])},
        ${escDate(r['Expected Delivery Date'])}, ${escDate(r['Delivery Date'])},
        ${escSql(r['Notes'])},
        ${escSql(r['Shipping Address'])}, ${escSql(r['Shipping Street2'])},
        ${escSql(r['Shipping City'])}, ${escSql(r['Shipping State'])},
        ${escSql(r['Shipping Country'])}, ${escSql(r['Shipping Code'])},
        ${escSql(r['Shipping Phone'])}, ${escSql(r['shipping_attention'])},
        ${escDate(r['Created Time'])}, ${escDate(r['Last Modified Time'])}
      )`;
    }).join(',\n');

    lines.push(`
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
) VALUES ${values}
ON CONFLICT (packing_number) DO UPDATE SET
  zoho_shipment_id = COALESCE(EXCLUDED.zoho_shipment_id, shipments.zoho_shipment_id),
  status = EXCLUDED.status,
  warehouse_status = CASE
    WHEN array_position(ARRAY['not_shipped','sent_to_packing','packed','delivery_booked','shipped','delivered'], EXCLUDED.warehouse_status)
       > array_position(ARRAY['not_shipped','sent_to_packing','packed','delivery_booked','shipped','delivered'], shipments.warehouse_status)
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
  updated_at = NOW();
`);
  }

  return lines;
}

// ── Generate Package Items SQL ──────────────────────────────────────

function generatePackageItemsSql(csvPath) {
  const raw = fs.readFileSync(csvPath, 'utf-8');
  const records = parse(raw, { columns: true, skip_empty_lines: true, trim: true });

  const lines = [];
  const BATCH = 100;

  for (let i = 0; i < records.length; i += BATCH) {
    const batch = records.slice(i, i + BATCH);

    const values = batch.map(r => {
      // CSV has duplicate "Shipping Address" columns — use index-based access for shipping
      const cols = Object.keys(r);
      const shippingAddr = r[cols[27]] || null; // First Shipping Address
      const shippingStreet2 = r[cols[28]] || null; // Second Shipping Address

      return `(
        ${escSql(r['PackageItemID'])}, ${escSql(r['Packing Number'])},
        ${escDate(r['Packing Date'])}, ${escSql(r['SO Number'])},
        ${escSql(r['Customer Name'])}, ${escSql((r['Status'] || '').toLowerCase())},
        ${escSql(r['Item Name'])}, ${escNum(r['Quantity Packed'])},
        ${escSql(r['SKU'])}, ${escNum(r['Item Price'])},
        ${escSql(shippingAddr)}, ${escSql(shippingStreet2)},
        ${escSql(r['Shipping City'])}, ${escSql(r['Shipping State'])},
        ${escSql(r['Shipping Country'])}, ${escSql(r['Shipping Code'])},
        ${escSql(r['Shipping Phone'])}, ${escSql(r['Shipping Attention'])}
      )`;
    }).join(',\n');

    lines.push(`
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
) VALUES ${values}
ON CONFLICT (zoho_package_item_id) DO UPDATE SET
  status = EXCLUDED.status,
  quantity_packed = EXCLUDED.quantity_packed,
  item_price = COALESCE(EXCLUDED.item_price, package_items.item_price),
  updated_at = NOW();
`);
  }

  return lines;
}

// ── Main ────────────────────────────────────────────────────────────

const shipmentsSql = generateShipmentsSql('/home/alastair/Downloads/Shipment_Order.csv');
fs.writeFileSync('/tmp/shipments-upsert.sql', shipmentsSql.join('\n'));
console.log(`Generated ${shipmentsSql.length} shipment batches → /tmp/shipments-upsert.sql`);

const packageSql = generatePackageItemsSql('/home/alastair/Downloads/Package.csv');
fs.writeFileSync('/tmp/package-items-upsert.sql', packageSql.join('\n'));
console.log(`Generated ${packageSql.length} package item batches → /tmp/package-items-upsert.sql`);
