import { create } from 'zustand';
import type { Message } from '../types/chat';

interface TypingUser {
  userId: string;
  userName: string;
}

interface ChatState {
  activeConversationId: string | null;
  replyingToMessage: Message | null;
  editingMessage: Message | null;
  isSocketConnected: boolean;
  typingUsers: Record<string, TypingUser[]>; // conversationId -> TypingUser[]
  presenceMap: Record<string, 'online' | 'offline'>;

  setActiveConversationId: (id: string | null) => void;
  setReplyingToMessage: (message: Message | null) => void;
  setEditingMessage: (message: Message | null) => void;
  setSocketConnected: (isConnected: boolean) => void;
  
  addTypingUser: (conversationId: string, user: TypingUser) => void;
  removeTypingUser: (conversationId: string, userId: string) => void;
  clearTypingUsers: (conversationId: string) => void;
  
  updatePresence: (userId: string, status: 'online' | 'offline') => void;

  resetChatState: () => void;
}

export const useChatStore = create<ChatState>((set) => ({
  activeConversationId: null,
  replyingToMessage: null,
  editingMessage: null,
  isSocketConnected: false,
  typingUsers: {},
  presenceMap: {},

  setActiveConversationId: (id) => set({ activeConversationId: id, replyingToMessage: null, editingMessage: null }),
  
  setReplyingToMessage: (message) => set({ replyingToMessage: message, editingMessage: null }),
  
  setEditingMessage: (message) => set({ editingMessage: message, replyingToMessage: null }),
  
  setSocketConnected: (isConnected) => set({ isSocketConnected: isConnected }),

  addTypingUser: (conversationId, user) => set((state) => {
    const users = state.typingUsers[conversationId] || [];
    if (users.find(u => u.userId === user.userId)) return state;
    return {
      typingUsers: {
        ...state.typingUsers,
        [conversationId]: [...users, user]
      }
    };
  }),

  removeTypingUser: (conversationId, userId) => set((state) => {
    const users = state.typingUsers[conversationId] || [];
    return {
      typingUsers: {
        ...state.typingUsers,
        [conversationId]: users.filter(u => u.userId !== userId)
      }
    };
  }),

  clearTypingUsers: (conversationId) => set((state) => ({
    typingUsers: {
      ...state.typingUsers,
      [conversationId]: []
    }
  })),

  updatePresence: (userId, status) => set((state) => ({
    presenceMap: {
      ...state.presenceMap,
      [userId]: status
    }
  })),

  resetChatState: () => set({
    activeConversationId: null,
    replyingToMessage: null,
    editingMessage: null,
    typingUsers: {},
    presenceMap: {}
  })
}));
