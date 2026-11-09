import prisma from "../lib/prisma.js";
import {
  Prisma,
  MessageType,
  NotificationEntityType,
  NotificationPriority,
  NotificationType,
} from "@prisma/client";
import {
  BadRequestError,
  ForbiddenError,
  NotFoundError,
} from "../lib/errors.js";
import NotificationService from "./notifications.service.js";
import { activeConversationTracker } from "../socket/activeConversationTracker.js";

// Extended DTO to handle attachments as requested by business logic
export interface SendMessageDto {
  type?: MessageType;
  content?: string;
  replyToId?: string;
  attachments?: {
    url: string;
    fileName: string;
    mimeType: string;
    fileSize: number;
  }[];
}

export interface UpdateMessageDto {
  content: string;
}

function getMessageNotificationBody(type: MessageType, content: string | null) {
  const trimmed = content?.trim();
  if (trimmed) return trimmed;
  switch (type) {
    case MessageType.text:
      return "Sent a message";
    case MessageType.image:
      return "📷 Sent an image";
    case MessageType.file:
      return "📎 Sent an attachment";
    case MessageType.audio:
      return "🎵 Sent a voice message";
    case MessageType.system:
      return "System message";
    default:
      return "Sent a message";
  }
}

class MessageService {
  private async validateMembership(userId: string, conversationId: string) {
    const member = await prisma.conversationMember.findUnique({
      where: {
        conversationId_userId: { conversationId, userId },
      },
      select: {
        role: true,
        conversation: {
          select: { isArchived: true },
        },
      },
    });

    if (!member) {
      throw new ForbiddenError("You are not a member of this conversation.");
    }

    if (member.conversation.isArchived) {
      throw new BadRequestError(
        "Action not permitted on an archived conversation.",
      );
    }

    return member;
  }

  private async validateMessageOwnership(userId: string, messageId: string) {
    const message = await prisma.message.findUnique({
      where: { id: messageId },
      select: { senderId: true, isDeleted: true, conversationId: true },
    });

    if (!message) {
      throw new NotFoundError("Message not found.");
    }

    if (message.isDeleted) {
      throw new BadRequestError("Cannot modify a deleted message.");
    }

    if (message.senderId !== userId) {
      throw new ForbiddenError(
        "You do not have permission to modify this message.",
      );
    }

    return message;
  }

