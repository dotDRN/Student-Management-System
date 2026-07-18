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
  switch (type) {
    case MessageType.text:
      return content?.trim() ?? "Sent a message";
    case MessageType.image:
      return "Sent an image";
    case MessageType.file:
      return "Sent an attachment";
    case MessageType.audio:
      return "Sent a voice message";
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

    if (payload.replyToId) {
      const parentMessage = await prisma.message.findUnique({
        where: { id: payload.replyToId },
        select: { conversationId: true },
      });

      if (!parentMessage) {
        throw new NotFoundError("Reply target message not found.");
      }

      if (parentMessage.conversationId !== conversationId) {
        throw new BadRequestError(
          "Reply target message belongs to a different conversation.",
        );
      }
    }

    // Keep message persistence atomic, including attachment creation and the
    // conversation timestamp update.
    const createdMessage = await prisma.$transaction(async (tx) => {
      const message = await tx.message.create({
        data: {
          conversationId,
          senderId: userId,
          type: payload.type || MessageType.text,
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
          type: true,
          content: true,
          createdAt: true,
          replyToId: true,
          senderId: true,
          sender: {
            select: {
              fullName: true,
            },
          },
          attachments: {
            select: {
              id: true,
              url: true,
              fileName: true,
              mimeType: true,
              fileSize: true,
            },
          },
        },
      });

      await tx.conversation.update({
        where: { id: conversationId },
        data: { updatedAt: new Date() },
      });

      return message;
    });
    const { sender, ...message } = createdMessage;

    const recipients = await prisma.conversationMember.findMany({
      where: {
        conversationId,
        userId: { not: userId },
      },
      select: { userId: true },
    });
    const recipientIds = recipients.map((recipient) => recipient.userId);

    if (recipientIds.length === 0) {
      return message;
    }

    try {
      await NotificationService.notify({
        actorId: userId,
        recipientIds,
        type: NotificationType.chat_message,
        title: sender.fullName,
        body: getMessageNotificationBody(message.type, message.content),
        entityType: NotificationEntityType.message,
        entityId: message.id,
        priority: NotificationPriority.medium,
        link: `/chat/${conversationId}`,
        metadata: {
          conversationId,
          messageId: message.id,
        },
      });
    } catch (error) {
      console.error("Failed to send notification:", error);
    }

    return message;
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
          },
        },
        reactions: {
          select: {
            reaction: true,
            userId: true,
          },
        },
        sender: {
          select: {
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
        senderId: true,
        type: true,
        content: true,
        createdAt: true,
        isEdited: true,
        sender: {
          select: {
            fullName: true,
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
          },
        },
        sender: {
          select: {
            fullName: true,
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
