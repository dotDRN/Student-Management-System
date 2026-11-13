import { AttendanceStatus } from "@prisma/client";
import type { JwtPayload } from '../utils/jwt.js';
import { NotFoundError, ValidationError, AppError } from '../lib/errors.js';
import prisma from '../lib/prisma.js';
import { getScopedCenterIds } from "../config/rbac.js";
import { assertCenterAccess } from "../lib/centerScope.js";
import { resolveAcademicYearId } from "../utils/academicYear.js";
import { calculateAttendancePercentage, countAttendanceStatuses } from "../utils/attendanceMetrics.js";
import { formatUtcDateOnly, getTodayUtcDateOnly, parseOptionalUtcDateOnly } from "../utils/dateOnly.js";

const VALID_ATTENDANCE_STATUSES = new Set(["pending", "present", "absent", "late", "excused"]);

type SessionCreateInput = {
  centerId: string;
  programId: string;
  sessionDate: string;
  activityId?: string;
  academicYearId?: string;
};

type RecordUpdateInput = {
  recordId: string;
  status: "pending" | "present" | "absent" | "late" | "excused";
  remarks?: string;
};

function ensureCenterAccess(user: JwtPayload, centerId: string): void {
  assertCenterAccess(user, centerId, "No access to the requested center");
}

function applyCenterScopeToWhere(user: JwtPayload, where: Record<string, unknown>, centerId?: string) {
  const scopedCenterIds = getScopedCenterIds(user);
  if (scopedCenterIds === undefined) {
    if (centerId) {
      where.centerId = centerId;
    }
    return;
  }

  if (centerId) {
    where.centerId = scopedCenterIds.includes(centerId) ? centerId : { in: [] };
    return;
  }

  where.centerId = { in: scopedCenterIds };
}

function parseDate(value: string | undefined, fieldName: string): Date | undefined {
  return parseOptionalUtcDateOnly(value, fieldName) ?? undefined;
}

function getCompletionPercentage(records: Array<{ status: AttendanceStatus | string | null }>): number {
  if (records.length === 0) {
    return 0;
  }
  const completed = records.filter((record) => record.status !== null && record.status !== "pending").length;
  return Number(((completed / records.length) * 100).toFixed(2));
}

export async function createSession(
  user: JwtPayload,
  input: SessionCreateInput,
): Promise<{
  created: boolean;
  session: unknown;
  studentsWithPendingRecords?: Array<{ student: unknown; recordId: string }>;
}> {
  const sessionDate = parseDate(input.sessionDate, "sessionDate");
  if (!sessionDate) {
    throw new ValidationError("sessionDate is required");
  }
  ensureCenterAccess(user, input.centerId);

  const existing = await prisma.attendanceSession.findFirst({
    where: {
      centerId: input.centerId,
      programId: input.programId,
      sessionDate,
    },
    include: {
      center: true,
      program: true,
      activity: true,
    },
  });

  if (existing) {
    return { created: false, session: existing };
  }

  const academicYearId = await resolveAcademicYearId(input.academicYearId, {
    fallbackToCurrent: true,
    strict: Boolean(input.academicYearId),
  });

  const created = await prisma.$transaction(async (tx) => {
    const session = await tx.attendanceSession.create({
      data: {
        centerId: input.centerId,
        programId: input.programId,
        academicYearId,
        sessionDate,
        activityId: input.activityId ?? null,
        createdBy: user.userId,
      },
      include: {
        center: true,
        program: true,
        activity: true,
      },
    });

    const students = await tx.student.findMany({
      where: {
        centerId: input.centerId,
        programId: input.programId,
        isActive: true,
      },
      select: {
        id: true,
        fullName: true,
        centerId: true,
        programId: true,
      },
    });

    if (students.length > 0) {
      await tx.attendanceRecord.createMany({
        data: students.map((student) => ({
          sessionId: session.id,
          studentId: student.id,
          centerId: student.centerId,
          status: "pending" as AttendanceStatus,
        })),
      });

      console.log("Creating records for students:", students.length);
    }

    const pendingRecords = await tx.attendanceRecord.findMany({
      where: { sessionId: session.id },
      select: { id: true, studentId: true },
    });

    const recordIdByStudentId = new Map(
      pendingRecords.map((record) => [record.studentId, record.id]),
    );

    return {
      session,
      studentsWithPendingRecords: students.map((student) => ({
        student,
        recordId: recordIdByStudentId.get(student.id) ?? "",
      })),
    };
  });

  return { created: true, ...created };
}

