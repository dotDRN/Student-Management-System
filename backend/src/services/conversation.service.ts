import prisma from "../lib/prisma.js";
import {
    ConversationType,
    ConversationRole,
    Prisma
} from "@prisma/client";
import {
    BadRequestError,
    ConflictError,
    ForbiddenError,
    NotFoundError
} from "../lib/errors.js";
import notificationService from "./notifications.service.js";

// These types are missing from the DTO file but imported in the controller
export interface CreateConversationDto {
    type: ConversationType;
    title?: string;
    description?: string;
    avatarUrl?: string;
    members: { userId: string; role?: ConversationRole }[];
    centerId?: string;
    activityId?: string;
    batchId?: string;
    programId?: string;
}

export interface UpdateConversationDto {
    title?: string;
    description?: string;
    avatarUrl?: string;
}

export interface AddMemberDto {
    userId: string;
    role?: ConversationRole;
}

class ConversationService {
    
    private async checkEntityExists(payload: CreateConversationDto) {
        if (payload.centerId) {
            const exists = await prisma.center.findUnique({ where: { id: payload.centerId }, select: { id: true } });
            if (!exists) throw new NotFoundError("Center not found");
        }
        if (payload.activityId) {
            const exists = await prisma.activity.findUnique({ where: { id: payload.activityId }, select: { id: true } });
            if (!exists) throw new NotFoundError("Activity not found");
        }
        if (payload.batchId) {
            const exists = await prisma.batch.findUnique({ where: { id: payload.batchId }, select: { id: true } });
            if (!exists) throw new NotFoundError("Batch not found");
        }
        if (payload.programId) {
            const exists = await prisma.program.findUnique({ where: { id: payload.programId }, select: { id: true } });
            if (!exists) throw new NotFoundError("Program not found");
        }
    }

    private async validateMembership(userId: string, conversationId: string) {
        const member = await prisma.conversationMember.findUnique({
            where: {
                conversationId_userId: { conversationId, userId }
            },
            select: {
                role: true,
                conversation: {
                    select: { isArchived: true }
                }
            }
        });

        if (!member) {
            throw new ForbiddenError("You are not a member of this conversation.");
        }
        
        return member;
    }

    private validateNotArchived(isArchived: boolean) {
        if (isArchived) {
            throw new BadRequestError("Action not permitted on an archived conversation.");
        }
    }

    private validateAdminOrOwner(role: ConversationRole) {
        if (role !== ConversationRole.admin && role !== ConversationRole.owner) {
            throw new ForbiddenError("You do not have permission to perform this action.");
        }
    }

    async searchChatUsers(userId: string, search?: string, limit: number = 20) {
        const take = Math.min(Math.max(limit, 1), 100);
        const where: Prisma.UserWhereInput = {
            isActive: true,
            id: { not: userId },
            ...(search && search.trim()
                ? {
                      OR: [
                          { fullName: { contains: search.trim(), mode: "insensitive" } },
                          { email: { contains: search.trim(), mode: "insensitive" } },
                      ],
                  }
                : {}),
        };

        const [users, total] = await Promise.all([
            prisma.user.findMany({
                where,
                take,
                orderBy: { fullName: "asc" },
                select: {
                    id: true,
                    fullName: true,
                    email: true,
                    role: true,
                    isActive: true,
                    createdAt: true,
                },
            }),
            prisma.user.count({ where }),
        ]);

        return {
            users,
            total,
            page: 1,
            totalPages: Math.ceil(total / take),
        };
    }

