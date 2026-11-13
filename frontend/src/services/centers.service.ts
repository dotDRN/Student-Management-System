import api from './api';
import type { CenterSummary, ProgramSummary, UserRole } from '../types';

export interface CenterStaffAssignment {
  id: string;
  userId: string;
  validFrom: string;
  validUntil?: string | null;
  user: {
    id: string;
    fullName: string;
    email: string;
    role: UserRole | string;
    isActive?: boolean;
  };
}

export interface CenterDetail {
  id: string;
  name: string;
  location?: string | null;
  isActive: boolean;
  teachers: { id: string; fullName: string; email: string; role: string }[];
  staffAssignments?: CenterStaffAssignment[];
  students: { id: string; fullName: string; rollNumber?: string | null; programId: string }[];
  userCount: number;
  studentCount: number;
  centerPrograms?: { id?: string; programId?: string; program: ProgramSummary }[];
}

export interface ProgramSubjectItem {
  id: string;
  programId: string;
  name: string;
  maxMarks: number | string;
  isActive: boolean;
}

export interface SkillDefinitionItem {
  id: string;
  programId: string;
  name: string;
  description?: string | null;
  maxLevel: number;
  isActive: boolean;
}

export interface ProgramDetail {
  id: string;
  code: string;
  name: string;
  ageMin?: number | null;
  ageMax?: number | null;
  description?: string | null;
  isActive?: boolean;
  studentCount: number;
  students: { id: string; fullName: string; rollNumber?: string | null; centerId: string }[];
  centerPrograms?: { center: { id: string; name: string; location?: string | null } }[];
  subjects?: ProgramSubjectItem[];
  skillDefinitions?: SkillDefinitionItem[];
}

export const listCenters = () =>
  api.get('/centers').then((r) => {
    if (r.data?.centers?.centers) {
      return r.data.centers.centers as CenterSummary[];
    }
    if (r.data?.centers && Array.isArray(r.data.centers)) return r.data.centers as CenterSummary[];
    if (Array.isArray(r.data)) return r.data as CenterSummary[];
    return [];
  });

export const getCenterDetails = (centerId: string) =>
  api.get<CenterDetail>(`/centers/${centerId}`).then((r) => r.data);

export const createCenter = (data: { name: string; location?: string }) =>
  api.post<CenterSummary>('/centers', data).then((r) => r.data);

export const updateCenter = (centerId: string, data: { name?: string; location?: string | null; isActive?: boolean }) =>
  api.put<CenterSummary>(`/centers/${centerId}`, data).then((r) => r.data);

export const deleteCenter = (centerId: string) =>
  api.delete(`/centers/${centerId}`);

export const assignProgramToCenter = (centerId: string, programId: string) =>
  api.post(`/centers/${centerId}/programs`, { programId }).then((r) => r.data);

export const removeProgramFromCenter = (centerId: string, programId: string) =>
  api.delete(`/centers/${centerId}/programs/${programId}`).then((r) => r.data);

export const assignUserToCenter = (
  centerId: string,
  payload: { userId: string; validFrom?: string; validUntil?: string | null },
) => api.post(`/centers/${centerId}/users`, payload).then((r) => r.data);

export const removeUserFromCenter = (centerId: string, userId: string) =>
  api.delete(`/centers/${centerId}/users/${userId}`).then((r) => r.data);

export const listPrograms = () => api.get<ProgramSummary[]>('/programs').then((r) => r.data);

export const getProgramDetails = (programId: string) =>
  api.get<ProgramDetail>(`/programs/${programId}`).then((r) => r.data);

export const createProgram = (data: {
  code: string;
  name: string;
  ageMin?: number;
  ageMax?: number;
  description?: string;
}) => api.post<ProgramSummary>('/programs', data).then((r) => r.data);

export const updateProgram = (
  programId: string,
  data: { name?: string; ageMin?: number | null; ageMax?: number | null; description?: string | null; isActive?: boolean },
) => api.put<ProgramSummary>(`/programs/${programId}`, data).then((r) => r.data);

export const createProgramSubject = (programId: string, payload: { name: string; maxMarks?: number }) =>
  api.post<ProgramSubjectItem>(`/programs/${programId}/subjects`, payload).then((r) => r.data);

export const updateProgramSubject = (
  programId: string,
  subjectId: string,
  payload: { name?: string; maxMarks?: number; isActive?: boolean },
) => api.put<ProgramSubjectItem>(`/programs/${programId}/subjects/${subjectId}`, payload).then((r) => r.data);

export const deleteProgramSubject = (programId: string, subjectId: string) =>
  api.delete<{ id: string; deleted: boolean; deactivated: boolean }>(`/programs/${programId}/subjects/${subjectId}`).then((r) => r.data);

export const createSkillDefinition = (
  programId: string,
  payload: { name: string; description?: string | null; maxLevel?: number },
) => api.post<SkillDefinitionItem>(`/programs/${programId}/skills`, payload).then((r) => r.data);

export const updateSkillDefinition = (
  programId: string,
  skillId: string,
  payload: { name?: string; description?: string | null; maxLevel?: number; isActive?: boolean },
) => api.put<SkillDefinitionItem>(`/programs/${programId}/skills/${skillId}`, payload).then((r) => r.data);

export const deleteSkillDefinition = (programId: string, skillId: string) =>
  api.delete<{ id: string; deleted: boolean; deactivated: boolean }>(`/programs/${programId}/skills/${skillId}`).then((r) => r.data);

export const getMyCenters = () =>
  api.get('/users/me/centers').then((r) => r.data);
