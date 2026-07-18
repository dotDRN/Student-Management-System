import { Socket } from "socket.io";
import prisma from "../lib/prisma.js";
import { verifyAccessToken } from "../utils/jwt.js";

export async function authenticateSocket(
    socket: Socket,
    next: (err?: Error) => void
) {
    try {
        const token = socket.handshake.auth?.token;

        if (!token) {
            return next(new Error("Authentication token is required."));
        }

        const payload = verifyAccessToken(token);

        console.log("Socket JWT Payload:", payload);

        // Kill-switch support
        if (!payload.isActive) {
            return next(new Error("User account is inactive."));
        }

        const user = await prisma.user.findUnique({
            where: {
                id: payload.userId,
            },
            select: {
                id: true,
                fullName: true,
                email: true,
                role: true,
                isActive: true,
                centerAssignments: {
                    where: {
                        validUntil: null,
                    },
                    select: {
                        centerId: true,
                    },
                },
            },
        });

        if (!user || !user.isActive) {
            return next(new Error("Unauthorized."));
        }

        socket.data.user = {
            id: user.id,
            fullName: user.fullName,
            email: user.email,
            role: user.role,
            centerIds: user.centerAssignments.map(c => c.centerId),
        };

        next();
    } catch (error) {
        next(error instanceof Error ? error : new Error("Unauthorized"));
    }
}