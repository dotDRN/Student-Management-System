import { Request, Response } from "express";
import { asyncHandler } from "../utils/asyncHandler.js";
import conversationService from "../services/conversation.service.js";
import { getIO } from "../socket/index.js";

const safeGetIO = () => {
    try {
        return getIO();
    } catch {
        return null;
    }
};

export const searchChatUsers = asyncHandler(async (req: Request, res: Response) => {
    const search = typeof req.query.search === "string" ? req.query.search : undefined;
    const limit = req.query.limit ? Number(req.query.limit) : 20;
    const result = await conversationService.searchChatUsers(req.user.userId, search, limit);

    return res.status(200).json(result);
});

export const createConversation = asyncHandler(async (req: Request, res: Response) => {
    const conversation = await conversationService.createConversation(req.user.userId, req.body);

    const io = safeGetIO();
    if (io) {
        conversation.members?.forEach((member: any) => {
            io.to(`user:${member.userId}`).emit("conversation:new", { conversation });
        });
    }

    return res.status(201).json({
        success: true,
        message: "Conversation created successfully.",
        data: conversation
    });
});

export const getUserConversations = asyncHandler(async (req: Request, res: Response) => {
    const cursor = typeof req.query.cursor === "string" ? req.query.cursor : undefined;
    const limit = req.query.limit ? Number(req.query.limit) : 20;
    const conversations = await conversationService.getUserConversations(req.user.userId, cursor, limit);

    return res.status(200).json({
        success: true,
        message: "Conversations fetched successfully.",
        data: conversations
    });
});

export const getConversationById = asyncHandler(async (req: Request, res: Response) => {
    const conversation = await conversationService.getConversationById(
        req.user.userId,
        String(req.params.conversationId)
    );

    return res.status(200).json({
        success: true,
        message: "Conversation fetched successfully.",
        data: conversation
    });
});

export const updateConversation = asyncHandler(async (req: Request, res: Response) => {
    const conversationId = String(req.params.conversationId);
    const conversation = await conversationService.updateConversation(
        req.user.userId,
        conversationId,
        req.body
    );

    const io = safeGetIO();
    if (io) {
        io.to(`conversation:${conversationId}`).emit("conversation:updated", {
            conversation
        });
    }

    return res.status(200).json({
        success: true,
        message: "Conversation updated successfully.",
        data: conversation
    });
});

export const archiveConversation = asyncHandler(async (req: Request, res: Response) => {
    const conversationId = String(req.params.conversationId);
    await conversationService.archiveConversation(
        req.user.userId,
        conversationId
    );

    const io = safeGetIO();
    if (io) {
        io.to(`conversation:${conversationId}`).emit("conversation:archived", {
            conversationId
        });
    }

    return res.status(200).json({
        success: true,
        message: "Conversation archived successfully."
    });
});

export const getConversationMembers = asyncHandler(async (req: Request, res: Response) => {
    const members = await conversationService.getConversationMembers(
        req.user.userId,
        String(req.params.conversationId)
    );

    return res.status(200).json({
        success: true,
        message: "Conversation members fetched successfully.",
        data: members
    });
});

export const addMember = asyncHandler(async (req: Request, res: Response) => {
    const conversationId = String(req.params.conversationId);
    const member = await conversationService.addMember(
        req.user.userId,
        conversationId,
        req.body
    );

    const io = safeGetIO();
    if (io) {
        try {
            const fullConversation = await conversationService.getConversationById(
                req.user.userId,
                conversationId
            );
            io.to(`user:${member.userId}`).emit("conversation:new", { conversation: fullConversation });
            io.to(`conversation:${conversationId}`).emit("conversation:updated", { conversation: fullConversation });
        } catch (err) {
            console.error("Failed to broadcast member addition:", err);
        }
    }

    return res.status(201).json({
        success: true,
        message: "Member added successfully.",
        data: member
    });
});

export const removeMember = asyncHandler(async (req: Request, res: Response) => {
    const conversationId = String(req.params.conversationId);
    const memberId = String(req.params.memberId);
    await conversationService.removeMember(
        req.user.userId,
        conversationId,
        memberId
    );

    const io = safeGetIO();
    if (io) {
        io.to(`conversation:${conversationId}`).emit("conversation:member_removed", {
            conversationId,
            userId: memberId
        });
    }

    return res.status(200).json({
        success: true,
        message: "Member removed successfully."
    });
});

export const markConversationAsRead = asyncHandler(async (req: Request, res: Response) => {
    const conversationId = String(req.params.conversationId);
    const lastReadAt = await conversationService.markConversationAsRead(
        req.user.userId,
        conversationId
    );

    const io = safeGetIO();
    if (io) {
        io.to(`conversation:${conversationId}`).emit("conversation:read_update", {
            conversationId,
            userId: req.user.userId,
            lastReadAt: lastReadAt.toISOString()
        });
    }

    return res.status(200).json({
        success: true,
        message: "Conversation marked as read."
    });
});
