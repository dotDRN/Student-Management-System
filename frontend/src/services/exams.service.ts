import api from './api';
import type { ExamType } from '../types';

export type ListExamsQuery = {
  centerId?: string;
  programId?: string;
  examType?: ExamType | string;
  academicYearId?: string;
  examDate?: string;
};

export interface ExamListItem {
  id: string;
  name: string;
  examType: string;
  examDate?: string | null;
  createdAt: string;
  center?: { id?: string; name: string };
  program?: { id?: string; name: string };
  academicYear?: { id?: string; label: string };
}

export interface ExamSheetSubject {
  id: string;
  name: string;
  maxMarks: number | string;
}

export interface ExamSheetScore {
  id?: string;
  marks: number | string | null;
  isAbsent?: boolean;
  remarks?: string | null;
  student?: { id: string; fullName: string; rollNumber?: string | null };
  subject?: ExamSheetSubject;
}

export interface ExamSheetPayload {
  id: string;
  name: string;
  examType: string;
  examDate?: string | null;
  centerId: string;
  programId: string;
  academicYear?: { id: string; label: string } | null;
  center?: { id: string; name: string } | null;
  program?: { id: string; name: string } | null;
  students: Array<{ id: string; fullName: string; rollNumber?: string | null }>;
  subjects?: ExamSheetSubject[];
  scores: ExamSheetScore[];
}

export interface ExamComparisonSubject {
  subject: string;
  maxMarks?: number;
  baselineAvg: number;
  baselineCount?: number;
  baselinePassRate?: number;
  midlineAvg?: number;
  midlineCount?: number;
  midlinePassRate?: number;
  endlineAvg: number;
  endlineCount?: number;
  endlinePassRate?: number;
  growth: number;
  midlineGrowth?: number;
}

export interface TermSubjectSummary {
  subject: string;
  avgPct: number;
  passRatePct: number;
  gradedCount: number;
}

export interface TermCohortSummary {
  gradedCount: number;
  avgPct: number;
  passRatePct: number;
  topSubject: TermSubjectSummary | null;
  bottomSubject: TermSubjectSummary | null;
  subjects: TermSubjectSummary[];
}

export interface ExamComparisonPayload {
  perSubject: ExamComparisonSubject[];
  passThresholdPct?: number;
  byTerm?: {
    baseline: TermCohortSummary;
    midline: TermCohortSummary;
    endline: TermCohortSummary;
  };
}

export const createExam = (body: Record<string, unknown>) =>
  api.post<ExamListItem[] | { exams: ExamListItem[] }>('/exams', body).then((r) => r.data);

export const listExams = (params?: ListExamsQuery) =>
  api.get<ExamListItem[]>('/exams', { params }).then((r) => r.data);

export const getExamComparison = (params?: Record<string, string | undefined>) =>
  api.get<ExamComparisonPayload>('/exams/comparison', { params }).then((r) => r.data);

export const getStudentExamScores = (studentId: string) =>
  api.get<Record<string, unknown>[]>(`/exams/students/${studentId}`).then((r) => r.data);

export const getExamById = (examId: string) =>
  api.get<Record<string, unknown>>(`/exams/${examId}`).then((r) => r.data);

/** Fetches exam with auto-sync of active students and program subjects. */
export const getExamSheet = (examId: string) =>
  api.get<ExamSheetPayload>(`/exams/${examId}/sheet`).then((r) => r.data);

export const upsertExamScores = (examId: string, body: Record<string, unknown>) =>
  api.post<{ success: boolean; count?: number }>(`/exams/${examId}/scores`, body).then((r) => r.data);

export const getPendingExamScores = (examId: string) =>
  api.get<Record<string, unknown>[]>(`/exams/${examId}/pending`).then((r) => r.data);
