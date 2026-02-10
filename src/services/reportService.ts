import { api } from './apiClient';
import { API_BASE_URL } from '../config/api';
import type {
  ReportDateRange,
  SalesOverviewData,
  AgentPerformanceData,
  BrandAnalysisData,
  CustomerInsightsData,
  InventoryHealthData,
  FinancialData,
} from '../types/domain';

function dateParams(range: ReportDateRange): Record<string, string> {
  return { range };
}

export const reportService = {
  async salesOverview(range: ReportDateRange): Promise<SalesOverviewData> {
    return api.get<SalesOverviewData>('/api/v1/reports/sales-overview', dateParams(range));
  },

  async agentPerformance(range: ReportDateRange): Promise<AgentPerformanceData> {
    return api.get<AgentPerformanceData>('/api/v1/reports/agent-performance', dateParams(range));
  },

  async brandAnalysis(range: ReportDateRange): Promise<BrandAnalysisData> {
    return api.get<BrandAnalysisData>('/api/v1/reports/brand-analysis', dateParams(range));
  },

  async customerInsights(range: ReportDateRange): Promise<CustomerInsightsData> {
    return api.get<CustomerInsightsData>('/api/v1/reports/customer-insights', dateParams(range));
  },

  async inventoryHealth(range: ReportDateRange): Promise<InventoryHealthData> {
    return api.get<InventoryHealthData>('/api/v1/reports/inventory-health', dateParams(range));
  },

  async financial(range: ReportDateRange): Promise<FinancialData> {
    return api.get<FinancialData>('/api/v1/reports/financial', dateParams(range));
  },

  async exportCsv(report: string, range: ReportDateRange): Promise<void> {
    const token = localStorage.getItem('auth_token');
    const url = new URL(`${API_BASE_URL}/api/v1/reports/export/${report}`);
    url.searchParams.set('range', range);

    const response = await fetch(url.toString(), {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!response.ok) throw new Error('Export failed');

    const blob = await response.blob();
    const blobUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = blobUrl;
    a.download = response.headers.get('content-disposition')?.split('filename=')[1]?.replace(/"/g, '') || `${report}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(blobUrl);
  },
};
