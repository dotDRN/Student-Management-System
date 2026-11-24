import api from './api';
import { getActiveOfflineDb, syncEngine } from '../offline/syncEngine';
import { withOfflineMutation, withOfflineRead } from '../offline/offlineServiceHelper';
import { generateClientUuid } from '../offline/outboxHelpers';
import type { LocalEntityRecord } from '../offline/offlineDb';
import { useAuthStore } from '../store/useAuthStore';

export type FormTemplateListItem = {
  id: string;
  name: string;
  formType: string;
  isActive: boolean;
  createdAt: string;

  externalSource?: string;
  externalId?: string;
};

export type FormSubmissionsResult = {
  submissions: Array<Record<string, unknown>>;
  total: number;
  page: number;
  totalPages: number;
};

export type KoboForm = {
  id: string;
  name: string;
  externalSource?: string;
  externalId?: string;
};

export const createFormTemplate = (body: Record<string, unknown>) =>
  api.post<Record<string, unknown>>('/forms/templates', body).then((r) => r.data);

export const listFormTemplates = (formType?: string, includeInactive?: boolean) =>
  withOfflineRead<FormTemplateListItem[]>(
    () =>
      api
        .get<{ templates: FormTemplateListItem[] }>('/forms/templates', {
          params: {
            ...(formType ? { formType } : {}),
            ...(includeInactive ? { includeInactive: 'true' } : {}),
          },
        })
        .then((r) => r.data.templates ?? []),
    async () => {
      const db = getActiveOfflineDb();
      if (!db) return [];
      let rows = await db.formTemplates.toArray();
      if (formType) rows = rows.filter((t) => t.formType === formType);
      if (!includeInactive) rows = rows.filter((t) => t.isActive !== false);
      return rows as unknown as FormTemplateListItem[];
    },
    async (templates) => {
      const db = getActiveOfflineDb();
      if (db && templates.length > 0) {
        await db.formTemplates.bulkPut(templates as unknown as LocalEntityRecord[]);
      }
    },
  );

export const getFormTemplate = (templateId: string) =>
  withOfflineRead<Record<string, unknown>>(
    () => api.get<Record<string, unknown>>(`/forms/templates/${templateId}`).then((r) => r.data),
    async () => {
      const db = getActiveOfflineDb();
      const row = db ? await db.formTemplates.get(templateId) : undefined;
      if (!row) throw new Error('Form template not available offline');
      return row;
    },
    async (tpl) => {
      const db = getActiveOfflineDb();
      if (db && typeof tpl.id === 'string') {
        await db.formTemplates.put(tpl as LocalEntityRecord);
      }
    },
  );

export const updateFormTemplate = (templateId: string, body: Record<string, unknown>) =>
  api.put<Record<string, unknown>>(`/forms/templates/${templateId}`, body).then((r) => r.data);

export const deleteFormTemplate = (templateId: string) =>
  api.delete<Record<string, unknown>>(`/forms/templates/${templateId}`).then((r) => r.data);

export const submitForm = (body: Record<string, unknown>) =>
  withOfflineMutation<Record<string, unknown>>(
    () => api.post<Record<string, unknown>>('/forms/submissions', body).then((r) => r.data),
    async () => {
      const db = getActiveOfflineDb();
      const id = generateClientUuid();
      const nowIso = new Date().toISOString();
      const auth = useAuthStore.getState();
      const centerId =
        String(body.centerId || auth.selectedCenterId || auth.currentUser?.centerIds?.[0] || '');
      const tpl =
        db && typeof body.templateId === 'string'
          ? await db.formTemplates.get(body.templateId)
          : undefined;

      const localSub: LocalEntityRecord = {
        id,
        templateId: String(body.templateId ?? ''),
        assignmentId: (body.assignmentId as string | null) ?? null,
        studentId: (body.studentId as string | null) ?? null,
        centerId,
        submittedBy: auth.currentUser?.id ?? '',
        startedAt: (body.startedAt as string | null) ?? null,
        submittedAt: nowIso,
        data: (body.data as Record<string, unknown>) ?? {},
        version: 1,
        updatedAt: nowIso,
      };
      if (db) await db.formSubmissions.put(localSub);

      await syncEngine.enqueueMutation({
        entityType: 'form_submission',
        entityId: id,
        entityLabel: `Form: ${String(tpl?.name || 'Submission')}`,
        action: 'CREATE',
        changedFields: { ...body, centerId },
      });

      return { ...localSub, offlineQueued: true };
    },
    async (sub) => {
      const db = getActiveOfflineDb();
      if (db && typeof sub.id === 'string') {
        await db.formSubmissions.put(sub as LocalEntityRecord);
      }
    },
  );

export const listFormSubmissions = (params?: Record<string, string | undefined>) =>
  withOfflineRead<FormSubmissionsResult>(
    () => api.get<FormSubmissionsResult>('/forms/submissions', { params }).then((r) => r.data),
    async () => {
      const db = getActiveOfflineDb();
      if (!db) return { submissions: [], total: 0, page: 1, totalPages: 1 };
      let rows = await db.formSubmissions.toArray();
      if (params?.templateId) rows = rows.filter((r) => r.templateId === params.templateId);
      if (params?.studentId) rows = rows.filter((r) => r.studentId === params.studentId);
      if (params?.centerId) rows = rows.filter((r) => r.centerId === params.centerId);
      rows.sort((a, b) => String(b.submittedAt || '').localeCompare(String(a.submittedAt || '')));
      return { submissions: rows, total: rows.length, page: 1, totalPages: 1 };
    },
    async (res) => {
      const db = getActiveOfflineDb();
      if (db && Array.isArray(res.submissions) && res.submissions.length > 0) {
        await db.formSubmissions.bulkPut(res.submissions as LocalEntityRecord[]);
      }
    },
  );

export const getFormSubmission = (submissionId: string) =>
  withOfflineRead<Record<string, unknown>>(
    () => api.get<Record<string, unknown>>(`/forms/submissions/${submissionId}`).then((r) => r.data),
    async () => {
      const db = getActiveOfflineDb();
      const row = db ? await db.formSubmissions.get(submissionId) : undefined;
      if (!row) throw new Error('Form submission not available offline');
      return row;
    },
  );

export const deleteFormSubmission = (submissionId: string) =>
  api.delete<Record<string, unknown>>(`/forms/submissions/${submissionId}`).then((r) => r.data);

export const getStudentFormSubmissions = (studentId: string) =>
  withOfflineRead<Record<string, unknown>>(
    () =>
      api
        .get<Record<string, unknown>>(`/forms/submissions/student/${studentId}`)
        .then((r) => r.data),
    async () => {
      const db = getActiveOfflineDb();
      const submissions = db
        ? await db.formSubmissions.where('studentId').equals(studentId).toArray()
        : [];
      return { submissions };
    },
  );

export const getPendingForms = (params?: Record<string, string | undefined>) =>
  api.get<Record<string, unknown>>('/forms/pending', { params }).then((r) => r.data);

export const syncKoboForms = () =>
  api.post('/kobo/sync/templates').then((r) => r.data);

export const syncKoboSubmissions = (templateId: string, assetUid: string) =>
  api.post('/kobo/sync/submissions', { templateId, assetUid }).then((r) => r.data);
