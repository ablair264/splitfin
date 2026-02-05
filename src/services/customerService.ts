import { api } from './apiClient';
import type { Customer, ListResponse, SingleResponse, CountResponse } from '../types/domain';

interface CustomerFilters {
  status?: string;
  agent_id?: string;
  search?: string;
  limit?: number;
  offset?: number;
}

export const customerService = {
  async list(filters: CustomerFilters = {}): Promise<ListResponse<Customer>> {
    return api.get<ListResponse<Customer>>('/api/v1/customers', filters as Record<string, string | number>);
  },

  async getById(id: string | number): Promise<Customer> {
    const result = await api.get<SingleResponse<Customer>>(`/api/v1/customers/${id}`);
    return result.data;
  },

  async count(status?: string): Promise<number> {
    const params = status ? { status } : {};
    const result = await api.get<CountResponse>('/api/v1/customers/count', params);
    return result.count;
  },

  async create(data: Partial<Customer>): Promise<Customer> {
    const result = await api.post<SingleResponse<Customer>>('/api/v1/customers', data);
    return result.data;
  },

  async update(id: number, data: Partial<Customer>): Promise<Customer> {
    const result = await api.put<SingleResponse<Customer>>(`/api/v1/customers/${id}`, data);
    return result.data;
  },
};
