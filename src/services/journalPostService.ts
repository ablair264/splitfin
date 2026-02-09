import { api } from './apiClient';
import { API_BASE_URL } from '../config/api';
import type { JournalPost, WebsiteTag, ListResponse, SingleResponse } from '../types/domain';

export interface JournalPostFilters {
  search?: string;
  status?: string;
  is_featured?: string;
  tag_id?: number;
  sort_by?: string;
  sort_order?: 'asc' | 'desc';
  limit?: number;
  offset?: number;
}

export const journalPostService = {
  async list(filters: JournalPostFilters = {}): Promise<ListResponse<JournalPost>> {
    return api.get<ListResponse<JournalPost>>('/api/v1/journal-posts', filters as Record<string, string | number>);
  },

  async getById(id: number): Promise<JournalPost> {
    const result = await api.get<SingleResponse<JournalPost>>(`/api/v1/journal-posts/${id}`);
    return result.data;
  },

  async create(data: Partial<JournalPost>): Promise<JournalPost> {
    const result = await api.post<SingleResponse<JournalPost>>('/api/v1/journal-posts', data);
    return result.data;
  },

  async update(id: number, data: Partial<JournalPost>): Promise<JournalPost> {
    const result = await api.put<SingleResponse<JournalPost>>(`/api/v1/journal-posts/${id}`, data);
    return result.data;
  },

  async remove(id: number): Promise<void> {
    await api.delete(`/api/v1/journal-posts/${id}`);
  },

  // Tags
  async getPostTags(id: number): Promise<WebsiteTag[]> {
    const result = await api.get<{ data: WebsiteTag[] }>(`/api/v1/journal-posts/${id}/tags`);
    return result.data;
  },

  async setPostTags(id: number, tagIds: number[]): Promise<WebsiteTag[]> {
    const result = await api.put<{ data: WebsiteTag[] }>(`/api/v1/journal-posts/${id}/tags`, { tag_ids: tagIds });
    return result.data;
  },

  // Images
  async uploadImage(id: number, file: File, type?: 'cover'): Promise<{ image_url: string }> {
    const formData = new FormData();
    formData.append('image', file);
    if (type) formData.append('type', type);

    const token = localStorage.getItem('auth_token');
    const headers: Record<string, string> = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const response = await fetch(`${API_BASE_URL}/api/v1/journal-posts/${id}/images`, {
      method: 'POST',
      headers,
      body: formData,
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({ error: 'Upload failed' }));
      throw new Error(err.error || 'Upload failed');
    }

    const result = await response.json();
    return result.data;
  },

  async deleteImage(id: number, imageId: number): Promise<void> {
    await api.delete(`/api/v1/journal-posts/${id}/images/${imageId}`);
  },
};
