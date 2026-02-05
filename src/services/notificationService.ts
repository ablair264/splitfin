import { api } from './apiClient';

export interface Notification {
  id: number;
  agent_id: string;
  type: 'order_placed' | 'customer_created' | 'lead_captured';
  title: string;
  body: string;
  data: Record<string, unknown>;
  is_read: boolean;
  is_push_sent: boolean;
  created_at: string;
}

interface NotificationsListResponse {
  notifications: Notification[];
  pagination: {
    total: number;
    limit: number;
    offset: number;
    has_more: boolean;
  };
}

interface NotificationFilters {
  unread_only?: boolean;
  limit?: number;
  offset?: number;
}

export const notificationService = {
  /**
   * List notifications with pagination
   */
  async list(filters: NotificationFilters = {}): Promise<NotificationsListResponse> {
    return api.get<NotificationsListResponse>('/v1/notifications', filters as Record<string, string | number | boolean>);
  },

  /**
   * Get unread notification count
   */
  async getUnreadCount(): Promise<number> {
    const result = await api.get<{ unread_count: number }>('/v1/notifications/unread-count');
    return result.unread_count;
  },

  /**
   * Mark a single notification as read
   */
  async markRead(id: number): Promise<void> {
    await api.put(`/v1/notifications/${id}/read`);
  },

  /**
   * Mark all notifications as read
   */
  async markAllRead(): Promise<{ count: number }> {
    return api.put<{ message: string; count: number }>('/v1/notifications/mark-all-read');
  },
};
