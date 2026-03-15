# Packing & Warehouse Workflow Design

Full packing creation in Splitfin with bidirectional Zoho sync. Users create packages from the ViewOrder page, the warehouse team progresses them through the kanban board, and changes sync both ways with Zoho Inventory.

## Data Model Changes

### `shipments` table — add columns

```sql
-- Make zoho_shipment_id nullable for locally-created packages
ALTER TABLE shipments ALTER COLUMN zoho_shipment_id DROP NOT NULL;

-- Add warehouse workflow columns
ALTER TABLE shipments
  ADD COLUMN warehouse_status text DEFAULT 'not_shipped',
  ADD COLUMN sync_status text DEFAULT 'synced',
  ADD COLUMN sync_error text,
  ADD COLUMN packed_at timestamptz,
  ADD COLUMN packed_by text,
  ADD COLUMN sent_to_packing_at timestamptz,
  ADD COLUMN sent_to_packing_by text,
  ADD COLUMN delivery_booked_at timestamptz,
  ADD COLUMN delivery_booked_by text;

CREATE INDEX idx_shipments_warehouse_status ON shipments (warehouse_status);
CREATE INDEX idx_shipments_pending_sync ON shipments (sync_status, updated_at) WHERE sync_status <> 'synced';
```

### `package_items` table — make zoho ID nullable

```sql
-- Allow locally-created package items without a Zoho ID
ALTER TABLE package_items ALTER COLUMN zoho_package_item_id DROP NOT NULL;

-- Add linkage back to order line items for quantity tracking
ALTER TABLE package_items ADD COLUMN order_line_item_id integer REFERENCES order_line_items(id) ON DELETE SET NULL;
CREATE INDEX idx_package_items_order_line_item_id ON package_items (order_line_item_id);
```

### Column explanations

- `warehouse_status` on `shipments`: local workflow state Splitfin owns. Values: `not_shipped | sent_to_packing | packed | delivery_booked | shipped | delivered`. The existing `status` column continues to hold the Zoho-synced value.
- `sync_status` on `shipments`: tracks push state (`synced | pending_push | conflict`). Used by the retry mechanism to push locally-created packages to Zoho.
- `order_line_item_id` on `package_items`: FK back to the source line item. Enables reliable quantity tracking without relying on SKU matching. Populated for locally-created items; null for Zoho-synced items (matched by SKU fallback).

### Packing number generation

Use a PostgreSQL sequence to avoid race conditions:

```sql
CREATE SEQUENCE packing_number_seq START WITH 7000;
-- Usage: 'PKG-' || lpad(nextval('packing_number_seq')::text, 5, '0')
```

Starting at 7000 to avoid collision with existing Zoho PKG numbers (currently up to ~6900).

### Migration — backfill `warehouse_status`

```sql
-- Map all known Zoho statuses
UPDATE shipments SET warehouse_status = 'delivered' WHERE status = 'delivered';
UPDATE shipments SET warehouse_status = 'shipped' WHERE status = 'shipped';
UPDATE shipments SET warehouse_status = 'packed' WHERE status = 'packed';
UPDATE shipments SET warehouse_status = 'sent_to_packing' WHERE status IN ('not_shipped') AND created_at >= now() - interval '12 months';

-- Stale data guard: anything older than 12 months still not_shipped → assume delivered
UPDATE shipments SET warehouse_status = 'delivered'
  WHERE warehouse_status IS NULL
  AND created_at < now() - interval '12 months';

-- Default remaining to not_shipped
UPDATE shipments SET warehouse_status = 'not_shipped' WHERE warehouse_status IS NULL;

-- Backfill order_line_item_id on package_items where possible (match by SKU + order)
UPDATE package_items pi
  SET order_line_item_id = oli.id
  FROM order_line_items oli
  WHERE pi.order_id = oli.order_id
  AND pi.sku = oli.sku
  AND pi.order_line_item_id IS NULL;
```

### Existing tables used as-is

- `package_items` — one row per packed line item. When creating locally, we insert with the same shape Zoho sends (packing_number, salesorder_number, customer_name, sku, item_name, quantity_packed, shipping address fields, order_id FK, shipment_id FK, plus new order_line_item_id FK).
- `order_line_items` — `quantity_shipped` updated when items are packed.
- `orders` — `shipped_status` updated to reflect packing state. Note: `shipped_status` (not `shipment_status`) is the column used for the overall order shipping progress. Values: `pending | partially_shipped | shipped`.

