import api from './api';
import type { ApiEnvelope, SkillDefinition, SkillRecord } from '../types';
import { getActiveOfflineDb, syncEngine } from '../offline/syncEngine';
import { withOfflineMutation, withOfflineRead } from '../offline/offlineServiceHelper';
import { computeFieldDiff, generateClientUuid } from '../offline/outboxHelpers';
import type { LocalEntityRecord } from '../offline/offlineDb';

/** Student-scoped skill endpoints (`/api/students/.../skills`). */

export interface SkillMatrixStudent {
  id: string;
  fullName: string;
  rollNumber?: string | null;
  programId: string;
  centerId: string;
}

export interface SkillMatrixExistingLog {
  id: string;
  studentId: string;
  skillId: string;
  level: number;
  remarks?: string | null;
  assessedOn: string;
}

export interface SkillMatrixResponse {
  centerId: string;
  programId: string;
  assessedOn: string;
  students: SkillMatrixStudent[];
  skills: SkillDefinition[];
  existingLogs: SkillMatrixExistingLog[];
}

export interface BulkSkillEntryInput {
  studentId: string;
  skillId: string;
  level: number;
  remarks?: string | null;
}

export interface BulkUpsertSkillsResponse {
  assessedOn: string;
  createdCount: number;
  updatedCount: number;
  savedCount: number;
  logs: SkillRecord[];
}

function unwrap<T>(body: ApiEnvelope<T> | T): T {
  if (body && typeof body === 'object' && 'data' in body && 'success' in body) {
    return (body as ApiEnvelope<T>).data;
  }
  return body as T;
}

export const listSkillDefinitions = (programId?: string) =>
  withOfflineRead<SkillDefinition[]>(
    () =>
      api
        .get<SkillDefinition[]>('/skills/definitions', {
          params: programId ? { programId } : undefined,
        })
        .then((r) => r.data),
    async () => {
      const db = getActiveOfflineDb();
      if (!db) return [];
      let rows = await db.skillDefinitions.toArray();
      if (programId) rows = rows.filter((d) => d.programId === programId);
      return rows.filter((d) => d.isActive !== false) as unknown as SkillDefinition[];
    },
    async (defs) => {
      const db = getActiveOfflineDb();
      if (db && defs.length > 0) {
        await db.skillDefinitions.bulkPut(defs as unknown as LocalEntityRecord[]);
      }
    },
  );

export const getSkillsByStudent = (studentId: string) =>
  withOfflineRead<SkillRecord[]>(
    () => api.get<ApiEnvelope<SkillRecord[]>>(`/students/${studentId}/skills`).then((r) => unwrap(r.data)),
    async () => {
      const db = getActiveOfflineDb();
      if (!db) return [];
      const rows = await db.skillLogs.where('studentId').equals(studentId).toArray();
      return rows as unknown as SkillRecord[];
    },
    async (logs) => {
      const db = getActiveOfflineDb();
      if (db && logs.length > 0) {
        await db.skillLogs.bulkPut(logs as unknown as LocalEntityRecord[]);
      }
    },
  );

export const addSkill = (studentId: string, payload: Record<string, unknown>) =>
  withOfflineMutation<SkillRecord>(
    () =>
      api
        .post<ApiEnvelope<SkillRecord>>(`/students/${studentId}/skills`, payload)
        .then((r) => unwrap(r.data)),
    async () => {
      const db = getActiveOfflineDb();
      const id = generateClientUuid();
      const nowIso = new Date().toISOString();
      const skillDef =
        db && typeof payload.skillId === 'string'
          ? await db.skillDefinitions.get(payload.skillId)
          : undefined;
      const student = db ? await db.students.get(studentId) : undefined;

      const localLog: LocalEntityRecord = {
        id,
        studentId,
        centerId: student?.centerId ?? null,
        skillId: String(payload.skillId ?? ''),
        level: Number(payload.level ?? 1),
        assessedOn: String(payload.assessedOn ?? nowIso.slice(0, 10)),
        remarks: typeof payload.remarks === 'string' ? payload.remarks : null,
        skill: skillDef ?? undefined,
        version: 1,
        createdAt: nowIso,
        updatedAt: nowIso,
      };
      if (db) await db.skillLogs.put(localLog);

      await syncEngine.enqueueMutation({
        entityType: 'skill_log',
        entityId: id,
        entityLabel: `Skill: ${String(skillDef?.name || 'Assessment')} (${String(student?.fullName || studentId.slice(0, 6))})`,
        action: 'CREATE',
        changedFields: { ...payload, studentId },
      });

      return localLog as unknown as SkillRecord;
    },
    async (created) => {
      const db = getActiveOfflineDb();
      if (db && created?.id) {
        await db.skillLogs.put(created as unknown as LocalEntityRecord);
      }
    },
  );

