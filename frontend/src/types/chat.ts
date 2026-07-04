export interface ChatUser {
  id: string;
  email: string;
  profile: {
    firstName: string;
    lastName: string;
  };
}

export interface ConversationMember {
  id: string;
  conversationId: string;
  userId: string;
  role: 'OWNER' | 'ADMIN' | 'MEMBER';
  joinedAt: string;
  lastReadAt?: string;
  user?: ChatUser;
}

export interface Reaction {
  id: string;
  messageId: string;
  userId: string;
  emoji: string;
  createdAt: string;
  user?: ChatUser;
}

export interface Attachment {
  id: string;
  messageId?: string;
  fileUrl: string;
  fileName: string;
  fileType: string;
  fileSize: number;
  createdAt: string;
}

export interface Message {
  id: string;
  conversationId: string;
  senderId: string;
  content: string;
  type: 'TEXT' | 'FILE' | 'SYSTEM';
  status: 'SENT' | 'DELIVERED' | 'READ' | 'FAILED' | 'SENDING';
  isEdited: boolean;
  isDeleted: boolean;
  metadata?: unknown;
  createdAt: string;
  updatedAt: string;
  sender?: ChatUser;
  reactions: Reaction[];
  attachments: Attachment[];
  clientMsgId?: string; // Used for optimistic UI updates
}

export interface Conversation {
  id: string;
  name?: string;
  type: 'DIRECT' | 'GROUP';
  avatarUrl?: string;
  metadata?: unknown;
  ownerId?: string;
  isArchived: boolean;
  createdAt: string;
  updatedAt: string;
  members: ConversationMember[];
  lastMessage?: Message;
  _count?: {
    messages: number;
    members: number;
  };
}

export interface SendMessageDto {
  content: string;
  type?: 'TEXT' | 'FILE';
  metadata?: unknown;
  attachmentIds?: string[];
}

export interface CreateConversationDto {
  type: 'DIRECT' | 'GROUP';
  name?: string;
  memberIds: string[];
}

export interface UpdateConversationDto {
  name?: string;
  avatarUrl?: string;
  metadata?: unknown;
}