  async sendMessage(
    userId: string,
    conversationId: string,
    payload: SendMessageDto,
  ) {
    await this.validateMembership(userId, conversationId);

    let replyTargetSenderId: string | null = null;
    if (payload.replyToId) {
      const parentMessage = await prisma.message.findUnique({
        where: { id: payload.replyToId },
        select: { conversationId: true, senderId: true },
      });

      if (!parentMessage) {
        throw new NotFoundError("Reply target message not found.");
      }

      if (parentMessage.conversationId !== conversationId) {
        throw new BadRequestError(
          "Reply target message belongs to a different conversation.",
        );
      }

      replyTargetSenderId = parentMessage.senderId;
    }

    let resolvedType: MessageType = payload.type || MessageType.text;
    if (!payload.type && payload.attachments && payload.attachments.length > 0) {
      const allImages = payload.attachments.every((a) =>
        a.mimeType?.startsWith("image/"),
      );
      const allAudio = payload.attachments.every((a) =>
        a.mimeType?.startsWith("audio/"),
      );
      if (allImages) {
        resolvedType = MessageType.image;
      } else if (allAudio) {
        resolvedType = MessageType.audio;
      } else {
        resolvedType = MessageType.file;
      }
    }

    // Keep message persistence atomic, including attachment creation and the
    // conversation timestamp update.
    const createdMessage = await prisma.$transaction(async (tx) => {
      const message = await tx.message.create({
        data: {
          conversationId,
          senderId: userId,
          type: resolvedType,
          content: payload.content,
          replyToId: payload.replyToId,
          attachments:
            payload.attachments && payload.attachments.length > 0
              ? {
                  create: payload.attachments.map((att) => ({
                    url: att.url,
                    fileName: att.fileName,
                    mimeType: att.mimeType,
                    fileSize: att.fileSize,
                  })),
                }
              : undefined,
        },
        select: {
          id: true,
          conversationId: true,
          type: true,
          content: true,
          createdAt: true,
          updatedAt: true,
          isEdited: true,
          isDeleted: true,
          replyToId: true,
          senderId: true,
          sender: {
            select: {
              id: true,
              fullName: true,
              email: true,
            },
          },
          attachments: {
            select: {
              id: true,
              url: true,
              fileName: true,
              mimeType: true,
              fileSize: true,
              createdAt: true,
            },
          },
        },
      });

      await tx.conversation.update({
        where: { id: conversationId },
        data: { updatedAt: new Date() },
      });

      return {
        ...message,
        reactions: [],
      };
    });

    const recipients = await prisma.conversationMember.findMany({
      where: {
        conversationId,
        userId: { not: userId },
      },
      select: {
        userId: true,
        user: {
          select: {
            fullName: true,
            email: true,
          },
        },
      },
    });

    if (recipients.length === 0) {
      return createdMessage;
    }

    const unnotifiedRecipients: typeof recipients = [];
    await Promise.all(
      recipients.map(async (recipient) => {
        const isViewing = await activeConversationTracker.isViewingConversation(
          recipient.userId,
          conversationId,
        );
        if (!isViewing) {
          unnotifiedRecipients.push(recipient);
        }
      }),
    );

    if (unnotifiedRecipients.length === 0) {
      return createdMessage;
    }

    try {
      const notificationBody = getMessageNotificationBody(
        createdMessage.type,
        createdMessage.content,
      );
      const lowerContent = (createdMessage.content || "").toLowerCase();

      const replyRecipientIds: string[] = [];
      const mentionRecipientIds: string[] = [];
      const regularRecipientIds: string[] = [];

      for (const r of unnotifiedRecipients) {
        const fullNameTag = `@${r.user.fullName.toLowerCase()}`;
        const firstNameTag = `@${r.user.fullName.split(" ")[0].toLowerCase()}`;
        const emailTag = `@${r.user.email.toLowerCase()}`;

        if (
          lowerContent.includes(fullNameTag) ||
          lowerContent.includes(emailTag) ||
          (firstNameTag.length > 2 && lowerContent.includes(firstNameTag))
        ) {
          mentionRecipientIds.push(r.userId);
        } else if (replyTargetSenderId && r.userId === replyTargetSenderId) {
          replyRecipientIds.push(r.userId);
        } else {
          regularRecipientIds.push(r.userId);
        }
      }

      if (mentionRecipientIds.length > 0) {
        await NotificationService.notify({
          actorId: userId,
          recipientIds: mentionRecipientIds,
          type: NotificationType.chat_mention,
          title: `${createdMessage.sender.fullName} mentioned you`,
          body: notificationBody,
          entityType: NotificationEntityType.message,
          entityId: createdMessage.id,
          priority: NotificationPriority.high,
          link: `/chat/${conversationId}`,
          metadata: {
            conversationId,
            messageId: createdMessage.id,
          },
        });
      }

      if (replyRecipientIds.length > 0) {
        await NotificationService.notify({
          actorId: userId,
          recipientIds: replyRecipientIds,
          type: NotificationType.chat_reply,
          title: `${createdMessage.sender.fullName} replied to your message`,
          body: notificationBody,
          entityType: NotificationEntityType.message,
          entityId: createdMessage.id,
          priority: NotificationPriority.medium,
          link: `/chat/${conversationId}`,
          metadata: {
            conversationId,
            messageId: createdMessage.id,
          },
        });
      }

      if (regularRecipientIds.length > 0) {
        await NotificationService.notify({
          actorId: userId,
          recipientIds: regularRecipientIds,
          type: NotificationType.chat_message,
          title: createdMessage.sender.fullName,
          body: notificationBody,
          entityType: NotificationEntityType.message,
          entityId: createdMessage.id,
          priority: NotificationPriority.medium,
          link: `/chat/${conversationId}`,
          metadata: {
            conversationId,
            messageId: createdMessage.id,
          },
        });
      }
    } catch (error) {
      console.error("Failed to send notification:", error);
    }

    return createdMessage;
  }

