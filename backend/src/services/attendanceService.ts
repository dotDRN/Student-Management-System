import { AttendanceStatus } from "@prisma/client";
import type { JwtPayload } from '../lib/auth.js';
import { ForbiddenError, NotFoundError, ValidationError, AppError } from '../lib/errors.js';
import prisma from '../lib/prisma.js';

type SessionCreateInput = {
  centerId: string;
  programId: string;
  sessionDate: string;
  activityId?: string;
};

type RecordUpdateInput = {
  recordId: string;
  status: "pending" | "present" | "absent" | "late" | "excused";
  remarks?: string;
};

function ensureCenterAccess(user: JwtPayload, centerId: string): void {
  if (user.role !== "super_admin" && !user.centerIds.includes(centerId)) {
    throw new ForbiddenError("No access to the requested center");
  }
}

function applyCenterScopeToWhere(user: JwtPayload, where: Record<string, unknown>, centerId?: string) {
  if (user.role === "super_admin") {
    if (centerId) {
      where.centerId = centerId;
    }
    return;
  }

  if (centerId) {
    where.centerId = user.centerIds.includes(centerId) ? centerId : { in: [] };
    return;
  }

  where.centerId = { in: user.centerIds };
}

function parseDate(value: string | undefined, fieldName: string): Date | undefined {
  if (!value) {
    return undefined;
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new ValidationError(`${fieldName} must be a valid date`);
  }

  return date;
}

function getCompletionPercentage(records: Array<{ status: AttendanceStatus | null }>): number {
  if (records.length === 0) {
    return 0;
  }
  const completed = records.filter((record) => record.status !== null).length;
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

  const created = await prisma.$transaction(async (tx) => {
    const session = await tx.attendanceSession.create({
      data: {
        centerId: input.centerId,
        programId: input.programId,
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

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // 1. Find or Create the session
  let session = await prisma.attendanceSession.findFirst({
    where: { centerId, programId, sessionDate: today },
  });

  if (!session) {
    await createSession(user, {
      centerId,
      programId,
      sessionDate: today.toISOString(),
    });
  }

  // 2. Sync missing students (Crucial for students added later in the day)
  // Fetch all active students for this center/program
  const activeStudents = await prisma.student.findMany({
    where: { centerId, programId, isActive: true },
    select: { id: true }
  });

  // Fetch students already in today's session
  const existingRecords = await prisma.attendanceRecord.findMany({
    where: { sessionId: session?.id || (await prisma.attendanceSession.findFirst({ where: { centerId, programId, sessionDate: today } }))?.id },
    select: { studentId: true }
  });

  const existingStudentIds = new Set(existingRecords.map(r => r.studentId));
  const missingStudents = activeStudents.filter(s => !existingStudentIds.has(s.id));

  // 3. Create records for missing students
  if (missingStudents.length > 0 && session) {
    await prisma.attendanceRecord.createMany({
      data: missingStudents.map(s => ({
        sessionId: session!.id,
        studentId: s.id,
        centerId: centerId,
        status: "pending" as AttendanceStatus
      }))
    });
  }

  // 4. Return the fully updated session with all students
  return prisma.attendanceSession.findFirst({
    where: { centerId, programId, sessionDate: today },
    include: {
      records: {
        include: {
          student: { select: { id: true, fullName: true, rollNumber: true } }
        }
      }
    }
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
      some: { status: null as unknown as AttendanceStatus },
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
      incompleteCount: session.records.filter((record) => record.status === null).length,
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
    session: {
      id: session.id,
      centerId: session.centerId,
      programId: session.programId,
      sessionDate: session.sessionDate,
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
  const student = await prisma.student.findFirst({
    where: ({
      id: studentId,
      ...(user.role === "super_admin" ? {} : { centerId: { in: user.centerIds } }),
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
      ...(user.role === "super_admin" ? {} : { centerId: { in: user.centerIds } }),
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

  const presentCount = records.filter((record) => record.status === "present").length;
  const absentCount = records.filter((record) => record.status === "absent").length;
  const lateCount = records.filter((record) => record.status === "late").length;
  const markedCount = presentCount + absentCount + lateCount;
  const attendanceRate = markedCount === 0 ? 0 : Number(((presentCount / markedCount) * 100).toFixed(2));

  return { records, attendanceRate, presentCount, absentCount, lateCount };
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
    const present = session.records.filter((record) => record.status === "present").length;
    const absent = session.records.filter((record) => record.status === "absent").length;
    const late = session.records.filter((record) => record.status === "late").length;
    const marked = present + absent + late;
    const rate = marked === 0 ? 0 : Number(((present / marked) * 100).toFixed(2));

    return {
      sessionId: session.id,
      sessionDate: session.sessionDate,
      center: session.center,
      program: session.program,
      present,
      absent,
      late,
      total: session.records.length,
      attendanceRate: rate,
    };
  });

  const totals = sessionStats.reduce(
    (acc, item) => {
      acc.present += item.present;
      acc.absent += item.absent;
      acc.late += item.late;
      acc.total += item.total;
      return acc;
    },
    { present: 0, absent: 0, late: 0, total: 0 },
  );

  const markedTotal = totals.present + totals.absent + totals.late;
  const overallAttendanceRate =
    markedTotal === 0 ? 0 : Number(((totals.present / markedTotal) * 100).toFixed(2));

  return {
    sessions: sessionStats,
    totals,
    overallAttendanceRate,
  };
}

export async function getPendingSessions(userId: string): Promise<Array<Record<string, unknown>>> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      role: true,
      centerAssignments: {
        select: { centerId: true },
      },
    },
  });

  if (!user) {
    throw new NotFoundError("User");
  }

  const centerIds = user.centerAssignments.map((assignment) => assignment.centerId);

  const sessions = await prisma.attendanceSession.findMany({
    where: {
      ...(user.role === "super_admin" ? {} : { centerId: { in: centerIds } }),
      records: {
        some: {
          status: null as unknown as AttendanceStatus,
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
      incompleteCount: session.records.filter((record) => record.status === null).length,
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
  days: number = 7
) {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  cutoff.setHours(0, 0, 0, 0);

  const centerIds = user.role === "super_admin" ? undefined : user.centerIds;

  const records = await prisma.attendanceRecord.findMany({
    where: {
      status: "absent",
      session: {
        sessionDate: { gte: cutoff },
        ...(centerIds ? { centerId: { in: centerIds } } : {})
      }
    },
    include: {
      student: { select: { id: true, fullName: true, rollNumber: true, guardianPhone: true } },
      session: { select: { sessionDate: true, center: { select: { name: true } }, program: { select: { name: true } } } }
    },
    orderBy: {
      session: { sessionDate: 'desc' }
    }
  });

  return records;
}
