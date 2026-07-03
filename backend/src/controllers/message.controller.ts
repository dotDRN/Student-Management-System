import { Request, Response } from "express";
import { asyncHandler } from "../utils/asyncHandler.js";
import messageService from "../services/message.service.js";
import {
    SendMessageDto,
    UpdateMessageDto
} from "../dto/chat/message.dto.js";

export const sendMessage = asyncHandler(async (req: Request, res: Response) => {
    const message = await messageService.sendMessage(
        req.user.userId,
        req.params.conversationId,
        req.body as SendMessageDto
    );

    return res.status(201).json({
        success: true,
        message: "Message sent successfully.",
        data: message
    });
});

export const getMessages = asyncHandler(async (req: Request, res: Response) => {
    const messages = await messageService.getMessages(
        req.user.userId,
        req.params.conversationId
    );

    return res.status(200).json({
        success: true,
        message: "Messages fetched successfully.",
        data: messages
    });
});

export const searchMessages = asyncHandler(async (req: Request, res: Response) => {
    const messages = await messageService.searchMessages(
        req.user.userId,
        req.params.conversationId,
        String(req.query.q ?? "")
    );

    return res.status(200).json({
        success: true,
        message: "Messages fetched successfully.",
        data: messages
    });
});

export const getMessageById = asyncHandler(async (req: Request, res: Response) => {
    const message = await messageService.getMessageById(
        req.user.userId,
        req.params.messageId
    );

    return res.status(200).json({
        success: true,
        message: "Message fetched successfully.",
        data: message
    });
});

export const editMessage = asyncHandler(async (req: Request, res: Response) => {
    const message = await messageService.editMessage(
        req.user.userId,
        req.params.messageId,
        req.body as UpdateMessageDto
    );

    return res.status(200).json({
        success: true,
        message: "Message updated successfully.",
        data: message
    });
});

export const deleteMessage = asyncHandler(async (req: Request, res: Response) => {
    await messageService.deleteMessage(
        req.user.userId,
        req.params.messageId
    );

    return res.status(200).json({
        success: true,
        message: "Message deleted successfully."
    });
});