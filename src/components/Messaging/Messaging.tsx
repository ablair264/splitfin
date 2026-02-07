import React, { useState, useEffect, useRef } from 'react';
import { Send, Users, Search, Phone, Video, MoreVertical, Paperclip } from 'lucide-react';
import { usePageTitle } from '@/hooks/usePageTitle';
import { authService } from '../../services/authService';
import { messageService, type Conversation as APIConversation, type Message as APIMessage, type Contact } from '../../services/messageService';
import styles from './Messaging.module.css';

interface User {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  role: string;
  company_id: string;
  avatar_url?: string;
  is_online?: boolean;
  last_seen?: string;
}

interface DisplayMessage {
  id: string;
  content: string;
  sender_id: string;
  recipient_id: string;
  created_at: string;
  read_at?: string;
  message_type: 'text' | 'image' | 'file';
  sender?: User;
}

interface DisplayConversation {
  user: User;
  conversation?: APIConversation;
  lastMessage?: DisplayMessage;
  unreadCount: number;
}

const Messaging: React.FC = () => {
  usePageTitle('Messages');
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [conversations, setConversations] = useState<DisplayConversation[]>([]);
  const [selectedConversation, setSelectedConversation] = useState<DisplayConversation | null>(null);
  const [messages, setMessages] = useState<DisplayMessage[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [activeConversationId, setActiveConversationId] = useState<number | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    initializeMessaging();
  }, []);

  useEffect(() => {
    if (selectedConversation?.conversation) {
      loadMessages(selectedConversation.conversation.id);
    }
  }, [selectedConversation]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const initializeMessaging = async () => {
    try {
      const agent = authService.getCachedAgent();
      if (!agent) {
        setLoading(false);
        return;
      }

      // Convert agent to user format for messaging
      const userData: User = {
        id: agent.id,
        first_name: agent.name.split(' ')[0] || agent.name,
        last_name: agent.name.split(' ').slice(1).join(' ') || '',
        email: '',
        role: agent.is_admin ? 'admin' : 'agent',
        company_id: '',
        is_online: true
      };

      setCurrentUser(userData);
      await loadConversationsAndContacts();
    } catch (error) {
      console.error('Error initializing messaging:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadConversationsAndContacts = async () => {
    try {
      // Load existing conversations and contacts in parallel
      const [conversationsRes, contacts] = await Promise.all([
        messageService.listConversations({ limit: 50 }),
        messageService.getContacts()
      ]);

      // Convert API conversations to display format
      const displayConversations: DisplayConversation[] = conversationsRes.conversations.map(conv => ({
        user: {
          id: conv.agent_id === currentUser?.id ? conv.admin_id : conv.agent_id,
          first_name: conv.other_user_name?.split(' ')[0] || 'Unknown',
          last_name: conv.other_user_name?.split(' ').slice(1).join(' ') || '',
          email: '',
          role: conv.agent_id === currentUser?.id ? 'admin' : 'agent',
          company_id: '',
          is_online: false
        },
        conversation: conv,
        lastMessage: conv.last_message ? {
          id: 'last',
          content: conv.last_message,
          sender_id: '',
          recipient_id: '',
          created_at: conv.last_message_at,
          message_type: 'text' as const
        } : undefined,
        unreadCount: currentUser?.role === 'admin' ? conv.admin_unread_count : conv.agent_unread_count
      }));

      // Add contacts that don't have conversations yet
      const existingUserIds = new Set(displayConversations.map(dc => dc.user.id));
      const newContacts: DisplayConversation[] = contacts
        .filter(c => !existingUserIds.has(c.id))
        .map(contact => ({
          user: {
            id: contact.id,
            first_name: contact.name.split(' ')[0] || contact.name,
            last_name: contact.name.split(' ').slice(1).join(' ') || '',
            email: '',
            role: contact.is_admin ? 'admin' : 'agent',
            company_id: '',
            is_online: false
          },
          unreadCount: 0
        }));

      setConversations([...displayConversations, ...newContacts]);
    } catch (error) {
      console.error('Error loading conversations:', error);
      setConversations([]);
    }
  };

  const markMessagesAsRead = async (conversationId: number) => {
    if (!currentUser) return;

    try {
      await messageService.markConversationRead(conversationId);
      // Update local conversation unread count
      setConversations(prev => prev.map(conv =>
        conv.conversation?.id === conversationId
          ? { ...conv, unreadCount: 0 }
          : conv
      ));
    } catch (error) {
      console.error('Error marking messages as read:', error);
    }
  };

  const loadMessages = async (conversationId: number) => {
    if (!currentUser) return;

    try {
      setActiveConversationId(conversationId);
      const { messages: apiMessages } = await messageService.getConversation(conversationId, { limit: 100 });

      // Convert API messages to display format
      const displayMessages: DisplayMessage[] = apiMessages.map(msg => ({
        id: msg.id.toString(),
        content: msg.content || '',
        sender_id: msg.sender_id,
        recipient_id: '', // Not needed for display
        created_at: msg.created_at,
        read_at: msg.read_at || undefined,
        message_type: msg.attachments && msg.attachments.length > 0 ? 'file' : 'text',
        sender: {
          id: msg.sender_id,
          first_name: msg.sender_name?.split(' ')[0] || 'Unknown',
          last_name: msg.sender_name?.split(' ').slice(1).join(' ') || '',
          email: '',
          role: '',
          company_id: ''
        }
      }));

      setMessages(displayMessages);

      // Mark messages as read
      await markMessagesAsRead(conversationId);
    } catch (error) {
      console.error('Error loading messages:', error);
      setMessages([]);
    }
  };

  const sendMessage = async () => {
    if (!newMessage.trim() || !selectedConversation || !currentUser) return;

    const messageContent = newMessage.trim();
    setNewMessage(''); // Clear input immediately for better UX

    try {
      let conversationId = selectedConversation.conversation?.id;

      // If no conversation exists, create one first
      if (!conversationId) {
        const newConversation = await messageService.createConversation(selectedConversation.user.id);
        conversationId = newConversation.id;

        // Update the selected conversation with the new conversation ID
        const updatedConv: DisplayConversation = {
          ...selectedConversation,
          conversation: newConversation
        };
        setSelectedConversation(updatedConv);

        // Update conversations list
        setConversations(prev => prev.map(conv =>
          conv.user.id === selectedConversation.user.id ? updatedConv : conv
        ));
      }

      // Send the message
      const sentMessage = await messageService.sendMessage(conversationId, {
        content: messageContent
      });

      // Add the message to local state
      const displayMessage: DisplayMessage = {
        id: sentMessage.id.toString(),
        content: sentMessage.content || '',
        sender_id: currentUser.id,
        recipient_id: selectedConversation.user.id,
        created_at: sentMessage.created_at,
        message_type: 'text',
        sender: currentUser
      };

      setMessages(prev => [...prev, displayMessage]);

      // Update conversation last message
      setConversations(prev => prev.map(conv =>
        conv.conversation?.id === conversationId
          ? { ...conv, lastMessage: displayMessage }
          : conv
      ));

    } catch (error) {
      console.error('Error sending message:', error);
      setNewMessage(messageContent); // Restore message on error
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const formatTime = (timestamp: string) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });
  };

  const getInitials = (firstName: string, lastName: string) => {
    return `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase();
  };

  const filteredConversations = conversations.filter(conv =>
    conv.user.first_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    conv.user.last_name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleSelectConversation = (conv: DisplayConversation) => {
    setSelectedConversation(conv);
    if (conv.conversation) {
      loadMessages(conv.conversation.id);
    } else {
      // No existing conversation yet - clear messages
      setMessages([]);
    }
  };

  if (loading) {
    return (
      <div className={styles.loadingContainer}>
        <div className={styles.spinner}></div>
        <p>Loading messages...</p>
      </div>
    );
  }

  return (
    <div className={styles.messagingContainer}>
      {/* Sidebar - Conversations List */}
      <div className={styles.sidebar}>
        <div className={styles.sidebarHeader}>
          <div className={styles.headerTitle}>
            <Users size={20} />
            <h2>Messages</h2>
          </div>
        </div>

        <div className={styles.searchContainer}>
          <Search size={16} className={styles.searchIcon} />
          <input
            type="text"
            placeholder="Search conversations..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className={styles.searchInput}
          />
        </div>

        <div className={styles.conversationsList}>
          {filteredConversations.length === 0 ? (
            <div className={styles.emptyConversations}>
              <Users size={32} />
              <p>No conversations yet</p>
              <small>Messaging feature is being set up</small>
            </div>
          ) : (
            filteredConversations.map(conversation => (
              <div
                key={conversation.user.id}
                className={`${styles.conversationItem} ${
                  selectedConversation?.user.id === conversation.user.id ? styles.active : ''
                }`}
                onClick={() => handleSelectConversation(conversation)}
              >
                <div className={styles.avatar}>
                  {conversation.user.avatar_url ? (
                    <img src={conversation.user.avatar_url} alt="Avatar" />
                  ) : (
                    <span>{getInitials(conversation.user.first_name, conversation.user.last_name)}</span>
                  )}
                  <div className={`${styles.onlineStatus} ${conversation.user.is_online ? styles.online : styles.offline}`}></div>
                </div>

                <div className={styles.conversationContent}>
                  <div className={styles.conversationHeader}>
                    <h4>{conversation.user.first_name} {conversation.user.last_name}</h4>
                    <span className={styles.role}>{conversation.user.role}</span>
                  </div>
                  {conversation.lastMessage && (
                    <p className={styles.lastMessage}>{conversation.lastMessage.content}</p>
                  )}
                </div>

                {conversation.unreadCount > 0 && (
                  <div className={styles.unreadBadge}>
                    {conversation.unreadCount}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </div>

      {/* Main Chat Area */}
      <div className={styles.chatArea}>
        {selectedConversation ? (
          <>
            {/* Chat Header */}
            <div className={styles.chatHeader}>
              <div className={styles.chatUserInfo}>
                <div className={styles.avatar}>
                  {selectedConversation.user.avatar_url ? (
                    <img src={selectedConversation.user.avatar_url} alt="Avatar" />
                  ) : (
                    <span>{getInitials(selectedConversation.user.first_name, selectedConversation.user.last_name)}</span>
                  )}
                  <div className={`${styles.onlineStatus} ${selectedConversation.user.is_online ? styles.online : styles.offline}`}></div>
                </div>
                <div>
                  <h3>{selectedConversation.user.first_name} {selectedConversation.user.last_name}</h3>
                  <p className={styles.userStatus}>
                    {selectedConversation.user.is_online ? 'Online' : 'Last seen recently'}
                  </p>
                </div>
              </div>

              <div className={styles.chatActions}>
                <button className={styles.actionButton}>
                  <Phone size={18} />
                </button>
                <button className={styles.actionButton}>
                  <Video size={18} />
                </button>
                <button className={styles.actionButton}>
                  <MoreVertical size={18} />
                </button>
              </div>
            </div>

            {/* Messages */}
            <div className={styles.messagesContainer}>
              {messages.length === 0 ? (
                <div className={styles.noMessages}>
                  <p>No messages yet. Start the conversation!</p>
                </div>
              ) : (
                messages.map(message => (
                  <div
                    key={message.id}
                    className={`${styles.messageWrapper} ${
                      message.sender_id === currentUser?.id ? styles.sent : styles.received
                    }`}
                  >
                    <div className={styles.message}>
                      <p>{message.content}</p>
                      <span className={styles.messageTime}>
                        {formatTime(message.created_at)}
                      </span>
                    </div>
                  </div>
                ))
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Message Input */}
            <div className={styles.messageInput}>
              <button className={styles.attachButton}>
                <Paperclip size={18} />
              </button>
              <input
                type="text"
                placeholder="Type a message..."
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                onKeyPress={handleKeyPress}
                className={styles.textInput}
              />
              <button
                className={styles.sendButton}
                onClick={sendMessage}
                disabled={!newMessage.trim()}
              >
                <Send size={18} />
              </button>
            </div>
          </>
        ) : (
          <div className={styles.emptyState}>
            <Users size={64} />
            <h3>Select a conversation</h3>
            <p>Choose a team member to start messaging</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default Messaging;
