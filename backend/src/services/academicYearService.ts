import { isAdminRole } from "../config/rbac.js";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "../lib/errors.js";
import prisma from "../lib/prisma.js";
import { parseUtcDateOnly } from "../utils/dateOnly.js";
import type { JwtPayload } from "../utils/jwt.js";

export type CreateAcademicYearInput = {
  label: string;
  startDate: string;
  endDate: string;
  isCurrent?: boolean;
};

export async function listAcademicYearsWithStats() {
  return prisma.academicYear.findMany({
    orderBy: [{ isCurrent: "desc" }, { startDate: "desc" }],
    include: {
      _count: {
        select: {
          students: true,
          attendanceSessions: true,
          exams: true,
        },
      },
    },
  });
}

export async function createAcademicYear(user: JwtPayload, input: CreateAcademicYearInput) {
  if (!isAdminRole(user.role)) {
    throw new ForbiddenError("Only admins can create academic years");
  }

  const label = input.label.trim();
  if (!label) {
    throw new ValidationError("Academic year label is required");
  }

  const startDate = parseUtcDateOnly(input.startDate, "startDate");
  const endDate = parseUtcDateOnly(input.endDate, "endDate");
  if (endDate.getTime() <= startDate.getTime()) {
    throw new ValidationError("endDate must be later than startDate");
  }

  const duplicate = await prisma.academicYear.findFirst({
    where: { label: { equals: label, mode: "insensitive" } },
    select: { id: true },
  });
  if (duplicate) {
    throw new ConflictError(`Academic year '${label}' already exists`);
  }

  return prisma.$transaction(async (tx) => {
    if (input.isCurrent) {
      await tx.academicYear.updateMany({
        where: { isCurrent: true },
        data: { isCurrent: false },
      });
    }

    return tx.academicYear.create({
      data: {
        label,
        startDate,
        endDate,
        isCurrent: Boolean(input.isCurrent),
      },
      include: {
        _count: {
          select: {
            students: true,
            attendanceSessions: true,
            exams: true,
          },
        },
      },
    });
  });
}

export async function setCurrentAcademicYear(user: JwtPayload, yearId: string) {
  if (!isAdminRole(user.role)) {
    throw new ForbiddenError("Only admins can switch the active academic year");
  }

  const existing = await prisma.academicYear.findUnique({
    where: { id: yearId },
    select: { id: true },
  });
  if (!existing) {
    throw new NotFoundError("Academic year");
  }

  return prisma.$transaction(async (tx) => {
    await tx.academicYear.updateMany({
      where: { id: { not: yearId }, isCurrent: true },
      data: { isCurrent: false },
    });

    return tx.academicYear.update({
      where: { id: yearId },
      data: { isCurrent: true, updatedAt: new Date() },
      include: {
        _count: {
          select: {
            students: true,
            attendanceSessions: true,
            exams: true,
          },
        },
      },
    });
  });
}
