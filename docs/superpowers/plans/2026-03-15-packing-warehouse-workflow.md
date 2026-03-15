# Packing & Warehouse Workflow Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build full packing creation from ViewOrder, warehouse kanban with real data, barcode scanning, shipping booking, and bidirectional Zoho sync.

**Architecture:** Extend existing `shipments` + `package_items` tables with warehouse workflow columns. New `warehouse.js` backend route handles all package CRUD and status transitions. Frontend gets 6 new components in `src/components/warehouse/` plus modifications to `ViewOrder.tsx` and `Warehouse.tsx`. Zoho sync extended for bidirectional push/pull.

**Tech Stack:** Express.js backend, Neon PostgreSQL, React 18 + TypeScript + Vite, Tailwind CSS, shadcn/ui (react-aria), @dnd-kit kanban, Zoho Inventory API, ShipStation API.

**Spec:** `docs/superpowers/specs/2026-03-15-packing-warehouse-workflow-design.md`

---

## Chunk 1: Database Migration & Backend API

### Task 1: Database Migration Script

**Files:**
- Create: `backend/src/scripts/add-warehouse-status.sql`

- [ ] **Step 1: Write the migration SQL**

```sql
-- backend/src/scripts/add-warehouse-status.sql

-- 1. Make Zoho IDs nullable for locally-created records
ALTER TABLE shipments ALTER COLUMN zoho_shipment_id DROP NOT NULL;
ALTER TABLE package_items ALTER COLUMN zoho_package_item_id DROP NOT NULL;

-- 2. Add warehouse workflow columns to shipments
ALTER TABLE shipments
  ADD COLUMN IF NOT EXISTS warehouse_status text DEFAULT 'not_shipped',
  ADD COLUMN IF NOT EXISTS sync_status text DEFAULT 'synced',
  ADD COLUMN IF NOT EXISTS sync_error text,
  ADD COLUMN IF NOT EXISTS packed_at timestamptz,
  ADD COLUMN IF NOT EXISTS packed_by text,
  ADD COLUMN IF NOT EXISTS sent_to_packing_at timestamptz,
  ADD COLUMN IF NOT EXISTS sent_to_packing_by text,
  ADD COLUMN IF NOT EXISTS delivery_booked_at timestamptz,
  ADD COLUMN IF NOT EXISTS delivery_booked_by text;

-- 3. Add order_line_item_id to package_items
ALTER TABLE package_items
  ADD COLUMN IF NOT EXISTS order_line_item_id integer REFERENCES order_line_items(id) ON DELETE SET NULL;

-- 4. Indexes
CREATE INDEX IF NOT EXISTS idx_shipments_warehouse_status ON shipments (warehouse_status);
CREATE INDEX IF NOT EXISTS idx_shipments_pending_sync ON shipments (sync_status, updated_at) WHERE sync_status <> 'synced';
CREATE INDEX IF NOT EXISTS idx_package_items_order_line_item_id ON package_items (order_line_item_id);

-- 5. Packing number sequence (start above existing Zoho PKG numbers)
CREATE SEQUENCE IF NOT EXISTS packing_number_seq START WITH 7000;

-- 6. Backfill warehouse_status from existing Zoho status
UPDATE shipments SET warehouse_status = 'delivered' WHERE status = 'delivered' AND warehouse_status IS NULL;
UPDATE shipments SET warehouse_status = 'shipped' WHERE status = 'shipped' AND warehouse_status IS NULL;
UPDATE shipments SET warehouse_status = 'packed' WHERE status = 'packed' AND warehouse_status IS NULL;

-- Recent not_shipped → keep as not_shipped (forward orders)
UPDATE shipments SET warehouse_status = 'not_shipped'
  WHERE status NOT IN ('delivered', 'shipped', 'packed')
  AND created_at >= now() - interval '12 months'
  AND warehouse_status IS NULL;

-- Old not_shipped → assume delivered (stale data guard)
UPDATE shipments SET warehouse_status = 'delivered'
  WHERE warehouse_status IS NULL
  AND created_at < now() - interval '12 months';

-- Catch-all
UPDATE shipments SET warehouse_status = 'not_shipped' WHERE warehouse_status IS NULL;

-- 7. Backfill order_line_item_id on package_items (match by SKU + order)
UPDATE package_items pi
  SET order_line_item_id = oli.id
  FROM order_line_items oli
  WHERE pi.order_id = oli.order_id
  AND pi.sku = oli.sku
  AND pi.order_line_item_id IS NULL
  AND pi.sku IS NOT NULL;
```

- [ ] **Step 2: Run the migration against Neon**

Use the Neon MCP `run_sql` tool to execute each statement. Run the ALTERs first, then indexes, then sequence, then backfills. Verify with:

```sql
SELECT warehouse_status, count(*) FROM shipments GROUP BY warehouse_status;
SELECT count(*) FROM package_items WHERE order_line_item_id IS NOT NULL;
```

Expected: Most shipments are `delivered` or `shipped`, some `not_shipped`. Many package_items should have `order_line_item_id` populated.

- [ ] **Step 3: Commit**

```bash
git add backend/src/scripts/add-warehouse-status.sql
git commit -m "feat: add warehouse workflow columns to shipments and package_items"
```

---

### Task 2: Warehouse Backend Route — Package CRUD

**Files:**
- Create: `backend/src/routes/v1/warehouse.js`
- Modify: `backend/src/index.js` (add route mounting)

- [ ] **Step 1: Create the warehouse route file with GET endpoints**

```javascript
// backend/src/routes/v1/warehouse.js
import express from 'express';
import { query, getById } from '../../config/database.js';
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

export default router;
```

- [ ] **Step 2: Mount the route in index.js**

In `backend/src/index.js`, add the import and mounting alongside other v1 routes:

```javascript
// Add import at top with other route imports
import warehouseRoutes from './routes/v1/warehouse.js';

// Add mounting alongside other v1 routes (after the existing ones)
app.use('/api/v1/warehouse', jwtAuth, warehouseRoutes);
```

- [ ] **Step 3: Verify the GET endpoints work**

Start the backend dev server and test with curl or the frontend:

```bash
cd backend && npm run dev
# In another terminal:
curl -H "Authorization: Bearer <jwt>" http://localhost:3001/api/v1/warehouse/packages?order_id=12184
```

Expected: JSON response with package data from the shipments/package_items tables.

- [ ] **Step 4: Commit**

```bash
git add backend/src/routes/v1/warehouse.js backend/src/index.js
git commit -m "feat: add warehouse GET endpoints for packages"
```

---

### Task 3: Warehouse Backend — Create Package Endpoint

**Files:**
- Modify: `backend/src/routes/v1/warehouse.js`

- [ ] **Step 1: Add POST /packages endpoint**

Add to `warehouse.js` before the `export default`:

```javascript
// ── POST /packages ──────────────────────────────────────────────────
router.post('/packages', async (req, res) => {
  const client = await (await import('../../config/database.js')).pool.connect();

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
    // TODO: Implement in Task for Zoho sync
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    logger.error('Error creating package:', err);
    res.status(500).json({ error: 'Failed to create package' });
  } finally {
    client.release();
  }
});
```

- [ ] **Step 2: Add the pool import at the top of warehouse.js**

Update the import at the top of the file:

```javascript
import { query, getById, pool } from '../../config/database.js';
```

Check `database.js` exports `pool`. If not, use the dynamic import pattern shown in step 1 or add `export { pool }` to `database.js`.

- [ ] **Step 3: Test the create endpoint**

```bash
curl -X POST http://localhost:3001/api/v1/warehouse/packages \
  -H "Authorization: Bearer <jwt>" \
  -H "Content-Type: application/json" \
  -d '{"order_id": 12184, "line_items": [{"order_line_item_id": <valid_id>, "quantity": 1}]}'
```

