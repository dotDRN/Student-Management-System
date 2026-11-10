// backend/src/socket/socketRooms.ts
import { Socket } from 'socket.io';
import conversationService from '../services/conversation.service.js';
import prisma from '../lib/prisma.js';
import { DEFAULT_TENANT_ID, runWithTenantContext } from '../lib/tenantContext.js';

export class SocketRoomManager {
  /**
   * Room name utility matching the required convention
   */
  public static getRoomName(conversationId: string): string {
    return `conversation:${conversationId}`;
  }

  public static getTenantRoomName(tenantId: string): string {
    return `tenant:${tenantId}`;
  }

  /**
   * Fetches the user's active conversations from Prisma via the conversationService instance
   * (scoped to their tenant) and auto-joins the socket instance into each respective room.
   */
  public static async joinUserRooms(socket: Socket): Promise<void> {
    const userId = socket.data.user?.id;
    const tenantId = socket.data.user?.tenantId || DEFAULT_TENANT_ID;
    const role = socket.data.user?.role;

    if (!userId) {
      console.warn(`⚠️ [Socket] Attempted to join rooms for unauthenticated socket: ${socket.id}`);
      return;
    }

    try {
      // Join the tenant-scoped room and user-scoped room
      socket.join(this.getTenantRoomName(tenantId));
      socket.join(`user:${userId}`);
      console.log(`👤 [Socket] User ${userId} (tenant ${tenantId}) joined personal & tenant rooms.`);

      const conversations = await runWithTenantContext(
        { tenantId, userId, role },
        () => conversationService.getUserConversations(userId),
      );

      if (!conversations || conversations.length === 0) {
        return;
      }

      // Join each conversation room belonging to this tenant
      conversations.forEach((conv: { id: string }) => {
        const roomName = this.getRoomName(conv.id);
        socket.join(roomName);
      });

      console.log(`🔗 [Socket] ${socket.data.user?.fullName || 'User'} auto-joined ${conversations.length} conversation rooms.`);
    } catch (error) {
      console.error(`❌ [Socket] Error joining rooms for user ${userId}:`, error);
    }
  }

  /**
   * For joining a newly created conversation dynamically at runtime (verified against tenant & membership)
   */
  public static async joinConversation(socket: Socket, conversationId: string): Promise<void> {
    const userId = socket.data.user?.id;
    const tenantId = socket.data.user?.tenantId || DEFAULT_TENANT_ID;

    if (!userId || !conversationId) return;

    try {
      const membership = await runWithTenantContext(
        { tenantId, userId, role: socket.data.user?.role },
        () =>
          prisma.conversationMember.findFirst({
            where: {
              conversationId,
              userId,
              conversation: {
                tenantId,
              },
            },
            select: { id: true },
          }),
      );

      if (!membership) {
        console.warn(
          `🚫 [Socket] Blocked cross-tenant or unauthorized room join by user ${userId} for conversation ${conversationId}`,
        );
        return;
      }

      const roomName = this.getRoomName(conversationId);
      socket.join(roomName);
      console.log(`➕ [Socket] Socket ${socket.id} joined room: ${roomName}`);
    } catch (error) {
      console.error(`❌ [Socket] Error verifying room join for conversation ${conversationId}:`, error);
    }
  }

  /**
   * For leaving a conversation dynamically at runtime
   */
  public static leaveConversation(socket: Socket, conversationId: string): void {
    const roomName = this.getRoomName(conversationId);
    socket.leave(roomName);
    console.log(`➖ [Socket] Socket ${socket.id} left room: ${roomName}`);
  }
}
