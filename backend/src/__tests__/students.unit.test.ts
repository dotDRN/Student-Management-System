import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { ROLES } from "../config/rbac.js";
import { ForbiddenError, ValidationError } from "../lib/errors.js";
import { createStudentSchema, updateStudentSchema } from "../validators/schemas.js";
import {
  addFeePayment,
  completeTransfer,
  deleteCareer,
  getAllStudents,
  getStudentProfile,
  requestTransfer,
  updateCareer,
  updateStudentFees,
} from "../services/student.service.js";
import type { JwtPayload } from "../utils/jwt.js";
import { mockPrismaModel, mockPrismaTransaction } from "./helpers/mockPrisma.js";

describe("Component 1.3: Students, Profiles, Careers, Transfers & Fees", () => {
  const teacherC1: JwtPayload = {
    userId: "00000000-0000-4000-8000-000000000001",
    tenantId: "t1",
    email: "t1@org.org",
    role: ROLES.TEACHER,
    centerIds: ["00000000-0000-4000-8000-0000000000c1"],
    isActive: true,
  };

  const teacherC2: JwtPayload = {
    userId: "00000000-0000-4000-8000-000000000002",
    tenantId: "t1",
    email: "t2@org.org",
    role: ROLES.TEACHER,
    centerIds: ["00000000-0000-4000-8000-0000000000c2"],
    isActive: true,
  };

  const superAdmin: JwtPayload = {
    userId: "00000000-0000-4000-8000-000000000099",
    tenantId: "t1",
    email: "sa@org.org",
    role: ROLES.SUPER_ADMIN,
    centerIds: [],
    isActive: true,
  };

  const center1Id = "00000000-0000-4000-8000-0000000000c1";
  const center2Id = "00000000-0000-4000-8000-0000000000c2";
  const program1Id = "00000000-0000-4000-8000-0000000000a1";
  const student1Id = "00000000-0000-4000-8000-000000000101";
  const year1Id = "00000000-0000-4000-8000-000000000201";

  it("retains full academic/post-12th fields and preprocesses empty strings in student schemas", () => {
    const parsedCreate = createStudentSchema.parse({
      fullName: "Aarav Sharma",
      rollNumber: "R-12",
      centerId: center1Id,
      programId: program1Id,
      academicYearId: year1Id,
      dob: "",
      gender: "",
      guardianName: "",
      guardianPhone: "",
      stream: "Science",
      post12thChoice: "Engineering",
      collegeName: "State Tech",
      educationDiscontinued: false,
      enrollmentDate: "2026-06-15",
    });

    assert.equal(parsedCreate.rollNumber, "R-12");
    assert.equal(parsedCreate.stream, "Science");
    assert.equal(parsedCreate.post12thChoice, "Engineering");
    assert.equal(parsedCreate.collegeName, "State Tech");
    assert.equal(parsedCreate.educationDiscontinued, false);
    assert.equal(parsedCreate.enrollmentDate, "2026-06-15");
    assert.equal(parsedCreate.academicYearId, year1Id);
    assert.equal(parsedCreate.dob, null);
    assert.equal(parsedCreate.gender, null);
    assert.equal(parsedCreate.guardianPhone, null);

    const parsedUpdate = updateStudentSchema.parse({
      dob: "",
      guardianName: null,
      stream: "Commerce",
    });
    assert.equal(parsedUpdate.dob, null);
    assert.equal(parsedUpdate.guardianName, null);
    assert.equal(parsedUpdate.stream, "Commerce");
  });

  it("computes getStudentProfile attendancePct over full history excluding holidays and counting late", async (t) => {
    const records = [
      ...Array.from({ length: 11 }, (_, idx) => ({
        status: "present",
        session: { isHoliday: false, sessionDate: new Date(Date.UTC(2026, 0, idx + 1)) },
      })),
      { status: "late", session: { isHoliday: false, sessionDate: new Date(Date.UTC(2026, 0, 12)) } },
      { status: "absent", session: { isHoliday: false, sessionDate: new Date(Date.UTC(2026, 0, 13)) } },
      { status: "absent", session: { isHoliday: false, sessionDate: new Date(Date.UTC(2026, 0, 14)) } },
      { status: "absent", session: { isHoliday: true, sessionDate: new Date(Date.UTC(2026, 0, 15)) } },
      { status: "absent", session: { isHoliday: true, sessionDate: new Date(Date.UTC(2026, 0, 16)) } },
    ];

    mockPrismaModel(t, "student", {
      findFirst: async () => ({
        id: student1Id,
        fullName: "Test Student",
        centerId: center1Id,
        programId: program1Id,
        center: { id: center1Id, name: "C1" },
        program: { id: program1Id, name: "P1" },
        attendanceRecords: records,
        examScores: [],
        formSubmissions: [],
      }),
    });
    mockPrismaModel(t, "studentSkillLog", { findMany: async () => [] });
    mockPrismaModel(t, "formTemplate", { findFirst: async () => null });
    mockPrismaModel(t, "parentStudent", { findMany: async () => [] });

    const profile = await getStudentProfile(teacherC1, student1Id);
    assert.equal(profile.stats.attendancePct, 86);
    assert.equal(profile.stats.presentCount, 12);
    assert.equal(profile.stats.totalSessions, 14);
  });

  it("rejects non-positive fee payments and recalculates isFullyPaid when totalFees increases", async (t) => {
    mockPrismaModel(t, "student", {
      findUnique: async () => ({
        id: student1Id,
        centerId: center1Id,
        totalFees: 1000,
        feesPaid: 1000,
        isFullyPaid: true,
        feePayments: [],
        attendanceRecords: [],
        examScores: [],
        center: null,
        program: null,
        createdByUser: null,
      }),
    });

    await assert.rejects(() => addFeePayment(teacherC1, student1Id, 0), ValidationError);
    await assert.rejects(() => addFeePayment(teacherC1, student1Id, -25), ValidationError);

    let capturedUpdateData: Record<string, unknown> | null = null;
    mockPrismaTransaction(t, () => ({
      feePayment: {
        aggregate: async () => ({ _sum: { amount: 1000 } }),
      },
      student: {
        update: async (args: { data: Record<string, unknown> }) => {
          capturedUpdateData = args.data;
          return { id: student1Id, ...args.data };
        },
      },
    }));

    await updateStudentFees(teacherC1, student1Id, { totalFees: 2500 });
    assert.deepEqual(capturedUpdateData, { totalFees: 2500, isFullyPaid: false });
  });

  it("enforces center authorization on updateCareer and deleteCareer", async (t) => {
    mockPrismaModel(t, "formSubmission", {
      findUnique: async () => ({
        id: "sub-1",
        centerId: center1Id,
        studentId: student1Id,
      }),
    });

    await assert.rejects(() => updateCareer(teacherC2, "sub-1", { careerGoal: "Doc" }), ForbiddenError);
    await assert.rejects(() => deleteCareer(teacherC2, "sub-1"), ForbiddenError);
  });

  it("scopes requestTransfer by center instead of creator and preserves createdById on completeTransfer", async (t) => {
    let capturedRequestWhere: Record<string, unknown> | null = null;
    mockPrismaModel(t, "student", {
      findMany: async (args: { where: Record<string, unknown> }) => {
        capturedRequestWhere = args.where;
        return [{ id: student1Id }];
      },
      updateMany: async () => ({ count: 1 }),
    });

    const reqRes = await requestTransfer(teacherC1, [student1Id]);
    assert.equal(reqRes.updated, 1);
    assert.equal("createdById" in (capturedRequestWhere ?? {}), false);
    assert.deepEqual((capturedRequestWhere as Record<string, unknown>).centerId, { in: [center1Id] });

    const newTeacherId = "00000000-0000-4000-8000-000000000055";
    mockPrismaModel(t, "center", {
      findFirst: async () => ({ id: center2Id, isActive: true }),
    });
    mockPrismaModel(t, "user", {
      findFirst: async () => ({
        id: newTeacherId,
        role: ROLES.TEACHER,
        centerAssignments: [],
      }),
    });

    await assert.rejects(
      () => completeTransfer(superAdmin, [student1Id], newTeacherId, center2Id),
      ValidationError,
    );

    mockPrismaModel(t, "user", {
      findFirst: async () => ({
        id: newTeacherId,
        role: ROLES.TEACHER,
        centerAssignments: [{ id: "assign-1" }],
      }),
    });
    mockPrismaModel(t, "student", {
      findMany: async () => [{ id: student1Id, centerId: center1Id }],
    });

    let studentUpdatePayload: Record<string, unknown> | null = null;
    let recordedReason: string | null = null;
    mockPrismaTransaction(t, () => ({
      studentTransfer: {
        create: async (args: { data: { reason: string } }) => {
          recordedReason = args.data.reason;
          return args.data;
        },
      },
      student: {
        updateMany: async (args: { data: Record<string, unknown> }) => {
          studentUpdatePayload = args.data;
          return { count: 1 };
        },
      },
    }));

    const completeRes = await completeTransfer(
      superAdmin,
      [student1Id],
      newTeacherId,
      center2Id,
      "Moved to closer branch",
    );
    assert.equal(completeRes.transferred, 1);
    assert.equal(recordedReason, "Moved to closer branch");
    assert.equal("createdById" in (studentUpdatePayload ?? {}), false);
    assert.equal((studentUpdatePayload as Record<string, unknown>).centerId, center2Id);
  });

  it("normalizes isActive query string filters in getAllStudents", async (t) => {
    const wheres: Record<string, unknown>[] = [];
    mockPrismaModel(t, "student", {
      findMany: async (args: { where: Record<string, unknown> }) => {
        wheres.push(args.where);
        return [];
      },
      count: async () => 0,
    });

    await getAllStudents(superAdmin, { isActive: "false" });
    await getAllStudents(superAdmin, { isActive: "all" });

    assert.equal(wheres[0].isActive, false);
    assert.equal("isActive" in wheres[1], false);
  });
});
