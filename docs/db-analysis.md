# Splitfin Database Analysis — Phase 0

**Date:** 2026-02-07
**Database:** Neon PostgreSQL (`super-frog-32653848`, `us-west-2`, PG 17)

---

## 1. Table Inventory & Row Counts

| Table | Rows | Notes |
|-------|------|-------|
| **orders** | **5,033** | Much higher than the ~200 estimate in the plan |
| **order_line_items** | **35,338** | ~7 items per order avg |
| **products** | **9,967** | 8,190 active, 1,777 inactive |
| **invoices** | **6,184** | More invoices than orders (multiple per order) |
| **customers** | **1,580** | All status = 'active' |
| agents | 10 | Sales team |
| notifications | 24 | Low volume |
| catalogues | 10 | |
| conversations | 1 | Messaging barely used |
| messages | 1 | |
| enquiries | 0 | Empty — feature not live |

**Other tables:** agent_customer_assignments, app_cache, broadcast_messages, broadcast_reads, broadcast_attachments, catalogue_requests, customer_sync_log, enquiry_activities, invoice_line_items, message_attachments, order_sync_log, package_items, product_catalogue_positions, product_feeds, product_sync_log, push_tokens, shipments, webhook_logs

---

## 2. Orders Analysis (5,033 rows)

### 2.1 Schema (key columns)

| Column | Type | Nullable | Notes |
|--------|------|----------|-------|
| id | integer (PK) | NO | Auto-increment |
| zoho_salesorder_id | text (unique) | NO | Zoho sync key |
| salesorder_number | text | NO | Display number (e.g. SO-05216) |
| reference_number | text | YES | |
| zoho_customer_id | text | NO | FK to Zoho customer |
| customer_name | text | NO | Denormalised |
| agent_id | text | YES | FK to agents |
| date | date | NO | Order date |
| status | text | NO | Default 'draft' |
| sub_total | numeric | YES | |
| tax_total | numeric | YES | |
| discount_total | numeric | YES | |
| shipping_charge | numeric | YES | |
| adjustment | numeric | YES | |
| total | numeric | YES | |
| currency_code | text | YES | Default 'GBP' |
| shipment_status | text | YES | |
| shipped_status | text | YES | |
| invoiced_status | text | YES | |
| notes | text | YES | |
| delivery_date | date | YES | |
| salesperson_id | text | YES | |
| salesperson_name | text | YES | Denormalised |
| shipping_address_json | jsonb | YES | |
| packages_json | jsonb | YES | |
| invoices_json | jsonb | YES | |
| sync_status | text | YES | Default 'synced' |
| created_at / updated_at | timestamptz | YES | |

### 2.2 Status Distribution

| Status | Count | % |
|--------|-------|---|
| invoiced | 4,808 | 95.5% |
| confirmed | 70 | 1.4% |
| shipped | 58 | 1.2% |
| fulfilled | 32 | 0.6% |
| draft | 23 | 0.5% |
| partially_invoiced | 20 | 0.4% |
| partially_shipped | 20 | 0.4% |
| void | 2 | 0.0% |

**Decision:** Overwhelmingly "invoiced". Filter should show all 8 statuses. Default view should probably exclude void. Consider grouping: Active (draft, confirmed, shipped, partially_shipped, partially_invoiced, fulfilled) vs Completed (invoiced) vs Cancelled (void).

### 2.3 Shipped Status Distribution

| Shipped Status | Count | % |
|----------------|-------|---|
| *(null)* | 4,860 | 96.6% |
| shipped | 62 | 1.2% |
| pending | 56 | 1.1% |
| delivered | 47 | 0.9% |
| partially_shipped | 5 | 0.1% |
| fulfilled | 3 | 0.1% |

**Decision:** 96.6% null — this column is sparsely populated. Show as filter but don't give it a dedicated column; use an icon/badge within the status column instead.

### 2.4 Invoiced Status Distribution

| Invoiced Status | Count | % |
|-----------------|-------|---|
| *(null)* | 4,864 | 96.6% |
| invoiced | 90 | 1.8% |
| not_invoiced | 59 | 1.2% |
| partially_invoiced | 20 | 0.4% |

**Decision:** Same as shipped — 96.6% null. Combine into status column as secondary indicator, not standalone column.

### 2.5 Date Range

- **Earliest:** 2022-09-29
- **Latest:** 2026-02-06
- **Span:** ~3.4 years

### 2.6 Line Items per Order

- **Average:** 7.0 items
- **Maximum:** 201 items

### 2.7 Top 10 Customers by Order Count

