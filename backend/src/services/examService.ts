import { Prisma, UserRole } from "@prisma/client";
import { NotFoundError, ForbiddenError } from "../lib/errors.js";
import prisma from "../lib/prisma.js";
import type { JwtPayload } from "../lib/auth.js";
import { resolveAcademicYearId } from "../utils/academicYear.js";

// ================= TYPES =================

type CreateExamInput = {
  centerIds: string[];
  programId: string;
  examType: string;
  academicYearId: string;
  examDate?: string;
  name?: string;
  subjectId?: string;
};

type ListExamQuery = {
  centerId?: string;
  programId?: string;
  examType?: string;
  academicYearId?: string;
  examDate?: string;
};

// ================= HELPERS =================

function enforceCenterAccess(user: JwtPayload, centerId: string) {
  if (user.role === UserRole.super_admin || user.role === UserRole.tech_admin)
    return;
  if (!user.centerIds.includes(centerId)) {
    throw new ForbiddenError("Unauthorized access to this center");
  }
}

function applyCenterFilter(user: JwtPayload, where: any) {
  if (user.role === UserRole.super_admin || user.role === UserRole.tech_admin)
    return;
  where.centerId = { in: user.centerIds };
}

// ================= CREATE EXAM =================

export const createExam = async (user: JwtPayload, data: CreateExamInput) => {
  if (!data.examDate) {
    throw new Error("examDate is required");
  }

  const examDate = new Date(data.examDate);

  const createdExams = [];

  let academicYearId = await resolveAcademicYearId(data.academicYearId);

  if (!academicYearId) {
    throw new Error("Invalid academic year");
  }

  for (const centerId of data.centerIds) {
    enforceCenterAccess(user, centerId);

    // ✅ Prevent duplicate exam for same date
    const existing = await prisma.exam.findFirst({
      where: {
        centerId,
        programId: data.programId,
        examType: data.examType,
        academicYearId: data.academicYearId,
        examDate,
      },
    });

    if (existing) {
      createdExams.push(existing);
      continue;
    }

    const exam = await prisma.exam.create({
      data: {
        name:
          data.name || `${data.examType} - ${examDate.toLocaleDateString()}`,
        examType: data.examType,
        centerId,
        programId: data.programId,
        academicYearId: data.academicYearId,
        examDate,
        createdBy: user.userId,
        status: "DRAFT",
      },
      include: { center: true, program: true, academicYear: true },
    });

    createdExams.push(exam);
  }

  return createdExams;
};

// ================= GET EXAM SHEET (WITH SYNC) =================

export async function getExamSheet(user: JwtPayload, examId: string) {
  const exam = await prisma.exam.findUnique({
    where: { id: examId },
    include: { center: true, program: true, academicYear: true },
  });

  if (!exam) throw new NotFoundError("Exam not found");

  enforceCenterAccess(user, exam.centerId);

  // 1. Get all active students for this center+program
  const students = await prisma.student.findMany({
    where: {
      centerId: exam.centerId,
      programId: exam.programId,
      isActive: true,
    },
    select: { id: true, fullName: true, rollNumber: true },
    orderBy: { fullName: "asc" },
  });

  // 2. Get existing scores with subject info
  const scores = await prisma.examScore.findMany({
    where: { examId: exam.id },
    include: {
      student: {
        select: { id: true, fullName: true, rollNumber: true },
      },
      subject: true,
    },
    orderBy: { student: { fullName: "asc" } },
  });

  // 3. Return exam + students + scores separately
  //    Frontend uses students[] for row rendering, scores[] for filling marks
  return {
    ...exam,
    students,
    scores,
  };
}

// ================= LIST EXAMS =================

