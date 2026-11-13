import type { ActivityStatus, ActivityType, Prisma, UserActivityAssignment } from "@prisma/client";
import {
  ROLES,
  getScopedCenterIds,
  isAdminRole,
  isGlobalAdmin,
} from "../config/rbac.js";
import { assertCenterAccess } from "../lib/centerScope.js";
import { ForbiddenError, NotFoundError, ValidationError } from "../lib/errors.js";
import prisma from "../lib/prisma.js";
import {
  getTodayUtcDateOnly,
  parseOptionalUtcDateOnly,
  parseUtcDateOnly,
} from "../utils/dateOnly.js";
import type { JwtPayload } from "../utils/jwt.js";

export type ListActivitiesParams = {
  centerId?: string;
  programId?: string;
  status?: string;
  from?: string;
  to?: string;
  search?: string;
};

export type CreateActivityInput = {
  centerIds: string[];
  programId?: string;
  name: string;
  description?: string | null;
  volunteers?: string[];
  activityType?: ActivityType;
  status?: ActivityStatus;
  startDate?: string | Date;
  endDate?: string | Date;
};

export type UpdateActivityInput = {
  programId?: string | null;
  name?: string;
  description?: string | null;
  volunteers?: string[];
  activityType?: ActivityType;
  status?: ActivityStatus;
  completionNotes?: string | null;
  startDate?: string | Date | null;
  endDate?: string | Date | null;
};

const VALID_STATUSES: ReadonlySet<string> = new Set([
  "planned",
  "ongoing",
  "completed",
  "cancelled",
]);

function normalizeUtcDateInput(
  value: string | Date | null | undefined,
  field: string,
): Date | null {
  if (value === undefined || value === null || value === "") return null;
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) {
      throw new ValidationError(`Invalid ${field} date`);
    }
    return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
  }
  return parseUtcDateOnly(value, field);
}

export async function listActivities(user: JwtPayload, params: ListActivitiesParams) {
  const { centerId, programId, status, from, to, search } = params;
  const where: Prisma.ActivityWhereInput = { isActive: true };

  if (centerId) {
    assertCenterAccess(user, centerId, "No access to this center");
    where.centerId = centerId;
  } else {
    const scopedCenterIds = getScopedCenterIds(user);
    if (scopedCenterIds !== undefined) {
      where.centerId = { in: scopedCenterIds };
    }
  }

  if (programId) {
    where.programId = programId;
  }

  if (status) {
    if (!VALID_STATUSES.has(status)) {
      throw new ValidationError(`Invalid activity status '${status}'`);
    }
    where.status = status as ActivityStatus;
  }

  if (from || to) {
    where.startDate = {};
    if (from) where.startDate.gte = parseUtcDateOnly(from, "from");
    if (to) where.startDate.lte = parseUtcDateOnly(to, "to");
  }

  if (search?.trim()) {
    where.name = { contains: search.trim(), mode: "insensitive" };
  }

  if (user.role === ROLES.VOLUNTEER) {
    const today = getTodayUtcDateOnly();
    where.userAssignments = {
      some: {
        userId: user.userId,
        validFrom: { lte: today },
        OR: [{ validUntil: null }, { validUntil: { gte: today } }],
      },
    };
  }

  return prisma.activity.findMany({
    where,
    include: {
      program: { select: { id: true, name: true } },
      center: { select: { id: true, name: true } },
    },
    orderBy: [{ startDate: "desc" }, { createdAt: "desc" }],
  });
}

export async function getActivity(user: JwtPayload, activityId: string) {
  const activity = await prisma.activity.findUnique({
    where: { id: activityId },
    include: {
      program: { select: { id: true, name: true } },
      center: { select: { id: true, name: true } },
      userAssignments: {
        include: {
          user: {
            select: { id: true, fullName: true, role: true, email: true },
          },
        },
      },
      _count: {
        select: { attendanceSessions: true, activityEnrollments: true },
      },
    },
  });

  if (!activity || !activity.isActive) {
    throw new NotFoundError("Activity");
  }

  if (!isGlobalAdmin(user.role)) {
    const inCenter = user.centerIds.includes(activity.centerId);
    const assigned = activity.userAssignments.some(
      (a: UserActivityAssignment) => a.userId === user.userId,
    );
    if (!inCenter && !assigned) {
      throw new ForbiddenError("Access to this activity is denied");
    }
  }

  return activity;
}