Expected: 201 with created package data including packing_number starting with PKG-07000+.

- [ ] **Step 4: Commit**

```bash
git add backend/src/routes/v1/warehouse.js backend/src/config/database.js
git commit -m "feat: add POST /packages endpoint for package creation"
```

---

### Task 4: Warehouse Backend — Status Update, Delete, Kanban

**Files:**
- Modify: `backend/src/routes/v1/warehouse.js`

- [ ] **Step 1: Add PUT /packages/:id/status**

```javascript
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
```

- [ ] **Step 2: Add PUT /packages/:id/mark-packed**

```javascript
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
```

- [ ] **Step 3: Add PUT /packages/:id/scan**

```javascript
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
```

- [ ] **Step 4: Add PUT /packages/:id/book-delivery**

```javascript
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
```

- [ ] **Step 5: Add DELETE /packages/:id**

```javascript
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
```

- [ ] **Step 6: Add GET /kanban**

```javascript
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
```

- [ ] **Step 7: Add PUT /packages/:id/items (edit)**

```javascript
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
```

- [ ] **Step 8: Commit**

```bash
git add backend/src/routes/v1/warehouse.js
git commit -m "feat: add warehouse status update, delete, kanban, scan, booking endpoints"
```

---

## Chunk 2: Frontend Service & Components

### Task 5: Frontend Warehouse Service

**Files:**
- Create: `src/services/warehouseService.ts`
- Modify: `src/services/shippingService.ts`

- [ ] **Step 1: Create warehouseService.ts**

```typescript
// src/services/warehouseService.ts
import { api } from './apiClient';

export interface PackageItem {
  id: number;
  packing_number: string;
  salesorder_number: string;
  customer_name: string;
  status: string;
  item_name: string;
  quantity_packed: number;
  sku: string;
  order_id: number;
  shipment_id: number;
  order_line_item_id: number | null;
  ordered_quantity: number | null;
  line_item_name: string | null;
  created_at: string;
}

export interface Package {
  id: number;
  packing_number: string;
  warehouse_status: string;
  status: string;
  salesorder_number: string;
  customer_name: string;
  order_total: number;
  order_id: number;
  carrier_name: string | null;
  tracking_number: string | null;
  expected_delivery_date: string | null;
  sent_to_packing_at: string | null;
  packed_at: string | null;
  delivery_booked_at: string | null;
  created_at: string;
  updated_at: string;
  items: PackageItem[];
  shipping_address_json?: Record<string, string>;
}

export interface KanbanData {
  sent_to_packing: KanbanPackage[];
  packed: KanbanPackage[];
  delivery_booked: KanbanPackage[];
  shipped: KanbanPackage[];
  delivered: KanbanPackage[];
}

export interface KanbanPackage {
  id: number;
  packing_number: string;
  warehouse_status: string;
  order_id: number;
  salesorder_number: string;
  customer_name: string;
  order_total: number;
  order_date: string;
  item_count: number;
  created_at: string;
}

export interface CreatePackageRequest {
  order_id: number;
  line_items: { order_line_item_id: number; quantity: number }[];
  shipping_address?: Record<string, string>;
}

export interface ScanResult {
  result: 'matched' | 'not_found' | 'already_complete';
  item?: PackageItem;
  message?: string;
}

export const warehouseService = {
  async getPackagesForOrder(orderId: number): Promise<Package[]> {
    const result = await api.get<{ data: Package[] }>('/api/v1/warehouse/packages', { order_id: orderId });
    return result.data;
  },

  async getPackage(packageId: number): Promise<Package> {
    const result = await api.get<{ data: Package }>(`/api/v1/warehouse/packages/${packageId}`);
    return result.data;
  },

  async createPackage(request: CreatePackageRequest): Promise<Package> {
    const result = await api.post<{ data: Package; message: string }>('/api/v1/warehouse/packages', request);
    return result.data;
  },

  async deletePackage(packageId: number): Promise<void> {
    await api.delete(`/api/v1/warehouse/packages/${packageId}`);
  },

  async updatePackageStatus(packageId: number, status: string): Promise<Package> {
    const result = await api.put<{ data: Package }>(`/api/v1/warehouse/packages/${packageId}/status`, { status });
    return result.data;
  },

  async markPacked(packageId: number): Promise<Package> {
    const result = await api.put<{ data: Package }>(`/api/v1/warehouse/packages/${packageId}/mark-packed`, {});
    return result.data;
  },

  async bookDelivery(
    packageId: number,
    carrier: string,
    tracking: string,
    date: string,
    notes?: string,
  ): Promise<Package> {
    const result = await api.put<{ data: Package }>(`/api/v1/warehouse/packages/${packageId}/book-delivery`, {
      carrier_name: carrier,
      tracking_number: tracking,
      expected_delivery_date: date,
      notes,
    });
    return result.data;
  },

  async scanItem(packageId: number, code: string): Promise<ScanResult> {
    return api.put<ScanResult>(`/api/v1/warehouse/packages/${packageId}/scan`, { code });
  },

  async getKanbanData(maxAgeDays = 30): Promise<KanbanData> {
    const result = await api.get<{ data: KanbanData }>('/api/v1/warehouse/kanban', { max_age_days: maxAgeDays });
    return result.data;
  },

  async updatePackageItems(
    packageId: number,
    items: { id: number; quantity_packed: number }[],
  ): Promise<PackageItem[]> {
    const result = await api.put<{ data: PackageItem[] }>(`/api/v1/warehouse/packages/${packageId}/items`, { items });
    return result.data;
  },
};
```

- [ ] **Step 2: Update shippingService.ts to use warehouseService**

Replace `getOrdersByWarehouseStatus` in `src/services/shippingService.ts`:

