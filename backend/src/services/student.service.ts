import type { Prisma } from '@prisma/client';
import prisma from '../lib/prisma.js';
import type { JwtPayload as TokenPayload } from '../utils/jwt.js';
import { AppError, ForbiddenError, NotFoundError, ValidationError } from '../lib/errors.js';
import { getScopedCenterIds, isAdminRole, isGlobalAdmin } from '../config/rbac.js';
import { assertCenterAccess } from '../lib/centerScope.js';
import { resolveAcademicYearId } from '../utils/academicYear.js';
import { calculateAttendancePercentage, countAttendanceStatuses } from '../utils/attendanceMetrics.js';
import { getTodayUtcDateOnly, parseOptionalUtcDateOnly, parseUtcDateOnly } from '../utils/dateOnly.js';
import {
  addFeePaymentSchema,
  bulkImportStudentsSchema,
  completeTransferSchema,
  createStudentSchema,
  linkGuardianSchema,
  promoteStudentCohortSchema,
  requestTransferSchema,
  updateStudentFeesSchema,
  updateStudentSchema,
} from '../validators/schemas.js';
import {
  bulkUpsertSkillLogs,
  createSkillLog,
  deleteSkillLog,
  getSkillMatrix as getSkillMatrixData,
  getSkillsByStudent as getSkillLogsByStudent,
  updateSkillLog,
} from './skillService.js';

/**
 * SCOPED WHERE: The core of the data visibility logic.
 * Ensures users only see students they are authorized to see.
 */
const scopedWhere = (user: TokenPayload, otherConditions: Record<string, unknown> = {}) => {
  const baseFilter: Record<string, unknown> = { isActive: true };
  const scopedCenterIds = getScopedCenterIds(user);

  if (scopedCenterIds !== undefined) {
    baseFilter.centerId = { in: scopedCenterIds };
  }

  return {
    ...baseFilter,
    ...otherConditions,
  };
};

async function validateEnrollmentTarget(centerId: string, programId: string) {
  const [center, program, centerProgram] = await Promise.all([
    prisma.center.findFirst({ where: { id: centerId, isActive: true } }),
    prisma.program.findFirst({ where: { id: programId, isActive: true } }),
    prisma.centerProgram.findFirst({
      where: { centerId, programId, isActive: true },
    }),
  ]);

  if (!center) {
    throw new NotFoundError("Center not found or inactive");
  }
  if (!program) {
    throw new NotFoundError("Program not found or inactive");
  }
  if (!centerProgram) {
    throw new ValidationError("Selected program is not offered at the selected center");
  }
}

/* ─────────────────────────────────────────
   STUDENTS
───────────────────────────────────────── */

export const createStudent = async (user: TokenPayload, data: unknown) => {
  const parsed = createStudentSchema.safeParse(data);
  if (!parsed.success) {
    throw new ValidationError("Invalid student payload", parsed.error.flatten());
  }

  const payload = parsed.data;
  assertCenterAccess(user, payload.centerId, "You are not authorized to register students for this center.");
  await validateEnrollmentTarget(payload.centerId, payload.programId);

  const academicYearId = await resolveAcademicYearId(payload.academicYearId ?? undefined, {
    fallbackToCurrent: true,
    strict: Boolean(payload.academicYearId),
  });
  const dob = parseOptionalUtcDateOnly(payload.dob, "dob");
  const enrollmentDate =
    parseOptionalUtcDateOnly(payload.enrollmentDate, "enrollmentDate") ?? getTodayUtcDateOnly();

  return prisma.student.create({
    data: {
      fullName: payload.fullName,
      centerId: payload.centerId,
      programId: payload.programId,
      academicYearId,
      createdById: user.userId,
      gender: payload.gender ?? null,
      guardianName: payload.guardianName ?? null,
      guardianPhone: payload.guardianPhone ?? null,
      dob,
      rollNumber: payload.rollNumber ?? null,
      stream: payload.stream ?? null,
      post12thChoice: payload.post12thChoice ?? null,
      collegeName: payload.collegeName ?? null,
      educationDiscontinued: payload.educationDiscontinued ?? false,
      enrollmentDate,
    },
    include: {
      center: true,
      program: true,
    },
  });
};

export const getAllStudents = async (user: TokenPayload, { page = 1, limit = 50, centerId, programId, batchId, isActive, search, sortOrder }: Record<string, any> = {}) => {
  const safeLimit = Math.min(Math.max(Number(limit) || 50, 1), 200);
  const skip = (page - 1) * safeLimit;

  // Handle center filter overrides
  if (centerId) {
    assertCenterAccess(user, centerId, "You do not have access to this center");
  }

  const normalizedIsActive =
    isActive === "all"
      ? undefined
      : isActive === false || isActive === "false"
      ? false
      : true;

  // Build the base 'where' using the scope helper
  const where = scopedWhere(user, {
    ...(centerId ? { centerId } : {}),
    ...(programId ? { programId: programId.includes(',') ? { in: programId.split(',') } : programId } : {}),
    ...(batchId ? { batchEnrollments: { some: { batchId } } } : {}),
    ...(search ? { fullName: { contains: search, mode: "insensitive" } } : {}),
  });
  if (normalizedIsActive === undefined) {
    delete where.isActive;
  } else {
    where.isActive = normalizedIsActive;
  }

  // Sorting
  let orderBy: any = { createdAt: 'desc' };
  if (sortOrder === 'name_asc') orderBy = { fullName: 'asc' };
  else if (sortOrder === 'name_desc') orderBy = { fullName: 'desc' };
  else if (sortOrder === 'roll_asc') orderBy = { rollNumber: 'asc' };
  else if (sortOrder === 'roll_desc') orderBy = { rollNumber: 'desc' };
  else if (sortOrder === 'class_asc') orderBy = { program: { name: 'asc' } };
  else if (sortOrder === 'class_desc') orderBy = { program: { name: 'desc' } };

  const [students, total] = await Promise.all([
    prisma.student.findMany({
      where,
      skip,
      take: safeLimit,
      orderBy,
      include: {
        center: true,
        program: true,
        batchEnrollments: {
          select: {
            id: true,
            batchId: true,
            batch: { select: { id: true, name: true } },
          },
        },
        createdByUser: {
          select: { id: true, fullName: true },
        },
      },
    }),
    prisma.student.count({ where }),
  ]);

  return { students, total, page, totalPages: Math.ceil(total / safeLimit) };
};

