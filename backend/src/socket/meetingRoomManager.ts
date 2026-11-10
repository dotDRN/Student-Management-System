// backend/src/socket/meetingRoomManager.ts
import crypto from "crypto";

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

export interface SerializedMeetingRoom {
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

export interface SocketUserContext {
  id: string;
  tenantId: string;
  fullName: string;
  email: string;
  role: string;
  centerIds: string[];
}

interface InternalMeetingRoom {
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
  idleTimer: ReturnType<typeof setTimeout> | null;
  participants: Map<string, MeetingParticipant>;
  chatMessages: EphemeralChatMessage[];
}

export const EMPLOYEE_ROLES = new Set([
  "super_admin",
  "center_admin",
  "tech_admin",
  "supervisor",
  "teacher",
  "staff",
]);

export const ORG_ADMIN_ROLES = new Set([
  "super_admin",
  "center_admin",
  "tech_admin",
]);

export const DEFAULT_IDLE_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

export class MeetingRoomManager {
  // tenantId -> (roomId -> InternalMeetingRoom)
  private tenantRooms = new Map<string, Map<string, InternalMeetingRoom>>();
  private idleTimeoutMs: number;

  constructor(idleTimeoutMs: number = DEFAULT_IDLE_TIMEOUT_MS) {
    this.idleTimeoutMs = idleTimeoutMs;
  }

  public isEmployee(role?: string): boolean {
    return Boolean(role && EMPLOYEE_ROLES.has(role));
  }

  public isRoomAdmin(user: SocketUserContext, room: InternalMeetingRoom): boolean {
    return room.hostUserId === user.id || ORG_ADMIN_ROLES.has(user.role);
  }

  public canAccessRoom(user: SocketUserContext, room: InternalMeetingRoom): boolean {
    if (!this.isEmployee(user.role)) return false;
    if (user.tenantId !== room.tenantId) return false;

    // Global workspace room
    if (!room.centerId) return true;

    // Super admins and tech admins have cross-center visibility
    if (user.role === "super_admin" || user.role === "tech_admin") return true;

    return Array.isArray(user.centerIds) && user.centerIds.includes(room.centerId);
  }

  public serializeRoom(room: InternalMeetingRoom): SerializedMeetingRoom {
    const participants = Array.from(room.participants.values()).sort((a, b) => {
      // Sort raised hands first, then room admin, then join time
      if (a.mediaState.isHandRaised !== b.mediaState.isHandRaised) {
        return a.mediaState.isHandRaised ? -1 : 1;
      }
      if (a.isRoomAdmin !== b.isRoomAdmin) {
        return a.isRoomAdmin ? -1 : 1;
      }
      return a.joinedAt.localeCompare(b.joinedAt);
    });

    return {
      id: room.id,
      tenantId: room.tenantId,
      name: room.name,
      category: room.category,
      centerId: room.centerId,
      centerName: room.centerName,
      hostUserId: room.hostUserId,
      hostName: room.hostName,
      hostRole: room.hostRole,
      isLocked: room.isLocked,
      createdAt: room.createdAt,
      idleExpiresAt: room.idleExpiresAt,
      participants,
    };
  }

