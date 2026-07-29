import type { Conversation, Message } from "./chat";
import type { Notification } from "./notification";

export interface ServerToClientEvents {
  "notification:new": (data: Omit<Notification, 'isRead' | 'readAt'>) => void;

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
