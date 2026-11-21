import type { Prisma } from "@prisma/client";
import { getScopedCenterIds, isAdminRole } from "../config/rbac.js";
import { assertCenterAccess } from "../lib/centerScope.js";
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from "../lib/errors.js";
import prisma from "../lib/prisma.js";
import { getTodayUtcDateOnly } from "../utils/dateOnly.js";
import type { JwtPayload } from "../utils/jwt.js";

export type ListBatchesParams = {
  centerId?: string;
  programId?: string;
  activityId?: string;
  teacherId?: string;
  search?: string;
};

export type CreateBatchInput = {
  centerId: string;
  programId?: string;
  activityId?: string;
  name: string;
  teacherId?: string | null;
  maxStudents?: number | null;
};

export type UpdateBatchInput = {
  name?: string;
  teacherId?: string | null;
  maxStudents?: number | null;
};

const batchInclude = {
  center: { select: { id: true, name: true } },
  teacher: { select: { id: true, fullName: true, email: true } },
  activity: {
    select: {
      id: true,
      name: true,
      programId: true,
      program: { select: { id: true, name: true, code: true } },
    },
  },
  _count: {
    select: {
      batchEnrollments: true,
      attendanceSessions: true,
    },
  },
} satisfies Prisma.BatchInclude;

async function resolveBackingActivityId(
  userId: string,
  centerId: string,
  programId?: string,
  activityId?: string,
): Promise<string> {
  if (activityId) {
    const activity = await prisma.activity.findFirst({
      where: { id: activityId, isActive: true },
      select: { id: true, centerId: true, programId: true },
    });
    if (!activity) {
      throw new NotFoundError("Activity");
    }
    if (activity.centerId !== centerId) {
      throw new ValidationError("Activity does not belong to the selected center");
    }
    if (programId && activity.programId && activity.programId !== programId) {
      throw new ValidationError("Activity does not belong to the selected program");
    }
    return activity.id;
  }

  if (!programId) {
    throw new ValidationError("Either activityId or programId is required");
  }

  const program = await prisma.program.findFirst({
    where: { id: programId, isActive: true },
    select: { id: true, name: true },
  });
  if (!program) {
    throw new NotFoundError("Program");
  }

  const existingContainer = await prisma.activity.findFirst({
    where: {
      centerId,
      programId,
      activityType: "class",
      isActive: true,
    },
    select: { id: true },
    orderBy: { createdAt: "asc" },
  });
  if (existingContainer) {
    return existingContainer.id;
  }

  const createdContainer = await prisma.activity.create({
    data: {
      centerId,
      programId,
      name: `${program.name} Classes`,
      description: `Auto-created class cohort container for ${program.name}`,
      activityType: "class",
      status: "ongoing",
      startDate: getTodayUtcDateOnly(),
      volunteers: [],
      createdBy: userId,
    },
    select: { id: true },
  });

  return createdContainer.id;
}

async function validateTeacherUser(teacherId: string | null | undefined) {
  if (!teacherId) return;
  const teacher = await prisma.user.findFirst({
    where: { id: teacherId, isActive: true },
    select: { id: true },
  });
  if (!teacher) {
    throw new NotFoundError("Teacher user");
  }
}

export async function listBatches(user: JwtPayload, params: ListBatchesParams) {
  const where: Prisma.BatchWhereInput = {};

  if (params.centerId) {
    assertCenterAccess(user, params.centerId, "No access to this center");
    where.centerId = params.centerId;
  } else {
    const scopedCenterIds = getScopedCenterIds(user);
    if (scopedCenterIds !== undefined) {
      where.centerId = { in: scopedCenterIds };
    }
  }

  if (params.activityId) {
    where.activityId = params.activityId;
  }
  if (params.teacherId) {
    where.teacherId = params.teacherId;
  }
  if (params.programId) {
    where.activity = { programId: params.programId };
  }
  if (params.search?.trim()) {
    where.name = { contains: params.search.trim(), mode: "insensitive" };
  }

  return prisma.batch.findMany({
    where,
    include: batchInclude,
    orderBy: [{ createdAt: "desc" }],
  });
}

