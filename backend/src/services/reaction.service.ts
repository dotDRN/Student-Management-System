import prisma from "../lib/prisma.js";
import { ReactionType } from "@prisma/client";
import {
    ForbiddenError,
    NotFoundError
} from "../lib/errors.js";

export interface AddReactionDto {
    reaction: ReactionType;
}

class ReactionService {
    private async validateMembershipForMessage(userId: string, messageId: string) {
        const message = await prisma.message.findUnique({
            where: { id: messageId },
            select: { conversationId: true, isDeleted: true }
        });

        if (!message) {
            throw new NotFoundError("Message not found.");
        }

        if (message.isDeleted) {
            throw new ForbiddenError("Cannot react to a deleted message.");
        }

        const member = await prisma.conversationMember.findUnique({
            where: {
                conversationId_userId: {
                    conversationId: message.conversationId,
                    userId
                }
            },
            select: { id: true }
        });

        if (!member) {
            throw new ForbiddenError("You are not a member of this conversation.");
        }

        return message;
    }

    async addReaction(userId: string, messageId: string, payload: AddReactionDto) {
        await this.validateMembershipForMessage(userId, messageId);

        // Upsert or create? The unique constraint is on [messageId, userId, reaction]
        // A user can theoretically have multiple different reactions to the same message.
        // We will just create if not exists, but Prisma handles this gracefully.
        
        // Find if the exact reaction exists
        const existingReaction = await prisma.messageReaction.findUnique({
            where: {
                messageId_userId_reaction: {
                    messageId,
                    userId,
                    reaction: payload.reaction
                }
            }
        });

        if (existingReaction) {
            return existingReaction; // already reacted with this exact reaction
        }

        return await prisma.messageReaction.create({
            data: {
                messageId,
                userId,
                reaction: payload.reaction
            }
        });
    }

    async removeReaction(userId: string, messageId: string) {
        await this.validateMembershipForMessage(userId, messageId);

        // Since the controller doesn't specify which reaction to remove, we remove all reactions
        // made by this user on this specific message.
        await prisma.messageReaction.deleteMany({
            where: {
                messageId,
                userId
            }
        });
    }
}

export default new ReactionService();
