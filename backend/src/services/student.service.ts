import prisma from '../lib/prisma.js';
import { z } from "zod";
import type { JwtPayload as TokenPayload } from '../lib/auth.js';
import { ForbiddenError, NotFoundError, ValidationError } from '../lib/errors.js';

const phone10Digit = z
  .string()
  .optional()
  .nullable()
  .refine(
    (val) => !val || /^\d{10}$/.test(val),
    "Guardian phone must be exactly 10 digits"
  );

const studentCreateSchema = z.object({
  fullName: z.string().min(1, "Name is required"),
  dob: z
    .string()
    .optional()
    .nullable()
    .transform((val) => (val === "" ? null : val))
    .refine((val) => !val || !Number.isNaN(Date.parse(val)), "Invalid date format"),
  gender: z.enum(["male", "female", "other"]).optional().nullable(),
  guardianName: z.string().optional().nullable(),
  guardianPhone: phone10Digit,
  centerId: z.string().uuid("Invalid Center ID"),
  programId: z.string().uuid("Invalid Program ID"),
  rollNumber: z.string().optional().nullable(),
});

const studentUpdateSchema = z.object({
  fullName: z.string().min(1).optional(),
  rollNumber: z.string().optional().nullable(),
  dob: z
    .string()
    .refine((value) => !Number.isNaN(Date.parse(value)), "Invalid date")
    .optional(),
  gender: z.enum(["male", "female", "other"]).optional(),
  guardianName: z.string().optional(),
  guardianPhone: phone10Digit,
});

/**
 * SCOPED WHERE: The core of the data visibility logic.
 * Ensures users only see students they are authorized to see.
 */
const scopedWhere = (user: TokenPayload, otherConditions: Record<string, unknown> = {}) => {
  const baseFilter: any = { isActive: true };
  const userRole = user.role;
  const effectiveUserId = user.userId;

  // super_admin & tech_admin → NO restrictions, see everything globally
  // center_admin → see everything in their centers
  // teachers → see everything in their centers (can be restricted further if needed)
  if (userRole !== 'super_admin' && userRole !== 'tech_admin') {
     baseFilter.centerId = { in: user.centerIds || [] };
  }

  return {
    ...baseFilter,
    ...otherConditions,
  };
};

/* ─────────────────────────────────────────
   STUDENTS
───────────────────────────────────────── */

export const createStudent = async (user: TokenPayload, data: any) => {
  const parsed = studentCreateSchema.safeParse(data);
  if (!parsed.success) {
    throw new ValidationError("Invalid student payload", parsed.error.flatten());
  }

  const payload = parsed.data;
  const userRole = user.role;

  // Authorization check for center assignment
  if (userRole !== 'super_admin' && userRole !== 'tech_admin') {
    const isAssigned = user.centerIds?.includes(payload.centerId);
    if (!isAssigned) {
      throw new ForbiddenError("You are not authorized to register students for this center.");
    }
  }

  return prisma.student.create({
    data: {
      fullName: payload.fullName,
      centerId: payload.centerId,
      programId: payload.programId,
      createdById: user.userId,
      gender: payload.gender || null,
      guardianName: payload.guardianName || null,
      guardianPhone: payload.guardianPhone || null,
      dob: payload.dob ? new Date(payload.dob) : null,
      rollNumber: payload.rollNumber || null,
    },
    include: {
      center: true,
      program: true,
    },
  });
};

