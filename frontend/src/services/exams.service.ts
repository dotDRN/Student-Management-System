import api from './api';
import type { ExamType } from '../types';

export type ListExamsQuery = {
  centerId?: string;
  programId?: string;
  examType?: ExamType;
  academicYearId?: string;
  examDate?: string;
};

type ExamListItem = {
  id: string;
  name: string;
  examType: string;
  createdAt: string;
  center?: { name: string };
};

export const createExam = (body: Record<string, unknown>) =>
  api.post<Record<string, unknown>>('/exams', body).then((r) => r.data);

export const listExams = (params?: ListExamsQuery) =>
  api.get<ExamListItem[]>('/exams', { params }).then((r) => r.data);

export const getExamComparison = (params?: Record<string, string | undefined>) =>
  api.get<Record<string, unknown>>('/exams/comparison', { params }).then((r) => r.data);

export const getStudentExamScores = (studentId: string) =>
  api.get<Record<string, unknown>>(`/exams/students/${studentId}`).then((r) => r.data);

export const getExamById = (examId: string) =>
  api.get<Record<string, unknown>>(`/exams/${examId}`).then((r) => r.data);

/** Fetches exam with auto-sync of missing students. Use this for the marks workspace. */
export const getExamSheet = (examId: string) =>
  api.get<Record<string, unknown>>(`/exams/${examId}/sheet`).then((r) => r.data);

export const upsertExamScores = (examId: string, body: Record<string, unknown>) =>
  api.post<Record<string, unknown>>(`/exams/${examId}/scores`, body).then((r) => r.data);

export const getPendingExamScores = (examId: string) =>
  api.get<Record<string, unknown>>(`/exams/${examId}/pending`).then((r) => r.data);

