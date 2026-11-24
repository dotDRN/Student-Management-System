import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ROLES } from "../config/rbac.js";
import { ForbiddenError } from "../lib/errors.js";
import {
  createAlertRule,
  evaluateAlertRules,
  matchesCondition,
  updateAlertStatus,
} from "../services/alertService.js";
import { createAlertRuleSchema } from "../validators/schemas.js";
import { mockPrismaModel } from "./helpers/mockPrisma.js";

const CENTER_1 = "11111111-1111-4111-8111-111111111111";
const CENTER_2 = "22222222-2222-4222-8222-222222222222";
const RULE_1 = "33333333-3333-4333-8333-333333333333";
const RULE_2 = "44444444-4444-4444-8444-444444444444";
const RULE_3 = "55555555-5555-4555-8555-555555555555";
const RULE_4 = "66666666-6666-4666-8666-666666666666";

const superAdmin = { userId: "admin-1", role: ROLES.SUPER_ADMIN, centerIds: [] };
const centerAdmin = { userId: "ca-1", role: ROLES.CENTER_ADMIN, centerIds: [CENTER_1] };
const teacher = { userId: "teacher-1", role: ROLES.TEACHER, centerIds: [CENTER_1] };

describe("Component 3.2: Early-Warning Risk & Alerts Engine", () => {
  it("validates alert rule schemas and condition matching helper", () => {
    assert.equal(matchesCondition(3, "gte", 3), true);
    assert.equal(matchesCondition(2, "gte", 3), false);
    assert.equal(matchesCondition(72, "lt", 75), true);
    assert.equal(matchesCondition(75, "lt", 75), false);

    assert.equal(
      createAlertRuleSchema.safeParse({
        centerId: CENTER_1,
        metric: "consecutive_absences",
        condition: "gte",
        threshold: 3,
        notifyRoles: ["center_admin", "supervisor"],
      }).success,
      true,
    );

    assert.equal(
      createAlertRuleSchema.safeParse({
        metric: "unknown_metric",
        condition: "gte",
        threshold: 5,
      }).success,
      false,
    );
  });

  it("enforces admin & center scoping on createAlertRule and updateAlertStatus", async (t) => {
    await assert.rejects(
      () =>
        createAlertRule(teacher, {
          centerId: CENTER_1,
          metric: "consecutive_absences",
          condition: "gte",
          threshold: 3,
        }),
      ForbiddenError,
    );

    await assert.rejects(
      () =>
        createAlertRule(centerAdmin, {
          centerId: null,
          metric: "attendance_30d_pct",
          condition: "lt",
          threshold: 75,
        }),
      ForbiddenError,
    );

    await assert.rejects(
      () =>
        createAlertRule(centerAdmin, {
          centerId: CENTER_2,
          metric: "attendance_30d_pct",
          condition: "lt",
          threshold: 75,
        }),
      ForbiddenError,
    );

    mockPrismaModel(t, "alert", {
      findUnique: async () => ({
        id: "alert-1",
        recipientId: "other-user",
        centerId: CENTER_2,
        isRead: false,
      }),
      update: async (args: { data: { isRead: boolean } }) => ({
        id: "alert-1",
        isRead: args.data.isRead,
      }),
    });

    await assert.rejects(
      () => updateAlertStatus(teacher, "alert-1", true),
      ForbiddenError,
    );

    await assert.rejects(
      () => updateAlertStatus(centerAdmin, "alert-1", true),
      ForbiddenError,
    );

    const resolved = await updateAlertStatus(superAdmin, "alert-1", true);
    assert.equal((resolved as { isRead: boolean }).isRead, true);
  });

  it("evaluates all 4 risk metrics, targets active center recipients, and deduplicates open alerts", async (t) => {
    const now = new Date();
    const dayAgo = (n: number) => new Date(now.getTime() - n * 86_400_000);
    const createdAlerts: Array<Record<string, unknown>> = [];

    mockPrismaModel(t, "alertRule", {
      findMany: async () => [
        {
          id: RULE_1,
          centerId: null,
          programId: null,
          metric: "consecutive_absences",
          condition: "gte",
          threshold: 3,
          notifyRoles: ["center_admin", "super_admin"],
          isActive: true,
        },
        {
          id: RULE_2,
          centerId: CENTER_1,
          programId: null,
          metric: "attendance_30d_pct",
          condition: "lt",
          threshold: 75,
          notifyRoles: ["center_admin"],
          isActive: true,
        },
        {
          id: RULE_3,
          centerId: null,
          programId: null,
          metric: "exam_score_drop_pct",
          condition: "gte",
          threshold: 15,
          notifyRoles: ["center_admin"],
          isActive: true,
        },
        {
          id: RULE_4,
          centerId: null,
          programId: null,
          metric: "fee_overdue_balance",
          condition: "gte",
          threshold: 500,
          notifyRoles: ["center_admin"],
          isActive: true,
        },
      ],
    });

    mockPrismaModel(t, "student", {
      findMany: async () => [
        {
          id: "stu-risk",
          fullName: "Ravi Kumar",
          centerId: CENTER_1,
          programId: "prog-1",
          totalFees: 2000,
          isFullyPaid: false,
          attendanceRecords: [
            // Holiday absent ignored; recent 3 non-holiday absents + 1 present = 25% 30d & 3 streak
            { status: "absent", session: { sessionDate: dayAgo(0), isHoliday: true } },
            { status: "absent", session: { sessionDate: dayAgo(1), isHoliday: false } },
            { status: "absent", session: { sessionDate: dayAgo(2), isHoliday: false } },
            { status: "absent", session: { sessionDate: dayAgo(3), isHoliday: false } },
            { status: "present", session: { sessionDate: dayAgo(5), isHoliday: false } },
          ],
          examScores: [
            {
              marks: 80,
              isAbsent: false,
              subject: { maxMarks: 100 },
              exam: { id: "ex-old", examDate: dayAgo(20), createdAt: dayAgo(20) },
            },
            {
              marks: 55,
              isAbsent: false,
              subject: { maxMarks: 100 },
              exam: { id: "ex-new", examDate: dayAgo(2), createdAt: dayAgo(2) },
            },
          ],
          feePayments: [{ amount: 500 }],
        },
      ],
    });

    mockPrismaModel(t, "user", {
      findMany: async () => [
        { id: "ca-1", role: ROLES.CENTER_ADMIN, centerAssignments: [{ centerId: CENTER_1 }] },
        { id: "ca-other", role: ROLES.CENTER_ADMIN, centerAssignments: [{ centerId: CENTER_2 }] },
        { id: "sa-1", role: ROLES.SUPER_ADMIN, centerAssignments: [] },
      ],
    });

    // Pretend RULE_1 -> stu-risk -> ca-1 ALREADY has an open alert so it gets skipped!
    mockPrismaModel(t, "alert", {
      findMany: async () => [{ ruleId: RULE_1, studentId: "stu-risk", recipientId: "ca-1" }],
      createMany: async (args: { data: Array<Record<string, unknown>> }) => {
        createdAlerts.push(...args.data);
        return { count: args.data.length };
      },
    });

    const summary = await evaluateAlertRules({ actorUser: superAdmin });
    assert.equal(summary.evaluatedRules, 4);
    assert.equal(summary.evaluatedStudents, 1);
    assert.equal(summary.skippedDuplicates, 1);
    // Expected created alerts:
    // RULE_1 -> sa-1 (ca-1 skipped as duplicate; ca-other wrong role & wrong center)
    // RULE_2 -> ca-1 (25% < 75)
    // RULE_3 -> ca-1 (25% drop >= 15)
    // RULE_4 -> ca-1 (1500 balance >= 500)
    assert.equal(summary.createdAlerts, 4);
    assert.equal(createdAlerts.some((a) => a.recipientId === "ca-other"), false);
    assert.equal(createdAlerts.some((a) => a.ruleId === RULE_2 && a.metricValue === 25), true);
    assert.equal(createdAlerts.some((a) => a.ruleId === RULE_3 && a.metricValue === 25), true);
    assert.equal(createdAlerts.some((a) => a.ruleId === RULE_4 && a.metricValue === 1500), true);
  });
});
