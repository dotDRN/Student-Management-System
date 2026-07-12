import api from './api';
import type { Conversation, Message, SendMessageDto, CreateConversationDto, UpdateConversationDto } from '../types/chat';

class ChatService {
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
    const response = await api.put(`/chat/conversations/${conversationId}`, data);
    return response.data.data;
  }

  async archiveConversation(conversationId: string): Promise<void> {
    await api.post(`/chat/conversations/${conversationId}/archive`);
  }

  async markAsRead(conversationId: string): Promise<void> {
    await api.post(`/chat/conversations/${conversationId}/read`);
  }

  // --- Members ---
  async addMember(conversationId: string, userId: string, role: string = 'member'): Promise<void> {
    await api.post(`/chat/conversations/${conversationId}/members`, { userId, role });
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

  async removeReaction(messageId: string): Promise<void> {
    await api.delete(`/chat/messages/${messageId}/reactions`);
  }

  // --- Attachments ---
  async uploadAttachment(file: File, onProgress?: (percent: number) => void): Promise<{ id: string; url: string }> {
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
