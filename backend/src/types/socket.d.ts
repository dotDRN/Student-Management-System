import { UserRole } from "@prisma/client";

declare module "socket.io" {
  interface SocketData {
    user: {
      id: string;
      tenantId: string;
      fullName: string;
      email: string;
      role: UserRole;
      centerIds: string[];
    };
  }
}
