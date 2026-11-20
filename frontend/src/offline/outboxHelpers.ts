import type { OutboxItem, SyncEntityType } from "./syncTypes";

/**
 * Generates an RFC4122 v4 UUID safely across browsers and Node test environments.
 */
export function generateClientUuid(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function normalizeForDiff(value: unknown): unknown {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value === "string") return value.trim();
  return value;
}

/**
 * Computes minimal changed fields + baseSnapshot from the local cached entity
 * so the backend 3-way field merger can auto-merge disjoint concurrent edits.
 */
export function computeFieldDiff(
  baseRecord: Record<string, unknown> | null | undefined,
  nextPayload: Record<string, unknown>,
): {
  baseSnapshot: Record<string, unknown>;
  changedFields: Record<string, unknown>;
} {
  const baseSnapshot: Record<string, unknown> = {};
  const changedFields: Record<string, unknown> = {};

  for (const [key, nextVal] of Object.entries(nextPayload)) {
    if (nextVal === undefined) continue;
    if (!baseRecord) {
      changedFields[key] = nextVal;
      continue;
    }
    const prevVal = baseRecord[key];
    const normPrev = normalizeForDiff(prevVal);
    const normNext = normalizeForDiff(nextVal);
    if (JSON.stringify(normPrev) !== JSON.stringify(normNext)) {
      baseSnapshot[key] = prevVal ?? null;
      changedFields[key] = nextVal;
    }
  }

  return { baseSnapshot, changedFields };
}

const CAUSAL_ENTITY_PRIORITY: Record<SyncEntityType, number> = {
  student: 1,
  attendance_session: 2,
  exam: 2,
  fee_payment: 3,
  attendance_record: 3,
  exam_score: 3,
  skill_log: 3,
  form_submission: 3,
};

/**
 * Orders outbox mutations causally so parent records (e.g., offline-created Student
 * or AttendanceSession) are created before dependent child writes, while preserving
 * chronological FIFO ordering within each priority tier.
 */
export function sortOutboxCausally(items: OutboxItem[]): OutboxItem[] {
  return [...items].sort((a, b) => {
    // CREATEs of parent entities must run before dependent child mutations
    const prioA = a.action === "CREATE" ? CAUSAL_ENTITY_PRIORITY[a.entityType] : 4;
    const prioB = b.action === "CREATE" ? CAUSAL_ENTITY_PRIORITY[b.entityType] : 4;
    if (prioA !== prioB) return prioA - prioB;
    return a.clientTimestamp.localeCompare(b.clientTimestamp);
  });
}

const REFERENCE_FIELDS = ["sessionId", "studentId", "examId"] as const;

/**
 * Rewrites temporary/deduplicated client UUIDs in remaining queued mutations
 * after the server returns `idRemaps` (for example when two teachers created
 * today's AttendanceSession offline and the server deduplicated them).
 */
export function remapOutboxReferences(
  items: OutboxItem[],
  idRemaps: Record<string, string>,
): OutboxItem[] {
  if (!idRemaps || Object.keys(idRemaps).length === 0) return items;

  return items.map((item) => {
    let changed = false;
    let nextEntityId = item.entityId;
    if (idRemaps[item.entityId]) {
      nextEntityId = idRemaps[item.entityId];
      changed = true;
    }

    const nextFields: Record<string, unknown> = { ...item.changedFields };
    for (const refKey of REFERENCE_FIELDS) {
      const val = nextFields[refKey];
      if (typeof val === "string" && idRemaps[val]) {
        nextFields[refKey] = idRemaps[val];
        changed = true;
      }
    }

    return changed
      ? {
          ...item,
          entityId: nextEntityId,
          changedFields: nextFields,
        }
      : item;
  });
}
