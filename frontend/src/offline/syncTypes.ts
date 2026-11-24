export type SyncEntityType =
  | "student"
  | "fee_payment"
  | "attendance_session"
  | "attendance_record"
  | "exam"
  | "exam_score"
  | "skill_log"
  | "form_submission";

export type SyncAction = "CREATE" | "UPDATE" | "DELETE";

export type SyncItemResultStatus =
  | "applied"
  | "merged"
  | "deduplicated"
  | "conflict"
  | "error";

export type SyncConflictReason =
  | "FIELD_CONFLICT"
  | "VERSION_MISMATCH"
  | "LOCKED_VERIFIED"
  | "RECORD_DELETED";

export interface OutboxItem {
  operationId: string;
  entityType: SyncEntityType;
  entityId: string;
  entityLabel?: string;
  action: SyncAction;
  baseVersion?: number;
  baseSnapshot?: Record<string, unknown>;
  changedFields: Record<string, unknown>;
  clientTimestamp: string;
  forceOverwrite?: boolean;
  attempts: number;
  status: "pending" | "failed";
  lastError?: string | null;
}

export interface SyncConflictItem {
  id: string;
  operationId: string;
  entityType: SyncEntityType;
  entityId: string;
  entityLabel: string;
  action: SyncAction;
  localChanges: Record<string, unknown>;
  baseSnapshot?: Record<string, unknown>;
  serverRecord: Record<string, unknown> | null;
  conflictFields: string[];
  reason: SyncConflictReason;
  createdAt: string;
}

export interface SyncPushItemResult {
  operationId: string;
  entityType: SyncEntityType;
  entityId: string;
  remappedEntityId?: string;
  status: SyncItemResultStatus;
  newVersion?: number;
  serverRecord?: Record<string, unknown> | null;
  conflictFields?: string[];
  conflictReason?: SyncConflictReason;
  autoMergedFields?: string[];
  errorMessage?: string;
}

export interface SyncPushResponse {
  serverTime: string;
  results: SyncPushItemResult[];
  idRemaps: Record<string, string>;
}

export interface SyncPullChanges {
  centers: Record<string, unknown>[];
  programs: Record<string, unknown>[];
  programSubjects: Record<string, unknown>[];
  academicYears: Record<string, unknown>[];
  batches: Record<string, unknown>[];
  batchEnrollments: Record<string, unknown>[];
  students: Record<string, unknown>[];
  feePayments: Record<string, unknown>[];
  attendanceSessions: Record<string, unknown>[];
  attendanceRecords: Record<string, unknown>[];
  exams: Record<string, unknown>[];
  examScores: Record<string, unknown>[];
  skillDefinitions: Record<string, unknown>[];
  skillLogs: Record<string, unknown>[];
  formTemplates: Record<string, unknown>[];
  formSubmissions: Record<string, unknown>[];
}

export interface SyncPullResponse {
  serverTime: string;
  isFullSnapshot: boolean;
  changes: SyncPullChanges;
}

export type ConflictResolutionAction =
  | { mode: "keep_server" }
  | { mode: "keep_mine" }
  | { mode: "merge"; mergedFields: Record<string, unknown> };
