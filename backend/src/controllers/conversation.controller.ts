import { Request, Response } from "express";
import { asyncHandler } from "../utils/asyncHandler.js";
import conversationService from "../services/conversation.service.js";

export const createConversation = asyncHandler(async (req: Request, res: Response) => {
    const conversation = await conversationService.createConversation(req.user.id, req.body);

    return res.status(201).json({
        success: true,
        message: "Conversation created successfully.",
        data: conversation
    });
});

export const getUserConversations = asyncHandler(async (req: Request, res: Response) => {
    const conversations = await conversationService.getUserConversations(req.user.id);

    return res.status(200).json({
        success: true,
        message: "Conversations fetched successfully.",
        data: conversations
    });
});

export const getConversationById = asyncHandler(async (req: Request, res: Response) => {
    const conversation = await conversationService.getConversationById(
        req.user.id,
        req.params.conversationId
    );

    return res.status(200).json({
        success: true,
        message: "Conversation fetched successfully.",
        data: conversation
    });
});

export const updateConversation = asyncHandler(async (req: Request, res: Response) => {
    const conversation = await conversationService.updateConversation(
        req.user.id,
        req.params.conversationId,
        req.body
    );

    return res.status(200).json({
        success: true,
        message: "Conversation updated successfully.",
        data: conversation
    });
});

export const archiveConversation = asyncHandler(async (req: Request, res: Response) => {
    await conversationService.archiveConversation(
        req.user.id,
        req.params.conversationId
    );

    return res.status(200).json({
        success: true,
        message: "Conversation archived successfully."
    });
});

export const getConversationMembers = asyncHandler(async (req: Request, res: Response) => {
    const members = await conversationService.getConversationMembers(
        req.user.id,
        req.params.conversationId
    );

    return res.status(200).json({
        success: true,
        message: "Conversation members fetched successfully.",
        data: members
    });
});

export const addMember = asyncHandler(async (req: Request, res: Response) => {
    const member = await conversationService.addMember(
        req.user.id,
        req.params.conversationId,
        req.body
    );

    return res.status(201).json({
        success: true,
        message: "Member added successfully.",
        data: member
    });
});

export const removeMember = asyncHandler(async (req: Request, res: Response) => {
    await conversationService.removeMember(
        req.user.id,
        req.params.conversationId,
        req.params.memberId
    );

    return res.status(200).json({
        success: true,
        message: "Member removed successfully."
    });
});

export const markConversationAsRead = asyncHandler(async (req: Request, res: Response) => {
    await conversationService.markConversationAsRead(
        req.user.id,
        req.params.conversationId
    );

    return res.status(200).json({
        success: true,
        message: "Conversation marked as read."
    });
});