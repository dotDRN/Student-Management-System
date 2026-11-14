import api from './api';

export interface AcademicYearRecord {
  id: string;
  label: string;
  startDate: string;
  endDate: string;
  isCurrent: boolean;
  _count?: {
    students: number;
    attendanceSessions: number;
    exams: number;
  };
}

export type CohortTransitionAction = 'promote' | 'retain' | 'alumni' | 'discontinued';

export interface CohortTransitionItem {
  studentId: string;
  action: CohortTransitionAction;
  targetProgramId?: string | null;
  stream?: string | null;
  post12thChoice?: string | null;
  collegeName?: string | null;
  discontinuationReason?: string | null;
}

export interface PromoteCohortResponse {
  success: boolean;
  targetAcademicYearId: string;
  updatedCount: number;
  summary: {
    promoted: number;
    retained: number;
    alumni: number;
    discontinued: number;
  };
}

export const listAcademicYears = () =>
  api.get<AcademicYearRecord[]>('/academic-years').then((r) => r.data);

export const createAcademicYear = (payload: {
  label: string;
  startDate: string;
  endDate: string;
  isCurrent?: boolean;
}) => api.post<AcademicYearRecord>('/academic-years', payload).then((r) => r.data);

export const setCurrentAcademicYear = (yearId: string) =>
  api.patch<AcademicYearRecord>(`/academic-years/${yearId}/set-current`).then((r) => r.data);

export const promoteStudentCohort = (payload: {
  targetAcademicYearId: string;
  transitions: CohortTransitionItem[];
}) => api.post<PromoteCohortResponse>('/students/promote-cohort', payload).then((r) => r.data);
