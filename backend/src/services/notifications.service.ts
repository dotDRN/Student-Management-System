import prisma from "../lib/prisma.js";
import { getIO } from "../socket/index.js";
import { NotFoundError } from "../lib/errors.js";
import {
  Notification as PrismaNotification,
  NotificationChannel,
  NotificationRecipient,
  Prisma,
} from "@prisma/client";
import type { CreateNotificationDto } from "../dto/notification/create-notification.dto.js";

class NotificationService {
  private safeGetIO() {
    try {
      return getIO();
    } catch {
      return null;
    }
  }

  private async createNotification(tx: Prisma.TransactionClient, dto: CreateNotificationDto) {
    return tx.notification.create({
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
    tx: Prisma.TransactionClient,
    notificationId: string,
    recipientIds: string[],
    channels: NotificationChannel[] = [NotificationChannel.in_app],
  ) {
    const uniqueRecipientIds = [...new Set(recipientIds)];
    if (uniqueRecipientIds.length === 0) return [];

    await tx.notificationRecipient.createMany({
      data: uniqueRecipientIds.map((recipientId) => ({
        notificationId,
        recipientId,
        channels,
      })),
      skipDuplicates: true,
    });

    return tx.notificationRecipient.findMany({
      where: {
        notificationId,
      },
    });
  }

  private emitRealtimeNotification(
    notification: PrismaNotification,
    recipients: NotificationRecipient[],
  ) {
    const io = this.safeGetIO();
    if (!io) return;

    for (const recipient of recipients) {
      io.to(`user:${recipient.recipientId}`).emit("notification:new", {
        notificationRecipientId: recipient.id,

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
    const uniqueRecipientIds = [...new Set(dto.recipientIds)];
    if (uniqueRecipientIds.length === 0) {
      return null;
    }

    const result = await prisma.$transaction(async (tx) => {
      const notification = await this.createNotification(tx, dto);

      await this.createRecipients(
        tx,
        notification.id,
        uniqueRecipientIds,
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
      throw new NotFoundError("Notification");
    }

    if (recipient.isRead) {
      return recipient;
    }

    const updated = await prisma.notificationRecipient.update({
      where: {
        id: notificationRecipientId,
      },
      data: {
        isRead: true,
        readAt: new Date(),
      },
    });

    const io = this.safeGetIO();
    if (io) {
      io.to(`user:${userId}`).emit("notification:read", {
        notificationRecipientId,
      });
    }

    return updated;
  }

  async markAllAsRead(userId: string) {
    const result = await prisma.notificationRecipient.updateMany({
      where: {
        recipientId: userId,
        isRead: false,
      },
      data: {
        isRead: true,
        readAt: new Date(),
      },
    });

    const io = this.safeGetIO();
    if (io) {
      io.to(`user:${userId}`).emit("notification:read_all", {});
    }

    return result;
  }

  async markConversationNotificationsAsRead(userId: string, conversationId: string) {
    const unreadForConv = await prisma.notificationRecipient.findMany({
      where: {
        recipientId: userId,
        isRead: false,
        isArchived: false,
        notification: {
          link: `/chat/${conversationId}`,
        },
      },
      select: { id: true },
    });

    if (unreadForConv.length === 0) {
      return { count: 0 };
    }

    const recipientIds = unreadForConv.map((r) => r.id);
    const result = await prisma.notificationRecipient.updateMany({
      where: {
        id: { in: recipientIds },
      },
      data: {
        isRead: true,
        readAt: new Date(),
      },
    });

    const io = this.safeGetIO();
    if (io) {
      const unreadCount = await this.getUnreadCount(userId);
      io.to(`user:${userId}`).emit("notification:conversation_read", {
        conversationId,
        notificationRecipientIds: recipientIds,
        unreadCount,
      });
    }

    return result;
  }

  async archiveNotification(notificationRecipientId: string, userId: string) {
    const result = await prisma.notificationRecipient.updateMany({
      where: {
        id: notificationRecipientId,
        recipientId: userId,
      },
      data: {
        isArchived: true,
      },
    });

    const io = this.safeGetIO();
    if (io) {
      const unreadCount = await this.getUnreadCount(userId);
      io.to(`user:${userId}`).emit("notification:archived", {
        notificationRecipientId,
        unreadCount,
      });
    }

    return result;
  }
}

export default new NotificationService();