| Customer | Orders | Total Value |
|----------|--------|-------------|
| Amazon UK - Customer | 2,605 | £115,399.74 |
| Homearama | 222 | £73,584.30 |
| Cambium Operations Ltd | 116 | £19,335.58 |
| Naken Interiors Ltd | 52 | £6,656.18 |
| DM Brands Ltd | 40 | £646.30 |
| R.A. Enterprises Limited | 39 | £31,683.02 |
| Aston Pottery Ltd | 37 | £14,158.72 |
| Between the lines Ltd | 24 | £70,785.24 |
| Roullier White | 23 | £21,796.17 |
| DM Brands | 22 | £97.09 |

**Note:** Amazon UK accounts for 51.8% of all orders. "DM Brands Ltd" and "DM Brands" appear to be duplicates (internal/test accounts with low value).

### 2.8 Orders per Agent (Salesperson)

| Salesperson | Orders |
|-------------|--------|
| matt | 629 |
| Dave Roberts | 266 |
| Nick Barr | 203 |
| Sales | 200 |
| Gay Croker | 172 |
| Marcus Johnson | 157 |
| Kate Ellis | 136 |
| Stephen Stroud | 98 |
| Hannah Neale | 97 |
| Steph Gillard | 82 |
| Chris Roberts | 17 |
| Charlie Hanks | 16 |
| Mike Anderson | 5 |
| Antony Davanzo | 3 |

**Note:** "matt" (lowercase) and "Sales" look like generic/system accounts. 14 unique salesperson names.

### 2.9 Order Value Statistics

| Metric | Value |
|--------|-------|
| Average | £374.75 |
| Minimum | £0.00 |
| Maximum | £20,498.74 |

---

## 3. Customers Analysis (1,580 rows)

### 3.1 Schema (key columns)

| Column | Type | Nullable | Notes |
|--------|------|----------|-------|
| id | integer (PK) | NO | Auto-increment |
| zoho_contact_id | text (unique) | NO | |
| company_name | text | NO | |
| contact_name | text | YES | |
| email | text | YES | |
| phone | text | YES | |
| mobile | text | YES | |
| website | text | YES | |
| payment_terms | text | YES | |
| payment_terms_label | text | YES | |
| billing_address | jsonb | YES | |
| shipping_address | jsonb | YES | |
| outstanding_receivable | numeric | YES | Default 0.00 |
| unused_credits | numeric | YES | Default 0.00 |
| status | text | YES | Default 'active' |
| contact_persons | jsonb | YES | Default '[]' |
| location_region | text | YES | |
| total_spent | numeric | YES | Default 0 |
| average_order_value | numeric | YES | |
| segment | text | YES | |
| agent_id | text | YES | FK to agents |
| has_transaction | boolean | YES | Default false |
| latitude / longitude | double precision | YES | |
| formatted_address | text | YES | |
| custom_fields | jsonb | YES | |
| pin_hash | text | YES | Customer portal auth |
| last_login_at | timestamptz | YES | |

**Note:** No `last_order_date` column exists in DB. The plan references it but it would need to be computed from `orders` table join. `has_transaction` is the closest proxy (359 with, 1,221 without).

### 3.2 Status Distribution

| Status | Count |
|--------|-------|
| active | 1,580 (100%) |

**Decision:** All customers are active. No status filter needed unless inactive customers are added later.

### 3.3 Region Distribution

| Region | Count | % |
|--------|-------|---|
| Other | 276 | 17.5% |
| Scotland | 228 | 14.4% |
| London | 194 | 12.3% |
| Midlands | 187 | 11.8% |
| North West | 137 | 8.7% |
| South East | 131 | 8.3% |
| South West | 100 | 6.3% |
| Wales | 87 | 5.5% |
| Ireland | 39 | 2.5% |
| *(null — no region)* | 201 | 12.7% |

**Decision:** 9 regions + null. Good for multiSelect filter. 87.3% have a region assigned.

### 3.4 Payment Terms Distribution

| Payment Terms | Count | % |
|---------------|-------|---|
| Net 30 | 1,237 | 78.3% |
| Due on Receipt | 186 | 11.8% |
| Due On Receipt | 153 | 9.7% |
| Due end of next month | 3 | 0.2% |
| Net 60 | 1 | 0.1% |

**Decision:** "Due on Receipt" and "Due On Receipt" are duplicates (casing). Should normalise in display. Only 3 meaningful values: Net 30, Due on Receipt (combined 339), Due end of next month, Net 60.

### 3.5 Segment Distribution

| Segment | Count | % of segmented | % of all |
|---------|-------|----------------|----------|
| Low | 273 | 48.8% | 17.3% |
| Medium | 198 | 35.4% | 12.5% |
| High | 58 | 10.4% | 3.7% |
| VIP | 31 | 5.5% | 2.0% |
| *(null — no segment)* | 1,020 | — | 64.6% |

**Decision:** Only 35.4% of customers have a segment. Still useful as a filter. 4 values: Low, Medium, High, VIP.

### 3.6 Transaction Activity

