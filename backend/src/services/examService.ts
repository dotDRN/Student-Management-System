import { Prisma } from "@prisma/client";
import { getScopedCenterIds } from "../config/rbac.js";
import { assertCenterAccess } from "../lib/centerScope.js";
import { NotFoundError, ValidationError } from "../lib/errors.js";
import prisma from "../lib/prisma.js";
import { resolveAcademicYearId } from "../utils/academicYear.js";
import {
  getTodayUtcDateOnly,
  parseOptionalUtcDateOnly,
  parseUtcDateOnly,
} from "../utils/dateOnly.js";
import type { JwtPayload } from "../utils/jwt.js";

// ================= TYPES =================

export type CreateExamInput = {
  centerIds: string[];
  programId: string;
  examType: string;
  academicYearId: string;
  examDate?: string;
  name?: string;
};

export type ListExamQuery = {
  centerId?: string;
  programId?: string;
  examType?: string;
  academicYearId?: string;
  examDate?: string;
};

export type ScoreInputItem = {
  studentId: string;
  subjectId?: string;
  subject?: string;
  marks?: number | string | null;
  isAbsent?: boolean;
  maxMarks?: number;
  remarks?: string | null;
};

// ================= HELPERS =================

function buildScopedExamWhere(user: JwtPayload, requestedCenterId?: string): Prisma.ExamWhereInput {
  if (requestedCenterId) {
    assertCenterAccess(user, requestedCenterId, "Unauthorized access to this center");
    return { centerId: requestedCenterId };
  }
  const scopedCenterIds = getScopedCenterIds(user);
  if (scopedCenterIds !== undefined) {
    return { centerId: { in: scopedCenterIds } };
  }
  return {};
}

// ================= CREATE EXAM =================

