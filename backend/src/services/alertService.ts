import { Prisma } from "@prisma/client";
import {
  getScopedCenterIds,
  isAdminRole,
  isGlobalAdmin,
} from "../config/rbac.js";
import { assertCenterAccess } from "../lib/centerScope.js";
import { ForbiddenError, NotFoundError } from "../lib/errors.js";
import prisma from "../lib/prisma.js";
import {
  calculateAttendancePercentage,
  countAttendanceStatuses,
} from "../utils/attendanceMetrics.js";
import { getTodayUtcDateOnly } from "../utils/dateOnly.js";
import type { JwtPayload } from "../utils/jwt.js";

export type AlertMetric =
  | "consecutive_absences"
  | "attendance_30d_pct"
  | "exam_score_drop_pct"
  | "fee_overdue_balance";

export type AlertCondition = "lt" | "lte" | "gt" | "gte" | "eq";

export type CreateAlertRuleInput = {
  centerId?: string | null;
  programId?: string | null;
  metric: AlertMetric;
  condition: AlertCondition;
  threshold: number;
  description?: string | null;
  notifyRoles?: string[];
  isActive?: boolean;
};

export type UpdateAlertRuleInput = Partial<CreateAlertRuleInput>;

export function matchesCondition(value: number, condition: string, threshold: number): boolean {
  switch (condition) {
    case "lt":
      return value < threshold;
    case "lte":
      return value <= threshold;
    case "gt":
      return value > threshold;
    case "gte":
      return value >= threshold;
    case "eq":
      return value === threshold;
    default:
      return false;
  }
}

function formatMetricMessage(
  studentName: string,
  metric: string,
  value: number,
  threshold: number,
): string {
  switch (metric) {
    case "consecutive_absences":
      return `${studentName} has ${value} consecutive absence(s) (threshold: ${threshold}).`;
    case "attendance_30d_pct":
      return `${studentName}'s 30-day attendance dropped to ${value}% (threshold: ${threshold}%).`;
    case "exam_score_drop_pct":
      return `${studentName}'s exam average dropped by ${value}% between assessments (threshold: ${threshold}%).`;
    case "fee_overdue_balance":
      return `${studentName} has an outstanding fee balance of ₹${value.toLocaleString()} (threshold: ₹${threshold.toLocaleString()}).`;
    default:
      return `${studentName} triggered rule '${metric}' with value ${value} (threshold: ${threshold}).`;
  }
}

export async function listAlertRules(user: JwtPayload, params?: { centerId?: string; activeOnly?: boolean }) {
  const where: Prisma.AlertRuleWhereInput = {};
  if (params?.activeOnly) {
    where.isActive = true;
  }

  if (params?.centerId) {
    assertCenterAccess(user, params.centerId, "No access to this center");
    where.OR = [{ centerId: params.centerId }, { centerId: null }];
  } else {
    const scopedCenterIds = getScopedCenterIds(user);
    if (scopedCenterIds !== undefined) {
      where.OR = [{ centerId: { in: scopedCenterIds } }, { centerId: null }];
    }
  }

  return prisma.alertRule.findMany({
    where,
    include: {
      center: { select: { id: true, name: true } },
      program: { select: { id: true, name: true } },
      createdByUser: { select: { id: true, fullName: true } },
      _count: { select: { alerts: true } },
    },
    orderBy: [{ createdAt: "desc" }],
  });
}

export async function createAlertRule(user: JwtPayload, input: CreateAlertRuleInput) {
  if (!isAdminRole(user.role)) {
    throw new ForbiddenError("Only admins can create alert rules");
  }
  if (input.centerId) {
    assertCenterAccess(user, input.centerId, "No access to create alert rule for this center");
    const center = await prisma.center.findFirst({
      where: { id: input.centerId, isActive: true },
      select: { id: true },
    });
    if (!center) throw new NotFoundError("Center");
  } else if (!isGlobalAdmin(user.role)) {
    throw new ForbiddenError("Center admins must scope alert rules to an assigned center");
  }

  if (input.programId) {
    const program = await prisma.program.findFirst({
      where: { id: input.programId, isActive: true },
      select: { id: true },
    });
    if (!program) throw new NotFoundError("Program");
  }

  return prisma.alertRule.create({
    data: {
      centerId: input.centerId ?? null,
      programId: input.programId ?? null,
      metric: input.metric,
      condition: input.condition,
      threshold: input.threshold,
      description: input.description?.trim() || null,
      notifyRoles: input.notifyRoles?.length ? input.notifyRoles : ["center_admin", "supervisor"],
      isActive: input.isActive ?? true,
      createdBy: user.userId,
    },
    include: {
      center: { select: { id: true, name: true } },
      program: { select: { id: true, name: true } },
      createdByUser: { select: { id: true, fullName: true } },
    },
  });
}