```typescript
// Update the import at the top
import { warehouseService, type KanbanPackage } from './warehouseService';

// Replace getOrdersByWarehouseStatus method body:
async getOrdersByWarehouseStatus(_companyId: string): Promise<{
  pending: OrderWithShipping[];
  sentToPacking: OrderWithShipping[];
  packed: OrderWithShipping[];
  deliveryBooked: OrderWithShipping[];
  delivered: OrderWithShipping[];
}> {
  try {
    const kanban = await warehouseService.getKanbanData();

    const mapToOrder = (pkg: KanbanPackage): OrderWithShipping => ({
      id: String(pkg.order_id),
      salesorder_number: pkg.salesorder_number,
      status: pkg.warehouse_status,
      warehouse_status: pkg.warehouse_status,
      customer_name: pkg.customer_name,
      total: pkg.order_total,
      date: pkg.order_date,
      created_at: pkg.created_at,
      customers: { display_name: pkg.customer_name },
      // Store package-level info for the kanban
      _packageId: pkg.id,
      _packingNumber: pkg.packing_number,
      _itemCount: pkg.item_count,
    });

    return {
      pending: [],
      sentToPacking: (kanban.sent_to_packing || []).map(mapToOrder),
      packed: (kanban.packed || []).map(mapToOrder),
      deliveryBooked: (kanban.delivery_booked || []).map(mapToOrder),
      delivered: (kanban.delivered || []).map(mapToOrder),
    };
  } catch (error) {
    console.error('Error fetching kanban data:', error);
    return { pending: [], sentToPacking: [], packed: [], deliveryBooked: [], delivered: [] };
  }
},
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: No new errors from warehouseService.ts.

- [ ] **Step 4: Commit**

```bash
git add src/services/warehouseService.ts src/services/shippingService.ts
git commit -m "feat: add warehouseService and update shippingService to use real kanban data"
```

---

### Task 6: PackageAllocationModal Component

**Files:**
- Create: `src/components/warehouse/PackageAllocationModal.tsx`

- [ ] **Step 1: Create the component**

```typescript
// src/components/warehouse/PackageAllocationModal.tsx
import { useState, useEffect, useCallback } from 'react';
import { Dialog, DialogTrigger, Modal, ModalOverlay } from 'react-aria-components';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { warehouseService } from '@/services/warehouseService';
import { orderService } from '@/services/orderService';
import type { Order, OrderLineItem, Address } from '@/types/domain';
import {
  Package, X, AlertTriangle, CheckCircle, Loader2,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface AllocationItem {
  order_line_item_id: number;
  sku: string;
  name: string;
  ordered: number;
  shipped: number;
  remaining: number;
  allocate: number;
}

interface PackageAllocationModalProps {
  order: Order;
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export function PackageAllocationModal({ order, open, onClose, onSuccess }: PackageAllocationModalProps) {
  const [items, setItems] = useState<AllocationItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Build allocation items from order line items
  useEffect(() => {
    if (!open || !order.line_items) return;

    const allocItems: AllocationItem[] = order.line_items
      .map((li) => ({
        order_line_item_id: li.id,
        sku: li.sku || '',
        name: li.name,
        ordered: li.quantity,
        shipped: li.quantity_shipped || 0,
        remaining: li.quantity - (li.quantity_shipped || 0),
        allocate: li.quantity - (li.quantity_shipped || 0),
      }))
      .filter((item) => item.remaining > 0);

    setItems(allocItems);
    setError(null);
  }, [open, order]);

  const updateQuantity = (idx: number, value: number) => {
    setItems((prev) => {
      const next = [...prev];
      const item = next[idx];
      next[idx] = { ...item, allocate: Math.max(0, Math.min(value, item.remaining)) };
      return next;
    });
  };

  const totalAllocated = items.reduce((sum, i) => sum + i.allocate, 0);

  const handleSubmit = async () => {
    const toAllocate = items.filter((i) => i.allocate > 0);
    if (toAllocate.length === 0) {
      setError('No items to allocate');
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const shippingAddr = order.shipping_address_json || undefined;

      await warehouseService.createPackage({
        order_id: order.id,
        line_items: toAllocate.map((i) => ({
          order_line_item_id: i.order_line_item_id,
          quantity: i.allocate,
        })),
        shipping_address: shippingAddr as Record<string, string> | undefined,
      });

      onSuccess();
    } catch (err) {
      console.error('Error creating package:', err);
      setError(err instanceof Error ? err.message : 'Failed to create package');
    } finally {
      setSubmitting(false);
    }
  };

  if (!open) return null;

  return (
    <ModalOverlay
      isDismissable
      isOpen={open}
      onOpenChange={(isOpen) => { if (!isOpen) onClose(); }}
      className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"
    >
      <Modal className="w-full max-w-2xl bg-card border rounded-xl shadow-xl overflow-hidden">
        <Dialog className="outline-none">
          {({ close }) => (
            <div className="flex flex-col max-h-[85vh]">
              {/* Header */}
              <div className="flex items-center justify-between px-6 py-4 border-b">
                <div className="flex items-center gap-2">
                  <Package size={20} className="text-primary" />
                  <h2 className="text-lg font-semibold">Send to Packing</h2>
                  <Badge variant="secondary" className="text-xs">
                    {order.salesorder_number}
                  </Badge>
                </div>
                <button onClick={close} className="text-muted-foreground hover:text-foreground p-1">
                  <X size={18} />
                </button>
              </div>

              {/* Body */}
              <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
                {/* Customer info */}
                <div className="text-sm text-muted-foreground">
                  Customer: <span className="text-foreground font-medium">{order.customer_name}</span>
                </div>

                {error && (
                  <div className="flex items-center gap-2 text-sm text-destructive bg-destructive/5 border border-destructive/20 rounded-lg px-3 py-2">
                    <AlertTriangle size={14} />
                    {error}
                  </div>
                )}

                {/* Items table */}
                <div className="border rounded-lg overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/50">
                      <tr>
                        <th className="text-left px-3 py-2 font-medium">SKU</th>
                        <th className="text-left px-3 py-2 font-medium">Item</th>
                        <th className="text-right px-3 py-2 font-medium">Ordered</th>
                        <th className="text-right px-3 py-2 font-medium">Shipped</th>
                        <th className="text-right px-3 py-2 font-medium">Remaining</th>
                        <th className="text-right px-3 py-2 font-medium">Allocate</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {items.map((item, idx) => (
                        <tr key={item.order_line_item_id} className="hover:bg-muted/30">
                          <td className="px-3 py-2 font-mono text-xs">{item.sku}</td>
                          <td className="px-3 py-2 truncate max-w-[200px]">{item.name}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{item.ordered}</td>
                          <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{item.shipped}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{item.remaining}</td>
                          <td className="px-3 py-2 text-right">
                            <input
                              type="number"
                              min={0}
                              max={item.remaining}
                              value={item.allocate}
                              onChange={(e) => updateQuantity(idx, parseInt(e.target.value) || 0)}
                              className="w-16 text-right bg-background border rounded px-2 py-1 text-sm tabular-nums focus:outline-none focus:ring-1 focus:ring-primary"
                            />
                          </td>
                        </tr>
                      ))}
                      {items.length === 0 && (
                        <tr>
                          <td colSpan={6} className="px-3 py-8 text-center text-muted-foreground">
                            All items have been shipped
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>

                {/* Shipping address */}
                {order.shipping_address_json && (
                  <div className="text-sm">
                    <div className="font-medium mb-1">Shipping Address</div>
                    <div className="text-muted-foreground bg-muted/30 rounded-lg px-3 py-2">
                      {[
                        (order.shipping_address_json as any)?.address,
                        (order.shipping_address_json as any)?.street2,
                        (order.shipping_address_json as any)?.city,
                        (order.shipping_address_json as any)?.state,
                        (order.shipping_address_json as any)?.zip,
                        (order.shipping_address_json as any)?.country,
                      ].filter(Boolean).join(', ')}
                    </div>
                  </div>
                )}
              </div>

              {/* Footer */}
              <div className="flex items-center justify-between px-6 py-4 border-t bg-muted/20">
                <span className="text-sm text-muted-foreground">
                  {totalAllocated} item{totalAllocated !== 1 ? 's' : ''} to pack
                </span>
                <div className="flex items-center gap-2">
                  <Button intent="outline" size="sm" onPress={close}>
                    Cancel
                  </Button>
                  <Button
                    intent="primary"
                    size="sm"
                    onPress={handleSubmit}
                    isDisabled={submitting || totalAllocated === 0}
                  >
                    {submitting ? (
                      <><Loader2 size={14} className="animate-spin" /> Creating...</>
                    ) : (
                      <><CheckCircle size={14} /> Create Package</>
                    )}
                  </Button>
                </div>
              </div>
            </div>
          )}
        </Dialog>
      </Modal>
    </ModalOverlay>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit 2>&1 | grep -i "PackageAllocation"
```

Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/warehouse/PackageAllocationModal.tsx
git commit -m "feat: add PackageAllocationModal for creating packages from order line items"
```

---

### Task 7: OrderPackagesSection Component

**Files:**
- Create: `src/components/warehouse/OrderPackagesSection.tsx`

- [ ] **Step 1: Create the component**

```typescript
// src/components/warehouse/OrderPackagesSection.tsx
import { useState, useEffect, useCallback } from 'react';
import { warehouseService, type Package } from '@/services/warehouseService';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Package as PackageIcon, ChevronDown, ChevronUp, Truck, CheckCircle,
  Printer, ScanLine, Edit, Trash2, RefreshCw, AlertTriangle,
} from 'lucide-react';
import { cn } from '@/lib/utils';

const STATUS_COLORS: Record<string, string> = {
  not_shipped: 'bg-zinc-500/10 text-zinc-500',
  sent_to_packing: 'bg-amber-500/10 text-amber-500',
  packed: 'bg-blue-500/10 text-blue-500',
  delivery_booked: 'bg-purple-500/10 text-purple-500',
  shipped: 'bg-emerald-500/10 text-emerald-500',
  delivered: 'bg-emerald-600/10 text-emerald-600',
};

const STATUS_LABELS: Record<string, string> = {
  not_shipped: 'Not Shipped',
  sent_to_packing: 'Sent to Packing',
  packed: 'Packed',
  delivery_booked: 'Delivery Booked',
  shipped: 'Shipped',
  delivered: 'Delivered',
};

interface OrderPackagesSectionProps {
  orderId: number;
  onOpenScan?: (pkg: Package) => void;
  onOpenBooking?: (pkg: Package) => void;
  onOpenEdit?: (pkg: Package) => void;
  onOpenPrint?: (pkg: Package) => void;
}

export function OrderPackagesSection({
  orderId,
  onOpenScan,
  onOpenBooking,
  onOpenEdit,
  onOpenPrint,
}: OrderPackagesSectionProps) {
  const [packages, setPackages] = useState<Package[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const fetchPackages = useCallback(async () => {
    try {
      setError(null);
      const data = await warehouseService.getPackagesForOrder(orderId);
      setPackages(data);
    } catch (err) {
      console.error('Error fetching packages:', err);
      setError('Failed to load packages');
    } finally {
      setLoading(false);
    }
  }, [orderId]);

  useEffect(() => {
    fetchPackages();
  }, [fetchPackages]);

  const handleDelete = async (pkg: Package) => {
    if (!window.confirm(`Delete package ${pkg.packing_number}? This will rollback shipped quantities.`)) return;
    setDeletingId(pkg.id);
    try {
      await warehouseService.deletePackage(pkg.id);
      await fetchPackages();
    } catch (err) {
      console.error('Error deleting package:', err);
      setError('Failed to delete package');
    } finally {
      setDeletingId(null);
    }
  };

  const handleAdvanceStatus = async (pkg: Package) => {
    const nextMap: Record<string, string> = {
      sent_to_packing: 'packed',
      packed: 'delivery_booked',
      delivery_booked: 'shipped',
      shipped: 'delivered',
    };
    const next = nextMap[pkg.warehouse_status];
    if (!next) return;

    try {
      await warehouseService.updatePackageStatus(pkg.id, next);
      await fetchPackages();
    } catch (err) {
      console.error('Error updating status:', err);
      setError('Failed to update status');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
        <RefreshCw size={14} className="animate-spin" /> Loading packages...
      </div>
    );
  }

  if (packages.length === 0) return null;

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
        <PackageIcon size={16} />
        Packages ({packages.length})
      </h3>

      {error && (
        <div className="flex items-center gap-2 text-sm text-destructive bg-destructive/5 rounded-lg px-3 py-2">
          <AlertTriangle size={14} /> {error}
        </div>
      )}

      <div className="space-y-2">
        {packages.map((pkg) => {
          const expanded = expandedId === pkg.id;
          return (
            <div key={pkg.id} className="border rounded-lg overflow-hidden">
              {/* Package header */}
              <div
                className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-muted/30 transition-colors"
                onClick={() => setExpandedId(expanded ? null : pkg.id)}
              >
                {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                <span className="font-mono text-sm font-medium">{pkg.packing_number}</span>
                <Badge className={cn('text-xs', STATUS_COLORS[pkg.warehouse_status] || '')}>
                  {STATUS_LABELS[pkg.warehouse_status] || pkg.warehouse_status}
                </Badge>
                <span className="text-xs text-muted-foreground ml-auto">
                  {pkg.items?.length || 0} items
                </span>
                {pkg.tracking_number && (
                  <span className="text-xs text-muted-foreground">
                    {pkg.carrier_name}: {pkg.tracking_number}
                  </span>
                )}
              </div>

              {/* Expanded content */}
              {expanded && (
                <div className="border-t px-4 py-3 space-y-3">
                  {/* Items table */}
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-muted-foreground">
                        <th className="text-left pb-1">SKU</th>
                        <th className="text-left pb-1">Item</th>
                        <th className="text-right pb-1">Qty</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/50">
                      {(pkg.items || []).map((item) => (
                        <tr key={item.id}>
                          <td className="py-1 font-mono">{item.sku}</td>
                          <td className="py-1 truncate max-w-[200px]">{item.item_name}</td>
                          <td className="py-1 text-right tabular-nums">{item.quantity_packed}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>

                  {/* Action buttons */}
                  <div className="flex items-center gap-2 pt-2 border-t">
                    {pkg.warehouse_status === 'sent_to_packing' && onOpenScan && (
                      <Button intent="outline" size="xs" onPress={() => onOpenScan(pkg)}>
                        <ScanLine size={12} /> Scan
                      </Button>
                    )}
                    {pkg.warehouse_status === 'packed' && onOpenBooking && (
                      <Button intent="outline" size="xs" onPress={() => onOpenBooking(pkg)}>
                        <Truck size={12} /> Book Delivery
                      </Button>
                    )}
                    {onOpenEdit && (
                      <Button intent="outline" size="xs" onPress={() => onOpenEdit(pkg)}>
                        <Edit size={12} /> Edit
                      </Button>
                    )}
                    {onOpenPrint && (
                      <Button intent="outline" size="xs" onPress={() => onOpenPrint(pkg)}>
                        <Printer size={12} /> Print
                      </Button>
                    )}
                    {['not_shipped', 'sent_to_packing'].includes(pkg.warehouse_status) && (
                      <Button
                        intent="danger"
                        size="xs"
                        onPress={() => handleDelete(pkg)}
                        isDisabled={deletingId === pkg.id}
                        className="ml-auto"
                      >
                        <Trash2 size={12} /> {deletingId === pkg.id ? 'Deleting...' : 'Delete'}
                      </Button>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/warehouse/OrderPackagesSection.tsx
git commit -m "feat: add OrderPackagesSection for displaying packages on ViewOrder"
```

---

### Task 8: PackingScanModal Component

**Files:**
- Create: `src/components/warehouse/PackingScanModal.tsx`

- [ ] **Step 1: Create the component**

```typescript
// src/components/warehouse/PackingScanModal.tsx
import { useState, useEffect, useRef } from 'react';
import { Dialog, Modal, ModalOverlay } from 'react-aria-components';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { warehouseService, type Package, type PackageItem } from '@/services/warehouseService';
import { ScanLine, X, CheckCircle, AlertTriangle, Package as PackageIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

interface PackingScanModalProps {
  pkg: Package;
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export function PackingScanModal({ pkg, open, onClose, onSuccess }: PackingScanModalProps) {
  const [items, setItems] = useState<PackageItem[]>(pkg.items || []);
  const [scanInput, setScanInput] = useState('');
  const [lastResult, setLastResult] = useState<string | null>(null);
  const [marking, setMarking] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setItems(pkg.items || []);
      setScanInput('');
      setLastResult(null);
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [open, pkg]);

  const handleScan = async (code: string) => {
    if (!code.trim()) return;
    setScanInput('');

    try {
      const result = await warehouseService.scanItem(pkg.id, code.trim());
      if (result.result === 'matched' && result.item) {
        setItems((prev) =>
          prev.map((i) => (i.id === result.item!.id ? result.item! : i))
        );
        setLastResult(`Scanned: ${result.item.item_name}`);
      } else if (result.result === 'already_complete') {
        setLastResult(`Already complete: ${code}`);
      } else {
        setLastResult(`Not found: ${code}`);
      }
    } catch (err) {
      setLastResult(`Error scanning: ${code}`);
    }

    setTimeout(() => inputRef.current?.focus(), 50);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleScan(scanInput);
    }
  };

  const handleMarkAllPacked = async () => {
    setMarking(true);
    try {
      await warehouseService.markPacked(pkg.id);
      onSuccess();
    } catch (err) {
      setLastResult('Failed to mark as packed');
    } finally {
      setMarking(false);
    }
  };

  const totalExpected = items.reduce((sum, i) => sum + (i.ordered_quantity || i.quantity_packed || 0), 0);
  const totalScanned = items.reduce((sum, i) => sum + (i.quantity_packed || 0), 0);
  const allComplete = totalScanned >= totalExpected && totalExpected > 0;

  if (!open) return null;

  return (
    <ModalOverlay
      isDismissable
      isOpen={open}
      onOpenChange={(isOpen) => { if (!isOpen) onClose(); }}
      className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"
    >
      <Modal className="w-full max-w-xl bg-card border rounded-xl shadow-xl overflow-hidden">
        <Dialog className="outline-none">
          {({ close }) => (
            <div className="flex flex-col max-h-[85vh]">
              {/* Header */}
              <div className="flex items-center justify-between px-6 py-4 border-b">
                <div className="flex items-center gap-2">
                  <ScanLine size={20} className="text-primary" />
                  <h2 className="text-lg font-semibold">Scan Items</h2>
                  <Badge variant="secondary">{pkg.packing_number}</Badge>
                </div>
                <button onClick={close} className="text-muted-foreground hover:text-foreground p-1">
                  <X size={18} />
                </button>
              </div>

              {/* Scan input */}
              <div className="px-6 py-3 border-b bg-muted/20">
                <input
                  ref={inputRef}
                  type="text"
                  value={scanInput}
                  onChange={(e) => setScanInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Scan barcode or enter SKU..."
                  className="w-full bg-background border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  autoFocus
                />
                {lastResult && (
                  <div className={cn(
                    'text-xs mt-1',
                    lastResult.startsWith('Scanned') ? 'text-emerald-500' : 'text-amber-500',
                  )}>
                    {lastResult}
                  </div>
                )}
              </div>

              {/* Progress */}
              <div className="px-6 py-2 border-b">
                <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
                  <span>Progress</span>
                  <span className="tabular-nums">{totalScanned} / {totalExpected}</span>
                </div>
                <div className="h-2 bg-muted rounded-full overflow-hidden">
                  <div
                    className={cn(
                      'h-full rounded-full transition-all',
                      allComplete ? 'bg-emerald-500' : 'bg-primary',
                    )}
                    style={{ width: `${totalExpected ? (totalScanned / totalExpected) * 100 : 0}%` }}
                  />
                </div>
              </div>

              {/* Items */}
              <div className="flex-1 overflow-y-auto px-6 py-3">
                <div className="space-y-1">
                  {items.map((item) => {
                    const expected = item.ordered_quantity || item.quantity_packed || 0;
                    const scanned = item.quantity_packed || 0;
                    const complete = scanned >= expected;
                    return (
                      <div
                        key={item.id}
                        className={cn(
                          'flex items-center gap-3 px-3 py-2 rounded-lg text-sm',
                          complete ? 'bg-emerald-500/5' : 'bg-muted/30',
                        )}
                      >
                        {complete ? (
                          <CheckCircle size={14} className="text-emerald-500 shrink-0" />
                        ) : (
                          <PackageIcon size={14} className="text-muted-foreground shrink-0" />
                        )}
                        <span className="font-mono text-xs text-muted-foreground w-16">{item.sku}</span>
                        <span className="flex-1 truncate">{item.item_name}</span>
                        <span className="tabular-nums text-xs">
                          {scanned}/{expected}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Footer */}
              <div className="flex items-center justify-end gap-2 px-6 py-4 border-t">
                <Button intent="outline" size="sm" onPress={close}>Cancel</Button>
                <Button
                  intent="primary"
                  size="sm"
                  onPress={handleMarkAllPacked}
                  isDisabled={marking}
                >
                  <CheckCircle size={14} />
                  {marking ? 'Marking...' : 'Mark All Packed'}
                </Button>
              </div>
            </div>
          )}
        </Dialog>
      </Modal>
    </ModalOverlay>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/warehouse/PackingScanModal.tsx
git commit -m "feat: add PackingScanModal for barcode scanning workflow"
```

---

### Task 9: ShippingBookingModal Component

**Files:**
- Create: `src/components/warehouse/ShippingBookingModal.tsx`

- [ ] **Step 1: Create the component**

```typescript
// src/components/warehouse/ShippingBookingModal.tsx
import { useState } from 'react';
import { Dialog, Modal, ModalOverlay } from 'react-aria-components';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { warehouseService, type Package } from '@/services/warehouseService';
import { Truck, X, CheckCircle, Loader2 } from 'lucide-react';

interface ShippingBookingModalProps {
  pkg: Package;
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export function ShippingBookingModal({ pkg, open, onClose, onSuccess }: ShippingBookingModalProps) {
  const [carrier, setCarrier] = useState(pkg.carrier_name || '');
  const [tracking, setTracking] = useState(pkg.tracking_number || '');
  const [deliveryDate, setDeliveryDate] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    if (!carrier.trim()) {
      setError('Carrier is required');
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      await warehouseService.bookDelivery(pkg.id, carrier, tracking, deliveryDate, notes);
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to book delivery');
    } finally {
      setSubmitting(false);
    }
  };

  if (!open) return null;

  return (
    <ModalOverlay
      isDismissable
      isOpen={open}
      onOpenChange={(isOpen) => { if (!isOpen) onClose(); }}
      className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"
    >
      <Modal className="w-full max-w-md bg-card border rounded-xl shadow-xl overflow-hidden">
        <Dialog className="outline-none">
          {({ close }) => (
            <div className="flex flex-col">
              {/* Header */}
              <div className="flex items-center justify-between px-6 py-4 border-b">
                <div className="flex items-center gap-2">
                  <Truck size={20} className="text-primary" />
                  <h2 className="text-lg font-semibold">Book Delivery</h2>
                  <Badge variant="secondary">{pkg.packing_number}</Badge>
                </div>
                <button onClick={close} className="text-muted-foreground hover:text-foreground p-1">
                  <X size={18} />
                </button>
              </div>

              {/* Body */}
              <div className="px-6 py-4 space-y-4">
                {error && (
                  <div className="text-sm text-destructive bg-destructive/5 border border-destructive/20 rounded-lg px-3 py-2">
                    {error}
                  </div>
                )}

                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Carrier *</label>
                  <input
                    type="text"
                    value={carrier}
                    onChange={(e) => setCarrier(e.target.value)}
                    placeholder="e.g. DPD, Royal Mail, UPS"
                    className="w-full border rounded-lg px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Tracking Number</label>
                  <input
                    type="text"
                    value={tracking}
                    onChange={(e) => setTracking(e.target.value)}
                    placeholder="Enter tracking number"
                    className="w-full border rounded-lg px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Expected Delivery Date</label>
                  <input
                    type="date"
                    value={deliveryDate}
                    onChange={(e) => setDeliveryDate(e.target.value)}
                    className="w-full border rounded-lg px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Notes</label>
                  <textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    rows={3}
                    placeholder="Additional shipping notes..."
                    className="w-full border rounded-lg px-3 py-2 text-sm bg-background resize-none focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>
              </div>

              {/* Footer */}
              <div className="flex items-center justify-end gap-2 px-6 py-4 border-t">
                <Button intent="outline" size="sm" onPress={close}>Cancel</Button>
                <Button intent="primary" size="sm" onPress={handleSubmit} isDisabled={submitting}>
                  {submitting ? (
                    <><Loader2 size={14} className="animate-spin" /> Booking...</>
                  ) : (
                    <><CheckCircle size={14} /> Book Delivery</>
                  )}
                </Button>
              </div>
            </div>
          )}
        </Dialog>
      </Modal>
    </ModalOverlay>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/warehouse/ShippingBookingModal.tsx
git commit -m "feat: add ShippingBookingModal for carrier and tracking entry"
```

---

### Task 10: PackingListEditModal & PackingListPrint

**Files:**
- Create: `src/components/warehouse/PackingListEditModal.tsx`
- Create: `src/components/warehouse/PackingListPrint.tsx`

- [ ] **Step 1: Create PackingListEditModal**

```typescript
// src/components/warehouse/PackingListEditModal.tsx
import { useState } from 'react';
import { Dialog, Modal, ModalOverlay } from 'react-aria-components';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { warehouseService, type Package, type PackageItem } from '@/services/warehouseService';
import { Edit, X, CheckCircle, Loader2 } from 'lucide-react';

interface PackingListEditModalProps {
  pkg: Package;
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export function PackingListEditModal({ pkg, open, onClose, onSuccess }: PackingListEditModalProps) {
  const [items, setItems] = useState<{ id: number; quantity_packed: number }[]>(
    (pkg.items || []).map((i) => ({ id: i.id, quantity_packed: i.quantity_packed }))
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const updateQuantity = (id: number, value: number) => {
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, quantity_packed: Math.max(0, value) } : i)));
  };

  const handleSave = async () => {
    setSubmitting(true);
    setError(null);
    try {
      await warehouseService.updatePackageItems(pkg.id, items);
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update');
    } finally {
      setSubmitting(false);
    }
  };

  if (!open) return null;

  return (
    <ModalOverlay
      isDismissable
      isOpen={open}
      onOpenChange={(isOpen) => { if (!isOpen) onClose(); }}
      className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"
    >
      <Modal className="w-full max-w-lg bg-card border rounded-xl shadow-xl overflow-hidden">
        <Dialog className="outline-none">
          {({ close }) => (
            <div className="flex flex-col max-h-[80vh]">
              <div className="flex items-center justify-between px-6 py-4 border-b">
                <div className="flex items-center gap-2">
                  <Edit size={20} className="text-primary" />
                  <h2 className="text-lg font-semibold">Edit Packing List</h2>
                  <Badge variant="secondary">{pkg.packing_number}</Badge>
                </div>
                <button onClick={close} className="text-muted-foreground hover:text-foreground p-1">
                  <X size={18} />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto px-6 py-4">
                {error && (
                  <div className="text-sm text-destructive bg-destructive/5 border border-destructive/20 rounded-lg px-3 py-2 mb-4">
                    {error}
                  </div>
                )}

                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-muted-foreground text-xs">
                      <th className="text-left pb-2">SKU</th>
                      <th className="text-left pb-2">Item</th>
                      <th className="text-right pb-2">Qty</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {(pkg.items || []).map((item) => {
                      const editItem = items.find((i) => i.id === item.id);
                      return (
                        <tr key={item.id}>
                          <td className="py-2 font-mono text-xs">{item.sku}</td>
                          <td className="py-2 truncate max-w-[200px]">{item.item_name}</td>
                          <td className="py-2 text-right">
                            <input
                              type="number"
                              min={0}
                              value={editItem?.quantity_packed ?? item.quantity_packed}
                              onChange={(e) => updateQuantity(item.id, parseInt(e.target.value) || 0)}
                              className="w-16 text-right border rounded px-2 py-1 text-sm bg-background focus:outline-none focus:ring-1 focus:ring-primary"
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div className="flex items-center justify-end gap-2 px-6 py-4 border-t">
                <Button intent="outline" size="sm" onPress={close}>Cancel</Button>
                <Button intent="primary" size="sm" onPress={handleSave} isDisabled={submitting}>
                  {submitting ? <><Loader2 size={14} className="animate-spin" /> Saving...</> : <><CheckCircle size={14} /> Save</>}
                </Button>
              </div>
            </div>
          )}
        </Dialog>
      </Modal>
    </ModalOverlay>
  );
}
```

- [ ] **Step 2: Create PackingListPrint**

```typescript
// src/components/warehouse/PackingListPrint.tsx
import type { Package } from '@/services/warehouseService';

interface PackingListPrintProps {
  pkg: Package;
}

export function PackingListPrint({ pkg }: PackingListPrintProps) {
  const handlePrint = () => window.print();

  return (
    <div className="print:block hidden">
      <style>{`
        @media print {
          body > *:not(.print-container) { display: none !important; }
          .print-container { display: block !important; padding: 20px; font-family: sans-serif; }
        }
      `}</style>
      <div className="print-container">
        <h1 style={{ fontSize: '18px', marginBottom: '4px' }}>Packing List — {pkg.packing_number}</h1>
        <p style={{ fontSize: '14px', color: '#666', marginBottom: '16px' }}>
          Order: {pkg.salesorder_number} | Customer: {pkg.customer_name}
        </p>

        {pkg.shipping_address_json && (
          <div style={{ marginBottom: '16px', fontSize: '13px' }}>
            <strong>Ship to:</strong><br />
            {[
              (pkg.shipping_address_json as any)?.address,
              (pkg.shipping_address_json as any)?.city,
              (pkg.shipping_address_json as any)?.state,
              (pkg.shipping_address_json as any)?.zip,
            ].filter(Boolean).join(', ')}
          </div>
        )}

        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
          <thead>
            <tr style={{ borderBottom: '2px solid #000' }}>
              <th style={{ textAlign: 'left', padding: '6px' }}>SKU</th>
              <th style={{ textAlign: 'left', padding: '6px' }}>Item</th>
              <th style={{ textAlign: 'right', padding: '6px' }}>Qty</th>
            </tr>
          </thead>
          <tbody>
            {(pkg.items || []).map((item) => (
              <tr key={item.id} style={{ borderBottom: '1px solid #ddd' }}>
                <td style={{ padding: '6px', fontFamily: 'monospace' }}>{item.sku}</td>
                <td style={{ padding: '6px' }}>{item.item_name}</td>
                <td style={{ padding: '6px', textAlign: 'right' }}>{item.quantity_packed}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <p style={{ marginTop: '24px', fontSize: '11px', color: '#999' }}>
          Printed: {new Date().toLocaleString()}
        </p>
      </div>
    </div>
  );
}

export function triggerPackingListPrint(pkg: Package) {
  // Create a temporary print window
  const printWindow = window.open('', '_blank', 'width=800,height=600');
  if (!printWindow) return;

  const items = (pkg.items || []).map((i) =>
    `<tr style="border-bottom:1px solid #ddd">
      <td style="padding:6px;font-family:monospace">${i.sku}</td>
      <td style="padding:6px">${i.item_name}</td>
      <td style="padding:6px;text-align:right">${i.quantity_packed}</td>
    </tr>`
  ).join('');

  printWindow.document.write(`
    <html><head><title>Packing List - ${pkg.packing_number}</title></head><body style="font-family:sans-serif;padding:20px">
    <h1 style="font-size:18px;margin-bottom:4px">Packing List — ${pkg.packing_number}</h1>
    <p style="font-size:14px;color:#666;margin-bottom:16px">Order: ${pkg.salesorder_number} | Customer: ${pkg.customer_name}</p>
    <table style="width:100%;border-collapse:collapse;font-size:13px">
    <thead><tr style="border-bottom:2px solid #000"><th style="text-align:left;padding:6px">SKU</th><th style="text-align:left;padding:6px">Item</th><th style="text-align:right;padding:6px">Qty</th></tr></thead>
    <tbody>${items}</tbody></table>
    <p style="margin-top:24px;font-size:11px;color:#999">Printed: ${new Date().toLocaleString()}</p>
    </body></html>
  `);
  printWindow.document.close();
  printWindow.print();
}
```

- [ ] **Step 3: Commit**

```bash
git add src/components/warehouse/PackingListEditModal.tsx src/components/warehouse/PackingListPrint.tsx
git commit -m "feat: add PackingListEditModal and PackingListPrint components"
```

---

### Task 11: Wire Components into ViewOrder.tsx

**Files:**
- Modify: `src/components/ViewOrder.tsx`

- [ ] **Step 1: Add imports and state for the new components**

At the top of ViewOrder.tsx, add:

```typescript
import { PackageAllocationModal } from '@/components/warehouse/PackageAllocationModal';
import { OrderPackagesSection } from '@/components/warehouse/OrderPackagesSection';
import { PackingScanModal } from '@/components/warehouse/PackingScanModal';
import { ShippingBookingModal } from '@/components/warehouse/ShippingBookingModal';
import { PackingListEditModal } from '@/components/warehouse/PackingListEditModal';
import { triggerPackingListPrint } from '@/components/warehouse/PackingListPrint';
import type { Package as WarehousePackage } from '@/services/warehouseService';
```

Add state variables alongside existing state:

```typescript
const [allocationOpen, setAllocationOpen] = useState(false);
const [scanPkg, setScanPkg] = useState<WarehousePackage | null>(null);
const [bookingPkg, setBookingPkg] = useState<WarehousePackage | null>(null);
const [editPkg, setEditPkg] = useState<WarehousePackage | null>(null);
const [packagesKey, setPackagesKey] = useState(0); // force re-fetch
```

- [ ] **Step 2: Replace the "Send to Packing" button**

Replace the existing `handleSendToPacking` function and its button with:

```typescript
// Replace the old Send to Packing button with one that opens the allocation modal
<Button
  intent="primary"
  size="sm"
  onPress={() => setAllocationOpen(true)}
>
  <Package size={16} /> Send to Packing
</Button>
```

- [ ] **Step 3: Add OrderPackagesSection to the page body**

Below the line items section in the JSX, add:

```typescript
{/* Packages Section */}
<OrderPackagesSection
  orderId={order.id}
  key={packagesKey}
  onOpenScan={(pkg) => setScanPkg(pkg)}
  onOpenBooking={(pkg) => setBookingPkg(pkg)}
  onOpenEdit={(pkg) => setEditPkg(pkg)}
  onOpenPrint={(pkg) => triggerPackingListPrint(pkg)}
/>
```

- [ ] **Step 4: Add modal components at the end of the JSX**

Before the closing `</div>` of the component, add:

```typescript
{/* Warehouse Modals */}
{order && (
  <PackageAllocationModal
    order={order}
    open={allocationOpen}
    onClose={() => setAllocationOpen(false)}
    onSuccess={() => {
      setAllocationOpen(false);
      setPackagesKey((k) => k + 1);
      fetchOrderDetails();
    }}
  />
)}

{scanPkg && (
  <PackingScanModal
    pkg={scanPkg}
    open={!!scanPkg}
    onClose={() => setScanPkg(null)}
    onSuccess={() => {
      setScanPkg(null);
      setPackagesKey((k) => k + 1);
    }}
  />
)}

{bookingPkg && (
  <ShippingBookingModal
    pkg={bookingPkg}
    open={!!bookingPkg}
    onClose={() => setBookingPkg(null)}
    onSuccess={() => {
      setBookingPkg(null);
      setPackagesKey((k) => k + 1);
    }}
  />
)}

{editPkg && (
  <PackingListEditModal
    pkg={editPkg}
    open={!!editPkg}
    onClose={() => setEditPkg(null)}
    onSuccess={() => {
      setEditPkg(null);
      setPackagesKey((k) => k + 1);
    }}
  />
)}
```

- [ ] **Step 5: Verify TypeScript compiles and build passes**

```bash
npx tsc --noEmit && npx vite build
```

- [ ] **Step 6: Commit**

```bash
git add src/components/ViewOrder.tsx
git commit -m "feat: wire PackageAllocationModal and OrderPackagesSection into ViewOrder"
```

---

### Task 12: Update Warehouse Kanban to Use Real Data

**Files:**
- Modify: `src/components/Warehouse.tsx`

- [ ] **Step 1: Update types and data fetching**

Replace the kanban to work at package-level instead of order-level. Key changes:

1. Replace `KanbanOrder` type with `KanbanPackage` (import from `warehouseService`)
2. Replace `shippingService.getOrdersByWarehouseStatus()` with `warehouseService.getKanbanData()`
3. Update card display to show packing_number as title, salesorder_number as subtitle
4. Update drag-and-drop handler to call `warehouseService.updatePackageStatus()`
5. Update the `OrderCard` component to become a `PackageCard` component

The `_kanbanId` should use `shipment.id` directly since package IDs are unique.

See the existing `Warehouse.tsx` for the current structure — the kanban shell, columns, and overlay pattern stay the same. Only the data types, fetch call, card contents, and drag handler change.

- [ ] **Step 2: Verify build passes**

```bash
npx tsc --noEmit && npx vite build
```

- [ ] **Step 3: Commit**

```bash
git add src/components/Warehouse.tsx
git commit -m "feat: update warehouse kanban to use real package data from API"
```

---

## Chunk 3: Zoho Sync & Webhook

### Task 13: Fix packageSync.js Column Mappings

**Files:**
- Modify: `backend/src/services/sync/packageSync.js`

- [ ] **Step 1: Audit and fix transformRecord()**

Read the current `packageSync.js` and fix the `transformRecord()` method to map to actual `shipments` table columns. Key fixes:

- `external_package_id` → `zoho_shipment_id`
- `external_shipment_id` → remove or store in a new field
- `warehouse_id` → remove (column doesn't exist)
- `company_id` → remove (column doesn't exist)
- `shipping_address_1` → `shipping_address`
- `billing_address_1` → remove
- `shipment_status` → `status`
- Add `warehouse_status` mapping with conflict resolution: only advance forward, never regress

- [ ] **Step 2: Update upsertRecords() to handle warehouse_status preservation**

When upserting, if a local record exists with a more advanced `warehouse_status`, preserve it:

```javascript
// In the ON CONFLICT UPDATE clause, add:
warehouse_status = CASE
  WHEN EXCLUDED.warehouse_status IS NOT NULL
    AND array_position(ARRAY['not_shipped','sent_to_packing','packed','delivery_booked','shipped','delivered'], EXCLUDED.warehouse_status)
    > array_position(ARRAY['not_shipped','sent_to_packing','packed','delivery_booked','shipped','delivered'], shipments.warehouse_status)
  THEN EXCLUDED.warehouse_status
  ELSE shipments.warehouse_status
END
```

- [ ] **Step 3: Test sync with dry-run**

```bash
curl -X POST http://localhost:3001/api/sync/test/packages -H "X-API-Key: <key>"
```

Expected: Sync completes without errors, no data corruption.

- [ ] **Step 4: Commit**

```bash
git add backend/src/services/sync/packageSync.js
git commit -m "fix: align packageSync column mappings with actual shipments schema"
```

---

### Task 14: Zoho Push — Create Package in Zoho

**Files:**
- Modify: `backend/src/api/zoho.js`
- Modify: `backend/src/routes/v1/warehouse.js`

- [ ] **Step 1: Add createPackage function to zoho.js**

```javascript
/**
 * Create a package in Zoho Inventory
 * @param {string} zohoSalesorderId - The Zoho salesorder ID (not internal ID)
 * @param {Array} lineItems - [{zoho_item_id, quantity}]
 */
export async function createZohoPackage(zohoSalesorderId, lineItems) {
  const token = await getAccessToken();
  const orgId = process.env.ZOHO_ORGANIZATION_ID;

  const packageData = {
    date: new Date().toISOString().split('T')[0],
    line_items: lineItems.map(item => ({
      so_line_item_id: item.zoho_line_item_id,
      quantity: item.quantity,
    })),
  };

  const response = await axios.post(
    `${ZOHO_INVENTORY_URL}/packages?salesorder_id=${zohoSalesorderId}&organization_id=${orgId}`,
    packageData,
    {
      headers: { Authorization: `Zoho-oauthtoken ${token}` },
      timeout: 30000,
    }
  );

  return response.data;
}
```

- [ ] **Step 2: Wire async Zoho push into POST /packages**

In the warehouse route, after the successful local creation, add:

```javascript
// After COMMIT and res.json()
try {
  // Look up Zoho line item IDs
  const { rows: zohoItems } = await query(
    `SELECT oli.zoho_line_item_id, oli.zoho_item_id, pi.quantity_packed
     FROM package_items pi
     JOIN order_line_items oli ON oli.id = pi.order_line_item_id
     WHERE pi.shipment_id = $1`,
    [shipment.id]
  );

  if (order.zoho_salesorder_id && zohoItems.length > 0) {
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
  // sync_status already 'pending_push', retry mechanism will handle it
}
```

- [ ] **Step 3: Commit**

```bash
git add backend/src/api/zoho.js backend/src/routes/v1/warehouse.js
git commit -m "feat: add Zoho package push on local package creation"
```

---

### Task 15: Push Retry & Webhook Receiver

**Files:**
- Modify: `backend/src/routes/webhooks.js`
- Modify: `backend/src/index.js` (add retry cron)

- [ ] **Step 1: Add webhook handler for package updates**

In `webhooks.js`, add the database import at the top (alongside existing imports):

```javascript
import { query } from '../config/database.js';
```

Then add before `export default`:

```javascript
/**
 * POST /api/webhooks/package-update
 * Receives package change events from Zoho/Make.com
 */
router.post('/package-update', authenticateWebhook, async (req, res) => {
  try {
    const { package_id, salesorder_id, status, tracking_number, carrier } = req.body;

    // Log the webhook
    await query(
      `INSERT INTO webhook_logs (event_type, payload, created_at) VALUES ($1, $2, NOW())`,
      ['package_update', JSON.stringify(req.body)]
    );

    if (!package_id) {
      return res.status(400).json({ error: 'package_id required' });
    }

    // Find existing shipment by zoho_shipment_id
    const { rows: [existing] } = await query(
      `SELECT * FROM shipments WHERE zoho_shipment_id = $1`,
      [String(package_id)]
    );

    if (!existing) {
      // New package from Zoho — upsert
      // Let the scheduled sync handle full creation
      return res.json({ message: 'Package not found locally, will sync on next cycle' });
    }

    // Apply conflict resolution: only advance warehouse_status forward
    const STATUS_ORDER = ['not_shipped', 'sent_to_packing', 'packed', 'delivery_booked', 'shipped', 'delivered'];
    const statusMap = { not_shipped: 'not_shipped', packed: 'packed', shipped: 'shipped', delivered: 'delivered' };
    const zohoWarehouseStatus = statusMap[status] || null;

    const updates = {};
    if (tracking_number) updates.tracking_number = tracking_number;
    if (carrier) updates.carrier_name = carrier;
    if (status) updates.status = status;

    if (zohoWarehouseStatus) {
      const currentIdx = STATUS_ORDER.indexOf(existing.warehouse_status);
      const newIdx = STATUS_ORDER.indexOf(zohoWarehouseStatus);
      if (newIdx > currentIdx) {
        updates.warehouse_status = zohoWarehouseStatus;
      }
    }

    if (Object.keys(updates).length > 0) {
      const keys = Object.keys(updates);
      const setClause = keys.map((k, i) => `${k} = $${i + 1}`).join(', ');
      await query(
        `UPDATE shipments SET ${setClause}, updated_at = NOW() WHERE id = $${keys.length + 1}`,
        [...Object.values(updates), existing.id]
      );
    }

    res.json({ message: 'Package updated', updates });
  } catch (err) {
    console.error('Webhook package-update error:', err);
    res.status(500).json({ error: 'Internal error' });
  }
});
```

- [ ] **Step 2: Add push retry cron to index.js**

In `backend/src/index.js`, alongside the existing scheduled jobs:

```javascript
// Retry pending Zoho pushes every 5 minutes
if (process.env.ENABLE_ZOHO_PUSH_RETRY !== 'false') {
  cron.schedule('*/5 * * * *', async () => {
    try {
      const { rows: pending } = await query(
        `SELECT s.id, s.packing_number, o.zoho_salesorder_id
         FROM shipments s
         JOIN orders o ON o.id = s.order_id
         WHERE s.sync_status = 'pending_push'
         AND s.created_at > NOW() - interval '7 days'
         LIMIT 10`
      );

      for (const pkg of pending) {
        try {
          const { rows: items } = await query(
            `SELECT oli.zoho_line_item_id, pi.quantity_packed as quantity
             FROM package_items pi
             JOIN order_line_items oli ON oli.id = pi.order_line_item_id
             WHERE pi.shipment_id = $1`,
            [pkg.id]
          );

          if (pkg.zoho_salesorder_id && items.length > 0) {
            const { createZohoPackage } = await import('./api/zoho.js');
            const result = await createZohoPackage(pkg.zoho_salesorder_id, items);
            if (result?.package) {
              await query(
                `UPDATE shipments SET zoho_shipment_id = $1, sync_status = 'synced', sync_error = NULL, updated_at = NOW() WHERE id = $2`,
                [String(result.package.package_id), pkg.id]
              );
              logger.info(`Zoho push retry succeeded for ${pkg.packing_number}`);
            }
          }
        } catch (err) {
          // Track failure count in sync_error field as "count:message"
          const currentError = pkg.sync_error || '';
          const failCount = currentError.startsWith('fail:') ? parseInt(currentError.split(':')[1]) || 0 : 0;
          const newCount = failCount + 1;

          if (newCount >= 3) {
            // Escalate to conflict after 3 failures
            await query(
              `UPDATE shipments SET sync_status = 'conflict', sync_error = $1, updated_at = NOW() WHERE id = $2`,
              [`fail:${newCount}:${err.message}`, pkg.id]
            );
            logger.error(`Zoho push escalated to conflict for ${pkg.packing_number} after ${newCount} failures`);
          } else {
            await query(
              `UPDATE shipments SET sync_error = $1, updated_at = NOW() WHERE id = $2`,
              [`fail:${newCount}:${err.message}`, pkg.id]
            );
            logger.warn(`Zoho push retry failed for ${pkg.packing_number} (attempt ${newCount}/3):`, err.message);
          }
        }
      }
    } catch (err) {
      logger.error('Zoho push retry cron error:', err);
    }
  });
  logger.info('Zoho push retry cron enabled (every 5 minutes)');
}
```

- [ ] **Step 3: Commit**

```bash
git add backend/src/routes/webhooks.js backend/src/index.js
git commit -m "feat: add webhook receiver for package updates and push retry cron"
```

---

### Deferred: ShipStation Firebase → Neon Migration

The existing `backend/src/routes/shipstation.js` contains Firebase references in `create-shipment` and `refresh-tracking` endpoints. These need updating to use Neon PostgreSQL. This is deferred to a separate task as it requires understanding the ShipStation API contract and testing against live ShipStation credentials. The `ShippingBookingModal` uses a plain text carrier input for now; carrier dropdown from ShipStation API can be added when the ShipStation routes are fixed.

---

### Task 16: Final Build Verification

- [ ] **Step 1: Run full TypeScript check**

```bash
npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 2: Run Vite build**

```bash
npx vite build
```

Expected: Build succeeds.

- [ ] **Step 3: Start backend and verify endpoints**

```bash
cd backend && npm run dev
```

Test key endpoints with curl:
- `GET /api/v1/warehouse/kanban` — returns grouped packages
- `GET /api/v1/warehouse/packages?order_id=12184` — returns packages for order
- `POST /api/v1/warehouse/packages` — creates a package

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "feat: complete packing and warehouse workflow implementation"
```
