// backend/src/socket/index.ts
import { Server as HttpServer } from "http";
import { Server, Socket } from "socket.io";
import { authenticateSocket } from "./auth.js";
import { SocketRoomManager } from "./socketRooms.js";
import { activeConversationTracker } from "./activeConversationTracker.js";

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

  // Map userIds to a Set of socketIds for multi-device presence support
  const activeConnections = new Map<string, Set<string>>();

  // Converted to async to support asynchronous room loading from Prisma
  io.on("connection", async (socket: Socket) => {
    const user = socket.data.user;
    const userId = user?.id;

    console.log(
      `🟢 ${user?.fullName || "Unknown User"} connected: ${socket.id}`,
    );

    // Register runtime event handlers synchronously BEFORE any `await` so events
    // emitted immediately after client `connect` are never dropped.
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

        if (activeConnections.has(userId)) {
          const userConnections = activeConnections.get(userId)!;
          userConnections.delete(socket.id);

          if (userConnections.size === 0) {
            activeConnections.delete(userId);
            io.emit("presence:update", { userId, status: "offline" });
          }
        }
      }
    });

    try {
      // Presence logic: Send existing online users to this newly connected socket
      for (const [onlineUserId, sockets] of activeConnections.entries()) {
        if (sockets.size > 0) {
          socket.emit("presence:update", { userId: onlineUserId, status: "online" });
        }
      }

      if (userId) {
        if (!activeConnections.has(userId)) {
          activeConnections.set(userId, new Set());
          // Broadcast online presence since it's the first connection
          socket.broadcast.emit("presence:update", { userId, status: "online" });
        }
        activeConnections.get(userId)!.add(socket.id);
      }

      // Join personal and conversation rooms
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