export async function getBatchById(user: JwtPayload, batchId: string) {
  const batch = await prisma.batch.findUnique({
    where: { id: batchId },
    include: {
      ...batchInclude,
      batchEnrollments: {
        include: {
          student: {
            select: {
              id: true,
              fullName: true,
              rollNumber: true,
              programId: true,
              centerId: true,
              isActive: true,
              guardianPhone: true,
            },
          },
        },
        orderBy: [{ student: { fullName: "asc" } }],
      },
    },
  });

  if (!batch) {
    throw new NotFoundError("Batch");
  }

  assertCenterAccess(user, batch.centerId, "No access to this batch");
  return batch;
}

export async function createBatch(user: JwtPayload, input: CreateBatchInput) {
  assertCenterAccess(user, input.centerId, "No access to create batches in this center");

  const center = await prisma.center.findFirst({
    where: { id: input.centerId, isActive: true },
    select: { id: true },
  });
  if (!center) {
    throw new NotFoundError("Center");
  }

  const trimmedName = input.name.trim();
  if (!trimmedName) {
    throw new ValidationError("Batch name is required");
  }

  const resolvedActivityId = await resolveBackingActivityId(
    user.userId,
    input.centerId,
    input.programId,
    input.activityId,
  );

  await validateTeacherUser(input.teacherId);

  const duplicate = await prisma.batch.findFirst({
    where: {
      centerId: input.centerId,
      activityId: resolvedActivityId,
      name: { equals: trimmedName, mode: "insensitive" },
    },
    select: { id: true },
  });
  if (duplicate) {
    throw new ConflictError(`A batch named '${trimmedName}' already exists in this class`);
  }

  return prisma.batch.create({
    data: {
      centerId: input.centerId,
      activityId: resolvedActivityId,
      name: trimmedName,
      teacherId: input.teacherId ?? null,
      maxStudents: input.maxStudents ?? null,
    },
    include: batchInclude,
  });
}

export async function updateBatch(user: JwtPayload, batchId: string, input: UpdateBatchInput) {
  const existing = await prisma.batch.findUnique({
    where: { id: batchId },
    include: {
      _count: { select: { batchEnrollments: true } },
    },
  });

  if (!existing) {
    throw new NotFoundError("Batch");
  }
  assertCenterAccess(user, existing.centerId, "No access to update this batch");

  const nextName = input.name !== undefined ? input.name.trim() : undefined;
  if (nextName !== undefined && !nextName) {
    throw new ValidationError("Batch name cannot be empty");
  }

  if (nextName && nextName.toLowerCase() !== existing.name.toLowerCase()) {
    const duplicate = await prisma.batch.findFirst({
      where: {
        centerId: existing.centerId,
        activityId: existing.activityId,
        id: { not: batchId },
        name: { equals: nextName, mode: "insensitive" },
      },
      select: { id: true },
    });
    if (duplicate) {
      throw new ConflictError(`A batch named '${nextName}' already exists in this class`);
    }
  }

  if (input.teacherId !== undefined) {
    await validateTeacherUser(input.teacherId);
  }

  if (
    input.maxStudents !== undefined &&
    input.maxStudents !== null &&
    input.maxStudents < existing._count.batchEnrollments
  ) {
    throw new ValidationError(
      `maxStudents (${input.maxStudents}) cannot be less than current enrolled count (${existing._count.batchEnrollments})`,
    );
  }

  return prisma.batch.update({
    where: { id: batchId },
    data: {
      ...(nextName !== undefined ? { name: nextName } : {}),
      ...(input.teacherId !== undefined ? { teacherId: input.teacherId } : {}),
      ...(input.maxStudents !== undefined ? { maxStudents: input.maxStudents } : {}),
      updatedAt: new Date(),
    },
    include: batchInclude,
  });
}

