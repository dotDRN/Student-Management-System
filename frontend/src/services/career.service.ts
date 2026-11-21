import api from './api';
import type { ApiEnvelope, CareerRecord } from '../types';
import { getActiveOfflineDb, syncEngine } from '../offline/syncEngine';
import { withOfflineMutation, withOfflineRead } from '../offline/offlineServiceHelper';
import { generateClientUuid } from '../offline/outboxHelpers';
import type { LocalEntityRecord } from '../offline/offlineDb';
import { useAuthStore } from '../store/useAuthStore';

function unwrap<T>(body: ApiEnvelope<T> | T): T {
  if (body && typeof body === 'object' && 'data' in body && 'success' in body) {
    return (body as ApiEnvelope<T>).data;
  }
  return body as T;
}

const CAREER_CACHE_TEMPLATE_ID = '__career_tracking__';

async function resolveCareerTemplateId(): Promise<string> {
  const db = getActiveOfflineDb();
  if (!db) return CAREER_CACHE_TEMPLATE_ID;
  const templates = await db.formTemplates.toArray();
  const match = templates.find((t) => String(t.name || '').toLowerCase() === 'career tracking');
  return match?.id || CAREER_CACHE_TEMPLATE_ID;
}

/** Student-scoped career endpoints (`/api/students/.../careers`). */

export const getCareersByStudent = (studentId: string) =>
  withOfflineRead<CareerRecord[]>(
    () => api.get<ApiEnvelope<CareerRecord[]>>(`/students/${studentId}/careers`).then((r) => unwrap(r.data)),
    async () => {
      const db = getActiveOfflineDb();
      if (!db) return [];
      const tplId = await resolveCareerTemplateId();
      const subs = await db.formSubmissions.where('studentId').equals(studentId).toArray();
      return subs
        .filter((s) => s.templateId === tplId || s.templateId === CAREER_CACHE_TEMPLATE_ID || Boolean((s.data as Record<string, unknown> | undefined)?.careerGoal))
        .map((s) => ({
          id: s.id,
          studentId,
          createdAt: String(s.submittedAt || s.updatedAt || new Date().toISOString()),
          ...((s.data as Record<string, unknown>) ?? {}),
        })) as CareerRecord[];
    },
    async (records) => {
      const db = getActiveOfflineDb();
      if (!db || !Array.isArray(records) || records.length === 0) return;
      const tplId = await resolveCareerTemplateId();
      const student = await db.students.get(studentId);
      await db.formSubmissions.bulkPut(
        records.map((rec) => {
          const { id, studentId: sId, createdAt, ...rest } = rec;
          return {
            id,
            templateId: tplId,
            studentId: sId || studentId,
            centerId: student?.centerId ?? null,
            submittedAt: String(createdAt || new Date().toISOString()),
            data: rest,
          } as LocalEntityRecord;
        }),
      );
    },
  );

export const addCareer = (studentId: string, payload: Record<string, unknown>) =>
  withOfflineMutation<CareerRecord>(
    () =>
      api
        .post<ApiEnvelope<CareerRecord>>(`/students/${studentId}/careers`, payload)
        .then((r) => unwrap(r.data)),
    async () => {
      const db = getActiveOfflineDb();
      const id = generateClientUuid();
      const nowIso = new Date().toISOString();
      const tplId = await resolveCareerTemplateId();
      const student = db ? await db.students.get(studentId) : undefined;
      const centerId =
        String(student?.centerId || useAuthStore.getState().selectedCenterId || '');

      const localSub: LocalEntityRecord = {
        id,
        templateId: tplId,
        studentId,
        centerId,
        submittedAt: nowIso,
        updatedAt: nowIso,
        data: payload,
      };
      if (db) await db.formSubmissions.put(localSub);

      if (tplId !== CAREER_CACHE_TEMPLATE_ID && centerId) {
        await syncEngine.enqueueMutation({
          entityType: 'form_submission',
          entityId: id,
          entityLabel: `Career Record (${String(student?.fullName || studentId.slice(0, 6))})`,
          action: 'CREATE',
          changedFields: {
            templateId: tplId,
            studentId,
            centerId,
            data: payload,
          },
        });
      }

      return {
        id,
        studentId,
        createdAt: nowIso,
        ...payload,
      } as CareerRecord;
    },
  );

export const updateCareer = (careerId: string, payload: Record<string, unknown>) =>
  withOfflineMutation<CareerRecord>(
    () =>
      api
        .put<ApiEnvelope<CareerRecord>>(`/students/careers/${careerId}`, payload)
        .then((r) => unwrap(r.data)),
    async () => {
      const db = getActiveOfflineDb();
      const existing = db ? await db.formSubmissions.get(careerId) : undefined;
      const nowIso = new Date().toISOString();
      if (db && existing) {
        await db.formSubmissions.put({
          ...existing,
          data: payload,
          updatedAt: nowIso,
        });
      }
      return {
        id: careerId,
        studentId: String(existing?.studentId || ''),
        createdAt: String(existing?.submittedAt || nowIso),
        ...payload,
      } as CareerRecord;
    },
  );

export const deleteCareer = (careerId: string) =>
  withOfflineMutation<CareerRecord>(
    () =>
      api
        .delete<ApiEnvelope<CareerRecord>>(`/students/careers/${careerId}`)
        .then((r) => unwrap(r.data)),
    async () => {
      const db = getActiveOfflineDb();
      const existing = db ? await db.formSubmissions.get(careerId) : undefined;
      if (db) await db.formSubmissions.delete(careerId);
      return {
        id: careerId,
        studentId: String(existing?.studentId || ''),
      } as CareerRecord;
    },
  );
