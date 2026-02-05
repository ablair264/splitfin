import { api } from './apiClient';

export interface Analytics {
  // Core metrics
  totalRevenue: number;
  totalOrders: number;
  totalCustomers: number;
  averageOrderValue: number;

  // Customer metrics
  activeCustomers: number;
  newCustomers: number;

  // Order metrics
  pendingOrders: number;
  confirmedOrders: number;
  shippedOrders: number;
  deliveredOrders: number;
  orderConversion: number;

  // Invoice metrics
  outstandingInvoices: number;
  paidInvoices: number;
  overdueInvoices: number;
  totalInvoiceAmount: number;

  // Financial metrics
  monthlyRevenue: number;
  monthlyExpenses: number;
  profitMargin: number;

  // Sales metrics
  teamPerformance: number;
  monthlyTargets: number;
  conversionRate: number;

  // System metrics
  activeUsers: number;
  systemHealth: number;
  storageUsage: number;
}

export interface TimeSeriesData {
  name: string;
  date: string;
  value: number;
  orders?: number;
  customers?: number;
  revenue?: number;
}

export interface Activity {
  id: string;
  action: string;
  description: string;
  customerName?: string;
  userName?: string;
  time: string;
  amount?: number;
  type: 'order' | 'invoice' | 'payment' | 'customer' | 'user' | 'system';
  status?: string;
}

export interface TopCustomer {
  id: string;
  name: string;
  orders: number;
  revenue: number;
  lastOrder: string;
  status: string;
}

export interface SalesPersonPerformance {
  id: string;
  name: string;
  orders: number;
  revenue: number;
  target: number;
  performance: number;
}

class AnalyticsDataService {
  async getAnalytics(dateRange: string = '30_days'): Promise<Analytics> {
    return api.get<Analytics>('/v1/analytics', { date_range: dateRange });
  }

  async getTimeSeriesData(dateRange: string = '30_days', _metric: string = 'revenue'): Promise<TimeSeriesData[]> {
    return api.get<TimeSeriesData[]>('/v1/analytics/timeseries', { date_range: dateRange });
  }

  async getRecentActivities(limit: number = 10): Promise<Activity[]> {
    return api.get<Activity[]>('/v1/analytics/activities', { limit });
  }

  async getTopCustomers(limit: number = 10): Promise<TopCustomer[]> {
    return api.get<TopCustomer[]>('/v1/analytics/top-customers', { limit });
  }

  async getSalesPerformance(): Promise<SalesPersonPerformance[]> {
    // Sales performance aggregation not yet implemented server-side
    return [];
  }
}

export const analyticsDataService = new AnalyticsDataService();
