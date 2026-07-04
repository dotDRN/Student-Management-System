import { UserRole } from "@prisma/client";

declare module "socket.io" {
    interface SocketData {
        user: {
            id: string;
            fullName: string;
            email: string;
            role: UserRole;
            centerIds: string[];
        };
    }
}