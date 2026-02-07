import { api } from './apiClient';
import { API_BASE_URL } from '../config/api';
import type { Product, ListResponse, SingleResponse, CountResponse } from '../types/domain';

export interface ProductFilters {
  status?: string;
  brand?: string;
  search?: string;
  stock_filter?: string;
  category?: string;
  price_min?: number;
  price_max?: number;
  sort_by?: string;
  sort_order?: 'asc' | 'desc';
  limit?: number;
  offset?: number;
}

interface StockCounts {
  in_stock: number;
  low_stock: number;
  out_of_stock: number;
}

export const productService = {
  async list(filters: ProductFilters = {}): Promise<ListResponse<Product>> {
    return api.get<ListResponse<Product>>('/api/v1/products', filters as Record<string, string | number>);
  },

  async getById(id: number): Promise<Product> {
    const result = await api.get<SingleResponse<Product>>(`/api/v1/products/${id}`);
    return result.data;
  },

  async count(filters: { status?: string; brand?: string; search?: string; stock_filter?: string } = {}): Promise<number> {
    const result = await api.get<CountResponse>('/api/v1/products/count', filters);
    return result.count;
  },

  async stockCounts(filters: { status?: string; brand?: string; search?: string } = {}): Promise<StockCounts> {
    return api.get<StockCounts>('/api/v1/products/stock-counts', filters);
  },

  async getBrands(): Promise<{ brand: string; count: number }[]> {
    const result = await api.get<{ data: { brand: string; count: number }[] }>('/api/v1/products/brands');
    return result.data;
  },

  async update(id: number, data: Partial<Product>): Promise<Product> {
    const result = await api.put<SingleResponse<Product>>(`/api/v1/products/${id}`, data);
    return result.data;
  },

  async uploadImage(id: number, file: File): Promise<string> {
    const formData = new FormData();
    formData.append('image', file);

    const token = localStorage.getItem('auth_token');
    const headers: Record<string, string> = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const response = await fetch(`${API_BASE_URL}/api/v1/products/${id}/image`, {
      method: 'POST',
      headers,
      body: formData,
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({ error: 'Upload failed' }));
      throw new Error(err.error || 'Upload failed');
    }

    const result = await response.json();
    return result.data.image_url;
  },

  async deleteImage(id: number): Promise<void> {
    await api.delete(`/api/v1/products/${id}/image`);
  },
};
