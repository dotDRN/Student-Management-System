import type { QueryClient } from "@tanstack/react-query";
import type { Table } from "dexie";
import api from "../services/api";
import { socketService } from "../services/socket.service";
import { useAuthStore } from "../store/useAuthStore";
import { useSyncStore } from "../store/useSyncStore";
import {
  clearOfflineAttendanceQueue,
  isLikelyNetworkError,
  listQueuedAttendanceMutations,
} from "../utils/offlineAttendanceQueue";
import {
  closeOfflineDb,
  getOfflineDb,
  requestPersistentStorage,
  type EdBaseOfflineDb,
  type LocalEntityRecord,
} from "./offlineDb";
import {
  generateClientUuid,
  remapOutboxReferences,
  sortOutboxCausally,
} from "./outboxHelpers";
import type {
  ConflictResolutionAction,
  OutboxItem,
  SyncConflictItem,
  SyncEntityType,
  SyncPullResponse,
  SyncPushResponse,
} from "./syncTypes";

const PUSH_BATCH_SIZE = 25;
const MAX_RETRY_ATTEMPTS = 5;

function getTableForEntity(
  db: EdBaseOfflineDb,
  entityType: SyncEntityType,
): Table<LocalEntityRecord, string> {
  switch (entityType) {
    case "student":
      return db.students;
    case "fee_payment":
      return db.feePayments;
    case "attendance_session":
      return db.attendanceSessions;
    case "attendance_record":
      return db.attendanceRecords;
    case "exam":
      return db.exams;
    case "exam_score":
      return db.examScores;
    case "skill_log":
      return db.skillLogs;
    case "form_submission":
      return db.formSubmissions;
  }
}

export function getActiveOfflineDb(): EdBaseOfflineDb | null {
  const { currentUser, currentTenant } = useAuthStore.getState();
  if (!currentUser) return null;
  const tenantId = currentTenant?.id || currentUser.tenantId || "default";
  return getOfflineDb(tenantId, currentUser.id);
}

class SyncEngine {
  private queryClient: QueryClient | null = null;
  private started = false;
  private syncInFlight: Promise<void> | null = null;
  private unsubSocketConnection: (() => void) | null = null;
  private periodicTimer: ReturnType<typeof setInterval> | null = null;

  private readonly handleWindowOnline = () => {
    useSyncStore.getState().setOnline(true);
    void this.syncNow();
  };

  private readonly handleWindowOffline = () => {
    useSyncStore.getState().setOnline(false);
  };

  private readonly handleServerSyncBroadcast = (data: {
    entities: string[];
    updatedBy: string;
  }) => {
    const currentUserId = useAuthStore.getState().currentUser?.id;
    if (data.updatedBy && data.updatedBy === currentUserId) return;
    void this.syncNow({ skipHealthCheck: true });
  };

  start(queryClient?: QueryClient): void {
    if (queryClient) {
      this.queryClient = queryClient;
    }
    if (this.started) {
      void this.refreshStoreCounts();
      return;
    }
    this.started = true;

    void requestPersistentStorage();
    useSyncStore
      .getState()
      .setOnline(typeof navigator !== "undefined" ? navigator.onLine : true);

    if (typeof window !== "undefined") {
      window.addEventListener("online", this.handleWindowOnline);
      window.addEventListener("offline", this.handleWindowOffline);
    }

    socketService.on("sync:updated", this.handleServerSyncBroadcast);
    this.unsubSocketConnection = socketService.subscribeToConnectionState(
      (connected) => {
        if (connected) {
          useSyncStore.getState().setOnline(true);
          void this.syncNow({ skipHealthCheck: true });
        }
      },
    );

    // Poll every 12s when database/backend was unreachable or outbox has pending items,
    // so reconnecting the database immediately flushes queued mutations to the cloud.
    this.periodicTimer = setInterval(() => {
      if (
        typeof navigator !== "undefined" &&
        navigator.onLine !== false &&
        !useAuthStore.getState().needsReauth
      ) {
        const { isOnline, pendingCount } = useSyncStore.getState();
        if (!isOnline || pendingCount > 0) {
          void this.syncNow({ skipHealthCheck: false });
        }
      }
    }, 12_000);

    void this.migrateLegacyAttendanceQueue().then(() => {
      void this.refreshStoreCounts();
      if (typeof navigator === "undefined" || navigator.onLine) {
        void this.syncNow();
      }
    });
  }

  stop(): void {
    this.started = false;
    if (typeof window !== "undefined") {
      window.removeEventListener("online", this.handleWindowOnline);
      window.removeEventListener("offline", this.handleWindowOffline);
    }
    socketService.off("sync:updated", this.handleServerSyncBroadcast);
    if (this.unsubSocketConnection) {
      this.unsubSocketConnection();
      this.unsubSocketConnection = null;
    }
    if (this.periodicTimer) {
      clearInterval(this.periodicTimer);
      this.periodicTimer = null;
    }
    closeOfflineDb();
    useSyncStore.getState().reset();
  }

