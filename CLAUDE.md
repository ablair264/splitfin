# Splitfin

B2B sales management platform for DM Brands. React + TypeScript frontend, Express.js backend. Syncs with Zoho Inventory. Manages customers, orders, products, invoices, shipping, analytics, and AI-powered insights.

## Architecture

- **Frontend**: React 18 + TypeScript + Vite, hosted on **Netlify**
- **Backend**: Express.js (Node 18+), hosted on **Railway**
- **Database**: Neon PostgreSQL (project: `dm-sales-app`, ID: `super-frog-32653848`)
- **Styling**: Migrating from CSS Modules to **Tailwind CSS**
- **Integrations**: Zoho Inventory, OpenAI, ImageKit
- **No Shopify**: All Shopify logic has been removed from this rebuild

## Database (Neon)

Project ID: `super-frog-32653848` | Region: `us-west-2` | PG 17

### Key Tables
- `agents` - Sales agents (id text PK, name, pin, commission_rate, brands jsonb, is_admin)
- `customers` - Customer accounts (id serial PK, zoho_contact_id unique, company_name, email, billing/shipping_address jsonb, agent_id FK->agents)
- `orders` - Sales orders (id serial PK, zoho_salesorder_id unique, zoho_customer_id, agent_id FK->agents, status, total numeric)
- `order_line_items` - Order line items
- `products` - Product catalog (id serial PK, zoho_item_id unique, sku, name, rate, stock_on_hand, brand, ai_description, image_urls jsonb)
- `invoices` - Invoices (id serial PK, zoho_invoice_id unique, agent_id FK->agents, status, total, balance)
- `invoice_line_items` - Invoice line items
- `notifications` - Agent notifications (agent_id FK->agents, type, title, body, is_read)
- `conversations`, `messages`, `message_attachments` - Messaging system
- `broadcast_messages`, `broadcast_reads`, `broadcast_attachments` - Broadcast messaging
- `catalogues`, `catalogue_requests`, `product_catalogue_positions` - Catalogue management
- `product_feeds` - Product feed management
- `agent_customer_assignments` - Agent-customer mapping
- `app_cache` - Application cache
- `*_sync_log` tables - Zoho sync tracking

### Common Patterns
- All main entities have `sync_status` ('synced'|'pending_push'|'conflict') and `sync_error` columns
- Zoho IDs are stored alongside internal IDs for sync
- `agent_id` FK references `agents(id)` across orders, invoices, customers
- Timestamps: `created_at`, `updated_at` with `now()` defaults
- Currency defaults to GBP

## Project Structure

```
src/
  api/              # API client config
  components/       # React components (40+)
  config/           # Frontend config (API endpoints, analytics, widgets)
  contexts/         # React contexts
  hooks/            # Custom hooks (useAIInsight, useDataLoader, useDashboard, etc.)
  layouts/          # MasterLayout (main app shell)
  services/         # Frontend services (auth, analytics, AI, offline, etc.)
  types/            # TypeScript definitions
backend/
  src/
    api/            # API implementations
    config/         # Database, Zoho, rate limiting config
    middleware/     # Auth, security, rate limiting, IP blocking
    routes/         # Express route handlers
    services/       # Business logic + sync services
    scripts/        # Utility/maintenance scripts
    utils/          # Logger
netlify/
  functions/        # Serverless functions
```

## Environment Variables

### Frontend (Vite - prefix with VITE_)
```
VITE_API_BASE_URL=         # Railway backend URL
VITE_NEON_API_URL=         # If direct Neon access needed
VITE_OPENAI_API_KEY=       # Should be proxied through backend instead
```

### Backend
```
DATABASE_URL=              # Neon connection string
API_KEY=                   # Backend API key for auth
ZOHO_CLIENT_ID=
ZOHO_CLIENT_SECRET=
ZOHO_REFRESH_TOKEN=
ZOHO_ORGANIZATION_ID=
OPENAI_API_KEY=
IMAGEKIT_PRIVATE_KEY=
IMAGEKIT_PUBLIC_KEY=
IMAGEKIT_URL_ENDPOINT=
```

