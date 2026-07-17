import {
    NotificationChannel,
    NotificationEntityType,
    NotificationPriority,
    NotificationType,
} from "@prisma/client";
import { Prisma } from "@prisma/client";

export interface CreateNotificationDto {
    actorId?: string;
    recipientIds: string[];
    type: NotificationType;
    title: string;
    body: string;
    entityType?: NotificationEntityType;
    entityId?: string;
    link?: string;
    priority?: NotificationPriority;
    channels?: NotificationChannel[];
    metadata?: Prisma.InputJsonValue;
    expiresAt?: Date;
}