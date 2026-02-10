import { api } from './apiClient';
import { API_BASE_URL } from '../config/api';
import type {
  ReportDateRange,
  SalesOverviewData,
  AgentPerformanceData,
  AgentCommissionData,
  BrandAnalysisData,
  CustomerInsightsData,
  InventoryHealthData,
  FinancialData,
  ReportFilterOptions,
} from '../types/domain';

export interface ReportFilters {
  agent_id?: string;
  brand?: string;
  region?: string;
  status?: string;
}

function buildParams(range: ReportDateRange, filters?: ReportFilters): Record<string, string> {
  const params: Record<string, string> = { range };
  if (filters?.agent_id) params.agent_id = filters.agent_id;
  if (filters?.brand) params.brand = filters.brand;
  if (filters?.region) params.region = filters.region;
  if (filters?.status) params.status = filters.status;
  return params;
}

export const reportService = {
  async filterOptions(): Promise<ReportFilterOptions> {
    return api.get<ReportFilterOptions>('/api/v1/reports/filter-options');
  },

  async salesOverview(range: ReportDateRange, filters?: ReportFilters): Promise<SalesOverviewData> {
    return api.get<SalesOverviewData>('/api/v1/reports/sales-overview', buildParams(range, filters));
  },

  async agentPerformance(range: ReportDateRange): Promise<AgentPerformanceData> {
    return api.get<AgentPerformanceData>('/api/v1/reports/agent-performance', { range });
  },

  async agentCommission(range: ReportDateRange, filters?: ReportFilters): Promise<AgentCommissionData> {
    return api.get<AgentCommissionData>('/api/v1/reports/agent-commission', buildParams(range, filters));
  },

  async brandAnalysis(range: ReportDateRange, filters?: ReportFilters): Promise<BrandAnalysisData> {
    return api.get<BrandAnalysisData>('/api/v1/reports/brand-analysis', buildParams(range, filters));
  },

  async customerInsights(range: ReportDateRange, filters?: ReportFilters): Promise<CustomerInsightsData> {
    return api.get<CustomerInsightsData>('/api/v1/reports/customer-insights', buildParams(range, filters));
  },

  async inventoryHealth(range: ReportDateRange, filters?: ReportFilters): Promise<InventoryHealthData> {
    return api.get<InventoryHealthData>('/api/v1/reports/inventory-health', buildParams(range, filters));
  },

  async financial(range: ReportDateRange, filters?: ReportFilters): Promise<FinancialData> {
    return api.get<FinancialData>('/api/v1/reports/financial', buildParams(range, filters));
  },

  async exportFile(report: string, range: ReportDateRange, format: 'csv' | 'xlsx' = 'csv', params?: Record<string, string>): Promise<void> {
    const token = localStorage.getItem('auth_token');
    const url = new URL(`${API_BASE_URL}/api/v1/reports/export/${report}`);
    url.searchParams.set('range', range);
    url.searchParams.set('format', format);
    if (params) {
      Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value));
    }

    const response = await fetch(url.toString(), {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!response.ok) throw new Error('Export failed');

    const blob = await response.blob();
    const blobUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = blobUrl;
    a.download = response.headers.get('content-disposition')?.split('filename=')[1]?.replace(/"/g, '') || `${report}.${format}`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(blobUrl);
  },

  // Keep backward compat
  async exportCsv(report: string, range: ReportDateRange): Promise<void> {
    return this.exportFile(report, range, 'csv');
  },
};