export const createExam = async (user: JwtPayload, data: CreateExamInput) => {
  const examType = data.examType?.trim();
  if (!examType) {
    throw new ValidationError("examType is required");
  }
  if (!Array.isArray(data.centerIds) || data.centerIds.length === 0) {
    throw new ValidationError("At least one centerId is required");
  }

  const examDate = data.examDate
    ? (parseOptionalUtcDateOnly(data.examDate, "examDate") ?? getTodayUtcDateOnly())
    : getTodayUtcDateOnly();

  const resolvedAcademicYearId = await resolveAcademicYearId(data.academicYearId);
  if (!resolvedAcademicYearId) {
    throw new ValidationError("Invalid academic year");
  }

  const program = await prisma.program.findFirst({
    where: { id: data.programId, isActive: true },
    select: { id: true },
  });
  if (!program) {
    throw new NotFoundError("Program");
  }

  const uniqueCenterIds = Array.from(new Set(data.centerIds));
  const createdExams = [];
  const isoDateLabel = examDate.toISOString().slice(0, 10);

  for (const centerId of uniqueCenterIds) {
    assertCenterAccess(user, centerId, "Unauthorized access to this center");

    const center = await prisma.center.findFirst({
      where: { id: centerId, isActive: true },
      select: { id: true },
    });
    if (!center) {
      throw new NotFoundError("Center");
    }

    const existing = await prisma.exam.findFirst({
      where: {
        centerId,
        programId: data.programId,
        examType,
        academicYearId: resolvedAcademicYearId,
        examDate,
      },
      include: { center: true, program: true, academicYear: true },
    });

    if (existing) {
      createdExams.push(existing);
      continue;
    }

    const exam = await prisma.exam.create({
      data: {
        name: data.name?.trim() || `${examType} - ${isoDateLabel}`,
        examType,
        centerId,
        programId: data.programId,
        academicYearId: resolvedAcademicYearId,
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

// ================= GET EXAM SHEET (WITH SUBJECTS & ACTIVE STUDENTS) =================

export async function getExamSheet(user: JwtPayload, examId: string, batchId?: string) {
  const exam = await prisma.exam.findUnique({
    where: { id: examId },
    include: { center: true, program: true, academicYear: true },
  });

  if (!exam) throw new NotFoundError("Exam");

  assertCenterAccess(user, exam.centerId, "Unauthorized access to this center");

  const [students, subjects, scores] = await Promise.all([
    prisma.student.findMany({
      where: {
        centerId: exam.centerId,
        programId: exam.programId,
        isActive: true,
        ...(batchId ? { batchEnrollments: { some: { batchId } } } : {}),
      },
      select: { id: true, fullName: true, rollNumber: true },
      orderBy: { fullName: "asc" },
    }),
    prisma.programSubject.findMany({
      where: { programId: exam.programId },
      orderBy: { name: "asc" },
    }),
    prisma.examScore.findMany({
      where: { examId: exam.id },
      include: {
        student: {
          select: { id: true, fullName: true, rollNumber: true },
        },
        subject: true,
      },
      orderBy: { student: { fullName: "asc" } },
    }),
  ]);

  return {
    ...exam,
    students,
    subjects,
    scores,
  };
}

// ================= LIST EXAMS =================

export async function listExams(user: JwtPayload, query: ListExamQuery) {
  const where: Prisma.ExamWhereInput = buildScopedExamWhere(user, query.centerId);

  if (query.programId) where.programId = query.programId;
  if (query.examType) where.examType = query.examType.trim();

  if (query.academicYearId) {
    const academicYearId = await resolveAcademicYearId(query.academicYearId);
    if (!academicYearId) {
      return [];
    }
    where.academicYearId = academicYearId;
  }

  if (query.examDate) {
    const dayStartUtc = parseUtcDateOnly(query.examDate, "examDate");
    const nextDayUtc = new Date(dayStartUtc.getTime() + 86_400_000);
    where.examDate = {
      gte: dayStartUtc,
      lt: nextDayUtc,
    };
  }

  return prisma.exam.findMany({
    where,
    orderBy: [{ examDate: "desc" }, { createdAt: "desc" }],
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
          student: { select: { id: true, fullName: true, rollNumber: true } },
        },
      },
      academicYear: true,
      program: true,
    },
  });

  if (!exam) throw new NotFoundError("Exam");

  assertCenterAccess(user, exam.centerId, "Unauthorized access to this center");

  return exam;
}

// ================= UPSERT SCORES =================

export async function upsertExamScores(
  user: JwtPayload,
  examId: string,
  input: { scores: ScoreInputItem[] },
) {
  if (!input?.scores || !Array.isArray(input.scores) || input.scores.length === 0) {
    throw new ValidationError("At least one score entry is required");
  }

  const exam = await prisma.exam.findUnique({
    where: { id: examId },
    include: { program: { include: { subjects: true } } },
  });

  if (!exam) throw new NotFoundError("Exam");

  assertCenterAccess(user, exam.centerId, "Unauthorized access to this center");

  const enrolledStudents = await prisma.student.findMany({
    where: {
      centerId: exam.centerId,
      programId: exam.programId,
      isActive: true,
    },
    select: { id: true },
  });
  const enrolledStudentIds = new Set(enrolledStudents.map((st) => st.id));

  const subjectById = new Map<string, { id: string; maxMarks: number }>();
  const subjectIdByName = new Map<string, string>();
  for (const subj of exam.program?.subjects ?? []) {
    const maxMarks = Number(subj.maxMarks) > 0 ? Number(subj.maxMarks) : 100;
    subjectById.set(subj.id, { id: subj.id, maxMarks });
    subjectIdByName.set(subj.name.trim().toLowerCase(), subj.id);
  }

  const deduped = new Map<
    string,
    {
      studentId: string;
      subjectId: string;
      marks: Prisma.Decimal | null;
      isAbsent: boolean;
      remarks: string | null;
    }
  >();

  for (const s of input.scores) {
    if (!enrolledStudentIds.has(s.studentId)) {
      throw new ValidationError(
        `Student '${s.studentId}' is not actively enrolled in this exam's center and program`,
      );
    }

    const trimmedSubjectName = s.subject?.trim() || "";
    let resolvedSubjectId: string | undefined;

    if (s.subjectId) {
      if (!subjectById.has(s.subjectId)) {
        throw new ValidationError(
          `Subject '${s.subjectId}' does not belong to this exam's program`,
        );
      }
      resolvedSubjectId = s.subjectId;
    } else if (trimmedSubjectName) {
      resolvedSubjectId = subjectIdByName.get(trimmedSubjectName.toLowerCase());
    }

    if (!resolvedSubjectId && trimmedSubjectName && exam.programId) {
      const configuredMax = s.maxMarks !== undefined ? Number(s.maxMarks) : 100;
      if (!Number.isFinite(configuredMax) || configuredMax <= 0 || configuredMax > 1000) {
        throw new ValidationError(
          `Invalid maxMarks (${String(s.maxMarks)}) for subject '${trimmedSubjectName}'`,
        );
      }
      const createdSubject = await prisma.programSubject.upsert({
        where: {
          programId_name: {
            programId: exam.programId,
            name: trimmedSubjectName,
          },
        },
        update: {},
        create: {
          programId: exam.programId,
          name: trimmedSubjectName,
          maxMarks: configuredMax,
        },
      });
      resolvedSubjectId = createdSubject.id;
      const persistedMax = Number(createdSubject.maxMarks) > 0 ? Number(createdSubject.maxMarks) : configuredMax;
      subjectById.set(createdSubject.id, { id: createdSubject.id, maxMarks: persistedMax });
      subjectIdByName.set(createdSubject.name.trim().toLowerCase(), createdSubject.id);
    }

    if (!resolvedSubjectId) {
      throw new ValidationError(
        `Subject '${trimmedSubjectName || s.subjectId || ""}' could not be resolved`,
      );
    }

    const subjectMeta = subjectById.get(resolvedSubjectId)!;
    const isAbsent = Boolean(s.isAbsent);
    let marks: Prisma.Decimal | null = null;

    if (!isAbsent && s.marks !== null && s.marks !== undefined && s.marks !== "") {
      const numericMarks = Number(s.marks);
      if (!Number.isFinite(numericMarks) || numericMarks < 0 || numericMarks > subjectMeta.maxMarks) {
        throw new ValidationError(
          `Marks must be between 0 and ${subjectMeta.maxMarks} for student '${s.studentId}'`,
        );
      }
      marks = new Prisma.Decimal(numericMarks);
    }

    const cleanedRemarks = typeof s.remarks === "string" ? s.remarks.trim() : "";

    deduped.set(`${s.studentId}:${resolvedSubjectId}`, {
      studentId: s.studentId,
      subjectId: resolvedSubjectId,
      marks,
      isAbsent,
      remarks: cleanedRemarks || null,
    });
  }

  const processedScores = Array.from(deduped.values());

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
          remarks: score.remarks,
        },
        create: {
          examId,
          studentId: score.studentId,
          subjectId: score.subjectId,
          centerId: exam.centerId,
          marks: score.marks,
          isAbsent: score.isAbsent,
          remarks: score.remarks,
          enteredBy: user.userId,
          status: "DRAFT",
        },
      }),
    ),
  );

  return { success: true, count: processedScores.length };
}

