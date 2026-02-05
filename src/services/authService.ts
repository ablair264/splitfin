import { api, ApiError } from './apiClient';
import type { Agent, AuthResponse } from '../types/domain';

const TOKEN_KEY = 'auth_token';
const AGENT_KEY = 'auth_agent';

export const authService = {
  async login(agentId: string, pin: string): Promise<{ agent: Agent; token: string }> {
    const result = await api.post<AuthResponse>('/api/v1/auth/login', {
      agent_id: agentId,
      pin,
    });

    localStorage.setItem(TOKEN_KEY, result.token);
    localStorage.setItem(AGENT_KEY, JSON.stringify(result.agent));

    return result;
  },

  async getCurrentAgent(): Promise<Agent | null> {
    const token = localStorage.getItem(TOKEN_KEY);
    if (!token) return null;

    try {
      const result = await api.get<{ agent: Agent }>('/api/v1/auth/me');
      localStorage.setItem(AGENT_KEY, JSON.stringify(result.agent));
      return result.agent;
    } catch (err) {
      if (err instanceof ApiError && err.isUnauthorized) {
        this.logout();
        return null;
      }
      throw err;
    }
  },

  getCachedAgent(): Agent | null {
    const stored = localStorage.getItem(AGENT_KEY);
    if (!stored) return null;
    try {
      return JSON.parse(stored) as Agent;
    } catch {
      return null;
    }
  },

  getToken(): string | null {
    return localStorage.getItem(TOKEN_KEY);
  },

  isLoggedIn(): boolean {
    return !!localStorage.getItem(TOKEN_KEY);
  },

  logout(): void {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(AGENT_KEY);
  },
};
