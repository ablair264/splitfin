/**
 * Full package + shipment sync from Zoho Inventory → Neon
 *
 * Fetches ALL packages (not just today) and upserts into:
 *   - shipments (one row per packing_number)
 *   - package_items (one row per line item)
 *
 * Also fetches shipments from Zoho and links them to packages.
 *
 * Usage: node backend/src/scripts/sync-packages-full.js [--days=30] [--all]
 *   --days=N   Sync packages modified in last N days (default: 90)
 *   --all      Sync ALL packages (ignores --days)
 */

import dotenv from 'dotenv';
dotenv.config();

import { zohoAuth } from '../config/zoho.js';
import { query, pool } from '../config/database.js';
import { logger } from '../utils/logger.js';

const args = process.argv.slice(2);
const syncAll = args.includes('--all');
const daysArg = args.find(a => a.startsWith('--days='));
const days = daysArg ? parseInt(daysArg.split('=')[1]) : 90;

const STATUS_ORDER = ['not_shipped', 'sent_to_packing', 'packed', 'delivery_booked', 'shipped', 'delivered'];

function mapWarehouseStatus(zohoStatus) {
  const map = {
    'not_shipped': 'sent_to_packing',
    'packed': 'packed',
    'shipped': 'shipped',
    'delivered': 'delivered',
  };
  return map[zohoStatus?.toLowerCase()] || 'sent_to_packing';
}

async function fetchAllPackages() {
  const allPackages = [];
  let page = 1;
  let hasMore = true;

  logger.info(syncAll ? 'Fetching ALL packages from Zoho...' : `Fetching packages from last ${days} days...`);

  while (hasMore) {
    try {
      const params = { page, per_page: 200 };

      if (!syncAll) {
        const since = new Date();
        since.setDate(since.getDate() - days);
        params.date_start = since.toISOString().split('T')[0];
        params.date_end = new Date().toISOString().split('T')[0];
      }

      const response = await zohoAuth.getInventoryData('packages', params);
      const packages = response.packages || [];
      allPackages.push(...packages);

      hasMore = response.page_context?.has_more_page || false;
      page++;

      if (page % 5 === 0) {
        logger.info(`  Fetched ${allPackages.length} packages so far (page ${page})...`);
      }

      if (hasMore) await delay(300);
    } catch (error) {
      logger.error(`Error fetching packages page ${page}:`, error.message);
      break;
    }
  }

  logger.info(`Fetched ${allPackages.length} packages from Zoho`);
  return allPackages;
}

async function fetchAllShipments() {
  const allShipments = [];
  let page = 1;
  let hasMore = true;

  logger.info(syncAll ? 'Fetching ALL shipments from Zoho...' : `Fetching shipments from last ${days} days...`);

  while (hasMore) {
    try {
      const params = { page, per_page: 200 };

      if (!syncAll) {
        const since = new Date();
        since.setDate(since.getDate() - days);
        params.date_start = since.toISOString().split('T')[0];
        params.date_end = new Date().toISOString().split('T')[0];
      }

      const response = await zohoAuth.getInventoryData('shipmentorders', params);
      const shipments = response.shipmentorders || [];
      allShipments.push(...shipments);

      hasMore = response.page_context?.has_more_page || false;
      page++;

      if (page % 5 === 0) {
        logger.info(`  Fetched ${allShipments.length} shipments so far (page ${page})...`);
      }

      if (hasMore) await delay(300);
    } catch (error) {
      logger.error(`Error fetching shipments page ${page}:`, error.message);
      break;
    }
  }

  logger.info(`Fetched ${allShipments.length} shipments from Zoho`);
  return allShipments;
}

async function lookupOrderId(salesorderNumber) {
  if (!salesorderNumber) return null;
  const { rows } = await query(
    'SELECT id FROM orders WHERE salesorder_number = $1 LIMIT 1',
    [salesorderNumber]
  );
  return rows[0]?.id || null;
}

async function lookupCustomerId(zohoCustomerId) {
  if (!zohoCustomerId) return null;
  const { rows } = await query(
    'SELECT id FROM customers WHERE zoho_contact_id = $1 LIMIT 1',
    [String(zohoCustomerId)]
  );
  return rows[0]?.id || null;
}