export const getStudentById = async (user: TokenPayload, id: string) => {
  const student = await prisma.student.findUnique({
    where: { id },
    include: {
      center: true,
      program: true,
      batchEnrollments: {
        select: {
          id: true,
          batchId: true,
          enrolledOn: true,
          batch: { select: { id: true, name: true } },
        },
      },
      attendanceRecords: {
        orderBy: { session: { sessionDate: "desc" } },
        take: 10,
      },
      examScores: true,
      feePayments: {
        orderBy: { paidAt: 'desc' },
      },
      createdByUser: {
        select: { id: true, fullName: true },
      },
    },
  });

  if (!student) {
    throw new NotFoundError("Student");
  }

  assertCenterAccess(user, student.centerId, "Cannot access student from another center");

  return student;
};

export const updateStudent = async (user: TokenPayload, id: string, data: any) => {
  // Logic from Vansh: Prevent changing center/program after creation
  if (typeof data === "object" && data !== null && ("centerId" in data || "programId" in data)) {
    throw new ValidationError("centerId and programId cannot be changed after creation");
  }

  const parsed = updateStudentSchema.safeParse(data);
  if (!parsed.success) {
    throw new ValidationError("Invalid student update payload", parsed.error.flatten());
  }

  const payload = parsed.data;

  const resolvedAcademicYearId =
    payload.academicYearId === null
      ? null
      : payload.academicYearId !== undefined
      ? (await resolveAcademicYearId(payload.academicYearId, {
          fallbackToCurrent: false,
          strict: true,
        })) ?? null
      : undefined;

  const updateData: Prisma.StudentUncheckedUpdateManyInput = {
    ...(payload.fullName !== undefined ? { fullName: payload.fullName } : {}),
    ...(payload.rollNumber !== undefined ? { rollNumber: payload.rollNumber } : {}),
    ...(payload.gender !== undefined ? { gender: payload.gender } : {}),
    ...(payload.guardianName !== undefined ? { guardianName: payload.guardianName } : {}),
    ...(payload.guardianPhone !== undefined ? { guardianPhone: payload.guardianPhone } : {}),
    ...(payload.stream !== undefined ? { stream: payload.stream } : {}),
    ...(payload.post12thChoice !== undefined ? { post12thChoice: payload.post12thChoice } : {}),
    ...(payload.collegeName !== undefined ? { collegeName: payload.collegeName } : {}),
    ...(payload.educationDiscontinued !== undefined
      ? { educationDiscontinued: payload.educationDiscontinued }
      : {}),
    ...(payload.isActive !== undefined ? { isActive: payload.isActive } : {}),
    ...(payload.dob === null
      ? { dob: null }
      : payload.dob !== undefined
      ? { dob: parseUtcDateOnly(payload.dob, "dob") }
      : {}),
    ...(payload.enrollmentDate
      ? { enrollmentDate: parseUtcDateOnly(payload.enrollmentDate, "enrollmentDate") }
      : {}),
    ...(resolvedAcademicYearId !== undefined ? { academicYearId: resolvedAcademicYearId } : {}),
  };

  const result = await prisma.student.updateMany({
    where: scopedWhere(user, { id }),
    data: updateData,
  });

  if (result.count === 0) {
    throw new NotFoundError("Student not found or access denied");
  }

  return prisma.student.findFirst({
    where: scopedWhere(user, { id }),
    include: {
      center: true,
      program: true,
    },
  });
};

export const deleteStudent = async (user: TokenPayload, id: string) => {
  const result = await prisma.student.updateMany({
    where: scopedWhere(user, { id }),
    data: { isActive: false },
  });
  if (result.count === 0) {
    throw new NotFoundError("Student");
  }
  return { message: "Student deactivated successfully" };
};

export const filterStudents = async (user: TokenPayload, query: Record<string, any> = {}) => {
  const page = Math.max(parseInt(query.page, 10) || 1, 1);
  const safeLimit = Math.min(Math.max(parseInt(query.limit, 10) || 50, 1), 200);
  const skip = (page - 1) * safeLimit;

  const dobFilter: { lte?: Date; gte?: Date } = {};
  const today = new Date();
  if (query.ageMin) {
    const maxDob = new Date(today);
    maxDob.setFullYear(today.getFullYear() - Number(query.ageMin));
    dobFilter.lte = maxDob;
  }
  if (query.ageMax) {
    const minDob = new Date(today);
    minDob.setFullYear(today.getFullYear() - Number(query.ageMax));
    dobFilter.gte = minDob;
  }

  const where = scopedWhere(user, {
    ...(query.gender ? { gender: query.gender } : {}),
    ...(query.programId ? { programId: query.programId } : {}),
    ...(query.centerId ? { centerId: query.centerId } : {}),
    ...(Object.keys(dobFilter).length ? { dob: dobFilter } : {}),
  });

  const [students, total] = await Promise.all([
    prisma.student.findMany({
      where,
      include: { center: true, program: true },
      orderBy: { createdAt: "desc" },
      skip,
      take: safeLimit,
    }),
    prisma.student.count({ where }),
  ]);

  return { students, total, page, totalPages: Math.ceil(total / safeLimit) };
};

