import prisma from "../lib/prisma.js";
import {
    ConversationType,
    Prisma
} from "@prisma/client";
import {
    BadRequestError,
    ConflictError,
    ForbiddenError,
    NotFoundError
} from "../lib/errors.js";
import {
    CreateConversationDto,
    UpdateConversationDto,
    AddMemberDto
} from "../dto/chat/conversation.dto.js";

class ConversationService {

    async createConversation(
        userId: string,
        payload: CreateConversationDto
    ) {}

    async getUserConversations(
        userId: string
    ) {}

    async getConversationById(
        userId: string,
        conversationId: string
    ) {}

    async updateConversation(
        userId: string,
        conversationId: string,
        payload: UpdateConversationDto
    ) {}

    async archiveConversation(
        userId: string,
        conversationId: string
    ) {}

    async getConversationMembers(
        userId: string,
        conversationId: string
    ) {}

    async addMember(
        userId: string,
        conversationId: string,
        payload: AddMemberDto
    ) {}

    async removeMember(
        userId: string,
        conversationId: string,
        memberId: string
    ) {}

    async markConversationAsRead(
        userId: string,
        conversationId: string
    ) {}
}

export default new ConversationService();