export async function createActivity(user: JwtPayload, data: CreateActivityInput) {
  const {
    centerIds,
    programId,
    name,
    description,
    volunteers,
    activityType,
    status,
    startDate,
    endDate,
  } = data;

  const trimmedName = name?.trim();
  if (!centerIds || !centerIds.length || !trimmedName) {
    throw new ValidationError("centerIds and name are required");
  }

  if (status && !VALID_STATUSES.has(status)) {
    throw new ValidationError(`Invalid activity status '${status}'`);
  }

  const parsedStart = normalizeUtcDateInput(startDate, "startDate");
  const parsedEnd = normalizeUtcDateInput(endDate, "endDate");
  if (parsedStart && parsedEnd && parsedEnd < parsedStart) {
    throw new ValidationError("End date cannot be earlier than start date");
  }

  const uniqueCenterIds = Array.from(new Set(centerIds));
  for (const centerId of uniqueCenterIds) {
    assertCenterAccess(user, centerId, "No access to create activity in this center");
    const center = await prisma.center.findFirst({
      where: { id: centerId, isActive: true },
      select: { id: true },
    });
    if (!center) {
      throw new NotFoundError("Center");
    }
  }

  if (programId) {
    const program = await prisma.program.findFirst({
      where: { id: programId, isActive: true },
      select: { id: true },
    });
    if (!program) {
      throw new NotFoundError("Program");
    }
  }

  const cleanedVolunteers = (volunteers || []).map((v) => v.trim()).filter(Boolean);

  return prisma.$transaction(async (tx) => {
    const createdActivities = [];
    for (const centerId of uniqueCenterIds) {
      const activity = await tx.activity.create({
        data: {
          centerId,
          programId: programId || null,
          name: trimmedName,
          description: description?.trim() || null,
          volunteers: cleanedVolunteers,
          activityType: activityType ?? "general",
          status: status ?? "planned",
          startDate: parsedStart,
          endDate: parsedEnd,
          createdBy: user.userId,
        },
        include: {
          program: { select: { id: true, name: true } },
          center: { select: { id: true, name: true } },
        },
      });
      createdActivities.push(activity);
    }
    return createdActivities;
  });
}

export async function updateActivity(
  user: JwtPayload,
  activityId: string,
  data: UpdateActivityInput,
) {
  const activity = await prisma.activity.findUnique({ where: { id: activityId } });

  if (!activity || !activity.isActive) {
    throw new NotFoundError("Activity");
  }

  assertCenterAccess(user, activity.centerId, "No access to update this activity");

  if (data.status && !VALID_STATUSES.has(data.status)) {
    throw new ValidationError(`Invalid activity status '${data.status}'`);
  }

  if (data.programId) {
    const program = await prisma.program.findFirst({
      where: { id: data.programId, isActive: true },
      select: { id: true },
    });
    if (!program) {
      throw new NotFoundError("Program");
    }
  }

  const nextStart =
    data.startDate === undefined
      ? activity.startDate
      : normalizeUtcDateInput(data.startDate, "startDate");
  const nextEnd =
    data.endDate === undefined
      ? activity.endDate
      : normalizeUtcDateInput(data.endDate, "endDate");

  if (nextStart && nextEnd && nextEnd < nextStart) {
    throw new ValidationError("End date cannot be earlier than start date");
  }

  const nextName = data.name !== undefined ? data.name.trim() : undefined;
  if (nextName !== undefined && !nextName) {
    throw new ValidationError("Activity name cannot be empty");
  }

  const nextVolunteers =
    data.volunteers !== undefined
      ? data.volunteers.map((v) => v.trim()).filter(Boolean)
      : undefined;

  const statusChanged = Boolean(data.status && data.status !== activity.status);

  return prisma.$transaction(async (tx) => {
    const updated = await tx.activity.update({
      where: { id: activityId },
      data: {
        ...(nextName !== undefined ? { name: nextName } : {}),
        ...(data.description !== undefined
          ? { description: data.description?.trim() || null }
          : {}),
        ...(data.programId !== undefined ? { programId: data.programId || null } : {}),
        ...(nextVolunteers !== undefined ? { volunteers: nextVolunteers } : {}),
        ...(data.activityType !== undefined ? { activityType: data.activityType } : {}),
        ...(data.status !== undefined ? { status: data.status } : {}),
        ...(data.completionNotes !== undefined
          ? { completionNotes: data.completionNotes?.trim() || null }
          : {}),
        ...(data.startDate !== undefined ? { startDate: nextStart } : {}),
        ...(data.endDate !== undefined ? { endDate: nextEnd } : {}),
      },
      include: {
        program: { select: { id: true, name: true } },
        center: { select: { id: true, name: true } },
      },
    });

    if (statusChanged && data.status) {
      await tx.activityStatusLog.create({
        data: {
          activityId: activity.id,
          centerId: activity.centerId,
          fromStatus: activity.status,
          toStatus: data.status,
          notes: data.completionNotes?.trim() || null,
          changedBy: user.userId,
        },
      });
    }

    return updated;
  });
}

