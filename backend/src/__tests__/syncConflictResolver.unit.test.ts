import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { JwtPayload } from "../utils/jwt.js";
import { mockPrismaModel, mockPrismaTransaction } from "./helpers/mockPrisma.js";
import {
  resolveAttendanceRecordConflict,
  resolveExamScoreConflict,
  resolveThreeWayFieldMerge,
  STUDENT_SYNC_UPDATABLE_FIELDS,
} from "../services/syncConflictResolver.js";
import { pushSyncBatch } from "../services/syncService.js";
import type { SyncMutationItem } from "../types/sync.types.js";

const teacherUser: JwtPayload = {
  userId: "00000000-0000-4000-8000-000000000101",
  tenantId: "00000000-0000-0000-0000-000000000001",
  email: "teacher@edbase.test",
  role: "teacher",
  centerIds: ["00000000-0000-4000-8000-000000000201"],
  isActive: true,
};

const centerAdminUser: JwtPayload = {
  ...teacherUser,
  userId: "00000000-0000-4000-8000-000000000102",
  role: "center_admin",
};

const volunteerUser: JwtPayload = {
  ...teacherUser,
  userId: "00000000-0000-4000-8000-000000000103",
  role: "volunteer",
};

describe("Offline Sync: Hybrid Conflict Resolver", () => {
  it("auto-merges disjoint field edits on Student using 3-way merge", () => {
    // User A read v1 { guardianPhone: "111", address: "Old Rd" }
    // User B updated guardianPhone online -> v2 { guardianPhone: "222", address: "Old Rd" }
    // User A updated address offline -> { address: "New Ave" }
    const result = resolveThreeWayFieldMerge({
      serverRecord: {
        id: "s1",
        guardianPhone: "222",
        address: "Old Rd",
        version: 2,
        deletedAt: null,
      },
      serverVersion: 2,
      baseVersion: 1,
      baseSnapshot: { guardianPhone: "111", address: "Old Rd" },
      changedFields: { address: "New Ave" },
      allowedFields: STUDENT_SYNC_UPDATABLE_FIELDS,
    });

    assert.equal(result.status, "merged");
    if (result.status === "merged") {
      assert.deepEqual(result.fieldsToWrite, { address: "New Ave" });
      assert.deepEqual(result.autoMergedFields, ["address"]);
    }
  });

  it("flags FIELD_CONFLICT when both users modify the same Student field to different values", () => {
    const result = resolveThreeWayFieldMerge({
      serverRecord: {
        id: "s1",
        guardianPhone: "999-SERVER",
        address: "Old Rd",
        version: 2,
        deletedAt: null,
      },
      serverVersion: 2,
      baseVersion: 1,
      baseSnapshot: { guardianPhone: "111-BASE" },
      changedFields: { guardianPhone: "888-LOCAL" },
      allowedFields: STUDENT_SYNC_UPDATABLE_FIELDS,
    });

    assert.equal(result.status, "conflict");
    if (result.status === "conflict") {
      assert.equal(result.reason, "FIELD_CONFLICT");
      assert.deepEqual(result.conflictFields, ["guardianPhone"]);
    }
  });

  it("auto-wins when AttendanceRecord is pending on server and incoming status is definitive", () => {
    const result = resolveAttendanceRecordConflict({
      serverRecord: { id: "r1", status: "pending", remarks: null, version: 2 },
      serverVersion: 2,
      baseVersion: 1,
      baseSnapshot: { status: "pending", remarks: null },
      changedFields: { status: "present" },
    });

    assert.equal(result.status, "merged");
    if (result.status === "merged") {
      assert.deepEqual(result.fieldsToWrite, { status: "present" });
    }
  });

  it("flags conflict when two teachers submit different definitive attendance statuses", () => {
    const result = resolveAttendanceRecordConflict({
      serverRecord: { id: "r1", status: "absent", remarks: null, version: 2 },
      serverVersion: 2,
      baseVersion: 1,
      baseSnapshot: { status: "pending" },
      changedFields: { status: "present" },
    });

    assert.equal(result.status, "conflict");
    if (result.status === "conflict") {
      assert.deepEqual(result.conflictFields, ["status"]);
    }
  });

  it("rejects offline ExamScore edits with LOCKED_VERIFIED when exam or score is VERIFIED", () => {
    const locked = resolveExamScoreConflict({
      examStatus: "VERIFIED",
      serverRecord: { id: "sc1", marks: 85, isAbsent: false, status: "DRAFT", version: 1 },
      serverVersion: 1,
      baseVersion: 1,
      changedFields: { marks: 78 },
      forceOverwrite: true,
    });

    assert.equal(locked.status, "conflict");
    if (locked.status === "conflict") {
      assert.equal(locked.reason, "LOCKED_VERIFIED");
    }

    const draftConflict = resolveExamScoreConflict({
      examStatus: "DRAFT",
      serverRecord: { id: "sc1", marks: 85, isAbsent: false, remarks: null, status: "DRAFT", version: 2 },
      serverVersion: 2,
      baseVersion: 1,
      baseSnapshot: { marks: 70 },
      changedFields: { marks: 78 },
    });
    assert.equal(draftConflict.status, "conflict");
    if (draftConflict.status === "conflict") {
      assert.equal(draftConflict.reason, "FIELD_CONFLICT");
      assert.deepEqual(draftConflict.conflictFields, ["marks"]);
    }
  });
});