async function upsertShipmentFromPackage(pkg, orderId, customerId) {
  const packingNumber = pkg.package_number;
  const zohoPackageId = String(pkg.package_id);
  const warehouseStatus = mapWarehouseStatus(pkg.status);

  // Check if shipment exists by packing_number or zoho_shipment_id
  const { rows: existing } = await query(
    `SELECT id, warehouse_status FROM shipments WHERE packing_number = $1 OR zoho_shipment_id = $2 LIMIT 1`,
    [packingNumber, zohoPackageId]
  );

  if (existing[0]) {
    // Update — preserve warehouse_status if it's more advanced
    const currentIdx = STATUS_ORDER.indexOf(existing[0].warehouse_status || 'not_shipped');
    const newIdx = STATUS_ORDER.indexOf(warehouseStatus);
    const finalStatus = newIdx > currentIdx ? warehouseStatus : existing[0].warehouse_status;

    await query(
      `UPDATE shipments SET
        zoho_shipment_id = COALESCE($1, zoho_shipment_id),
        status = $2,
        warehouse_status = $3,
        shipment_date = $4,
        salesorder_number = $5,
        customer_name = $6,
        order_id = COALESCE($7, order_id),
        customer_id = COALESCE($8, customer_id),
        carrier_name = COALESCE($9, carrier_name),
        tracking_number = COALESCE($10, tracking_number),
        shipping_address = $11,
        shipping_city = $12,
        shipping_state = $13,
        shipping_country = $14,
        shipping_code = $15,
        updated_at = NOW()
      WHERE id = $16`,
      [
        zohoPackageId,
        pkg.status || 'not_shipped',
        finalStatus,
        pkg.date || null,
        pkg.salesorder_number || null,
        pkg.customer_name || null,
        orderId,
        customerId,
        pkg.delivery_method || null,
        pkg.tracking_number || null,
        pkg.shipping_address?.address || null,
        pkg.shipping_address?.city || null,
        pkg.shipping_address?.state || null,
        pkg.shipping_address?.country || null,
        pkg.shipping_address?.zip || null,
        existing[0].id,
      ]
    );
    return { id: existing[0].id, action: 'updated' };
  } else {
    // Insert
    const { rows: [created] } = await query(
      `INSERT INTO shipments (
        zoho_shipment_id, packing_number, shipment_date, status, warehouse_status,
        salesorder_number, customer_name, order_id, customer_id,
        carrier_name, tracking_number,
        shipping_address, shipping_city, shipping_state, shipping_country, shipping_code,
        created_at, updated_at
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,NOW(),NOW())
      RETURNING id`,
      [
        zohoPackageId,
        packingNumber,
        pkg.date || null,
        pkg.status || 'not_shipped',
        warehouseStatus,
        pkg.salesorder_number || null,
        pkg.customer_name || null,
        orderId,
        customerId,
        pkg.delivery_method || null,
        pkg.tracking_number || null,
        pkg.shipping_address?.address || null,
        pkg.shipping_address?.city || null,
        pkg.shipping_address?.state || null,
        pkg.shipping_address?.country || null,
        pkg.shipping_address?.zip || null,
      ]
    );
    return { id: created.id, action: 'created' };
  }
}

async function upsertPackageItems(pkg, shipmentId, orderId) {
  const lineItems = pkg.line_items || [];
  let created = 0;
  let updated = 0;

  for (const item of lineItems) {
    const zohoItemId = item.line_item_id ? String(item.line_item_id) : null;

    // Check existing by zoho_package_item_id or by packing_number + sku
    let existingId = null;
    if (zohoItemId) {
      const { rows } = await query(
        `SELECT id FROM package_items WHERE zoho_package_item_id = $1 LIMIT 1`,
        [zohoItemId]
      );
      existingId = rows[0]?.id;
    }
    if (!existingId) {
      const { rows } = await query(
        `SELECT id FROM package_items WHERE packing_number = $1 AND sku = $2 AND shipment_id = $3 LIMIT 1`,
        [pkg.package_number, item.sku || null, shipmentId]
      );
      existingId = rows[0]?.id;
    }

    // Look up order_line_item_id
    let orderLineItemId = null;
    if (orderId && item.sku) {
      const { rows } = await query(
        `SELECT id FROM order_line_items WHERE order_id = $1 AND sku = $2 LIMIT 1`,
        [orderId, item.sku]
      );
      orderLineItemId = rows[0]?.id;
    }

    if (existingId) {
      await query(
        `UPDATE package_items SET
          zoho_package_item_id = COALESCE($1, zoho_package_item_id),
          quantity_packed = $2,
          item_name = COALESCE($3, item_name),
          status = $4,
          shipment_id = $5,
          order_id = COALESCE($6, order_id),
          order_line_item_id = COALESCE($7, order_line_item_id),
          updated_at = NOW()
        WHERE id = $8`,
        [
          zohoItemId,
          parseInt(item.quantity) || 0,
          item.name || null,
          pkg.status || 'not_shipped',
          shipmentId,
          orderId,
          orderLineItemId,
          existingId,
        ]
      );
      updated++;
    } else {
      await query(
        `INSERT INTO package_items (
          zoho_package_item_id, packing_number, packing_date, salesorder_number,
          customer_name, status, item_name, quantity_packed, sku,
          order_id, shipment_id, order_line_item_id,
          shipping_address, shipping_city, shipping_state, shipping_country, shipping_code,
          created_at, updated_at
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,NOW(),NOW())`,
        [
          zohoItemId,
          pkg.package_number,
          pkg.date || null,
          pkg.salesorder_number || null,
          pkg.customer_name || null,
          pkg.status || 'not_shipped',
          item.name || null,
          parseInt(item.quantity) || 0,
          item.sku || null,
          orderId,
          shipmentId,
          orderLineItemId,
          pkg.shipping_address?.address || null,
          pkg.shipping_address?.city || null,
          pkg.shipping_address?.state || null,
          pkg.shipping_address?.country || null,
          pkg.shipping_address?.zip || null,
        ]
      );
      created++;
    }
  }

  return { created, updated };
}

