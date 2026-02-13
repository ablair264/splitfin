import { api } from './apiClient';
import type { Invoice, InvoicePayment, InvoiceSummary, ReminderSettings, ListResponse, SingleResponse } from '../types/domain';

export interface InvoiceFilters {
  status?: string;
  agent_id?: string;
  customer_id?: string;
  salesperson_name?: string;
  payment_terms?: string;
  search?: string;
  date_from?: string;
  date_to?: string;
  due_date_from?: string;
  due_date_to?: string;
  total_min?: number;
  total_max?: number;
  balance_min?: number;
  balance_max?: number;
  overdue?: string;
  sort_by?: string;
  sort_order?: 'asc' | 'desc';
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

  async getStatuses(filters?: Record<string, string>): Promise<{ status: string; count: number }[]> {
    const result = await api.get<{ data: { status: string; count: number }[] }>('/api/v1/invoices/statuses', filters);
    return result.data;
  },

  async getSalespersons(filters?: Record<string, string>): Promise<{ salesperson_name: string; count: number }[]> {
    const result = await api.get<{ data: { salesperson_name: string; count: number }[] }>('/api/v1/invoices/salespersons', filters);
    return result.data;
  },

  async getSummary(filters?: Record<string, string>): Promise<InvoiceSummary> {
    const result = await api.get<{ data: InvoiceSummary }>('/api/v1/invoices/summary', filters);
    return result.data;
  },

  async createFromOrder(zohoSalesOrderId: string, agentId: string): Promise<Invoice> {
    const result = await api.post<SingleResponse<Invoice>>('/api/v1/invoices/from-order', {
      zoho_salesorder_id: zohoSalesOrderId,
      agent_id: agentId,
    });
    return result.data;
  },

  async getPayments(invoiceId: number): Promise<InvoicePayment[]> {
    const result = await api.get<{ data: InvoicePayment[] }>(`/api/v1/invoices/${invoiceId}/payments`);
    return result.data;
  },

  async recordPayment(invoiceId: number, payment: {
    amount: number;
    payment_date?: string;
    payment_mode?: string;
    reference_number?: string;
    description?: string;
    recorded_by?: string;
  }): Promise<InvoicePayment & { new_balance: number; invoice_status: string }> {
    const result = await api.post<{ data: InvoicePayment & { new_balance: number; invoice_status: string } }>(
      `/api/v1/invoices/${invoiceId}/payments`,
      payment
    );
    return result.data;
  },

  async sendReminder(invoiceId: number, data: {
    to: string;
    cc?: string;
    custom_message?: string;
    sent_by?: string;
  }): Promise<{ success: boolean; message_id?: string }> {
    const result = await api.post<{ data: { success: boolean; message_id?: string } }>(
      `/api/v1/invoices/${invoiceId}/send-reminder`,
      data
    );
    return result.data;
  },

  async getReminderLog(invoiceId: number): Promise<unknown[]> {
    const result = await api.get<{ data: unknown[] }>(`/api/v1/invoices/${invoiceId}/reminder-log`);
    return result.data;
  },

  async getReminderSettings(customerId: number): Promise<ReminderSettings> {
    const result = await api.get<{ data: ReminderSettings }>(`/api/v1/invoices/reminder-settings/${customerId}`);
    return result.data;
  },

  async updateReminderSettings(customerId: number, settings: Partial<ReminderSettings>): Promise<ReminderSettings> {
    const result = await api.put<{ data: ReminderSettings }>(`/api/v1/invoices/reminder-settings/${customerId}`, settings);
    return result.data;
  },

  async getGlobalReminderStatus(): Promise<boolean> {
    const result = await api.get<{ data: { enabled: boolean } }>('/api/v1/invoices/reminder-global');
    return result.data.enabled;
  },

  async setGlobalReminderStatus(enabled: boolean): Promise<boolean> {
    const result = await api.put<{ data: { enabled: boolean } }>('/api/v1/invoices/reminder-global', { enabled });
    return result.data.enabled;
  },
};