describe("Offline Sync: Batch Push Engine, Idempotency & Remapping", () => {
  it("deduplicates AttendanceSession by natural key and remaps child AttendanceRecord in same batch", async (t) => {
    const existingServerSessionId = "11111111-1111-4111-8111-111111111111";
    const offlineClientSessionId = "22222222-2222-4222-8222-222222222222";
    const offlineRecordId = "33333333-3333-4333-8333-333333333333";
    const studentId = "44444444-4444-4444-8444-444444444444";
    const createdRecords: Record<string, unknown>[] = [];
    const opLogs: Record<string, unknown>[] = [];

    mockPrismaModel(t, "syncOperationLog", {
      findUnique: async () => null,
    });

    mockPrismaTransaction(t, () => ({
      attendanceSession: {
        findFirst: async () => ({
          id: existingServerSessionId,
          centerId: teacherUser.centerIds[0],
          version: 1,
          records: [],
        }),
        findUnique: async ({ where }: { where: { id: string } }) =>
          where.id === existingServerSessionId
            ? { id: existingServerSessionId, centerId: teacherUser.centerIds[0], version: 1 }
            : null,
      },
      attendanceRecord: {
        findUnique: async () => null,
        create: async ({ data }: { data: Record<string, unknown> }) => {
          createdRecords.push(data);
          return { ...data, version: 1 };
        },
      },
      syncOperationLog: {
        create: async ({ data }: { data: Record<string, unknown> }) => {
          opLogs.push(data);
          return data;
        },
      },
    }));

    const batch: SyncMutationItem[] = [
      {
        operationId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1",
        entityType: "attendance_session",
        entityId: offlineClientSessionId,
        action: "CREATE",
        changedFields: {
          centerId: teacherUser.centerIds[0],
          sessionDate: "2026-11-20",
        },
        clientTimestamp: "2026-11-20T09:00:00.000Z",
        forceOverwrite: false,
      },
      {
        operationId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2",
        entityType: "attendance_record",
        entityId: offlineRecordId,
        action: "CREATE",
        changedFields: {
          sessionId: offlineClientSessionId,
          studentId,
          status: "present",
        },
        clientTimestamp: "2026-11-20T09:01:00.000Z",
        forceOverwrite: false,
      },
    ];

    const response = await pushSyncBatch(teacherUser, batch);
    assert.equal(response.results.length, 2);
    assert.equal(response.results[0].status, "deduplicated");
    assert.equal(response.results[0].remappedEntityId, existingServerSessionId);
    assert.equal(response.idRemaps[offlineClientSessionId], existingServerSessionId);
    assert.equal(response.results[1].status, "applied");
    assert.equal(createdRecords.length, 1);
    assert.equal(createdRecords[0].sessionId, existingServerSessionId);
    assert.equal(opLogs.length, 2);
  });

  it("enforces idempotency on repeated operationId and recomputes student fee totals on FeePayment", async (t) => {
    const studentId = "55555555-5555-4555-8555-555555555555";
    const paymentId = "66666666-6666-4666-8666-666666666666";
    const opId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1";
    const seenLogs = new Map<string, Record<string, unknown>>();
    let paymentCreateCount = 0;
    let studentFeeUpdatePayload: Record<string, unknown> | null = null;

    mockPrismaModel(t, "syncOperationLog", {
      findUnique: async ({ where }: { where: { operationId: string } }) =>
        seenLogs.get(where.operationId) ?? null,
    });

    mockPrismaTransaction(t, () => ({
      student: {
        findUnique: async () => ({
          id: studentId,
          centerId: centerAdminUser.centerIds[0],
          totalFees: 1000,
          feesPaid: 400,
          version: 1,
        }),
        update: async ({ data }: { data: Record<string, unknown> }) => {
          studentFeeUpdatePayload = data;
          return data;
        },
      },
      feePayment: {
        findFirst: async () => null,
        create: async ({ data }: { data: Record<string, unknown> }) => {
          paymentCreateCount += 1;
          return data;
        },
        aggregate: async () => ({ _sum: { amount: 1000 } }),
      },
      syncOperationLog: {
        create: async ({ data }: { data: Record<string, unknown> }) => {
          seenLogs.set(String(data.operationId), data);
          return data;
        },
      },
    }));

    const op: SyncMutationItem = {
      operationId: opId,
      entityType: "fee_payment",
      entityId: paymentId,
      action: "CREATE",
      changedFields: { studentId, amount: 600, notes: "Offline cash receipt" },
      clientTimestamp: "2026-11-20T10:00:00.000Z",
      forceOverwrite: false,
    };

    const first = await pushSyncBatch(centerAdminUser, [op]);
    assert.equal(first.results[0].status, "applied");
    assert.equal(paymentCreateCount, 1);
    assert.equal(studentFeeUpdatePayload?.feesPaid, 1000);
    assert.equal(studentFeeUpdatePayload?.isFullyPaid, true);

    // Retry exact same operationId -> must not double-charge
    const replay = await pushSyncBatch(centerAdminUser, [op]);
    assert.equal(replay.results[0].status, "applied");
    assert.equal(paymentCreateCount, 1);
  });

  it("isolates RBAC / validation errors without blocking later items in batch", async (t) => {
    mockPrismaModel(t, "syncOperationLog", {
      findUnique: async () => null,
    });
    mockPrismaTransaction(t, () => ({
      formSubmission: {
        findUnique: async () => null,
        create: async ({ data }: { data: Record<string, unknown> }) => ({ ...data, version: 1 }),
      },
      syncOperationLog: {
        create: async ({ data }: { data: Record<string, unknown> }) => data,
      },
    }));

    const batch: SyncMutationItem[] = [
      {
        operationId: "cccccccc-cccc-4ccc-8ccc-ccccccccccc1",
        entityType: "student",
        entityId: "77777777-7777-4777-8777-777777777777",
        action: "CREATE",
        changedFields: { centerId: volunteerUser.centerIds[0], fullName: "Blocked" },
        clientTimestamp: "2026-11-20T10:00:00.000Z",
        forceOverwrite: false,
      },
      {
        operationId: "cccccccc-cccc-4ccc-8ccc-ccccccccccc2",
        entityType: "form_submission",
        entityId: "88888888-8888-4888-8888-888888888888",
        action: "CREATE",
        changedFields: {
          templateId: "99999999-9999-4999-8999-999999999999",
          centerId: volunteerUser.centerIds[0],
          data: { note: "Allowed form" },
        },
        clientTimestamp: "2026-11-20T10:01:00.000Z",
        forceOverwrite: false,
      },
    ];

    const res = await pushSyncBatch(volunteerUser, batch);
    assert.equal(res.results[0].status, "error");
    assert.match(res.results[0].errorMessage ?? "", /permission/i);
    assert.equal(res.results[1].status, "applied");
  });
});