    async createConversation(userId: string, payload: CreateConversationDto) {
        await this.checkEntityExists(payload);

        // Include the creator in the members list if not already there
        const membersList = payload.members ? [...payload.members] : [];
        if (!membersList.find(m => m.userId === userId)) {
            membersList.push({ userId, role: ConversationRole.owner });
        } else {
            // Ensure creator is owner
            const creator = membersList.find(m => m.userId === userId);
            if (creator) creator.role = ConversationRole.owner;
        }

        if (payload.type === ConversationType.direct) {
            if (membersList.length !== 2) {
                throw new BadRequestError("Direct messages must have exactly two members.");
            }

            const otherUser = membersList.find(m => m.userId !== userId);
            if (!otherUser) {
                throw new BadRequestError("Direct messages must have exactly two distinct members.");
            }

            // Check for existing DM where both users are members
            const existingDM = await prisma.conversation.findFirst({
                where: {
                    type: ConversationType.direct,
                    AND: [
                        { members: { some: { userId } } },
                        { members: { some: { userId: otherUser.userId } } }
                    ]
                },
                select: {
                    id: true,
                    type: true,
                    title: true,
                    description: true,
                    avatarUrl: true,
                    isArchived: true,
                    createdAt: true,
                    updatedAt: true,
                    messages: {
                        orderBy: { createdAt: 'desc' },
                        take: 1,
                        select: {
                            id: true,
                            content: true,
                            type: true,
                            createdAt: true,
                            senderId: true,
                            isDeleted: true
                        }
                    },
                    members: {
                        select: {
                            id: true,
                            conversationId: true,
                            userId: true,
                            role: true,
                            joinedAt: true,
                            lastReadAt: true,
                            isPinned: true,
                            isArchived: true,
                            user: {
                                select: {
                                    id: true,
                                    fullName: true,
                                    email: true
                                }
                            }
                        }
                    }
                }
            });

            if (existingDM) {
                return existingDM;
            }
        }

        return await prisma.$transaction(async (tx) => {
            const conversation = await tx.conversation.create({
                data: {
                    type: payload.type,
                    title: payload.title,
                    description: payload.description,
                    avatarUrl: payload.avatarUrl,
                    createdBy: userId,
                    centerId: payload.centerId,
                    activityId: payload.activityId,
                    batchId: payload.batchId,
                    programId: payload.programId,
                    members: {
                        create: membersList.map(m => ({
                            userId: m.userId,
                            role: m.role || ConversationRole.member
                        }))
                    }
                },
                select: {
                    id: true,
                    type: true,
                    title: true,
                    description: true,
                    avatarUrl: true,
                    isArchived: true,
                    createdAt: true,
                    updatedAt: true,
                    members: {
                        select: {
                            id: true,
                            conversationId: true,
                            userId: true,
                            role: true,
                            joinedAt: true,
                            lastReadAt: true,
                            isPinned: true,
                            isArchived: true,
                            user: {
                                select: {
                                    id: true,
                                    fullName: true,
                                    email: true
                                }
                            }
                        }
                    }
                }
            });
            return conversation;
        });
    }

    async getUserConversations(userId: string, cursor?: string, limit: number = 20) {
        const query: Prisma.ConversationFindManyArgs = {
            where: {
                isArchived: false,
                members: {
                    some: { userId, isArchived: false }
                }
            },
            select: {
                id: true,
                type: true,
                title: true,
                description: true,
                avatarUrl: true,
                isArchived: true,
                createdAt: true,
                updatedAt: true,
                messages: {
                    orderBy: { createdAt: 'desc' },
                    take: 1,
                    select: {
                        id: true,
                        content: true,
                        type: true,
                        createdAt: true,
                        senderId: true,
                        isDeleted: true,
                        attachments: {
                            select: {
                                id: true,
                                url: true,
                                fileName: true,
                                mimeType: true,
                                fileSize: true,
                                createdAt: true
                            }
                        }
                    }
                },
                members: {
                    select: { 
                        id: true,
                        conversationId: true,
                        userId: true,
                        role: true,
                        joinedAt: true,
                        lastReadAt: true,
                        isPinned: true,
                        isArchived: true,
                        user: {
                            select: {
                                id: true,
                                fullName: true,
                                email: true
                            }
                        }
                    }
                }
            },
            orderBy: { updatedAt: 'desc' },
            take: limit
        };

        if (cursor) {
            query.cursor = { id: cursor };
            query.skip = 1;
        }

        const conversations = await prisma.conversation.findMany(query);
        return conversations;
    }

    async getConversationById(userId: string, conversationId: string) {
        await this.validateMembership(userId, conversationId);

        const conversation = await prisma.conversation.findUnique({
            where: { id: conversationId },
            select: {
                id: true,
                type: true,
                title: true,
                description: true,
                avatarUrl: true,
                isArchived: true,
                createdAt: true,
                updatedAt: true,
                centerId: true,
                activityId: true,
                batchId: true,
                programId: true,
                members: {
                    select: {
                        id: true,
                        conversationId: true,
                        userId: true,
                        role: true,
                        joinedAt: true,
                        lastReadAt: true,
                        isPinned: true,
                        isArchived: true,
                        user: {
                            select: {
                                id: true,
                                fullName: true,
                                email: true
                            }
                        }
                    }
                }
            }
        });

        if (!conversation) {
            throw new NotFoundError("Conversation not found.");
        }

        return conversation;
    }