  async refreshStoreCounts(): Promise<void> {
    const db = getActiveOfflineDb();
    if (!db) return;
    const [pendingCount, conflicts, lastSyncedMeta] = await Promise.all([
      db.syncOutbox.count(),
      db.syncConflicts.orderBy("createdAt").reverse().toArray(),
      db.syncMeta.get("lastSyncedAt"),
    ]);
    useSyncStore.getState().setCounts(pendingCount, conflicts);
    if (lastSyncedMeta?.value) {
      useSyncStore.getState().setLastSyncedAt(lastSyncedMeta.value);
    }
  }

  /**
   * Migrates any legacy items queued in `offlineAttendanceQueue.ts` into the
   * unified Dexie `syncOutbox` so no pending attendance changes are lost.
   */
  async migrateLegacyAttendanceQueue(): Promise<number> {
    const db = getActiveOfflineDb();
    if (!db) return 0;
    try {
      const legacyItems = await listQueuedAttendanceMutations();
      if (legacyItems.length === 0) return 0;

      const outboxItems: OutboxItem[] = [];
      for (const item of legacyItems) {
        for (const rec of item.records) {
          outboxItems.push({
            operationId: generateClientUuid(),
            entityType: "attendance_record",
            entityId: rec.recordId,
            entityLabel: item.sessionLabel,
            action: "UPDATE",
            changedFields: {
              sessionId: item.sessionId,
              status: rec.status,
              remarks: rec.remarks,
            },
            clientTimestamp: item.queuedAt || new Date().toISOString(),
            attempts: 0,
            status: "pending",
            lastError: null,
          });
        }
      }

      if (outboxItems.length > 0) {
        await db.syncOutbox.bulkPut(outboxItems);
      }
      await clearOfflineAttendanceQueue();
      return outboxItems.length;
    } catch {
      return 0;
    }
  }

  /**
   * Enqueues a mutation into the local IndexedDB outbox and refreshes UI badges.
   */
  async enqueueMutation(
    input: Omit<OutboxItem, "operationId" | "clientTimestamp" | "attempts" | "status"> & {
      operationId?: string;
      clientTimestamp?: string;
    },
  ): Promise<OutboxItem> {
    const db = getActiveOfflineDb();
    const item: OutboxItem = {
      ...input,
      operationId: input.operationId || generateClientUuid(),
      clientTimestamp: input.clientTimestamp || new Date().toISOString(),
      attempts: 0,
      status: "pending",
      lastError: null,
    };

    if (db) {
      await db.syncOutbox.put(item);
      await this.refreshStoreCounts();
    }

    // Attempt immediate background push if currently online
    if (
      typeof navigator !== "undefined" &&
      navigator.onLine &&
      useSyncStore.getState().isOnline &&
      !useAuthStore.getState().needsReauth
    ) {
      void this.syncNow({ skipHealthCheck: false });
    }

    return item;
  }

