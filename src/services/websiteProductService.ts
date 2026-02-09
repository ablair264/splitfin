import { api } from './apiClient';
import { API_BASE_URL } from '../config/api';
import type { WebsiteProduct, WebsiteCategory, WebsiteTag, Product, ListResponse, SingleResponse, CountResponse, BatchEnhanceOptions, BatchEnhanceResult } from '../types/domain';

export interface WebsiteProductFilters {
  search?: string;
  brand?: string;
  category_id?: number;
  badge?: string;
  is_featured?: string;
  is_active?: string;
  sort_by?: string;
  sort_order?: 'asc' | 'desc';
  limit?: number;
  offset?: number;
}

export const websiteProductService = {
  async list(filters: WebsiteProductFilters = {}): Promise<ListResponse<WebsiteProduct>> {
    return api.get<ListResponse<WebsiteProduct>>('/api/v1/website-products', filters as Record<string, string | number>);
  },

  async getById(id: number): Promise<WebsiteProduct> {
    const result = await api.get<SingleResponse<WebsiteProduct>>(`/api/v1/website-products/${id}`);
    return result.data;
  },

  async count(filters: { search?: string; brand?: string; is_active?: string } = {}): Promise<number> {
    const result = await api.get<CountResponse>('/api/v1/website-products/count', filters);
    return result.count;
  },

  async getCategories(): Promise<WebsiteCategory[]> {
    const result = await api.get<{ data: WebsiteCategory[] }>('/api/v1/website-products/categories');
    return result.data;
  },

  async getBrands(): Promise<{ brand: string; count: number }[]> {
    const result = await api.get<{ data: { brand: string; count: number }[] }>('/api/v1/website-products/brands');
    return result.data;
  },

  async getAvailableProducts(filters: { search?: string; brand?: string; limit?: number; offset?: number } = {}): Promise<ListResponse<Product>> {
    return api.get<ListResponse<Product>>('/api/v1/website-products/available', filters as Record<string, string | number>);
  },

  async batchCreate(data: { product_ids: number[]; defaults?: { category_id?: number; badge?: string; is_active?: boolean; markup?: number; enhance?: boolean } }): Promise<{ created: number; skipped: number; data: WebsiteProduct[] }> {
    return api.post<{ created: number; skipped: number; data: WebsiteProduct[] }>('/api/v1/website-products/batch', data);
  },

  async create(data: Partial<WebsiteProduct>): Promise<WebsiteProduct> {
    const result = await api.post<SingleResponse<WebsiteProduct>>('/api/v1/website-products', data);
    return result.data;
  },

  async update(id: number, data: Partial<WebsiteProduct>): Promise<WebsiteProduct> {
    const result = await api.put<SingleResponse<WebsiteProduct>>(`/api/v1/website-products/${id}`, data);
    return result.data;
  },

  async remove(id: number): Promise<void> {
    await api.delete(`/api/v1/website-products/${id}`);
  },

  async uploadImage(id: number, file: File): Promise<{ id: number; image_url: string }> {
    const formData = new FormData();
    formData.append('image', file);

    const token = localStorage.getItem('auth_token');
    const headers: Record<string, string> = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const response = await fetch(`${API_BASE_URL}/api/v1/website-products/${id}/images`, {
      method: 'POST',
      headers,
      body: formData,
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({ error: 'Upload failed' }));
      throw new Error(err.error || 'Upload failed');
    }

    const result = await response.json();
    return result.data;
  },

  async deleteImage(id: number, imageId: number): Promise<void> {
    await api.delete(`/api/v1/website-products/${id}/images/${imageId}`);
  },

  async reorderImages(id: number, imageIds: number[]): Promise<void> {
    await api.put(`/api/v1/website-products/${id}/images/reorder`, { image_ids: imageIds });
  },

  // Batch enhance
  async batchEnhance(data: { website_product_ids: number[]; options?: BatchEnhanceOptions }): Promise<BatchEnhanceResult> {
    return api.post<BatchEnhanceResult>('/api/v1/website-products/batch-enhance', data);
  },

  // Tags
  async getTags(): Promise<WebsiteTag[]> {
    const result = await api.get<{ data: WebsiteTag[] }>('/api/v1/website-products/tags');
    return result.data;
  },

  async getProductTags(id: number): Promise<WebsiteTag[]> {
    const result = await api.get<{ data: WebsiteTag[] }>(`/api/v1/website-products/${id}/tags`);
    return result.data;
  },

  async setProductTags(id: number, tagIds: number[]): Promise<WebsiteTag[]> {
    const result = await api.put<{ data: WebsiteTag[] }>(`/api/v1/website-products/${id}/tags`, { tag_ids: tagIds });
    return result.data;
  },

  async createTag(name: string): Promise<WebsiteTag> {
    const result = await api.post<{ data: WebsiteTag }>('/api/v1/website-products/tags', { name });
    return result.data;
  },
};
