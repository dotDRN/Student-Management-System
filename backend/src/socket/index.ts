import { Server as HttpServer } from "http";
import { Server, Socket } from "socket.io";

let io: Server;

export function initializeSocket(server: HttpServer): Server {
    io = new Server(server, {
        cors: {
            origin: process.env.FRONTEND_URL || "http://localhost:5173",
            credentials: true,
        },
    });

    io.on("connection", (socket: Socket) => {
        console.log(`🟢 Socket connected: ${socket.id}`);

        socket.on("disconnect", (reason) => {
            console.log(`🔴 Socket disconnected: ${socket.id} (${reason})`);
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