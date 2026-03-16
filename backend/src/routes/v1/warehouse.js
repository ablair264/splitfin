// backend/src/routes/v1/warehouse.js
import express from 'express';
import { query, getById, pool } from '../../config/database.js';
import { logger } from '../../utils/logger.js';

const router = express.Router();

// ── Allowed sort columns ────────────────────────────────────────────
const PACKAGE_SORT_COLUMNS = {
  created_at: 'created_at',
  packing_number: 'packing_number',
  warehouse_status: 'warehouse_status',
};

// ── Authorization helper ────────────────────────────────────────────
function isAdmin(req) {
  return req.agent?.is_admin === true;
}

function isWarehouseOrAdmin(req) {
  return isAdmin(req) || req.agent?.role === 'warehouse';
}

// ── Status state machine ────────────────────────────────────────────
const STATUS_ORDER = ['not_shipped', 'sent_to_packing', 'packed', 'delivery_booked', 'shipped', 'delivered'];

function isValidTransition(from, to) {
  const fromIdx = STATUS_ORDER.indexOf(from);
  const toIdx = STATUS_ORDER.indexOf(to);
  if (fromIdx === -1 || toIdx === -1) return false;
  // Forward one step, or back one step for corrections
  return toIdx === fromIdx + 1 || toIdx === fromIdx - 1;
}

// ── GET /packages?order_id=X ────────────────────────────────────────
router.get('/packages', async (req, res) => {
  try {
    const { order_id } = req.query;
    if (!order_id) {
      return res.status(400).json({ error: 'order_id is required' });
    }

    // Get shipments (packages) for this order
    const { rows: packages } = await query(
      `SELECT s.*, o.salesorder_number, o.customer_name, o.total as order_total
       FROM shipments s
       LEFT JOIN orders o ON o.id = s.order_id
       WHERE s.order_id = $1
       ORDER BY s.created_at DESC`,
      [order_id]
    );

    // Get package items for each shipment
    const shipmentIds = packages.map(p => p.id);
    let items = [];
    if (shipmentIds.length > 0) {
      const { rows } = await query(
        `SELECT pi.*, oli.quantity as ordered_quantity, oli.name as line_item_name
         FROM package_items pi
         LEFT JOIN order_line_items oli ON oli.id = pi.order_line_item_id
         WHERE pi.shipment_id = ANY($1::int[])
         ORDER BY pi.id`,
        [shipmentIds]
      );
      items = rows;
    }

    // Group items by shipment
    const packagesWithItems = packages.map(pkg => ({
      ...pkg,
      items: items.filter(i => i.shipment_id === pkg.id),
    }));

    res.json({ data: packagesWithItems });
  } catch (err) {
    logger.error('Error fetching packages:', err);
    res.status(500).json({ error: 'Failed to fetch packages' });
  }
});

// ── GET /packages/:id ───────────────────────────────────────────────
router.get('/packages/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const { rows: [pkg] } = await query(
      `SELECT s.*, o.salesorder_number, o.customer_name, o.total as order_total,
              o.shipping_address_json, o.zoho_salesorder_id
       FROM shipments s
       LEFT JOIN orders o ON o.id = s.order_id
       WHERE s.id = $1`,
      [id]
    );

    if (!pkg) {
      return res.status(404).json({ error: 'Package not found' });
    }

    const { rows: items } = await query(
      `SELECT pi.*, oli.quantity as ordered_quantity, oli.name as line_item_name, oli.rate
       FROM package_items pi
       LEFT JOIN order_line_items oli ON oli.id = pi.order_line_item_id
       WHERE pi.shipment_id = $1
       ORDER BY pi.id`,
      [id]
    );

    res.json({ data: { ...pkg, items } });
  } catch (err) {
    logger.error('Error fetching package:', err);
    res.status(500).json({ error: 'Failed to fetch package' });
  }
});

