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
