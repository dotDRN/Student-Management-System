import type { Prisma, UserActivityAssignment } from "@prisma/client";
import { ForbiddenError, NotFoundError, ValidationError } from '../lib/errors.js';
import prisma from '../lib/prisma.js';
import type { JwtPayload } from '../lib/auth.js';
import { centerScope } from '../lib/centerScope.js';

type ListActivitiesParams = {
  centerId?: string;
  programId?: string;
  from?: string;
  to?: string;
  search?: string;
};

export async function listActivities(user: JwtPayload, params: ListActivitiesParams) {
  const { centerId, programId, from, to, search } = params;
  const where: Prisma.ActivityWhereInput = {};
  if (user.role !== "super_admin") {
    where.centerId = { in: user.centerIds };
  }

  if (centerId) {
    if (user.role !== "super_admin" && !user.centerIds.includes(centerId)) {
      throw new ForbiddenError("No access to this center");
    }
    where.centerId = centerId;
  }

  if (programId) {
    where.programId = programId;
  }

  if (from || to) {
    where.startDate = {};
    if (from) where.startDate.gte = new Date(from);
    if (to) where.startDate.lte = new Date(to);
  }

  if (search) {
    where.name = { contains: search, mode: "insensitive" };
  }

  // Volunteer specific logic
  if (user.role === "volunteer") {
    const today = new Date();
    // Only return activities assigned to this volunteer
    where.userAssignments = {
      some: {
        userId: user.userId,
        validFrom: { lte: today },
        OR: [
          { validUntil: null },
          { validUntil: { gte: today } }
        ]
      }
    };
  }

  return prisma.activity.findMany({
    where,
    include: {
      program: { select: { name: true } },
      center: { select: { name: true } },
    },
    orderBy: { startDate: "desc" },
  });
}

export async function getActivity(user: JwtPayload, activityId: string) {
  const activity = await prisma.activity.findUnique({
    where: { id: activityId },
    include: {
      userAssignments: {
        include: {
          user: {
            select: { fullName: true, role: true, email: true },
          },
        },
      },
      _count: {
        select: { attendanceSessions: true },
      },
    },
  });

  if (!activity) {
    throw new NotFoundError("Activity not found");
  }

  // Access check
  if (user.role !== "super_admin") {
    // Is the user in the center?
    const inCenter = user.centerIds.includes(activity.centerId);
    
    // Is the user directly assigned to this activity?
    const assigned = activity.userAssignments.some((a: UserActivityAssignment) => a.userId === user.userId);

    if (!inCenter && !assigned) {
      throw new ForbiddenError("Access to this activity is denied");
    }
  }

  return activity;
}

export async function createActivity(user: JwtPayload, data: { centerIds: string[]; programId?: string; name: string; description?: string; volunteers?: string[]; startDate?: string | Date; endDate?: string | Date }) {
  const { centerIds, programId, name, description, volunteers, startDate, endDate } = data;

  if (!centerIds || !centerIds.length || !name) {
    throw new ValidationError("centerIds and name are required");
  }

  for (const centerId of centerIds) {
    if (user.role !== "super_admin" && !user.centerIds.includes(centerId)) {
      throw new ForbiddenError("No access to create activity in this center");
    }
  }

  const createdActivities = [];
  for (const centerId of centerIds) {
    const activity = await prisma.activity.create({
      data: {
        centerId,
        programId,
        name,
        description,
        volunteers: volunteers || [],
        startDate: startDate ? new Date(startDate) : null,
        endDate: endDate ? new Date(endDate) : null,
        createdBy: user.userId,
      },
    });
    createdActivities.push(activity);
  }

  return createdActivities;
}

export async function updateActivity(user: JwtPayload, activityId: string, data: { name?: string; description?: string; startDate?: string | Date; endDate?: string | Date }) {
  const activity = await prisma.activity.findUnique({ where: { id: activityId } });
  
  if (!activity) {
    throw new NotFoundError("Activity not found");
  }

  if (user.role !== "super_admin" && !user.centerIds.includes(activity.centerId)) {
    throw new ForbiddenError("No access to update this activity");
  }

  const { name, description, startDate, endDate } = data;

  return prisma.activity.update({
    where: { id: activityId },
    data: {
      ...(name !== undefined && { name }),
      ...(description !== undefined && { description }),
      ...(startDate !== undefined && { startDate: startDate ? new Date(startDate) : null }),
      ...(endDate !== undefined && { endDate: endDate ? new Date(endDate) : null }),
    },
  });
}

export async function deleteActivity(user: JwtPayload, activityId: string) {
  // Check if activity exists
  const activity = await prisma.activity.findUnique({
    where: { id: activityId },
    include: { _count: { select: { attendanceSessions: true } } },
  });

  if (!activity) {
    throw new NotFoundError("Activity not found");
  }

  if (user.role !== "super_admin") {
    throw new ForbiddenError("Only admins can delete activities");
  }

  if (activity._count.attendanceSessions > 0) {
    throw new ValidationError("Cannot delete activity with linked attendance sessions");
  }

  // Delete all assignments first
  await prisma.userActivityAssignment.deleteMany({
    where: { activityId },
  });

  // Hard delete activity (as per schema)
  return prisma.activity.delete({
    where: { id: activityId },
  });
}

export async function assignVolunteer(activityId: string, data: { userId: string; validFrom: string | Date; validUntil?: string | Date }, createdBy: string) {
  const { userId, validFrom, validUntil } = data;

  if (!userId || !validFrom) {
    throw new ValidationError("userId and validFrom are required");
  }

  const activity = await prisma.activity.findUnique({ where: { id: activityId } });
  if (!activity) {
    throw new NotFoundError("Activity not found");
  }

  // Upsert or find-first-then-update/create since no unique constraint on (userId, activityId) exists in the schema.
  // Wait, let's check if there is a unique constraint in the schema for UserActivityAssignment:
  // There is no @@unique([userId, activityId]) in the schema for UserActivityAssignment!
  // So we must check if an assignment already exists manually.

  const existing = await prisma.userActivityAssignment.findFirst({
    where: { userId, activityId },
  });

  if (existing) {
    return prisma.userActivityAssignment.update({
      where: { id: existing.id },
      data: {
        validFrom: new Date(validFrom),
        validUntil: validUntil ? new Date(validUntil) : null,
      },
    });
  }

  return prisma.userActivityAssignment.create({
    data: {
      userId,
      activityId,
      validFrom: new Date(validFrom),
      validUntil: validUntil ? new Date(validUntil) : null,
      createdBy,
    },
  });
}

export async function removeVolunteerAssignment(activityId: string, userId: string) {
  const existing = await prisma.userActivityAssignment.findFirst({
    where: { userId, activityId },
  });

  if (!existing) {
    throw new NotFoundError("Assignment not found");
  }

  return prisma.userActivityAssignment.delete({
    where: { id: existing.id },
  });
}
