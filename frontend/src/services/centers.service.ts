import api from './api';
import type { CenterSummary, ProgramSummary } from '../types';

export const listCenters = () =>
  api.get('/centers').then((r) => {
    // FIX: Your data has centers inside centers!
    if (r.data?.centers?.centers) {
      return r.data.centers.centers;
    }
    if (r.data?.centers && Array.isArray(r.data.centers)) return r.data.centers;
    if (Array.isArray(r.data)) return r.data;
    return [];
  });

export const getCenterDetails = (centerId: string) =>
  api.get(`/centers/${centerId}`).then((r) => r.data);

export const createCenter = (data: { name: string; location?: string }) =>
  api.post<{ center: CenterSummary }>('/centers', data).then((r) => r.data);

export const updateCenter = (centerId: string, data: { name?: string; location?: string; isActive?: boolean }) =>
  api.put(`/centers/${centerId}`, data).then((r) => r.data);

export const deleteCenter = (centerId: string) =>
  api.delete(`/centers/${centerId}`);

export const listPrograms = () => api.get<ProgramSummary[]>('/programs').then((r) => r.data);

export const getProgramDetails = (programId: string) =>
  api.get(`/programs/${programId}`).then((r) => r.data);

export const createProgram = (data: { code: string; name: string; ageMin?: number; ageMax?: number; description?: string }) =>
  api.post('/programs', data).then((r) => r.data);

export const updateProgram = (programId: string, data: { name?: string; ageMin?: number; ageMax?: number; description?: string; isActive?: boolean }) =>
  api.put(`/programs/${programId}`, data).then((r) => r.data);

export const getMyCenters = () =>
  api.get('/users/me/centers').then((r) => r.data);
