/**
 * Message Service
 * Handles messaging between agents and admins via backend API
 */

import { api } from './apiClient';

// Types
export interface Contact {
  id: string;
  name: string;
  is_admin: boolean;
}

export interface Conversation {
  id: number;
  agent_id: string;
  admin_id: string;
  last_message_at: string;
  agent_unread_count: number;
  admin_unread_count: number;
  created_at: string;
  other_user_name?: string;
  last_message?: string;
}

export interface MessageAttachment {
  id: number;
  message_id: number;
  file_type: string;
  file_name: string;
  file_url: string;
  file_size: number | null;
  mime_type: string | null;
  created_at: string;
}

export interface Message {
  id: number;
  conversation_id: number;
  sender_id: string;
  content: string | null;
  is_read: boolean;
  read_at: string | null;
  created_at: string;
  sender_name?: string;
  attachments?: MessageAttachment[];
}

export interface BroadcastAttachment {
  id: number;
  broadcast_id: number;
  file_type: string;
  file_name: string;
  file_url: string;
  file_size: number | null;
  mime_type: string | null;
  created_at: string;
}

export interface BroadcastMessage {
  id: number;
  sender_id: string;
  content: string | null;
  created_at: string;
  sender_name?: string;
  is_read?: boolean;
  attachments?: BroadcastAttachment[];
}

interface Pagination {
  total: number;
  limit: number;
  offset: number;
  has_more: boolean;
}

interface UnreadCountResponse {
  messages: number;
  broadcasts: number;
  total: number;
}

interface ConversationsListResponse {
  conversations: Conversation[];
  pagination: Pagination;
}

interface ConversationResponse {
  conversation: Conversation;
  messages: Message[];
}

interface BroadcastsListResponse {
  broadcasts: BroadcastMessage[];
  pagination: Pagination;
}

interface SendMessageParams {
  content?: string;
  attachments?: Array<{
    file_type: string;
    file_name: string;
    file_url: string;
    file_size?: number;
    mime_type?: string;
  }>;
}

export const messageService = {
  // ============================================
  // CONTACTS
  // ============================================

  /**
   * Get available contacts for messaging
   */
  async getContacts(): Promise<Contact[]> {
    const result = await api.get<{ contacts: Contact[] }>('/v1/messages/contacts');
    return result.contacts;
  },

  // ============================================
  // UNREAD COUNT
  // ============================================

  /**
   * Get total unread count (messages + broadcasts)
   */
  async getUnreadCount(): Promise<UnreadCountResponse> {
    return api.get<UnreadCountResponse>('/v1/messages/unread-count');
  },

  // ============================================
  // CONVERSATIONS
  // ============================================

  /**
   * List conversations
   */
  async listConversations(options: { limit?: number; offset?: number } = {}): Promise<ConversationsListResponse> {
    return api.get<ConversationsListResponse>('/v1/messages/conversations', options as Record<string, string | number>);
  },

  /**
   * Start new conversation
   */
  async createConversation(recipientId: string): Promise<Conversation> {
    const result = await api.post<{ conversation: Conversation }>('/v1/messages/conversations', {
      recipient_id: recipientId,
    });
    return result.conversation;
  },

  /**
   * Get conversation with messages
   */
  async getConversation(
    conversationId: number,
    options: { limit?: number; offset?: number } = {}
  ): Promise<ConversationResponse> {
    return api.get<ConversationResponse>(
      `/v1/messages/conversations/${conversationId}`,
      options as Record<string, string | number>
    );
  },

  /**
   * Send message in a conversation
   */
  async sendMessage(conversationId: number, params: SendMessageParams): Promise<Message> {
    const result = await api.post<{ message: Message }>(
      `/v1/messages/conversations/${conversationId}/messages`,
      params
    );
    return result.message;
  },

  /**
   * Mark conversation as read
   */
  async markConversationRead(conversationId: number): Promise<void> {
    await api.put(`/v1/messages/conversations/${conversationId}/read`);
  },

  // ============================================
  // BROADCASTS
  // ============================================

  /**
   * List broadcast messages
   */
  async listBroadcasts(options: { limit?: number; offset?: number } = {}): Promise<BroadcastsListResponse> {
    return api.get<BroadcastsListResponse>('/v1/messages/broadcasts', options as Record<string, string | number>);
  },

  /**
   * Send broadcast (admin only)
   */
  async sendBroadcast(params: SendMessageParams): Promise<BroadcastMessage> {
    const result = await api.post<{ broadcast: BroadcastMessage }>('/v1/messages/broadcasts', params);
    return result.broadcast;
  },

  /**
   * Mark broadcast as read
   */
  async markBroadcastRead(broadcastId: number): Promise<void> {
    await api.put(`/v1/messages/broadcasts/${broadcastId}/read`);
  },
};
