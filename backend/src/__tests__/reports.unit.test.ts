import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { ROLES } from "../config/rbac.js";
import { ForbiddenError, ValidationError } from "../lib/errors.js";
import {
  exportStudentDataCsv,
  formatCsvCell,
  getAttendanceAnalytics,
  getDashboardSummary,
  getExamAnalytics,
  getFilteredStudents,
  getMasterWorkbookData,
  getSkillsReport,
} from "../services/reportService.js";
import type { JwtPayload } from "../utils/jwt.js";
import { mockPrismaModel } from "./helpers/mockPrisma.js";

const CENTER_1 = "cccccccc-cccc-4ccc-8ccc-ccccccccccc1";
const CENTER_2 = "cccccccc-cccc-4ccc-8ccc-ccccccccccc2";
const YEAR_UUID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

describe("Component 1.8: Dashboard, Reports, Analytics & CSV Export Hardening", () => {
  const teacher: JwtPayload = {
    userId: "u-teacher",
    tenantId: "t1",
    email: "t@org.org",
    role: ROLES.TEACHER,
    centerIds: [CENTER_1],
    isActive: true,
  };

  const techAdmin: JwtPayload = {
    userId: "u-tech",
    tenantId: "t1",
    email: "tech@org.org",
    role: ROLES.TECH_ADMIN,
    centerIds: [],
    isActive: true,
  };

  it("getDashboardSummary grants tech_admin global scope and excludes holidays/pending/excused from rates", async (t) => {
    const centerWheres: Record<string, unknown>[] = [];
    const groupByWheres: Record<string, unknown>[] = [];

    mockPrismaModel(t, "student", {
      count: async () => 12,
      groupBy: async () => [{ programId: "p1", _count: { programId: 12 } }],
      aggregate: async () => ({ _sum: { totalFees: 10000, feesPaid: 7500 } }),
    });
    mockPrismaModel(t, "attendanceSession", {
      count: async () => 1,
    });
    mockPrismaModel(t, "center", {
      findMany: async (args: { where: Record<string, unknown> }) => {
        centerWheres.push(args.where);
        return [{ id: CENTER_1, name: "North Center" }];
      },
    });
    mockPrismaModel(t, "program", {
      findMany: async () => [{ id: "p1", name: "STEM" }],
    });
    mockPrismaModel(t, "attendanceRecord", {
      groupBy: async (args: { where: Record<string, unknown> }) => {
        groupByWheres.push(args.where);
        return [
          { status: "present", _count: { status: 7 } },
          { status: "late", _count: { status: 1 } },
          { status: "absent", _count: { status: 2 } },
        ];
      },
    });

    const summary = await getDashboardSummary(techAdmin);
    assert.equal(summary.totalStudents, 12);
    assert.equal(summary.totalCenters, 1);
    assert.equal(summary.overallAttendanceRate, 80);
    assert.equal(centerWheres[0].isActive, true);
    assert.equal("id" in centerWheres[0], false);
    assert.deepEqual(
      (groupByWheres[0].status as Record<string, unknown>).in,
      ["present", "absent", "late"],
    );
    assert.equal(
      (groupByWheres[0].session as Record<string, unknown>).isHoliday,
      false,
    );
  });

  it("getAttendanceAnalytics enforces UTC dates, excludes holidays, and blocks cross-center spoofing", async (t) => {
    const sessionWheres: Record<string, unknown>[] = [];

    await assert.rejects(
      () => getAttendanceAnalytics(teacher, { from: "2026-11-01" }),
      ValidationError,
    );
    await assert.rejects(
      () =>
        getAttendanceAnalytics(teacher, {
          from: "2026-11-10",
          to: "2026-11-05",
        }),
      ValidationError,
    );
    await assert.rejects(
      () =>
        getAttendanceAnalytics(teacher, {
          from: "2026-11-01",
          to: "2026-11-10",
          centerId: CENTER_2,
        }),
      ForbiddenError,
    );

    mockPrismaModel(t, "attendanceSession", {
      findMany: async (args: { where: Record<string, unknown> }) => {
        sessionWheres.push(args.where);
        return [
          {
            sessionDate: new Date("2026-11-02T00:00:00.000Z"),
            records: [
              { studentId: "st-1", status: "present", student: { fullName: "Asha" } },
              { studentId: "st-2", status: "late", student: { fullName: "Ravi" } },
              { studentId: "st-3", status: "pending", student: { fullName: "Maya" } },
              { studentId: "st-4", status: "excused", student: { fullName: "Zoya" } },
            ],
          },
        ];
      },
    });

    const analytics = await getAttendanceAnalytics(teacher, {
      from: "2026-11-01",
      to: "2026-11-10",
      centerId: CENTER_1,
    });

    assert.equal(sessionWheres[0].isHoliday, false);
    assert.equal(analytics.summary.averageAttendanceRate, 100);
    assert.equal(analytics.summary.present, 1);
    assert.equal(analytics.summary.late, 1);
  });

  it("getExamAnalytics handles dynamic subjects, excludes absent scores, and retains non-absent 0 marks", async (t) => {
    mockPrismaModel(t, "academicYear", {
      findFirst: async () => ({ id: YEAR_UUID, label: "2026-27" }),
    });
    mockPrismaModel(t, "exam", {
      findMany: async () => [
        {
          examType: "baseline",
          scores: [
            {
              studentId: "st-1",
              isAbsent: false,
              marks: 0,
              subject: { name: "Coding Logic" },
              student: { fullName: "Asha" },
            },
            {
              studentId: "st-2",
              isAbsent: false,
              marks: 80,
              subject: { name: "Coding Logic" },
              student: { fullName: "Ravi" },
            },
            {
              studentId: "st-3",
              isAbsent: true,
              marks: 50,
              subject: { name: "Coding Logic" },
              student: { fullName: "Absent Kid" },
            },
          ],
        },
        {
          examType: "endline",
          scores: [
            {
              studentId: "st-1",
              isAbsent: false,
              marks: 70,
              subject: { name: "Coding Logic" },
              student: { fullName: "Asha" },
            },
          ],
        },
      ],
    });

    const report = await getExamAnalytics(techAdmin, { academicYear: "2026-27" });
    assert.deepEqual(report.baseline["coding logic"], { avg: 40, min: 0, max: 80 });
    assert.deepEqual(report.endline["coding logic"], { avg: 70, min: 70, max: 70 });
    assert.equal(report.improvement["coding logic"], 30);
    assert.equal(report.studentPerformance[0].studentId, "st-1");
    assert.equal(report.studentPerformance[0].delta, 70);
  });

  it("getSkillsReport returns real StudentSkillLog skillProficiency percentages", async (t) => {
    mockPrismaModel(t, "studentSkillLog", {
      findMany: async () => [
        { level: 8, skill: { id: "sk-1", name: "Public Speaking", maxLevel: 10 } },
        { level: 6, skill: { id: "sk-1", name: "Public Speaking", maxLevel: 10 } },
      ],
    });
    mockPrismaModel(t, "examScore", { findMany: async () => [] });
    mockPrismaModel(t, "formTemplate", { findMany: async () => [] });

    const skillsReport = await getSkillsReport(teacher, {});
    assert.equal(skillsReport.skillProficiency.length, 1);
    assert.equal(skillsReport.skillProficiency[0].averageLevel, 7);
    assert.equal(skillsReport.skillProficiency[0].averagePct, 70);
    assert.equal(skillsReport.skillProficiency[0].sampleSize, 2);
  });

  it("getFilteredStudents computes exam % from subject.maxMarks and exportStudentDataCsv neutralizes formulas", async (t) => {
    mockPrismaModel(t, "student", {
      findMany: async () => [
        {
          id: "st-1",
          fullName: '=HYPERLINK("http://evil.test","Asha")',
          centerId: CENTER_1,
          center: { id: CENTER_1, name: "Center 1" },
          programId: "p1",
          program: { id: "p1", name: 'STEM "Alpha"' },
          attendanceRecords: [
            { status: "present" },
            { status: "late" },
            { status: "pending" },
          ],
          examScores: [
            { isAbsent: false, marks: 40, subject: { maxMarks: 50 } },
            { isAbsent: true, marks: null, subject: { maxMarks: 50 } },
          ],
        },
      ],
    });

    const filtered = await getFilteredStudents(teacher, {});
    assert.equal(filtered.length, 1);
    assert.equal(filtered[0].attendanceRate, 100);
    assert.equal(filtered[0].avgExamScore, 80);

    const csv = await exportStudentDataCsv(teacher, {});
    assert.match(csv, /^id,fullName,centerName,programName,attendanceRate,avgExamScore/m);
    assert.ok(csv.includes(`"'=HYPERLINK(""http://evil.test"",""Asha"")"`));
    assert.ok(csv.includes(`"STEM ""Alpha"""`));
    assert.equal(formatCsvCell("+cmd"), `"'+cmd"`);
    assert.equal(formatCsvCell("-1+1"), `"'-1+1"`);
    assert.equal(formatCsvCell("@SUM(A1)"), `"'@SUM(A1)"`);
  });
});

