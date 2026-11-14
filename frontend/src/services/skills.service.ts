import api from './api';
import type { ApiEnvelope, SkillDefinition, SkillRecord } from '../types';

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
  api
    .get<SkillDefinition[]>('/skills/definitions', {
      params: programId ? { programId } : undefined,
    })
    .then((r) => r.data);

export const getSkillsByStudent = (studentId: string) =>
  api.get<ApiEnvelope<SkillRecord[]>>(`/students/${studentId}/skills`).then((r) => unwrap(r.data));

export const addSkill = (studentId: string, payload: Record<string, unknown>) =>
  api
    .post<ApiEnvelope<SkillRecord>>(`/students/${studentId}/skills`, payload)
    .then((r) => unwrap(r.data));

export const updateSkill = (skillId: string, payload: Record<string, unknown>) =>
  api
    .put<ApiEnvelope<SkillRecord>>(`/students/skills/${skillId}`, payload)
    .then((r) => unwrap(r.data));

export const deleteSkill = (skillId: string) =>
  api
    .delete<ApiEnvelope<unknown>>(`/students/skills/${skillId}`)
    .then((r) => unwrap(r.data));

export const getSkillMatrix = (params: {
  centerId: string;
  programId: string;
  batchId?: string;
  assessedOn?: string;
}) =>
  api
    .get<ApiEnvelope<SkillMatrixResponse>>('/students/skills/matrix', { params })
    .then((r) => unwrap(r.data));

export const bulkUpsertSkills = (payload: {
  centerId: string;
  programId?: string;
  assessedOn?: string;
  entries: BulkSkillEntryInput[];
}) =>
  api
    .post<ApiEnvelope<BulkUpsertSkillsResponse>>('/students/skills/bulk', payload)
    .then((r) => unwrap(r.data));
