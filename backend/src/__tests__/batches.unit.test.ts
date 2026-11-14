import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ROLES } from "../config/rbac.js";
import {
  ConflictError,
  ForbiddenError,
  ValidationError,
} from "../lib/errors.js";
import { getTodayFreshSheet } from "../services/attendanceService.js";
import {
  createBatch,
  deleteBatch,
  enrollStudentsInBatch,
  removeStudentFromBatch,
  updateBatch,
} from "../services/batchService.js";
import { getExamSheet } from "../services/examService.js";
import { getSkillMatrix } from "../services/skillService.js";
import { getAllStudents } from "../services/student.service.js";
import {
  createBatchSchema,
  enrollBatchStudentsSchema,
} from "../validators/schemas.js";
import { mockPrismaModel, mockPrismaTransaction } from "./helpers/mockPrisma.js";

const CENTER_1 = "11111111-1111-4111-8111-111111111111";
const CENTER_2 = "22222222-2222-4222-8222-222222222222";
const PROGRAM_1 = "33333333-3333-4333-8333-333333333333";
const PROGRAM_2 = "44444444-4444-4444-8444-444444444444";
const ACTIVITY_1 = "55555555-5555-4555-8555-555555555555";
const BATCH_1 = "66666666-6666-4666-8666-666666666666";
const STUDENT_1 = "77777777-7777-4777-8777-777777777777";
const STUDENT_2 = "88888888-8888-4888-8888-888888888888";

const adminUser = {
  userId: "admin-1",
  role: ROLES.CENTER_ADMIN,
  centerIds: [CENTER_1],
};

const teacherUser = {
  userId: "teacher-1",
  role: ROLES.TEACHER,
  centerIds: [CENTER_1],
};

