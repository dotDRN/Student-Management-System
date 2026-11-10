// backend/src/socket/index.ts
import { Server as HttpServer } from "http";
import { Server, Socket } from "socket.io";
import { authenticateSocket } from "./auth.js";
import { SocketRoomManager } from "./socketRooms.js";
import { activeConversationTracker } from "./activeConversationTracker.js";
import { DEFAULT_TENANT_ID } from "../lib/tenantContext.js";
import {
  meetingRoomManager,
  type MeetingCategory,
  type MeetingMediaState,
  type SocketUserContext,
} from "./meetingRoomManager.js";

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

  const getMeetingSocketRoom = (roomId: string) => `meeting:${roomId}`;

  const broadcastTenantLobby = async (tenantId: string) => {
    try {
      const tenantRoom = SocketRoomManager.getTenantRoomName(tenantId);
      const sockets = await io.in(tenantRoom).fetchSockets();
      for (const s of sockets) {
        const sUser = s.data.user as SocketUserContext | undefined;
        if (sUser && meetingRoomManager.isEmployee(sUser.role)) {
          s.emit("meeting:lobby-sync", {
            rooms: meetingRoomManager.listRoomsForUser(sUser),
          });
        }
      }
    } catch (err) {
      console.error("❌ [Meeting] Error broadcasting lobby sync:", err);
    }
  };

  const handleRoomAutoExpire = (expiredRoomId: string, expiredTenantId: string) => {
    const meetingSocketRoom = getMeetingSocketRoom(expiredRoomId);
    io.to(meetingSocketRoom).emit("meeting:ended", {
      roomId: expiredRoomId,
      reason: "idle_timeout",
      endedBy: "System (Inactivity Timeout)",
    });
    io.in(meetingSocketRoom).socketsLeave(meetingSocketRoom);
    void broadcastTenantLobby(expiredTenantId);
  };

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

    // =========================================================================
    // EDUSPACE STAFF HUDDLES & MEETING ROOMS (Voice / Video / Screen / Chat)
    // =========================================================================
    const socketUser: SocketUserContext = {
      id: userId,
      tenantId,
      fullName: user?.fullName || "Staff Member",
      email: user?.email || "",
      role: user?.role || "student",
      centerIds: Array.isArray(user?.centerIds) ? user.centerIds : [],
    };

    socket.on("meeting:list", () => {
      socket.emit("meeting:lobby-sync", {
        rooms: meetingRoomManager.listRoomsForUser(socketUser),
      });
    });

    socket.on(
      "meeting:create",
      (data: {
        name: string;
        category?: MeetingCategory;
        centerId?: string | null;
        centerName?: string | null;
        initialMedia?: Partial<MeetingMediaState>;
      }) => {
        try {
          const created = meetingRoomManager.createRoom(
            socketUser,
            {
              name: data?.name,
              category: data?.category,
              centerId: data?.centerId,
              centerName: data?.centerName,
            },
            handleRoomAutoExpire,
          );

          // Automatically join creator into the newly created room
          const joined = meetingRoomManager.joinRoom(
            socket.id,
            socketUser,
            created.id,
            data?.initialMedia,
            handleRoomAutoExpire,
          );

          const meetingRoomName = getMeetingSocketRoom(created.id);
          socket.join(meetingRoomName);

          socket.emit("meeting:joined", {
            room: joined.room,
            selfSocketId: socket.id,
            chatHistory: joined.chatHistory,
          });

          void broadcastTenantLobby(tenantId);
        } catch (err) {
          socket.emit("meeting:error", {
            message: err instanceof Error ? err.message : "Failed to create meeting room.",
          });
        }
      },
    );

    socket.on(
      "meeting:join",
      (data: { roomId: string; initialMedia?: Partial<MeetingMediaState> }) => {
        try {
          if (!data?.roomId) throw new Error("Room ID is required.");
          const joined = meetingRoomManager.joinRoom(
            socket.id,
            socketUser,
            data.roomId,
            data.initialMedia,
            handleRoomAutoExpire,
          );

          const meetingRoomName = getMeetingSocketRoom(data.roomId);
          socket.join(meetingRoomName);

          socket.emit("meeting:joined", {
            room: joined.room,
            selfSocketId: socket.id,
            chatHistory: joined.chatHistory,
          });

          socket.to(meetingRoomName).emit("meeting:user-joined", {
            roomId: data.roomId,
            participant: joined.participant,
            room: joined.room,
          });

          const latestMsg = joined.chatHistory[joined.chatHistory.length - 1];
          if (latestMsg && latestMsg.type === "system") {
            socket.to(meetingRoomName).emit("meeting:chat-new", latestMsg);
          }

          void broadcastTenantLobby(tenantId);
        } catch (err) {
          socket.emit("meeting:error", {
            message: err instanceof Error ? err.message : "Failed to join meeting room.",
          });
        }
      },
    );

    socket.on("meeting:leave", (data: { roomId: string }) => {
      if (!data?.roomId) return;
      const res = meetingRoomManager.leaveRoom(
        socket.id,
        tenantId,
        data.roomId,
        handleRoomAutoExpire,
      );
      const meetingRoomName = getMeetingSocketRoom(data.roomId);
      socket.leave(meetingRoomName);

      if (res.room && res.leftParticipant) {
        io.to(meetingRoomName).emit("meeting:user-left", {
          roomId: data.roomId,
          socketId: socket.id,
          userId: socketUser.id,
          room: res.room,
        });
      }
      void broadcastTenantLobby(tenantId);
    });

    socket.on("meeting:end", (data: { roomId: string }) => {
      try {
        if (!data?.roomId) return;
        meetingRoomManager.endRoom(socketUser, data.roomId);
        const meetingRoomName = getMeetingSocketRoom(data.roomId);

        io.to(meetingRoomName).emit("meeting:ended", {
          roomId: data.roomId,
          reason: "host_ended",
          endedBy: socketUser.fullName,
        });
        io.in(meetingRoomName).socketsLeave(meetingRoomName);
        void broadcastTenantLobby(tenantId);
      } catch (err) {
        socket.emit("meeting:error", {
          message: err instanceof Error ? err.message : "Unable to end meeting.",
        });
      }
    });

    socket.on("meeting:lock-toggle", (data: { roomId: string }) => {
      try {
        if (!data?.roomId) return;
        const { room, systemMessage } = meetingRoomManager.toggleLock(
          socketUser,
          data.roomId,
        );
        const meetingRoomName = getMeetingSocketRoom(data.roomId);
        io.to(meetingRoomName).emit("meeting:room-updated", { room });
        io.to(meetingRoomName).emit("meeting:chat-new", systemMessage);
        void broadcastTenantLobby(tenantId);
      } catch (err) {
        socket.emit("meeting:error", {
          message: err instanceof Error ? err.message : "Unable to toggle room lock.",
        });
      }
    });

    socket.on(
      "meeting:media-state",
      (data: { roomId: string; patch: Partial<MeetingMediaState> }) => {
        try {
          if (!data?.roomId || !data?.patch) return;
          const { room, participant } = meetingRoomManager.updateMediaState(
            socket.id,
            tenantId,
            data.roomId,
            data.patch,
          );
          const meetingRoomName = getMeetingSocketRoom(data.roomId);
          io.to(meetingRoomName).emit("meeting:participant-updated", {
            roomId: data.roomId,
            participant,
            room,
          });
          // If screen share state changed, sync lobby cards so LIVE SCREEN badge updates
          if (typeof data.patch.isScreenSharing === "boolean") {
            void broadcastTenantLobby(tenantId);
          }
        } catch {
          // Ignore stale media-state updates after leaving
        }
      },
    );

    socket.on(
      "meeting:admin-mute",
      (data: { roomId: string; targetSocketId: string }) => {
        try {
          if (!data?.roomId || !data?.targetSocketId) return;
          const { room, targetParticipant, systemMessage } =
            meetingRoomManager.adminMuteParticipant(
              socketUser,
              data.roomId,
              data.targetSocketId,
            );
          const meetingRoomName = getMeetingSocketRoom(data.roomId);
          io.to(data.targetSocketId).emit("meeting:force-muted", {
            roomId: data.roomId,
            mutedBy: socketUser.fullName,
          });
          io.to(meetingRoomName).emit("meeting:participant-updated", {
            roomId: data.roomId,
            participant: targetParticipant,
            room,
          });
          io.to(meetingRoomName).emit("meeting:chat-new", systemMessage);
        } catch (err) {
          socket.emit("meeting:error", {
            message: err instanceof Error ? err.message : "Failed to mute participant.",
          });
        }
      },
    );

    socket.on(
      "meeting:admin-kick",
      (data: { roomId: string; targetSocketId: string }) => {
        try {
          if (!data?.roomId || !data?.targetSocketId) return;
          const { room, kickedParticipant, systemMessage } =
            meetingRoomManager.adminKickParticipant(
              socketUser,
              data.roomId,
              data.targetSocketId,
              handleRoomAutoExpire,
            );
          const meetingRoomName = getMeetingSocketRoom(data.roomId);

          io.to(data.targetSocketId).emit("meeting:kicked", {
            roomId: data.roomId,
            kickedBy: socketUser.fullName,
          });
          io.in(data.targetSocketId).socketsLeave(meetingRoomName);

          io.to(meetingRoomName).emit("meeting:user-left", {
            roomId: data.roomId,
            socketId: kickedParticipant.socketId,
            userId: kickedParticipant.userId,
            room,
          });
          io.to(meetingRoomName).emit("meeting:chat-new", systemMessage);
          void broadcastTenantLobby(tenantId);
        } catch (err) {
          socket.emit("meeting:error", {
            message: err instanceof Error ? err.message : "Failed to remove participant.",
          });
        }
      },
    );

    socket.on("meeting:chat-send", (data: { roomId: string; content: string }) => {
      try {
        if (!data?.roomId || !data?.content) return;
        const message = meetingRoomManager.appendChatMessage(
          socket.id,
          socketUser,
          data.roomId,
          data.content,
        );
        const meetingRoomName = getMeetingSocketRoom(data.roomId);
        io.to(meetingRoomName).emit("meeting:chat-new", message);
      } catch (err) {
        socket.emit("meeting:error", {
          message: err instanceof Error ? err.message : "Failed to send message.",
        });
      }
    });

    socket.on("meeting:reaction", (data: { roomId: string; emoji: string }) => {
      if (!data?.roomId || !data?.emoji) return;
      if (!meetingRoomManager.isSocketInRoom(tenantId, data.roomId, socket.id)) return;
      const meetingRoomName = getMeetingSocketRoom(data.roomId);
      io.to(meetingRoomName).emit("meeting:reaction", {
        roomId: data.roomId,
        socketId: socket.id,
        userId: socketUser.id,
        fullName: socketUser.fullName,
        emoji: data.emoji.slice(0, 8),
      });
    });

    // WebRTC Peer-to-Peer Signaling Relay (Offer / Answer / ICE Candidate)
    socket.on(
      "meeting:webrtc-offer",
      (data: { roomId: string; targetSocketId: string; sdp: unknown }) => {
        if (!data?.roomId || !data?.targetSocketId || !data?.sdp) return;
        if (!meetingRoomManager.isSocketInRoom(tenantId, data.roomId, socket.id)) return;
        io.to(data.targetSocketId).emit("meeting:webrtc-offer", {
          roomId: data.roomId,
          fromSocketId: socket.id,
          sdp: data.sdp,
        });
      },
    );

    socket.on(
      "meeting:webrtc-answer",
      (data: { roomId: string; targetSocketId: string; sdp: unknown }) => {
        if (!data?.roomId || !data?.targetSocketId || !data?.sdp) return;
        if (!meetingRoomManager.isSocketInRoom(tenantId, data.roomId, socket.id)) return;
        io.to(data.targetSocketId).emit("meeting:webrtc-answer", {
          roomId: data.roomId,
          fromSocketId: socket.id,
          sdp: data.sdp,
        });
      },
    );

    socket.on(
      "meeting:webrtc-ice",
      (data: { roomId: string; targetSocketId: string; candidate: unknown }) => {
        if (!data?.roomId || !data?.targetSocketId || !data?.candidate) return;
        if (!meetingRoomManager.isSocketInRoom(tenantId, data.roomId, socket.id)) return;
        io.to(data.targetSocketId).emit("meeting:webrtc-ice", {
          roomId: data.roomId,
          fromSocketId: socket.id,
          candidate: data.candidate,
        });
      },
    );

    socket.on("disconnect", (reason) => {
      console.log(
        `🔴 ${user?.fullName || "Unknown User"} disconnected: ${socket.id} (${reason})`,
      );

      if (userId) {
        activeConversationTracker.blurConversation(userId, socket.id).catch(console.error);

        // Clean up any active meeting rooms this socket was participating in
        const leftMeetings = meetingRoomManager.handleSocketDisconnect(
          socket.id,
          tenantId,
          handleRoomAutoExpire,
        );
        for (const item of leftMeetings) {
          const meetingRoomName = getMeetingSocketRoom(item.roomId);
          io.to(meetingRoomName).emit("meeting:user-left", {
            roomId: item.roomId,
            socketId: socket.id,
            userId,
            room: item.room,
          });
        }
        if (leftMeetings.length > 0) {
          void broadcastTenantLobby(tenantId);
        }

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
