import prisma from "../lib/prisma.js";
import { UserRole } from "@prisma/client";
import type { JwtPayload } from "../lib/auth.js";

export async function getSkillsByStudent(user: JwtPayload, studentId: string) {
  const student = await prisma.student.findUnique({
    where: { id: studentId },
  });

  if (!student) throw new Error("Student not found");

  // RBAC: Center check
  if (user.role !== UserRole.super_admin && !user.centerIds.includes(student.centerId)) {
    throw new Error("Unauthorized");
  }

  const logs = await prisma.studentSkillLog.findMany({
    where: { studentId },
    include: {
      skill: true,
      assessedByUser: true,
    },
    orderBy: { assessedOn: "desc" },
  });

  return logs;
}

export async function createSkillLog(user: JwtPayload, studentId: string, data: any) {
  return prisma.studentSkillLog.create({
    data: {
      studentId,
      centerId: data.centerId,
      skillId: data.skillId,
      level: data.level,
      remarks: data.remarks,
      assessedBy: user.userId,
    },
  });
}

export async function listSkillDefinitions(programId?: string) {
  const where: any = {};
  if (programId) where.programId = programId;

  return prisma.skillDefinition.findMany({
    where,
    include: {
      program: true,
    },
  });
}
