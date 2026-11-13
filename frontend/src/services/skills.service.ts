import api from './api';
import type { ApiEnvelope, SkillDefinition, SkillRecord } from '../types';

/** Student-scoped skill endpoints (`/api/students/.../skills`). */

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
