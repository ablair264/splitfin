import { api } from './apiClient';
import type { Order, ListResponse, SingleResponse, CountResponse } from '../types/domain';

export interface OrderFilters {
  status?: string;
  agent_id?: string;
  customer_id?: string;
  salesperson_name?: string;
  shipped_status?: string;
  invoiced_status?: string;
  search?: string;
  date_from?: string;
  date_to?: string;
  total_min?: number;
  total_max?: number;
  sort_by?: string;
  sort_order?: 'asc' | 'desc';
  limit?: number;
  offset?: number;
}

export const orderService = {
  async list(filters: OrderFilters = {}): Promise<ListResponse<Order>> {
    return api.get<ListResponse<Order>>('/api/v1/orders', filters as Record<string, string | number>);
  },

  async getById(id: number): Promise<Order> {
    const result = await api.get<SingleResponse<Order>>(`/api/v1/orders/${id}`);
    return result.data;
  },

  async count(filters: Partial<OrderFilters> = {}): Promise<number> {
    const result = await api.get<CountResponse>('/api/v1/orders/count', filters as Record<string, string | number>);
    return result.count;
  },

  async getSalespersons(): Promise<{ salesperson_name: string; count: number }[]> {
    const result = await api.get<{ data: { salesperson_name: string; count: number }[] }>('/api/v1/orders/salespersons');
    return result.data;
  },

  async getStatuses(): Promise<{ status: string; count: number }[]> {
    const result = await api.get<{ data: { status: string; count: number }[] }>('/api/v1/orders/statuses');
    return result.data;
  },

  async create(data: Partial<Order>): Promise<Order> {
    const result = await api.post<SingleResponse<Order>>('/api/v1/orders', data);
    return result.data;
  },

  async update(id: number, data: Partial<Order>): Promise<Order> {
    const result = await api.put<SingleResponse<Order>>(`/api/v1/orders/${id}`, data);
    return result.data;
  },
};