// ── POST /packages ──────────────────────────────────────────────────
router.post('/packages', async (req, res) => {
  const client = await pool.connect();

  try {
    const { order_id, line_items, shipping_address } = req.body;
    const agentId = req.agent?.id || null;

    if (!order_id || !line_items || !Array.isArray(line_items) || line_items.length === 0) {
      return res.status(400).json({ error: 'order_id and line_items are required' });
    }

    await client.query('BEGIN');

    // 1. Validate order exists
    const { rows: [order] } = await client.query(
      `SELECT id, salesorder_number, customer_name, zoho_customer_id, zoho_salesorder_id,
              shipping_address_json, status
       FROM orders WHERE id = $1`,
      [order_id]
    );

    if (!order) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Order not found' });
    }

    // Authorization: order must belong to agent, or agent is admin
    if (!isAdmin(req) && order.agent_id && order.agent_id !== agentId) {
      await client.query('ROLLBACK');
      return res.status(403).json({ error: 'Not authorized to create packages for this order' });
    }

    // 2. Lock and validate line items
    const oliIds = line_items.map(li => li.order_line_item_id);
    const { rows: lockedItems } = await client.query(
      `SELECT id, sku, name, quantity, quantity_shipped, zoho_item_id
       FROM order_line_items
       WHERE id = ANY($1::int[]) AND order_id = $2
       FOR UPDATE`,
      [oliIds, order_id]
    );

    if (lockedItems.length !== oliIds.length) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Some line items not found for this order' });
    }

    // Validate quantities
    for (const li of line_items) {
      const oli = lockedItems.find(r => r.id === li.order_line_item_id);
      const remaining = oli.quantity - (oli.quantity_shipped || 0);
      if (li.quantity > remaining) {
        await client.query('ROLLBACK');
        return res.status(400).json({
          error: `Cannot allocate ${li.quantity} of ${oli.name} — only ${remaining} remaining`,
        });
      }
    }

    // 3. Generate packing number
    const { rows: [{ nextval: seqVal }] } = await client.query(
      `SELECT nextval('packing_number_seq')`
    );
    const packingNumber = `PKG-${String(seqVal).padStart(5, '0')}`;

    // 4. Resolve shipping address
    const addr = shipping_address || (order.shipping_address_json ? JSON.parse(
      typeof order.shipping_address_json === 'string'
        ? order.shipping_address_json
        : JSON.stringify(order.shipping_address_json)
    ) : {});

    // 5. Insert shipments row
    const { rows: [shipment] } = await client.query(
      `INSERT INTO shipments (
        zoho_shipment_id, packing_number, shipment_date, status,
        warehouse_status, sync_status, salesorder_number, customer_name,
        shipping_address, shipping_street2, shipping_city, shipping_state,
        shipping_country, shipping_code, shipping_phone, shipping_attention,
        order_id, sent_to_packing_at, sent_to_packing_by, created_at, updated_at
      ) VALUES (
        NULL, $1, CURRENT_DATE, 'not_shipped',
        'sent_to_packing', 'pending_push', $2, $3,
        $4, $5, $6, $7,
        $8, $9, $10, $11,
        $12, NOW(), $13, NOW(), NOW()
      ) RETURNING *`,
      [
        packingNumber, order.salesorder_number, order.customer_name,
        addr.address || addr.street || null,
        addr.street2 || null,
        addr.city || null,
        addr.state || null,
        addr.country || null,
        addr.zip || addr.code || null,
        addr.phone || null,
        addr.attention || null,
        order_id, agentId,
      ]
    );

    // 6. Insert package_items rows
    const insertedItems = [];
    for (const li of line_items) {
      const oli = lockedItems.find(r => r.id === li.order_line_item_id);
      const { rows: [item] } = await client.query(
        `INSERT INTO package_items (
          zoho_package_item_id, packing_number, packing_date, salesorder_number,
          customer_name, status, item_name, quantity_packed, sku, order_id,
          shipment_id, order_line_item_id, created_at, updated_at
        ) VALUES (
          NULL, $1, CURRENT_DATE, $2,
          $3, 'not_shipped', $4, $5, $6, $7,
          $8, $9, NOW(), NOW()
        ) RETURNING *`,
        [
          packingNumber, order.salesorder_number,
          order.customer_name, oli.name, li.quantity, oli.sku, order_id,
          shipment.id, li.order_line_item_id,
        ]
      );
      insertedItems.push(item);
    }

    // 7. Update order_line_items.quantity_shipped
    for (const li of line_items) {
      await client.query(
        `UPDATE order_line_items
         SET quantity_shipped = COALESCE(quantity_shipped, 0) + $1, updated_at = NOW()
         WHERE id = $2`,
        [li.quantity, li.order_line_item_id]
      );
    }

    // 8. Update orders.shipped_status
    const { rows: [{ all_shipped }] } = await client.query(
      `SELECT BOOL_AND(quantity_shipped >= quantity) as all_shipped
       FROM order_line_items WHERE order_id = $1`,
      [order_id]
    );

    await client.query(
      `UPDATE orders SET shipped_status = $1, updated_at = NOW() WHERE id = $2`,
      [all_shipped ? 'shipped' : 'partially_shipped', order_id]
    );

    await client.query('COMMIT');

    // 9. Return created package
    res.status(201).json({
      data: { ...shipment, items: insertedItems },
      message: `Package ${packingNumber} created successfully`,
    });

    // 10. Async Zoho push (fire-and-forget, logged on failure)
    try {
      const { rows: zohoItems } = await query(
        `SELECT oli.zoho_line_item_id, pi.quantity_packed as quantity
         FROM package_items pi
         JOIN order_line_items oli ON oli.id = pi.order_line_item_id
         WHERE pi.shipment_id = $1`,
        [shipment.id]
      );

      if (order.zoho_salesorder_id && zohoItems.length > 0 && zohoItems[0].zoho_line_item_id) {
        const { createZohoPackage } = await import('../../api/zoho.js');
        const zohoResult = await createZohoPackage(order.zoho_salesorder_id, zohoItems);
        if (zohoResult?.package) {
          await query(
            `UPDATE shipments SET zoho_shipment_id = $1, sync_status = 'synced', updated_at = NOW() WHERE id = $2`,
            [String(zohoResult.package.package_id), shipment.id]
          );
        }
      }
    } catch (zohoErr) {
      logger.warn('Zoho push failed (will retry):', zohoErr.message);
    }
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    logger.error('Error creating package:', err);
    res.status(500).json({ error: 'Failed to create package' });
  } finally {
    client.release();
  }
});

