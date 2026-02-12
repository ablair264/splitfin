import { api } from './apiClient';
import { API_BASE_URL } from '../config/api';
import type { ProductImage, ListResponse, SingleResponse } from '../types/domain';

export interface ImageFilters {
  brand?: string;
  search?: string;
  sort_by?: string;
  sort_order?: 'asc' | 'desc';
  limit?: number;
  offset?: number;
}

export interface ImageStats {
  total_images: number;
  total_size_bytes: number;
  brand_count: number;
}

export const imageService = {
  async list(filters: ImageFilters = {}): Promise<ListResponse<ProductImage>> {
    return api.get<ListResponse<ProductImage>>(
      '/api/v1/images',
      filters as Record<string, string | number>,
    );
  },

  async getBrands(): Promise<{ brand: string; image_count: number }[]> {
    const result = await api.get<{ data: { brand: string; image_count: number }[] }>(
      '/api/v1/images/brands',
    );
    return result.data;
  },

  async getStats(): Promise<ImageStats> {
    const result = await api.get<{ data: ImageStats }>('/api/v1/images/stats');
    return result.data;
  },

  async getSkuPatterns(): Promise<{ brand_name: string; pattern: string; description: string }[]> {
    const result = await api.get<{ data: { brand_name: string; pattern: string; description: string }[] }>(
      '/api/v1/images/sku-patterns',
    );
    return result.data;
  },

  async upload(
    file: Blob,
    brand: string,
    metadata?: {
      matched_sku?: string;
      sku_confidence?: number;
      original_filename?: string;
      width?: number;
      height?: number;
    },
  ): Promise<ProductImage> {
    const token = localStorage.getItem('auth_token');
    const formData = new FormData();
    formData.append('image', file, metadata?.original_filename || 'image.webp');
    formData.append('brand', brand);
    if (metadata?.matched_sku) formData.append('matched_sku', metadata.matched_sku);
    if (metadata?.sku_confidence != null) formData.append('sku_confidence', String(metadata.sku_confidence));
    if (metadata?.original_filename) formData.append('original_filename', metadata.original_filename);
    if (metadata?.width != null) formData.append('width', String(metadata.width));
    if (metadata?.height != null) formData.append('height', String(metadata.height));

    const response = await fetch(`${API_BASE_URL}/api/v1/images/upload`, {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: formData,
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({ error: 'Upload failed' }));
      throw new Error(err.error || 'Upload failed');
    }

    const result = await response.json();
    return result.data;
  },

  async getById(id: number): Promise<ProductImage> {
    const result = await api.get<SingleResponse<ProductImage>>(`/api/v1/images/${id}`);
    return result.data;
  },

  async listByProduct(productId: number): Promise<ProductImage[]> {
    const result = await api.get<{ data: ProductImage[] }>(`/api/v1/images/by-product/${productId}`);
    return result.data;
  },

  async delete(id: number): Promise<void> {
    await api.delete(`/api/v1/images/${id}`);
  },

  async bulkDelete(ids: number[]): Promise<{ deleted: number; errors: number }> {
    return api.post<{ deleted: number; errors: number }>(
      '/api/v1/images/bulk-delete',
      { ids },
    );
  },

  async update(
    id: number,
    data: {
      brand?: string;
      matched_sku?: string;
      product_id?: number | null;
      ai_product_type?: string;
      ai_color?: string;
    },
  ): Promise<ProductImage> {
    const result = await api.patch<SingleResponse<ProductImage>>(
      `/api/v1/images/${id}`,
      data,
    );
    return result.data;
  },

  async refreshSizes(): Promise<{ updated: number; errors: number; total: number }> {
    return api.post<{ updated: number; errors: number; total: number }>(
      '/api/v1/images/refresh-sizes',
      {},
    );
  },
};
