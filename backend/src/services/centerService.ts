import { Prisma } from "@prisma/client";
import type { JwtPayload } from '../utils/jwt.js';
import prisma from '../lib/prisma.js';
import { AppError, NotFoundError, ValidationError } from '../lib/errors.js';
import { getScopedCenterIds, isGlobalAdmin } from '../config/rbac.js';
import { assertCenterAccess } from '../lib/centerScope.js';
import {
  getTodayUtcDateOnly,
  parseOptionalUtcDateOnly,
  parseUtcDateOnly,
} from '../utils/dateOnly.js';

function activeAssignmentWhere(userId?: string) {
  const todayUtc = getTodayUtcDateOnly();
  return {
    ...(userId ? { userId } : {}),
    OR: [{ validUntil: null }, { validUntil: { gte: todayUtc } }],
  };
}

export async function listCenters(user: JwtPayload) {
  const scopedIds = getScopedCenterIds(user);
  return prisma.center.findMany({
    where: {
      isActive: true,
      ...(scopedIds !== undefined ? { id: { in: scopedIds } } : {}),
    },
    orderBy: { name: "asc" },
    include: {
      centerPrograms: {
        where: { isActive: true },
        include: { program: true },
      },
    },
  });
}

export async function getCenterDetails(user: JwtPayload, centerId: string) {
  const requesterId = user.userId;

  // Center-scoped users (including center_admin, supervisor, teacher, staff)
  // must have an active assignment to the requested center.
  if (!isGlobalAdmin(user.role)) {
    const isAssigned = await prisma.userCenterAssignment.findFirst({
      where: {
        centerId,
        userId: requesterId,
        ...activeAssignmentWhere(),
      },
    });

    if (!isAssigned) {
      throw new NotFoundError("Center");
    }
  }

  // 2. Fetch Data
  const center = await prisma.center.findUnique({
    where: { id: centerId },
    include: {
      centerPrograms: {
        where: { isActive: true },
        include: { program: true },
      },
    },
  });

  if (!center) throw new NotFoundError("Center");

  // 3. Fetch teachers/staff assigned to this center
  const assignments = await prisma.userCenterAssignment.findMany({
    where: {
      centerId,
      ...activeAssignmentWhere(),
    },
    include: {
      user: {
        select: { id: true, fullName: true, email: true, role: true, isActive: true },
      },
    },
    orderBy: { user: { fullName: 'asc' } },
  });
  const staffAssignments = assignments
    .filter((a) => a.user.isActive)
    .map((a) => ({
      id: a.id,
      userId: a.userId,
      validFrom: a.validFrom,
      validUntil: a.validUntil,
      user: a.user,
    }));
  const teachers = staffAssignments
    .filter((a) => ['teacher', 'staff', 'supervisor'].includes(a.user.role))
    .map((a) => a.user);

  // 4. Fetch students enrolled in this center
  const students = await prisma.student.findMany({
    where: { centerId, isActive: true },
    select: { id: true, fullName: true, rollNumber: true, programId: true, createdById: true },
    orderBy: { fullName: 'asc' },
    take: 200,
  });

  const studentCount = await prisma.student.count({
    where: { centerId, isActive: true },
  });

  return {
    ...center,
    teachers,
    staffAssignments,
    students,
    userCount: staffAssignments.length,
    studentCount,
  };
}

export async function createCenter(
  input: { name: string; location?: string },
  user?: JwtPayload,
) {
  const name = input.name?.trim();
  if (!name) {
    throw new ValidationError("Center name is required");
  }

  return prisma.$transaction(async (tx) => {
    const center = await tx.center.create({
      data: {
        name,
        location: input.location?.trim() || null,
      },
    });

    if (user && !isGlobalAdmin(user.role)) {
      await tx.userCenterAssignment.create({
        data: {
          userId: user.userId,
          centerId: center.id,
          createdBy: user.userId,
          validFrom: getTodayUtcDateOnly(),
        },
      });
    }

    return center;
  });
}