export async function updateAlertRule(
  user: JwtPayload,
  ruleId: string,
  input: UpdateAlertRuleInput,
) {
  if (!isAdminRole(user.role)) {
    throw new ForbiddenError("Only admins can update alert rules");
  }
  const existing = await prisma.alertRule.findUnique({ where: { id: ruleId } });
  if (!existing) {
    throw new NotFoundError("AlertRule");
  }
  if (existing.centerId) {
    assertCenterAccess(user, existing.centerId, "No access to update this alert rule");
  } else if (!isGlobalAdmin(user.role)) {
    throw new ForbiddenError("Only global admins can modify global alert rules");
  }

  if (input.centerId !== undefined && input.centerId !== null) {
    assertCenterAccess(user, input.centerId, "No access to assign this center");
  }

  return prisma.alertRule.update({
    where: { id: ruleId },
    data: {
      ...(input.centerId !== undefined ? { centerId: input.centerId } : {}),
      ...(input.programId !== undefined ? { programId: input.programId } : {}),
      ...(input.metric !== undefined ? { metric: input.metric } : {}),
      ...(input.condition !== undefined ? { condition: input.condition } : {}),
      ...(input.threshold !== undefined ? { threshold: input.threshold } : {}),
      ...(input.description !== undefined ? { description: input.description } : {}),
      ...(input.notifyRoles !== undefined ? { notifyRoles: input.notifyRoles } : {}),
      ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
    },
    include: {
      center: { select: { id: true, name: true } },
      program: { select: { id: true, name: true } },
      createdByUser: { select: { id: true, fullName: true } },
    },
  });
}

export async function listAlerts(
  user: JwtPayload,
  query: { centerId?: string; status?: "open" | "read" | "all"; limit?: number },
) {
  const limit = Math.min(Math.max(Number(query.limit) || 50, 1), 200);
  const where: Prisma.AlertWhereInput = {};

  if (query.status === "open") {
    where.isRead = false;
  } else if (query.status === "read") {
    where.isRead = true;
  }

  if (query.centerId) {
    assertCenterAccess(user, query.centerId, "No access to alerts in this center");
    where.centerId = query.centerId;
  } else {
    const scopedCenterIds = getScopedCenterIds(user);
    if (scopedCenterIds !== undefined) {
      where.centerId = { in: scopedCenterIds };
    }
  }

  if (!isAdminRole(user.role)) {
    where.recipientId = user.userId;
  }

  const [alerts, openCount] = await Promise.all([
    prisma.alert.findMany({
      where,
      take: limit,
      orderBy: [{ isRead: "asc" }, { createdAt: "desc" }],
      include: {
        rule: {
          select: { id: true, metric: true, condition: true, threshold: true, description: true },
        },
        student: {
          select: { id: true, fullName: true, rollNumber: true, programId: true },
        },
        center: { select: { id: true, name: true } },
        recipient: { select: { id: true, fullName: true, role: true } },
      },
    }),
    prisma.alert.count({
      where: {
        ...where,
        isRead: false,
      },
    }),
  ]);

  return { alerts, openCount };
}

export async function updateAlertStatus(
  user: JwtPayload,
  alertId: string,
  isRead: boolean,
) {
  const alert = await prisma.alert.findUnique({ where: { id: alertId } });
  if (!alert) {
    throw new NotFoundError("Alert");
  }

  const isRecipient = alert.recipientId === user.userId;
  if (!isRecipient) {
    if (!isAdminRole(user.role)) {
      throw new ForbiddenError("You can only update alerts assigned to you");
    }
    assertCenterAccess(user, alert.centerId, "No access to alerts for this center");
  }

  return prisma.alert.update({
    where: { id: alertId },
    data: { isRead },
    include: {
      rule: {
        select: { id: true, metric: true, condition: true, threshold: true, description: true },
      },
      student: { select: { id: true, fullName: true, rollNumber: true } },
      center: { select: { id: true, name: true } },
    },
  });
}

