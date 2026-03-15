-- Packing & Warehouse Workflow Migration
-- Run date: 2026-03-15
-- Already executed against Neon project super-frog-32653848

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

-- 5. Packing number sequence
CREATE SEQUENCE IF NOT EXISTS packing_number_seq START WITH 7000;

-- 6. Backfill warehouse_status from existing Zoho status
UPDATE shipments SET warehouse_status = 'delivered' WHERE status = 'delivered';
UPDATE shipments SET warehouse_status = 'shipped' WHERE status = 'shipped';

-- 7. Backfill order_line_item_id on package_items
UPDATE package_items pi
  SET order_line_item_id = oli.id
  FROM order_line_items oli
  WHERE pi.order_id = oli.order_id
  AND pi.sku = oli.sku
  AND pi.order_line_item_id IS NULL
  AND pi.sku IS NOT NULL;
