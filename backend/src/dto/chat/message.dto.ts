import { MessageType } from "@prisma/client";

export interface SendMessageDto {
    type?: MessageType;
    content?: string;
    replyToId?: string;
    attachments?: {
        url: string;
        fileName: string;
        mimeType: string;
        fileSize: number;
    }[];
}

export interface UpdateMessageDto {
    content: string;
}
