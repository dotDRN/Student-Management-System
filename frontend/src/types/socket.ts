import type { Conversation, Message } from "./chat";
import type { Notification } from "./notification";

export interface ServerToClientEvents {
  "notification:new": (data: Omit<Notification, 'isRead' | 'readAt'>) => void;

  "notification:read": (data: {
    notificationRecipientId: string;
  }) => void;

  "notification:read_all": () => void;

  "notification:conversation_read": (data: {
    conversationId: string;
    notificationRecipientIds: string[];
    unreadCount: number;
  }) => void;

  "notification:archived": (data: {
    notificationRecipientId: string;
    unreadCount: number;
  }) => void;

  "message:new": (data: { message: Message }) => void;

  "message:updated": (data: {
    id: string;
    conversationId: string;
    content: string;
    updatedAt: string;
  }) => void;

  "message:deleted": (data: {
    id: string;
    conversationId: string;
  }) => void;

  "message:reaction_updated": (data: {
    messageId: string;
    conversationId: string;
    reactions: unknown[];
  }) => void;

  "conversation:new": (data: {
    conversation: Conversation;
  }) => void;

  "conversation:updated": (data: {
    conversation: Partial<Conversation> & { id: string };
  }) => void;

  "conversation:archived": (data: {
    conversationId: string;
  }) => void;

  "conversation:member_removed": (data: {
    conversationId: string;
    userId: string;
  }) => void;

  "conversation:read_update": (data: {
    conversationId: string;
    userId: string;
    lastReadAt: string;
  }) => void;

  "typing:update": (data: {
    conversationId: string;
    userId: string;
    fullName: string;
    isTyping: boolean;
  }) => void;

  "presence:update": (data: {
    userId: string;
    status: "online" | "offline";
  }) => void;
}

export interface ClientToServerEvents {
  "typing:start": (data: {
    conversationId: string;
  }) => void;

  "typing:stop": (data: {
    conversationId: string;
  }) => void;

  "conversation:join": (data: {
    conversationId: string;
  }) => void;

  "conversation:leave": (data: {
    conversationId: string;
  }) => void;

  "conversation:focus": (data: {
    conversationId: string;
  }) => void;

  "conversation:blur": () => void;
}