describe("Component 2.6: Actionable Dashboard & Master Workbook Export", () => {
  const teacher: JwtPayload = {
    userId: "u-teacher",
    tenantId: "t1",
    email: "t@org.org",
    role: ROLES.TEACHER,
    centerIds: [CENTER_1],
    isActive: true,
  };

  it("getDashboardSummary returns operational widgets: pending attendance today, transfer count, fee progress, and lowest-attendance centers", async (t) => {
    mockPrismaModel(t, "student", {
      count: async (args: { where: Record<string, unknown> }) => {
        if (args.where.transferStatus === "pending_transfer") return 2;
        if (args.where.isFullyPaid === true) return 4;
        if (args.where.totalFees) return 6;
        if (args.where.enrollmentDate) return 3;
        return 10;
      },
      groupBy: async () => [{ programId: "p1", _count: { programId: 10 } }],
      aggregate: async () => ({ _sum: { totalFees: 20000, feesPaid: 15000 } }),
    });
    mockPrismaModel(t, "center", {
      findMany: async () => [
        { id: CENTER_1, name: "North Center" },
        { id: CENTER_2, name: "South Center" },
      ],
    });
    mockPrismaModel(t, "program", {
      findMany: async () => [{ id: "p1", name: "Foundation" }],
    });
    mockPrismaModel(t, "attendanceSession", {
      count: async () => 3,
    });
    mockPrismaModel(t, "attendanceRecord", {
      groupBy: async (args: { where: Record<string, unknown> }) => {
        if (args.where.centerId === CENTER_2) {
          return [
            { status: "present", _count: { status: 1 } },
            { status: "absent", _count: { status: 1 } },
          ];
        }
        return [
          { status: "present", _count: { status: 9 } },
          { status: "absent", _count: { status: 1 } },
        ];
      },
    });

    const summary = await getDashboardSummary(teacher);
    assert.equal(summary.pendingAttendanceToday, 3);
    assert.equal(summary.pendingTransfersCount, 2);
    assert.deepEqual(summary.feeSummary, {
      totalAssigned: 20000,
      totalCollected: 15000,
      totalOutstanding: 5000,
      collectionPct: 75,
      fullyPaidStudents: 4,
      studentsWithFees: 6,
    });
    assert.equal(summary.lowestAttendanceCenters.length, 2);
    assert.equal(summary.lowestAttendanceCenters[0].centerId, CENTER_2);
    assert.equal(summary.lowestAttendanceCenters[0].attendanceRate, 50);
  });

  it("getMasterWorkbookData blocks unauthorized centers and assembles all 6 workbook sheets with fee summaries", async (t) => {
    await assert.rejects(
      () => getMasterWorkbookData(teacher, { centerId: CENTER_2 }),
      ForbiddenError,
    );

    mockPrismaModel(t, "student", {
      count: async () => 2,
      groupBy: async () => [{ programId: "p1", _count: { programId: 2 } }],
      aggregate: async () => ({ _sum: { totalFees: 5000, feesPaid: 3000 } }),
      findMany: async () => [
        {
          id: "st-1",
          fullName: "Asha Rao",
          rollNumber: "R01",
          centerId: CENTER_1,
          center: { id: CENTER_1, name: "Center 1" },
          programId: "p1",
          program: { id: "p1", name: "STEM" },
          enrollmentDate: new Date("2026-07-01T00:00:00.000Z"),
          totalFees: 3000,
          feesPaid: 3000,
          isFullyPaid: true,
          attendanceRecords: [{ status: "present" }, { status: "late" }],
          examScores: [{ isAbsent: false, marks: 45, subject: { maxMarks: 50 } }],
        },
        {
          id: "st-2",
          fullName: "Rohan Das",
          rollNumber: "R02",
          centerId: CENTER_1,
          center: { id: CENTER_1, name: "Center 1" },
          programId: "p1",
          program: { id: "p1", name: "STEM" },
          enrollmentDate: new Date("2026-07-02T00:00:00.000Z"),
          totalFees: 2000,
          feesPaid: 0,
          isFullyPaid: false,
          attendanceRecords: [{ status: "absent" }],
          examScores: [{ isAbsent: false, marks: 0, subject: { maxMarks: 50 } }],
        },
      ],
    });
    mockPrismaModel(t, "center", {
      findMany: async () => [{ id: CENTER_1, name: "Center 1" }],
    });
    mockPrismaModel(t, "program", {
      findMany: async () => [{ id: "p1", name: "STEM" }],
    });
    mockPrismaModel(t, "attendanceSession", {
      count: async () => 1,
      findMany: async () => [],
    });
    mockPrismaModel(t, "attendanceRecord", {
      groupBy: async () => [{ status: "present", _count: { status: 2 } }],
    });
    mockPrismaModel(t, "studentSkillLog", {
      findMany: async () => [{ level: 4, skill: { id: "sk-1", name: "Logic", maxLevel: 5 } }],
    });
    mockPrismaModel(t, "examScore", { findMany: async () => [] });
    mockPrismaModel(t, "formTemplate", { findMany: async () => [] });

    const wb = await getMasterWorkbookData(teacher, {
      centerId: CENTER_1,
      from: "2026-11-01",
      to: "2026-11-10",
    });

    assert.equal(wb.students.length, 2);
    assert.equal(wb.students[0].enrollmentDate, "2026-07-01");
    assert.equal(wb.students[0].feeStatus, "Cleared");
    assert.equal(wb.students[0].avgExamScore, 90);
    assert.equal(wb.students[1].feeStatus, "Pending");
    assert.equal(wb.students[1].balanceDue, 2000);
    assert.equal(wb.skillProficiency.length, 1);
    assert.equal(wb.feeSummary.length, 1);
    assert.equal(wb.feeSummary[0].totalAssigned, 5000);
    assert.equal(wb.feeSummary[0].totalCollected, 3000);
    assert.equal(wb.feeSummary[0].outstanding, 2000);
    assert.equal(wb.feeSummary[0].collectionPct, 60);
    assert.ok(wb.attendanceSummary !== null);
  });
});