async function updateShipmentsFromZohoShipments(zohoShipments) {
  let updated = 0;
  let skipped = 0;

  for (const shipment of zohoShipments) {
    const packingNumber = shipment.package_number;
    if (!packingNumber) { skipped++; continue; }

    // Find matching shipment in our DB
    const { rows } = await query(
      `SELECT id, warehouse_status FROM shipments WHERE packing_number = $1 LIMIT 1`,
      [packingNumber]
    );

    if (!rows[0]) { skipped++; continue; }

    const currentStatus = rows[0].warehouse_status;
    let newWarehouseStatus = currentStatus;

    // Shipment in Zoho means it's at least shipped
    if (shipment.status === 'delivered') {
      newWarehouseStatus = 'delivered';
    } else if (['shipped', 'in_transit'].includes(shipment.status)) {
      const currentIdx = STATUS_ORDER.indexOf(currentStatus);
      const shippedIdx = STATUS_ORDER.indexOf('shipped');
      if (shippedIdx > currentIdx) newWarehouseStatus = 'shipped';
    }

    await query(
      `UPDATE shipments SET
        warehouse_status = $1,
        carrier_name = COALESCE($2, carrier_name),
        tracking_number = COALESCE($3, tracking_number),
        shipment_date = COALESCE($4, shipment_date),
        expected_delivery_date = COALESCE($5, expected_delivery_date),
        delivery_date = COALESCE($6, delivery_date),
        shipment_number = COALESCE($7, shipment_number),
        updated_at = NOW()
      WHERE id = $8`,
      [
        newWarehouseStatus,
        shipment.delivery_method || null,
        shipment.tracking_number || null,
        shipment.shipment_date || null,
        shipment.delivery_date || null,
        shipment.delivered_date || null,
        shipment.shipment_number || null,
        rows[0].id,
      ]
    );
    updated++;
  }

  return { updated, skipped };
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function run() {
  const startTime = Date.now();
  logger.info('=== Full Package & Shipment Sync ===');

  try {
    // 1. Fetch packages from Zoho
    const packages = await fetchAllPackages();

    // 2. Process each package
    let shipmentsCreated = 0, shipmentsUpdated = 0;
    let itemsCreated = 0, itemsUpdated = 0;
    let errors = 0;

    for (let i = 0; i < packages.length; i++) {
      const pkg = packages[i];
      try {
        const orderId = await lookupOrderId(pkg.salesorder_number);
        const customerId = await lookupCustomerId(pkg.customer_id);

        const shipResult = await upsertShipmentFromPackage(pkg, orderId, customerId);
        if (shipResult.action === 'created') shipmentsCreated++;
        else shipmentsUpdated++;

        const itemResult = await upsertPackageItems(pkg, shipResult.id, orderId);
        itemsCreated += itemResult.created;
        itemsUpdated += itemResult.updated;

        if ((i + 1) % 50 === 0) {
          logger.info(`  Processed ${i + 1}/${packages.length} packages...`);
        }
      } catch (err) {
        errors++;
        logger.error(`Error processing package ${pkg.package_number}:`, err.message);
      }
    }

    logger.info(`Package sync: ${shipmentsCreated} shipments created, ${shipmentsUpdated} updated`);
    logger.info(`Package items: ${itemsCreated} created, ${itemsUpdated} updated`);
    logger.info(`Errors: ${errors}`);

    // 3. Fetch and apply Zoho shipments (carrier/tracking/delivery data)
    const zohoShipments = await fetchAllShipments();
    const shipUpdateResult = await updateShipmentsFromZohoShipments(zohoShipments);
    logger.info(`Shipment status updates: ${shipUpdateResult.updated} updated, ${shipUpdateResult.skipped} skipped`);

    // 4. Final: align warehouse_status for fully shipped/delivered orders
    const { rows: aligned } = await query(`
      UPDATE shipments s SET warehouse_status = 'delivered'
      FROM orders o
      WHERE o.id = s.order_id
      AND o.status IN ('fulfilled', 'closed')
      AND s.warehouse_status IN ('not_shipped', 'sent_to_packing')
      RETURNING s.id
    `);
    logger.info(`Aligned ${aligned.length} stale packages to 'delivered' (order was fulfilled/closed)`);

    // 5. Stats
    const { rows: statusCounts } = await query(
      `SELECT warehouse_status, count(*) FROM shipments GROUP BY warehouse_status ORDER BY count(*) DESC`
    );
    logger.info('Final warehouse_status distribution:');
    for (const row of statusCounts) {
      logger.info(`  ${row.warehouse_status}: ${row.count}`);
    }

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    logger.info(`=== Sync complete in ${elapsed}s ===`);
  } catch (err) {
    logger.error('Fatal sync error:', err);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

run();