### Staleness guard

- Kanban board shows all non-terminal statuses (`not_shipped` through `delivery_booked`) regardless of age — forward orders may be 8-9 months out.
- `shipped` and `delivered` shown for 30 days after status change, then hidden from kanban.
- Backend accepts `max_age_days` parameter for delivered/shipped filtering (default 30).

### Fix `packageSync.js` before extending

The existing `packageSync.js` writes columns that may not match the actual `shipments` schema (e.g. `external_package_id`, `warehouse_id`, `shipping_address_1`). Before extending it:
1. Audit the `transformRecord` method against the real `shipments` columns
2. Fix column mappings to match: `zoho_shipment_id`, `shipping_address`, `shipping_city`, etc.
3. Add `warehouse_status` preservation logic (see Sync section)
4. Test with a dry-run sync before deploying

## Backend API

New route file: `backend/src/routes/warehouse.js`, mounted at `/api/v1/warehouse`.

### Authentication & Authorization

All `/api/v1/warehouse/*` routes use the existing `authenticateRequest` JWT middleware (same as other v1 routes). Additionally:
- All agents can view packages and kanban data
- Package creation requires the order to belong to the requesting agent, OR the agent is admin
- Status updates (packing, delivery) are allowed for admin agents and warehouse-role agents
- Delete is admin-only

### Package CRUD

| Method | Endpoint | Purpose |
|--------|----------|---------|
| `GET` | `/packages?order_id=X` | Packages for an order (joins shipments + package_items) |
| `GET` | `/packages/:id` | Single package with items |
| `POST` | `/packages` | Create package from order line items |
| `PUT` | `/packages/:id/status` | Update warehouse_status (state machine) |
| `PUT` | `/packages/:id/items` | Edit package item quantities/notes |
| `DELETE` | `/packages/:id` | Delete (only if not_shipped or sent_to_packing) |

Note: `packages/:id` refers to `shipments.id`. The API uses "package" terminology but the underlying table is `shipments`. No new tables created.

### Kanban

| Method | Endpoint | Purpose |
|--------|----------|---------|
| `GET` | `/kanban` | Shipments grouped by warehouse_status with staleness guard |

### Packing operations

| Method | Endpoint | Purpose |
|--------|----------|---------|
| `PUT` | `/packages/:id/scan` | Barcode scan — increment quantity_packed on matching package_items row |
| `PUT` | `/packages/:id/mark-packed` | Set all items packed, advance warehouse_status |
| `PUT` | `/packages/:id/book-delivery` | Set carrier, tracking, date, advance status |

### Status state machine

```
not_shipped → sent_to_packing → packed → delivery_booked → shipped → delivered
```

Forward transitions only. One step back allowed for corrections. Enforced server-side.

### Create package flow (`POST /packages`)

Request:
```json
{
  "order_id": 12184,
  "line_items": [
    { "order_line_item_id": 456, "quantity": 2 },
    { "order_line_item_id": 457, "quantity": 1 }
  ],
  "shipping_address": { "address": "...", "city": "...", "zip": "..." }
}
```

Server logic:
1. Validate order exists, status is `confirmed` or `draft`
2. `SELECT ... FOR UPDATE` on the relevant `order_line_items` rows to prevent concurrent over-allocation
3. Validate quantities don't exceed remaining (`quantity - quantity_shipped`)
4. Generate `packing_number` via PostgreSQL sequence (`'PKG-' || lpad(nextval('packing_number_seq')::text, 5, '0')`)
5. Look up order details: `salesorder_number`, `customer_name`, `zoho_salesorder_id`, shipping address
6. Insert `shipments` row with `warehouse_status: 'sent_to_packing'`, `zoho_shipment_id: NULL`, `sync_status: 'pending_push'`
7. Insert `package_items` rows (one per line item, with `order_line_item_id` FK, `zoho_package_item_id: NULL`, copying denormalized fields from order/customer)
8. Update `order_line_items.quantity_shipped` for each item
9. Update `orders.shipped_status`: if all items now fully allocated → `'shipped'`, else `'partially_shipped'`
10. Async: push package to Zoho Inventory (fire-and-forget, see Sync section)
11. Return created package with items

