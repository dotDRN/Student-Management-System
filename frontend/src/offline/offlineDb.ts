import Dexie, { type Table } from "dexie";
import type { OutboxItem, SyncConflictItem } from "./syncTypes";

export interface SyncMetaRecord {
  key: string;
  value: string;
}

export interface LocalEntityRecord {
  id: string;
  centerId?: string | null;
  programId?: string | null;
  studentId?: string | null;
  sessionId?: string | null;
  examId?: string | null;
  templateId?: string | null;
  version?: number;
  updatedAt?: string;
  deletedAt?: string | null;
  [key: string]: unknown;
}

export class EdBaseOfflineDb extends Dexie {
  centers!: Table<LocalEntityRecord, string>;
  programs!: Table<LocalEntityRecord, string>;
  programSubjects!: Table<LocalEntityRecord, string>;
  academicYears!: Table<LocalEntityRecord, string>;
  batches!: Table<LocalEntityRecord, string>;
  batchEnrollments!: Table<LocalEntityRecord, string>;
  students!: Table<LocalEntityRecord, string>;
  feePayments!: Table<LocalEntityRecord, string>;
  attendanceSessions!: Table<LocalEntityRecord, string>;
  attendanceRecords!: Table<LocalEntityRecord, string>;
  exams!: Table<LocalEntityRecord, string>;
  examScores!: Table<LocalEntityRecord, string>;
  skillDefinitions!: Table<LocalEntityRecord, string>;
  skillLogs!: Table<LocalEntityRecord, string>;
  formTemplates!: Table<LocalEntityRecord, string>;
  formSubmissions!: Table<LocalEntityRecord, string>;
  syncMeta!: Table<SyncMetaRecord, string>;
  syncOutbox!: Table<OutboxItem, string>;
  syncConflicts!: Table<SyncConflictItem, string>;

  constructor(dbName: string) {
    super(dbName);
    this.version(1).stores({
      centers: "id, name, updatedAt",
      programs: "id, code, name, updatedAt",
      programSubjects: "id, programId, name",
      academicYears: "id, label, isCurrent",
      batches: "id, centerId, activityId, name",
      batchEnrollments: "id, batchId, studentId",
      students: "id, centerId, programId, academicYearId, fullName, rollNumber, isActive, updatedAt",
      feePayments: "id, studentId, paidAt, clientOperationId",
      attendanceSessions: "id, centerId, programId, batchId, sessionDate, updatedAt",
      attendanceRecords: "id, sessionId, studentId, centerId, status, updatedAt",
      exams: "id, centerId, programId, academicYearId, examType, examDate, updatedAt",
      examScores: "id, examId, studentId, subjectId, centerId, updatedAt",
      skillDefinitions: "id, programId, name, isActive",
      skillLogs: "id, studentId, centerId, skillId, assessedOn, updatedAt",
      formTemplates: "id, centerId, formType, isActive, updatedAt",
      formSubmissions: "id, templateId, studentId, centerId, submittedAt, updatedAt",
      syncMeta: "key",
      syncOutbox: "operationId, entityType, entityId, status, clientTimestamp",
      syncConflicts: "id, operationId, entityType, entityId, createdAt",
    });
  }
}

let activeDb: EdBaseOfflineDb | null = null;
let activeDbKey: string | null = null;

function sanitizeSegment(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 48);
}

/**
 * Returns a Dexie database partitioned per tenant + user so shared devices
 * (school tablets, lab PCs) never leak cached records or outbox items across accounts.
 */
export function getOfflineDb(
  tenantId?: string | null,
  userId?: string | null,
): EdBaseOfflineDb | null {
  if (typeof indexedDB === "undefined") {
    return null;
  }

  const key = `${sanitizeSegment(tenantId || "default")}_${sanitizeSegment(userId || "anon")}`;
  if (activeDb && activeDbKey === key) {
    return activeDb;
  }

  if (activeDb) {
    activeDb.close();
  }

  activeDbKey = key;
  activeDb = new EdBaseOfflineDb(`edbase_offline_${key}`);
  return activeDb;
}

export function closeOfflineDb(): void {
  if (activeDb) {
    activeDb.close();
    activeDb = null;
    activeDbKey = null;
  }
}

export async function requestPersistentStorage(): Promise<boolean> {
  try {
    if (
      typeof navigator !== "undefined" &&
      navigator.storage &&
      typeof navigator.storage.persist === "function"
    ) {
      return await navigator.storage.persist();
    }
  } catch {
    // Ignore unsupported browsers
  }
  return false;
}

export async function getPendingLocalSyncCounts(
  tenantId?: string | null,
  userId?: string | null,
): Promise<{ pending: number; conflicts: number }> {
  const db = getOfflineDb(tenantId, userId);
  if (!db) return { pending: 0, conflicts: 0 };
  try {
    const [pending, conflicts] = await Promise.all([
      db.syncOutbox.count(),
      db.syncConflicts.count(),
    ]);
    return { pending, conflicts };
  } catch {
    return { pending: 0, conflicts: 0 };
  }
}
