import { api } from './apiClient';
import { API_BASE_URL } from '../config/api';
import type {
  ReorderIntelligenceItem,
  PurchaseOrder,
  ListResponse,
  SingleResponse,
} from '../types/domain';

export interface ReorderIntelligenceFilters {
  threshold?: number;
  brand?: string;
  limit?: number;
  offset?: number;
}

export interface PurchaseOrderFilters {
  status?: string;
  brand?: string;
  sort_by?: string;
  sort_order?: 'asc' | 'desc';
  limit?: number;
  offset?: number;
}

export const purchaseOrderService = {
  async getReorderIntelligence(
    filters: ReorderIntelligenceFilters = {},
  ): Promise<ListResponse<ReorderIntelligenceItem>> {
    return api.get<ListResponse<ReorderIntelligenceItem>>(
      '/api/v1/purchase-orders/reorder-intelligence',
      filters as Record<string, string | number>,
    );
  },

  async getBrands(): Promise<{ brand: string; product_count: number }[]> {
    const result = await api.get<{
      data: { brand: string; product_count: number }[];
    }>('/api/v1/purchase-orders/brands');
    return result.data;
  },

  async generate(
    items: { product_id: number; quantity: number }[],
    notes?: string,
  ): Promise<{ purchase_orders: PurchaseOrder[] }> {
    return api.post<{ purchase_orders: PurchaseOrder[] }>(
      '/api/v1/purchase-orders/generate',
      { items, notes },
    );
  },

  async list(
    filters: PurchaseOrderFilters = {},
  ): Promise<ListResponse<PurchaseOrder>> {
    return api.get<ListResponse<PurchaseOrder>>(
      '/api/v1/purchase-orders',
      filters as Record<string, string | number>,
    );
  },

  async getById(id: number): Promise<PurchaseOrder> {
    const result = await api.get<SingleResponse<PurchaseOrder>>(
      `/api/v1/purchase-orders/${id}`,
    );
    return result.data;
  },

  async exportPO(id: number, format: 'xlsx' | 'pdf'): Promise<Blob> {
    const token = localStorage.getItem('auth_token');
    const response = await fetch(
      `${API_BASE_URL}/api/v1/purchase-orders/${id}/export?format=${format}`,
      {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      },
    );
    if (!response.ok) {
      const err = await response.json().catch(() => ({ error: 'Export failed' }));
      throw new Error(err.error || 'Export failed');
    }
    return response.blob();
  },

  async sendPO(
    id: number,
    email: string,
    format: 'xlsx' | 'pdf',
    message?: string,
  ): Promise<{ success: boolean; message_id?: string }> {
    return api.post<{ success: boolean; message_id?: string }>(
      `/api/v1/purchase-orders/${id}/send`,
      { email, format, message },
    );
  },

  async getSavedEmails(brand?: string): Promise<string[]> {
    const params: Record<string, string> = {};
    if (brand) params.brand = brand;
    const result = await api.get<{ data: string[] }>(
      '/api/v1/purchase-orders/saved-emails',
      params,
    );
    return result.data;
  },

  async updatePO(
    id: number,
    data: { status?: string; notes?: string; items?: { id: number; quantity: number }[] },
  ): Promise<PurchaseOrder> {
    const result = await api.patch<SingleResponse<PurchaseOrder>>(
      `/api/v1/purchase-orders/${id}`,
      data,
    );
    return result.data;
  },
};
