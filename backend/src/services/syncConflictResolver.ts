import type { SyncConflictReason } from "../types/sync.types.js";

export type ThreeWayMergeResult =
  | {
      status: "applied" | "merged";
      fieldsToWrite: Record<string, unknown>;
      autoMergedFields: string[];
    }
  | {
      status: "conflict";
      reason: SyncConflictReason;
      conflictFields: string[];
    };

/**
 * Normalizes values from Prisma (Decimal, Date, null/undefined) and JSON payloads
 * so semantic equality checks don't false-positive on format differences.
 */
export function normalizeComparableValue(val: unknown): unknown {
  if (val === undefined || val === null || val === "") {
    return null;
  }
  if (val instanceof Date) {
    return val.toISOString().slice(0, 10);
  }
  // Prisma Decimal duck-typing
  if (
    typeof val === "object" &&
    val !== null &&
    typeof (val as { toNumber?: unknown }).toNumber === "function"
  ) {
    return Number((val as { toNumber: () => number }).toNumber());
  }
  if (typeof val === "string") {
    // ISO date or timestamp string: compare YYYY-MM-DD if date-like
    if (/^\d{4}-\d{2}-\d{2}T00:00:00(\.000)?Z$/.test(val)) {
      return val.slice(0, 10);
    }
    const trimmed = val.trim();
    if (trimmed === "") return null;
    // Compare numeric strings like "85.00" vs 85 uniformly when appropriate?
    // Keep string unless explicitly numeric decimal formatting from Decimal.toString()
    return trimmed;
  }
  return val;
}

export function areValuesSemanticallyEqual(a: unknown, b: unknown): boolean {
  const na = normalizeComparableValue(a);
  const nb = normalizeComparableValue(b);
  if (na === nb) return true;

  // Handle Decimal string vs number (e.g. "85.00" vs 85)
  if (
    (typeof na === "number" || (typeof na === "string" && /^-?\d+(\.\d+)?$/.test(na))) &&
    (typeof nb === "number" || (typeof nb === "string" && /^-?\d+(\.\d+)?$/.test(nb)))
  ) {
    return Number(na) === Number(nb);
  }

  if (typeof na === "object" && typeof nb === "object" && na !== null && nb !== null) {
    return JSON.stringify(na) === JSON.stringify(nb);
  }
  return false;
}

/**
 * Performs Optimistic Concurrency Control + Field-Level 3-Way Merge.
 *
 * Rules:
 * - If serverRecord.deletedAt is set and !forceOverwrite -> RECORD_DELETED conflict.
 * - If serverRecord.version === baseVersion OR forceOverwrite -> direct apply.
 * - If server moved ahead (serverVersion > baseVersion):
 *   - Without baseSnapshot, we cannot safely 3-way merge -> check if all incoming fields
 *     already match server (convergent), else return conflict on non-matching fields.
 *   - With baseSnapshot, for every key in changedFields:
 *     - If serverValue === incomingValue -> convergent (no conflict).
 *     - If serverValue === baseValue -> server did NOT touch this field -> safe auto-merge!
 *     - Otherwise -> both client and server modified this exact field differently -> conflict!
 */
export function resolveThreeWayFieldMerge(params: {
  serverRecord: Record<string, unknown>;
  serverVersion: number;
  baseVersion?: number;
  baseSnapshot?: Record<string, unknown>;
  changedFields: Record<string, unknown>;
  allowedFields: readonly string[];
  forceOverwrite?: boolean;
}): ThreeWayMergeResult {
  const {
    serverRecord,
    serverVersion,
    baseVersion,
    baseSnapshot,
    changedFields,
    allowedFields,
    forceOverwrite = false,
  } = params;

  const allowedSet = new Set(allowedFields);
  const filteredChanges: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(changedFields)) {
    if (allowedSet.has(key)) {
      filteredChanges[key] = value;
    }
  }

  if (serverRecord.deletedAt && !forceOverwrite) {
    return {
      status: "conflict",
      reason: "RECORD_DELETED",
      conflictFields: Object.keys(filteredChanges),
    };
  }

  if (forceOverwrite || (typeof baseVersion === "number" && serverVersion === baseVersion)) {
    return {
      status: "applied",
      fieldsToWrite: filteredChanges,
      autoMergedFields: [],
    };
  }

  // Version mismatch: attempt field-level 3-way merge
  const conflictFields: string[] = [];
  const fieldsToWrite: Record<string, unknown> = {};
  const autoMergedFields: string[] = [];

  for (const [field, incomingVal] of Object.entries(filteredChanges)) {
    const serverVal = serverRecord[field];

    // Convergent edit: both sides set the exact same value
    if (areValuesSemanticallyEqual(serverVal, incomingVal)) {
      continue;
    }

    if (baseSnapshot && Object.prototype.hasOwnProperty.call(baseSnapshot, field)) {
      const baseVal = baseSnapshot[field];
      if (areValuesSemanticallyEqual(serverVal, baseVal)) {
        // Server did not modify this field since client read it -> safe to auto-merge
        fieldsToWrite[field] = incomingVal;
        autoMergedFields.push(field);
      } else {
        // Both client and server modified this field to different values -> true conflict
        conflictFields.push(field);
      }
    } else {
      // No baseSnapshot available for this field while version diverged
      conflictFields.push(field);
    }
  }

  if (conflictFields.length > 0) {
    return {
      status: "conflict",
      reason: "FIELD_CONFLICT",
      conflictFields,
    };
  }

  return {
    status: "merged",
    fieldsToWrite,
    autoMergedFields,
  };
}

