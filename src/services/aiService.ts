import { api } from './apiClient';

interface EnrichDescriptionResponse {
  description: string;
}

interface ClassifyCategoryResponse {
  category: string | null;
}

export const aiService = {
  async enrichDescription(params: {
    name: string;
    description?: string;
    brand?: string;
    ean?: string;
  }): Promise<string> {
    const result = await api.post<EnrichDescriptionResponse>('/api/ai/enrich-description', params);
    return result.description;
  },

  async classifyCategory(name: string): Promise<string | null> {
    const result = await api.post<ClassifyCategoryResponse>('/api/ai/classify-category', { name });
    return result.category;
  },
};