export async function getTodayFreshSheet(user: JwtPayload, centerId: string, programId: string) {
  ensureCenterAccess(user, centerId);

  const today = getTodayUtcDateOnly();
  const todayStr = today.toISOString().slice(0, 10);

  // 1. Find or create the session
  let session = await prisma.attendanceSession.findFirst({
    where: { centerId, programId, sessionDate: today },
  });

  if (!session) {
    const created = await createSession(user, {
      centerId,
      programId,
      sessionDate: todayStr,
    });
    session = created.session as typeof session;
  }

  if (!session) {
    throw new NotFoundError("Attendance session");
  }

  // 2. Sync missing active students added after initial session creation
  const activeStudents = await prisma.student.findMany({
    where: { centerId, programId, isActive: true },
    select: { id: true },
  });

  const existingRecords = await prisma.attendanceRecord.findMany({
    where: { sessionId: session.id },
    select: { studentId: true },
  });

  const existingStudentIds = new Set(existingRecords.map((r) => r.studentId));
  const missingStudents = activeStudents.filter((s) => !existingStudentIds.has(s.id));

  // 3. Create pending records for newly added students
  if (missingStudents.length > 0) {
    await prisma.attendanceRecord.createMany({
      data: missingStudents.map((s) => ({
        sessionId: session!.id,
        studentId: s.id,
        centerId,
        status: "pending" as AttendanceStatus,
      })),
    });
  }

  // 4. Return the updated session with students sorted consistently
  return prisma.attendanceSession.findFirst({
    where: { id: session.id },
    include: {
      center: true,
      program: true,
      records: {
        include: {
          student: { select: { id: true, fullName: true, rollNumber: true } },
        },
        orderBy: { student: { fullName: "asc" } },
      },
    },
  });
}

export async function markHoliday(user: JwtPayload, sessionId: string, isHoliday: boolean) {
  const session = await prisma.attendanceSession.findUnique({ where: { id: sessionId } });
  if (!session) throw new NotFoundError("Session not found");
  ensureCenterAccess(user, session.centerId);

  return prisma.attendanceSession.update({
    where: { id: sessionId },
    data: { isHoliday }
  });
}

export async function listSessions(
  user: JwtPayload,
  query: {
    centerId?: string;
    programId?: string;
    from?: string;
    to?: string;
    hasIncomplete?: boolean;
  },
): Promise<{ sessions: Array<Record<string, unknown>> }> {
  const from = parseDate(query.from, "from");
  const to = parseDate(query.to, "to");
  const where: Record<string, unknown> = {};
  applyCenterScopeToWhere(user, where, query.centerId);
  if (query.programId) {
    where.programId = query.programId;
  }
  if (from || to) {
    where.sessionDate = {
      ...(from ? { gte: from } : {}),
      ...(to ? { lte: to } : {}),
    };
  }
  if (query.hasIncomplete) {
    where.records = {
      some: { status: "pending" as AttendanceStatus },
    };
  }

  const sessions = await prisma.attendanceSession.findMany({
    where: where as never,
    include: {
      center: true,
      program: true,
      activity: true,
      records: {
        select: { status: true },
      },
    },
    orderBy: {
      sessionDate: "desc",
    },
  });

  return {
    sessions: sessions.map((session) => ({
      ...session,
      incompleteCount: session.records.filter((record) => record.status === "pending").length,
    })),
  };
}

