import prisma from "../lib/prisma.js";
import {
    ForbiddenError,
    NotFoundError,
    BadRequestError
} from "../lib/errors.js";

export interface UploadAttachmentDto {
    url: string;
    fileName: string;
    mimeType: string;
    fileSize: number;
}

class AttachmentService {
    private async validateMessageOwnership(userId: string, messageId: string) {
        const message = await prisma.message.findUnique({
            where: { id: messageId },
            select: { senderId: true, isDeleted: true, conversationId: true }
        });

        if (!message) {
            throw new NotFoundError("Message not found.");
        }

        if (message.isDeleted) {
            throw new BadRequestError("Cannot add attachments to a deleted message.");
        }

        if (message.senderId !== userId) {
            throw new ForbiddenError("You do not have permission to modify this message.");
        }

        const member = await prisma.conversationMember.findUnique({
            where: {
                conversationId_userId: {
                    conversationId: message.conversationId,
                    userId
                }
            },
            select: { id: true, conversation: { select: { isArchived: true } } }
        });

        if (!member) {
            throw new ForbiddenError("You are not a member of this conversation.");
        }
        
        if (member.conversation.isArchived) {
            throw new BadRequestError("Action not permitted on an archived conversation.");
        }

        return message;
    }

    async uploadAttachment(userId: string, messageId: string, payload: UploadAttachmentDto) {
        await this.validateMessageOwnership(userId, messageId);

        return await prisma.messageAttachment.create({
            data: {
                messageId,
                url: payload.url,
                fileName: payload.fileName,
                mimeType: payload.mimeType,
                fileSize: payload.fileSize
            }
        });
    }

    async deleteAttachment(userId: string, attachmentId: string) {
        const attachment = await prisma.messageAttachment.findUnique({
            where: { id: attachmentId },
            select: {
                message: {
                    select: {
                        senderId: true,
                        conversationId: true,
                        isDeleted: true
                    }
                }
            }
        });

        if (!attachment) {
            throw new NotFoundError("Attachment not found.");
        }

        if (attachment.message.isDeleted) {
            throw new BadRequestError("Cannot modify a deleted message.");
        }

        if (attachment.message.senderId !== userId) {
            throw new ForbiddenError("You do not have permission to delete this attachment.");
        }

        const member = await prisma.conversationMember.findUnique({
            where: {
                conversationId_userId: {
                    conversationId: attachment.message.conversationId,
                    userId
                }
            },
            select: { id: true, conversation: { select: { isArchived: true } } }
        });

        if (member?.conversation.isArchived) {
            throw new BadRequestError("Action not permitted on an archived conversation.");
        }

        await prisma.messageAttachment.delete({
            where: { id: attachmentId }
        });
    }
}

export default new AttachmentService();
