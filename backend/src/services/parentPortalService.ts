import { ROLES } from "../config/rbac.js";
import { ForbiddenError, NotFoundError } from "../lib/errors.js";
import prisma from "../lib/prisma.js";
import {
  calculateAttendancePercentage,
  countAttendanceStatuses,
} from "../utils/attendanceMetrics.js";
import type { JwtPayload } from "../utils/jwt.js";
import { calculateHolisticCreditSummary } from "./activityService.js";

function assertParentUser(user: JwtPayload): void {
  if (user.role !== ROLES.PARENT) {
    throw new ForbiddenError("Only parent accounts can access the Parent Portal");
  }
}

export async function assertLinkedParent(parentUserId: string, studentId: string): Promise<void> {
  const link = await prisma.parentStudent.findFirst({
    where: {
      parentUserId,
      studentId,
    },
    select: { id: true },
  });

  if (!link) {
    throw new ForbiddenError("You are not authorized to view this student's records");
  }
}

export async function listLinkedChildren(user: JwtPayload) {
  assertParentUser(user);

  const links = await prisma.parentStudent.findMany({
    where: { parentUserId: user.userId },
    include: {
      student: {
        select: {
          id: true,
          fullName: true,
          rollNumber: true,
          dob: true,
          gender: true,
          enrollmentDate: true,
          isActive: true,
          totalFees: true,
          feesPaid: true,
          isFullyPaid: true,
          center: { select: { id: true, name: true, location: true } },
          program: { select: { id: true, name: true, code: true } },
          academicYear: { select: { id: true, label: true } },
        },
      },
    },
    orderBy: { student: { fullName: "asc" } },
  });

  return links
    .map((l) => l.student)
    .filter(Boolean)
    .map((child) => ({
      ...child,
      totalFees: child.totalFees != null ? Number(child.totalFees) : null,
      feesPaid: Number(child.feesPaid || 0),
    }));
}

