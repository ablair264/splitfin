import { api } from './apiClient';
import type { Product, ListResponse, SingleResponse, CountResponse } from '../types/domain';

interface ProductFilters {
  status?: string;
  brand?: string;
  search?: string;
  limit?: number;
  offset?: number;
}

export const productService = {
  async list(filters: ProductFilters = {}): Promise<ListResponse<Product>> {
    return api.get<ListResponse<Product>>('/api/v1/products', filters as Record<string, string | number>);
  },

  async getById(id: number): Promise<Product> {
    const result = await api.get<SingleResponse<Product>>(`/api/v1/products/${id}`);
    return result.data;
  },

  async count(filters: { status?: string; brand?: string } = {}): Promise<number> {
    const result = await api.get<CountResponse>('/api/v1/products/count', filters);
    return result.count;
  },

  async getBrands(): Promise<{ brand: string; count: number }[]> {
    const result = await api.get<{ data: { brand: string; count: number }[] }>('/api/v1/products/brands');
    return result.data;
  },

  async update(id: number, data: Partial<Product>): Promise<Product> {
    const result = await api.put<SingleResponse<Product>>(`/api/v1/products/${id}`, data);
    return result.data;
  },
};
