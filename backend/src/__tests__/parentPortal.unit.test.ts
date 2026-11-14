import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Request, Response } from "express";
import { requireAuth } from "../lib/auth.js";
import { ForbiddenError } from "../lib/errors.js";
import { getLinkedChildProgress, listLinkedChildren } from "../services/parentPortalService.js";
import { generateAccessToken, type JwtPayload } from "../utils/jwt.js";
import { mockPrismaModel } from "./helpers/mockPrisma.js";

process.env.JWT_ACCESS_SECRET ||= "test-jwt-access-secret";

const parentUser: JwtPayload = {
  userId: "parent-1",
  tenantId: "tenant-1",
  email: "parent@example.org",
  role: "parent",
  centerIds: [],
  isActive: true,
};

const teacherUser: JwtPayload = {
  userId: "teacher-1",
  tenantId: "tenant-1",
  email: "teacher@example.org",
  role: "teacher",
  centerIds: ["center-1"],
  isActive: true,
};

describe("Component 3.5: Parent / Guardian Read-Only Portal", () => {
  it("allows centerless parent tokens in requireAuth while continuing to block centerless teachers", () => {
    const parentToken = generateAccessToken({
      userId: "parent-1",
      tenantId: "tenant-1",
      email: "parent@example.org",
      role: "parent",
      centerIds: [],
      isActive: true,
    });

    const req = { headers: { authorization: `Bearer ${parentToken}` } } as unknown as Request;
    let passedErr: unknown = "NOT_CALLED";
    requireAuth(req, {} as Response, (err?: unknown) => {
      passedErr = err ?? null;
    });
    assert.equal(passedErr, null);

    const centerlessTeacherToken = generateAccessToken({
      userId: "teacher-x",
      tenantId: "tenant-1",
      email: "tx@example.org",
      role: "teacher",
      centerIds: [],
      isActive: true,
    });
    const req2 = {
      headers: { authorization: `Bearer ${centerlessTeacherToken}` },
    } as unknown as Request;
    let teacherErr: unknown = null;
    requireAuth(req2, {} as Response, (err?: unknown) => {
      teacherErr = err;
    });
    assert.ok(teacherErr instanceof ForbiddenError);
  });

  it("blocks non-parent roles and lists only linked children for authenticated parent", async (t) => {
    await assert.rejects(() => listLinkedChildren(teacherUser), ForbiddenError);

    let queriedParentId = "";
    mockPrismaModel(t, "parentStudent", {
      findMany: async ({ where }: { where: { parentUserId: string } }) => {
        queriedParentId = where.parentUserId;
        return [
          {
            id: "ps-1",
            student: {
              id: "stu-1",
              fullName: "Meera Nair",
              rollNumber: "R001",
              isActive: true,
              totalFees: 1000,
              feesPaid: 600,
              isFullyPaid: false,
            },
          },
        ];
      },
    });

    const children = await listLinkedChildren(parentUser);
    assert.equal(queriedParentId, "parent-1");
    assert.equal(children.length, 1);
    assert.equal(children[0].fullName, "Meera Nair");
    assert.equal(children[0].totalFees, 1000);
    assert.equal(children[0].feesPaid, 600);
  });

  it("strictly enforces ParentStudent ownership and computes canonical child progress snapshot", async (t) => {
    let linkExists = false;
    mockPrismaModel(t, "parentStudent", {
      findFirst: async () => (linkExists ? { id: "link-1" } : null),
    });

    await assert.rejects(() => getLinkedChildProgress(parentUser, "stu-unlinked"), ForbiddenError);

    linkExists = true;
    mockPrismaModel(t, "student", {
      findUnique: async () => ({
        id: "stu-1",
        fullName: "Meera Nair",
        rollNumber: "R001",
        dob: null,
        gender: "female",
        enrollmentDate: new Date("2025-04-01T00:00:00Z"),
        isActive: true,
        stream: null,
        totalFees: 1500,
        feesPaid: 900,
        isFullyPaid: false,
        center: { id: "center-1", name: "North Center", location: "Delhi" },
        program: { id: "prog-1", name: "Class 7", code: "C7" },
        academicYear: { id: "ay-1", label: "2025-26" },
        attendanceRecords: [
          { sessionId: "s1", status: "present", session: { id: "s1", sessionDate: new Date("2026-03-01"), isHoliday: false } },
          { sessionId: "s2", status: "late", session: { id: "s2", sessionDate: new Date("2026-03-02"), isHoliday: false } },
          { sessionId: "s3", status: "absent", session: { id: "s3", sessionDate: new Date("2026-03-03"), isHoliday: false } },
          { sessionId: "s4", status: "absent", session: { id: "s4", sessionDate: new Date("2026-03-04"), isHoliday: true } },
          { sessionId: "s5", status: "excused", session: { id: "s5", sessionDate: new Date("2026-03-05"), isHoliday: false } },
        ],
        examScores: [
          {
            id: "es-1",
            examId: "ex-1",
            marks: 40,
            isAbsent: false,
            remarks: null,
            exam: { id: "ex-1", name: "Baseline Test", examType: "baseline", examDate: new Date("2026-01-10"), academicYear: { id: "ay-1", label: "2025-26" } },
            subject: { id: "sub-1", name: "Mathematics", maxMarks: 50 },
          },
          {
            id: "es-2",
            examId: "ex-2",
            marks: null,
            isAbsent: true,
            remarks: null,
            exam: { id: "ex-2", name: "Endline Test", examType: "endline", examDate: new Date("2026-03-10"), academicYear: { id: "ay-1", label: "2025-26" } },
            subject: { id: "sub-1", name: "Mathematics", maxMarks: 50 },
          },
        ],
        skillLogs: [
          {
            id: "sk-1",
            skillId: "def-1",
            level: 4,
            assessedOn: new Date("2026-02-15"),
            remarks: "Great teamwork",
            skill: { id: "def-1", name: "Communication", description: "Soft Skills", maxLevel: 5 },
          },
        ],
        feePayments: [
          { id: "fp-1", amount: 900, notes: "Term 1", paidAt: new Date("2026-01-05") },
        ],
        activityEnrollments: [
          {
            id: "ae-1",
            status: "approved_by_admin",
            createdAt: new Date("2026-02-01"),
            activity: { id: "act-1", name: "Science Fair", activityType: "camp", status: "completed", startDate: null, endDate: null, isActive: true },
          },
        ],
      }),
    });

    const snapshot = await getLinkedChildProgress(parentUser, "stu-1");
    assert.equal(snapshot.attendance.percentage, 67);
    assert.equal(snapshot.attendance.totalSessions, 3);
    assert.equal(snapshot.academics.averagePct, 80);
    assert.deepEqual(snapshot.academics.comparison, [
      { subject: "Mathematics", baseline: 80, midline: null, endline: null },
    ]);
    assert.equal(snapshot.fees.balanceDue, 600);
    assert.equal(snapshot.skills.latest[0].level, 4);
    assert.equal(snapshot.activities.summary.holisticPoints, 5);
  });
});