export const getStudentSummary = async (user: TokenPayload, id: string) => {
  const student = await prisma.student.findFirst({
    where: scopedWhere(user, { id }),
    include: {
      center: true,
      program: true,
      attendanceRecords: {
        include: { session: true },
        orderBy: { session: { sessionDate: "desc" } },
      },
      examScores: {
        include: { exam: { select: { examType: true } } },
      },
      formSubmissions: true,
    },
  });

  if (!student) {
    throw new NotFoundError("Student");
  }

  const nonHolidaySummaryRecords = student.attendanceRecords.filter((r) => !r.session?.isHoliday);
  const summaryCounts = countAttendanceStatuses(nonHolidaySummaryRecords);
  const totalSessions =
    summaryCounts.present + summaryCounts.absent + summaryCounts.late;
  const presentCount = summaryCounts.present + summaryCounts.late;
  const attendancePercentage = calculateAttendancePercentage(summaryCounts);

  const examScoresByType = student.examScores.reduce((acc: Record<string, any[]>, score) => {
      const examType = score.exam?.examType || "unknown";
      if (!acc[examType]) {
        acc[examType] = [];
      }
      acc[examType].push(score);
      return acc;
    },
    {},
  );

  return {
    student: {
      id: student.id,
      fullName: student.fullName,
      dob: student.dob,
      gender: student.gender,
      guardianName: student.guardianName,
      guardianPhone: student.guardianPhone,
      center: student.center,
      program: student.program,
      isActive: student.isActive,
      enrollmentDate: student.enrollmentDate,
    },
    attendance: {
      present: presentCount,
      total: totalSessions,
      percentage: attendancePercentage,
    },
    examScoresByType,
    formSubmissionsCount: student.formSubmissions.length,
  };
};

