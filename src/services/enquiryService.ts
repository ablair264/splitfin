import { api } from './apiClient';
import type { ListResponse, SingleResponse, CountResponse } from '../types/domain';

export interface Enquiry {
  id: number;
  enquiry_number: string;
  contact_name: string;
  company_name: string | null;
  email: string;
  phone: string | null;
  subject: string | null;
  description: string | null;
  product_interest: string | null;
  lead_source: string;
  referral_source: string | null;
  estimated_value: number;
  estimated_quantity: number | null;
  status: 'new' | 'contacted' | 'quoted' | 'negotiating' | 'won' | 'lost' | 'cancelled';
  priority: 'urgent' | 'high' | 'medium' | 'low';
  expected_decision_date: string | null;
  next_follow_up_date: string | null;
  follow_up_notes: string | null;
  last_contacted_at: string | null;
  converted_to_customer: boolean;
  converted_customer_id: number | null;
  conversion_date: string | null;
  assigned_to: string | null;
  assigned_to_name?: string;
  created_by: string | null;
  created_by_name?: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface EnquiryActivity {
  id: number;
  enquiry_id: number;
  activity_type: string;
  description: string;
  created_by: string | null;
  created_by_name?: string;
  created_at: string;
}

interface EnquiryFilters {
  status?: string;
  priority?: string;
  assigned_to?: string;
  search?: string;
  limit?: number;
  offset?: number;
}

export const enquiryService = {
  async list(filters: EnquiryFilters = {}): Promise<ListResponse<Enquiry>> {
    return api.get<ListResponse<Enquiry>>('/api/v1/enquiries', filters as Record<string, string | number>);
  },

  async getById(id: number | string): Promise<Enquiry> {
    const result = await api.get<SingleResponse<Enquiry>>(`/api/v1/enquiries/${id}`);
    return result.data;
  },

  async count(status?: string): Promise<number> {
    const params = status ? { status } : {};
    const result = await api.get<CountResponse>('/api/v1/enquiries/count', params);
    return result.count;
  },

  async create(data: Partial<Enquiry>): Promise<Enquiry> {
    const result = await api.post<SingleResponse<Enquiry>>('/api/v1/enquiries', data);
    return result.data;
  },

  async update(id: number, data: Partial<Enquiry>): Promise<Enquiry> {
    const result = await api.put<SingleResponse<Enquiry>>(`/api/v1/enquiries/${id}`, data);
    return result.data;
  },

  async updateStatus(id: number, status: string): Promise<Enquiry> {
    const result = await api.patch<SingleResponse<Enquiry>>(`/api/v1/enquiries/${id}/status`, { status });
    return result.data;
  },

  async delete(id: number): Promise<void> {
    await api.delete(`/api/v1/enquiries/${id}`);
  },

  async getBrands(): Promise<string[]> {
    const result = await api.get<{ data: string[] }>('/api/v1/enquiries/brands');
    return result.data || [];
  },

  async addActivity(enquiryId: number, data: { activity_type?: string; description: string }): Promise<EnquiryActivity> {
    const result = await api.post<SingleResponse<EnquiryActivity>>(`/api/v1/enquiries/${enquiryId}/activities`, data);
    return result.data;
  },

  async getActivities(enquiryId: number): Promise<EnquiryActivity[]> {
    const result = await api.get<ListResponse<EnquiryActivity>>(`/api/v1/enquiries/${enquiryId}/activities`);
    return result.data || [];
  },
};