| Metric | Count |
|--------|-------|
| With transactions | 359 (22.7%) |
| Without transactions | 1,221 (77.3%) |

### 3.7 Spending Tiers

| Tier | Count | % |
|------|-------|---|
| £0 | 943 | 59.7% |
| £1-99 | 65 | 4.1% |
| £100-499 | 125 | 7.9% |
| £500-999 | 135 | 8.5% |
| £1k-5k | 216 | 13.7% |
| £5k+ | 96 | 6.1% |

**Decision:** 59.7% have zero spend. The 40.3% with spend are well distributed across tiers.

### 3.8 Outstanding Receivables

| Metric | Value |
|--------|-------|
| Customers with outstanding | 76 (4.8%) |
| Total outstanding | £56,090.98 |
| Average outstanding | £738.04 |
| Max outstanding | £11,824.84 |

### 3.9 Agent Assignment

| Metric | Count |
|--------|-------|
| With agent assigned | 627 (39.7%) |
| Without agent | 953 (60.3%) |

---

## 4. Products Analysis (9,967 rows)

### 4.1 Schema (key columns)

| Column | Type | Nullable | Notes |
|--------|------|----------|-------|
| id | integer (PK) | NO | Auto-increment |
| zoho_item_id | text (unique) | NO | |
| sku | text | NO | |
| name | text | NO | |
| description | text | YES | |
| rate | numeric | YES | Selling price, default 0.00 |
| cost_price | numeric | YES | Cost price |
| stock_on_hand | integer | YES | Default 0 |
| unit | text | YES | Default 'pcs' |
| status | text | YES | Default 'active' |
| brand | text | YES | |
| manufacturer | text | YES | |
| cf_brand | text | YES | Custom field brand |
| group_name | text | YES | |
| category_name | text | YES | |
| ean / upc | text | YES | Barcodes |
| image_url | text | YES | Primary image |
| image_urls | jsonb | YES | Multiple images, default '[]' |
| local_image_url | text | YES | |
| color_family | varchar | YES | |
| category_l1 / l2 / l3 | varchar | YES | Category hierarchy |
| dimensions_formatted | varchar | YES | |
| length / width / height / depth / diameter | numeric | YES | |
| ai_description | text | YES | AI-generated description |
| ai_short_description | text | YES | |
| ai_features | jsonb | YES | Default '[]' |
| variant | text | YES | |
| materials | text | YES | |
| catalogue_page | integer | YES | |
| catalogue_id | text | YES | |
| sync_status | text | YES | Default 'synced' |

### 4.2 Brand Distribution

| Brand | Products | % |
|-------|----------|---|
| ppd PAPERPRODUCTS DESIGN GmbH | 3,479 | 34.9% |
| Rader | 2,041 | 20.5% |
| Ideas 4 Seasons | 1,108 | 11.1% |
| Remember | 858 | 8.6% |
| Elvang | 471 | 4.7% |
| My Flame Lifestyle | 421 | 4.2% |
| Relaxound | 93 | 0.9% |
| blomus | 87 | 0.9% |
| Topl | 4 | 0.0% |
| Gefu | 2 | 0.0% |
| nan | 1 | 0.0% |
| Rader GmbH | 1 | 0.0% |
| *(empty string)* | ~1,401 | 14.1% |

**Decision:** 10 meaningful brands. "Rader GmbH" is a duplicate of "Rader". "nan" is a data import artifact. ~14% have no brand. multiSelect filter with the top 8 brands.

### 4.3 Category Distribution

Only **20 products** have a `category_name` out of 9,967 (0.2%). Categories are like "Necklace" (4), "Assortment" (2), "Plate" (2), etc.

**Decision:** `category_name` is too sparse (0.2%) to use as a filter column. Hide it from the table. The `category_l1/l2/l3` columns may be better — need to check population.

### 4.4 Stock Status Distribution

| Status | Count | % |
|--------|-------|---|
| In Stock (>10) | 514 | 5.2% |
| Low Stock (1-10) | 1,122 | 11.3% |
| Out of Stock (0/null) | 8,279 | 83.1% |
| **Active products only** | **8,190** | |
| **Inactive** | **1,777** | |

**Decision:** 83% out of stock is very high. Many of these are likely inactive/discontinued. The stock filter is still important — users need to find what's actually available. Consider combining stock filter with status filter: "Active & In Stock" as a preset.

### 4.5 Price Range

| Metric | Value |
|--------|-------|
| Average price | £11.27 |
| Minimum price | £0.41 |
| Maximum price | £641.28 |

### 4.6 Image Coverage

| Metric | Count | % |
|--------|-------|---|
| With image | 3,285 | 33.0% |
| Without image | 6,682 | 67.0% |

**Decision:** Only 33% have images. Show placeholder/initials for products without images.

### 4.7 Cost Price Coverage

