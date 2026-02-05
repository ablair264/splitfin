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
