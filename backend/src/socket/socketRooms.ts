// backend/src/socket/socketRooms.ts
import { Socket } from 'socket.io';
// Import the singleton instance directly as the default export
import conversationService from '../services/conversation.service.js';

export class SocketRoomManager {
  /**
   * Room name utility matching the required convention
   */
  public static getRoomName(conversationId: string): string {
    return `conversation:${conversationId}`;
  }

  /**
   * Fetches the user's active conversations from Prisma via the conversationService instance
   * and auto-joins the socket instance into each respective room.
   */
  public static async joinUserRooms(socket: Socket): Promise<void> {
    const userId = socket.data.user?.id;

    if (!userId) {
      console.warn(`⚠️ [Socket] Attempted to join rooms for unauthenticated socket: ${socket.id}`);
      return;
    }

    try {
      // Join the user-scoped room for targeted real-time events (invites, cross-device sync)
      socket.join(`user:${userId}`);
      console.log(`👤 [Socket] User ${userId} joined their personal room.`);

      // Call the method directly on the imported singleton instance
      const conversations = await conversationService.getUserConversations(userId);

      if (!conversations || conversations.length === 0) {
        return;
      }

      // Join each conversation room
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
   * For joining a newly created conversation dynamically at runtime
   */
  public static joinConversation(socket: Socket, conversationId: string): void {
    const roomName = this.getRoomName(conversationId);
    socket.join(roomName);
    console.log(`➕ [Socket] Socket ${socket.id} manually joined room: ${roomName}`);
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