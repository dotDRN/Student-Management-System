import api from './api';
import type { ApiEnvelope, CareerRecord } from '../types';

function unwrap<T>(body: ApiEnvelope<T> | T): T {
  if (body && typeof body === 'object' && 'data' in body && 'success' in body) {
    return (body as ApiEnvelope<T>).data;
  }
  return body as T;
}

/** Student-scoped career endpoints (`/api/students/.../careers`). */

export const getCareersByStudent = (studentId: string) =>
  api.get<ApiEnvelope<CareerRecord[]>>(`/students/${studentId}/careers`).then((r) => unwrap(r.data));

export const addCareer = (studentId: string, payload: Record<string, unknown>) =>
  api
    .post<ApiEnvelope<CareerRecord>>(`/students/${studentId}/careers`, payload)
    .then((r) => unwrap(r.data));

export const updateCareer = (careerId: string, payload: Record<string, unknown>) =>
  api
    .put<ApiEnvelope<CareerRecord>>(`/students/careers/${careerId}`, payload)
    .then((r) => unwrap(r.data));

export const deleteCareer = (careerId: string) =>
  api
    .delete<ApiEnvelope<CareerRecord>>(`/students/careers/${careerId}`)
    .then((r) => unwrap(r.data));