  private async checkBackendReachable(): Promise<boolean> {
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      return false;
    }
    try {
      const baseURL = import.meta.env.VITE_API_URL || "/api";
      const healthUrl = baseURL.endsWith("/api")
        ? `${baseURL.slice(0, -4)}/health`
        : "/health";
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 4000);
      const res = await fetch(healthUrl, {
        method: "GET",
        cache: "no-store",
        signal: controller.signal,
      });
      clearTimeout(timeout);
      return res.ok;
    } catch {
      return false;
    }
  }

  async syncNow(options?: { skipHealthCheck?: boolean }): Promise<void> {
    if (this.syncInFlight) {
      return this.syncInFlight;
    }

    const { currentUser, needsReauth } = useAuthStore.getState();
    if (!currentUser || needsReauth) return;

    this.syncInFlight = this.runSyncCycle(options).finally(() => {
      this.syncInFlight = null;
    });
    return this.syncInFlight;
  }

  private async runSyncCycle(options?: { skipHealthCheck?: boolean }): Promise<void> {
    const db = getActiveOfflineDb();
    if (!db) return;

    if (!options?.skipHealthCheck) {
      const reachable = await this.checkBackendReachable();
      useSyncStore.getState().setOnline(reachable);
      if (!reachable) return;
    }

    useSyncStore.getState().setSyncing(true);
    useSyncStore.getState().setLastSyncError(null);

    try {
      await this.pushOutboxBatches(db);
      await this.pullDeltaFromServer(db);
      useSyncStore.getState().setOnline(true);
      if (useAuthStore.getState().isOfflineSession) {
        useAuthStore.getState().setOfflineSession(false);
      }
      await this.refreshStoreCounts();
    } catch (err) {
      if (isLikelyNetworkError(err)) {
        useSyncStore.getState().setOnline(false);
      } else {
        const status = (err as { response?: { status?: number } })?.response?.status;
        if (status === 401) {
          useAuthStore.getState().setNeedsReauth(true);
          useSyncStore
            .getState()
            .setLastSyncError("Session expired. Sign in again to sync queued changes.");
        } else {
          const message =
            err instanceof Error ? err.message : "Sync failed. Will retry automatically.";
          useSyncStore.getState().setLastSyncError(message);
        }
      }
      await this.refreshStoreCounts();
    } finally {
      useSyncStore.getState().setSyncing(false);
    }
  }

  private async pushOutboxBatches(db: EdBaseOfflineDb): Promise<void> {
    while (true) {
      const pendingItems = await db.syncOutbox
        .where("status")
        .equals("pending")
        .toArray();
      const eligible = sortOutboxCausally(
        pendingItems.filter((item) => item.attempts < MAX_RETRY_ATTEMPTS),
      );

      if (eligible.length === 0) break;

      const batch = eligible.slice(0, PUSH_BATCH_SIZE);
      const { data } = await api.post<SyncPushResponse>("/sync/push", {
        operations: batch.map((item) => ({
          operationId: item.operationId,
          entityType: item.entityType,
          entityId: item.entityId,
          action: item.action,
          baseVersion: item.baseVersion,
          baseSnapshot: item.baseSnapshot,
          changedFields: item.changedFields,
          clientTimestamp: item.clientTimestamp,
          forceOverwrite: item.forceOverwrite ?? false,
        })),
      });

      // Apply any ID remaps to remaining queued mutations
      if (data.idRemaps && Object.keys(data.idRemaps).length > 0) {
        const allQueued = await db.syncOutbox.toArray();
        const remapped = remapOutboxReferences(allQueued, data.idRemaps);
        await db.syncOutbox.bulkPut(remapped);
      }

      const itemByOpId = new Map(batch.map((b) => [b.operationId, b]));

      for (const res of data.results) {
        const source = itemByOpId.get(res.operationId);
        if (!source) continue;

        if (
          res.status === "applied" ||
          res.status === "merged" ||
          res.status === "deduplicated"
        ) {
          // Update local cache table with canonical server record
          const table = getTableForEntity(db, res.entityType);
          if (res.remappedEntityId && res.remappedEntityId !== source.entityId) {
            await table.delete(source.entityId);
          }
          if (res.serverRecord && typeof res.serverRecord.id === "string") {
            if (res.serverRecord.deletedAt) {
              await table.delete(res.serverRecord.id);
            } else {
              await table.put(res.serverRecord as LocalEntityRecord);
            }
          }
          await db.syncOutbox.delete(source.operationId);
        } else if (res.status === "conflict") {
          // Move out of outbox into conflicts store (non-blocking)
          const conflict: SyncConflictItem = {
            id: generateClientUuid(),
            operationId: source.operationId,
            entityType: source.entityType,
            entityId: res.remappedEntityId ?? source.entityId,
            entityLabel:
              source.entityLabel || `${source.entityType.replace("_", " ")} (${source.entityId.slice(0, 8)})`,
            action: source.action,
            localChanges: source.changedFields,
            baseSnapshot: source.baseSnapshot,
            serverRecord: res.serverRecord ?? null,
            conflictFields: res.conflictFields ?? Object.keys(source.changedFields),
            reason: res.conflictReason ?? "FIELD_CONFLICT",
            createdAt: new Date().toISOString(),
          };
          await db.syncConflicts.put(conflict);
          await db.syncOutbox.delete(source.operationId);
        } else {
          // Error: record failure and increment attempt counter without blocking other items
          const nextAttempts = source.attempts + 1;
          await db.syncOutbox.put({
            ...source,
            attempts: nextAttempts,
            status: nextAttempts >= MAX_RETRY_ATTEMPTS ? "failed" : "pending",
            lastError: res.errorMessage || "Sync rejected by server",
          });
        }
      }

      if (batch.length < PUSH_BATCH_SIZE) break;
    }
  }

  private async pullDeltaFromServer(db: EdBaseOfflineDb): Promise<void> {
    const lastSyncedMeta = await db.syncMeta.get("lastSyncedAt");
    const since = lastSyncedMeta?.value;
    const selectedCenterId = useAuthStore.getState().selectedCenterId;

    const params: Record<string, string> = {};
    if (since) params.since = since;
    if (selectedCenterId) params.centerId = selectedCenterId;

    const { data } = await api.get<SyncPullResponse>("/sync/pull", { params });
    const c = data.changes;

    const applyTableChanges = async (
      table: Table<LocalEntityRecord, string>,
      rows: Record<string, unknown>[],
    ) => {
      if (!rows || rows.length === 0) return;
      const toPut: LocalEntityRecord[] = [];
      const toDelete: string[] = [];
      for (const row of rows) {
        if (typeof row.id !== "string") continue;
        if (row.deletedAt) {
          toDelete.push(row.id);
        } else {
          toPut.push(row as LocalEntityRecord);
        }
      }
      if (toPut.length > 0) await table.bulkPut(toPut);
      if (toDelete.length > 0) await table.bulkDelete(toDelete);
    };

    await db.transaction(
      "rw",
      [
        db.centers,
        db.programs,
        db.programSubjects,
        db.academicYears,
        db.batches,
        db.batchEnrollments,
        db.students,
        db.feePayments,
        db.attendanceSessions,
        db.attendanceRecords,
        db.exams,
        db.examScores,
        db.skillDefinitions,
        db.skillLogs,
        db.formTemplates,
        db.formSubmissions,
        db.syncMeta,
      ],
      async () => {
        await applyTableChanges(db.centers, c.centers);
        await applyTableChanges(db.programs, c.programs);
        await applyTableChanges(db.programSubjects, c.programSubjects);
        await applyTableChanges(db.academicYears, c.academicYears);
        await applyTableChanges(db.batches, c.batches);
        await applyTableChanges(db.batchEnrollments, c.batchEnrollments);
        await applyTableChanges(db.students, c.students);
        await applyTableChanges(db.feePayments, c.feePayments);
        await applyTableChanges(db.attendanceSessions, c.attendanceSessions);
        await applyTableChanges(db.attendanceRecords, c.attendanceRecords);
        await applyTableChanges(db.exams, c.exams);
        await applyTableChanges(db.examScores, c.examScores);
        await applyTableChanges(db.skillDefinitions, c.skillDefinitions);
        await applyTableChanges(db.skillLogs, c.skillLogs);
        await applyTableChanges(db.formTemplates, c.formTemplates);
        await applyTableChanges(db.formSubmissions, c.formSubmissions);

        await db.syncMeta.put({ key: "lastSyncedAt", value: data.serverTime });
      },
    );

    useSyncStore.getState().setLastSyncedAt(data.serverTime);

    const hasIncomingChanges = Object.values(c).some(
      (arr) => Array.isArray(arr) && arr.length > 0,
    );
    if (hasIncomingChanges && this.queryClient) {
      void this.queryClient.invalidateQueries();
    }
  }

  /**
   * Resolves a single conflict from the Conflict Resolution Modal.
   */
  async resolveConflict(
    conflictId: string,
    action: ConflictResolutionAction,
  ): Promise<void> {
    const db = getActiveOfflineDb();
    if (!db) return;

    const conflict = await db.syncConflicts.get(conflictId);
    if (!conflict) return;

    const table = getTableForEntity(db, conflict.entityType);

    if (action.mode === "keep_server") {
      if (conflict.serverRecord && typeof conflict.serverRecord.id === "string") {
        if (conflict.serverRecord.deletedAt) {
          await table.delete(conflict.serverRecord.id);
        } else {
          await table.put(conflict.serverRecord as LocalEntityRecord);
        }
      }
      await db.syncConflicts.delete(conflictId);
      await this.refreshStoreCounts();
      if (this.queryClient) {
        void this.queryClient.invalidateQueries();
      }
      return;
    }

    const latestServerVersion =
      typeof conflict.serverRecord?.version === "number"
        ? conflict.serverRecord.version
        : undefined;
    const fieldsToSubmit =
      action.mode === "merge" ? action.mergedFields : conflict.localChanges;

    // Optimistically update local row
    if (conflict.serverRecord && typeof conflict.serverRecord.id === "string") {
      await table.put({
        ...(conflict.serverRecord as LocalEntityRecord),
        ...fieldsToSubmit,
      });
    }

    await db.syncConflicts.delete(conflictId);
    await this.enqueueMutation({
      entityType: conflict.entityType,
      entityId: conflict.entityId,
      entityLabel: conflict.entityLabel,
      action: conflict.action,
      baseVersion: latestServerVersion,
      baseSnapshot: conflict.serverRecord ?? undefined,
      changedFields: fieldsToSubmit,
      forceOverwrite: true,
    });
  }

  /**
   * Retries any items marked as `failed` in the outbox (e.g., after fixing a transient issue).
   */
  async retryFailedOutboxItems(): Promise<void> {
    const db = getActiveOfflineDb();
    if (!db) return;
    const failed = await db.syncOutbox.where("status").equals("failed").toArray();
    if (failed.length === 0) return;
    await db.syncOutbox.bulkPut(
      failed.map((item) => ({
        ...item,
        attempts: 0,
        status: "pending" as const,
        lastError: null,
      })),
    );
    await this.refreshStoreCounts();
    await this.syncNow();
  }
}

export const syncEngine = new SyncEngine();
