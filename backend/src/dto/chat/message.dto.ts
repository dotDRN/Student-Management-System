import { MessageType } from "@prisma/client";

export interface SendMessageDto {
    type?: MessageType;
    content?: string;
    replyToId?: string;
}

export interface UpdateMessageDto {
    content: string;
}