export const getStudentProfile = async (user: TokenPayload, id: string) => {
  const student = await prisma.student.findFirst({
    where: scopedWhere(user, { id }),
    include: {
      center: true,
      program: true,
      attendanceRecords: {
        include: { session: true },
        orderBy: { session: { sessionDate: "desc" } },
      },
      examScores: {
        include: {
          exam: { include: { academicYear: { select: { id: true, label: true } } } },
          subject: true,
        },
      },
      formSubmissions: {
        include: {
          template: { select: { id: true, name: true, formType: true } },
        },
        orderBy: { submittedAt: "desc" },
        take: 25,
      },
    },
  });

  if (!student) {
    throw new NotFoundError("Student");
  }

  const allRecords = student.attendanceRecords;
  const nonHolidayRecords = allRecords.filter((r) => !r.session?.isHoliday);
  const attendanceCounts = countAttendanceStatuses(nonHolidayRecords);
  const totalSessions =
    attendanceCounts.present + attendanceCounts.absent + attendanceCounts.late;
  const presentCount = attendanceCounts.present + attendanceCounts.late;
  const attendancePct = calculateAttendancePercentage(attendanceCounts);
  const records = allRecords.slice(0, 15);

  const examScoresList = student.examScores;
  let sumPct = 0;
  let n = 0;
  for (const es of examScoresList) {
    if (es.isAbsent || es.marks == null || !es.subject?.maxMarks) continue;
    const maxM = Number(es.subject.maxMarks);
    if (!Number.isFinite(maxM) || maxM <= 0) continue;
    sumPct += (Number(es.marks) / maxM) * 100;
    n++;
  }
  const avgExamPct = n > 0 ? Number((sumPct / n).toFixed(1)) : null;

  const groupedTrend = [...nonHolidayRecords.slice(0, 15)].reverse().reduce((acc, r) => {
    const d = r.session.sessionDate.toISOString().slice(0, 10);
    const presentFlag = r.status === "present" || r.status === "late" ? 1 : 0;
    if (!acc[d]) {
      acc[d] = { date: d, present: presentFlag };
    } else {
      acc[d].present = Math.max(acc[d].present, presentFlag);
    }
    return acc;
  }, {} as Record<string, { date: string; present: number }>);

  const attendanceTrend = Object.values(groupedTrend);

  const bySubject: Record<
    string,
    {
      maxMarks: number;
      baseline?: number | null;
      baselineMarks?: number | null;
      baselineAbsent?: boolean;
      midline?: number | null;
      midlineMarks?: number | null;
      midlineAbsent?: boolean;
      endline?: number | null;
      endlineMarks?: number | null;
      endlineAbsent?: boolean;
    }
  > = {};
  let academicYearLabel: string | null = null;
  for (const es of examScoresList) {
    if (!academicYearLabel && (es.exam as { academicYear?: { label?: string } } | null)?.academicYear?.label) {
      academicYearLabel = (es.exam as { academicYear?: { label?: string } }).academicYear!.label!;
    }
    if (!es.subject) continue;
    const subj = es.subject.name;
    const maxMarks = Number(es.subject.maxMarks) > 0 ? Number(es.subject.maxMarks) : 100;
    if (!bySubject[subj]) {
      bySubject[subj] = { maxMarks };
    } else {
      bySubject[subj].maxMarks = maxMarks;
    }
    const rawMarks = es.isAbsent || es.marks == null ? null : Number(es.marks);
    const pct = rawMarks == null ? null : Number(((rawMarks / maxMarks) * 100).toFixed(1));
    const type = es.exam?.examType?.trim().toLowerCase();
    if (type === "baseline") {
      bySubject[subj].baseline = pct;
      bySubject[subj].baselineMarks = rawMarks;
      bySubject[subj].baselineAbsent = Boolean(es.isAbsent);
    } else if (type === "midline") {
      bySubject[subj].midline = pct;
      bySubject[subj].midlineMarks = rawMarks;
      bySubject[subj].midlineAbsent = Boolean(es.isAbsent);
    } else if (type === "endline") {
      bySubject[subj].endline = pct;
      bySubject[subj].endlineMarks = rawMarks;
      bySubject[subj].endlineAbsent = Boolean(es.isAbsent);
    }
  }
  const examComparison = Object.entries(bySubject).map(([subject, v]) => ({
    subject,
    maxMarks: v.maxMarks,
    baseline: v.baseline ?? null,
    baselineMarks: v.baselineMarks ?? null,
    baselineAbsent: v.baselineAbsent ?? false,
    midline: v.midline ?? null,
    midlineMarks: v.midlineMarks ?? null,
    midlineAbsent: v.midlineAbsent ?? false,
    endline: v.endline ?? null,
    endlineMarks: v.endlineMarks ?? null,
    endlineAbsent: v.endlineAbsent ?? false,
  }));

  // Fetch skill logs for this student
  const skillLogs = await prisma.studentSkillLog.findMany({
    where: { studentId: student.id },
    include: { skill: true },
    orderBy: { assessedOn: 'desc' },
  });

  // Build skill radar from latest skill logs
  const skillRadar: { skill: string; score: number; maxLevel: number }[] = [];
  const seenSkills = new Set<string>();
  for (const log of skillLogs) {
    const skillName = log.skill?.name || 'Unknown';
    if (!seenSkills.has(skillName)) {
      seenSkills.add(skillName);
      skillRadar.push({
        skill: skillName,
        score: log.level ?? 0,
        maxLevel: log.skill?.maxLevel && log.skill.maxLevel > 0 ? log.skill.maxLevel : 5,
      });
    }
  }
  const skillScore = skillRadar.length > 0
    ? Number((skillRadar.reduce((sum, s) => sum + s.score, 0) / skillRadar.length).toFixed(1))
    : null;

  // Fetch career entries
  const careerTemplate = await prisma.formTemplate.findFirst({ where: { name: 'Career Tracking' } });
  const careerEntries = careerTemplate
    ? await prisma.formSubmission.findMany({
        where: { studentId: student.id, templateId: careerTemplate.id },
        orderBy: { submittedAt: 'desc' },
        take: 10,
      })
    : [];

  // Fetch parent links
  let parents: any[] = [];
  try {
    parents = await prisma.parentStudent.findMany({
      where: { studentId: student.id },
      include: { parent: { select: { id: true, fullName: true, email: true, phone: true } } },
    });
  } catch { /* ParentStudent may not have data */ }

  const { attendanceRecords: _ar, examScores: _ex, formSubmissions: _fs, ...studentRest } =
    student;

  return {
    student: studentRest,
    stats: {
      attendancePct,
      totalSessions,
      presentCount,
      avgExamPct,
      skillScore,
    },
    attendanceTrend,
    examComparison,
    skillRadar,
    academicYearLabel,
    formSubmissions: student.formSubmissions,
    parents,
    careers: careerEntries.map(sub => ({ id: sub.id, studentId: sub.studentId, createdAt: sub.submittedAt, ...(sub.data as Record<string, unknown>) })),
  };
};

/* â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
   ATTENDANCE
â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */

export const addAttendance = async (user: TokenPayload, studentId: string, data: any) => {
  await getStudentById(user, studentId);
  return prisma.attendanceRecord.create({ data: { ...data, studentId } });
};

export const getAttendanceByStudent = async (user: TokenPayload, studentId: string) => {
  await getStudentById(user, studentId);
  return prisma.attendanceRecord.findMany({
    where: { studentId },
    orderBy: { session: { sessionDate: "desc" } },
  });
};

export const updateAttendance = async (user: TokenPayload, id: string, data: any) => {
  const record = await prisma.attendanceRecord.findUnique({ where: { id } });
  if (!record) {
    throw new NotFoundError("Attendance record");
  }
  assertCenterAccess(user, record.centerId, "You are not authorized to update attendance for this center");
  return prisma.attendanceRecord.update({
    where: { id },
    data: {
      ...(data.status !== undefined ? { status: data.status } : {}),
      ...(data.remarks !== undefined ? { remarks: data.remarks } : {}),
    },
  });
};

/* â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
   SKILLS
â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */

export const addSkill = async (user: TokenPayload, studentId: string, data: unknown) =>
  createSkillLog(user, studentId, data);

export const getSkillMatrix = async (
  user: TokenPayload,
  query: { centerId?: string; programId?: string; batchId?: string; assessedOn?: string },
) => getSkillMatrixData(user, query);

export const bulkUpsertSkills = async (user: TokenPayload, data: unknown) =>
  bulkUpsertSkillLogs(user, data);

export const getSkillsByStudent = async (user: TokenPayload, studentId: string) =>
  getSkillLogsByStudent(user, studentId);

