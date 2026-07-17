import prisma from "../lib/prisma.js";
import { getIO } from "../socket/index.js";
import {
  Notification as PrismaNotification,
  NotificationChannel,
  NotificationPriority,
  NotificationRecipient,
} from "@prisma/client";
import type { CreateNotificationDto } from "../dto/notification/create-notification.dto.js";

class NotificationService {
  private async createNotification(dto: CreateNotificationDto) {
    return prisma.notification.create({
      data: {
        actorId: dto.actorId,
        type: dto.type,
        title: dto.title,
        body: dto.body,
        entityType: dto.entityType,
        entityId: dto.entityId,
        link: dto.link,
        priority: dto.priority,
        metadata: dto.metadata,
        expiresAt: dto.expiresAt,
      },
    });
  }

  private async createRecipients(
    notificationId: string,
    recipientIds: string[],
    channels: NotificationChannel[] = [NotificationChannel.in_app],
  ) {
    await prisma.notificationRecipient.createMany({
      data: recipientIds.map((recipientId) => ({
        notificationId,
        recipientId,
        channels,
      })),
    });

    return prisma.notificationRecipient.findMany({
      where: {
        notificationId,
      },
    });
  }

  private emitRealtimeNotification(
    notification: PrismaNotification,
    recipients: NotificationRecipient[],
  ) {
    const io = getIO();

    for (const recipient of recipients) {
      io.to(`user:${recipient.recipientId}`).emit("notification:new", {
        notificationId: notification.id,
        recipientId: recipient.recipientId,
        type: notification.type,
        title: notification.title,
        body: notification.body,
        priority: notification.priority,
        link: notification.link,
        entityType: notification.entityType,
        entityId: notification.entityId,
        metadata: notification.metadata,
        createdAt: notification.createdAt,
      });
    }
  }

  async notify(dto: CreateNotificationDto) {
    const result = await prisma.$transaction(async (tx) => {
      const notification = await this.createNotification(dto);

      await this.createRecipients(
        notification.id,
        dto.recipientIds,
        dto.channels,
      );

      return notification;
    });

    const recipients = await prisma.notificationRecipient.findMany({
      where: {
        notificationId: result.id,
      },
    });

    this.emitRealtimeNotification(result, recipients);

    return result;
  }

  async getUserNotifications(
    userId: string,
    page = 1,
    limit = 20,
    unreadOnly = false,
  ) {
    const skip = (page - 1) * limit;

    const where = {
      recipientId: userId,
      isArchived: false,
      ...(unreadOnly && { isRead: false }),
    };

    const [notifications, total] = await prisma.$transaction([
      prisma.notificationRecipient.findMany({
        where,
        include: {
          notification: {
            include: {
              actor: {
                select: {
                  id: true,
                  fullName: true,
                },
              },
            },
          },
        },
        orderBy: {
          notification: {
            createdAt: "desc",
          },
        },
        skip,
        take: limit,
      }),

      prisma.notificationRecipient.count({
        where,
      }),
    ]);

    return {
      notifications,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        hasNext: skip + notifications.length < total,
        hasPrevious: page > 1,
      },
    };
  }

  async getUnreadCount(userId: string) {
    return prisma.notificationRecipient.count({
      where: {
        recipientId: userId,
        isRead: false,
        isArchived: false,
      },
    });
  }

  async markAsRead(notificationRecipientId: string, userId: string) {
    const recipient = await prisma.notificationRecipient.findFirst({
      where: {
        id: notificationRecipientId,
        recipientId: userId,
      },
    });

    if (!recipient) {
      throw new Error("Notification not found.");
    }

    if (recipient.isRead) {
      return recipient;
    }

    return prisma.notificationRecipient.update({
      where: {
        id: notificationRecipientId,
      },
      data: {
        isRead: true,
        readAt: new Date(),
      },
    });
  }

  async markAllAsRead(userId: string) {
    return prisma.notificationRecipient.updateMany({
      where: {
        recipientId: userId,
        isRead: false,
      },
      data: {
        isRead: true,
        readAt: new Date(),
      },
    });
  }

  async archiveNotification(notificationRecipientId: string, userId: string) {
    return prisma.notificationRecipient.updateMany({
      where: {
        id: notificationRecipientId,
        recipientId: userId,
      },
      data: {
        isArchived: true,
      },
    });
  }
}

export default new NotificationService();