// ── PUT /packages/:id/status ────────────────────────────────────────
router.put('/packages/:id/status', async (req, res) => {
  try {
    const { id } = req.params;
    const { status: newStatus } = req.body;
    const agentId = req.agent?.id || null;

    if (!newStatus || !STATUS_ORDER.includes(newStatus)) {
      return res.status(400).json({ error: `Invalid status. Must be one of: ${STATUS_ORDER.join(', ')}` });
    }

    const pkg = await getById('shipments', id);
    if (!pkg) {
      return res.status(404).json({ error: 'Package not found' });
    }

    // Authorization: status updates require warehouse role or admin
    if (!isWarehouseOrAdmin(req)) {
      return res.status(403).json({ error: 'Warehouse or admin role required for status updates' });
    }

    if (!isValidTransition(pkg.warehouse_status, newStatus)) {
      return res.status(400).json({
        error: `Cannot transition from ${pkg.warehouse_status} to ${newStatus}`,
      });
    }

    // Build update fields
    const updates = { warehouse_status: newStatus };
    if (newStatus === 'sent_to_packing') {
      updates.sent_to_packing_at = new Date().toISOString();
      updates.sent_to_packing_by = agentId;
    } else if (newStatus === 'packed') {
      updates.packed_at = new Date().toISOString();
      updates.packed_by = agentId;
    } else if (newStatus === 'delivery_booked') {
      updates.delivery_booked_at = new Date().toISOString();
      updates.delivery_booked_by = agentId;
    }

    const keys = Object.keys(updates);
    const setClause = keys.map((k, i) => `${k} = $${i + 1}`).join(', ');
    const { rows: [updated] } = await query(
      `UPDATE shipments SET ${setClause}, updated_at = NOW() WHERE id = $${keys.length + 1} RETURNING *`,
      [...Object.values(updates), id]
    );

    res.json({ data: updated, message: `Status updated to ${newStatus}` });
  } catch (err) {
    logger.error('Error updating package status:', err);
    res.status(500).json({ error: 'Failed to update status' });
  }
});