  public listRoomsForUser(user: SocketUserContext): SerializedMeetingRoom[] {
    if (!this.isEmployee(user.role)) return [];
    const roomsMap = this.tenantRooms.get(user.tenantId);
    if (!roomsMap) return [];

    const visible: SerializedMeetingRoom[] = [];
    for (const room of roomsMap.values()) {
      if (this.canAccessRoom(user, room)) {
        visible.push(this.serializeRoom(room));
      }
    }

    return visible.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  public createRoom(
    user: SocketUserContext,
    payload: {
      name: string;
      category?: MeetingCategory;
      centerId?: string | null;
      centerName?: string | null;
    },
    onAutoExpire: (roomId: string, tenantId: string) => void,
  ): SerializedMeetingRoom {
    if (!this.isEmployee(user.role)) {
      throw new Error("Only staff and administrators can create meeting rooms.");
    }

    const trimmedName = payload.name?.trim();
    if (!trimmedName || trimmedName.length < 2) {
      throw new Error("Room name must be at least 2 characters.");
    }

    if (!this.tenantRooms.has(user.tenantId)) {
      this.tenantRooms.set(user.tenantId, new Map());
    }

    const roomId = crypto.randomUUID();
    const now = new Date().toISOString();

    const room: InternalMeetingRoom = {
      id: roomId,
      tenantId: user.tenantId,
      name: trimmedName.slice(0, 80),
      category: payload.category || "standup",
      centerId: payload.centerId || null,
      centerName: payload.centerName || null,
      hostUserId: user.id,
      hostName: user.fullName || "Staff Host",
      hostRole: user.role,
      isLocked: false,
      createdAt: now,
      idleExpiresAt: null,
      idleTimer: null,
      participants: new Map(),
      chatMessages: [
        {
          id: crypto.randomUUID(),
          roomId,
          senderId: "system",
          senderName: "System",
          senderRole: "system",
          content: `Room "${trimmedName}" started by ${user.fullName}. Chat is ephemeral and will be erased when the meeting ends.`,
          type: "system",
          createdAt: now,
        },
      ],
    };

    // Start initial idle timer until the first participant joins
    this.startIdleTimer(room, onAutoExpire);

    this.tenantRooms.get(user.tenantId)!.set(roomId, room);
    return this.serializeRoom(room);
  }

  public joinRoom(
    socketId: string,
    user: SocketUserContext,
    roomId: string,
    initialMedia: Partial<MeetingMediaState> | undefined,
    onAutoExpire: (roomId: string, tenantId: string) => void,
  ): {
    room: SerializedMeetingRoom;
    participant: MeetingParticipant;
    chatHistory: EphemeralChatMessage[];
  } {
    const room = this.getRoomOrThrow(user.tenantId, roomId);

    if (!this.canAccessRoom(user, room)) {
      throw new Error("You do not have permission to join this meeting room.");
    }

    const isAdmin = this.isRoomAdmin(user, room);
    if (room.isLocked && !isAdmin && !room.participants.has(socketId)) {
      throw new Error("This room is currently locked by the Room Admin.");
    }

    // Leave any other room in this tenant first for this socket
    const tenantMap = this.tenantRooms.get(user.tenantId);
    if (tenantMap) {
      for (const existingRoom of tenantMap.values()) {
        if (existingRoom.id !== roomId && existingRoom.participants.has(socketId)) {
          this.leaveRoom(socketId, user.tenantId, existingRoom.id, onAutoExpire);
        }
      }
    }

    // Clear idle expiration timer since someone is now in the room
    this.clearIdleTimer(room);

    const participant: MeetingParticipant = {
      socketId,
      userId: user.id,
      fullName: user.fullName || "Staff Member",
      role: user.role,
      joinedAt: new Date().toISOString(),
      isRoomAdmin: isAdmin,
      mediaState: {
        isMuted: initialMedia?.isMuted ?? false,
        isCameraOn: initialMedia?.isCameraOn ?? false,
        isScreenSharing: false,
        isHandRaised: false,
        isSpeaking: false,
      },
    };

    const isNewJoin = !room.participants.has(socketId);
    room.participants.set(socketId, participant);

    if (isNewJoin) {
      this.pushSystemMessage(room, `${participant.fullName} joined the room.`);
    }

    return {
      room: this.serializeRoom(room),
      participant,
      chatHistory: [...room.chatMessages],
    };
  }

  public leaveRoom(
    socketId: string,
    tenantId: string,
    roomId: string,
    onAutoExpire: (roomId: string, tenantId: string) => void,
  ): {
    room: SerializedMeetingRoom | null;
    leftParticipant: MeetingParticipant | null;
  } {
    const roomsMap = this.tenantRooms.get(tenantId);
    const room = roomsMap?.get(roomId);
    if (!room) {
      return { room: null, leftParticipant: null };
    }

    const leftParticipant = room.participants.get(socketId) || null;
    if (!leftParticipant) {
      return { room: this.serializeRoom(room), leftParticipant: null };
    }

    room.participants.delete(socketId);
    this.pushSystemMessage(room, `${leftParticipant.fullName} left the room.`);

    // If room is now empty, start the idle grace period timer
    if (room.participants.size === 0) {
      this.startIdleTimer(room, onAutoExpire);
    }

    return {
      room: this.serializeRoom(room),
      leftParticipant,
    };
  }

  public endRoom(
    user: SocketUserContext,
    roomId: string,
  ): {
    endedRoomId: string;
    participantSocketIds: string[];
  } {
    const room = this.getRoomOrThrow(user.tenantId, roomId);

    if (!this.isRoomAdmin(user, room)) {
      throw new Error("Only the Room Admin or an Organization Admin can end this meeting.");
    }

    const participantSocketIds = Array.from(room.participants.keys());
    this.destroyRoom(room);

    return {
      endedRoomId: roomId,
      participantSocketIds,
    };
  }

  public toggleLock(
    user: SocketUserContext,
    roomId: string,
  ): { room: SerializedMeetingRoom; systemMessage: EphemeralChatMessage } {
    const room = this.getRoomOrThrow(user.tenantId, roomId);

    if (!this.isRoomAdmin(user, room)) {
      throw new Error("Only the Room Admin can lock or unlock this room.");
    }

    room.isLocked = !room.isLocked;
    const msg = this.pushSystemMessage(
      room,
      room.isLocked
        ? `🔒 Room locked by ${user.fullName}. New participants cannot join.`
        : `🔓 Room unlocked by ${user.fullName}.`,
    );

    return {
      room: this.serializeRoom(room),
      systemMessage: msg,
    };
  }

  public updateMediaState(
    socketId: string,
    tenantId: string,
    roomId: string,
    patch: Partial<MeetingMediaState>,
  ): { room: SerializedMeetingRoom; participant: MeetingParticipant } {
    const room = this.getRoomOrThrow(tenantId, roomId);
    const participant = room.participants.get(socketId);
    if (!participant) {
      throw new Error("Participant is not in this room.");
    }

    participant.mediaState = {
      ...participant.mediaState,
      ...patch,
    };

    return {
      room: this.serializeRoom(room),
      participant,
    };
  }

  public adminMuteParticipant(
    adminUser: SocketUserContext,
    roomId: string,
    targetSocketId: string,
  ): {
    room: SerializedMeetingRoom;
    targetParticipant: MeetingParticipant;
    systemMessage: EphemeralChatMessage;
  } {
    const room = this.getRoomOrThrow(adminUser.tenantId, roomId);
    if (!this.isRoomAdmin(adminUser, room)) {
      throw new Error("Only the Room Admin can mute participants.");
    }

    const target = room.participants.get(targetSocketId);
    if (!target) {
      throw new Error("Target participant not found in room.");
    }

    target.mediaState.isMuted = true;
    target.mediaState.isSpeaking = false;

    const systemMessage = this.pushSystemMessage(
      room,
      `${target.fullName} was muted by Room Admin (${adminUser.fullName}).`,
    );

    return {
      room: this.serializeRoom(room),
      targetParticipant: target,
      systemMessage,
    };
  }

  public adminKickParticipant(
    adminUser: SocketUserContext,
    roomId: string,
    targetSocketId: string,
    onAutoExpire: (roomId: string, tenantId: string) => void,
  ): {
    room: SerializedMeetingRoom;
    kickedParticipant: MeetingParticipant;
    systemMessage: EphemeralChatMessage;
  } {
    const room = this.getRoomOrThrow(adminUser.tenantId, roomId);
    if (!this.isRoomAdmin(adminUser, room)) {
      throw new Error("Only the Room Admin can remove participants.");
    }

    const target = room.participants.get(targetSocketId);
    if (!target) {
      throw new Error("Target participant not found in room.");
    }

    room.participants.delete(targetSocketId);
    const systemMessage = this.pushSystemMessage(
      room,
      `${target.fullName} was removed from the room by ${adminUser.fullName}.`,
    );

    if (room.participants.size === 0) {
      this.startIdleTimer(room, onAutoExpire);
    }

    return {
      room: this.serializeRoom(room),
      kickedParticipant: target,
      systemMessage,
    };
  }

  public appendChatMessage(
    socketId: string,
    user: SocketUserContext,
    roomId: string,
    content: string,
  ): EphemeralChatMessage {
    const room = this.getRoomOrThrow(user.tenantId, roomId);
    if (!room.participants.has(socketId)) {
      throw new Error("You must join the room to send chat messages.");
    }

    const trimmed = content?.trim();
    if (!trimmed) {
      throw new Error("Message cannot be empty.");
    }

    const message: EphemeralChatMessage = {
      id: crypto.randomUUID(),
      roomId,
      senderId: user.id,
      senderName: user.fullName || "Staff Member",
      senderRole: user.role,
      content: trimmed.slice(0, 1000),
      type: "text",
      createdAt: new Date().toISOString(),
    };

    room.chatMessages.push(message);
    if (room.chatMessages.length > 200) {
      room.chatMessages.shift();
    }

    return message;
  }

  public handleSocketDisconnect(
    socketId: string,
    tenantId: string,
    onAutoExpire: (roomId: string, tenantId: string) => void,
  ): Array<{
    roomId: string;
    room: SerializedMeetingRoom;
    leftParticipant: MeetingParticipant;
  }> {
    const roomsMap = this.tenantRooms.get(tenantId);
    if (!roomsMap) return [];

    const affected: Array<{
      roomId: string;
      room: SerializedMeetingRoom;
      leftParticipant: MeetingParticipant;
    }> = [];

    for (const room of roomsMap.values()) {
      if (room.participants.has(socketId)) {
        const res = this.leaveRoom(socketId, tenantId, room.id, onAutoExpire);
        if (res.room && res.leftParticipant) {
          affected.push({
            roomId: room.id,
            room: res.room,
            leftParticipant: res.leftParticipant,
          });
        }
      }
    }

    return affected;
  }

  public hasRoom(tenantId: string, roomId: string): boolean {
    return Boolean(this.tenantRooms.get(tenantId)?.has(roomId));
  }

  public isSocketInRoom(tenantId: string, roomId: string, socketId: string): boolean {
    const room = this.tenantRooms.get(tenantId)?.get(roomId);
    return Boolean(room?.participants.has(socketId));
  }

  private getRoomOrThrow(tenantId: string, roomId: string): InternalMeetingRoom {
    const room = this.tenantRooms.get(tenantId)?.get(roomId);
    if (!room) {
      throw new Error("Meeting room no longer exists or has ended.");
    }
    return room;
  }

  private pushSystemMessage(room: InternalMeetingRoom, content: string): EphemeralChatMessage {
    const msg: EphemeralChatMessage = {
      id: crypto.randomUUID(),
      roomId: room.id,
      senderId: "system",
      senderName: "System",
      senderRole: "system",
      content,
      type: "system",
      createdAt: new Date().toISOString(),
    };
    room.chatMessages.push(msg);
    if (room.chatMessages.length > 200) {
      room.chatMessages.shift();
    }
    return msg;
  }

  private startIdleTimer(
    room: InternalMeetingRoom,
    onAutoExpire: (roomId: string, tenantId: string) => void,
  ): void {
    this.clearIdleTimer(room);
    room.idleExpiresAt = new Date(Date.now() + this.idleTimeoutMs).toISOString();
    room.idleTimer = setTimeout(() => {
      if (room.participants.size === 0) {
        const { id, tenantId } = room;
        this.destroyRoom(room);
        onAutoExpire(id, tenantId);
      }
    }, this.idleTimeoutMs);
    // Avoid keeping Node.js process alive in unit tests
    if (typeof room.idleTimer.unref === "function") {
      room.idleTimer.unref();
    }
  }

  private clearIdleTimer(room: InternalMeetingRoom): void {
    if (room.idleTimer) {
      clearTimeout(room.idleTimer);
      room.idleTimer = null;
    }
    room.idleExpiresAt = null;
  }

  private destroyRoom(room: InternalMeetingRoom): void {
    this.clearIdleTimer(room);
    room.chatMessages.length = 0; // Explicitly wipe ephemeral chat buffer
    room.participants.clear();
    const tenantMap = this.tenantRooms.get(room.tenantId);
    if (tenantMap) {
      tenantMap.delete(room.id);
      if (tenantMap.size === 0) {
        this.tenantRooms.delete(room.tenantId);
      }
    }
  }
}

export const meetingRoomManager = new MeetingRoomManager();
