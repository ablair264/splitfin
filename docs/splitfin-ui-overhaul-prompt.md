# Splitfin UI/UX Overhaul — Comprehensive Implementation Plan

## Project Context

**Project:** Splitfin — wholesale business management platform (React 19 + Vite + TanStack Table + Tailwind CSS)
**Location:** `/Users/blair/Desktop/Development/Splitfin-New`
**Backend API:** Express/Node.js on `localhost:3001`, Neon PostgreSQL database. Backend source is in `/backend` (within the `Splitfin-New` project root).
**Current state:** Functional dark-theme app with 9 core pages, scored 5.7/10 in UI audit

This prompt covers a complete UI overhaul across three phases. Before writing ANY code, you must first analyse the Neon database via MCP to understand the actual data shape, volumes, and relationships. This analysis drives the data table strategy.

---

## PHASE 0: DATABASE ANALYSIS (Do this first!)

Before touching any UI code, connect to the Neon database via MCP and run the following analysis. This data is essential for making informed decisions about table columns, filters, pagination strategy, and sorting defaults.

### 0.1 Schema Discovery
```sql
-- Get all tables and their columns
SELECT table_name, column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public'
ORDER BY table_name, ordinal_position;

-- Get row counts for key tables
SELECT 'customers' as table_name, COUNT(*) as row_count FROM customers
UNION ALL SELECT 'sales_orders', COUNT(*) FROM sales_orders
UNION ALL SELECT 'sales_order_line_items', COUNT(*) FROM sales_order_line_items
UNION ALL SELECT 'products', COUNT(*) FROM products
UNION ALL SELECT 'invoices', COUNT(*) FROM invoices;
```

### 0.2 Orders Analysis
```sql
-- Status distribution (for filter options)
SELECT status, COUNT(*) as count FROM sales_orders GROUP BY status ORDER BY count DESC;

-- Shipment status distribution
SELECT shipped_status, COUNT(*) FROM sales_orders GROUP BY shipped_status;
SELECT invoiced_status, COUNT(*) FROM sales_orders GROUP BY invoiced_status;

-- Date range span
SELECT MIN(date) as earliest, MAX(date) as latest FROM sales_orders;

-- Average line items per order
SELECT AVG(item_count) as avg_items, MAX(item_count) as max_items
FROM (SELECT zoho_salesorder_id, COUNT(*) as item_count FROM sales_order_line_items GROUP BY zoho_salesorder_id) sub;

-- Top 10 customers by order count
SELECT customer_name, COUNT(*) as order_count, SUM(total) as total_value
FROM sales_orders GROUP BY customer_name ORDER BY order_count DESC LIMIT 10;

-- Orders per agent
SELECT salesperson_name, COUNT(*) FROM sales_orders WHERE salesperson_name IS NOT NULL GROUP BY salesperson_name;

-- Average order value and total range
SELECT AVG(total) as avg_total, MIN(total) as min_total, MAX(total) as max_total FROM sales_orders;
```

### 0.3 Customers Analysis
```sql
-- Status distribution
SELECT status, COUNT(*) FROM customers GROUP BY status;

-- Region distribution (for filter options)
SELECT location_region, COUNT(*) FROM customers WHERE location_region IS NOT NULL GROUP BY location_region ORDER BY count DESC;

-- Payment terms distribution
SELECT payment_terms_label, COUNT(*) FROM customers GROUP BY payment_terms_label ORDER BY count DESC;

-- Segment distribution
SELECT segment, COUNT(*) FROM customers WHERE segment IS NOT NULL GROUP BY segment;

-- Customers with/without orders
SELECT
  COUNT(*) as total,
  COUNT(CASE WHEN last_order_date IS NOT NULL THEN 1 END) as with_orders,
  COUNT(CASE WHEN last_order_date IS NULL THEN 1 END) as without_orders
FROM customers;

-- Spending tiers
SELECT
  CASE
    WHEN total_spent = 0 THEN '£0'
    WHEN total_spent < 100 THEN '£1-99'
    WHEN total_spent < 500 THEN '£100-499'
    WHEN total_spent < 1000 THEN '£500-999'
    WHEN total_spent < 5000 THEN '£1k-5k'
    ELSE '£5k+'
  END as tier,
  COUNT(*) as count
FROM customers GROUP BY tier ORDER BY MIN(total_spent);
```

