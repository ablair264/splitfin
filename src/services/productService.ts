import { api } from './apiClient';
import type { Product, ListResponse, SingleResponse, CountResponse } from '../types/domain';

interface ProductFilters {
  status?: string;
  brand?: string;
  search?: string;
  stock_filter?: string;
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
};