// ================= PENDING SCORES =================

export async function getPendingExamScores(user: JwtPayload, examId: string) {
  const exam = await prisma.exam.findUnique({
    where: { id: examId },
  });

  if (!exam) throw new NotFoundError("Exam");

  assertCenterAccess(user, exam.centerId, "Unauthorized access to this center");

  const [students, subjects, existingScores] = await Promise.all([
    prisma.student.findMany({
      where: {
        centerId: exam.centerId,
        programId: exam.programId,
        isActive: true,
      },
      select: { id: true, fullName: true },
    }),
    prisma.programSubject.findMany({
      where: {
        programId: exam.programId,
      },
      select: { id: true, name: true },
    }),
    prisma.examScore.findMany({
      where: { examId },
      select: { studentId: true, subjectId: true, marks: true, isAbsent: true },
    }),
  ]);

  const completedSet = new Set(
    existingScores
      .filter((s) => s.isAbsent || s.marks !== null)
      .map((s) => `${s.studentId}-${s.subjectId}`),
  );

  const pending: Array<{ studentId: string; studentName: string; subjectId: string; subjectName: string }> = [];

  for (const student of students) {
    for (const subject of subjects) {
      const key = `${student.id}-${subject.id}`;
      if (!completedSet.has(key)) {
        pending.push({
          studentId: student.id,
          studentName: student.fullName,
          subjectId: subject.id,
          subjectName: subject.name,
        });
      }
    }
  }

  return pending;
}