export async function listExams(user: JwtPayload, query: ListExamQuery) {
  const where: any = {};

  applyCenterFilter(user, where);

  if (query.centerId) where.centerId = query.centerId;
  if (query.programId) where.programId = query.programId;
  if (query.examType) where.examType = query.examType;

  const academicYearId = await resolveAcademicYearId(query.academicYearId);

  if (query.academicYearId && !academicYearId) {
    return []; // invalid label → no results
  }

  if (academicYearId) {
    where.academicYearId = academicYearId;
  }

  // ✅ CRITICAL FIX: filter by DATE RANGE
  if (query.examDate) {
    const d = new Date(query.examDate);

    const start = new Date(d);
    start.setHours(0, 0, 0, 0);

    const end = new Date(d);
    end.setHours(23, 59, 59, 999);

    where.examDate = {
      gte: start,
      lte: end,
    };
  }

  return prisma.exam.findMany({
    where,
    orderBy: { createdAt: "desc" },
    include: {
      academicYear: true,
      program: true,
      center: true,
    },
  });
}

// ================= GET EXAM BY ID =================

export async function getExamById(user: JwtPayload, examId: string) {
  const exam = await prisma.exam.findUnique({
    where: { id: examId },
    include: {
      scores: {
        include: {
          subject: true,
          student: true,
        },
      },
      academicYear: true,
      program: true,
    },
  });

  if (!exam) throw new NotFoundError("Exam not found");

  enforceCenterAccess(user, exam.centerId);

  return exam;
}

// ================= UPSERT SCORES =================

export async function upsertExamScores(
  user: JwtPayload,
  examId: string,
  input: { scores: any[] },
) {
  const exam = await prisma.exam.findUnique({
    where: { id: examId },
    include: { program: { include: { subjects: true } } },
  });

  if (!exam) throw new NotFoundError("Exam not found");

  enforceCenterAccess(user, exam.centerId);

  // Build subject lookup: id → id, name → id
  const subjectMap = new Map<string, string>();
  exam.program?.subjects.forEach((s) => {
    subjectMap.set(s.id, s.id);
    subjectMap.set(s.name.toLowerCase(), s.id);
  });

  // Resolve each score's subjectId — auto-create if subject name is new
  const processedScores = [];
  for (const s of input.scores) {
    let subjectId =
      s.subjectId && subjectMap.has(s.subjectId)
        ? s.subjectId
        : subjectMap.get((s.subject || "").toLowerCase());

    // Auto-create subject if it doesn't exist yet
    if (!subjectId && s.subject && exam.programId) {
      const newSubject = await prisma.programSubject.upsert({
        where: {
          programId_name: {
            programId: exam.programId,
            name: s.subject,
          },
        },
        update: {},
        create: {
          programId: exam.programId,
          name: s.subject,
          maxMarks: s.maxMarks || 100,
        },
      });
      subjectId = newSubject.id;
      subjectMap.set(newSubject.id, newSubject.id);
      subjectMap.set(newSubject.name.toLowerCase(), newSubject.id);
    }

    if (!subjectId) {
      throw new Error(
        `Subject '${s.subject || s.subjectId}' could not be resolved`,
      );
    }

    // Safely convert marks
    let marks: Prisma.Decimal | null = null;
    if (s.marks != null && s.marks !== "" && !s.isAbsent) {
      marks = new Prisma.Decimal(s.marks);
    }

    processedScores.push({
      studentId: s.studentId,
      subjectId,
      marks,
      isAbsent: s.isAbsent || false,
      remarks: s.remarks,
    });
  }

  await prisma.$transaction(
    processedScores.map((score) =>
      prisma.examScore.upsert({
        where: {
          examId_studentId_subjectId: {
            examId,
            studentId: score.studentId,
            subjectId: score.subjectId,
          },
        },
        update: {
          marks: score.marks,
          isAbsent: score.isAbsent,
          remarks: score.remarks ?? null,
        },
        create: {
          examId,
          studentId: score.studentId,
          subjectId: score.subjectId,
          centerId: exam.centerId,
          marks: score.marks,
          isAbsent: score.isAbsent,
          remarks: score.remarks ?? null,
          enteredBy: user.userId,
          status: "DRAFT",
        },
      }),
    ),
  );

  return { success: true };
}