function computeConsecutiveAbsences(
  records: Array<{ status: string; session: { sessionDate: Date; isHoliday: boolean } }>,
): number {
  const nonHoliday = records
    .filter((r) => !r.session.isHoliday && r.status !== "excused" && r.status !== "pending")
    .sort((a, b) => new Date(b.session.sessionDate).getTime() - new Date(a.session.sessionDate).getTime());

  let streak = 0;
  for (const r of nonHoliday) {
    if (r.status === "absent") {
      streak += 1;
    } else {
      break;
    }
  }
  return streak;
}

function computeRecentAttendancePct(
  records: Array<{ status: string; session: { sessionDate: Date; isHoliday: boolean } }>,
  cutoff30d: Date,
): number | null {
  const recent = records.filter(
    (r) => !r.session.isHoliday && new Date(r.session.sessionDate).getTime() >= cutoff30d.getTime(),
  );
  const counts = countAttendanceStatuses(recent);
  const totalMarked = counts.present + counts.late + counts.absent;
  if (totalMarked === 0) return null;
  return calculateAttendancePercentage(counts);
}

function computeExamDropPct(
  scores: Array<{
    marks: Prisma.Decimal | number | null;
    isAbsent: boolean;
    subject: { maxMarks: Prisma.Decimal | number } | null;
    exam: { id: string; examDate: Date | null; createdAt: Date };
  }>,
): number | null {
  const byExam = new Map<
    string,
    { sortTs: number; totalPct: number; count: number }
  >();

  for (const s of scores) {
    if (s.isAbsent || s.marks === null || s.marks === undefined) continue;
    const maxMarks = Number(s.subject?.maxMarks ?? 100);
    if (maxMarks <= 0) continue;
    const pct = (Number(s.marks) / maxMarks) * 100;
    const examTs = new Date(s.exam.examDate ?? s.exam.createdAt).getTime();
    const bucket = byExam.get(s.exam.id) ?? { sortTs: examTs, totalPct: 0, count: 0 };
    bucket.totalPct += pct;
    bucket.count += 1;
    byExam.set(s.exam.id, bucket);
  }

  const ordered = Array.from(byExam.values())
    .filter((b) => b.count > 0)
    .sort((a, b) => b.sortTs - a.sortTs);

  if (ordered.length < 2) return null;
  const latestAvg = ordered[0].totalPct / ordered[0].count;
  const previousAvg = ordered[1].totalPct / ordered[1].count;
  const drop = Math.round((previousAvg - latestAvg) * 10) / 10;
  return drop > 0 ? drop : 0;
}

function computeFeeOverdueBalance(
  totalFees: Prisma.Decimal | number | null,
  isFullyPaid: boolean,
  payments: Array<{ amount: Prisma.Decimal | number }>,
): number {
  if (isFullyPaid || totalFees === null || totalFees === undefined) return 0;
  const assigned = Number(totalFees);
  if (!Number.isFinite(assigned) || assigned <= 0) return 0;
  const paid = payments.reduce((sum, p) => sum + Number(p.amount ?? 0), 0);
  const outstanding = Math.round((assigned - paid) * 100) / 100;
  return outstanding > 0 ? outstanding : 0;
}

