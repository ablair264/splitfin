import { api } from './apiClient';
import type { ProductPopularity, ReorderAlert, PriceCheckResult, ListResponse } from '../types/domain';

export interface PopularityFilters {
  date_range?: string;
  brand?: string;
  min_orders?: number;
  sort_by?: string;
  sort_order?: 'asc' | 'desc';
  limit?: number;
  offset?: number;
  website_only?: string;
  website_not_live?: string;
}

export interface ReorderFilters {
  threshold?: number;
  limit?: number;
  offset?: number;
}

export const productIntelligenceService = {
  async getPopularity(filters: PopularityFilters = {}): Promise<ListResponse<ProductPopularity>> {
    return api.get<ListResponse<ProductPopularity>>(
      '/api/v1/product-intelligence/popularity',
      filters as Record<string, string | number>,
    );
  },

  async getReorderAlerts(filters: ReorderFilters = {}): Promise<ListResponse<ReorderAlert>> {
    return api.get<ListResponse<ReorderAlert>>(
      '/api/v1/product-intelligence/reorder-alerts',
      filters as Record<string, string | number>,
    );
  },

  async runPriceCheck(productIds: number[]): Promise<PriceCheckResult[]> {
    const result = await api.post<{ results: PriceCheckResult[] }>(
      '/api/v1/product-intelligence/price-check',
      { product_ids: productIds },
    );
    return result.results;
  },

  async getBrands(): Promise<{ brand: string; product_count: number }[]> {
    const result = await api.get<{ data: { brand: string; product_count: number }[] }>(
      '/api/v1/product-intelligence/brands',
    );
    return result.data;
  },
};
