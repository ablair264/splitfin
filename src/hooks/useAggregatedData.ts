import { useState, useEffect, useCallback } from 'react';
// TODO: Use analyticsDataService once backend aggregation endpoints are implemented
// import { analyticsDataService } from '../services/analyticsDataService';
import { ANALYTICS_DATA_SOURCES } from '../config/analyticsDataSources';

interface UseAggregatedDataOptions {
  dataSource: string;
  metrics: string[];
  filters?: Record<string, any>;
  groupBy?: string[];
  orderBy?: { field: string; direction: 'asc' | 'desc' };
  periodType?: 'day' | 'week' | 'month' | 'quarter' | 'year';
  dateRange?: { start: Date; end: Date };
  realTime?: boolean;
}

interface UseAggregatedDataResult<T = any> {
  data: T[] | null;
  loading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
}

export function useAggregatedData<T = any>({
  dataSource,
  metrics,
  filters = {},
  groupBy,
  orderBy,
  periodType,
  dateRange,
  realTime = false
}: UseAggregatedDataOptions): UseAggregatedDataResult<T> {
  const [data, setData] = useState<T[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const source = ANALYTICS_DATA_SOURCES[dataSource];
      if (!source) {
        throw new Error(`Unknown data source: ${dataSource}`);
      }

      // TODO: Implement backend API endpoints for aggregated analytics data
      // The aggregated tables (brand_trends_aggregated, sales_performance_aggregated, etc.)
      // don't exist in the new Neon schema. These need to be either:
      // 1. Created as materialized views in Neon
      // 2. Computed on-the-fly by backend API endpoints
      // 3. Replaced with direct queries to orders/invoices/products tables
      //
      // For now, we attempt to use analyticsDataService for basic metrics,
      // but return empty arrays for specialized aggregated data.

      // Log info for debugging during migration
      console.warn(
        `[useAggregatedData] Data source "${dataSource}" (table: ${source.table}) ` +
        `not yet implemented in backend API. Returning empty data. ` +
        `Requested metrics: ${metrics.join(', ')}`,
        { filters, groupBy, orderBy, periodType, dateRange }
      );

      // Return empty data - consumers should handle this gracefully
      setData([] as T[]);
    } catch (err) {
      console.error('Error fetching aggregated data:', err);
      setError(err as Error);
    } finally {
      setLoading(false);
    }
  }, [dataSource, JSON.stringify(metrics), JSON.stringify(filters), JSON.stringify(groupBy), JSON.stringify(orderBy), periodType, JSON.stringify(dateRange)]);

  // Real-time subscriptions are not supported with the new backend API pattern
  // The Supabase realtime channel subscription has been removed
  // If real-time updates are needed, implement polling or WebSocket connection to backend
  useEffect(() => {
    if (realTime) {
      console.warn(
        `[useAggregatedData] Real-time subscription requested for "${dataSource}" ` +
        `but real-time is not supported with the new backend API pattern. ` +
        `Consider implementing polling or WebSocket connection if real-time updates are needed.`
      );
    }
    // Return no-op cleanup function
    return () => {};
  }, [dataSource, realTime, filters.company_id]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return { data, loading, error, refetch: fetchData };
}

// Specialized hooks for common use cases
// TODO: These hooks return empty data until backend aggregation endpoints are implemented

export function useSalesMetrics(
  companyId: string,
  periodType: 'day' | 'week' | 'month' | 'year' = 'day',
  dateRange?: { start: Date; end: Date }
) {
  return useAggregatedData({
    dataSource: 'salesRevenue',
    metrics: ['totalRevenue', 'orderCount', 'avgOrderValue'],
    filters: { company_id: companyId },
    periodType,
    dateRange,
    orderBy: { field: 'period_date', direction: 'asc' }
  });
}

export function useBrandTrends(
  companyId: string,
  periodType: 'day' | 'week' | 'month' | 'year' = 'month',
  dateRange?: { start: Date; end: Date }
) {
  return useAggregatedData({
    dataSource: 'brandTrends',
    metrics: ['quantity', 'orderCount'],
    filters: { company_id: companyId },
    groupBy: ['brand', 'period'],
    periodType,
    dateRange,
    orderBy: { field: 'period_date', direction: 'asc' }
  });
}

export function useTopProducts(
  companyId: string,
  limit: number = 10,
  periodType: 'day' | 'week' | 'month' | 'year' = 'month'
) {
  const endDate = new Date();
  const startDate = new Date();

  switch (periodType) {
    case 'day':
      startDate.setDate(endDate.getDate() - 30);
      break;
    case 'week':
      startDate.setDate(endDate.getDate() - 84);
      break;
    case 'month':
      startDate.setFullYear(endDate.getFullYear() - 1);
      break;
    case 'year':
      startDate.setFullYear(endDate.getFullYear() - 3);
      break;
  }

  return useAggregatedData({
    dataSource: 'topProducts',
    metrics: ['revenue', 'quantity'],
    filters: {
      company_id: companyId,
      revenue_rank: { lte: limit }
    },
    periodType,
    dateRange: { start: startDate, end: endDate },
    orderBy: { field: 'revenue_generated', direction: 'desc' }
  });
}

export function useInventoryMetrics(
  companyId: string,
  brandId?: string,
  warehouseId?: string
) {
  return useAggregatedData({
    dataSource: 'inventoryHealth',
    metrics: ['stockValue', 'itemsInStock', 'turnoverRatio', 'belowReorder'],
    filters: {
      company_id: companyId,
      ...(brandId && { brand_id: brandId }),
      ...(warehouseId && { warehouse_id: warehouseId })
    },
    periodType: 'day',
    orderBy: { field: 'period_date', direction: 'desc' }
  });
}

export function useFinancialMetrics(
  companyId: string,
  periodType: 'month' | 'quarter' | 'year' = 'month',
  dateRange?: { start: Date; end: Date }
) {
  return useAggregatedData({
    dataSource: 'financialPerformance',
    metrics: ['grossRevenue', 'netRevenue', 'receivables', 'overdueAmount', 'grossMargin'],
    filters: { company_id: companyId },
    periodType,
    dateRange,
    orderBy: { field: 'period_date', direction: 'asc' }
  });
}