export async function getSessionRecords(
  user: JwtPayload,
  sessionId: string,
): Promise<{ records: Array<Record<string, unknown>> }> {
  const full = await getSessionById(user, sessionId);
  return { records: (full.records as Array<Record<string, unknown>>) ?? [] };
}

export async function getSessionById(
  user: JwtPayload,
  sessionId: string,
): Promise<Record<string, unknown>> {
  const session = await prisma.attendanceSession.findUnique({
    where: { id: sessionId },
    include: {
      center: true,
      program: true,
      activity: true,
      records: {
        include: {
          student: true,
        },
      },
    },
  });

  if (!session) {
    throw new NotFoundError("Attendance session");
  }

  ensureCenterAccess(user, session.centerId);

  return {
    isHoliday: session.isHoliday,
    session: {
      id: session.id,
      centerId: session.centerId,
      programId: session.programId,
      sessionDate: session.sessionDate,
      isHoliday: session.isHoliday,
      activity: session.activity,
      center: session.center,
      program: session.program,
    },
    records: session.records.map((record) => ({
      student: record.student,
      record: {
        id: record.id,
        status: record.status,
        remarks: record.remarks,
      },
    })),
  };
}

export async function bulkUpdateSessionRecords(
  user: JwtPayload,
  sessionId: string,
  records: RecordUpdateInput[],
): Promise<Record<string, unknown>> {
  if (!Array.isArray(records) || records.length === 0) {
    throw new ValidationError("records array is required");
  }

  const invalidStatus = records.find((r) => !VALID_ATTENDANCE_STATUSES.has(String(r.status)));
  if (invalidStatus) {
    throw new ValidationError(`Invalid attendance status: ${String(invalidStatus.status)}`);
  }

  const session = await prisma.attendanceSession.findUnique({
    where: { id: sessionId },
    include: {
      records: true,
    },
  });

  if (!session) {
    throw new NotFoundError("Attendance session");
  }
  ensureCenterAccess(user, session.centerId);

  const recordIdsForSession = new Set(session.records.map((record) => record.id));
  const invalidRecordId = records.find((record) => !recordIdsForSession.has(record.recordId));
  if (invalidRecordId) {
    throw new ValidationError("All recordIds must belong to the provided sessionId");
  }

  await prisma.$transaction(
    records.map((record) =>
      prisma.attendanceRecord.update({
        where: { id: record.recordId },
        data: {
          status: record.status as AttendanceStatus,
          remarks: record.remarks ?? null,
        },
      }),
    ),
  );

  const updatedSession = await prisma.attendanceSession.findUnique({
    where: { id: sessionId },
    include: {
      records: true,
      center: true,
      program: true,
      activity: true,
    },
  });

  if (!updatedSession) {
    throw new NotFoundError("Attendance session");
  }

  return {
    session: updatedSession,
    completionPercentage: getCompletionPercentage(updatedSession.records),
  };
}

export async function getStudentAttendanceHistory(
  user: JwtPayload,
  studentId: string,
  query: { from?: string; to?: string; programId?: string },
): Promise<Record<string, unknown>> {
  const scopedCenterIds = getScopedCenterIds(user);
  const student = await prisma.student.findFirst({
    where: ({
      id: studentId,
      ...(scopedCenterIds !== undefined ? { centerId: { in: scopedCenterIds } } : {}),
    } as never),
    select: {
      id: true,
      centerId: true,
    },
  });

  if (!student) {
    throw new NotFoundError("Student");
  }

  const from = parseDate(query.from, "from");
  const to = parseDate(query.to, "to");

  const records = await prisma.attendanceRecord.findMany({
    where: ({
      studentId,
      ...(scopedCenterIds !== undefined ? { centerId: { in: scopedCenterIds } } : {}),
      session: {
        ...(query.programId ? { programId: query.programId } : {}),
        ...((from || to)
          ? {
            sessionDate: {
              ...(from ? { gte: from } : {}),
              ...(to ? { lte: to } : {}),
            },
          }
          : {}),
      },
    } as never),
    include: {
      session: true,
      student: true,
    },
    orderBy: {
      session: {
        sessionDate: "desc",
      },
    },
  });

  const nonHolidayRecords = records.filter((record) => !record.session?.isHoliday);
  const counts = countAttendanceStatuses(nonHolidayRecords);
  const attendanceRate = calculateAttendancePercentage(counts);

  return {
    records,
    attendanceRate,
    presentCount: counts.present,
    absentCount: counts.absent,
    lateCount: counts.late,
    excusedCount: counts.excused,
    pendingCount: counts.pending,
  };
}

