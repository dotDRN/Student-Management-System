import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  computeFieldDiff,
  generateClientUuid,
  remapOutboxReferences,
  sortOutboxCausally,
} from "../src/offline/outboxHelpers.ts";
import type { OutboxItem } from "../src/offline/syncTypes.ts";

describe("Offline Sync Frontend Helpers: Field Diff, Causal Ordering & ID Remapping", () => {
  it("computes minimal changedFields and baseSnapshot for 3-way merge", () => {
    const base = {
      id: "s1",
      fullName: "Aarav Sharma",
      guardianPhone: "9876543210",
      address: "12 Old Lane",
      version: 2,
    };

    const { baseSnapshot, changedFields } = computeFieldDiff(base, {
      fullName: "Aarav Sharma", // unchanged
      guardianPhone: "9876543210", // unchanged
      address: "45 New Street", // changed
    });

    assert.deepEqual(changedFields, { address: "45 New Street" });
    assert.deepEqual(baseSnapshot, { address: "12 Old Lane" });
  });

  it("sorts outbox mutations causally (parent CREATEs before dependent child writes)", () => {
    const items: OutboxItem[] = [
      {
        operationId: "op-child-fee",
        entityType: "fee_payment",
        entityId: "fee-1",
        action: "CREATE",
        changedFields: { studentId: "stu-1", amount: 500 },
        clientTimestamp: "2026-11-20T09:00:01.000Z",
        attempts: 0,
        status: "pending",
      },
      {
        operationId: "op-child-att",
        entityType: "attendance_record",
        entityId: "rec-1",
        action: "CREATE",
        changedFields: { sessionId: "sess-1", studentId: "stu-1", status: "present" },
        clientTimestamp: "2026-11-20T09:00:02.000Z",
        attempts: 0,
        status: "pending",
      },
      {
        operationId: "op-parent-session",
        entityType: "attendance_session",
        entityId: "sess-1",
        action: "CREATE",
        changedFields: { centerId: "c1", sessionDate: "2026-11-20" },
        clientTimestamp: "2026-11-20T09:00:03.000Z",
        attempts: 0,
        status: "pending",
      },
      {
        operationId: "op-parent-student",
        entityType: "student",
        entityId: "stu-1",
        action: "CREATE",
        changedFields: { centerId: "c1", fullName: "Offline Student" },
        clientTimestamp: "2026-11-20T09:00:04.000Z",
        attempts: 0,
        status: "pending",
      },
    ];

    const sorted = sortOutboxCausally(items);
    assert.deepEqual(
      sorted.map((i) => i.operationId),
      ["op-parent-student", "op-parent-session", "op-child-fee", "op-child-att"],
    );
  });

  it("remaps temporary/deduplicated sessionId & studentId across queued mutations", () => {
    const queued: OutboxItem[] = [
      {
        operationId: "op-1",
        entityType: "attendance_record",
        entityId: "rec-1",
        action: "CREATE",
        changedFields: {
          sessionId: "temp-session-uuid",
          studentId: "temp-student-uuid",
          status: "present",
        },
        clientTimestamp: "2026-11-20T10:00:00.000Z",
        attempts: 0,
        status: "pending",
      },
      {
        operationId: "op-2",
        entityType: "attendance_session",
        entityId: "temp-session-uuid",
        action: "UPDATE",
        changedFields: { isHoliday: true },
        clientTimestamp: "2026-11-20T10:05:00.000Z",
        attempts: 0,
        status: "pending",
      },
    ];

    const remapped = remapOutboxReferences(queued, {
      "temp-session-uuid": "canonical-server-session-uuid",
      "temp-student-uuid": "canonical-server-student-uuid",
    });

    assert.equal(remapped[0].changedFields.sessionId, "canonical-server-session-uuid");
    assert.equal(remapped[0].changedFields.studentId, "canonical-server-student-uuid");
    assert.equal(remapped[1].entityId, "canonical-server-session-uuid");
  });

  it("generates valid RFC4122 v4 UUIDs offline", () => {
    const id1 = generateClientUuid();
    const id2 = generateClientUuid();
    const uuidV4Regex =
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    assert.match(id1, uuidV4Regex);
    assert.match(id2, uuidV4Regex);
    assert.notEqual(id1, id2);
  });
});