### 0.4 Products Analysis
```sql
-- Brand distribution (for filter options)
SELECT brand, COUNT(*) as product_count FROM products WHERE brand IS NOT NULL AND brand != '' GROUP BY brand ORDER BY product_count DESC;

-- Category distribution
SELECT category_name, COUNT(*) FROM products WHERE category_name IS NOT NULL AND category_name != '' GROUP BY category_name ORDER BY count DESC LIMIT 20;

-- Stock status distribution
SELECT
  COUNT(*) as total,
  COUNT(CASE WHEN stock_on_hand > 10 THEN 1 END) as in_stock,
  COUNT(CASE WHEN stock_on_hand > 0 AND stock_on_hand <= 10 THEN 1 END) as low_stock,
  COUNT(CASE WHEN stock_on_hand = 0 THEN 1 END) as out_of_stock
FROM products;

-- Price range
SELECT AVG(rate) as avg_price, MIN(rate) as min_price, MAX(rate) as max_price FROM products WHERE rate > 0;

-- Products with/without images
SELECT COUNT(CASE WHEN image_url IS NOT NULL THEN 1 END) as with_image, COUNT(CASE WHEN image_url IS NULL THEN 1 END) as without_image FROM products;

-- Active vs inactive
SELECT status, COUNT(*) FROM products GROUP BY status;
```

### 0.5 Record the Results

After running all queries, save the results as a summary. Use these results to inform every decision below — particularly:
- Which filter options to present (only show values that actually exist in the data)
- What pagination size makes sense given dataset volumes
- Which columns are most valuable (have data in them vs mostly null/empty)
- What the default sort should be per table
- Whether server-side or client-side filtering/sorting is needed (server-side for tables >500 rows)

---

## PHASE 1: GLOBAL UI FIXES (All Pages)

These changes apply across the entire application before touching individual pages.

### 1.1 Accessibility & Semantic Navigation

**Files:** `src/components/app-sidebar.tsx`, `src/components/app-sidebar-nav.tsx`

**Problem:** Sidebar uses `<div onClick>` instead of `<a href>` — breaks right-click, screen readers, browser history.

**Fix:**
- Convert ALL sidebar nav items to proper `<Link>` components from `react-router-dom`
- Every nav item must render as an `<a>` tag with a real `href`
- Ensure keyboard navigation works (Tab, Enter, Space)
- Add `aria-current="page"` to the active nav item
- Add tooltips to all top-right header icons (sidebar toggle, dark mode, notifications, messages, settings)

### 1.2 Dynamic Page Titles

**File:** `src/layouts/MasterLayout.tsx` or create `src/hooks/usePageTitle.ts`

**Problem:** `<title>` is always "Splitfin" regardless of page.

**Fix:** Create a `usePageTitle` hook:
```tsx
function usePageTitle(title: string) {
  useEffect(() => {
    document.title = title ? `${title} — Splitfin` : 'Splitfin';
    return () => { document.title = 'Splitfin'; };
  }, [title]);
}
```
Apply to every page component: `usePageTitle('Orders')`, `usePageTitle('Dashboard')`, etc.

### 1.3 Page Header Component

**Create:** `src/components/shared/PageHeader.tsx`

**Problem:** List pages (Orders, Customers, Products) lack a visible H1 heading. The page title only appears in the small top-bar breadcrumb. Headers are inconsistent across pages.

**Design Requirements:**
- Every page gets a consistent header with: H1 page title (left), primary action button (right), optional subtitle/count
- The header should include breadcrumbs for detail pages
- Consistent vertical spacing below header before content starts
- Example for Orders: `H1: "Orders"` | subtitle: "204 orders" | right: date range filter + status filter
- Example for Products: `H1: "Products"` | subtitle: "8,190 products" | right: brand filter + add product button

```tsx
interface PageHeaderProps {
  title: string;
  subtitle?: string;
  count?: number;
  breadcrumbs?: { label: string; href?: string }[];
  actions?: React.ReactNode;
}
```

### 1.4 Contrast & Typography Fixes

**Files:** `src/index.css`, `tailwind.config.ts`

**Problem:** Secondary text on dark backgrounds fails WCAG AA (4.5:1 ratio). Dates, emails, status sub-text are too faint.

