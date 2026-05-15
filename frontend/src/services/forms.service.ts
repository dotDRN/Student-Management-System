import api from './api';

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
  api
    .get<{ templates: FormTemplateListItem[] }>('/forms/templates', {
      params: {
        ...(formType ? { formType } : {}),
        ...(includeInactive ? { includeInactive: 'true' } : {}),
      },
    })
    .then((r) => r.data.templates ?? []);

export const getFormTemplate = (templateId: string) =>
  api.get<Record<string, unknown>>(`/forms/templates/${templateId}`).then((r) => r.data);

export const updateFormTemplate = (templateId: string, body: Record<string, unknown>) =>
  api.put<Record<string, unknown>>(`/forms/templates/${templateId}`, body).then((r) => r.data);

export const deleteFormTemplate = (templateId: string) =>
  api.delete<Record<string, unknown>>(`/forms/templates/${templateId}`).then((r) => r.data);

export const submitForm = (body: Record<string, unknown>) =>
  api.post<Record<string, unknown>>('/forms/submissions', body).then((r) => r.data);

export const listFormSubmissions = (params?: Record<string, string | undefined>) =>
  api.get<FormSubmissionsResult>('/forms/submissions', { params }).then((r) => r.data);

export const getFormSubmission = (submissionId: string) =>
  api.get<Record<string, unknown>>(`/forms/submissions/${submissionId}`).then((r) => r.data);

export const deleteFormSubmission = (submissionId: string) =>
  api.delete<Record<string, unknown>>(`/forms/submissions/${submissionId}`).then((r) => r.data);

export const getStudentFormSubmissions = (studentId: string) =>
  api
    .get<Record<string, unknown>>(`/forms/submissions/student/${studentId}`)
    .then((r) => r.data);

export const getPendingForms = (params?: Record<string, string | undefined>) =>
  api.get<Record<string, unknown>>('/forms/pending', { params }).then((r) => r.data);

export const syncKoboForms = () =>
  api.post('/kobo/sync/templates').then((r) => r.data);

export const syncKoboSubmissions = (templateId: string, assetUid: string) =>
  api.post('/kobo/sync/submissions', { templateId, assetUid }).then((r) => r.data);
