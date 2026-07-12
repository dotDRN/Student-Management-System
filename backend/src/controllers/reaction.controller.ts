import { Request, Response } from "express";
import { asyncHandler } from "../utils/asyncHandler.js";
import reactionService from "../services/reaction.service.js";
import { AddReactionDto } from "../dto/chat/reaction.dto.js";
import { getIO } from "../socket/index.js";
import { SocketRoomManager } from "../socket/socketRooms.js";
import prisma from "../lib/prisma.js";

const emitReactionUpdate = async (conversationId: string, messageId: string) => {
    // Fetch updated reactions with user info
    const reactions = await prisma.messageReaction.findMany({
        where: { messageId },
        include: {
            user: {
                select: { id: true, email: true, fullName: true }
            }
        }
    });

    const roomName = SocketRoomManager.getRoomName(conversationId);
    getIO().to(roomName).emit("message:reaction_updated", {
        messageId,
        conversationId,
        reactions
    });
};

export const addReaction = asyncHandler(async (req: Request, res: Response) => {
    const { reaction, conversationId } = await reactionService.addReaction(
        req.user.userId,
        String(req.params.messageId),
        req.body as AddReactionDto
    );

    // Emit socket event
    await emitReactionUpdate(conversationId, String(req.params.messageId));

    return res.status(201).json({
        success: true,
        message: "Reaction added successfully.",
        data: reaction
    });
});

export const removeReaction = asyncHandler(async (req: Request, res: Response) => {
    const { conversationId } = await reactionService.removeReaction(
        req.user.userId,
        String(req.params.messageId)
    );

    // Emit socket event
    await emitReactionUpdate(conversationId, String(req.params.messageId));

    return res.status(200).json({
        success: true,
        message: "Reaction removed successfully."
    });
});