// ── PUT /packages/:id/mark-packed ───────────────────────────────────
router.put('/packages/:id/mark-packed', async (req, res) => {
  try {
    const { id } = req.params;
    const agentId = req.agent?.id || null;

    const pkg = await getById('shipments', id);
    if (!pkg) return res.status(404).json({ error: 'Package not found' });

    // Update all package_items for this shipment
    await query(
      `UPDATE package_items SET status = 'packed', updated_at = NOW() WHERE shipment_id = $1`,
      [id]
    );

    // Update shipment status
    const { rows: [updated] } = await query(
      `UPDATE shipments SET warehouse_status = 'packed', packed_at = NOW(), packed_by = $1, updated_at = NOW()
       WHERE id = $2 RETURNING *`,
      [agentId, id]
    );

    res.json({ data: updated, message: 'Package marked as packed' });
  } catch (err) {
    logger.error('Error marking packed:', err);
    res.status(500).json({ error: 'Failed to mark as packed' });
  }
});

// ── PUT /packages/:id/scan ──────────────────────────────────────────
router.put('/packages/:id/scan', async (req, res) => {
  try {
    const { id } = req.params;
    const { code } = req.body;

    if (!code) return res.status(400).json({ error: 'code is required' });

    // Try matching by SKU on package_items, join order_line_items for expected quantity
    const { rows } = await query(
      `SELECT pi.*, oli.quantity as expected_quantity
       FROM package_items pi
       LEFT JOIN order_line_items oli ON oli.id = pi.order_line_item_id
       WHERE pi.shipment_id = $1 AND pi.sku = $2`,
      [id, code]
    );

    let item = rows[0];

    // If no match by SKU, try looking up in products table
    if (!item) {
      const { rows: products } = await query(
        `SELECT sku FROM products WHERE sku = $1 LIMIT 1`,
        [code]
      );
      if (products[0]) {
        const { rows: matched } = await query(
          `SELECT pi.*, oli.quantity as expected_quantity
           FROM package_items pi
           LEFT JOIN order_line_items oli ON oli.id = pi.order_line_item_id
           WHERE pi.shipment_id = $1 AND pi.sku = $2`,
          [id, products[0].sku]
        );
        item = matched[0];
      }
    }

    if (!item) {
      return res.json({ result: 'not_found', message: `No item found matching ${code}` });
    }

    // Use expected_quantity from order_line_items, fallback to a high limit if not linked
    const maxQty = item.expected_quantity || 9999;
    if ((item.quantity_packed || 0) >= maxQty) {
      return res.json({ result: 'already_complete', item });
    }

    // Increment quantity (scan one at a time)
    const { rows: [updated] } = await query(
      `UPDATE package_items SET quantity_packed = COALESCE(quantity_packed, 0) + 1, updated_at = NOW()
       WHERE id = $1 RETURNING *`,
      [item.id]
    );

    res.json({ result: 'matched', item: updated });
  } catch (err) {
    logger.error('Error scanning item:', err);
    res.status(500).json({ error: 'Failed to scan item' });
  }
});

// ── PUT /packages/:id/book-delivery ─────────────────────────────────
router.put('/packages/:id/book-delivery', async (req, res) => {
  try {
    const { id } = req.params;
    const { carrier_name, tracking_number, expected_delivery_date, notes } = req.body;
    const agentId = req.agent?.id || null;

    const pkg = await getById('shipments', id);
    if (!pkg) return res.status(404).json({ error: 'Package not found' });

    const { rows: [updated] } = await query(
      `UPDATE shipments SET
        warehouse_status = 'delivery_booked',
        carrier_name = COALESCE($1, carrier_name),
        tracking_number = COALESCE($2, tracking_number),
        expected_delivery_date = COALESCE($3, expected_delivery_date),
        notes = COALESCE($4, notes),
        delivery_booked_at = NOW(),
        delivery_booked_by = $5,
        updated_at = NOW()
       WHERE id = $6 RETURNING *`,
      [carrier_name, tracking_number, expected_delivery_date, notes, agentId, id]
    );

    res.json({ data: updated, message: 'Delivery booked' });
  } catch (err) {
    logger.error('Error booking delivery:', err);
    res.status(500).json({ error: 'Failed to book delivery' });
  }
});