export async function getAttendanceSummary(
  user: JwtPayload,
  query: { centerId?: string; programId?: string; from?: string; to?: string },
): Promise<Record<string, unknown>> {
  const from = parseDate(query.from, "from");
  const to = parseDate(query.to, "to");
  const where: Record<string, unknown> = {};
  applyCenterScopeToWhere(user, where, query.centerId);
  if (query.programId) {
    where.programId = query.programId;
  }
  if (from || to) {
    where.sessionDate = {
      ...(from ? { gte: from } : {}),
      ...(to ? { lte: to } : {}),
    };
  }

  const sessions = await prisma.attendanceSession.findMany({
    where: where as never,
    include: {
      records: true,
      center: true,
      program: true,
    },
    orderBy: {
      sessionDate: "desc",
    },
  });

  const sessionStats = sessions.map((session) => {
    const counts = countAttendanceStatuses(session.records);
    const rate = session.isHoliday ? 0 : calculateAttendancePercentage(counts);

    return {
      sessionId: session.id,
      sessionDate: session.sessionDate,
      isHoliday: session.isHoliday,
      center: session.center,
      program: session.program,
      present: counts.present,
      absent: counts.absent,
      late: counts.late,
      excused: counts.excused,
      pending: counts.pending,
      total: session.records.length,
      attendanceRate: rate,
    };
  });

  const totals = sessionStats.reduce(
    (acc, item) => {
      if (item.isHoliday) return acc;
      acc.present += item.present;
      acc.absent += item.absent;
      acc.late += item.late;
      acc.total += item.total;
      return acc;
    },
    { present: 0, absent: 0, late: 0, total: 0 },
  );

  const overallAttendanceRate = calculateAttendancePercentage(totals);

  return {
    sessions: sessionStats,
    totals,
    overallAttendanceRate,
  };
}

export async function getPendingSessions(user: JwtPayload): Promise<Array<Record<string, unknown>>> {
  const scopedCenterIds = getScopedCenterIds(user);

  const sessions = await prisma.attendanceSession.findMany({
    where: {
      isHoliday: false,
      ...(scopedCenterIds !== undefined ? { centerId: { in: scopedCenterIds } } : {}),
      records: {
        some: {
          status: "pending" as AttendanceStatus,
        },
      },
    },
    include: {
      center: true,
      program: true,
      records: {
        select: { status: true },
      },
    },
    orderBy: {
      sessionDate: "desc",
    },
  });

  return sessions
    .map((session) => ({
      ...session,
      incompleteCount: session.records.filter((record) => record.status === "pending").length,
    }))
    .filter((session) => session.incompleteCount > 0);
}

export function parseHasIncomplete(value: unknown): boolean {
  if (value === undefined) {
    return false;
  }
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value === "string") {
    return value.toLowerCase() === "true";
  }
  throw new AppError("hasIncomplete must be a boolean", 422);
}

