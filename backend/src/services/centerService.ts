import { Prisma } from "@prisma/client";
import type { JwtPayload } from '../utils/jwt.js';
import prisma from '../lib/prisma.js';
import { AppError, NotFoundError, ValidationError } from '../lib/errors.js';
import { getScopedCenterIds, isGlobalAdmin } from '../config/rbac.js';

function activeAssignmentWhere(userId?: string) {
  return {
    ...(userId ? { userId } : {}),
    OR: [{ validUntil: null }, { validUntil: { gte: new Date() } }],
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
  });
  const teachers = assignments
    .filter((a) => a.user.isActive && ['teacher', 'staff', 'supervisor'].includes(a.user.role))
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
    students,
    userCount: teachers.length,
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
          validFrom: new Date(),
        },
      });
    }

    return center;
  });
}

export async function deleteCenter(centerId: string) {
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
  input: { name?: string; location?: string; isActive?: boolean },
) {
  const existing = await prisma.center.findUnique({ where: { id: centerId } });
  if (!existing) throw new NotFoundError("Center");

  if (input.name !== undefined && !input.name.trim()) {
    throw new ValidationError("Center name cannot be empty");
  }

  return prisma.center.update({
    where: { id: centerId },
    data: {
      ...(input.name !== undefined ? { name: input.name.trim() } : {}),
      ...(input.location !== undefined ? { location: input.location.trim() || null } : {}),
      ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
    },
  });
}

export async function assignProgramToCenter(centerId: string, programId: string) {
  const [center, program] = await Promise.all([
    prisma.center.findUnique({ where: { id: centerId }, select: { id: true } }),
    prisma.program.findUnique({ where: { id: programId }, select: { id: true } }),
  ]);
  if (!center) throw new NotFoundError("Center");
  if (!program) throw new NotFoundError("Program");

  const existing = await prisma.centerProgram.findFirst({
    where: { centerId, programId },
  });

  if (!existing) {
    return prisma.centerProgram.create({
      data: { centerId, programId, isActive: true },
    });
  }

  if (!existing.isActive) {
    return prisma.centerProgram.update({
      where: { id: existing.id },
      data: { isActive: true },
    });
  }

  return existing;
}

export async function removeProgramFromCenter(centerId: string, programId: string) {
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
  input: { userId: string; validFrom?: string; validUntil?: string },
) {
  const [center, targetUser] = await Promise.all([
    prisma.center.findUnique({ where: { id: centerId }, select: { id: true } }),
    prisma.user.findUnique({ where: { id: input.userId }, select: { id: true } }),
  ]);
  if (!center) throw new NotFoundError("Center");
  if (!targetUser) throw new NotFoundError("User");

  const validFrom = input.validFrom ? new Date(input.validFrom) : undefined;
  const validUntil = input.validUntil ? new Date(input.validUntil) : null;

  const existing = await prisma.userCenterAssignment.findFirst({
    where: { centerId, userId: input.userId },
  });

  if (!existing) {
    return prisma.userCenterAssignment.create({
      data: {
        centerId,
        userId: input.userId,
        createdBy,
        ...(validFrom ? { validFrom } : {}),
        validUntil,
      },
    });
  }

  return prisma.userCenterAssignment.update({
    where: { id: existing.id },
    data: {
      ...(validFrom ? { validFrom } : {}),
      validUntil,
    },
  });
}

export async function removeUserFromCenter(centerId: string, userId: string) {
  const assignment = await prisma.userCenterAssignment.findFirst({
    where: { centerId, userId },
  });
  if (!assignment) throw new NotFoundError("User center assignment");

  return prisma.userCenterAssignment.update({
    where: { id: assignment.id },
    data: { validUntil: new Date() },
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
