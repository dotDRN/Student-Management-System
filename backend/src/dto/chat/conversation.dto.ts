import { ConversationType, ConversationRole } from "@prisma/client";

export interface ConversationMemberDto {
    userId: string;
    role?: ConversationRole;
}

export interface CreateConversationDto {
    type: ConversationType;
    title?: string;
    description?: string;
    avatarUrl?: string;
    members: ConversationMemberDto[];
    centerId?: string;
    activityId?: string;
    batchId?: string;
    programId?: string;
}