**Fix:**
- Audit all `text-muted-foreground` usages — ensure the colour has minimum 4.5:1 contrast against `bg-background` and `bg-card`
- Current muted text appears to be around `#6b7280` on `#1a1f2a` backgrounds — this fails AA. Bump to at least `#9ca3af`
- Status badges: increase font size from ~10px to 12px minimum, add solid background colours:
  - Draft: `bg-amber-500/20 text-amber-400 border border-amber-500/30`
  - Confirmed: `bg-emerald-500/20 text-emerald-400 border border-emerald-500/30`
  - Shipped: `bg-blue-500/20 text-blue-400 border border-blue-500/30`
  - Invoiced: `bg-purple-500/20 text-purple-400 border border-purple-500/30`
- Standardise text casing: ALL CAPS for table column headers only. Title Case for section headings. Sentence case for labels.

### 1.5 Teal Accent Hierarchy

**Problem:** Teal is used for active nav, primary buttons, links, badges, and status indicators — everything looks the same.

**Fix:**
- **Primary actions only:** Teal filled (`bg-primary text-primary-foreground`) for "+ New Customer", "+ Add Product", "Send to Packing"
- **Secondary actions:** Ghost/outline style for "View", "Export", "Print"
- **Navigation active:** Teal text + subtle teal left border, no fill
- **Informational badges:** Use semantic colours (see 1.4 status badges) not teal
- **Links:** Teal underline on hover only

### 1.6 Settings in Sidebar

**File:** `src/components/app-sidebar.tsx`

**Problem:** Settings only accessible via tiny gear icon in top-right header.

**Fix:** Add Settings as a sidebar item at the bottom, above the user avatar. Use `Settings` icon from lucide-react.

---

## PHASE 2: DATA TABLE REBUILD (Core Focus)

### 2.0 Install DiceUI Data Table

Reference: https://www.diceui.com/docs/components/data-table

The project already has `@tanstack/react-table`, `nuqs`, and a `src/components/data-table/` directory with DiceUI-style components. Verify these are the DiceUI components, and if not, install them:

```bash
npx shadcn@latest add "@diceui/data-table"
npx shadcn@latest add "@diceui/data-table-sort-list"
npx shadcn@latest add "@diceui/data-table-filter-list"
```

Ensure the NuqsAdapter is wrapping the app for URL state management (check `src/index.tsx` or `src/App.tsx`).

The existing files in `src/components/data-table/`, `src/config/data-table.ts`, `src/types/data-table.ts`, `src/lib/data-table.ts`, `src/lib/parsers.ts`, and `src/hooks/use-data-table.ts` should be checked and updated to match the latest DiceUI docs.

### 2.1 Shared DataTable Design Principles

All three new tables (Orders, Customers, Products) must follow these rules:

**Layout:**
- Use `DataTable` + `DataTableAdvancedToolbar` + `DataTableFilterList` + `DataTableSortList` + `DataTablePagination`
- Table sits inside a rounded card (`rounded-xl border border-border bg-card`)
- Column headers must align precisely with cell data below — no misalignment
- Column widths should be explicitly set using `size` and `minSize` in column defs
- Use column pinning to pin the first column (identifier) and last column (actions) on horizontal scroll
- Row click navigates to detail page. No inline "View" buttons cluttering every row.

**Server-Side Pagination & Filtering:**
- All three tables have large datasets (Orders ~200+, Customers 1,580, Products 8,190)
- ALL filtering, sorting, and pagination MUST be server-side
- The API already supports `limit`, `offset`, `search`, `status` params — extend as needed
- Page size options: 25, 50, 100
- Default page size: 25 for customers, 50 for orders, 50 for products
- URL state via nuqs — filters, sort, page number all reflected in URL for shareability and back/forward

**Visual Standards:**
- Alternating row backgrounds: odd rows `bg-card`, even rows `bg-card/50` or `bg-secondary/30`
- Hover state on rows: `bg-accent/10` with `cursor-pointer`
- Fixed header that stays visible on scroll
- Skeleton loading state while data fetches (use `DataTableSkeleton`)
- Empty state with icon + message + CTA when filters return 0 results

