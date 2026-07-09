export type ConversationRole = 'owner' | 'admin' | 'member';
export type ConversationType = 'direct' | 'group' | 'center' | 'activity' | 'batch' | 'program';
export type MessageType = 'text' | 'image' | 'file' | 'audio' | 'system';
export type ReactionType = 'like' | 'love' | 'laugh' | 'wow' | 'sad' | 'angry';

export interface ChatUser {
  id: string;
  email: string;
  fullName: string;
}

export interface ConversationMember {
  id: string;
  conversationId: string;
  userId: string;
  role: ConversationRole;
  joinedAt: string;
  lastReadAt?: string;
  mutedUntil?: string;
  isPinned: boolean;
  isArchived: boolean;
  user?: ChatUser;
}

export interface Reaction {
  id: string;
  messageId: string;
  userId: string;
  reaction: ReactionType;
  createdAt: string;
  user?: ChatUser;
}

export interface Attachment {
  id: string;
  messageId?: string;
  url: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
  createdAt: string;
}

export interface Message {
  id: string;
  conversationId: string;
  senderId: string;
  content?: string;
  type: MessageType;
  replyToId?: string;
  isEdited: boolean;
  isDeleted: boolean;
  createdAt: string;
  updatedAt: string;
  sender?: ChatUser;
  reactions: Reaction[];
  attachments: Attachment[];
  clientMsgId?: string;
  status?: 'sent' | 'delivered' | 'read' | 'failed' | 'sending';
}

export interface Conversation {
  id: string;
  type: ConversationType;
  title?: string;
  description?: string;
  avatarUrl?: string;
  createdBy: string;
  centerId?: string;
  activityId?: string;
  batchId?: string;
  programId?: string;
  isArchived: boolean;
  createdAt: string;
  updatedAt: string;
  members: ConversationMember[];
  messages?: Message[];
  lastMessage?: Message;
  _count?: {
    messages: number;
    members: number;
  };
}

export interface SendMessageDto {
  content?: string;
  type?: MessageType;
  replyToId?: string;
}

export interface CreateConversationDto {
  type: ConversationType;
  title?: string;
  description?: string;
  avatarUrl?: string;
  members: { userId: string; role?: ConversationRole }[];
  centerId?: string;
  activityId?: string;
  batchId?: string;
  programId?: string;
}

export interface UpdateConversationDto {
  title?: string;
  description?: string;
  avatarUrl?: string;
}