export async function deleteBatch(user: JwtPayload, batchId: string) {
  const existing = await prisma.batch.findUnique({
    where: { id: batchId },
    include: {
      _count: {
        select: { attendanceSessions: true, batchEnrollments: true },
      },
    },
  });

  if (!existing) {
    throw new NotFoundError("Batch");
  }
  if (!isAdminRole(user.role)) {
    throw new ForbiddenError("Only admins can delete batches");
  }
  assertCenterAccess(user, existing.centerId, "No access to delete this batch");

  if (existing._count.attendanceSessions > 0) {
    throw new ConflictError("Cannot delete a batch that already has attendance sessions");
  }

  await prisma.$transaction(async (tx) => {
    await tx.batchEnrollment.deleteMany({ where: { batchId } });
    await tx.batch.delete({ where: { id: batchId } });
  });

  return { deleted: true, id: batchId };
}

export async function enrollStudentsInBatch(
  user: JwtPayload,
  batchId: string,
  studentIds: string[],
) {
  const batch = await prisma.batch.findUnique({
    where: { id: batchId },
    include: {
      activity: { select: { id: true, programId: true } },
    },
  });
  if (!batch) {
    throw new NotFoundError("Batch");
  }
  assertCenterAccess(user, batch.centerId, "No access to enroll students in this batch");

  const uniqueIds = Array.from(new Set(studentIds));
  if (uniqueIds.length === 0) {
    throw new ValidationError("At least one studentId is required");
  }

  const students = await prisma.student.findMany({
    where: { id: { in: uniqueIds } },
    select: {
      id: true,
      fullName: true,
      centerId: true,
      programId: true,
      isActive: true,
    },
  });
  const studentMap = new Map(students.map((s) => [s.id, s]));

  for (const sid of uniqueIds) {
    const stu = studentMap.get(sid);
    if (!stu) {
      throw new NotFoundError(`Student (${sid})`);
    }
    if (!stu.isActive) {
      throw new ValidationError(`Inactive student '${stu.fullName}' cannot be enrolled in a batch`);
    }
    if (stu.centerId !== batch.centerId) {
      throw new ValidationError(`Student '${stu.fullName}' belongs to a different center`);
    }
    if (batch.activity?.programId && stu.programId !== batch.activity.programId) {
      throw new ValidationError(
        `Student '${stu.fullName}' does not belong to this batch's program`,
      );
    }
  }

  const existingEnrollments = await prisma.batchEnrollment.findMany({
    where: { batchId },
    select: { studentId: true },
  });
  const alreadyEnrolled = new Set(existingEnrollments.map((e) => e.studentId));
  const toInsert = uniqueIds.filter((id) => !alreadyEnrolled.has(id));

  if (
    batch.maxStudents !== null &&
    existingEnrollments.length + toInsert.length > batch.maxStudents
  ) {
    throw new ValidationError(
      `Batch capacity limit (${batch.maxStudents}) would be exceeded`,
    );
  }

  if (toInsert.length > 0) {
    const today = getTodayUtcDateOnly();
    await prisma.batchEnrollment.createMany({
      data: toInsert.map((studentId) => ({
        batchId,
        studentId,
        enrolledOn: today,
      })),
      skipDuplicates: true,
    });
  }

  const updated = await getBatchById(user, batchId);
  return {
    addedCount: toInsert.length,
    alreadyEnrolledCount: uniqueIds.length - toInsert.length,
    batch: updated,
  };
}

export async function removeStudentFromBatch(
  user: JwtPayload,
  batchId: string,
  studentId: string,
) {
  const batch = await prisma.batch.findUnique({
    where: { id: batchId },
    select: { id: true, centerId: true },
  });
  if (!batch) {
    throw new NotFoundError("Batch");
  }
  assertCenterAccess(user, batch.centerId, "No access to manage enrollments in this batch");

  const existing = await prisma.batchEnrollment.findUnique({
    where: { batchId_studentId: { batchId, studentId } },
    select: { id: true },
  });
  if (!existing) {
    throw new NotFoundError("Batch enrollment");
  }

  await prisma.batchEnrollment.delete({
    where: { batchId_studentId: { batchId, studentId } },
  });

  return { removed: true, batchId, studentId };
}