    async updateConversation(userId: string, conversationId: string, payload: UpdateConversationDto) {
        const member = await this.validateMembership(userId, conversationId);
        this.validateNotArchived(member.conversation.isArchived);
        this.validateAdminOrOwner(member.role);

        return await prisma.conversation.update({
            where: { id: conversationId },
            data: {
                title: payload.title,
                description: payload.description,
                avatarUrl: payload.avatarUrl,
                updatedAt: new Date()
            },
            select: {
                id: true,
                type: true,
                title: true,
                description: true,
                avatarUrl: true,
                isArchived: true,
                updatedAt: true
            }
        });
    }

    async archiveConversation(userId: string, conversationId: string) {
        const member = await this.validateMembership(userId, conversationId);
        this.validateAdminOrOwner(member.role);

        await prisma.$transaction([
            prisma.conversation.update({
                where: { id: conversationId },
                data: { isArchived: true }
            }),
            prisma.conversationMember.updateMany({
                where: { conversationId },
                data: { isArchived: true }
            })
        ]);
    }

    async getConversationMembers(userId: string, conversationId: string) {
        await this.validateMembership(userId, conversationId);

        return await prisma.conversationMember.findMany({
            where: { conversationId },
            select: {
                id: true,
                conversationId: true,
                userId: true,
                role: true,
                joinedAt: true,
                lastReadAt: true,
                user: {
                    select: {
                        id: true,
                        fullName: true,
                        email: true
                    }
                }
            }
        });
    }

    async addMember(userId: string, conversationId: string, payload: AddMemberDto) {
        const member = await this.validateMembership(userId, conversationId);
        this.validateNotArchived(member.conversation.isArchived);
        this.validateAdminOrOwner(member.role);

        const conversation = await prisma.conversation.findUnique({
            where: { id: conversationId },
            select: { type: true }
        });

        if (conversation?.type === ConversationType.direct) {
            throw new BadRequestError("Cannot add members to a direct message conversation.");
        }

        const existingMember = await prisma.conversationMember.findUnique({
            where: {
                conversationId_userId: {
                    conversationId,
                    userId: payload.userId
                }
            }
        });

        if (existingMember) {
            throw new ConflictError("User is already a member of this conversation.");
        }

        return await prisma.conversationMember.create({
            data: {
                conversationId,
                userId: payload.userId,
                role: payload.role || ConversationRole.member
            },
            select: {
                id: true,
                conversationId: true,
                userId: true,
                role: true,
                joinedAt: true,
                user: {
                    select: {
                        id: true,
                        fullName: true,
                        email: true
                    }
                }
            }
        });
    }

    async removeMember(userId: string, conversationId: string, memberId: string) {
        const member = await this.validateMembership(userId, conversationId);
        this.validateNotArchived(member.conversation.isArchived);

        if (userId !== memberId) {
            // Removing someone else
            this.validateAdminOrOwner(member.role);
        } else {
            // Self-removal
            if (member.role === ConversationRole.owner) {
                const otherMembers = await prisma.conversationMember.count({
                    where: { conversationId, userId: { not: userId } }
                });

                if (otherMembers > 0) {
                    const otherOwners = await prisma.conversationMember.count({
                        where: { conversationId, userId: { not: userId }, role: ConversationRole.owner }
                    });

                    if (otherOwners === 0) {
                        // Promote another member (prefer admin, otherwise earliest joined member) to owner so owner can leave cleanly
                        const nextOwner = await prisma.conversationMember.findFirst({
                            where: { conversationId, userId: { not: userId } },
                            orderBy: [
                                { role: "asc" },
                                { joinedAt: "asc" }
                            ]
                        });
                        if (nextOwner) {
                            await prisma.conversationMember.update({
                                where: { id: nextOwner.id },
                                data: { role: ConversationRole.owner }
                            });
                        }
                    }
                }
            }
        }

        const targetMember = await prisma.conversationMember.findUnique({
            where: { conversationId_userId: { conversationId, userId: memberId } }
        });

        if (!targetMember) {
            throw new NotFoundError("Member not found in this conversation.");
        }

        await prisma.conversationMember.delete({
            where: { conversationId_userId: { conversationId, userId: memberId } }
        });
    }

    async markConversationAsRead(userId: string, conversationId: string) {
        await this.validateMembership(userId, conversationId);

        const lastReadAt = new Date();
        await prisma.conversationMember.update({
            where: {
                conversationId_userId: { conversationId, userId }
            },
            data: {
                lastReadAt
            }
        });

        // Also mark any unread chat notifications for this conversation as read
        try {
            await notificationService.markConversationNotificationsAsRead(userId, conversationId);
        } catch (err) {
            console.error("Failed to mark conversation notifications as read:", err);
        }

        return lastReadAt;
    }
}

export default new ConversationService();
