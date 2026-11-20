import { z } from "zod";

export const SYNC_ENTITY_TYPES = [
  "student",
  "fee_payment",
  "attendance_session",
  "attendance_record",
  "exam",
  "exam_score",
  "skill_log",
  "form_submission",
] as const;

export type SyncEntityType = (typeof SYNC_ENTITY_TYPES)[number];

export const SYNC_ACTIONS = ["CREATE", "UPDATE", "DELETE"] as const;
export type SyncAction = (typeof SYNC_ACTIONS)[number];

export const syncMutationItemSchema = z.object({
  operationId: z.string().uuid(),
  entityType: z.enum(SYNC_ENTITY_TYPES),
  entityId: z.string().uuid(),
  action: z.enum(SYNC_ACTIONS),
  baseVersion: z.number().int().positive().optional(),
  baseSnapshot: z.record(z.string(), z.unknown()).optional(),
  changedFields: z.record(z.string(), z.unknown()).default({}),
  clientTimestamp: z.string().min(1),
  forceOverwrite: z.boolean().optional().default(false),
});

export type SyncMutationItem = z.infer<typeof syncMutationItemSchema>;

export const syncPushRequestSchema = z.object({
  operations: z.array(syncMutationItemSchema).min(1).max(100),
});

export type SyncPushRequest = z.infer<typeof syncPushRequestSchema>;

export const syncPullQuerySchema = z.object({
  since: z.string().datetime({ offset: true }).optional(),
  centerId: z.string().uuid().optional(),
  academicYearId: z.string().uuid().optional(),
});

export type SyncPullQuery = z.infer<typeof syncPullQuerySchema>;

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