| Metric | Count | % |
|--------|-------|---|
| With cost price | 8,562 | 85.9% |
| Without cost price | 1,405 | 14.1% |

**Decision:** 86% have cost data — margin column is viable for most products. Show "-" for products without cost.

### 4.8 Status Distribution

| Status | Count | % |
|--------|-------|---|
| active | 8,190 | 82.2% |
| inactive | 1,777 | 17.8% |

**Decision:** Default filter should show "active" only. Include status toggle/filter.

---

## 5. Strategic Decisions (Informed by Data)

### 5.1 Pagination Strategy

All three core tables are large enough to require **server-side pagination**:

| Table | Rows | Recommended Page Size | Rationale |
|-------|------|----------------------|-----------|
| Orders | 5,033 | 50 | High volume, users scan by date |
| Customers | 1,580 | 25 | Moderate volume, often searching specific customer |
| Products | 9,967 | 50 | Very high volume, users browse by brand |

### 5.2 Default Sorts

| Table | Default Sort | Direction | Rationale |
|-------|-------------|-----------|-----------|
| Orders | `date` | DESC | Users want newest orders first |
| Customers | `company_name` | ASC | Alphabetical browsing |
| Products | `name` | ASC | Alphabetical, consistent with current |

### 5.3 Filter Options (from actual data)

**Orders Filters:**
- Status: `draft`, `confirmed`, `shipped`, `partially_shipped`, `partially_invoiced`, `invoiced`, `fulfilled`, `void` (multiSelect)
- Agent: 14 salesperson names (select)
- Date: date range picker
- Total: number range

**Customers Filters:**
- Region: `Other`, `Scotland`, `London`, `Midlands`, `North West`, `South East`, `South West`, `Wales`, `Ireland` (multiSelect)
- Payment Terms: `Net 30`, `Due on Receipt`, `Due end of next month`, `Net 60` (select, normalise casing)
- Segment: `Low`, `Medium`, `High`, `VIP` (select)
- Spent: number range
- Has Transactions: boolean toggle

**Products Filters:**
- Brand: Top 8 brands as multiSelect (ppd, Rader, Ideas 4 Seasons, Remember, Elvang, My Flame Lifestyle, Relaxound, blomus)
- Stock Status: `In Stock`, `Low Stock`, `Out of Stock` (select)
- Status: `active`, `inactive` (select, default active)
- Price: number range

### 5.4 Column Visibility Recommendations

**Orders Table — Show:**
- salesorder_number, customer_name, salesperson_name, date, status, total

**Orders Table — Hide/Compact (sparse data):**
- shipped_status (96.6% null) — show as icon within status when present
- invoiced_status (96.6% null) — show as icon within status when present

**Customers Table — Show:**
- company_name, email, phone, location_region, total_spent, outstanding_receivable, payment_terms_label, segment

**Customers Table — Hide:**
- last_order_date (doesn't exist in DB — would need computed from orders join)
- status (100% active — no filter value)

**Products Table — Show:**
- name + sku, brand, stock_on_hand, rate, cost_price, margin (calculated)

**Products Table — Hide:**
- category_name (0.2% populated — useless)
- image column (only 33% have images — show thumbnail inline with name instead)

### 5.5 Data Quality Issues

1. **Payment terms casing:** "Due on Receipt" vs "Due On Receipt" — 339 customers affected. Normalise in display.
2. **Brand duplicates:** "Rader" vs "Rader GmbH", "nan" artifact — clean up or normalise in display.
3. **Amazon dominance:** Amazon UK accounts for 51.8% of orders — consider "exclude Amazon" toggle for meaningful analytics.
4. **No `last_order_date` on customers:** Plan references this column but it doesn't exist. Must compute via `SELECT MAX(date) FROM orders WHERE zoho_customer_id = c.zoho_contact_id`.
5. **Out of stock dominance:** 83% products are out of stock — many likely discontinued. Default to showing active-only.
6. **Image coverage:** Only 33% of products have images — need good placeholder design.
7. **Category sparsity:** `category_name` is nearly empty (0.2%). `category_l1/l2/l3` columns exist but population unknown — check before relying on them.

### 5.6 Backend API Requirements (Updated from Data)

Based on actual data volumes, the backend MUST support:

1. **All list endpoints:** `sort_by`, `sort_order`, pagination `meta: { total, limit, offset, has_more }`
2. **Orders:** `status` (multi), `salesperson_name`, `date_from`/`date_to`, `total_min`/`total_max`, `search` (salesorder_number, customer_name, reference_number)
3. **Customers:** `region` (multi), `payment_terms`, `segment`, `spent_min`/`spent_max`, `has_transaction`, `search` (company_name, email, phone, contact_name)
4. **Products:** `brand` (multi), `stock_filter` (in_stock/low/out), `status`, `price_min`/`price_max`, `search` (name, sku, description)
