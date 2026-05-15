import prisma from '../lib/prisma.js';
import { AppError } from '../lib/errors.js';
import { buildCursorPagination, centerScopeWhere } from '../utils/queryHelpers.js';

interface CreateAnnouncementData {
  title: string;
  body: string;
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

  const announcement = await prisma.announcement.create({
    data: {
      ...data,
      createdBy: userId,
    },
  });

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
  { userId, role, allowedCenterIds }: { userId: string; role: string; allowedCenterIds: string[] }
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