export async function deleteCenter(centerId: string, user?: JwtPayload) {
  if (user) {
    assertCenterAccess(user, centerId);
  }
  const center = await prisma.center.findUnique({ where: { id: centerId } });
  if (!center) throw new NotFoundError("Center");

  const activeStudents = await prisma.student.count({
    where: { centerId, isActive: true },
  });
  if (activeStudents > 0) {
    throw new AppError("Cannot deactivate center with active students", 409);
  }

  // Soft-deactivate center so historical attendance, exams, and audit logs remain intact
  return prisma.$transaction(async (tx) => {
    await tx.centerProgram.updateMany({
      where: { centerId, isActive: true },
      data: { isActive: false },
    });

    return tx.center.update({
      where: { id: centerId },
      data: { isActive: false },
    });
  });
}

export async function updateCenter(
  centerId: string,
  input: { name?: string; location?: string | null; isActive?: boolean },
  user?: JwtPayload,
) {
  if (user) {
    assertCenterAccess(user, centerId);
  }
  const existing = await prisma.center.findUnique({ where: { id: centerId } });
  if (!existing) throw new NotFoundError("Center");

  if (input.name !== undefined && !input.name.trim()) {
    throw new ValidationError("Center name cannot be empty");
  }

  return prisma.center.update({
    where: { id: centerId },
    data: {
      ...(input.name !== undefined ? { name: input.name.trim() } : {}),
      ...(input.location !== undefined ? { location: input.location?.trim() || null } : {}),
      ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
    },
  });
}

export async function assignProgramToCenter(
  centerId: string,
  programId: string,
  user?: JwtPayload,
) {
  if (user) {
    assertCenterAccess(user, centerId);
  }
  const [center, program] = await Promise.all([
    prisma.center.findUnique({ where: { id: centerId }, select: { id: true, isActive: true } }),
    prisma.program.findUnique({ where: { id: programId }, select: { id: true, isActive: true } }),
  ]);
  if (!center || !center.isActive) throw new NotFoundError("Center");
  if (!program || !program.isActive) throw new NotFoundError("Program");

  const existing = await prisma.centerProgram.findFirst({
    where: { centerId, programId },
  });

  if (!existing) {
    return prisma.centerProgram.create({
      data: { centerId, programId, isActive: true },
      include: { program: true, center: true },
    });
  }

  if (!existing.isActive) {
    return prisma.centerProgram.update({
      where: { id: existing.id },
      data: { isActive: true },
      include: { program: true, center: true },
    });
  }

  return existing;
}

export async function removeProgramFromCenter(
  centerId: string,
  programId: string,
  user?: JwtPayload,
) {
  if (user) {
    assertCenterAccess(user, centerId);
  }
  const centerProgram = await prisma.centerProgram.findFirst({
    where: { centerId, programId },
  });
  if (!centerProgram) throw new NotFoundError("Center program mapping");

  const activeStudents = await prisma.student.count({
    where: { centerId, programId, isActive: true },
  });
  if (activeStudents > 0) {
    throw new AppError("Cannot remove program while active students exist", 409);
  }

  return prisma.centerProgram.update({
    where: { id: centerProgram.id },
    data: { isActive: false },
  });
}

