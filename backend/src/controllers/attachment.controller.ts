import { Request, Response } from "express";
import { asyncHandler } from "../utils/asyncHandler.js";
import attachmentService from "../services/attachment.service.js";
import { UploadAttachmentDto } from "../dto/chat/attachment.dto.js";
import { uploadBufferToCloudinary } from "../lib/cloudinary.js";
import { BadRequestError } from "../lib/errors.js";

export const uploadStandaloneAttachment = asyncHandler(async (req: Request, res: Response) => {
    if (!req.file) {
        throw new BadRequestError("No file provided in 'file' field.");
    }

    const uploaded = await uploadBufferToCloudinary(
        req.file.buffer,
        req.file.originalname,
        req.file.mimetype,
        req.file.size
    );

    return res.status(201).json({
        success: true,
        message: "Attachment uploaded to Cloudinary successfully.",
        data: uploaded
    });
});

export const uploadAttachment = asyncHandler(async (req: Request, res: Response) => {
    let payload = req.body as UploadAttachmentDto;

    if (req.file) {
        const uploaded = await uploadBufferToCloudinary(
            req.file.buffer,
            req.file.originalname,
            req.file.mimetype,
            req.file.size
        );
        payload = {
            url: uploaded.url,
            fileName: uploaded.fileName,
            mimeType: uploaded.mimeType,
            fileSize: uploaded.fileSize
        };
    }

    const attachment = await attachmentService.uploadAttachment(
        req.user.userId,
        String(req.params.messageId),
        payload
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
        String(req.params.attachmentId)
    );

    return res.status(200).json({
        success: true,
        message: "Attachment deleted successfully."
    });
});