export const getAllStudents = async (user: TokenPayload, { page = 1, limit = 50, centerId, programId, isActive, search, sortOrder }: Record<string, any> = {}) => {
  const safeLimit = Math.min(Math.max(Number(limit) || 50, 1), 200);
  const skip = (page - 1) * safeLimit;

  // Build the base 'where' using the scope helper
  const where = scopedWhere(user, {
    isActive: isActive !== undefined ? isActive : true,
    ...(centerId ? { centerId } : {}),
    ...(programId ? { programId: programId.includes(',') ? { in: programId.split(',') } : programId } : {}),
    ...(search ? { fullName: { contains: search, mode: "insensitive" } } : {}),
  });

  // Handle center filter overrides
  if (centerId && user.role !== 'super_admin' && user.role !== 'tech_admin') {
     if (!user.centerIds.includes(centerId)) {
        throw new ForbiddenError("You do not have access to this center");
     }
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

  if (user.role !== 'super_admin' && user.role !== 'tech_admin' && !user.centerIds.includes(student.centerId)) {
    throw new ForbiddenError("Cannot access student from another center");
  }

  return student;
};

export const updateStudent = async (user: TokenPayload, id: string, data: any) => {
  // Logic from Vansh: Prevent changing center/program after creation
  if (typeof data === "object" && data !== null && ("centerId" in data || "programId" in data)) {
    throw new ValidationError("centerId and programId cannot be changed after creation");
  }

  const parsed = studentUpdateSchema.safeParse(data);
  if (!parsed.success) {
    throw new ValidationError("Invalid student update payload", parsed.error.flatten());
  }

  const payload = parsed.data;

  const result = await prisma.student.updateMany({
    where: scopedWhere(user, { id }),
    data: {
      ...payload,
      ...(payload.dob ? { dob: new Date(payload.dob) } : {}),
    },
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

  const totalSessions = student.attendanceRecords.length;
  const presentCount = student.attendanceRecords.filter(
    (record) => record.status === "present",
  ).length;
  const attendancePercentage =
    totalSessions > 0 ? Number(((presentCount / totalSessions) * 100).toFixed(2)) : 0;

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
        take: 10,
      },
      examScores: {
        include: { exam: true, subject: true },
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

  const records = student.attendanceRecords;
  const totalSessions = records.length;
  const presentCount = records.filter((r) => r.status === "present").length;
  const attendancePct =
    totalSessions > 0 ? Number(((presentCount / totalSessions) * 100).toFixed(1)) : 0;

  const examScoresList = student.examScores;
  let sumPct = 0;
  let n = 0;
  for (const es of examScoresList) {
    if (es.marks == null || !es.subject?.maxMarks) continue;
    sumPct += (Number(es.marks) / Number(es.subject.maxMarks)) * 100;
    n++;
  }
  const avgExamPct = n > 0 ? Number((sumPct / n).toFixed(1)) : null;

  const groupedTrend = [...records].reverse().reduce((acc, r) => {
    const d = r.session.sessionDate.toISOString().slice(0, 10);
    if (!acc[d]) {
      acc[d] = { date: d, present: r.status === "present" ? 1 : 0 };
    } else {
      acc[d].present = Math.max(acc[d].present, r.status === "present" ? 1 : 0);
    }
    return acc;
  }, {} as Record<string, { date: string; present: number }>);

  const attendanceTrend = Object.values(groupedTrend);

  const bySubject: Record<string, any> = {};
  for (const es of examScoresList) {
    if (!es.subject) continue;
    const subj = es.subject.name;
    if (!bySubject[subj]) {
      bySubject[subj] = {};
    }
    const pct =
      (es.marks == null || !es.subject.maxMarks) ? null : (Number(es.marks) / Number(es.subject.maxMarks)) * 100;
    const type = es.exam?.examType;
    if (type === "baseline") {
      bySubject[subj].baseline = pct;
    }
    if (type === "endline") {
      bySubject[subj].endline = pct;
    }
  }
  const examComparison = Object.entries(bySubject).map(([subject, v]) => ({
    subject,
    baseline: v.baseline ?? null,
    endline: v.endline ?? null,
  }));

  // Fetch skill logs for this student
  const skillLogs = await prisma.studentSkillLog.findMany({
    where: { studentId: student.id },
    include: { skill: true },
    orderBy: { assessedOn: 'desc' },
  });

  // Build skill radar from latest skill logs
  const skillRadar: { skill: string; score: number }[] = [];
  const seenSkills = new Set<string>();
  for (const log of skillLogs) {
    const skillName = log.skill?.name || 'Unknown';
    if (!seenSkills.has(skillName)) {
      seenSkills.add(skillName);
      skillRadar.push({ skill: skillName, score: log.level ?? 0 });
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
      avgExamPct,
      skillScore,
    },
    attendanceTrend,
    examComparison,
    skillRadar,
    formSubmissions: student.formSubmissions,
    parents,
    careers: careerEntries.map(sub => ({ id: sub.id, studentId: sub.studentId, createdAt: sub.submittedAt, ...(sub.data as Record<string, unknown>) })),
  };
};

/* ─────────────────────────────────────────
   ATTENDANCE
───────────────────────────────────────── */

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

export const updateAttendance = async (id: string, data: any) => {
  const record = await prisma.attendanceRecord.findUnique({ where: { id } });
  if (!record) {
    throw new NotFoundError("Attendance record");
  }
  return prisma.attendanceRecord.update({ where: { id }, data });
};

/* ─────────────────────────────────────────
   SKILLS
───────────────────────────────────────── */

export const addSkill = async (user: TokenPayload, studentId: string, data: any) => {
  const student = await getStudentById(user, studentId);
  return prisma.studentSkillLog.create({
    data: {
      studentId: student.id,
      centerId: student.centerId,
      skillId: data.skillId,
      level: data.level,
      remarks: data.remarks,
      assessedBy: user.userId,
    },
    include: { skill: true, assessedByUser: { select: { fullName: true } } },
  });
};

export const getSkillsByStudent = async (user: TokenPayload, studentId: string) => {
  const student = await getStudentById(user, studentId);
  return prisma.studentSkillLog.findMany({
    where: { studentId: student.id },
    include: { skill: true, assessedByUser: { select: { fullName: true } } },
    orderBy: { assessedOn: "desc" },
  });
};

export const updateSkill = async (id: string, data: any) => {
  const log = await prisma.studentSkillLog.findUnique({ where: { id } });
  if (!log) throw new NotFoundError("Skill log");
  return prisma.studentSkillLog.update({
    where: { id },
    data: { level: data.level, remarks: data.remarks },
    include: { skill: true, assessedByUser: { select: { fullName: true } } },
  });
};

export const deleteSkill = async (id: string) => {
  const log = await prisma.studentSkillLog.findUnique({ where: { id } });
  if (!log) throw new NotFoundError("Skill log");
  return prisma.studentSkillLog.delete({ where: { id } });
};

/* ─────────────────────────────────────────
   CAREERS (Linked to Forms)
───────────────────────────────────────── */

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
        schema: { fields: [] }
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

export const updateCareer = async (id: string, data: any) => {
  const submission = await prisma.formSubmission.findUnique({ where: { id } });
  if (!submission) throw new NotFoundError("Career record");
  
  const updated = await prisma.formSubmission.update({
    where: { id },
    data: { data }
  });

  return { id: updated.id, studentId: updated.studentId, createdAt: updated.submittedAt, ...(updated.data as Record<string, unknown>) };
};

export const deleteCareer = async (id: string) => {
  const submission = await prisma.formSubmission.findUnique({ where: { id } });
  if (!submission) throw new NotFoundError("Career record");
  return prisma.formSubmission.delete({ where: { id } });
};

/* ─────────────────────────────────────────
   TRANSFER WORKFLOW (FROM VANSH)
───────────────────────────────────────── */

export const requestTransfer = async (user: TokenPayload, studentIds: string[]) => {
  const effectiveUserId = user.userId;

  const result = await prisma.student.updateMany({
    where: {
      id: { in: studentIds },
      isActive: true,
      transferStatus: 'active',
      // Teachers can only request for their own students if we enforce ownership
      ...(user.role === 'teacher' ? { createdById: effectiveUserId } : {}),
    },
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
  newCenterId: string
) => {
  const effectiveUserId = user.userId;

  const students = await prisma.student.findMany({
    where: { id: { in: studentIds }, transferStatus: 'pending_transfer' },
  });

  if (students.length === 0) {
    throw new NotFoundError('No pending transfer students found');
  }

  await prisma.$transaction(async (tx) => {
    for (const s of students) {
      await tx.studentTransfer.create({
        data: {
          studentId: s.id,
          fromCenterId: s.centerId,
          toCenterId: newCenterId,
          transferDate: new Date(),
          reason: 'Transfer via admin workflow',
          approvedBy: effectiveUserId,
        },
      });
    }

    await tx.student.updateMany({
      where: { id: { in: studentIds } },
      data: {
        centerId: newCenterId,
        createdById: newTeacherId,
        transferStatus: 'active',
      },
    });
  });

  return { transferred: students.length };
};

/* ─────────────────────────────────────────
   FEE MANAGEMENT (FROM VANSH)
───────────────────────────────────────── */

export const addFeePayment = async (
  user: TokenPayload,
  studentId: string,
  amount: number,
  notes?: string
) => {
  const effectiveUserId = user.userId;
  const student = await getStudentById(user, studentId);

  const payment = await prisma.feePayment.create({
    data: {
      studentId: student.id,
      amount,
      notes: notes || null,
      createdBy: effectiveUserId,
    },
  });

  const agg = await prisma.feePayment.aggregate({
    where: { studentId: student.id },
    _sum: { amount: true },
  });

  const totalPaid = Number(agg._sum.amount || 0);
  const totalFees = Number(student.totalFees || 0);

  await prisma.student.update({
    where: { id: student.id },
    data: {
      feesPaid: totalPaid,
      isFullyPaid: totalFees > 0 && totalPaid >= totalFees,
    },
  });

  return payment;
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
  const student = await getStudentById(user, studentId);

  const updateData: any = {};
  if (data.totalFees !== undefined) updateData.totalFees = data.totalFees;
  if (data.isFullyPaid !== undefined) updateData.isFullyPaid = data.isFullyPaid;

  return prisma.student.update({
    where: { id: student.id },
    data: updateData,
    include: { center: true, program: true },
  });
};

/* ─────────────────────────────────────────
   DASHBOARD SUMMARY
───────────────────────────────────────── */

export const getDashboardStats = async () => {
  const [totalStudents, totalAttendance, presentCount] = await Promise.all([
    prisma.student.count(),
    prisma.attendanceRecord.count(),
    prisma.attendanceRecord.count({ where: { status: "present" } }),
  ]);

  const attendanceRate = totalAttendance > 0 ? Number(((presentCount / totalAttendance) * 100).toFixed(1)) : 0;

  return {
    totalStudents,
    totalSessions: totalAttendance,
    attendanceRate: `${attendanceRate}%`,
    avgSkills: { communication: 0, confidence: 0, computerSkill: 0, problemSolving: 0, languageSkill: 0 },
  };
};