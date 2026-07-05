// backend/src/socket/index.ts
import { Server as HttpServer } from "http";
import { Server, Socket } from "socket.io";
import { authenticateSocket } from "./auth.js";
import { SocketRoomManager } from "./socketRooms.js";

let io: Server;

export function initializeSocket(server: HttpServer): Server {
  io = new Server(server, {
    cors: {
      origin: process.env.FRONTEND_URL || "http://localhost:5173",
      credentials: true,
    },
  });

  io.use(authenticateSocket);

  // Map userIds to a Set of socketIds for multi-device presence support
  const activeConnections = new Map<string, Set<string>>();

  // Converted to async to support asynchronous room loading from Prisma
  io.on("connection", async (socket: Socket) => {
    const user = socket.data.user;
    const userId = user?.id;

    console.log(
      `🟢 ${user?.fullName || "Unknown User"} connected: ${socket.id}`,
    );

    try {
      // 1. Core integration: Join rooms before listening to runtime client events
      await SocketRoomManager.joinUserRooms(socket);

      // Presence logic
      if (userId) {
        if (!activeConnections.has(userId)) {
          activeConnections.set(userId, new Set());
          // Broadcast online presence since it's the first connection
          socket.broadcast.emit("presence:update", { userId, status: "online" });
        }
        activeConnections.get(userId)!.add(socket.id);
      }

      // 2. Runtime Helper Event Handlers
      socket.on("conversation:join", (data: { conversationId: string }) => {
        if (data?.conversationId) {
          SocketRoomManager.joinConversation(socket, data.conversationId);
        }
      });

      socket.on("conversation:leave", (data: { conversationId: string }) => {
        if (data?.conversationId) {
          SocketRoomManager.leaveConversation(socket, data.conversationId);
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

    } catch (error) {
      console.error(
        `❌ [Socket] Error during connection setup for socket ${socket.id}:`,
        error,
      );
    }

    socket.on("disconnect", (reason) => {
      console.log(
        `🔴 ${user?.fullName || "Unknown User"} disconnected: ${socket.id} (${reason})`,
      );

      if (userId && activeConnections.has(userId)) {
        const userConnections = activeConnections.get(userId)!;
        userConnections.delete(socket.id);

        if (userConnections.size === 0) {
          activeConnections.delete(userId);
          io.emit("presence:update", { userId, status: "offline" });
        }
      }
    });
  });

  return io;
}

export function getIO(): Server {
  if (!io) {
    throw new Error("Socket.IO has not been initialized.");
  }

  return io;
}