// ================= PENDING SCORES =================

export async function getPendingExamScores(user: JwtPayload, examId: string) {
  const exam = await prisma.exam.findUnique({
    where: { id: examId },
  });

  if (!exam) throw new NotFoundError("Exam not found");

  enforceCenterAccess(user, exam.centerId);

  const students = await prisma.student.findMany({
    where: {
      centerId: exam.centerId,
      programId: exam.programId,
      isActive: true,
    },
  });

  const subjects = await prisma.programSubject.findMany({
    where: {
      programId: exam.programId,
    },
  });

  const existingScores = await prisma.examScore.findMany({
    where: { examId },
  });

  const existingSet = new Set(
    existingScores.map((s) => `${s.studentId}-${s.subjectId}`),
  );

  const pending: any[] = [];

  for (const student of students) {
    for (const subject of subjects) {
      const key = `${student.id}-${subject.id}`;
      if (!existingSet.has(key)) {
        pending.push({
          studentId: student.id,
          subjectId: subject.id,
          subjectName: subject.name,
        });
      }
    }
  }

  return pending;
}

// ================= EXAM COMPARISON =================

export async function getExamComparison(
  user: JwtPayload,
  query: ListExamQuery,
) {
  const where: any = {};

  applyCenterFilter(user, where);

  if (query.centerId) where.centerId = query.centerId;
  if (query.programId) where.programId = query.programId;

  const academicYearId = await resolveAcademicYearId(query.academicYearId);

  if (query.academicYearId && !academicYearId) {
    return { perSubject: [] };
  }

  if (academicYearId) {
    where.academicYearId = academicYearId;
  }

  const exams = await prisma.exam.findMany({
    where,
    include: {
      scores: {
        include: {
          subject: true,
        },
      },
    },
  });

  const subjectMap: Record<
    string,
    {
      baselineTotal: number;
      baselineCount: number;
      endlineTotal: number;
      endlineCount: number;
    }
  > = {};

  for (const exam of exams) {
    for (const score of exam.scores) {
      const subjectName = score.subject.name.toLowerCase();
      if (!subjectMap[subjectName]) {
        subjectMap[subjectName] = {
          baselineTotal: 0,
          baselineCount: 0,
          endlineTotal: 0,
          endlineCount: 0,
        };
      }

      const val = score.marks ? Number(score.marks) : 0;
      if (exam.examType.toLowerCase() === "baseline") {
        subjectMap[subjectName].baselineTotal += val;
        subjectMap[subjectName].baselineCount++;
      } else if (exam.examType.toLowerCase() === "endline") {
        subjectMap[subjectName].endlineTotal += val;
        subjectMap[subjectName].endlineCount++;
      }
    }
  }

  const perSubject = Object.entries(subjectMap).map(([subject, data]) => {
    const bAvg =
      data.baselineCount > 0 ? data.baselineTotal / data.baselineCount : 0;
    const eAvg =
      data.endlineCount > 0 ? data.endlineTotal / data.endlineCount : 0;
    const growth = bAvg > 0 ? ((eAvg - bAvg) / bAvg) * 100 : 0;

    return {
      subject,
      baselineAvg: bAvg,
      endlineAvg: eAvg,
      growth,
    };
  });

  return { perSubject };
}

// ================= STUDENT SCORES =================

export async function getStudentExamScores(
  user: JwtPayload,
  studentId: string,
) {
  const student = await prisma.student.findUnique({
    where: { id: studentId },
  });

  if (!student) throw new NotFoundError("Student not found");

  enforceCenterAccess(user, student.centerId);

  const scores = await prisma.examScore.findMany({
    where: { studentId },
    include: {
      exam: true,
      subject: true,
    },
    orderBy: {
      exam: {
        createdAt: "desc",
      },
    },
  });

  return scores;
}