export const updateSkill = (skillId: string, payload: Record<string, unknown>) =>
  withOfflineMutation<SkillRecord>(
    () =>
      api
        .put<ApiEnvelope<SkillRecord>>(`/students/skills/${skillId}`, payload)
        .then((r) => unwrap(r.data)),
    async () => {
      const db = getActiveOfflineDb();
      const existing = db ? await db.skillLogs.get(skillId) : undefined;
      const baseVersion = typeof existing?.version === 'number' ? existing.version : 1;
      const { baseSnapshot, changedFields } = computeFieldDiff(
        existing as Record<string, unknown> | undefined,
        payload,
      );
      const updated: LocalEntityRecord = {
        ...(existing ?? { id: skillId }),
        ...payload,
        updatedAt: new Date().toISOString(),
      };
      if (db) await db.skillLogs.put(updated);

      if (Object.keys(changedFields).length > 0) {
        await syncEngine.enqueueMutation({
          entityType: 'skill_log',
          entityId: skillId,
          entityLabel: `Skill Log (${skillId.slice(0, 8)})`,
          action: 'UPDATE',
          baseVersion,
          baseSnapshot,
          changedFields,
        });
      }

      return updated as unknown as SkillRecord;
    },
    async (updated) => {
      const db = getActiveOfflineDb();
      if (db && updated?.id) {
        await db.skillLogs.put(updated as unknown as LocalEntityRecord);
      }
    },
  );

export const deleteSkill = (skillId: string) =>
  withOfflineMutation<unknown>(
    () =>
      api
        .delete<ApiEnvelope<unknown>>(`/students/skills/${skillId}`)
        .then((r) => unwrap(r.data)),
    async () => {
      const db = getActiveOfflineDb();
      const existing = db ? await db.skillLogs.get(skillId) : undefined;
      if (db) await db.skillLogs.delete(skillId);
      await syncEngine.enqueueMutation({
        entityType: 'skill_log',
        entityId: skillId,
        entityLabel: `Skill Log (${skillId.slice(0, 8)})`,
        action: 'DELETE',
        baseVersion: typeof existing?.version === 'number' ? existing.version : 1,
        changedFields: {},
      });
      return { deleted: true, id: skillId, offlineQueued: true };
    },
    async () => {
      const db = getActiveOfflineDb();
      if (db) await db.skillLogs.delete(skillId);
    },
  );

