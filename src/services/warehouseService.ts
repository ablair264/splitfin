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

export interface PackageListItem {
  id: number;
  packing_number: string;
  warehouse_status: string;
  status: string;
  carrier_name: string | null;
  tracking_number: string | null;
  shipment_date: string | null;
  created_at: string;
  updated_at: string;
  sent_to_packing_at: string | null;
  packed_at: string | null;
  delivery_booked_at: string | null;
  shipping_address: string | null;
  shipping_city: string | null;
  shipping_state: string | null;
  shipping_code: string | null;
  shipping_country: string | null;
  shipping_phone: string | null;
  shipping_attention: string | null;
  order_id: number;
  salesorder_number: string;
  customer_name: string;
  order_total: number;
  order_date: string;
  item_count: number;
}

export interface PackageListResponse {
  data: PackageListItem[];
  meta: { total: number; limit: number; offset: number; has_more: boolean };
}

export interface PackageListFilters {
  search?: string;
  warehouse_status?: string;
  sort_by?: string;
  sort_order?: 'asc' | 'desc';
  limit?: number;
  offset?: number;
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

  async list(filters: PackageListFilters = {}): Promise<PackageListResponse> {
    return api.get<PackageListResponse>('/api/v1/warehouse/list', filters as Record<string, string | number>);
  },

  async getStatuses(): Promise<{ status: string; count: number }[]> {
    const result = await api.get<{ data: { status: string; count: number }[] }>('/api/v1/warehouse/statuses');
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
