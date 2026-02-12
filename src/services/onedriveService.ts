import { api } from './apiClient';

export const onedriveService = {
  async getAuthUrl(): Promise<{ url: string }> {
    return api.get('/api/v1/onedrive/auth-url');
  },

  async getStatus(): Promise<{ connected: boolean; expires_at: string | null }> {
    return api.get('/api/v1/onedrive/status');
  },

  async disconnect(): Promise<{ success: boolean }> {
    return api.post('/api/v1/onedrive/disconnect');
  },

  async listImages(params?: {
    path?: string;
    limit?: number;
    includeDownloadUrl?: boolean;
  }): Promise<{
    items: {
      id: string;
      name: string;
      size: number;
      mimeType: string | null;
      webUrl: string | null;
      createdDateTime: string | null;
      lastModifiedDateTime: string | null;
      downloadUrl: string | null;
    }[];
    nextLink: string | null;
  }> {
    return api.get('/api/v1/onedrive/images', params as Record<string, string | number | boolean>);
  },

  async listChildren(params?: {
    parentId?: string;
    limit?: number;
    foldersOnly?: boolean;
    imagesOnly?: boolean;
    nextLink?: string;
    includeDownloadUrl?: boolean;
  }): Promise<{
    folders: { id: string; name: string; childCount: number | null }[];
    images: {
      id: string;
      name: string;
      size: number;
      mimeType: string | null;
      webUrl: string | null;
      createdDateTime: string | null;
      lastModifiedDateTime: string | null;
      downloadUrl: string | null;
    }[];
    nextLink: string | null;
  }> {
    return api.get('/api/v1/onedrive/children', params as Record<string, string | number | boolean>);
  },

  async importImages(payload: {
    brand: string;
    items: {
      id: string;
      name: string;
      mimeType?: string | null;
      matched_sku?: string;
      sku_confidence?: number;
      original_filename?: string;
    }[];
  }): Promise<{
    results: {
      success: boolean;
      originalFilename: string;
      finalFilename: string;
      matchedSku?: string;
      confidence?: number;
      webpUrl?: string;
      error?: string;
    }[];
    summary: {
      total: number;
      success: number;
      errors: number;
    };
  }> {
    return api.post('/api/v1/onedrive/import', payload);
  },
};
