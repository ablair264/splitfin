import { api } from './apiClient';
import { API_BASE_URL } from '../config/api';
import type { SiteSection, WebsiteCategory } from '../types/domain';

export const siteContentService = {
  async list(section?: string): Promise<{ data: SiteSection[]; count: number }> {
    const params = section ? { section } : {};
    return api.get('/api/v1/site-content', params);
  },

  async getById(id: number): Promise<SiteSection> {
    const result = await api.get<{ data: SiteSection }>(`/api/v1/site-content/${id}`);
    return result.data;
  },

  async create(data: Partial<SiteSection>): Promise<SiteSection> {
    const result = await api.post<{ data: SiteSection }>('/api/v1/site-content', data);
    return result.data;
  },

  async update(id: number, data: Partial<SiteSection>): Promise<SiteSection> {
    const result = await api.put<{ data: SiteSection }>(`/api/v1/site-content/${id}`, data);
    return result.data;
  },

  async remove(id: number): Promise<void> {
    await api.delete(`/api/v1/site-content/${id}`);
  },

  async uploadImage(id: number, file: File): Promise<{ image_url: string }> {
    const formData = new FormData();
    formData.append('image', file);
    const token = localStorage.getItem('auth_token');
    const headers: Record<string, string> = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const response = await fetch(`${API_BASE_URL}/api/v1/site-content/${id}/image`, {
      method: 'POST',
      headers,
      body: formData,
    });
    if (!response.ok) {
      const err = await response.json().catch(() => ({ error: 'Upload failed' }));
      throw new Error(err.error || 'Upload failed');
    }
    return response.json();
  },

  async uploadPoster(id: number, file: File): Promise<{ poster_url: string }> {
    const formData = new FormData();
    formData.append('image', file);
    const token = localStorage.getItem('auth_token');
    const headers: Record<string, string> = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const response = await fetch(`${API_BASE_URL}/api/v1/site-content/${id}/poster`, {
      method: 'POST',
      headers,
      body: formData,
    });
    if (!response.ok) {
      const err = await response.json().catch(() => ({ error: 'Upload failed' }));
      throw new Error(err.error || 'Upload failed');
    }
    return response.json();
  },

  // Category heroes
  async getCategories(): Promise<Pick<WebsiteCategory, 'id' | 'name' | 'slug' | 'hero_image_url' | 'hero_placeholder'>[]> {
    const result = await api.get<{ data: Pick<WebsiteCategory, 'id' | 'name' | 'slug' | 'hero_image_url' | 'hero_placeholder'>[] }>('/api/v1/site-content/categories');
    return result.data;
  },

  async updateCategory(id: number, data: { hero_placeholder?: string; description?: string }): Promise<WebsiteCategory> {
    const result = await api.put<{ data: WebsiteCategory }>(`/api/v1/site-content/categories/${id}`, data);
    return result.data;
  },

  async uploadCategoryHeroImage(categoryId: number, file: File): Promise<{ hero_image_url: string }> {
    const formData = new FormData();
    formData.append('image', file);
    const token = localStorage.getItem('auth_token');
    const headers: Record<string, string> = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const response = await fetch(`${API_BASE_URL}/api/v1/site-content/categories/${categoryId}/hero-image`, {
      method: 'POST',
      headers,
      body: formData,
    });
    if (!response.ok) {
      const err = await response.json().catch(() => ({ error: 'Upload failed' }));
      throw new Error(err.error || 'Upload failed');
    }
    return response.json();
  },
};