  async getMessages(
    userId: string,
    conversationId: string,
    cursor?: string,
    limit: number = 50,
  ) {
    // Just checking if user is in conversation (without throwing if archived, as reading is allowed)
    const member = await prisma.conversationMember.findUnique({
      where: { conversationId_userId: { conversationId, userId } },
      select: { id: true },
    });

    if (!member) {
      throw new ForbiddenError("You are not a member of this conversation.");
    }

    const query: Prisma.MessageFindManyArgs = {
      where: { conversationId },
      select: {
        id: true,
        conversationId: true,
        senderId: true,
        type: true,
        content: true,
        createdAt: true,
        updatedAt: true,
        isEdited: true,
        isDeleted: true,
        replyToId: true,
        attachments: {
          select: {
            id: true,
            url: true,
            fileName: true,
            mimeType: true,
            fileSize: true,
            createdAt: true,
          },
        },
        reactions: {
          select: {
            id: true,
            messageId: true,
            reaction: true,
            userId: true,
            createdAt: true,
          },
        },
        sender: {
          select: {
            id: true,
            fullName: true,
            email: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
      take: limit,
    };

    if (cursor) {
      query.cursor = { id: cursor };
      query.skip = 1;
    }

    return await prisma.message.findMany(query);
  }

  async searchMessages(userId: string, conversationId: string, query: string) {
    const member = await prisma.conversationMember.findUnique({
      where: { conversationId_userId: { conversationId, userId } },
      select: { id: true },
    });

    if (!member) {
      throw new ForbiddenError("You are not a member of this conversation.");
    }

    if (!query || query.trim() === "") {
      return [];
    }

    return await prisma.message.findMany({
      where: {
        conversationId,
        isDeleted: false,
        content: {
          contains: query,
          mode: "insensitive",
        },
      },
      select: {
        id: true,
        conversationId: true,
        senderId: true,
        type: true,
        content: true,
        createdAt: true,
        updatedAt: true,
        isEdited: true,
        isDeleted: true,
        sender: {
          select: {
            id: true,
            fullName: true,
            email: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
      take: 50,
    });
  }

  async getMessageById(userId: string, messageId: string) {
    const message = await prisma.message.findUnique({
      where: { id: messageId },
      select: {
        id: true,
        conversationId: true,
        senderId: true,
        type: true,
        content: true,
        createdAt: true,
        updatedAt: true,
        isEdited: true,
        isDeleted: true,
        replyToId: true,
        attachments: {
          select: {
            id: true,
            url: true,
            fileName: true,
            mimeType: true,
            fileSize: true,
            createdAt: true,
          },
        },
        sender: {
          select: {
            id: true,
            fullName: true,
            email: true,
          },
        },
      },
    });

    if (!message) {
      throw new NotFoundError("Message not found.");
    }

    // Verify membership
    const member = await prisma.conversationMember.findUnique({
      where: {
        conversationId_userId: {
          conversationId: message.conversationId,
          userId,
        },
      },
      select: { id: true },
    });

    if (!member) {
      throw new ForbiddenError("You do not have access to this message.");
    }

    return message;
  }

  async editMessage(
    userId: string,
    messageId: string,
    payload: UpdateMessageDto,
  ) {
    const messageInfo = await this.validateMessageOwnership(userId, messageId);
    await this.validateMembership(userId, messageInfo.conversationId);

    return await prisma.message.update({
      where: { id: messageId },
      data: {
        content: payload.content,
        isEdited: true,
        updatedAt: new Date(),
      },
      select: {
        id: true,
        content: true,
        isEdited: true,
        updatedAt: true,
      },
    });
  }

  async deleteMessage(userId: string, messageId: string) {
    const messageInfo = await this.validateMessageOwnership(userId, messageId);
    await this.validateMembership(userId, messageInfo.conversationId);

    await prisma.message.update({
      where: { id: messageId },
      data: {
        isDeleted: true,
        content: "[This message was deleted]",
        attachments: {
          deleteMany: {}, // Assuming attachments should be scrubbed too
        },
      },
    });
  }
}

export default new MessageService();