const DEFINITIVE_ATTENDANCE_STATUSES = new Set([
  "present",
  "absent",
  "late",
  "excused",
]);

/**
 * AttendanceRecord hybrid resolver:
 * - Pending -> Definitive status auto-wins (teachers marking previously unmarked students).
 * - Concurrent differing definitive statuses at newer version -> conflict for review.
 * - Disjoint remarks vs status edits -> 3-way auto-merge.
 */
export function resolveAttendanceRecordConflict(params: {
  serverRecord: Record<string, unknown>;
  serverVersion: number;
  baseVersion?: number;
  baseSnapshot?: Record<string, unknown>;
  changedFields: Record<string, unknown>;
  forceOverwrite?: boolean;
}): ThreeWayMergeResult {
  const {
    serverRecord,
    serverVersion,
    baseVersion,
    baseSnapshot,
    changedFields,
    forceOverwrite = false,
  } = params;

  if (forceOverwrite || (typeof baseVersion === "number" && serverVersion === baseVersion)) {
    const fieldsToWrite: Record<string, unknown> = {};
    if ("status" in changedFields) fieldsToWrite.status = changedFields.status;
    if ("remarks" in changedFields) fieldsToWrite.remarks = changedFields.remarks;
    return {
      status: "applied",
      fieldsToWrite,
      autoMergedFields: [],
    };
  }

  // Priority rule: if server is still 'pending' and incoming is definitive, auto-apply status
  const serverStatus = String(serverRecord.status ?? "pending");
  const incomingStatus =
    typeof changedFields.status === "string" ? changedFields.status : undefined;

  const adjustedBaseSnapshot: Record<string, unknown> = { ...(baseSnapshot ?? {}) };
  if (
    serverStatus === "pending" &&
    incomingStatus &&
    DEFINITIVE_ATTENDANCE_STATUSES.has(incomingStatus)
  ) {
    adjustedBaseSnapshot.status = "pending";
  }

  return resolveThreeWayFieldMerge({
    serverRecord,
    serverVersion,
    baseVersion,
    baseSnapshot: adjustedBaseSnapshot,
    changedFields,
    allowedFields: ["status", "remarks"],
    forceOverwrite,
  });
}

/**
 * ExamScore hybrid resolver:
 * - Workflow lock: if parent Exam or ExamScore is VERIFIED, reject offline mutations
 *   (LOCKED_VERIFIED) so verified marks are never silently overwritten.
 * - Otherwise perform 3-way merge on ['marks', 'isAbsent', 'remarks'].
 */
export function resolveExamScoreConflict(params: {
  examStatus: string;
  serverRecord: Record<string, unknown> | null;
  serverVersion: number;
  baseVersion?: number;
  baseSnapshot?: Record<string, unknown>;
  changedFields: Record<string, unknown>;
  forceOverwrite?: boolean;
}): ThreeWayMergeResult {
  const {
    examStatus,
    serverRecord,
    serverVersion,
    baseVersion,
    baseSnapshot,
    changedFields,
    forceOverwrite = false,
  } = params;

  const serverScoreStatus = serverRecord ? String(serverRecord.status ?? "DRAFT") : "DRAFT";

  if (examStatus === "VERIFIED" || serverScoreStatus === "VERIFIED") {
    return {
      status: "conflict",
      reason: "LOCKED_VERIFIED",
      conflictFields: Object.keys(changedFields).length > 0 ? Object.keys(changedFields) : ["marks"],
    };
  }

  if (!serverRecord) {
    return {
      status: "applied",
      fieldsToWrite: changedFields,
      autoMergedFields: [],
    };
  }

  return resolveThreeWayFieldMerge({
    serverRecord,
    serverVersion,
    baseVersion,
    baseSnapshot,
    changedFields,
    allowedFields: ["marks", "isAbsent", "remarks"],
    forceOverwrite,
  });
}

export const STUDENT_SYNC_UPDATABLE_FIELDS = [
  "fullName",
  "rollNumber",
  "dob",
  "gender",
  "guardianName",
  "guardianPhone",
  "address",
  "stream",
  "post12thChoice",
  "collegeName",
  "educationDiscontinued",
  "academicYearId",
  "totalFees",
  "isActive",
] as const;

export const SKILL_LOG_SYNC_UPDATABLE_FIELDS = [
  "level",
  "remarks",
  "assessedOn",
] as const;
