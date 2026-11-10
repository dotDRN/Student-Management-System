// backend/src/socket/index.ts
import { Server as HttpServer } from "http";
import { Server, Socket } from "socket.io";
import { authenticateSocket } from "./auth.js";
import { SocketRoomManager } from "./socketRooms.js";
import { activeConversationTracker } from "./activeConversationTracker.js";
import { DEFAULT_TENANT_ID } from "../lib/tenantContext.js";

let io: Server;

export function initializeSocket(server: HttpServer): Server {
  const allowedOrigin = process.env.FRONTEND_URL || process.env.CLIENT_URL;

  io = new Server(server, {
    cors: {
      origin: (origin, callback) => {
        if (
          !origin ||
          process.env.NODE_ENV === "production" ||
          origin.startsWith("http://localhost:") ||
          (allowedOrigin && origin === allowedOrigin)
        ) {
          callback(null, true);
        } else {
          callback(new Error("Not allowed by Socket.IO CORS"));
        }
      },
      credentials: true,
    },
  });

  io.use(authenticateSocket);

  // Map tenantId -> (userId -> Set of socketIds) for tenant-isolated presence support
  const tenantConnections = new Map<string, Map<string, Set<string>>>();

  io.on("connection", async (socket: Socket) => {
    const user = socket.data.user;
    const userId = user?.id;
    const tenantId = user?.tenantId || DEFAULT_TENANT_ID;
    const tenantRoom = SocketRoomManager.getTenantRoomName(tenantId);

    console.log(
      `🟢 ${user?.fullName || "Unknown User"} (tenant: ${tenantId}) connected: ${socket.id}`,
    );

    socket.on("conversation:join", (data: { conversationId: string }) => {
      if (data?.conversationId) {
        void SocketRoomManager.joinConversation(socket, data.conversationId);
      }
    });

    socket.on("conversation:leave", (data: { conversationId: string }) => {
      if (data?.conversationId) {
        SocketRoomManager.leaveConversation(socket, data.conversationId);
      }
    });

    socket.on("conversation:focus", async (data: { conversationId: string }) => {
      if (data?.conversationId && userId) {
        try {
          await activeConversationTracker.focusConversation(userId, data.conversationId, socket.id);
        } catch (err) {
          console.error(err);
        }
      }
    });

    socket.on("conversation:blur", async () => {
      if (userId) {
        try {
          await activeConversationTracker.blurConversation(userId, socket.id);
        } catch (err) {
          console.error(err);
        }
      }
    });

    socket.on("typing:start", (data: { conversationId: string }) => {
      if (data?.conversationId && userId) {
        const room = SocketRoomManager.getRoomName(data.conversationId);
        socket.to(room).emit("typing:update", {
          conversationId: data.conversationId,
          userId,
          fullName: user.fullName,
          isTyping: true,
        });
      }
    });

    socket.on("typing:stop", (data: { conversationId: string }) => {
      if (data?.conversationId && userId) {
        const room = SocketRoomManager.getRoomName(data.conversationId);
        socket.to(room).emit("typing:update", {
          conversationId: data.conversationId,
          userId,
          fullName: user.fullName,
          isTyping: false,
        });
      }
    });

    socket.on("disconnect", (reason) => {
      console.log(
        `🔴 ${user?.fullName || "Unknown User"} disconnected: ${socket.id} (${reason})`,
      );

      if (userId) {
        activeConversationTracker.blurConversation(userId, socket.id).catch(console.error);

        const activeInTenant = tenantConnections.get(tenantId);
        if (activeInTenant?.has(userId)) {
          const userConnections = activeInTenant.get(userId)!;
          userConnections.delete(socket.id);

          if (userConnections.size === 0) {
            activeInTenant.delete(userId);
            io.to(tenantRoom).emit("presence:update", { userId, status: "offline" });
          }
          if (activeInTenant.size === 0) {
            tenantConnections.delete(tenantId);
          }
        }
      }
    });

    try {
      if (!tenantConnections.has(tenantId)) {
        tenantConnections.set(tenantId, new Map());
      }
      const activeInTenant = tenantConnections.get(tenantId)!;

      // Presence logic: Send existing online users in THIS tenant only to the newly connected socket
      for (const [onlineUserId, sockets] of activeInTenant.entries()) {
        if (sockets.size > 0) {
          socket.emit("presence:update", { userId: onlineUserId, status: "online" });
        }
      }

      if (userId) {
        if (!activeInTenant.has(userId)) {
          activeInTenant.set(userId, new Set());
          // Broadcast online presence only to sockets in the same tenant
          socket.to(tenantRoom).emit("presence:update", { userId, status: "online" });
        }
        activeInTenant.get(userId)!.add(socket.id);
      }

      // Join personal, tenant, and conversation rooms
      await SocketRoomManager.joinUserRooms(socket);
    } catch (error) {
      console.error(
        `❌ [Socket] Error during connection setup for socket ${socket.id}:`,
        error,
      );
    }
  });

  return io;
}

export function getIO(): Server {
  if (!io) {
    throw new Error("Socket.IO has not been initialized.");
  }

  return io;
}