export async function getRecentAbsentees(
  user: JwtPayload,
  days: number = 7,
  requestedCenterId?: string,
) {
  const safeDays = Math.min(Math.max(Number.isFinite(days) ? days : 7, 1), 90);
  const cutoff = getTodayUtcDateOnly();
  cutoff.setUTCDate(cutoff.getUTCDate() - safeDays);

  const sessionWhere: Record<string, unknown> = {
    isHoliday: false,
    sessionDate: { gte: cutoff },
  };
  applyCenterScopeToWhere(user, sessionWhere, requestedCenterId);

  const absentees = await prisma.attendanceRecord.findMany({
    where: {
      status: "absent",
      session: sessionWhere as never,
    },
    include: {
      student: { select: { id: true, fullName: true, rollNumber: true, guardianPhone: true } },
      session: {
        select: {
          id: true,
          sessionDate: true,
          center: { select: { name: true } },
          program: { select: { name: true } },
        },
      },
    },
    orderBy: {
      session: { sessionDate: "desc" },
    },
  });

  if (absentees.length === 0) {
    return [];
  }

  const studentIds = Array.from(new Set(absentees.map((r) => r.studentId)));
  const streakWindowRecords = await prisma.attendanceRecord.findMany({
    where: {
      studentId: { in: studentIds },
      status: { in: ["present", "absent", "late"] },
      session: { isHoliday: false },
    },
    select: {
      studentId: true,
      status: true,
      session: { select: { sessionDate: true } },
    },
    orderBy: { session: { sessionDate: "desc" } },
  });

  const recordsByStudent = new Map<string, Array<{ status: string; time: number }>>();
  for (const row of streakWindowRecords) {
    const list = recordsByStudent.get(row.studentId) ?? [];
    list.push({
      status: String(row.status),
      time: row.session?.sessionDate ? new Date(row.session.sessionDate).getTime() : 0,
    });
    recordsByStudent.set(row.studentId, list);
  }

  const streakByStudent = new Map<string, number>();
  for (const [sid, list] of recordsByStudent.entries()) {
    list.sort((a, b) => b.time - a.time);
    let streak = 0;
    for (const item of list) {
      if (item.status === "absent") {
        streak += 1;
      } else {
        break;
      }
    }
    streakByStudent.set(sid, streak);
  }

  return absentees.map((record) => ({
    ...record,
    consecutiveAbsenceStreak: streakByStudent.get(record.studentId) ?? 1,
  }));
}

const REGISTER_STATUS_PRIORITY: Record<string, number> = {
  present: 5,
  late: 4,
  absent: 3,
  excused: 2,
  pending: 1,
};