## Commands

```bash
# Frontend
npm run dev          # Start Vite dev server (port 3000)
npm run build        # TypeScript check + Vite build -> /build
npm run preview      # Preview production build

# Backend
cd backend
npm run dev          # Nodemon dev server
npm start            # Production start
```

## Migration Status (Supabase -> Neon)

**IN PROGRESS** - Creating data abstraction layer to decouple from Supabase.

### What's Changing
- `@supabase/supabase-js` replaced with direct Neon PostgreSQL via backend API
- Supabase Auth replaced with JWT auth against `agents` table
- All 45 direct Supabase imports being routed through service layer
- Frontend talks to backend API only (no direct DB access from browser)

### Data Access Pattern (Target)
```
Component -> Service (e.g. customerService) -> Backend API -> Neon PostgreSQL
```
Components must NOT import database clients directly. All data flows through typed service functions that call backend REST endpoints.

## Code Conventions

- TypeScript strict mode (working toward it - removing @ts-nocheck files)
- No `any` types - use proper interfaces from `src/types/`
- All secrets in environment variables, never hardcoded
- Services are the data access layer - components call services, not DB directly
- Tailwind for all new styling - no new CSS modules
- No Shopify code - this is a standalone platform
- Backend uses ES modules (`"type": "module"` in package.json)
- Error handling: return `{data, error}` tuples, don't throw in services
- This is React 19 + Vite (NOT Next.js) — no next/font, no next/image, no server components
- Uses `react-router-dom` v6 for routing
- Uses `motion` (framer-motion v12+) — always import from `motion/react`, not `framer-motion`
- Dark theme uses CSS custom properties in `src/index.css`

---

## UI Overhaul — Active Project

**Full plan:** `docs/splitfin-ui-overhaul-prompt.md`
**DB analysis results:** `docs/db-analysis.md` (created in Phase 0)
**Current UI audit score:** 5.7/10

### Progress Tracker

