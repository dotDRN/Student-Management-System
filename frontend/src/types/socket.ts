import type { Conversation, Message } from "./chat";
import type { Notification } from "./notification";

export type MeetingCategory = "standup" | "academic" | "operations" | "lounge";

export interface MeetingMediaState {
  isMuted: boolean;
  isCameraOn: boolean;
  isScreenSharing: boolean;
  isHandRaised: boolean;
  isSpeaking: boolean;
}

export interface MeetingParticipant {
  socketId: string;
  userId: string;
  fullName: string;
  role: string;
  joinedAt: string;
  isRoomAdmin: boolean;
  mediaState: MeetingMediaState;
}

export interface EphemeralChatMessage {
  id: string;
  roomId: string;
  senderId: string;
  senderName: string;
  senderRole: string;
  content: string;
  type: "text" | "system";
  createdAt: string;
}

export interface MeetingRoom {
  id: string;
  tenantId: string;
  name: string;
  category: MeetingCategory;
  centerId: string | null;
  centerName: string | null;
  hostUserId: string;
  hostName: string;
  hostRole: string;
  isLocked: boolean;
  createdAt: string;
  idleExpiresAt: string | null;
  participants: MeetingParticipant[];
}

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

  // Meeting Rooms & Huddles Events
  "meeting:lobby-sync": (data: { rooms: MeetingRoom[] }) => void;
  "meeting:joined": (data: {
    room: MeetingRoom;
    selfSocketId: string;
    chatHistory: EphemeralChatMessage[];
  }) => void;
  "meeting:user-joined": (data: {
    roomId: string;
    participant: MeetingParticipant;
    room: MeetingRoom;
  }) => void;
  "meeting:user-left": (data: {
    roomId: string;
    socketId: string;
    userId: string;
    room: MeetingRoom;
  }) => void;
  "meeting:room-updated": (data: { room: MeetingRoom }) => void;
  "meeting:participant-updated": (data: {
    roomId: string;
    participant: MeetingParticipant;
    room: MeetingRoom;
  }) => void;
  "meeting:ended": (data: {
    roomId: string;
    reason: "host_ended" | "idle_timeout";
    endedBy: string;
  }) => void;
  "meeting:force-muted": (data: {
    roomId: string;
    mutedBy: string;
  }) => void;
  "meeting:kicked": (data: {
    roomId: string;
    kickedBy: string;
  }) => void;
  "meeting:chat-new": (data: EphemeralChatMessage) => void;
  "meeting:reaction": (data: {
    roomId: string;
    socketId: string;
    userId: string;
    fullName: string;
    emoji: string;
  }) => void;
  "meeting:error": (data: { message: string }) => void;
  "meeting:webrtc-offer": (data: {
    roomId: string;
    fromSocketId: string;
    sdp: RTCSessionDescriptionInit;
  }) => void;
  "meeting:webrtc-answer": (data: {
    roomId: string;
    fromSocketId: string;
    sdp: RTCSessionDescriptionInit;
  }) => void;
  "meeting:webrtc-ice": (data: {
    roomId: string;
    fromSocketId: string;
    candidate: RTCIceCandidateInit;
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

  // Meeting Rooms & Huddles Client Events
  "meeting:list": () => void;
  "meeting:create": (data: {
    name: string;
    category?: MeetingCategory;
    centerId?: string | null;
    centerName?: string | null;
    initialMedia?: Partial<MeetingMediaState>;
  }) => void;
  "meeting:join": (data: {
    roomId: string;
    initialMedia?: Partial<MeetingMediaState>;
  }) => void;
  "meeting:leave": (data: { roomId: string }) => void;
  "meeting:end": (data: { roomId: string }) => void;
  "meeting:lock-toggle": (data: { roomId: string }) => void;
  "meeting:media-state": (data: {
    roomId: string;
    patch: Partial<MeetingMediaState>;
  }) => void;
  "meeting:admin-mute": (data: {
    roomId: string;
    targetSocketId: string;
  }) => void;
  "meeting:admin-kick": (data: {
    roomId: string;
    targetSocketId: string;
  }) => void;
  "meeting:chat-send": (data: { roomId: string; content: string }) => void;
  "meeting:reaction": (data: { roomId: string; emoji: string }) => void;
  "meeting:webrtc-offer": (data: {
    roomId: string;
    targetSocketId: string;
    sdp: RTCSessionDescriptionInit;
  }) => void;
  "meeting:webrtc-answer": (data: {
    roomId: string;
    targetSocketId: string;
    sdp: RTCSessionDescriptionInit;
  }) => void;
  "meeting:webrtc-ice": (data: {
    roomId: string;
    targetSocketId: string;
    candidate: RTCIceCandidateInit;
  }) => void;
}
