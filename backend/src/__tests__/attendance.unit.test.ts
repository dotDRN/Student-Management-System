import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { ROLES } from "../config/rbac.js";
import { ForbiddenError, ValidationError } from "../lib/errors.js";
import {
  bulkUpdateSessionRecords,
  getAttendanceRegister,
  getAttendanceSummary,
  getPendingSessions,
  getRecentAbsentees,
  getSessionById,
  getStudentAttendanceHistory,
  getTodayFreshSheet,
  listSessions,
} from "../services/attendanceService.js";
import type { JwtPayload } from "../utils/jwt.js";
import { mockPrismaModel, mockPrismaTransaction } from "./helpers/mockPrisma.js";

describe("Component 1.4: Attendance Sessions, Fresh Sheet, Holiday & Absentees", () => {
  const teacher: JwtPayload = {
    userId: "u-teacher",
    tenantId: "t1",
    email: "t@org.org",
    role: ROLES.TEACHER,
    centerIds: ["c1"],
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

  it("queries status='pending' (not null) in listSessions and getPendingSessions with tech_admin bypass", async (t) => {
    const listWheres: Record<string, unknown>[] = [];
    const pendingWheres: Record<string, unknown>[] = [];

    mockPrismaModel(t, "attendanceSession", {
      findMany: async (args: { where: Record<string, unknown> }) => {
        if ("isHoliday" in args.where) {
          pendingWheres.push(args.where);
        } else {
          listWheres.push(args.where);
        }
        return [
          {
            id: "s1",
            isHoliday: false,
            records: [{ status: "pending" }, { status: "present" }, { status: "pending" }],
          },
        ];
      },
    });

    const listRes = await listSessions(teacher, { hasIncomplete: true });
    assert.deepEqual((listWheres[0].records as Record<string, unknown>).some, { status: "pending" });
    assert.equal((listRes.sessions[0] as Record<string, unknown>).incompleteCount, 2);

    const pendingTech = await getPendingSessions(techAdmin);
    assert.equal(pendingTech.length, 1);
    assert.equal(pendingTech[0].incompleteCount, 2);
    assert.equal("centerId" in pendingWheres[0], false);
    assert.equal(pendingWheres[0].isHoliday, false);
  });

  it("returns isHoliday flag cleanly in getSessionById and rejects unassigned center", async (t) => {
    mockPrismaModel(t, "attendanceSession", {
      findUnique: async () => ({
        id: "s1",
        centerId: "c1",
        programId: "p1",
        sessionDate: new Date("2026-11-10T00:00:00.000Z"),
        isHoliday: true,
        center: { id: "c1", name: "Center 1" },
        program: { id: "p1", name: "Program 1" },
        activity: null,
        records: [],
      }),
    });

    const loaded = await getSessionById(teacher, "s1");
    assert.equal(loaded.isHoliday, true);
    assert.equal((loaded.session as Record<string, unknown>).isHoliday, true);

    mockPrismaModel(t, "attendanceSession", {
      findUnique: async () => ({
        id: "s2",
        centerId: "c-other",
        programId: "p1",
        sessionDate: new Date("2026-11-10T00:00:00.000Z"),
        isHoliday: false,
        records: [],
      }),
    });
    await assert.rejects(() => getSessionById(teacher, "s2"), ForbiddenError);
  });

  it("creates today's fresh sheet in UTC and syncs newly added active students", async (t) => {
    let findCall = 0;
    const createdRecords: Array<{ studentId: string; status: string }> = [];

    mockPrismaModel(t, "attendanceSession", {
      findFirst: async () => {
        findCall += 1;
        if (findCall <= 2) return null;
        return {
          id: "s-today",
          centerId: "c1",
          programId: "p1",
          isHoliday: false,
          records: [
            { id: "r1", status: "pending", student: { id: "stu-1", fullName: "S1", rollNumber: "1" } },
            { id: "r2", status: "pending", student: { id: "stu-2", fullName: "S2", rollNumber: "2" } },
          ],
        };
      },
    });
    mockPrismaModel(t, "academicYear", {
      findFirst: async () => ({ id: "ay-1" }),
    });
    mockPrismaTransaction(t, () => ({
      attendanceSession: {
        create: async () => ({ id: "s-today", centerId: "c1", programId: "p1", isHoliday: false }),
      },
      student: {
        findMany: async () => [{ id: "stu-1", fullName: "S1", centerId: "c1", programId: "p1" }],
      },
      attendanceRecord: {
        createMany: async () => ({ count: 1 }),
        findMany: async () => [{ id: "r1", studentId: "stu-1" }],
      },
    }));
    mockPrismaModel(t, "student", {
      findMany: async () => [{ id: "stu-1" }, { id: "stu-2" }],
    });
    mockPrismaModel(t, "attendanceRecord", {
      findMany: async () => [{ studentId: "stu-1" }],
      createMany: async (args: { data: Array<{ studentId: string; status: string }> }) => {
        createdRecords.push(...args.data);
        return { count: args.data.length };
      },
    });

    const sheet = await getTodayFreshSheet(teacher, "c1", "p1");
    assert.equal((sheet as Record<string, unknown>).id, "s-today");
    assert.equal(createdRecords.length, 1);
    assert.equal(createdRecords[0].studentId, "stu-2");
    assert.equal(createdRecords[0].status, "pending");
  });

  it("uses canonical formula (present+late) excluding holidays in history & summary", async (t) => {
    mockPrismaModel(t, "student", {
      findFirst: async () => ({ id: "stu-1", centerId: "c1" }),
    });
    mockPrismaModel(t, "attendanceRecord", {
      findMany: async () => [
        { status: "present", session: { isHoliday: false } },
        { status: "late", session: { isHoliday: false } },
        { status: "absent", session: { isHoliday: false } },
        { status: "excused", session: { isHoliday: false } },
        { status: "pending", session: { isHoliday: false } },
        { status: "absent", session: { isHoliday: true } },
      ],
    });

    const history = await getStudentAttendanceHistory(teacher, "stu-1", {});
    assert.equal(history.attendanceRate, 67);
    assert.equal(history.presentCount, 1);
    assert.equal(history.lateCount, 1);
    assert.equal(history.absentCount, 1);

    mockPrismaModel(t, "attendanceSession", {
      findMany: async () => [
        {
          id: "s1",
          sessionDate: new Date("2026-11-10T00:00:00Z"),
          isHoliday: false,
          center: { id: "c1", name: "C1" },
          program: { id: "p1", name: "P1" },
          records: [{ status: "present" }, { status: "late" }, { status: "absent" }],
        },
        {
          id: "s2",
          sessionDate: new Date("2026-11-11T00:00:00Z"),
          isHoliday: true,
          center: { id: "c1", name: "C1" },
          program: { id: "p1", name: "P1" },
          records: [{ status: "absent" }, { status: "absent" }],
        },
      ],
    });

    const summary = await getAttendanceSummary(techAdmin, {});
    assert.equal(summary.overallAttendanceRate, 67);
    assert.deepEqual(summary.totals, { present: 1, absent: 1, late: 1, total: 3 });
  });

  it("excludes holidays in getRecentAbsentees and validates statuses in bulkUpdateSessionRecords", async (t) => {
    const capturedWheres: Record<string, unknown>[] = [];
    mockPrismaModel(t, "attendanceRecord", {
      findMany: async (args: { where: Record<string, unknown> }) => {
        capturedWheres.push(args.where);
        return [];
      },
    });

    await getRecentAbsentees(techAdmin, 7);
    const sessionFilter = capturedWheres[0].session as Record<string, unknown>;
    assert.equal(sessionFilter.isHoliday, false);
    assert.equal("centerId" in sessionFilter, false);

    await assert.rejects(
      () =>
        bulkUpdateSessionRecords(teacher, "s1", [
          { recordId: "r1", status: "invalid_status" as never },
        ]),
      ValidationError,
    );
  });
});

describe("Component 2.3: Monthly Attendance Register & Consecutive Absence Streaks", () => {
  const teacher: JwtPayload = {
    userId: "u-teacher",
    tenantId: "t1",
    email: "t@org.org",
    role: ROLES.TEACHER,
    centerIds: ["c1"],
    isActive: true,
  };

  it("validates center scope and YYYY-MM format in getAttendanceRegister", async () => {
    await assert.rejects(
      () => getAttendanceRegister(teacher, { centerId: "c-other", month: "2026-11" }),
      ForbiddenError,
    );
    await assert.rejects(
      () => getAttendanceRegister(teacher, { centerId: "c1", month: "2026-13" }),
      ValidationError,
    );
    await assert.rejects(
      () => getAttendanceRegister(teacher, { centerId: "c1", month: "nov-2026" }),
      ValidationError,
    );
  });

  it("builds Students x Days matrix, excludes holidays from canonical (present+late) rate, and retains historical students", async (t) => {
    mockPrismaModel(t, "student", {
      findMany: async () => [
        { id: "stu-1", fullName: "Asha Rao", rollNumber: "R01" },
      ],
    });
    mockPrismaModel(t, "attendanceSession", {
      findMany: async () => [
        {
          id: "s-1",
          sessionDate: new Date("2026-11-01T00:00:00.000Z"),
          isHoliday: false,
          records: [
            { studentId: "stu-1", status: "present", remarks: null, student: { id: "stu-1", fullName: "Asha Rao", rollNumber: "R01" } },
            { studentId: "stu-hist", status: "absent", remarks: "Left early", student: { id: "stu-hist", fullName: "Bikram Sen", rollNumber: "R02" } },
          ],
        },
        {
          id: "s-2",
          sessionDate: new Date("2026-11-02T00:00:00.000Z"),
          isHoliday: false,
          records: [
            { studentId: "stu-1", status: "late", remarks: "Bus delay", student: { id: "stu-1", fullName: "Asha Rao", rollNumber: "R01" } },
          ],
        },
        {
          id: "s-3",
          sessionDate: new Date("2026-11-03T00:00:00.000Z"),
          isHoliday: false,
          records: [
            { studentId: "stu-1", status: "absent", remarks: null, student: { id: "stu-1", fullName: "Asha Rao", rollNumber: "R01" } },
          ],
        },
        {
          id: "s-4",
          sessionDate: new Date("2026-11-04T00:00:00.000Z"),
          isHoliday: false,
          records: [
            { studentId: "stu-1", status: "excused", remarks: "Medical", student: { id: "stu-1", fullName: "Asha Rao", rollNumber: "R01" } },
          ],
        },
        {
          id: "s-5",
          sessionDate: new Date("2026-11-05T00:00:00.000Z"),
          isHoliday: true,
          records: [
            { studentId: "stu-1", status: "absent", remarks: null, student: { id: "stu-1", fullName: "Asha Rao", rollNumber: "R01" } },
          ],
        },
      ],
    });

    const reg = await getAttendanceRegister(teacher, { centerId: "c1", month: "2026-11" });
    assert.equal(reg.days.length, 30);
    assert.deepEqual(reg.holidayDates, ["2026-11-05"]);
    assert.deepEqual(reg.sessionDates, [
      "2026-11-01",
      "2026-11-02",
      "2026-11-03",
      "2026-11-04",
      "2026-11-05",
    ]);
    assert.equal(reg.students.length, 2);

    const asha = reg.students[0];
    assert.equal(asha.studentId, "stu-1");
    assert.equal(asha.statuses["2026-11-01"], "present");
    assert.equal(asha.statuses["2026-11-02"], "late");
    assert.equal(asha.statuses["2026-11-03"], "absent");
    assert.equal(asha.statuses["2026-11-04"], "excused");
    assert.equal(asha.statuses["2026-11-05"], "holiday");
    assert.equal(asha.remarksByDate["2026-11-02"], "Bus delay");
    assert.equal(asha.summary.present, 1);
    assert.equal(asha.summary.late, 1);
    assert.equal(asha.summary.absent, 1);
    assert.equal(asha.summary.excused, 1);
    assert.equal(asha.summary.totalMarked, 3);
    assert.equal(asha.summary.attendanceRate, 67);

    const bikram = reg.students[1];
    assert.equal(bikram.studentId, "stu-hist");
    assert.equal(bikram.summary.attendanceRate, 0);
  });

  it("computes consecutiveAbsenceStreak ignoring holidays, excused, and pending", async (t) => {
    const streakQueries: Record<string, unknown>[] = [];
    mockPrismaModel(t, "attendanceRecord", {
      findMany: async (args: { where: Record<string, unknown> }) => {
        if (args.where.status === "absent") {
          return [
            {
              id: "r-a",
              studentId: "stu-3",
              status: "absent",
              remarks: "Follow up",
              student: { id: "stu-3", fullName: "Riya Das", rollNumber: "R03", guardianPhone: "999" },
              session: {
                id: "s-10",
                sessionDate: new Date("2026-11-10T00:00:00.000Z"),
                center: { name: "Center 1" },
                program: { name: "Program 1" },
              },
            },
            {
              id: "r-b",
              studentId: "stu-4",
              status: "absent",
              remarks: null,
              student: { id: "stu-4", fullName: "Kabir Roy", rollNumber: "R04", guardianPhone: "888" },
              session: {
                id: "s-10",
                sessionDate: new Date("2026-11-10T00:00:00.000Z"),
                center: { name: "Center 1" },
                program: { name: "Program 1" },
              },
            },
          ];
        }
        streakQueries.push(args.where);
        return [
          { studentId: "stu-3", status: "absent", session: { sessionDate: new Date("2026-11-10T00:00:00.000Z") } },
          { studentId: "stu-3", status: "absent", session: { sessionDate: new Date("2026-11-08T00:00:00.000Z") } },
          { studentId: "stu-3", status: "absent", session: { sessionDate: new Date("2026-11-07T00:00:00.000Z") } },
          { studentId: "stu-3", status: "present", session: { sessionDate: new Date("2026-11-06T00:00:00.000Z") } },
          { studentId: "stu-4", status: "absent", session: { sessionDate: new Date("2026-11-10T00:00:00.000Z") } },
          { studentId: "stu-4", status: "late", session: { sessionDate: new Date("2026-11-09T00:00:00.000Z") } },
          { studentId: "stu-4", status: "absent", session: { sessionDate: new Date("2026-11-08T00:00:00.000Z") } },
        ];
      },
    });

    const absentees = await getRecentAbsentees(teacher, 7);
    assert.equal(absentees.length, 2);
    assert.equal(streakQueries.length, 1);
    assert.deepEqual(streakQueries[0].status, { in: ["present", "absent", "late"] });
    assert.deepEqual(streakQueries[0].session, { isHoliday: false });
    assert.equal(absentees[0].consecutiveAbsenceStreak, 3);
    assert.equal(absentees[1].consecutiveAbsenceStreak, 1);
  });
});