// ── DELETE /packages/:id ────────────────────────────────────────────
router.delete('/packages/:id', async (req, res) => {
  const client = await pool.connect();
  try {
    const { id } = req.params;
    await client.query('BEGIN');

    // Authorization: delete is admin-only
    if (!isAdmin(req)) {
      await client.query('ROLLBACK');
      return res.status(403).json({ error: 'Admin role required to delete packages' });
    }

    const { rows: [pkg] } = await client.query(
      `SELECT * FROM shipments WHERE id = $1`, [id]
    );
    if (!pkg) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Package not found' });
    }

    if (!['not_shipped', 'sent_to_packing'].includes(pkg.warehouse_status)) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Can only delete packages in not_shipped or sent_to_packing status' });
    }

    // Rollback quantity_shipped on order_line_items
    const { rows: items } = await client.query(
      `SELECT * FROM package_items WHERE shipment_id = $1`, [id]
    );

    for (const item of items) {
      if (item.order_line_item_id) {
        await client.query(
          `UPDATE order_line_items
           SET quantity_shipped = GREATEST(0, COALESCE(quantity_shipped, 0) - $1), updated_at = NOW()
           WHERE id = $2`,
          [item.quantity_packed || 0, item.order_line_item_id]
        );
      }
    }

    // Delete package_items
    await client.query(`DELETE FROM package_items WHERE shipment_id = $1`, [id]);

    // Delete shipment
    await client.query(`DELETE FROM shipments WHERE id = $1`, [id]);

    // Recalculate orders.shipped_status
    if (pkg.order_id) {
      const { rows: [{ any_shipped }] } = await client.query(
        `SELECT BOOL_OR(quantity_shipped > 0) as any_shipped
         FROM order_line_items WHERE order_id = $1`,
        [pkg.order_id]
      );
      await client.query(
        `UPDATE orders SET shipped_status = $1, updated_at = NOW() WHERE id = $2`,
        [any_shipped ? 'partially_shipped' : 'pending', pkg.order_id]
      );
    }

    await client.query('COMMIT');
    res.json({ message: 'Package deleted' });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    logger.error('Error deleting package:', err);
    res.status(500).json({ error: 'Failed to delete package' });
  } finally {
    client.release();
  }
});

// ── GET /list — paginated, filterable package list ──────────────────
router.get('/list', async (req, res) => {
  try {
    const {
      search,
      warehouse_status,
      sort_by = 'created_at',
      sort_order = 'desc',
      limit = 50,
      offset = 0,
    } = req.query;

    const sortCol = PACKAGE_SORT_COLUMNS[sort_by] || 'created_at';
    const sortDir = sort_order === 'asc' ? 'ASC' : 'DESC';

    let where = `WHERE 1=1`;
    const params = [];
    let idx = 1;

    // Exclude delivered by default (unless explicitly requested)
    if (warehouse_status) {
      const statuses = warehouse_status.split(',').map(s => s.trim()).filter(Boolean);
      if (statuses.length === 1) {
        where += ` AND s.warehouse_status = $${idx++}`;
        params.push(statuses[0]);
      } else if (statuses.length > 1) {
        where += ` AND s.warehouse_status = ANY($${idx++}::text[])`;
        params.push(statuses);
      }
    } else {
      where += ` AND s.warehouse_status NOT IN ('delivered')`;
    }

    if (search) {
      where += ` AND (
        s.packing_number ILIKE $${idx} OR
        s.salesorder_number ILIKE $${idx} OR
        s.customer_name ILIKE $${idx} OR
        s.tracking_number ILIKE $${idx}
      )`;
      params.push(`%${search}%`);
      idx++;
    }

    // Count
    const countResult = await query(
      `SELECT count(*) FROM shipments s ${where}`,
      params
    );
    const total = parseInt(countResult.rows[0].count);

    // Data
    const dataParams = [...params, parseInt(limit), parseInt(offset)];
    const { rows } = await query(
      `SELECT s.id, s.packing_number, s.warehouse_status, s.status,
              s.carrier_name, s.tracking_number, s.shipment_date, s.created_at, s.updated_at,
              s.sent_to_packing_at, s.packed_at, s.delivery_booked_at,
              s.shipping_address, s.shipping_city, s.shipping_state, s.shipping_code, s.shipping_country,
              s.shipping_phone, s.shipping_attention,
              s.order_id, o.salesorder_number, o.customer_name, o.total as order_total, o.date as order_date,
              (SELECT count(*) FROM package_items pi WHERE pi.shipment_id = s.id) as item_count
       FROM shipments s
       LEFT JOIN orders o ON o.id = s.order_id
       ${where}
       ORDER BY s.${sortCol} ${sortDir}
       LIMIT $${idx++} OFFSET $${idx++}`,
      dataParams
    );

    res.json({
      data: rows,
      meta: { total, limit: parseInt(limit), offset: parseInt(offset), has_more: parseInt(offset) + rows.length < total },
    });
  } catch (err) {
    logger.error('Error fetching package list:', err);
    res.status(500).json({ error: 'Failed to fetch package list' });
  }
});

