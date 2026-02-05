import { api } from './apiClient';
import type { Order, ListResponse, SingleResponse, CountResponse } from '../types/domain';

interface OrderFilters {
  status?: string;
  agent_id?: string;
  customer_id?: string;
  search?: string;
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

  async count(filters: { status?: string; agent_id?: string } = {}): Promise<number> {
    const result = await api.get<CountResponse>('/api/v1/orders/count', filters);
    return result.count;
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
