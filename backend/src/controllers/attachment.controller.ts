import { Request, Response } from "express";
import { asyncHandler } from "../utils/asyncHandler.js";
import attachmentService from "../services/attachment.service.js";
import { UploadAttachmentDto } from "../dto/chat/attachment.dto.js";

export const uploadAttachment = asyncHandler(async (req: Request, res: Response) => {
    const attachment = await attachmentService.uploadAttachment(
        req.user.userId,
        req.params.messageId,
        req.body as UploadAttachmentDto
    );

    return res.status(201).json({
        success: true,
        message: "Attachment uploaded successfully.",
        data: attachment
    });
});

export const deleteAttachment = asyncHandler(async (req: Request, res: Response) => {
    await attachmentService.deleteAttachment(
        req.user.userId,
        req.params.attachmentId
    );

    return res.status(200).json({
        success: true,
        message: "Attachment deleted successfully."
    });
});