Steps 2-9 run inside a single database transaction.

### Delete package flow (`DELETE /packages/:id`)

1. Validate package exists and `warehouse_status` is `not_shipped` or `sent_to_packing`
2. For each `package_items` row: decrement `order_line_items.quantity_shipped` by `quantity_packed` (using `order_line_item_id` FK, or SKU+order_id fallback)
3. Delete `package_items` rows where `shipment_id` = package id
4. Delete the `shipments` row
5. Recalculate `orders.shipped_status`
6. If `zoho_shipment_id` is not null, attempt async Zoho deletion (best-effort, log failures)

### Scan flow (`PUT /packages/:id/scan`)

Request:
```json
{ "code": "EAN123456" }
```

Server logic:
1. Look up the code against `package_items.sku` where `shipment_id` = package id
2. If no match on SKU, look up `products.sku` by joining through EAN (query `products` table where `sku` matches or a barcode/EAN field matches, then find the matching `package_items` row by SKU)
3. If found and `quantity_packed` < ordered quantity, increment `quantity_packed`
4. Return updated item with scan result (`matched | not_found | already_complete`)

Note: Camera-based barcode scanning is out of scope. The scan modal uses a text input that receives keyboard input from USB/Bluetooth barcode scanners.

## Frontend Components

All in `src/components/warehouse/`. Tailwind + shadcn/ui + motion/react.

### PackageAllocationModal