describe("batches unit tests", () => {
  it("validates batch and enrollment Zod schemas", () => {
    assert.equal(
      createBatchSchema.safeParse({ centerId: CENTER_1, name: "Morning Batch" }).success,
      false,
    );
    assert.equal(
      createBatchSchema.safeParse({
        centerId: CENTER_1,
        programId: PROGRAM_1,
        name: "Morning Batch",
        maxStudents: 30,
      }).success,
      true,
    );
    assert.equal(
      enrollBatchStudentsSchema.safeParse({ studentIds: [] }).success,
      false,
    );
  });

  it("creates a batch by auto-provisioning a backing class activity from programId and blocks duplicates", async (t) => {
    let createdActivityPayload: Record<string, unknown> | null = null;
    let createdBatchPayload: Record<string, unknown> | null = null;

    await assert.rejects(
      () =>
        createBatch(teacherUser, {
          centerId: CENTER_2,
          programId: PROGRAM_1,
          name: "Batch X",
        }),
      ForbiddenError,
    );

    mockPrismaModel(t, "center", {
      findFirst: async () => ({ id: CENTER_1, isActive: true }),
    });
    mockPrismaModel(t, "program", {
      findFirst: async () => ({ id: PROGRAM_1, name: "Saksham" }),
    });
    mockPrismaModel(t, "activity", {
      findFirst: async () => null,
      create: async (args: { data: Record<string, unknown> }) => {
        createdActivityPayload = args.data;
        return { id: ACTIVITY_1 };
      },
    });
    mockPrismaModel(t, "batch", {
      findFirst: async () => null,
      create: async (args: { data: Record<string, unknown> }) => {
        createdBatchPayload = args.data;
        return { id: BATCH_1, ...args.data };
      },
    });

    const created = await createBatch(adminUser, {
      centerId: CENTER_1,
      programId: PROGRAM_1,
      name: "Morning Batch A",
      maxStudents: 25,
    });

    assert.equal((created as { id: string }).id, BATCH_1);
    assert.equal(createdActivityPayload?.activityType, "class");
    assert.equal(createdActivityPayload?.programId, PROGRAM_1);
    assert.equal(createdBatchPayload?.activityId, ACTIVITY_1);
    assert.equal(createdBatchPayload?.maxStudents, 25);

    // Duplicate name inside same center + activity
    mockPrismaModel(t, "activity", {
      findFirst: async () => ({ id: ACTIVITY_1, centerId: CENTER_1, programId: PROGRAM_1 }),
    });
    mockPrismaModel(t, "batch", {
      findFirst: async () => ({ id: BATCH_1 }),
    });

    await assert.rejects(
      () =>
        createBatch(adminUser, {
          centerId: CENTER_1,
          activityId: ACTIVITY_1,
          name: "morning batch a",
        }),
      ConflictError,
    );
  });

  it("enforces maxStudents floor on updateBatch and attendance session guard on deleteBatch", async (t) => {
    mockPrismaModel(t, "batch", {
      findUnique: async () => ({
        id: BATCH_1,
        centerId: CENTER_1,
        activityId: ACTIVITY_1,
        name: "Morning",
        _count: { batchEnrollments: 12, attendanceSessions: 3 },
      }),
    });

    await assert.rejects(
      () => updateBatch(adminUser, BATCH_1, { maxStudents: 10 }),
      ValidationError,
    );

    await assert.rejects(
      () => deleteBatch(teacherUser, BATCH_1),
      ForbiddenError,
    );

    await assert.rejects(
      () => deleteBatch(adminUser, BATCH_1),
      ConflictError,
    );

    // Clean delete when attendanceSessions === 0
    const ops: string[] = [];
    mockPrismaModel(t, "batch", {
      findUnique: async () => ({
        id: BATCH_1,
        centerId: CENTER_1,
        _count: { attendanceSessions: 0, batchEnrollments: 2 },
      }),
    });
    mockPrismaTransaction(t, () => ({
      batchEnrollment: {
        deleteMany: async () => {
          ops.push("deleteEnrollments");
          return { count: 2 };
        },
      },
      batch: {
        delete: async () => {
          ops.push("deleteBatch");
          return { id: BATCH_1 };
        },
      },
    }));

    const res = await deleteBatch(adminUser, BATCH_1);
    assert.equal(res.deleted, true);
    assert.deepEqual(ops, ["deleteEnrollments", "deleteBatch"]);
  });

  it("validates center, program, capacity, and deduplication on batch enrollment", async (t) => {
    mockPrismaModel(t, "batch", {
      findUnique: async () => ({
        id: BATCH_1,
        centerId: CENTER_1,
        maxStudents: 2,
        activity: { id: ACTIVITY_1, programId: PROGRAM_1 },
      }),
    });
    mockPrismaModel(t, "student", {
      findMany: async () => [
        { id: STUDENT_1, fullName: "S1", centerId: CENTER_1, programId: PROGRAM_2, isActive: true },
      ],
    });

    // Program mismatch rejected
    await assert.rejects(
      () => enrollStudentsInBatch(adminUser, BATCH_1, [STUDENT_1]),
      ValidationError,
    );

    // Capacity exceeded rejected (1 existing + 2 new > maxStudents 2)
    mockPrismaModel(t, "student", {
      findMany: async () => [
        { id: STUDENT_1, fullName: "S1", centerId: CENTER_1, programId: PROGRAM_1, isActive: true },
        { id: STUDENT_2, fullName: "S2", centerId: CENTER_1, programId: PROGRAM_1, isActive: true },
      ],
    });
    mockPrismaModel(t, "batchEnrollment", {
      findMany: async () => [{ studentId: "99999999-9999-4999-8999-999999999999" }],
    });

    await assert.rejects(
      () => enrollStudentsInBatch(adminUser, BATCH_1, [STUDENT_1, STUDENT_2]),
      ValidationError,
    );

    // Succeeds within capacity and deduplicates
    const insertedRows: Array<{ batchId: string; studentId: string }> = [];
    mockPrismaModel(t, "batchEnrollment", {
      findMany: async () => [{ studentId: STUDENT_1 }],
      createMany: async (args: { data: Array<{ batchId: string; studentId: string }> }) => {
        insertedRows.push(...args.data);
        return { count: args.data.length };
      },
      findUnique: async () => ({ id: "be-1" }),
      delete: async () => ({ id: "be-1" }),
    });
    mockPrismaModel(t, "batch", {
      findUnique: async () => ({
        id: BATCH_1,
        centerId: CENTER_1,
        maxStudents: 2,
        activity: { id: ACTIVITY_1, programId: PROGRAM_1 },
        batchEnrollments: [],
      }),
    });

    const enrollRes = await enrollStudentsInBatch(adminUser, BATCH_1, [STUDENT_1, STUDENT_2]);
    assert.equal(enrollRes.addedCount, 1);
    assert.equal(enrollRes.alreadyEnrolledCount, 1);
    assert.equal(insertedRows.length, 1);
    assert.equal(insertedRows[0].studentId, STUDENT_2);

    const rmRes = await removeStudentFromBatch(adminUser, BATCH_1, STUDENT_2);
    assert.equal(rmRes.removed, true);
  });

  it("applies optional batchId filter across students, attendance, skills, and exam sheets", async (t) => {
    const capturedWheres: Array<{ source: string; where: Record<string, unknown> }> = [];

    mockPrismaModel(t, "student", {
      findMany: async (args: { where: Record<string, unknown> }) => {
        capturedWheres.push({ source: "student.findMany", where: args.where });
        return [];
      },
      count: async () => 0,
    });
    mockPrismaModel(t, "skillDefinition", {
      findMany: async () => [],
    });
    mockPrismaModel(t, "programSubject", {
      findMany: async () => [],
    });
    mockPrismaModel(t, "exam", {
      findUnique: async () => ({
        id: "ex-1",
        centerId: CENTER_1,
        programId: PROGRAM_1,
      }),
    });
    mockPrismaModel(t, "examScore", {
      findMany: async () => [],
    });
    mockPrismaModel(t, "batch", {
      findUnique: async () => ({
        id: BATCH_1,
        centerId: CENTER_1,
        activity: { programId: PROGRAM_1 },
      }),
    });
    mockPrismaModel(t, "attendanceSession", {
      findFirst: async () => ({ id: "sess-1", centerId: CENTER_1, programId: PROGRAM_1, batchId: BATCH_1 }),
    });
    mockPrismaModel(t, "attendanceRecord", {
      findMany: async () => [],
    });

    await getAllStudents(adminUser, { batchId: BATCH_1 });
    await getSkillMatrix(adminUser, { centerId: CENTER_1, programId: PROGRAM_1, batchId: BATCH_1 });
    await getExamSheet(adminUser, "ex-1", BATCH_1);
    await getTodayFreshSheet(adminUser, CENTER_1, PROGRAM_1, BATCH_1);

    assert.equal(capturedWheres.length, 4);
    for (const item of capturedWheres) {
      assert.deepEqual(item.where.batchEnrollments, { some: { batchId: BATCH_1 } }, item.source);
    }
  });
});