export async function evaluateAlertRules(options?: {
  centerId?: string;
  actorUser?: JwtPayload;
}): Promise<{
  evaluatedRules: number;
  evaluatedStudents: number;
  createdAlerts: number;
  skippedDuplicates: number;
}> {
  if (options?.actorUser && options.centerId) {
    assertCenterAccess(options.actorUser, options.centerId, "No access to evaluate alerts for this center");
  }

  const scopedCenterIds = options?.actorUser ? getScopedCenterIds(options.actorUser) : undefined;
  const ruleWhere: Prisma.AlertRuleWhereInput = { isActive: true };
  if (options?.centerId) {
    ruleWhere.OR = [{ centerId: options.centerId }, { centerId: null }];
  } else if (scopedCenterIds !== undefined) {
    ruleWhere.OR = [{ centerId: { in: scopedCenterIds } }, { centerId: null }];
  }

  const rules = await prisma.alertRule.findMany({ where: ruleWhere });
  if (rules.length === 0) {
    return { evaluatedRules: 0, evaluatedStudents: 0, createdAlerts: 0, skippedDuplicates: 0 };
  }

  const studentWhere: Prisma.StudentWhereInput = { isActive: true };
  if (options?.centerId) {
    studentWhere.centerId = options.centerId;
  } else if (scopedCenterIds !== undefined) {
    studentWhere.centerId = { in: scopedCenterIds };
  }

  const todayUtc = getTodayUtcDateOnly();
  const cutoff30d = new Date(todayUtc.getTime() - 30 * 86_400_000);

  const students = await prisma.student.findMany({
    where: studentWhere,
    select: {
      id: true,
      fullName: true,
      centerId: true,
      programId: true,
      totalFees: true,
      isFullyPaid: true,
      attendanceRecords: {
        select: {
          status: true,
          session: { select: { sessionDate: true, isHoliday: true } },
        },
      },
      examScores: {
        select: {
          marks: true,
          isAbsent: true,
          subject: { select: { maxMarks: true } },
          exam: { select: { id: true, examDate: true, createdAt: true } },
        },
      },
      feePayments: {
        select: { amount: true },
      },
    },
  });

  if (students.length === 0) {
    return {
      evaluatedRules: rules.length,
      evaluatedStudents: 0,
      createdAlerts: 0,
      skippedDuplicates: 0,
    };
  }

  const allRolesNeeded = Array.from(
    new Set(rules.flatMap((r) => (r.notifyRoles.length > 0 ? r.notifyRoles : ["center_admin", "supervisor"]))),
  );
  const candidateRecipients = await prisma.user.findMany({
    where: {
      isActive: true,
      role: { in: allRolesNeeded as never },
    },
    select: {
      id: true,
      role: true,
      centerAssignments: {
        where: {
          validFrom: { lte: todayUtc },
          OR: [{ validUntil: null }, { validUntil: { gte: todayUtc } }],
        },
        select: { centerId: true },
      },
    },
  });

  const existingOpenAlerts = await prisma.alert.findMany({
    where: {
      isRead: false,
      ruleId: { in: rules.map((r) => r.id) },
    },
    select: { ruleId: true, studentId: true, recipientId: true },
  });

  const openKeySet = new Set(
    existingOpenAlerts.map((a) => `${a.ruleId}:${a.studentId ?? ""}:${a.recipientId}`),
  );

  const alertsToCreate: Array<{
    ruleId: string;
    recipientId: string;
    studentId: string;
    centerId: string;
    message: string;
    metricValue: number;
  }> = [];

  let skippedDuplicates = 0;

  for (const rule of rules) {
    const threshold = Number(rule.threshold);
    if (!Number.isFinite(threshold)) continue;

    const targetRoles = new Set(
      rule.notifyRoles.length > 0 ? rule.notifyRoles : ["center_admin", "supervisor"],
    );

    for (const stu of students) {
      if (rule.centerId && stu.centerId !== rule.centerId) continue;
      if (rule.programId && stu.programId !== rule.programId) continue;

      let metricValue: number | null = null;
      switch (rule.metric) {
        case "consecutive_absences":
          metricValue = computeConsecutiveAbsences(stu.attendanceRecords ?? []);
          break;
        case "attendance_30d_pct":
          metricValue = computeRecentAttendancePct(stu.attendanceRecords ?? [], cutoff30d);
          break;
        case "exam_score_drop_pct":
          metricValue = computeExamDropPct(stu.examScores ?? []);
          break;
        case "fee_overdue_balance":
          metricValue = computeFeeOverdueBalance(
            stu.totalFees,
            stu.isFullyPaid,
            stu.feePayments ?? [],
          );
          break;
        default:
          metricValue = null;
      }

      if (metricValue === null || !matchesCondition(metricValue, rule.condition, threshold)) {
        continue;
      }

      const recipients = candidateRecipients.filter((u) => {
        if (!targetRoles.has(u.role)) return false;
        if (isGlobalAdmin(u.role)) return true;
        return (u.centerAssignments ?? []).some((a) => a.centerId === stu.centerId);
      });

      const message = formatMetricMessage(stu.fullName, rule.metric, metricValue, threshold);

      for (const recipient of recipients) {
        const key = `${rule.id}:${stu.id}:${recipient.id}`;
        if (openKeySet.has(key)) {
          skippedDuplicates += 1;
          continue;
        }
        openKeySet.add(key);
        alertsToCreate.push({
          ruleId: rule.id,
          recipientId: recipient.id,
          studentId: stu.id,
          centerId: stu.centerId,
          message,
          metricValue,
        });
      }
    }
  }

  if (alertsToCreate.length > 0) {
    await prisma.alert.createMany({
      data: alertsToCreate,
    });
  }

  return {
    evaluatedRules: rules.length,
    evaluatedStudents: students.length,
    createdAlerts: alertsToCreate.length,
    skippedDuplicates,
  };
}