export async function deleteActivity(user: JwtPayload, activityId: string) {
  const activity = await prisma.activity.findUnique({
    where: { id: activityId },
    include: {
      _count: {
        select: {
          attendanceSessions: true,
          batches: true,
          exams: true,
          activityEnrollments: true,
        },
      },
    },
  });

  if (!activity || !activity.isActive) {
    throw new NotFoundError("Activity");
  }

  if (!isAdminRole(user.role)) {
    throw new ForbiddenError("Only admins can delete activities");
  }

  assertCenterAccess(user, activity.centerId, "No access to delete this activity");

  if (activity._count.attendanceSessions > 0) {
    throw new ValidationError("Cannot delete activity with linked attendance sessions");
  }

  if (
    activity._count.batches > 0 ||
    activity._count.exams > 0 ||
    activity._count.activityEnrollments > 0
  ) {
    return prisma.activity.update({
      where: { id: activityId },
      data: { isActive: false },
    });
  }

  return prisma.$transaction(async (tx) => {
    await tx.userActivityAssignment.deleteMany({ where: { activityId } });
    await tx.activityStatusLog.deleteMany({ where: { activityId } });
    return tx.activity.delete({ where: { id: activityId } });
  });
}

export async function assignVolunteer(
  user: JwtPayload,
  activityId: string,
  data: { userId: string; validFrom: string | Date; validUntil?: string | Date | null },
) {
  const { userId, validFrom, validUntil } = data;

  if (!userId || !validFrom) {
    throw new ValidationError("userId and validFrom are required");
  }

  const activity = await prisma.activity.findUnique({ where: { id: activityId } });
  if (!activity || !activity.isActive) {
    throw new NotFoundError("Activity");
  }

  assertCenterAccess(user, activity.centerId, "No access to manage assignments for this activity");

  const targetUser = await prisma.user.findFirst({
    where: { id: userId, isActive: true },
    select: { id: true },
  });
  if (!targetUser) {
    throw new NotFoundError("User");
  }

  const parsedFrom =
    validFrom instanceof Date
      ? normalizeUtcDateInput(validFrom, "validFrom")!
      : parseUtcDateOnly(validFrom, "validFrom");
  const parsedUntil =
    validUntil instanceof Date
      ? normalizeUtcDateInput(validUntil, "validUntil")
      : parseOptionalUtcDateOnly(validUntil ?? undefined, "validUntil") ?? null;

  if (parsedUntil && parsedUntil < parsedFrom) {
    throw new ValidationError("validUntil cannot be earlier than validFrom");
  }

  return prisma.userActivityAssignment.upsert({
    where: {
      userId_activityId: {
        userId,
        activityId,
      },
    },
    update: {
      validFrom: parsedFrom,
      validUntil: parsedUntil,
    },
    create: {
      userId,
      activityId,
      validFrom: parsedFrom,
      validUntil: parsedUntil,
      createdBy: user.userId,
    },
  });
}

export async function removeVolunteerAssignment(
  user: JwtPayload,
  activityId: string,
  userId: string,
) {
  const activity = await prisma.activity.findUnique({ where: { id: activityId } });
  if (!activity || !activity.isActive) {
    throw new NotFoundError("Activity");
  }

  assertCenterAccess(user, activity.centerId, "No access to manage assignments for this activity");

  const existing = await prisma.userActivityAssignment.findFirst({
    where: { userId, activityId },
  });

  if (!existing) {
    throw new NotFoundError("Assignment");
  }

  return prisma.userActivityAssignment.delete({
    where: { id: existing.id },
  });
}