**Bulk Actions:**
- Checkbox column on the left for multi-select
- When rows selected, show floating `ActionBar` at bottom with contextual actions:
  - Orders: "Confirm Selected", "Send to Packing", "Generate Invoices"
  - Customers: "Export Selected", "Assign Agent"
  - Products: "Update Stock", "Export Selected"

### 2.2 Orders Table — Complete Rebuild

**Delete/replace:** `src/components/ViewOrders.tsx`
**Create:** `src/components/orders/OrdersTable.tsx` + `src/components/orders/orders-columns.tsx`

**Column Definitions** (based on `Order` type in `src/types/domain.ts`):

| Column | Field | Width | Sortable | Filterable | Notes |
|--------|-------|-------|----------|------------|-------|
| Checkbox | select | 40px | No | No | Bulk select |
| Order # | salesorder_number | 120px | Yes | text search | Monospaced. Link to `/order/{id}` |
| Customer | customer_name | flex (min 200px) | Yes | text search | Show avatar initials + name. Click links to customer detail |
| Agent | salesperson_name | 140px | Yes | select filter | Only show if data has agents. Options from DB query |
| Date | date | 110px | Yes (default desc) | date/dateRange | Format: "6 Feb 2026" |
| Status | status | 120px | Yes | multiSelect | Coloured badge. Options: from DB status distribution query |
| Shipping | shipped_status | 100px | No | select | Compact badge or icon |
| Invoice | invoiced_status | 100px | No | select | Compact badge or icon |
| Total | total | 100px | Yes | number/range | Right-aligned, formatted £X,XXX.XX. Bold |
| Actions | — | 50px | No | No | Three-dot kebab menu: View, Print, Duplicate, Delete |

