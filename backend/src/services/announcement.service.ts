import prisma from '../lib/prisma.js';
import {
  NotificationEntityType,
  NotificationPriority,
  NotificationType,
  Prisma,
  UserRole,
} from '@prisma/client';
import { AppError } from '../lib/errors.js';
import { buildCursorPagination } from '../utils/queryHelpers.js';
import notificationService from './notifications.service.js';

interface CreateAnnouncementData {
  title: string;
  body?: string;
  message?: string;
  targetRoles: string[];
  isPinned?: boolean;
  expiresAt?: Date;
  centerId?: string;
  programId?: string;
}

export const createAnnouncement = async (
  data: CreateAnnouncementData,
  { userId, role, allowedCenterIds }: { userId: string; role: string; allowedCenterIds: string[] }
) => {
  if (role !== 'super_admin' && !data.centerId) {
    throw new AppError('Center ID is required for non-super_admin roles', 400);
  }
  
  if (data.centerId && role !== 'super_admin' && !allowedCenterIds.includes(data.centerId)) {
    throw new AppError('Cannot create announcement for unauthorized center', 403);
  }

  const bodyText = data.body ?? data.message ?? '';

  const announcement = await prisma.announcement.create({
    data: {
      title: data.title,
      body: bodyText,
      targetRoles: data.targetRoles || [],
      isPinned: data.isPinned ?? false,
      expiresAt: data.expiresAt,
      centerId: data.centerId,
      programId: data.programId,
      createdBy: userId,
    },
  });

  // Dispatch realtime & in-app notifications to matching users
  try {
    const validRoles = Object.values(UserRole);
    const targetRolesFilter = (data.targetRoles || []).filter((r): r is UserRole =>
      validRoles.includes(r as UserRole)
    );

    const userWhere: Prisma.UserWhereInput = {
      isActive: true,
      id: { not: userId },
      ...(targetRolesFilter.length > 0 ? { role: { in: targetRolesFilter } } : {}),
      ...(data.centerId
        ? {
            OR: [
              { role: { in: [UserRole.super_admin, UserRole.tech_admin] } },
              {
                centerAssignments: {
                  some: {
                    centerId: data.centerId,
                    validUntil: null,
                  },
                },
              },
            ],
          }
        : {}),
    };

    const recipients = await prisma.user.findMany({
      where: userWhere,
      select: { id: true },
    });

    const recipientIds = recipients.map((r) => r.id);
    if (recipientIds.length > 0) {
      await notificationService.notify({
        actorId: userId,
        recipientIds,
        type: NotificationType.announcement,
        title: `Announcement: ${announcement.title}`,
        body: announcement.body,
        entityType: NotificationEntityType.announcement,
        entityId: announcement.id,
        link: '/announcements',
        priority: announcement.isPinned
          ? NotificationPriority.high
          : NotificationPriority.medium,
        expiresAt: announcement.expiresAt ?? undefined,
        metadata: {
          announcementId: announcement.id,
          centerId: announcement.centerId,
          programId: announcement.programId,
        },
      });
    }
  } catch (error) {
    console.error('Failed to dispatch announcement notifications:', error);
  }

  return announcement;
};

export const listAnnouncements = async (
  { role, allowedCenterIds, programId }: { role: string; allowedCenterIds: string[]; programId?: string },
  cursor?: string
) => {
  const announcements = await prisma.announcement.findMany({
      where: {
        OR: [
          { centerId: null },
          { centerId: { in: allowedCenterIds } },
          ...(role === 'super_admin' ? [{}] : [])
        ],
        ...(role !== 'super_admin' ? { targetRoles: { has: role } } : {}),
        AND: [
          { OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] }
        ],
        ...(programId ? { programId } : {})
      },
    ...buildCursorPagination(cursor, 50),
    orderBy: [
      { isPinned: 'desc' },
      { createdAt: 'desc' }
    ]
  });

  return announcements;
};

export const updateAnnouncement = async (
  id: string,
  data: Partial<CreateAnnouncementData>,
  { userId: _userId, role, allowedCenterIds }: { userId: string; role: string; allowedCenterIds: string[] }
) => {
  const existing = await prisma.announcement.findUnique({ where: { id } });
  if (!existing) throw new AppError('Announcement not found', 404);

  if (role !== 'super_admin' && existing.centerId && !allowedCenterIds.includes(existing.centerId)) {
    throw new AppError('Not authorized to update this announcement', 403);
  }

  return prisma.announcement.update({
    where: { id },
    data,
  });
};

export const deleteAnnouncement = async (
  id: string,
  { role, allowedCenterIds }: { role: string; allowedCenterIds: string[] }
) => {
  const existing = await prisma.announcement.findUnique({ where: { id } });
  if (!existing) throw new AppError('Announcement not found', 404);

  if (role !== 'super_admin' && existing.centerId && !allowedCenterIds.includes(existing.centerId)) {
    throw new AppError('Not authorized to delete this announcement', 403);
  }

  return prisma.announcement.delete({
    where: { id },
  });
};