export const updateSkill = async (user: TokenPayload, id: string, data: unknown) =>
  updateSkillLog(user, id, data);

export const deleteSkill = async (user: TokenPayload, id: string) =>
  deleteSkillLog(user, id);

/* â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
   CAREERS (Linked to Forms)
â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */

export const addCareer = async (user: TokenPayload, studentId: string, data: any) => {
  const student = await getStudentById(user, studentId);
  
  let template = await prisma.formTemplate.findFirst({ where: { name: "Career Tracking" } });
  if (!template) {
    template = await prisma.formTemplate.create({
      data: {
        name: "Career Tracking",
        formType: "system",
        targetEntity: "student",
        createdBy: user.userId,
        schema: {
          fields: [
            { name: "careerGoal", label: "Career Goal", type: "text", required: false },
            { name: "industry", label: "Industry", type: "text", required: false },
            { name: "notes", label: "Notes", type: "textarea", required: false },
          ],
        },
      }
    });
  }

  const submission = await prisma.formSubmission.create({
    data: {
      templateId: template.id,
      studentId: student.id,
      centerId: student.centerId,
      submittedBy: user.userId,
      data: data
    }
  });

  return { id: submission.id, studentId: submission.studentId, createdAt: submission.submittedAt, ...(submission.data as Record<string, unknown>) };
};

export const getCareersByStudent = async (user: TokenPayload, studentId: string) => {
  const student = await getStudentById(user, studentId);
  const template = await prisma.formTemplate.findFirst({ where: { name: "Career Tracking" } });
  if (!template) return [];

  const submissions = await prisma.formSubmission.findMany({
    where: { studentId: student.id, templateId: template.id },
    orderBy: { submittedAt: 'desc' }
  });
  
  return submissions.map(sub => ({ id: sub.id, studentId: sub.studentId, createdAt: sub.submittedAt, ...(sub.data as Record<string, unknown>) }));
};

export const updateCareer = async (user: TokenPayload, id: string, data: any) => {
  const submission = await prisma.formSubmission.findUnique({ where: { id } });
  if (!submission) throw new NotFoundError("Career record");
  assertCenterAccess(user, submission.centerId, "You are not authorized to modify career records for this center");

  const updated = await prisma.formSubmission.update({
    where: { id },
    data: { data }
  });

  return { id: updated.id, studentId: updated.studentId, createdAt: updated.submittedAt, ...(updated.data as Record<string, unknown>) };
};

export const deleteCareer = async (user: TokenPayload, id: string) => {
  const submission = await prisma.formSubmission.findUnique({ where: { id } });
  if (!submission) throw new NotFoundError("Career record");
  assertCenterAccess(user, submission.centerId, "You are not authorized to delete career records for this center");
  return prisma.formSubmission.delete({ where: { id } });
};

/* ─────────────────────────────────────────
   TRANSFER WORKFLOW
───────────────────────────────────────── */

export const requestTransfer = async (
  user: TokenPayload,
  studentIds: string[],
  reason?: string | null
) => {
  const parsed = requestTransferSchema.safeParse({ studentIds, reason });
  if (!parsed.success) {
    throw new ValidationError("Invalid transfer request payload", parsed.error.flatten());
  }

  const uniqueIds = [...new Set(parsed.data.studentIds)];
  const eligible = await prisma.student.findMany({
    where: scopedWhere(user, {
      id: { in: uniqueIds },
      transferStatus: 'active',
    }),
    select: { id: true },
  });

  if (eligible.length === 0) {
    throw new NotFoundError("No active students found in your authorized centers for transfer");
  }

  if (eligible.length !== uniqueIds.length) {
    throw new ValidationError("Some selected students are outside your center scope, inactive, or already pending transfer");
  }

  const result = await prisma.student.updateMany({
    where: scopedWhere(user, {
      id: { in: uniqueIds },
      transferStatus: 'active',
    }),
    data: {
      transferStatus: 'pending_transfer',
    },
  });

  return { updated: result.count };
};

export const getTransferRequests = async (user: TokenPayload) => {
  const where = scopedWhere(user, {
    transferStatus: 'pending_transfer',
  });

  return prisma.student.findMany({
    where,
    include: {
      center: true,
      program: true,
      createdByUser: {
        select: { id: true, fullName: true },
      },
    },
    orderBy: { updatedAt: 'desc' },
  });
};