export async function assignUserToCenter(
  createdBy: string,
  centerId: string,
  input: { userId: string; validFrom?: string; validUntil?: string | null },
  user?: JwtPayload,
) {
  if (user) {
    assertCenterAccess(user, centerId);
  }
  const [center, targetUser] = await Promise.all([
    prisma.center.findUnique({ where: { id: centerId }, select: { id: true, isActive: true } }),
    prisma.user.findUnique({ where: { id: input.userId }, select: { id: true, isActive: true } }),
  ]);
  if (!center || !center.isActive) throw new NotFoundError("Center");
  if (!targetUser) throw new NotFoundError("User");
  if (!targetUser.isActive) {
    throw new ValidationError("Cannot assign an inactive user to a center");
  }

  const validFrom = parseOptionalUtcDateOnly(input.validFrom, "validFrom");
  const validUntil =
    input.validUntil === null || input.validUntil === undefined
      ? null
      : parseUtcDateOnly(input.validUntil, "validUntil");

  const existing = await prisma.userCenterAssignment.findFirst({
    where: { centerId, userId: input.userId },
  });

  const effectiveValidFrom =
    validFrom ??
    (existing ? parseUtcDateOnly(existing.validFrom, "validFrom") : getTodayUtcDateOnly());

  if (validUntil && validUntil.getTime() < effectiveValidFrom.getTime()) {
    throw new ValidationError("validUntil cannot be earlier than validFrom");
  }

  if (!existing) {
    return prisma.userCenterAssignment.create({
      data: {
        centerId,
        userId: input.userId,
        createdBy,
        validFrom: effectiveValidFrom,
        validUntil,
      },
      include: {
        user: {
          select: { id: true, fullName: true, email: true, role: true, isActive: true },
        },
      },
    });
  }

  return prisma.userCenterAssignment.update({
    where: { id: existing.id },
    data: {
      ...(validFrom ? { validFrom } : {}),
      validUntil,
    },
    include: {
      user: {
        select: { id: true, fullName: true, email: true, role: true, isActive: true },
      },
    },
  });
}

export async function removeUserFromCenter(
  centerId: string,
  userId: string,
  user?: JwtPayload,
) {
  if (user) {
    assertCenterAccess(user, centerId);
  }
  const assignment = await prisma.userCenterAssignment.findFirst({
    where: { centerId, userId },
  });
  if (!assignment) throw new NotFoundError("User center assignment");

  const yesterdayUtc = new Date(getTodayUtcDateOnly().getTime() - 86_400_000);
  return prisma.userCenterAssignment.update({
    where: { id: assignment.id },
    data: { validUntil: yesterdayUtc },
  });
}

export async function listPrograms() {
  return prisma.program.findMany({
    where: { isActive: true },
    select: {
      id: true,
      code: true,
      name: true,
      ageMin: true,
      ageMax: true,
      description: true,
    },
    orderBy: { name: "asc" },
  });
}