- [x] **Phase 0** — Database analysis via Neon MCP. Run all discovery queries, save results to `docs/db-analysis.md`. These results inform every later decision.
- [x] **Phase 1.1** — Semantic nav: all SidebarItem `onPress` → `href`, RouterProvider added to App.tsx, aria-current via isCurrent, tooltips on all header icons
- [x] **Phase 1.2** — Dynamic page titles: `usePageTitle` hook in `src/hooks/usePageTitle.ts`, applied to all 13 page components
- [x] **Phase 1.3** — PageHeader component: `src/components/shared/PageHeader.tsx` with title/subtitle/count/breadcrumbs/actions. Applied to Orders, Customers, Inventory pages.
- [x] **Phase 1.4** — Contrast & typography: status badges use semantic colours (amber=draft, emerald=confirmed, blue=shipped, purple=invoiced) across ViewOrders, ViewOrder, Dashboard. Badge size bumped to `text-xs`.
- [x] **Phase 1.5** — Teal accent hierarchy: nav active = teal left border + subtle bg, primary buttons = filled teal, secondary = ghost/outline. Replaced all `brand-300` refs with `primary` token. Fixed hardcoded `text-white` → `text-foreground`.
- [x] **Phase 1.6** — Settings added as sidebar nav item above footer
- [x] **Phase 4** — Backend API extensions: sort_by/sort_order, new filters (date range, shipped/invoiced status, region, payment_terms, segment, price range), pagination meta `{total, limit, offset, has_more}` on all list endpoints. Added `/orders/salespersons` and `/orders/statuses` endpoints for filter option population.
- [x] **Phase 2.0** — DiceUI data table components verified. Full infrastructure already in place: `src/components/data-table/`, `use-data-table.ts` hook, nuqs URL state, filter variants (text, select, multiSelect, date, range).
- [x] **Phase 2.2** — Orders table rebuild: `src/components/orders/OrdersTable.tsx` + `orders-columns.tsx`. Server-side pagination (50/page), URL state via nuqs, search/status(multi)/agent filters, sortable columns, status badges with semantic colours, customer avatars, row click navigation.
- [x] **Phase 2.3** — Customers table rebuild: `src/components/customers/CustomersTable.tsx` + `customers-columns.tsx`. Server-side pagination (25/page), search/region(multi)/terms/segment filters, avatar+region display, spent/owed/last-order columns, payment terms badges.
- [x] **Phase 2.4** — Products table rebuild: `src/components/inventory/ProductsTable.tsx` + `products-columns.tsx`. Server-side pagination (50/page), search/brand(multi)/stock/status filters, image thumbnails, stock colour badges, margin bar visualisation, stock summary pills in header.
- [x] **Phase 3.1** — Login page: solid primary button (replaced gradient), focus rings with `ring-offset`, PIN `inputMode="numeric"` + show/hide toggle, `border-primary/20` card border, "Need help?" as `<a>` mailto link.
- [x] **Phase 3.2** — Dashboard: date filter pill/tab buttons replacing dropdown, skeleton loading state, section divider between tables. Evil Charts integration: `src/components/dashboard/DashboardCharts.tsx` with 4 adapted chart cards (RevenueChart=ClippedArea, OrdersChart=ValueLineBar, StockChart=GlowingRadial, AgentChart=GlowingLine). All use CSS chart tokens, motion springs, props-driven data. Removed old ColorProvider/MetricCard wrapper.
- [x] **Phase 3.3** — Order detail: breadcrumb nav (`Orders / SO-XXXXX`) replacing "Back to Orders" button, action button hierarchy (Send to Packing = primary filled, Print/Invoice/Edit = outline ghost), invoice empty state with "Generate Invoice" CTA, all `brand-300` refs replaced with `primary` token.
- [x] **Phase 3.4** — Customer detail: breadcrumb nav (`Customers / {company_name}`), semantic order status badges (amber/emerald/blue/purple), financial card hides Outstanding/Credits when zero, empty address fields hidden, dynamic page title with company name.
- [x] **Phase 3.5** — Enquiries: removed contradictory "being migrated" message, clean empty state ("No enquiries yet" + CTA), filters hidden when no data.
- [x] **Phase 3.6** — Settings: collapsible Admin Tools section, Theme/Language/Currency as informational labels (not dropdowns), Integrations section with Zoho connected + Tax Settings coming soon.

### Key Decisions

- Server-side pagination for ALL data tables (Orders ~200+, Customers ~1580, Products ~8190)
- Page sizes: Orders 50, Customers 25, Products 50
- URL state via nuqs for filters/sort/pagination
- All tables use DiceUI `DataTable` + `DataTableAdvancedToolbar` + `DataTableFilterList`

### Evil Charts — Integrated

Adapted Evil Charts live in `src/components/dashboard/DashboardCharts.tsx`. All use Recharts + shadcn/ui Card + motion/react springs. Data passed as props from Dashboard API.

| Dashboard Card | Adapted Component | Based On | Chart Token |
|---------------|-------------------|----------|-------------|
| Revenue | `RevenueChart` | ClippedAreaChart | `--chart-1` |
| Orders | `OrdersChart` | ValueLineBarChart | `--chart-2` |
| Stock Total | `StockChart` | GlowingRadialChart | `--chart-1/4/5` |
| Top Agent | `AgentChart` | GlowingLineChart | `--chart-3` |

### File Locations Quick Reference

| What | Where |
|------|-------|
| Frontend source | `src/` |
| Backend API source | `backend/` |
| Evil Charts | `src/components/charts/` |
| DiceUI data table | `src/components/data-table/` |
| Theme CSS variables | `src/index.css` |
| Type definitions | `src/types/domain.ts`, `src/types/data-table.ts` |
| API services | `src/services/orderService.ts`, `customerService.ts`, `productService.ts` |
| API config | `src/config/api.ts` |
| Overhaul plan | `docs/splitfin-ui-overhaul-prompt.md` |
| DB analysis | `docs/db-analysis.md` |