export const completeTransfer = async (
  user: TokenPayload,
  studentIds: string[],
  newTeacherId: string,
  newCenterId: string,
  reason?: string | null
) => {
  if (!isAdminRole(user.role)) {
    throw new ForbiddenError("Only administrators can complete student transfers");
  }

  const parsed = completeTransferSchema.safeParse({
    studentIds,
    newTeacherId,
    newCenterId,
    reason,
  });
  if (!parsed.success) {
    throw new ValidationError("Invalid transfer completion payload", parsed.error.flatten());
  }

  assertCenterAccess(user, parsed.data.newCenterId, "You are not authorized to transfer students to this center");

  const uniqueIds = [...new Set(parsed.data.studentIds)];

  const [targetCenter, targetTeacher] = await Promise.all([
    prisma.center.findFirst({ where: { id: parsed.data.newCenterId, isActive: true } }),
    prisma.user.findFirst({
      where: { id: parsed.data.newTeacherId, tenantId: user.tenantId, isActive: true },
      include: {
        centerAssignments: {
          where: {
            centerId: parsed.data.newCenterId,
            OR: [{ validUntil: null }, { validUntil: { gte: getTodayUtcDateOnly() } }],
          },
          select: { id: true },
        },
      },
    }),
  ]);

  if (!targetCenter) {
    throw new NotFoundError("Target center not found or inactive");
  }
  if (!targetTeacher) {
    throw new NotFoundError("Target teacher not found or inactive in this organization");
  }
  if (!isGlobalAdmin(targetTeacher.role) && targetTeacher.centerAssignments.length === 0) {
    throw new ValidationError("Target teacher is not actively assigned to the destination center");
  }

  const students = await prisma.student.findMany({
    where: scopedWhere(user, {
      id: { in: uniqueIds },
      transferStatus: 'pending_transfer',
    }),
  });

  if (students.length === 0) {
    throw new NotFoundError('No pending transfer students found in your authorized scope');
  }

  if (students.length !== uniqueIds.length) {
    throw new ValidationError('One or more selected students are not pending transfer or are outside your authorized scope');
  }

  const validIds = students.map((s) => s.id);
  const transferReason = parsed.data.reason?.trim() || 'Transfer via admin workflow';

  await prisma.$transaction(async (tx) => {
    for (const s of students) {
      await tx.studentTransfer.create({
        data: {
          studentId: s.id,
          fromCenterId: s.centerId,
          toCenterId: parsed.data.newCenterId,
          transferDate: getTodayUtcDateOnly(),
          reason: transferReason,
          approvedBy: user.userId,
        },
      });
    }

    await tx.student.updateMany({
      where: { id: { in: validIds }, transferStatus: 'pending_transfer' },
      data: {
        centerId: parsed.data.newCenterId,
        transferStatus: 'active',
      },
    });
  });

  return { transferred: students.length };
};

/* ─────────────────────────────────────────
   FEE MANAGEMENT
───────────────────────────────────────── */

export const addFeePayment = async (
  user: TokenPayload,
  studentId: string,
  amount: number,
  notes?: string
) => {
  const parsed = addFeePaymentSchema.safeParse({ amount, notes });
  if (!parsed.success) {
    throw new ValidationError("Invalid fee payment payload", parsed.error.flatten());
  }

  const student = await getStudentById(user, studentId);

  return prisma.$transaction(async (tx) => {
    const payment = await tx.feePayment.create({
      data: {
        studentId: student.id,
        amount: parsed.data.amount,
        notes: parsed.data.notes ?? null,
        createdBy: user.userId,
      },
    });

    const agg = await tx.feePayment.aggregate({
      where: { studentId: student.id },
      _sum: { amount: true },
    });

    const totalPaid = Number(agg._sum.amount || 0);
    const totalFees = Number(student.totalFees || 0);

    await tx.student.update({
      where: { id: student.id },
      data: {
        feesPaid: totalPaid,
        isFullyPaid: totalFees > 0 && totalPaid >= totalFees,
      },
    });

    return payment;
  });
};

export const getFeePayments = async (user: TokenPayload, studentId: string) => {
  await getStudentById(user, studentId);
  return prisma.feePayment.findMany({
    where: { studentId },
    orderBy: { paidAt: 'desc' },
  });
};

export const updateStudentFees = async (
  user: TokenPayload,
  studentId: string,
  data: { totalFees?: number; isFullyPaid?: boolean }
) => {
  if (data.totalFees !== undefined) {
    const parsed = updateStudentFeesSchema.safeParse({ totalFees: data.totalFees });
    if (!parsed.success) {
      throw new ValidationError("Invalid total fees amount", parsed.error.flatten());
    }
    data = { ...data, totalFees: parsed.data.totalFees };
  }

  const student = await getStudentById(user, studentId);

  return prisma.$transaction(async (tx) => {
    const agg = await tx.feePayment.aggregate({
      where: { studentId: student.id },
      _sum: { amount: true },
    });

    const totalPaid = Number(agg._sum.amount || 0);
    const effectiveTotalFees =
      data.totalFees !== undefined ? Number(data.totalFees) : Number(student.totalFees || 0);

    const computedIsFullyPaid =
      effectiveTotalFees > 0
        ? totalPaid >= effectiveTotalFees
        : data.isFullyPaid ?? Boolean(student.isFullyPaid);

    return tx.student.update({
      where: { id: student.id },
      data: {
        ...(data.totalFees !== undefined ? { totalFees: data.totalFees } : {}),
        isFullyPaid: computedIsFullyPaid,
      },
      include: { center: true, program: true },
    });
  });
};

/* ─────────────────────────────────────────
   DASHBOARD SUMMARY
───────────────────────────────────────── */