// ================= EXAM COMPARISON =================

const PASS_THRESHOLD_PCT = 40;
type CohortTerm = "baseline" | "midline" | "endline";
const COHORT_TERMS: CohortTerm[] = ["baseline", "midline", "endline"];

interface TermAccumulator {
  totalPct: number;
  count: number;
  passCount: number;
}

function emptyTermAccumulator(): TermAccumulator {
  return { totalPct: 0, count: 0, passCount: 0 };
}

function computeAvgAndPass(acc: TermAccumulator) {
  if (acc.count === 0) {
    return { avgPct: 0, count: 0, passRate: 0 };
  }
  return {
    avgPct: Number((acc.totalPct / acc.count).toFixed(2)),
    count: acc.count,
    passRate: Number(((acc.passCount / acc.count) * 100).toFixed(1)),
  };
}

export async function getExamComparison(
  user: JwtPayload,
  query: ListExamQuery,
) {
  const where: Prisma.ExamWhereInput = buildScopedExamWhere(user, query.centerId);

  if (query.programId) where.programId = query.programId;

  if (query.academicYearId) {
    const academicYearId = await resolveAcademicYearId(query.academicYearId);
    if (!academicYearId) {
      return {
        perSubject: [],
        passThresholdPct: PASS_THRESHOLD_PCT,
        byTerm: {
          baseline: { gradedCount: 0, avgPct: 0, passRatePct: 0, topSubject: null, bottomSubject: null, subjects: [] },
          midline: { gradedCount: 0, avgPct: 0, passRatePct: 0, topSubject: null, bottomSubject: null, subjects: [] },
          endline: { gradedCount: 0, avgPct: 0, passRatePct: 0, topSubject: null, bottomSubject: null, subjects: [] },
        },
      };
    }
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
      maxMarks: number;
      terms: Record<CohortTerm, TermAccumulator>;
    }
  > = {};

  for (const exam of exams) {
    const kind = exam.examType.trim().toLowerCase();
    if (kind !== "baseline" && kind !== "midline" && kind !== "endline") continue;

    for (const score of exam.scores) {
      // Absent or ungraded rows must not dilute averages as 0, while genuine 0 marks remain included.
      if (score.isAbsent || score.marks === null || score.marks === undefined) {
        continue;
      }

      const val = Number(score.marks);
      if (!Number.isFinite(val)) continue;

      const rawMaxMarks = Number(score.subject?.maxMarks);
      const maxMarks = Number.isFinite(rawMaxMarks) && rawMaxMarks > 0 ? rawMaxMarks : 100;
      const scorePct = (val / maxMarks) * 100;

      const subjectName = score.subject.name.trim().toLowerCase();
      if (!subjectMap[subjectName]) {
        subjectMap[subjectName] = {
          maxMarks,
          terms: {
            baseline: emptyTermAccumulator(),
            midline: emptyTermAccumulator(),
            endline: emptyTermAccumulator(),
          },
        };
      } else {
        subjectMap[subjectName].maxMarks = maxMarks;
      }

      const acc = subjectMap[subjectName].terms[kind];
      acc.totalPct += scorePct;
      acc.count += 1;
      if (scorePct >= PASS_THRESHOLD_PCT) {
        acc.passCount += 1;
      }
    }
  }

  const perSubject = Object.entries(subjectMap).map(([subject, data]) => {
    const base = computeAvgAndPass(data.terms.baseline);
    const mid = computeAvgAndPass(data.terms.midline);
    const end = computeAvgAndPass(data.terms.endline);

    const growth =
      base.avgPct > 0
        ? Number((((end.avgPct - base.avgPct) / base.avgPct) * 100).toFixed(1))
        : 0;
    const midlineGrowth =
      base.avgPct > 0 && mid.count > 0
        ? Number((((mid.avgPct - base.avgPct) / base.avgPct) * 100).toFixed(1))
        : 0;

    return {
      subject,
      maxMarks: data.maxMarks,
      baselineAvg: base.avgPct,
      baselineCount: base.count,
      baselinePassRate: base.passRate,
      midlineAvg: mid.avgPct,
      midlineCount: mid.count,
      midlinePassRate: mid.passRate,
      endlineAvg: end.avgPct,
      endlineCount: end.count,
      endlinePassRate: end.passRate,
      growth,
      midlineGrowth,
    };
  });

  const byTerm = Object.fromEntries(
    COHORT_TERMS.map((term) => {
      let totalPct = 0;
      let totalCount = 0;
      let totalPass = 0;
      const subjectSummaries: Array<{
        subject: string;
        avgPct: number;
        passRatePct: number;
        gradedCount: number;
      }> = [];

      for (const [subject, data] of Object.entries(subjectMap)) {
        const acc = data.terms[term];
        if (acc.count === 0) continue;
        totalPct += acc.totalPct;
        totalCount += acc.count;
        totalPass += acc.passCount;
        const stats = computeAvgAndPass(acc);
        subjectSummaries.push({
          subject,
          avgPct: stats.avgPct,
          passRatePct: stats.passRate,
          gradedCount: stats.count,
        });
      }

      subjectSummaries.sort((a, b) => b.avgPct - a.avgPct || a.subject.localeCompare(b.subject));
      return [
        term,
        {
          gradedCount: totalCount,
          avgPct: totalCount > 0 ? Number((totalPct / totalCount).toFixed(2)) : 0,
          passRatePct: totalCount > 0 ? Number(((totalPass / totalCount) * 100).toFixed(1)) : 0,
          topSubject: subjectSummaries[0] ?? null,
          bottomSubject:
            subjectSummaries.length > 0 ? subjectSummaries[subjectSummaries.length - 1] : null,
          subjects: subjectSummaries,
        },
      ];
    }),
  ) as Record<
    CohortTerm,
    {
      gradedCount: number;
      avgPct: number;
      passRatePct: number;
      topSubject: { subject: string; avgPct: number; passRatePct: number; gradedCount: number } | null;
      bottomSubject: { subject: string; avgPct: number; passRatePct: number; gradedCount: number } | null;
      subjects: Array<{ subject: string; avgPct: number; passRatePct: number; gradedCount: number }>;
    }
  >;

  return { perSubject, passThresholdPct: PASS_THRESHOLD_PCT, byTerm };
}

// ================= STUDENT SCORES =================

export async function getStudentExamScores(
  user: JwtPayload,
  studentId: string,
) {
  const student = await prisma.student.findUnique({
    where: { id: studentId },
    select: { id: true, centerId: true },
  });

  if (!student) throw new NotFoundError("Student");

  assertCenterAccess(user, student.centerId, "Unauthorized access to this center");

  return prisma.examScore.findMany({
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
}
