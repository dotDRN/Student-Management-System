import api from './api';
import type {
  Conversation,
  ConversationMember,
  Message,
  SendMessageDto,
  CreateConversationDto,
  UpdateConversationDto,
  UploadedAttachmentDto,
} from '../types/chat';
import type { UsersListResponse } from './users.service';

class ChatService {
  // --- Users Directory for Chat ---
  async searchUsers(params?: { search?: string; limit?: number }): Promise<UsersListResponse> {
    const response = await api.get<UsersListResponse>('/chat/conversations/users', { params });
    return response.data;
  }

  // --- Conversations ---
  async getUserConversations(): Promise<Conversation[]> {
    const response = await api.get('/chat/conversations');
    return response.data.data;
  }

  async getConversationById(conversationId: string): Promise<Conversation> {
    const response = await api.get(`/chat/conversations/${conversationId}`);
    return response.data.data;
  }

  async createConversation(data: CreateConversationDto): Promise<Conversation> {
    const response = await api.post('/chat/conversations', data);
    return response.data.data;
  }

  async updateConversation(conversationId: string, data: UpdateConversationDto): Promise<Conversation> {
    const response = await api.patch(`/chat/conversations/${conversationId}`, data);
    return response.data.data;
  }

  async archiveConversation(conversationId: string): Promise<void> {
    await api.patch(`/chat/conversations/${conversationId}/archive`);
  }

  async markAsRead(conversationId: string): Promise<void> {
    await api.patch(`/chat/conversations/${conversationId}/read`);
  }

  // --- Members ---
  async getConversationMembers(conversationId: string): Promise<ConversationMember[]> {
    const response = await api.get(`/chat/conversations/${conversationId}/members`);
    return response.data.data;
  }

  async addMember(conversationId: string, userId: string, role: string = 'member'): Promise<ConversationMember> {
    const response = await api.post(`/chat/conversations/${conversationId}/members`, { userId, role });
    return response.data.data;
  }

  async removeMember(conversationId: string, memberId: string): Promise<void> {
    await api.delete(`/chat/conversations/${conversationId}/members/${memberId}`);
  }

  // --- Messages ---
  async getMessages(conversationId: string, cursor?: string): Promise<Message[]> {
    const params = cursor ? { cursor } : {};
    const response = await api.get(`/chat/conversations/${conversationId}/messages`, { params });
    return response.data.data;
  }

  async searchMessages(conversationId: string, query: string): Promise<Message[]> {
    const response = await api.get(`/chat/conversations/${conversationId}/messages/search`, {
      params: { q: query },
    });
    return response.data.data;
  }

  async sendMessage(conversationId: string, data: SendMessageDto): Promise<Message> {
    const response = await api.post(`/chat/conversations/${conversationId}/messages`, data);
    return response.data.data;
  }

  async editMessage(messageId: string, content: string): Promise<Message> {
    const response = await api.patch(`/chat/messages/${messageId}`, { content });
    return response.data.data;
  }

  async deleteMessage(messageId: string): Promise<void> {
    await api.delete(`/chat/messages/${messageId}`);
  }

  // --- Reactions ---
  async addReaction(messageId: string, reaction: string): Promise<void> {
    await api.post(`/chat/messages/${messageId}/reactions`, { reaction });
  }

  async removeReaction(messageId: string, reaction?: string): Promise<void> {
    await api.delete(`/chat/messages/${messageId}/reactions`, {
      params: reaction ? { reaction } : undefined,
    });
  }

  // --- Attachments ---
  async uploadAttachment(
    file: File,
    onProgress?: (percent: number) => void,
  ): Promise<UploadedAttachmentDto> {
    const formData = new FormData();
    formData.append('file', file);

    const response = await api.post('/chat/attachments', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
      onUploadProgress: (progressEvent) => {
        if (progressEvent.total && onProgress) {
          const percentCompleted = Math.round((progressEvent.loaded * 100) / progressEvent.total);
          onProgress(percentCompleted);
        }
      },
    });
    return response.data.data;
  }
}

export const chatService = new ChatService();