**Filter Bar (DataTableAdvancedToolbar):**
- Global search (searches order #, customer name, reference number)
- Status: multiSelect filter with options from DB
- Shipped: select filter (Not Shipped / Partial / Shipped)
- Invoiced: select filter (Not Invoiced / Invoiced)
- Date: dateRange filter
- Agent: select filter (populated from DB)
- Total: number range filter

**Default Sort:** `date` descending (newest first)

**Row Click:** Navigate to `/order/{id}`

**API Changes Required:**
The `orderService.list()` currently accepts `status`, `agent_id`, `customer_id`, `search`, `limit`, `offset`. May need to extend the backend API to support:
- `shipped_status` filter
- `invoiced_status` filter
- `date_from` / `date_to` range
- `total_min` / `total_max` range
- `sort_by` and `sort_order` params
- Return `total` count in response meta for pagination

### 2.3 Customers Table — Complete Rebuild

**Delete/replace:** `src/components/CustomersManagement.tsx`
**Create:** `src/components/customers/CustomersTable.tsx` + `src/components/customers/customers-columns.tsx`

**Column Definitions** (based on `Customer` type):

| Column | Field | Width | Sortable | Filterable | Notes |
|--------|-------|-------|----------|------------|-------|
| Checkbox | select | 40px | No | No | Bulk select |
| Customer | company_name + location_region | flex (min 220px) | Yes (default asc) | text search | Avatar with initials + name. Subtitle: region as small coloured chip. Row click → detail |
| Contact | email + phone | 220px | No | text search | Email on first line, phone on second. Style "No email" in italic muted |
| Region | location_region | 120px | Yes | multiSelect | Options from DB region query. Can be hidden column on narrow screens |
| Spent | total_spent | 100px | Yes | number range | Right-aligned, £X,XXX. Bold if > £0 |
| Outstanding | outstanding_receivable | 100px | Yes | number range | Right-aligned. Red if > £0 |
| Last Order | last_order_date | 110px | Yes | date | Format: "6 Feb 2026". Muted if null ("-") |
| Terms | payment_terms_label | 90px | Yes | select | Options from DB. Compact badge |
| Segment | segment | 90px | Yes | select | Options from DB. Coloured chip |
| Actions | — | 50px | No | No | Kebab: View, New Order, View Orders, Export |

**Filter Bar:**
- Global search (searches company_name, email, phone, contact_name)
- Region: multiSelect
- Payment Terms: select
- Segment: select
- Status: select (active/inactive)
- Spent: number range
- Last Order: date range

**Default Sort:** `company_name` ascending

**Row Click:** Navigate to `/customers/{id}`

**API Changes Required:**
Extend `customerService.list()` to support:
- `region` filter
- `payment_terms` filter
- `segment` filter
- `spent_min` / `spent_max`
- `last_order_from` / `last_order_to`
- `sort_by` and `sort_order`
- Proper pagination with total count in meta

**Important:** Currently `CustomersManagement` fetches ALL 5,000 customers client-side (`limit: 5000`). This MUST change to server-side pagination with `limit: 25` and `offset` parameter.

### 2.4 Products Table — Complete Rebuild

**Delete/replace:** `src/components/InventoryManagement/InventoryProducts.tsx`
**Create:** `src/components/inventory/ProductsTable.tsx` + `src/components/inventory/products-columns.tsx`

**Column Definitions** (based on `Product` type):

| Column | Field | Width | Sortable | Filterable | Notes |
|--------|-------|-------|----------|------------|-------|
| Checkbox | select | 40px | No | No | Bulk select |
| Product | name + sku | flex (min 280px) | Yes | text search | Name on first line (truncate with tooltip at ~60 chars), SKU as small muted text below. Thumbnail image if `image_url` exists (32x32) |
| Brand | brand | 140px | Yes | multiSelect | Options from DB brand query (with counts) |
| Category | category_name | 130px | Yes | multiSelect | Options from DB. Only show column if >30% of products have a category |
| Stock | stock_on_hand | 80px | Yes | select (In Stock/Low/Out) | Right-aligned. Colour coded: green >10, amber 1-10, red 0 |
| Cost | cost_price | 90px | Yes | number range | Right-aligned, £X.XX |
| Price | rate | 90px | Yes | number range | Right-aligned, £X.XX. Bold |
| Margin | calculated | 90px | Yes | number range | `((rate - cost_price) / rate * 100)`. Show as percentage with mini bar. Green >50%, amber 30-50%, red <30% |
| Actions | — | 50px | No | No | Kebab: View, Edit, Duplicate, AI Enhance |

**Filter Bar:**
- Global search (searches name, sku, description)
- Brand: multiSelect (populate from `productService.getBrands()`)
- Stock Status: select (In Stock / Low Stock / Out of Stock) — these map to server-side `stock_filter` param
- Category: multiSelect
- Price: number range
- Status: select (active/inactive)

**Toolbar extras (keep from current):**
- Stock summary pills: "In Stock: XXX", "Low: XXX", "Out: XXX" — these should be clickable to apply the stock filter
- View toggle (list/grid/compact) — preserve this
- "+ Add Product" button

**Default Sort:** `name` ascending

**Row Click:** Open `ProductDetailSheet` (side panel, already exists)

**API already supports:** `brand`, `search`, `stock_filter`, `status`, `limit`, `offset`. May need to add:
- `category` filter
- `price_min` / `price_max`
- `sort_by` and `sort_order`

---

## PHASE 3: PAGE-SPECIFIC IMPROVEMENTS

### 3.1 Login Page

**File:** `src/components/Login.tsx`

- **Sign In button:** Change from translucent/glass to solid primary: `bg-primary text-primary-foreground hover:bg-primary/90`. This is THE most important action on the page.
- **Input focus states:** Add visible focus ring: `focus:ring-2 focus:ring-primary focus:ring-offset-2 focus:ring-offset-background`
- **PIN field:** Add `inputMode="numeric"` and optional show/hide toggle
- **Error state:** Add inline error message below inputs for invalid credentials: red text with error icon
- **"Need help?" link:** Make it a proper `<a>` tag with teal colour and underline on hover

### 3.2 Dashboard

**File:** `src/components/Dashboard.tsx`

- **Loading state:** The "Loading..." text visible under the date picker while KPI cards already show data. Replace with skeleton placeholder or remove once cards are loaded.
- **Date filter:** Replace small dropdown with pill/tab buttons: `Last 7 Days | Last 30 Days | Last 90 Days | This Year | All Time`
- **KPI MetricCards — Rewrite using Evil Charts:** The current KPI/metric cards on the Dashboard must be rewritten to use the Evil Charts library (already installed in the project). Evil Charts provides animated, interactive chart components built on Recharts + shadcn/ui + motion/framer-motion. The following Evil Chart component files are available in the project and should be used as the basis for the new MetricCards:

  **Available Evil Chart Components:**
  - `ClippedAreaChart` — Animated area chart with spring-physics cursor tracking, clipped fill reveal, and live value display. Uses `motion/react` springs. Great for revenue/sales over time.
  - `ValueLineBarChart` — Bar chart with interactive highlight, spring-animated reference line showing the hovered bar's value, and JetBrains Mono typography. Uses `framer-motion` springs. Great for monthly comparisons.
  - `GlowingLineChart` — Multi-line chart with SVG gaussian blur glow filter on each line. Good for comparing two metrics (e.g. desktop vs mobile, orders vs returns).
  - `GlowingRadialChart` — Radial bar chart with per-segment glow on hover and opacity dimming of inactive segments. Good for category breakdowns (e.g. order status distribution, stock by brand).
  - `DefaultMultipleBarChart` — Grouped bar chart with dotted SVG background pattern and tooltip. Good for side-by-side comparisons.
  - `HighlightedMultipleBarChart` — Grouped bar chart where hovering a month dims all other months. Interactive highlight with dotted background. Good for monthly desktop/mobile breakdowns.
  - `IncreaseSizePieChart` — Pie chart where each segment has an increasing outer radius based on value, creating a spiral/rose effect. Good for proportional breakdowns.

  **Implementation Rules:**
  1. **Adapt colours to the existing Splitfin theme.** Do NOT use the hardcoded colours from the Evil Charts examples (e.g. `#FCA070`). Instead, use the CSS custom property chart colours already defined in `src/index.css` — these are `var(--chart-1)` through `var(--chart-5)`, plus the primary/secondary/accent tokens. Map chart data series to these tokens so everything stays consistent with the dark theme.
  2. **Replace the current static KPI sparkline cards** with full Evil Chart components. Each MetricCard should be a `<Card>` containing an Evil Chart that visualises the KPI trend data from the API (not hardcoded sample data).
  3. **Recommended mapping for Dashboard MetricCards:**
     - **Revenue card** → `ClippedAreaChart` (shows monthly revenue with animated cursor tracking)
     - **Orders card** → `ValueLineBarChart` (shows order count per month with highlighted max/hovered bar)
     - **Customers card** → `GlowingLineChart` (shows new vs returning customers over time)
     - **Stock Overview card** → `GlowingRadialChart` (shows stock status breakdown: In Stock / Low / Out of Stock)
  4. **Wire up to real API data.** The chart data arrays must be populated from the Dashboard API endpoint, not the hardcoded sample data in the Evil Chart files. The component props should accept data as props or fetch via the existing dashboard service.
  5. **Preserve the Badge + TrendingUp/TrendingDown pattern** from Evil Charts — these show percentage change vs previous period and fit well with the existing MetricCard design.
  6. **Motion/animation compatibility:** The project already uses `motion` (framer-motion v12+). The Evil Charts use both `motion/react` and `framer-motion` import paths — normalise all imports to use `motion/react` (the v12+ unified package) for consistency.
  7. **Font:** The `ValueLineBarChart` uses `JetBrains_Mono` via `next/font/google` — since this is a Vite project (NOT Next.js), import the font via Google Fonts in `index.html` or use a local font-face declaration in `index.css` instead.
  8. **Responsive:** Cards should work in a 2x2 or 4x1 grid layout depending on viewport width.

- **Stock distribution chart:** Add value labels to the horizontal bars in the Stock Total card. Consider replacing with `IncreaseSizePieChart` or `GlowingRadialChart` if the data suits a radial visualisation better.
- **New Customers table:** Fix truncation — the SPENT column header is cut off. Either make the right panel horizontally scrollable or reduce column count
- **Section separation:** Add subtle dividers or increased gap between "Latest Orders" / "New Customers" and "Recently Added Products" sections
- **Sidebar section labels:** ("Tools", "Communication") — increase font weight or add divider line above

### 3.3 Order Detail

**File:** `src/components/ViewOrder.tsx` and/or `src/components/OrderDetail.tsx`

- **Action button hierarchy:** "Send to Packing" should be primary (filled teal). "Print", "Invoice", "Edit Order" should be secondary (outline/ghost). Ensure "Edit Order" isn't cut off at viewport edge.
- **Progress stepper:** Already good. Keep as-is.
- **Items table:** Truncate product names at ~50 chars with tooltip. Standardise row heights.
- **Order Notes:** Parse key data: highlight delivery date, link agent name. Consider making it a structured card instead of free text.
- **Breadcrumb vs Back button:** Remove the "← Back to Orders" button. Keep breadcrumb only: `Orders > SO-05216`. The breadcrumb "Order > #10130" should show the salesorder_number instead of internal ID.
- **Invoice section:** Add a "Generate Invoice" CTA button in the empty state, not just "No invoice generated yet" text.

### 3.4 Customer Detail

**File:** `src/components/CustomerDetail.tsx`

- **Breadcrumb:** Change from "Customers > 1" to "Customers > {company_name}"
- **Orders table:** Add coloured status badges matching the main orders table design
- **Empty fields:** Hide fields with null/"-" values (Address 2, State, Mobile, Website) rather than showing dashes
- **Financial card:** Collapse "Outstanding: £0.00" and "Unused Credits: £0.00" when both are zero — show only "Total Spent"
- **Contacts card:** If only 1 contact, combine with Company card to save space
- **Clickable fields:** Add pencil icon or dashed underline to editable fields (email, phone) to show they're interactive

### 3.5 Enquiries

**File:** `src/components/EnquiryList.tsx`

- Either **hide the nav item** entirely until the feature is ready, OR remove the "being migrated" message and let the empty state just say "No enquiries yet" with the CTA
- If showing filters, grey them out or hide them when there's no data
- Don't show "+ Create First Enquiry" AND "The feature is being migrated" — these contradict each other

### 3.6 Settings

**File:** `src/components/Settings/Settings.tsx`

- Add an "Edit" button/pencil icon next to Account Information fields
- Move "Fix Order" tool to a collapsible "Admin Tools" section, or make it smaller
- If Theme only has "Dark" and Language only has "English", either add more options or show them as informational (not dropdowns)
- Add placeholder sections for: Notifications, Integrations (Zoho), Tax Settings — even if just "Coming soon" cards

---

## PHASE 4: BACKEND API EXTENSIONS

Based on the database analysis from Phase 0, extend the API to support the new data table requirements. The backend API source is in `/backend` within the project root. The frontend services are in `src/services/` and the API base is configured in `src/config/api.ts`.

### Required API Enhancements:

**All list endpoints** (`/api/v1/orders`, `/api/v1/customers`, `/api/v1/products`) need:
- `sort_by` parameter (column name)
- `sort_order` parameter (`asc` | `desc`)
- Response must include `meta: { total, limit, offset, has_more }` for pagination

**Orders endpoint** additions:
- `shipped_status` filter
- `invoiced_status` filter
- `date_from`, `date_to` date range filter
- `total_min`, `total_max` numeric range filter
- `agent_id` filter (already exists)

**Customers endpoint** additions:
- `region` filter (location_region)
- `payment_terms` filter
- `segment` filter
- `spent_min`, `spent_max` numeric range filter
- `last_order_from`, `last_order_to` date range filter

**Products endpoint** additions:
- `category` filter
- `price_min`, `price_max` numeric range filter (on rate field)

### Update Frontend Services:

Update `src/services/orderService.ts`, `customerService.ts`, `productService.ts` filter interfaces to match the new API params.

---

## Implementation Order

1. **Phase 0** — Database analysis (30 mins). Run all queries, save results, reference throughout.
2. **Phase 1.1-1.2** — Semantic nav links + page titles (1 hr). Quick wins, affect all pages.
3. **Phase 1.3** — PageHeader component (30 mins). Create once, use everywhere.
4. **Phase 1.4-1.5** — Contrast/typography + teal hierarchy (1 hr). CSS/Tailwind changes.
5. **Phase 4** — Backend API extensions (2 hrs). Needed before tables can work.
6. **Phase 2.0** — Verify/install DiceUI data table (30 mins).
7. **Phase 2.2** — Orders table rebuild (3 hrs). Most impactful page.
8. **Phase 2.3** — Customers table rebuild (3 hrs).
9. **Phase 2.4** — Products table rebuild (3 hrs).
10. **Phase 3** — Page-specific fixes (2 hrs). Polish pass.

---

## Key Files Reference

```
src/
├── App.tsx                          # Routes setup
├── layouts/MasterLayout.tsx         # Main layout with sidebar + routes
├── components/
│   ├── app-sidebar.tsx              # Sidebar navigation
│   ├── app-sidebar-nav.tsx          # Top nav bar with breadcrumbs
│   ├── Login.tsx                    # Login page
│   ├── Dashboard.tsx                # Dashboard
│   ├── ViewOrders.tsx               # ❌ REPLACE — current orders list
│   ├── ViewOrder.tsx                # Order detail page
│   ├── OrderDetail.tsx              # Order detail (alternate?)
│   ├── CustomersManagement.tsx      # ❌ REPLACE — current customers list
│   ├── CustomerDetail.tsx           # Customer detail page
│   ├── EnquiryList.tsx              # Enquiries page
│   ├── InventoryManagement/
│   │   └── InventoryProducts.tsx    # ❌ REPLACE — current products list
│   ├── Settings/Settings.tsx        # Settings page
│   ├── charts/                      # Evil Charts components (installed)
│   │   ├── clipped-area-chart.tsx   # Animated area chart with spring cursor
│   │   ├── value-line-bar-chart.tsx # Bar chart with reference line highlight
│   │   ├── glowing-line.tsx         # Line chart with glow filter
│   │   ├── glowing-radial-chart.tsx # Radial bar with per-segment glow
│   │   ├── default-multiple-bar-chart.tsx
│   │   ├── highlighted-multiple-bar-chart.tsx
│   │   └── increase-size-pie-chart.tsx
│   ├── data-table/                  # DiceUI data table components (already exists)
│   │   ├── data-table.tsx
│   │   ├── data-table-column-header.tsx
│   │   ├── data-table-pagination.tsx
│   │   ├── data-table-toolbar.tsx
│   │   ├── data-table-skeleton.tsx
│   │   └── ...
│   ├── shared/
│   │   └── SplitfinTable.tsx        # Legacy shared table (can be deprecated)
│   └── ui/                          # shadcn/ui primitives
├── config/data-table.ts             # Filter operator config (already exists)
├── types/
│   ├── domain.ts                    # All TypeScript interfaces (Order, Customer, Product etc.)
│   └── data-table.ts               # Data table types (already exists)
├── hooks/use-data-table.ts          # DiceUI data table hook (already exists)
├── lib/
│   ├── data-table.ts                # Data table utilities (already exists)
│   └── parsers.ts                   # URL search param parsers (already exists)
├── services/
│   ├── orderService.ts              # Order API client
│   ├── customerService.ts           # Customer API client
│   └── productService.ts            # Product API client
└── index.css                        # Global styles + Tailwind + theme CSS vars

backend/                             # Express/Node.js API server
├── src/
│   ├── routes/                      # API route handlers
│   ├── controllers/                 # Business logic
│   ├── models/                      # Database models / queries
│   └── ...
└── ...                              # Runs on localhost:3001, connects to Neon PostgreSQL
```

## Important Notes

- This is a React 19 + Vite project (NOT Next.js). The NuqsAdapter should use `nuqs/adapters/react` not `nuqs/adapters/next/app`.
- The project uses `react-router-dom` v6 for routing.
- The project uses `motion` (framer-motion v12+) for animations.
- The dark theme uses CSS custom properties — check `src/index.css` for the theme variables.
- Existing `src/components/data-table/` directory already has DiceUI-compatible components — audit and update rather than recreate from scratch.
- The sidebar uses shadcn's `Sidebar` component (`src/components/ui/sidebar.tsx`).
- Always test changes against the dark theme — contrast is the #1 issue flagged in the audit.
- Evil Charts components are installed in `src/components/charts/`. They use Recharts + shadcn/ui Card/Badge + motion springs. When adapting them, always replace hardcoded colours with the project's CSS custom property chart tokens (`var(--chart-1)` through `var(--chart-5)`). Normalise all motion imports to `motion/react` (not `framer-motion`). Replace any `next/font/google` usage with standard CSS font imports since this is Vite, not Next.js.
- The backend API source code is in the `/backend` directory within the project root. All API endpoints are prefixed with `/api/v1/`. When extending API endpoints for new filters/sorting, modify the route handlers and controllers in this directory.
