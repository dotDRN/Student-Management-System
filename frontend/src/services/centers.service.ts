import api from './api';
import type { CenterSummary, ProgramSummary, UserRole } from '../types';
import { getActiveOfflineDb } from '../offline/syncEngine';
import { withOfflineRead } from '../offline/offlineServiceHelper';
import type { LocalEntityRecord } from '../offline/offlineDb';

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
  withOfflineRead<CenterSummary[]>(
    () =>
      api.get('/centers').then((r) => {
        if (r.data?.centers?.centers) {
          return r.data.centers.centers as CenterSummary[];
        }
        if (r.data?.centers && Array.isArray(r.data.centers)) return r.data.centers as CenterSummary[];
        if (Array.isArray(r.data)) return r.data as CenterSummary[];
        return [];
      }),
    async () => {
      const db = getActiveOfflineDb();
      if (!db) return [];
      const rows = await db.centers.toArray();
      return rows as unknown as CenterSummary[];
    },
    async (centers) => {
      const db = getActiveOfflineDb();
      if (db && centers.length > 0) {
        await db.centers.bulkPut(centers as unknown as LocalEntityRecord[]);
      }
    },
  );

export const getCenterDetails = (centerId: string) =>
  withOfflineRead<CenterDetail>(
    () => api.get<CenterDetail>(`/centers/${centerId}`).then((r) => r.data),
    async () => {
      const db = getActiveOfflineDb();
      const center = db ? await db.centers.get(centerId) : undefined;
      const students = db
        ? await db.students.where('centerId').equals(centerId).toArray()
        : [];
      const programs = db ? await db.programs.toArray() : [];
      return {
        id: centerId,
        name: String(center?.name || 'Center'),
        location: (center?.location as string | null) ?? null,
        isActive: center?.isActive !== false,
        teachers: [],
        students: students.map((s) => ({
          id: s.id,
          fullName: String(s.fullName || ''),
          rollNumber: (s.rollNumber as string | null) ?? null,
          programId: String(s.programId || ''),
        })),
        userCount: 0,
        studentCount: students.length,
        centerPrograms: programs.map((p) => ({
          programId: p.id,
          program: { id: p.id, name: String(p.name || ''), code: String(p.code || '') },
        })),
      };
    },
  );

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

export const listPrograms = () =>
  withOfflineRead<ProgramSummary[]>(
    () => api.get<ProgramSummary[]>('/programs').then((r) => r.data),
    async () => {
      const db = getActiveOfflineDb();
      if (!db) return [];
      const rows = await db.programs.toArray();
      return rows as unknown as ProgramSummary[];
    },
    async (programs) => {
      const db = getActiveOfflineDb();
      if (db && programs.length > 0) {
        await db.programs.bulkPut(programs as unknown as LocalEntityRecord[]);
      }
    },
  );

export const getProgramDetails = (programId: string) =>
  withOfflineRead<ProgramDetail>(
    () => api.get<ProgramDetail>(`/programs/${programId}`).then((r) => r.data),
    async () => {
      const db = getActiveOfflineDb();
      const prog = db ? await db.programs.get(programId) : undefined;
      const students = db
        ? await db.students.where('programId').equals(programId).toArray()
        : [];
      const subjects = db
        ? await db.programSubjects.where('programId').equals(programId).toArray()
        : [];
      const skillDefs = db
        ? await db.skillDefinitions.where('programId').equals(programId).toArray()
        : [];
      return {
        id: programId,
        code: String(prog?.code || ''),
        name: String(prog?.name || 'Program'),
        ageMin: (prog?.ageMin as number | null) ?? null,
        ageMax: (prog?.ageMax as number | null) ?? null,
        description: (prog?.description as string | null) ?? null,
        isActive: prog?.isActive !== false,
        studentCount: students.length,
        students: students.map((s) => ({
          id: s.id,
          fullName: String(s.fullName || ''),
          rollNumber: (s.rollNumber as string | null) ?? null,
          centerId: String(s.centerId || ''),
        })),
        subjects: subjects as unknown as ProgramSubjectItem[],
        skillDefinitions: skillDefs as unknown as SkillDefinitionItem[],
      };
    },
  );

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
  withOfflineRead(
    () => api.get('/users/me/centers').then((r) => r.data),
    async () => {
      const db = getActiveOfflineDb();
      if (!db) return [];
      return db.centers.toArray();
    },
  );
