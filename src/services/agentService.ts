import { api } from './apiClient';
import type { Agent, ListResponse, SingleResponse } from '../types/domain';

export const agentService = {
  async list(): Promise<Agent[]> {
    const result = await api.get<ListResponse<Agent>>('/api/v1/agents');
    return result.data || [];
  },

  async getById(id: string): Promise<Agent> {
    const result = await api.get<SingleResponse<Agent>>(`/api/v1/agents/${id}`);
    return result.data;
  },
};
