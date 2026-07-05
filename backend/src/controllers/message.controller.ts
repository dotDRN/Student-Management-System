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
        String(req.params.conversationId),
        req.body as SendMessageDto
    );

    const io = (await import("../socket/index.js")).getIO();
    io.to(`conversation:${String(req.params.conversationId)}`).emit("message:new", { message });

    return res.status(201).json({
        success: true,
        message: "Message sent successfully.",
        data: message
    });
});

export const getMessages = asyncHandler(async (req: Request, res: Response) => {
    const messages = await messageService.getMessages(
        req.user.userId,
        String(req.params.conversationId)
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
        String(req.params.conversationId),
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
        String(req.params.messageId)
    );

    return res.status(200).json({
        success: true,
        message: "Message fetched successfully.",
        data: message
    });
});

export const editMessage = asyncHandler(async (req: Request, res: Response) => {
    // Fetch the message first to get the conversationId
    const oldMessage = await messageService.getMessageById(
        req.user.userId,
        String(req.params.messageId)
    );

    const message = await messageService.editMessage(
        req.user.userId,
        String(req.params.messageId),
        req.body as UpdateMessageDto
    );

    const io = (await import("../socket/index.js")).getIO();
    io.to(`conversation:${oldMessage.conversationId}`).emit("message:updated", {
        id: message.id,
        conversationId: oldMessage.conversationId,
        content: message.content,
        updatedAt: message.updatedAt
    });

    return res.status(200).json({
        success: true,
        message: "Message updated successfully.",
        data: message
    });
});

export const deleteMessage = asyncHandler(async (req: Request, res: Response) => {
    const message = await messageService.getMessageById(
        req.user.userId,
        String(req.params.messageId)
    );

    await messageService.deleteMessage(
        req.user.userId,
        String(req.params.messageId)
    );

    const io = (await import("../socket/index.js")).getIO();
    io.to(`conversation:${message.conversationId}`).emit("message:deleted", {
        id: message.id,
        conversationId: message.conversationId
    });

    return res.status(200).json({
        success: true,
        message: "Message deleted successfully."
    });
});