Opens from ViewOrder "Send to Packing" button. Dialog containing:
- Table: SKU, Item Name, Ordered, Already Shipped, Remaining, Allocate (editable input defaulting to remaining)
- Shipping address (pre-filled from order's `shipping_address_json`, editable)
- Confirm → `POST /api/v1/warehouse/packages`

### OrderPackagesSection

Rendered on ViewOrder below line items. For each package:
- Card with packing number, status badge (semantic colors), item count, date
- Expandable to show item list (SKU, name, quantity)
- Action buttons: advance status, open scan modal, book delivery
- "Send to Packing" button hidden when no remaining unshipped items

### PackingScanModal

Barcode scanning dialog (USB/Bluetooth scanner input only, no camera):
- Auto-focused text input for scanner
- Matches EAN/SKU against package items via `PUT /packages/:id/scan`
- Per-item progress bars (scanned / required)
- "Mark All Packed" shortcut → `PUT /packages/:id/mark-packed`

### ShippingBookingModal

For packed packages:
- Carrier dropdown (from ShipStation `/api/shipstation/carriers`)
- Tracking number input
- Expected delivery date picker
- Notes textarea
- Submit → `PUT /packages/:id/book-delivery`

Note: The existing ShipStation `create-shipment` and `refresh-tracking` endpoints reference Firebase and need fixing to use Neon. This is scoped as part of this work — those endpoints will be updated to query `shipments`/`orders` tables in Neon instead of Firebase.

### PackingListEditModal

Edit package items:
- Editable quantity, boxes, notes per item
- Status dropdown for manual correction
- Save → `PUT /packages/:id/items`

### PackingListPrint

Print-optimized layout for packing slips:
- Order number, customer, shipping address
- Item table: SKU, name, quantity, boxes
- `window.print()` with `@media print` styles

### Warehouse.tsx (update)

Existing kanban — change data source:
- Replace `KanbanOrder` type with `KanbanPackage` (shipment-level, not order-level)
- Cards show: packing number (title), order number (subtitle, clickable), customer, item count, action button
- `warehouseService.getKanbanData()` → `GET /api/v1/warehouse/kanban`
- Drag between columns → `PUT /api/v1/warehouse/packages/:id/status`

Transition: The `shippingService` wrapper keeps the old interface working while the backend is built. Once the warehouse API is live, the kanban switches to the new `warehouseService` in a single PR.

### ViewOrder.tsx (modify)

- Replace basic "Send to Packing" button with one that opens `PackageAllocationModal`
- Add `OrderPackagesSection` below the line items section

## Service Layer

### `src/services/warehouseService.ts` (new)

```typescript
warehouseService = {
  // Package CRUD
  getPackagesForOrder(orderId)
  getPackage(packageId)
  createPackage(orderId, lineItems, shippingAddress)
  deletePackage(packageId)

  // Status
  updatePackageStatus(packageId, status)
  markPacked(packageId)
  bookDelivery(packageId, carrier, tracking, date, notes)

  // Scanning
  scanItem(packageId, code)

  // Kanban
  getKanbanData()

  // Edit
  updatePackageItems(packageId, items)
}
```

All methods call the `/api/v1/warehouse/*` endpoints via the existing `api` client.

### `shippingService.ts` update

Existing methods become thin wrappers calling `warehouseService`. No breaking changes to existing Warehouse kanban component during transition.

## Zoho Bidirectional Sync

### Splitfin → Zoho (push)

Add to `backend/src/api/zoho.js`:
- `createPackage(zohoSalesorderId, lineItems)` — `POST /inventory/v1/packages?salesorder_id=X` (note: uses `orders.zoho_salesorder_id`, not internal order ID)
- `updatePackageStatus(zohoPackageId, status)` — `PUT /inventory/v1/packages/:id`

On local package creation:
1. Create locally in shipments + package_items (with `sync_status: 'pending_push'`)
2. Async call to Zoho using `orders.zoho_salesorder_id` to create package
3. On success: store `zoho_package_item_id` / `zoho_shipment_id` on local rows, set `sync_status: 'synced'`
4. On failure: log to `webhook_logs`, keep `sync_status = 'pending_push'`

### Push retry mechanism

A scheduled job (alongside existing sync cron) queries `shipments WHERE sync_status = 'pending_push'` and retries the Zoho push. Runs every 5 minutes. After 3 failures, sets `sync_status = 'conflict'` and logs to `sync_error` for manual resolution.

### Zoho → Splitfin (pull)

Fix and extend `packageSync.js`:
1. First: audit and fix column mappings to match actual `shipments` schema
2. Preserve local `warehouse_status` — don't overwrite with Zoho's simpler status
3. If Zoho status is ahead (shipped/delivered) and local is behind, advance `warehouse_status`
4. New packages from Zoho that don't exist locally get `warehouse_status` from status mapping
5. Populate `order_line_item_id` on new `package_items` where possible (match by SKU + order_id)

### Conflict resolution

Zoho can advance status forward, never regress. If Splitfin says `packed` and Zoho says `not_shipped`, keep `packed`. If Zoho says `delivered` and Splitfin says `packed`, advance to `delivered`.

### Webhook receiver

Add to `webhooks.js` (uses existing `authenticateWebhook` middleware with `x-webhook-secret` header):
```
POST /api/webhooks/package-update
  → Validate webhook secret
  → Upsert into shipments + package_items
  → Apply conflict resolution rule
  → Log to webhook_logs
```

Real-time sync from Zoho/Make.com without waiting for 30-minute scheduled pull.

## File Locations

| Component | Path |
|-----------|------|
| DB migration | `backend/src/scripts/add-warehouse-status.sql` |
| Backend route | `backend/src/routes/warehouse.js` |
| Zoho API additions | `backend/src/api/zoho.js` (extend) |
| Package sync fix + update | `backend/src/services/sync/packageSync.js` (fix + extend) |
| Webhook handler | `backend/src/routes/webhooks.js` (extend) |
| ShipStation fix | `backend/src/routes/shipstation.js` (fix Firebase → Neon) |
| Frontend service | `src/services/warehouseService.ts` |
| Allocation modal | `src/components/warehouse/PackageAllocationModal.tsx` |
| Packages section | `src/components/warehouse/OrderPackagesSection.tsx` |
| Scan modal | `src/components/warehouse/PackingScanModal.tsx` |
| Shipping modal | `src/components/warehouse/ShippingBookingModal.tsx` |
| Edit modal | `src/components/warehouse/PackingListEditModal.tsx` |
| Print view | `src/components/warehouse/PackingListPrint.tsx` |
| Kanban update | `src/components/Warehouse.tsx` (modify) |
| ViewOrder update | `src/components/ViewOrder.tsx` (modify) |
| Shipping service | `src/services/shippingService.ts` (simplify) |
