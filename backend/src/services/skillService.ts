import prisma from "../lib/prisma.js";
import type { JwtPayload } from "../utils/jwt.js";
import { NotFoundError, ValidationError } from "../lib/errors.js";
import { assertCenterAccess } from "../lib/centerScope.js";
import { formatUtcDateOnly, getTodayUtcDateOnly, parseOptionalUtcDateOnly } from "../utils/dateOnly.js";
import { bulkUpsertSkillLogsSchema, createSkillSchema, updateSkillSchema } from "../validators/schemas.js";

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

export async function getSkillMatrix(
  user: JwtPayload,
  query: { centerId?: string; programId?: string; assessedOn?: string },
) {
  if (!query.centerId) {
    throw new ValidationError("centerId is required");
  }
  if (!query.programId) {
    throw new ValidationError("programId is required");
  }
  assertCenterAccess(user, query.centerId, "You are not authorized to view skills for this center");

  const assessedOn = parseOptionalUtcDateOnly(query.assessedOn, "assessedOn") ?? getTodayUtcDateOnly();

  const [students, skills] = await Promise.all([
    prisma.student.findMany({
      where: {
        centerId: query.centerId,
        programId: query.programId,
        isActive: true,
      },
      select: { id: true, fullName: true, rollNumber: true, programId: true, centerId: true },
      orderBy: [{ fullName: "asc" }],
    }),
    prisma.skillDefinition.findMany({
      where: { programId: query.programId, isActive: true },
      orderBy: [{ name: "asc" }],
    }),
  ]);

  const studentIds = students.map((s) => s.id);
  const skillIds = skills.map((s) => s.id);

  const existingLogs =
    studentIds.length > 0 && skillIds.length > 0
      ? await prisma.studentSkillLog.findMany({
          where: {
            centerId: query.centerId,
            studentId: { in: studentIds },
            skillId: { in: skillIds },
            assessedOn,
          },
          select: {
            id: true,
            studentId: true,
            skillId: true,
            level: true,
            remarks: true,
            assessedOn: true,
          },
          orderBy: [{ createdAt: "desc" }],
        })
      : [];

  return {
    centerId: query.centerId,
    programId: query.programId,
    assessedOn: formatUtcDateOnly(assessedOn),
    students,
    skills,
    existingLogs,
  };
}

export async function bulkUpsertSkillLogs(user: JwtPayload, data: unknown) {
  const parsed = bulkUpsertSkillLogsSchema.safeParse(data);
  if (!parsed.success) {
    throw new ValidationError("Invalid bulk skill assessment payload", parsed.error.flatten());
  }

  assertCenterAccess(
    user,
    parsed.data.centerId,
    "You are not authorized to record skills for this center",
  );

  const assessedOn =
    parseOptionalUtcDateOnly(parsed.data.assessedOn, "assessedOn") ?? getTodayUtcDateOnly();

  const dedupedMap = new Map<string, (typeof parsed.data.entries)[number]>();
  for (const entry of parsed.data.entries) {
    dedupedMap.set(`${entry.studentId}:${entry.skillId}`, entry);
  }
  const entries = Array.from(dedupedMap.values());

  const studentIds = Array.from(new Set(entries.map((e) => e.studentId)));
  const skillIds = Array.from(new Set(entries.map((e) => e.skillId)));

  const [students, skillDefs] = await Promise.all([
    prisma.student.findMany({
      where: { id: { in: studentIds } },
      select: { id: true, fullName: true, centerId: true, programId: true, isActive: true },
    }),
    prisma.skillDefinition.findMany({
      where: { id: { in: skillIds }, isActive: true },
    }),
  ]);

  const studentMap = new Map(students.map((s) => [s.id, s]));
  const skillMap = new Map(skillDefs.map((sk) => [sk.id, sk]));

  for (const entry of entries) {
    const student = studentMap.get(entry.studentId);
    if (!student || !student.isActive) {
      throw new ValidationError(`Student ${entry.studentId} is missing or inactive`);
    }
    if (student.centerId !== parsed.data.centerId) {
      throw new ValidationError(`Student ${student.fullName} does not belong to the selected center`);
    }
    if (parsed.data.programId && student.programId !== parsed.data.programId) {
      throw new ValidationError(`Student ${student.fullName} does not belong to the selected program`);
    }

    const skillDef = skillMap.get(entry.skillId);
    if (!skillDef) {
      throw new ValidationError(`Skill definition ${entry.skillId} is missing or inactive`);
    }
    if (skillDef.programId !== student.programId) {
      throw new ValidationError(
        `Skill "${skillDef.name}" does not belong to ${student.fullName}'s enrolled program`,
      );
    }
    if (entry.level < 1 || entry.level > skillDef.maxLevel) {
      throw new ValidationError(
        `Skill level for "${skillDef.name}" must be between 1 and ${skillDef.maxLevel}`,
      );
    }
  }

  return prisma.$transaction(async (tx) => {
    const existingLogs = await tx.studentSkillLog.findMany({
      where: {
        centerId: parsed.data.centerId,
        studentId: { in: studentIds },
        skillId: { in: skillIds },
        assessedOn,
      },
      orderBy: [{ createdAt: "desc" }],
    });

    const existingMap = new Map<string, (typeof existingLogs)[number]>();
    for (const log of existingLogs) {
      const key = `${log.studentId}:${log.skillId}`;
      if (!existingMap.has(key)) {
        existingMap.set(key, log);
      }
    }

    let createdCount = 0;
    let updatedCount = 0;
    const savedLogs = [];

    for (const entry of entries) {
      const key = `${entry.studentId}:${entry.skillId}`;
      const existing = existingMap.get(key);
      if (existing) {
        const updated = await tx.studentSkillLog.update({
          where: { id: existing.id },
          data: {
            level: entry.level,
            remarks: entry.remarks !== undefined ? entry.remarks : existing.remarks,
            assessedBy: user.userId,
          },
          include: {
            skill: true,
            assessedByUser: safeAssessorSelect,
          },
        });
        updatedCount += 1;
        savedLogs.push(updated);
      } else {
        const created = await tx.studentSkillLog.create({
          data: {
            studentId: entry.studentId,
            centerId: parsed.data.centerId,
            skillId: entry.skillId,
            level: entry.level,
            remarks: entry.remarks ?? null,
            assessedOn,
            assessedBy: user.userId,
          },
          include: {
            skill: true,
            assessedByUser: safeAssessorSelect,
          },
        });
        createdCount += 1;
        savedLogs.push(created);
      }
    }

    return {
      assessedOn: formatUtcDateOnly(assessedOn),
      createdCount,
      updatedCount,
      savedCount: savedLogs.length,
      logs: savedLogs,
    };
  });
}
