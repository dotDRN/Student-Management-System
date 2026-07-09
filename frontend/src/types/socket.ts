import type { Conversation, Message } from "./chat";

export interface ServerToClientEvents {
  "message:new": {
    message: Message;
  };

  "message:updated": {
    id: string;
    conversationId: string;
    content: string;
    updatedAt: string;
  };

  "message:deleted": {
    id: string;
    conversationId: string;
  };

  "conversation:new": {
    conversation: Conversation;
  };

  "conversation:read_update": {
    conversationId: string;
    userId: string;
    lastReadAt: string;
  };

  "typing:update": {
    conversationId: string;
    userId: string;
    fullName: string;
    isTyping: boolean;
  };

  "presence:update": {
    userId: string;
    status: "online" | "offline";
  };
}

export interface ClientToServerEvents {
  "typing:start": {
    conversationId: string;
  };

  "typing:stop": {
    conversationId: string;
  };

  "conversation:join": {
    conversationId: string;
  };

  "conversation:leave": {
    conversationId: string;
  };
}