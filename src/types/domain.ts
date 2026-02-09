// Core domain types matching Neon database schema

export interface Agent {
  id: string;
  name: string;
  is_admin: boolean;
  commission_rate: number;
  brands: string[];
  active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Customer {
  id: number;
  zoho_contact_id: string;
  company_name: string;
  contact_name: string | null;
  email: string | null;
  phone: string | null;
  mobile: string | null;
  currency_code: string;
  payment_terms: string | null;
  payment_terms_label: string | null;
  notes: string | null;
  billing_address: Address | null;
  shipping_address: Address | null;
  outstanding_receivable: number;
  unused_credits: number;
  status: 'active' | 'inactive';
  agent_id: string | null;
  latitude: number | null;
  longitude: number | null;
  location_region: string | null;
  formatted_address: string | null;
  brand_preferences: string[];
  total_spent: number;
  average_order_value: number | null;
  segment: string | null;
  contact_persons: ContactPerson[];
  custom_fields: Record<string, unknown>;
  last_login_at: string | null;
  last_order_date: string | null;
  website: string | null;
  sync_status: SyncStatus;
  created_at: string;
  updated_at: string;
}

export interface Address {
  attention?: string;
  address?: string;
  street2?: string;
  city?: string;
  state?: string;
  zip?: string;
  country?: string;
  phone?: string;
  fax?: string;
}

export interface ContactPerson {
  contact_person_id?: string;
  first_name?: string;
  last_name?: string;
  email?: string;
  phone?: string;
  mobile?: string;
  is_primary_contact?: boolean;
}

export interface Order {
  id: number;
  zoho_salesorder_id: string;
  salesorder_number: string;
  reference_number: string | null;
  zoho_customer_id: string;
  customer_name: string;
  agent_id: string | null;
  date: string;
  status: string;
  sub_total: number;
  tax_total: number;
  discount_total: number;
  shipping_charge: number;
  adjustment: number;
  total: number;
  currency_code: string;
  shipment_status: string | null;
  shipped_status: string | null;
  invoiced_status: string | null;
  notes: string | null;
  terms: string | null;
  delivery_date: string | null;
  salesperson_id: string | null;
  salesperson_name: string | null;
  shipping_address_json: Address | null;
  packages_json: unknown[] | null;
  invoices_json: unknown[] | null;
  sync_status: SyncStatus;
  created_at: string;
  updated_at: string;
  line_items?: OrderLineItem[];
}

export interface OrderLineItem {
  id: number;
  zoho_salesorder_id: string;
  zoho_item_id: string;
  sku: string;
  name: string;
  description: string | null;
  quantity: number;
  rate: number;
  amount: number;
  discount: number;
  tax_amount: number;
}

export interface Product {
  id: number;
  zoho_item_id: string;
  sku: string;
  name: string;
  description: string | null;
  rate: number;
  stock_on_hand: number;
  unit: string;
  status: 'active' | 'inactive';
  brand: string;
  manufacturer: string;
  category_name: string;
  ean: string;
  upc: string;
  image_url: string | null;
  image_urls: string[];
  pack_qty: number | null;
  cost_price: number | null;
  color_family: string | null;
  category_l1: string | null;
  category_l2: string | null;
  category_l3: string | null;
  dimensions_formatted: string | null;
  ai_description: string | null;
  ai_short_description: string | null;
  ai_features: string[];
  variant: string | null;
  materials: string | null;
  catalogue_page: number | null;
  catalogue_id: string | null;
  sync_status: SyncStatus;
  created_at: string;
  updated_at: string;
}

export interface Invoice {
  id: number;
  zoho_invoice_id: string;
  invoice_number: string;
  reference_number: string | null;
  zoho_customer_id: string;
  customer_name: string;
  agent_id: string | null;
  zoho_salesorder_id: string | null;
  salesorder_number: string | null;
  invoice_date: string;
  due_date: string | null;
  status: string;
  sub_total: number;
  tax_total: number;
  discount_total: number;
  shipping_charge: number;
  total: number;
  balance: number;
  currency_code: string;
  billing_address: Address | null;
  shipping_address: Address | null;
  sync_status: SyncStatus;
  created_at: string;
  updated_at: string;
  line_items?: InvoiceLineItem[];
}

export interface InvoiceLineItem {
  id: number;
  zoho_invoice_id: string;
  zoho_item_id: string;
  sku: string;
  name: string;
  quantity: number;
  rate: number;
  amount: number;
}

export interface Notification {
  id: number;
  agent_id: string;
  type: string;
  title: string;
  body: string;
  data: Record<string, unknown>;
  is_read: boolean;
  is_push_sent: boolean;
  created_at: string;
}

export type SyncStatus = 'synced' | 'pending_push' | 'conflict';

// Website product types (Pop Home)

export interface WebsiteCategory {
  id: number;
  name: string;
  slug: string;
  description: string | null;
  hero_image_url: string | null;
  hero_placeholder: string | null;
  display_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface WebsiteProductImage {
  id: number;
  website_product_id: number;
  image_url: string;
  alt_text: string | null;
  display_order: number;
  is_primary: boolean;
  created_at: string;
}

export interface WebsiteProduct {
  id: number;
  product_id: number;
  slug: string;
  display_name: string | null;
  short_description: string | null;
  long_description: string | null;
  retail_price: number;
  compare_at_price: number | null;
  category_id: number | null;
  badge: 'new' | 'sale' | null;
  is_featured: boolean;
  featured_span: string | null;
  colours: { name: string; hex: string }[] | null;
  features: string[] | null;
  specs: { label: string; value: string }[] | null;
  is_active: boolean;
  display_order: number;
  placeholder_class: string | null;
  meta_title: string | null;
  meta_description: string | null;
  published_at: string | null;
  created_at: string;
  updated_at: string;
  // Joined fields from products table
  base_name?: string;
  sku?: string;
  brand?: string;
  stock_on_hand?: number;
  wholesale_price?: number;
  // Joined fields from website_categories
  category_name?: string;
  category_slug?: string;
  // Aggregated images
  images?: WebsiteProductImage[];
}

export interface WebsiteTag {
  id: number;
  name: string;
  slug: string;
  product_count?: number;
  created_at: string;
}

export interface EnhanceProductResult {
  display_name: string;
  colour: string | null;
  colour_hex: string | null;
  short_description: string | null;
  long_description: string | null;
  category: string | null;
  tags: string[];
}

export interface BatchEnhanceOptions {
  overwrite_names?: boolean;
  overwrite_descriptions?: boolean;
  assign_categories?: boolean;
  assign_tags?: boolean;
}

export interface BatchEnhanceResultItem {
  id: number;
  status: 'done' | 'error';
  original_name: string;
  display_name?: string;
  colour?: string | null;
  category?: string | null;
  tags?: string[];
  error?: string;
}

export interface BatchEnhanceResult {
  results: BatchEnhanceResultItem[];
  summary: { total: number; success: number; errors: number };
}

// Product Intelligence
export interface ProductPopularity {
  product_id: number;
  name: string;
  sku: string;
  brand: string;
  image_url: string | null;
  stock_on_hand: number;
  wholesale_price: number;
  unique_customers: number;
  total_orders: number;
  total_quantity: number;
  total_revenue: number;
  avg_qty_per_order: number;
  max_customer_share: number;
  top_customer_name: string;
  is_skewed: boolean;
  recent_qty: number;
  previous_qty: number;
  trend: 'up' | 'down' | 'stable' | 'new';
  on_website: boolean;
  website_product_id: number | null;
  badge: string | null;
  retail_price: number | null;
}

export interface ReorderAlert {
  product_id: number;
  name: string;
  sku: string;
  brand: string;
  image_url: string | null;
  stock_on_hand: number;
  retail_price: number;
  sold_last_30d: number;
  daily_velocity: number;
  days_remaining: number | null;
  priority: 'critical' | 'warning' | 'monitor';
  website_product_id: number;
  badge: string | null;
  is_active: boolean;
}

export interface PriceCheckResult {
  product_id: number;
  name: string;
  brand: string;
  our_price: number;
  market_avg: number | null;
  market_low: number | null;
  market_high: number | null;
  our_position: 'cheaper' | 'competitive' | 'expensive' | 'unknown';
  confidence: 'high' | 'medium' | 'low';
  sources: string[];
  notes: string;
}

// Journal
export interface JournalPost {
  id: number;
  slug: string;
  title: string;
  excerpt: string | null;
  body: string | null;
  cover_image: string | null;
  cover_alt: string | null;
  author: string;
  status: 'draft' | 'published' | 'archived';
  is_featured: boolean;
  display_order: number;
  meta_title: string | null;
  meta_description: string | null;
  published_at: string | null;
  created_at: string;
  updated_at: string;
  tags?: WebsiteTag[];
}

export interface JournalPostImage {
  id: number;
  journal_post_id: number;
  image_url: string;
  alt_text: string | null;
  created_at: string;
}

// API response wrappers
export interface ListResponse<T> {
  data: T[];
  count: number;
  total?: number;
  meta?: {
    total: number;
    limit: number;
    offset: number;
    has_more: boolean;
  };
  error?: string;
}

export interface SingleResponse<T> {
  data: T;
  error?: string;
}

export interface CountResponse {
  count: number;
}

export interface AuthResponse {
  token: string;
  agent: Agent;
}

export interface NotificationsResponse {
  data: Notification[];
  unread_count: number;
}