export const getDashboardStats = async (user: TokenPayload) => {
  const scopedCenterIds = getScopedCenterIds(user);
  const centerFilter = scopedCenterIds !== undefined ? { centerId: { in: scopedCenterIds } } : {};

  const [totalStudents, attendanceRecords, skillLogs] = await Promise.all([
    prisma.student.count({ where: { isActive: true, ...centerFilter } }),
    prisma.attendanceRecord.findMany({
      where: {
        ...centerFilter,
        session: { isHoliday: false },
      },
      select: { status: true },
    }),
    prisma.studentSkillLog.findMany({
      where: centerFilter,
      include: { skill: { select: { name: true } } },
    }),
  ]);

  const counts = countAttendanceStatuses(attendanceRecords);
  const attendanceRate = calculateAttendancePercentage(counts);
  const totalSessions = counts.present + counts.absent + counts.late;

  const skillBuckets = new Map<string, { total: number; count: number }>();
  for (const log of skillLogs) {
    const name = log.skill?.name || "Other";
    const entry = skillBuckets.get(name) ?? { total: 0, count: 0 };
    entry.total += Number(log.level || 0);
    entry.count += 1;
    skillBuckets.set(name, entry);
  }

  const avgSkillsByName: Record<string, number> = {};
  for (const [name, bucket] of skillBuckets.entries()) {
    avgSkillsByName[name] = bucket.count > 0 ? Number((bucket.total / bucket.count).toFixed(1)) : 0;
  }

  return {
    totalStudents,
    totalSessions,
    attendanceRate: `${attendanceRate}%`,
    attendanceRateValue: attendanceRate,
    avgSkills: {
      communication: avgSkillsByName["Communication"] ?? 0,
      confidence: avgSkillsByName["Confidence"] ?? 0,
      computerSkill: avgSkillsByName["Computer Skill"] ?? avgSkillsByName["Computer Skills"] ?? 0,
      problemSolving: avgSkillsByName["Problem Solving"] ?? 0,
      languageSkill: avgSkillsByName["Language Skill"] ?? avgSkillsByName["Language"] ?? 0,
      bySkill: avgSkillsByName,
    },
  };
};

/* ─────────────────────────────────────────
   BULK STUDENT IMPORT
───────────────────────────────────────── */

export const bulkImportStudents = async (user: TokenPayload, data: unknown) => {
  const parsed = bulkImportStudentsSchema.safeParse(data);
  if (!parsed.success) {
    throw new ValidationError("Invalid bulk import payload", parsed.error.flatten());
  }

  const payload = parsed.data;
  assertCenterAccess(user, payload.centerId, "You are not authorized to import students for this center.");
  await validateEnrollmentTarget(payload.centerId, payload.programId);

  const academicYearId = await resolveAcademicYearId(payload.academicYearId ?? undefined, {
    fallbackToCurrent: true,
    strict: Boolean(payload.academicYearId),
  });

  const seenRollNumbers = new Set<string>();
  const preparedRows = payload.students.map((row, idx) => {
    const rowNum = idx + 1;
    if (row.rollNumber) {
      const normalizedRoll = row.rollNumber.trim().toLowerCase();
      if (seenRollNumbers.has(normalizedRoll)) {
        throw new ValidationError(`Row ${rowNum}: duplicate rollNumber "${row.rollNumber}" within the import sheet`);
      }
      seenRollNumbers.add(normalizedRoll);
    }

    const dob = parseOptionalUtcDateOnly(row.dob, `Row ${rowNum} dob`);
    const enrollmentDate =
      parseOptionalUtcDateOnly(row.enrollmentDate, `Row ${rowNum} enrollmentDate`) ?? getTodayUtcDateOnly();

    return {
      fullName: row.fullName,
      centerId: payload.centerId,
      programId: payload.programId,
      academicYearId,
      createdById: user.userId,
      rollNumber: row.rollNumber ?? null,
      dob: dob ?? null,
      gender: row.gender ?? null,
      guardianName: row.guardianName ?? null,
      guardianPhone: row.guardianPhone ?? null,
      address: row.address ?? null,
      stream: row.stream ?? null,
      post12thChoice: row.post12thChoice ?? null,
      collegeName: row.collegeName ?? null,
      educationDiscontinued: row.educationDiscontinued ?? false,
      enrollmentDate,
      ...(row.totalFees !== undefined ? { totalFees: row.totalFees } : {}),
    };
  });

  const created = await prisma.$transaction(async (tx) => {
    const results = [];
    for (const entry of preparedRows) {
      results.push(
        await tx.student.create({
          data: entry,
          include: {
            center: { select: { id: true, name: true } },
            program: { select: { id: true, name: true, code: true } },
          },
        }),
      );
    }
    return results;
  });

  return {
    createdCount: created.length,
    students: created,
  };
};

/* ─────────────────────────────────────────
   PARENT / GUARDIAN LINKING
───────────────────────────────────────── */

export const linkGuardian = async (
  user: TokenPayload,
  studentId: string,
  input: unknown,
) => {
  const parsed = linkGuardianSchema.safeParse(input);
  if (!parsed.success) {
    throw new ValidationError("Invalid guardian link payload", parsed.error.flatten());
  }

  await getStudentById(user, studentId);

  const parentUser = await prisma.user.findFirst({
    where: parsed.data.parentUserId
      ? {
          id: parsed.data.parentUserId,
          ...(user.tenantId ? { tenantId: user.tenantId } : {}),
        }
      : {
          email: { equals: parsed.data.email!, mode: "insensitive" },
          ...(user.tenantId ? { tenantId: user.tenantId } : {}),
        },
    select: {
      id: true,
      fullName: true,
      email: true,
      phone: true,
      role: true,
      isActive: true,
    },
  });

  if (!parentUser || !parentUser.isActive) {
    throw new NotFoundError("Parent user not found or inactive");
  }
  if (parentUser.role !== "parent") {
    throw new ValidationError("Selected user does not have the parent role");
  }

  const existing = await prisma.parentStudent.findFirst({
    where: { parentUserId: parentUser.id, studentId },
  });
  if (existing) {
    throw new AppError("Guardian is already linked to this student", 409);
  }

  return prisma.parentStudent.create({
    data: {
      parentUserId: parentUser.id,
      studentId,
    },
    include: {
      parent: { select: { id: true, fullName: true, email: true, phone: true } },
    },
  });
};