export async function getLinkedChildProgress(user: JwtPayload, studentId: string) {
  assertParentUser(user);
  await assertLinkedParent(user.userId, studentId);

  const student = await prisma.student.findUnique({
    where: { id: studentId },
    include: {
      center: { select: { id: true, name: true, location: true } },
      program: { select: { id: true, name: true, code: true } },
      academicYear: { select: { id: true, label: true } },
      attendanceRecords: {
        include: {
          session: {
            select: {
              id: true,
              sessionDate: true,
              isHoliday: true,
            },
          },
        },
        orderBy: { session: { sessionDate: "desc" } },
      },
      examScores: {
        include: {
          exam: {
            select: {
              id: true,
              name: true,
              examType: true,
              examDate: true,
              academicYear: { select: { id: true, label: true } },
            },
          },
          subject: {
            select: {
              id: true,
              name: true,
              maxMarks: true,
            },
          },
        },
        orderBy: { enteredAt: "desc" },
      },
      skillLogs: {
        include: {
          skill: {
            select: {
              id: true,
              name: true,
              description: true,
              maxLevel: true,
            },
          },
        },
        orderBy: [{ assessedOn: "desc" }, { createdAt: "desc" }],
      },
      feePayments: {
        select: {
          id: true,
          amount: true,
          notes: true,
          paidAt: true,
        },
        orderBy: { paidAt: "desc" },
      },
      activityEnrollments: {
        include: {
          activity: {
            select: {
              id: true,
              name: true,
              activityType: true,
              status: true,
              startDate: true,
              endDate: true,
              isActive: true,
            },
          },
        },
        orderBy: { createdAt: "desc" },
      },
    },
  });

  if (!student) {
    throw new NotFoundError("Student");
  }

  // Canonical attendance calculation excluding holiday sessions
  const nonHolidayRecords = student.attendanceRecords.filter((r) => !r.session?.isHoliday);
  const attendanceCounts = countAttendanceStatuses(nonHolidayRecords);
  const totalSessions = attendanceCounts.present + attendanceCounts.absent + attendanceCounts.late;
  const attendancePct = calculateAttendancePercentage(attendanceCounts);

  const recentAttendance = nonHolidayRecords.slice(0, 20).map((r) => ({
    sessionId: r.session?.id ?? r.sessionId,
    sessionDate: r.session?.sessionDate ?? null,
    status: r.status,
    remarks: r.remarks ?? null,
  }));

  // Academic exam scores & Baseline/Midline/Endline comparison by subject
  const comparisonMap = new Map<
    string,
    { subject: string; baseline: number | null; midline: number | null; endline: number | null }
  >();
  let scorePctSum = 0;
  let scorePctCount = 0;

  const examHistory = student.examScores.map((row) => {
    const maxMarks = Math.max(1, Number(row.subject?.maxMarks || 100));
    const marksNumeric = row.isAbsent || row.marks === null ? null : Number(row.marks);
    const percentage =
      marksNumeric === null ? null : Math.round((marksNumeric / maxMarks) * 100);

    if (percentage !== null) {
      scorePctSum += percentage;
      scorePctCount += 1;
    }

    const subjectName = row.subject?.name || "Subject";
    const termKey = String(row.exam?.examType || "").toLowerCase();
    if (percentage !== null && (termKey === "baseline" || termKey === "midline" || termKey === "endline")) {
      const current = comparisonMap.get(subjectName) ?? {
        subject: subjectName,
        baseline: null,
        midline: null,
        endline: null,
      };
      current[termKey] = percentage;
      comparisonMap.set(subjectName, current);
    }

    return {
      id: row.id,
      examId: row.exam?.id ?? row.examId,
      examName: row.exam?.name ?? "Assessment",
      examType: row.exam?.examType ?? "general",
      examDate: row.exam?.examDate ?? null,
      academicYearLabel: row.exam?.academicYear?.label ?? null,
      subjectName,
      marks: marksNumeric,
      maxMarks,
      isAbsent: row.isAbsent,
      percentage,
      remarks: row.remarks ?? null,
    };
  });

  const examAveragePct = scorePctCount > 0 ? Math.round(scorePctSum / scorePctCount) : null;

  // Latest skills per skill definition + history
  const latestSkillMap = new Map<
    string,
    {
      skillId: string;
      name: string;
      description: string | null;
      level: number;
      maxLevel: number;
      assessedOn: Date;
    }
  >();

  const skillLogs = student.skillLogs.map((log) => {
    const skillId = log.skill?.id ?? log.skillId;
    const maxLevel = Number(log.skill?.maxLevel || 5);
    const entry = {
      id: log.id,
      skillId,
      skillName: log.skill?.name ?? "Skill",
      description: log.skill?.description ?? null,
      level: Number(log.level),
      maxLevel,
      assessedOn: log.assessedOn,
      remarks: log.remarks ?? null,
    };

    if (!latestSkillMap.has(skillId)) {
      latestSkillMap.set(skillId, {
        skillId,
        name: entry.skillName,
        description: entry.description,
        level: entry.level,
        maxLevel: entry.maxLevel,
        assessedOn: log.assessedOn,
      });
    }
    return entry;
  });

  // Fee ledger
  const totalFees = student.totalFees != null ? Number(student.totalFees) : null;
  const feesPaid = Number(student.feesPaid || 0);
  const balanceDue = totalFees != null ? Math.max(0, totalFees - feesPaid) : null;

  // Co-curricular activities & holistic credits
  const activeEnrollments = student.activityEnrollments.filter(
    (e) => e.activity?.isActive !== false,
  );
  const activitySummary = calculateHolisticCreditSummary(activeEnrollments);

  return {
    student: {
      id: student.id,
      fullName: student.fullName,
      rollNumber: student.rollNumber,
      dob: student.dob,
      gender: student.gender,
      enrollmentDate: student.enrollmentDate,
      isActive: student.isActive,
      stream: student.stream,
      center: student.center,
      program: student.program,
      academicYear: student.academicYear,
    },
    attendance: {
      percentage: attendancePct,
      presentCount: attendanceCounts.present,
      lateCount: attendanceCounts.late,
      absentCount: attendanceCounts.absent,
      totalSessions,
      recentRecords: recentAttendance,
    },
    academics: {
      averagePct: examAveragePct,
      comparison: Array.from(comparisonMap.values()),
      scores: examHistory,
    },
    skills: {
      latest: Array.from(latestSkillMap.values()),
      logs: skillLogs.slice(0, 30),
    },
    fees: {
      totalFees,
      feesPaid,
      balanceDue,
      isFullyPaid: student.isFullyPaid,
      payments: student.feePayments.map((p) => ({
        id: p.id,
        amount: Number(p.amount),
        notes: p.notes ?? null,
        paidAt: p.paidAt,
      })),
    },
    activities: {
      summary: activitySummary,
      enrollments: activeEnrollments.map((e) => ({
        id: e.id,
        status: e.status,
        createdAt: e.createdAt,
        activity: e.activity,
      })),
    },
  };
}
