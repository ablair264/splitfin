import { api } from './apiClient';
import type { Invoice, ListResponse, SingleResponse } from '../types/domain';

interface InvoiceFilters {
  status?: string;
  agent_id?: string;
  customer_id?: string;
  search?: string;
  limit?: number;
  offset?: number;
}

export const invoiceService = {
  async list(filters: InvoiceFilters = {}): Promise<ListResponse<Invoice>> {
    return api.get<ListResponse<Invoice>>('/api/v1/invoices', filters as Record<string, string | number>);
  },

  async getById(id: number): Promise<Invoice> {
    const result = await api.get<SingleResponse<Invoice>>(`/api/v1/invoices/${id}`);
    return result.data;
  },
};