export const getSkillMatrix = (params: {
  centerId: string;
  programId: string;
  batchId?: string;
  assessedOn?: string;
}) =>
  withOfflineRead<SkillMatrixResponse>(
    () =>
      api
        .get<ApiEnvelope<SkillMatrixResponse>>('/students/skills/matrix', { params })
        .then((r) => unwrap(r.data)),
    async () => {
      const db = getActiveOfflineDb();
      const assessedOn = params.assessedOn || new Date().toISOString().slice(0, 10);
      if (!db) {
        return {
          centerId: params.centerId,
          programId: params.programId,
          assessedOn,
          students: [],
          skills: [],
          existingLogs: [],
        };
      }
      let students = (await db.students.where('centerId').equals(params.centerId).toArray()).filter(
        (s) => s.isActive !== false && s.programId === params.programId,
      );
      if (params.batchId) {
        const enrollments = await db.batchEnrollments.where('batchId').equals(params.batchId).toArray();
        const enrolledIds = new Set(enrollments.map((e) => String(e.studentId)));
        students = students.filter((s) => enrolledIds.has(s.id));
      }
      const skills = (await db.skillDefinitions.where('programId').equals(params.programId).toArray()).filter(
        (d) => d.isActive !== false,
      );
      const allLogs = await db.skillLogs.where('centerId').equals(params.centerId).toArray();
      const existingLogs = allLogs.filter(
        (l) => String(l.assessedOn || '').slice(0, 10) === assessedOn,
      );

      return {
        centerId: params.centerId,
        programId: params.programId,
        assessedOn,
        students: students.map((s) => ({
          id: s.id,
          fullName: String(s.fullName || ''),
          rollNumber: (s.rollNumber as string | null) ?? null,
          programId: String(s.programId || params.programId),
          centerId: String(s.centerId || params.centerId),
        })),
        skills: skills as unknown as SkillDefinition[],
        existingLogs: existingLogs.map((l) => ({
          id: l.id,
          studentId: String(l.studentId || ''),
          skillId: String(l.skillId || ''),
          level: Number(l.level || 1),
          remarks: (l.remarks as string | null) ?? null,
          assessedOn: String(l.assessedOn || assessedOn).slice(0, 10),
        })),
      };
    },
    async (matrix) => {
      const db = getActiveOfflineDb();
      if (!db) return;
      if (matrix.skills?.length) {
        await db.skillDefinitions.bulkPut(matrix.skills as unknown as LocalEntityRecord[]);
      }
      if (matrix.existingLogs?.length) {
        await db.skillLogs.bulkPut(
          matrix.existingLogs.map((l) => ({
            ...l,
            centerId: matrix.centerId,
          })) as unknown as LocalEntityRecord[],
        );
      }
    },
  );

export const bulkUpsertSkills = (payload: {
  centerId: string;
  programId?: string;
  assessedOn?: string;
  entries: BulkSkillEntryInput[];
}) =>
  withOfflineMutation<BulkUpsertSkillsResponse>(
    () =>
      api
        .post<ApiEnvelope<BulkUpsertSkillsResponse>>('/students/skills/bulk', payload)
        .then((r) => unwrap(r.data)),
    async () => {
      const db = getActiveOfflineDb();
      const assessedOn = payload.assessedOn || new Date().toISOString().slice(0, 10);
      const existingLogs = db
        ? (await db.skillLogs.where('centerId').equals(payload.centerId).toArray()).filter(
            (l) => String(l.assessedOn || '').slice(0, 10) === assessedOn,
          )
        : [];
      const existingByKey = new Map(
        existingLogs.map((l) => [`${String(l.studentId)}:${String(l.skillId)}`, l]),
      );

      let createdCount = 0;
      let updatedCount = 0;
      const savedLogs: SkillRecord[] = [];

      for (const entry of payload.entries) {
        const existing = existingByKey.get(`${entry.studentId}:${entry.skillId}`);
        if (existing) {
          const updated = await updateSkill(existing.id, {
            level: entry.level,
            remarks: entry.remarks ?? null,
            assessedOn,
          });
          updatedCount += 1;
          savedLogs.push(updated);
        } else {
          const created = await addSkill(entry.studentId, {
            skillId: entry.skillId,
            level: entry.level,
            remarks: entry.remarks ?? null,
            assessedOn,
          });
          createdCount += 1;
          savedLogs.push(created);
        }
      }

      return {
        assessedOn,
        createdCount,
        updatedCount,
        savedCount: savedLogs.length,
        logs: savedLogs,
      };
    },
    async (res) => {
      const db = getActiveOfflineDb();
      if (db && res.logs?.length) {
        await db.skillLogs.bulkPut(res.logs as unknown as LocalEntityRecord[]);
      }
    },
  );
