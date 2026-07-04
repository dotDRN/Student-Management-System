import { Server as HttpServer } from "http";
import { Server, Socket } from "socket.io";
import { authenticateSocket } from "./auth.js";

let io: Server;

export function initializeSocket(server: HttpServer): Server {
    io = new Server(server, {
        cors: {
            origin: process.env.FRONTEND_URL || "http://localhost:5173",
            credentials: true,
        },
    });

    io.use(authenticateSocket);

    io.on("connection", (socket: Socket) => {
        console.log(`🟢 ${socket.data.user?.fullName || "Unknown User"} connected: ${socket.id}`);

        socket.on("disconnect", (reason) => {
            console.log(`🔴 ${socket.data.user?.fullName || "Unknown User"} disconnected: ${socket.id} (${reason})`);
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