// ── GET /statuses — status counts for filter options ────────────────
router.get('/statuses', async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT warehouse_status, count(*) as count
       FROM shipments
       WHERE warehouse_status NOT IN ('delivered')
       GROUP BY warehouse_status
       ORDER BY count DESC`
    );
    res.json({ data: rows.map(r => ({ status: r.warehouse_status, count: parseInt(r.count) })) });
  } catch (err) {
    logger.error('Error fetching statuses:', err);
    res.status(500).json({ error: 'Failed to fetch statuses' });
  }
});

// ── GET /kanban ─────────────────────────────────────────────────────
router.get('/kanban', async (req, res) => {
  try {
    const maxAgeDays = parseInt(req.query.max_age_days) || 30;

    const { rows } = await query(
      `SELECT s.id, s.packing_number, s.warehouse_status, s.status,
              s.carrier_name, s.tracking_number, s.created_at, s.updated_at,
              s.sent_to_packing_at, s.packed_at, s.delivery_booked_at,
              s.order_id, o.salesorder_number, o.customer_name, o.total as order_total, o.date as order_date,
              (SELECT count(*) FROM package_items pi WHERE pi.shipment_id = s.id) as item_count
       FROM shipments s
       LEFT JOIN orders o ON o.id = s.order_id
       WHERE (
         -- Show all non-terminal statuses regardless of age
         s.warehouse_status IN ('not_shipped', 'sent_to_packing', 'packed', 'delivery_booked')
         OR
         -- Show shipped/delivered only within max_age_days
         (s.warehouse_status IN ('shipped', 'delivered') AND s.updated_at >= NOW() - ($1 || ' days')::interval)
       )
       ORDER BY s.created_at DESC`,
      [maxAgeDays]
    );

    // Group by warehouse_status
    const grouped = {
      not_shipped: [],
      sent_to_packing: [],
      packed: [],
      delivery_booked: [],
      shipped: [],
      delivered: [],
    };

    for (const row of rows) {
      const status = row.warehouse_status;
      if (grouped[status]) {
        grouped[status].push(row);
      }
    }

    res.json({ data: grouped });
  } catch (err) {
    logger.error('Error fetching kanban data:', err);
    res.status(500).json({ error: 'Failed to fetch kanban data' });
  }
});

// ── PUT /packages/:id/items ─────────────────────────────────────────
router.put('/packages/:id/items', async (req, res) => {
  try {
    const { id } = req.params;
    const { items } = req.body;

    if (!items || !Array.isArray(items)) {
      return res.status(400).json({ error: 'items array is required' });
    }

    const updated = [];
    for (const item of items) {
      const { rows: [row] } = await query(
        `UPDATE package_items SET
          quantity_packed = COALESCE($1, quantity_packed),
          updated_at = NOW()
         WHERE id = $2 AND shipment_id = $3 RETURNING *`,
        [item.quantity_packed, item.id, id]
      );
      if (row) updated.push(row);
    }

    res.json({ data: updated, message: `${updated.length} items updated` });
  } catch (err) {
    logger.error('Error updating package items:', err);
    res.status(500).json({ error: 'Failed to update items' });
  }
});

export default router;
