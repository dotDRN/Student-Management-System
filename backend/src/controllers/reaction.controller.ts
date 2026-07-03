import { Request, Response } from "express";
import { asyncHandler } from "../utils/asyncHandler.js";
import reactionService from "../services/reaction.service.js";
import { AddReactionDto } from "../dto/chat/reaction.dto.js";

export const addReaction = asyncHandler(async (req: Request, res: Response) => {
    const reaction = await reactionService.addReaction(
        req.user.userId,
        req.params.messageId,
        req.body as AddReactionDto
    );

    return res.status(201).json({
        success: true,
        message: "Reaction added successfully.",
        data: reaction
    });
});

export const removeReaction = asyncHandler(async (req: Request, res: Response) => {
    await reactionService.removeReaction(
        req.user.userId,
        req.params.messageId
    );

    return res.status(200).json({
        success: true,
        message: "Reaction removed successfully."
    });
});