export const unlinkGuardian = async (
  user: TokenPayload,
  studentId: string,
  parentUserId: string,
) => {
  await getStudentById(user, studentId);

  const existing = await prisma.parentStudent.findFirst({
    where: { studentId, parentUserId },
  });
  if (!existing) {
    throw new NotFoundError("Guardian link");
  }

  await prisma.parentStudent.delete({ where: { id: existing.id } });
  return { deleted: true, studentId, parentUserId };
};

/* ─────────────────────────────────────────
   ACADEMIC YEAR COHORT PROMOTION & LIFECYCLE
───────────────────────────────────────── */

export const promoteStudentCohort = async (user: TokenPayload, input: unknown) => {
  const parsed = promoteStudentCohortSchema.safeParse(input);
  if (!parsed.success) {
    throw new ValidationError("Invalid cohort promotion payload", parsed.error.flatten());
  }

  const targetAcademicYearId = await resolveAcademicYearId(parsed.data.targetAcademicYearId, {
    fallbackToCurrent: false,
    strict: true,
  });
  if (!targetAcademicYearId) {
    throw new ValidationError("Target academic year not found");
  }

  const dedupedByStudent = new Map<string, (typeof parsed.data.transitions)[number]>();
  for (const item of parsed.data.transitions) {
    dedupedByStudent.set(item.studentId, item);
  }
  const transitions = Array.from(dedupedByStudent.values());
  const studentIds = transitions.map((t) => t.studentId);

  const students = await prisma.student.findMany({
    where: { id: { in: studentIds } },
    select: {
      id: true,
      fullName: true,
      centerId: true,
      programId: true,
      academicYearId: true,
      stream: true,
      post12thChoice: true,
      collegeName: true,
      educationDiscontinued: true,
      isActive: true,
    },
  });
  const studentMap = new Map(students.map((s) => [s.id, s]));

  for (const t of transitions) {
    const stu = studentMap.get(t.studentId);
    if (!stu) {
      throw new NotFoundError(`Student (${t.studentId})`);
    }
    assertCenterAccess(user, stu.centerId, `Not authorized to transition '${stu.fullName}'`);
  }

  const targetProgramIds = Array.from(
    new Set(
      transitions
        .filter((t) => t.action === "promote" && t.targetProgramId)
        .map((t) => t.targetProgramId as string),
    ),
  );
  if (targetProgramIds.length > 0) {
    const activePrograms = await prisma.program.findMany({
      where: { id: { in: targetProgramIds }, isActive: true },
      select: { id: true },
    });
    const validProgramSet = new Set(activePrograms.map((p) => p.id));
    for (const pid of targetProgramIds) {
      if (!validProgramSet.has(pid)) {
        throw new NotFoundError(`Target program (${pid})`);
      }
    }
  }

  const updatedStudents = await prisma.$transaction(async (tx) => {
    const results = [];
    for (const item of transitions) {
      const prev = studentMap.get(item.studentId)!;
      const updateData: Prisma.StudentUncheckedUpdateInput = {
        academicYearId: targetAcademicYearId,
      };

      if (item.action === "promote") {
        updateData.programId = item.targetProgramId!;
        updateData.isActive = true;
        updateData.educationDiscontinued = false;
        if (item.stream !== undefined) updateData.stream = item.stream;
        if (item.targetProgramId !== prev.programId) {
          await tx.batchEnrollment.deleteMany({
            where: {
              studentId: item.studentId,
              batch: { activity: { programId: { not: item.targetProgramId! } } },
            },
          });
        }
      } else if (item.action === "retain") {
        updateData.isActive = true;
        updateData.educationDiscontinued = false;
        if (item.stream !== undefined) updateData.stream = item.stream;
      } else if (item.action === "alumni") {
        updateData.isActive = false;
        updateData.educationDiscontinued = false;
        if (item.post12thChoice !== undefined) updateData.post12thChoice = item.post12thChoice;
        if (item.collegeName !== undefined) updateData.collegeName = item.collegeName;
      } else if (item.action === "discontinued") {
        updateData.isActive = false;
        updateData.educationDiscontinued = true;
        if (item.post12thChoice !== undefined) updateData.post12thChoice = item.post12thChoice;
      }

      const updated = await tx.student.update({
        where: { id: item.studentId },
        data: updateData,
        include: {
          center: { select: { id: true, name: true } },
          program: { select: { id: true, name: true, code: true } },
          academicYear: { select: { id: true, label: true } },
        },
      });

      await tx.auditLog.create({
        data: {
          userId: user.userId,
          action: "COHORT_LIFECYCLE_TRANSITION",
          tableName: "students",
          recordId: item.studentId,
          oldData: {
            programId: prev.programId,
            academicYearId: prev.academicYearId,
            isActive: prev.isActive,
            educationDiscontinued: prev.educationDiscontinued,
          },
          newData: {
            lifecycleAction: item.action,
            programId: updated.programId,
            academicYearId: updated.academicYearId,
            isActive: updated.isActive,
            educationDiscontinued: updated.educationDiscontinued,
            post12thChoice: updated.post12thChoice,
            collegeName: updated.collegeName,
            discontinuationReason: item.discontinuationReason ?? null,
          },
        },
      });

      results.push(updated);
    }
    return results;
  });

  const summary = {
    promoted: transitions.filter((t) => t.action === "promote").length,
    retained: transitions.filter((t) => t.action === "retain").length,
    alumni: transitions.filter((t) => t.action === "alumni").length,
    discontinued: transitions.filter((t) => t.action === "discontinued").length,
  };

  return {
    targetAcademicYearId,
    updatedCount: updatedStudents.length,
    summary,
    students: updatedStudents,
  };
};