export async function getAttendanceRegister(
  user: JwtPayload,
  query: {
    centerId?: string;
    programId?: string;
    month?: string;
  },
) {
  if (!query.centerId) {
    throw new ValidationError("centerId is required");
  }
  ensureCenterAccess(user, query.centerId);

  const monthStr = query.month?.trim() || formatUtcDateOnly(getTodayUtcDateOnly()).slice(0, 7);
  const monthMatch = /^(\d{4})-(\d{2})$/.exec(monthStr);
  if (!monthMatch) {
    throw new ValidationError("month must be in YYYY-MM format");
  }
  const year = Number(monthMatch[1]);
  const monthNum = Number(monthMatch[2]);
  if (monthNum < 1 || monthNum > 12) {
    throw new ValidationError("month must be between 01 and 12");
  }

  const daysInMonth = new Date(Date.UTC(year, monthNum, 0)).getUTCDate();
  const monthStart = new Date(Date.UTC(year, monthNum - 1, 1));
  const monthEnd = new Date(Date.UTC(year, monthNum - 1, daysInMonth));
  const days = Array.from({ length: daysInMonth }, (_, idx) =>
    `${monthStr}-${String(idx + 1).padStart(2, "0")}`,
  );

  const [activeStudents, sessions] = await Promise.all([
    prisma.student.findMany({
      where: {
        centerId: query.centerId,
        isActive: true,
        ...(query.programId ? { programId: query.programId } : {}),
      },
      select: { id: true, fullName: true, rollNumber: true },
      orderBy: { fullName: "asc" },
    }),
    prisma.attendanceSession.findMany({
      where: {
        centerId: query.centerId,
        ...(query.programId ? { programId: query.programId } : {}),
        sessionDate: { gte: monthStart, lte: monthEnd },
      },
      include: {
        records: {
          select: {
            studentId: true,
            status: true,
            remarks: true,
            student: { select: { id: true, fullName: true, rollNumber: true } },
          },
        },
      },
      orderBy: { sessionDate: "asc" },
    }),
  ]);

  const studentMeta = new Map<string, { id: string; fullName: string; rollNumber: string | null }>();
  for (const s of activeStudents) {
    studentMeta.set(s.id, { id: s.id, fullName: s.fullName, rollNumber: s.rollNumber ?? null });
  }

  const holidayDateSet = new Set<string>();
  const sessionDateSet = new Set<string>();
  const perStudentDateMap = new Map<
    string,
    Map<string, { status: string; remarks: string | null; isHoliday: boolean }>
  >();

  for (const session of sessions) {
    const dateKey = formatUtcDateOnly(new Date(session.sessionDate));
    sessionDateSet.add(dateKey);
    const isHolidaySession = Boolean(session.isHoliday);
    if (isHolidaySession) {
      holidayDateSet.add(dateKey);
    }

    for (const rec of session.records ?? []) {
      if (!studentMeta.has(rec.studentId) && rec.student) {
        studentMeta.set(rec.studentId, {
          id: rec.student.id,
          fullName: rec.student.fullName,
          rollNumber: rec.student.rollNumber ?? null,
        });
      }
      const dateEntries = perStudentDateMap.get(rec.studentId) ?? new Map();
      const existing = dateEntries.get(dateKey);
      const nextStatus = String(rec.status ?? "pending");
      if (
        !existing ||
        (REGISTER_STATUS_PRIORITY[nextStatus] ?? 0) >= (REGISTER_STATUS_PRIORITY[existing.status] ?? 0)
      ) {
        dateEntries.set(dateKey, {
          status: nextStatus,
          remarks: rec.remarks ?? existing?.remarks ?? null,
          isHoliday: isHolidaySession,
        });
      }
      perStudentDateMap.set(rec.studentId, dateEntries);
    }
  }

  const sortedStudents = Array.from(studentMeta.values()).sort((a, b) =>
    a.fullName.localeCompare(b.fullName),
  );

  const students = sortedStudents.map((stu) => {
    const dateEntries = perStudentDateMap.get(stu.id) ?? new Map();
    const statuses: Record<string, string> = {};
    const remarksByDate: Record<string, string | null> = {};
    const nonHolidayRecords: Array<{ status: string }> = [];
    let excusedCount = 0;
    let pendingCount = 0;

    for (const [dKey, entry] of dateEntries.entries()) {
      statuses[dKey] = entry.isHoliday ? "holiday" : entry.status;
      if (entry.remarks) {
        remarksByDate[dKey] = entry.remarks;
      }
      if (!entry.isHoliday) {
        nonHolidayRecords.push({ status: entry.status });
        if (entry.status === "excused") excusedCount += 1;
        if (entry.status === "pending") pendingCount += 1;
      }
    }

    const counts = countAttendanceStatuses(nonHolidayRecords);
    const attendanceRate = calculateAttendancePercentage(counts);
    return {
      studentId: stu.id,
      fullName: stu.fullName,
      rollNumber: stu.rollNumber,
      statuses,
      remarksByDate,
      summary: {
        present: counts.present,
        late: counts.late,
        absent: counts.absent,
        excused: excusedCount,
        pending: pendingCount,
        totalMarked: counts.present + counts.late + counts.absent,
        attendanceRate,
      },
    };
  });

  return {
    centerId: query.centerId,
    programId: query.programId ?? null,
    month: monthStr,
    days,
    holidayDates: Array.from(holidayDateSet).sort(),
    sessionDates: Array.from(sessionDateSet).sort(),
    students,
  };
}
