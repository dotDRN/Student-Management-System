import prisma from "../lib/prisma.js";
import type { JwtPayload } from "../utils/jwt.js";
import { NotFoundError, ValidationError } from "../lib/errors.js";
import { assertCenterAccess } from "../lib/centerScope.js";
import { getTodayUtcDateOnly, parseOptionalUtcDateOnly } from "../utils/dateOnly.js";
import { createSkillSchema, updateSkillSchema } from "../validators/schemas.js";

const safeAssessorSelect = { select: { id: true, fullName: true } };

export async function getSkillsByStudent(user: JwtPayload, studentId: string) {
  const student = await prisma.student.findUnique({
    where: { id: studentId },
    select: { id: true, centerId: true, programId: true },
  });

  if (!student) {
    throw new NotFoundError("Student");
  }

  assertCenterAccess(user, student.centerId, "You are not authorized to view skills for this center");

  return prisma.studentSkillLog.findMany({
    where: { studentId },
    include: {
      skill: true,
      assessedByUser: safeAssessorSelect,
    },
    orderBy: [{ assessedOn: "desc" }, { createdAt: "desc" }],
  });
}

export async function createSkillLog(user: JwtPayload, studentId: string, data: unknown) {
  const parsed = createSkillSchema.safeParse(data);
  if (!parsed.success) {
    throw new ValidationError("Invalid skill assessment payload", parsed.error.flatten());
  }

  const student = await prisma.student.findUnique({
    where: { id: studentId },
    select: { id: true, centerId: true, programId: true, isActive: true },
  });
  if (!student || !student.isActive) {
    throw new NotFoundError("Student");
  }

  assertCenterAccess(user, student.centerId, "You are not authorized to record skills for this center");

  const skillDef = await prisma.skillDefinition.findFirst({
    where: { id: parsed.data.skillId, isActive: true },
  });
  if (!skillDef) {
    throw new NotFoundError("Skill definition");
  }

  if (skillDef.programId !== student.programId) {
    throw new ValidationError("Selected skill does not belong to the student's enrolled program");
  }

  if (parsed.data.level < 1 || parsed.data.level > skillDef.maxLevel) {
    throw new ValidationError(`Skill level must be between 1 and ${skillDef.maxLevel}`);
  }

  const assessedOn =
    parseOptionalUtcDateOnly(parsed.data.assessedOn, "assessedOn") ?? getTodayUtcDateOnly();

  return prisma.studentSkillLog.create({
    data: {
      studentId: student.id,
      centerId: student.centerId,
      skillId: skillDef.id,
      level: parsed.data.level,
      remarks: parsed.data.remarks ?? null,
      assessedOn,
      assessedBy: user.userId,
    },
    include: {
      skill: true,
      assessedByUser: safeAssessorSelect,
    },
  });
}

export async function updateSkillLog(user: JwtPayload, id: string, data: unknown) {
  const parsed = updateSkillSchema.safeParse(data);
  if (!parsed.success) {
    throw new ValidationError("Invalid skill update payload", parsed.error.flatten());
  }

  const log = await prisma.studentSkillLog.findUnique({
    where: { id },
    include: {
      skill: true,
      student: { select: { id: true, centerId: true, programId: true } },
    },
  });
  if (!log) {
    throw new NotFoundError("Skill log");
  }

  assertCenterAccess(user, log.centerId, "You are not authorized to update skill logs for this center");

  let targetSkill = log.skill;
  if (parsed.data.skillId !== undefined && parsed.data.skillId !== log.skillId) {
    const fetched = await prisma.skillDefinition.findFirst({
      where: { id: parsed.data.skillId, isActive: true },
    });
    if (!fetched) {
      throw new NotFoundError("Skill definition");
    }
    if (log.student && fetched.programId !== log.student.programId) {
      throw new ValidationError("Selected skill does not belong to the student's enrolled program");
    }
    targetSkill = fetched;
  }

  const nextLevel = parsed.data.level ?? log.level;
  const maxLevel = targetSkill?.maxLevel ?? 5;
  if (nextLevel < 1 || nextLevel > maxLevel) {
    throw new ValidationError(`Skill level must be between 1 and ${maxLevel}`);
  }

  const assessedOnUpdate =
    parsed.data.assessedOn !== undefined
      ? { assessedOn: parseOptionalUtcDateOnly(parsed.data.assessedOn, "assessedOn") ?? log.assessedOn }
      : {};

  return prisma.studentSkillLog.update({
    where: { id },
    data: {
      ...(parsed.data.skillId !== undefined ? { skillId: parsed.data.skillId } : {}),
      ...(parsed.data.level !== undefined ? { level: parsed.data.level } : {}),
      ...(parsed.data.remarks !== undefined ? { remarks: parsed.data.remarks } : {}),
      ...assessedOnUpdate,
    },
    include: {
      skill: true,
      assessedByUser: safeAssessorSelect,
    },
  });
}

export async function deleteSkillLog(user: JwtPayload, id: string) {
  const log = await prisma.studentSkillLog.findUnique({ where: { id } });
  if (!log) {
    throw new NotFoundError("Skill log");
  }

  assertCenterAccess(user, log.centerId, "You are not authorized to delete skill logs for this center");
  return prisma.studentSkillLog.delete({ where: { id } });
}

export async function listSkillDefinitions(programId?: string) {
  return prisma.skillDefinition.findMany({
    where: {
      isActive: true,
      ...(programId ? { programId } : {}),
    },
    include: {
      program: { select: { id: true, name: true, code: true } },
    },
    orderBy: [{ name: "asc" }],
  });
}