export async function createProgram(input: {
  code: string;
  name: string;
  ageMin?: number;
  ageMax?: number;
  description?: string;
}) {
  const code = input.code?.trim();
  const name = input.name?.trim();
  if (!code || !name) {
    throw new ValidationError("Program code and name are required");
  }
  if (input.ageMin !== undefined && input.ageMax !== undefined && input.ageMin > input.ageMax) {
    throw new ValidationError("Minimum age cannot exceed maximum age");
  }

  try {
    return await prisma.program.create({
      data: {
        code,
        name,
        ageMin: input.ageMin ?? null,
        ageMax: input.ageMax ?? null,
        description: input.description?.trim() ?? null,
      },
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new AppError("Program code must be unique", 409);
    }
    throw error;
  }
}

export async function updateProgram(
  programId: string,
  input: { name?: string; ageMin?: number | null; ageMax?: number | null; description?: string | null; isActive?: boolean },
) {
  const existing = await prisma.program.findUnique({ where: { id: programId } });
  if (!existing) throw new NotFoundError("Program");

  const nextMin = input.ageMin !== undefined ? input.ageMin : existing.ageMin;
  const nextMax = input.ageMax !== undefined ? input.ageMax : existing.ageMax;
  if (nextMin !== null && nextMax !== null && nextMin > nextMax) {
    throw new ValidationError("Minimum age cannot exceed maximum age");
  }

  return prisma.program.update({
    where: { id: programId },
    data: {
      ...(input.name !== undefined ? { name: input.name.trim() } : {}),
      ...(input.ageMin !== undefined ? { ageMin: input.ageMin } : {}),
      ...(input.ageMax !== undefined ? { ageMax: input.ageMax } : {}),
      ...(input.description !== undefined ? { description: input.description?.trim() ?? null } : {}),
      ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
    },
  });
}

export async function getProgramDetails(programId: string, user?: JwtPayload) {
  const scopedIds = getScopedCenterIds(user);
  const centerFilter = scopedIds !== undefined ? { centerId: { in: scopedIds } } : {};

  const program = await prisma.program.findUnique({
    where: { id: programId },
    include: {
      centerPrograms: {
        where: { isActive: true, ...centerFilter },
        include: { center: { select: { id: true, name: true, location: true } } },
        orderBy: { center: { name: "asc" } },
      },
      subjects: {
        where: { isActive: true },
        orderBy: { name: "asc" },
      },
      skillDefinitions: {
        where: { isActive: true },
        orderBy: { name: "asc" },
      },
    },
  });
  if (!program) throw new NotFoundError("Program");

  const [students, studentCount] = await Promise.all([
    prisma.student.findMany({
      where: { programId, isActive: true, ...centerFilter },
      select: { id: true, fullName: true, rollNumber: true, centerId: true },
      orderBy: { fullName: 'asc' },
      take: 200,
    }),
    prisma.student.count({
      where: { programId, isActive: true, ...centerFilter },
    }),
  ]);

  return { ...program, students, studentCount };
}

export async function getProgramCenters(programId: string, user?: JwtPayload) {
  const program = await prisma.program.findUnique({ where: { id: programId }, select: { id: true } });
  if (!program) throw new NotFoundError("Program");
  const scopedIds = getScopedCenterIds(user);
  return prisma.centerProgram.findMany({
    where: {
      programId,
      isActive: true,
      ...(scopedIds !== undefined ? { centerId: { in: scopedIds } } : {}),
    },
    include: {
      center: true,
      program: true,
    },
    orderBy: { center: { name: "asc" } },
  });
}

async function requireActiveProgram(programId: string) {
  const program = await prisma.program.findUnique({
    where: { id: programId },
    select: { id: true, isActive: true },
  });
  if (!program || !program.isActive) {
    throw new NotFoundError("Program");
  }
  return program;
}

export async function createProgramSubject(
  programId: string,
  input: { name: string; maxMarks?: number },
) {
  await requireActiveProgram(programId);
  const name = input.name?.trim();
  if (!name) throw new ValidationError("Subject name is required");
  const maxMarks = input.maxMarks ?? 100;
  if (!(maxMarks > 0 && maxMarks <= 9999.99)) {
    throw new ValidationError("Max marks must be greater than 0 and at most 9999.99");
  }

  const existing = await prisma.programSubject.findFirst({
    where: { programId, name: { equals: name, mode: "insensitive" } },
  });
  if (existing) {
    if (existing.isActive) {
      throw new AppError("A subject with this name already exists in the program", 409);
    }
    return prisma.programSubject.update({
      where: { id: existing.id },
      data: { name, maxMarks, isActive: true },
    });
  }

  try {
    return await prisma.programSubject.create({
      data: { programId, name, maxMarks, isActive: true },
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new AppError("A subject with this name already exists in the program", 409);
    }
    throw error;
  }
}

export async function updateProgramSubject(
  programId: string,
  subjectId: string,
  input: { name?: string; maxMarks?: number; isActive?: boolean },
) {
  const existing = await prisma.programSubject.findUnique({ where: { id: subjectId } });
  if (!existing || existing.programId !== programId) {
    throw new NotFoundError("Program subject");
  }

  const trimmedName = input.name !== undefined ? input.name.trim() : undefined;
  if (trimmedName !== undefined && !trimmedName) {
    throw new ValidationError("Subject name cannot be empty");
  }
  if (input.maxMarks !== undefined && !(input.maxMarks > 0 && input.maxMarks <= 9999.99)) {
    throw new ValidationError("Max marks must be greater than 0 and at most 9999.99");
  }

  if (trimmedName) {
    const duplicate = await prisma.programSubject.findFirst({
      where: {
        programId,
        id: { not: subjectId },
        name: { equals: trimmedName, mode: "insensitive" },
      },
    });
    if (duplicate) {
      throw new AppError("A subject with this name already exists in the program", 409);
    }
  }

  try {
    return await prisma.programSubject.update({
      where: { id: subjectId },
      data: {
        ...(trimmedName !== undefined ? { name: trimmedName } : {}),
        ...(input.maxMarks !== undefined ? { maxMarks: input.maxMarks } : {}),
        ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
      },
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new AppError("A subject with this name already exists in the program", 409);
    }
    throw error;
  }
}

export async function deleteProgramSubject(programId: string, subjectId: string) {
  const existing = await prisma.programSubject.findUnique({ where: { id: subjectId } });
  if (!existing || existing.programId !== programId) {
    throw new NotFoundError("Program subject");
  }

  const linkedScores = await prisma.examScore.count({ where: { subjectId } });
  if (linkedScores > 0) {
    await prisma.programSubject.update({
      where: { id: subjectId },
      data: { isActive: false },
    });
    return { id: subjectId, deleted: false, deactivated: true };
  }

  await prisma.programSubject.delete({ where: { id: subjectId } });
  return { id: subjectId, deleted: true, deactivated: false };
}

export async function createSkillDefinition(
  programId: string,
  input: { name: string; description?: string | null; maxLevel?: number },
) {
  await requireActiveProgram(programId);
  const name = input.name?.trim();
  if (!name) throw new ValidationError("Skill name is required");
  const maxLevel = input.maxLevel ?? 5;
  if (!Number.isInteger(maxLevel) || maxLevel < 1 || maxLevel > 20) {
    throw new ValidationError("maxLevel must be an integer between 1 and 20");
  }
  const description = input.description?.trim() || null;

  const existing = await prisma.skillDefinition.findFirst({
    where: { programId, name: { equals: name, mode: "insensitive" } },
  });
  if (existing) {
    if (existing.isActive) {
      throw new AppError("A skill definition with this name already exists in the program", 409);
    }
    return prisma.skillDefinition.update({
      where: { id: existing.id },
      data: { name, description, maxLevel, isActive: true },
    });
  }

  try {
    return await prisma.skillDefinition.create({
      data: { programId, name, description, maxLevel, isActive: true },
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new AppError("A skill definition with this name already exists in the program", 409);
    }
    throw error;
  }
}

export async function updateSkillDefinition(
  programId: string,
  skillId: string,
  input: { name?: string; description?: string | null; maxLevel?: number; isActive?: boolean },
) {
  const existing = await prisma.skillDefinition.findUnique({ where: { id: skillId } });
  if (!existing || existing.programId !== programId) {
    throw new NotFoundError("Skill definition");
  }

  const trimmedName = input.name !== undefined ? input.name.trim() : undefined;
  if (trimmedName !== undefined && !trimmedName) {
    throw new ValidationError("Skill name cannot be empty");
  }
  if (
    input.maxLevel !== undefined &&
    (!Number.isInteger(input.maxLevel) || input.maxLevel < 1 || input.maxLevel > 20)
  ) {
    throw new ValidationError("maxLevel must be an integer between 1 and 20");
  }

  if (trimmedName) {
    const duplicate = await prisma.skillDefinition.findFirst({
      where: {
        programId,
        id: { not: skillId },
        name: { equals: trimmedName, mode: "insensitive" },
      },
    });
    if (duplicate) {
      throw new AppError("A skill definition with this name already exists in the program", 409);
    }
  }

  try {
    return await prisma.skillDefinition.update({
      where: { id: skillId },
      data: {
        ...(trimmedName !== undefined ? { name: trimmedName } : {}),
        ...(input.description !== undefined
          ? { description: input.description?.trim() || null }
          : {}),
        ...(input.maxLevel !== undefined ? { maxLevel: input.maxLevel } : {}),
        ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
      },
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new AppError("A skill definition with this name already exists in the program", 409);
    }
    throw error;
  }
}

export async function deleteSkillDefinition(programId: string, skillId: string) {
  const existing = await prisma.skillDefinition.findUnique({ where: { id: skillId } });
  if (!existing || existing.programId !== programId) {
    throw new NotFoundError("Skill definition");
  }

  const linkedLogs = await prisma.studentSkillLog.count({ where: { skillId } });
  if (linkedLogs > 0) {
    await prisma.skillDefinition.update({
      where: { id: skillId },
      data: { isActive: false },
    });
    return { id: skillId, deleted: false, deactivated: true };
  }

  await prisma.skillDefinition.delete({ where: { id: skillId } });
  return { id: skillId, deleted: true, deactivated: false };
}
