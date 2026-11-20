import api from './api';
import type { ExamType } from '../types';
import { getActiveOfflineDb, syncEngine } from '../offline/syncEngine';
import { withOfflineMutation, withOfflineRead } from '../offline/offlineServiceHelper';
import { computeFieldDiff, generateClientUuid } from '../offline/outboxHelpers';
import type { LocalEntityRecord } from '../offline/offlineDb';

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
  withOfflineMutation<ExamListItem[] | { exams: ExamListItem[] }>(
    () => api.post<ExamListItem[] | { exams: ExamListItem[] }>('/exams', body).then((r) => r.data),
    async () => {
      const db = getActiveOfflineDb();
      const id = generateClientUuid();
      const nowIso = new Date().toISOString();
      const [center, program] = db
        ? await Promise.all([
            typeof body.centerId === 'string' ? db.centers.get(body.centerId) : Promise.resolve(undefined),
            typeof body.programId === 'string' ? db.programs.get(body.programId) : Promise.resolve(undefined),
          ])
        : [undefined, undefined];

      const localExam: LocalEntityRecord = {
        id,
        centerId: String(body.centerId ?? ''),
        programId: String(body.programId ?? ''),
        academicYearId: (body.academicYearId as string | null) ?? null,
        name: String(body.name ?? ''),
        examType: String(body.examType ?? 'baseline'),
        examDate: (body.examDate as string | null) ?? null,
        status: 'DRAFT',
        version: 1,
        createdAt: nowIso,
        updatedAt: nowIso,
        center: center ? { id: center.id, name: String(center.name) } : undefined,
        program: program ? { id: program.id, name: String(program.name) } : undefined,
      };
      if (db) await db.exams.put(localExam);

      await syncEngine.enqueueMutation({
        entityType: 'exam',
        entityId: id,
        entityLabel: `Exam: ${String(body.name || 'New Exam')}`,
        action: 'CREATE',
        changedFields: { ...body },
      });

      return [localExam as unknown as ExamListItem];
    },
    async (res) => {
      const db = getActiveOfflineDb();
      const list = Array.isArray(res) ? res : res?.exams;
      if (db && Array.isArray(list) && list.length > 0) {
        await db.exams.bulkPut(list as unknown as LocalEntityRecord[]);
      }
    },
  );

export const listExams = (params?: ListExamsQuery) =>
  withOfflineRead<ExamListItem[]>(
    () => api.get<ExamListItem[]>('/exams', { params }).then((r) => r.data),
    async () => {
      const db = getActiveOfflineDb();
      if (!db) return [];
      let rows = await db.exams.toArray();
      if (params?.centerId) rows = rows.filter((e) => e.centerId === params.centerId);
      if (params?.programId) rows = rows.filter((e) => e.programId === params.programId);
      if (params?.examType) rows = rows.filter((e) => e.examType === params.examType);
      if (params?.academicYearId) rows = rows.filter((e) => e.academicYearId === params.academicYearId);
      rows.sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
      return rows as unknown as ExamListItem[];
    },
    async (exams) => {
      const db = getActiveOfflineDb();
      if (db && exams.length > 0) {
        await db.exams.bulkPut(exams as unknown as LocalEntityRecord[]);
      }
    },
  );

export const getExamComparison = (params?: Record<string, string | undefined>) =>
  api.get<ExamComparisonPayload>('/exams/comparison', { params }).then((r) => r.data);

export const getStudentExamScores = (studentId: string) =>
  withOfflineRead<Record<string, unknown>[]>(
    () => api.get<Record<string, unknown>[]>(`/exams/students/${studentId}`).then((r) => r.data),
    async () => {
      const db = getActiveOfflineDb();
      if (!db) return [];
      return (await db.examScores.where('studentId').equals(studentId).toArray()) as Record<
        string,
        unknown
      >[];
    },
  );

export const getExamById = (examId: string) =>
  withOfflineRead<Record<string, unknown>>(
    () => api.get<Record<string, unknown>>(`/exams/${examId}`).then((r) => r.data),
    async () => {
      const db = getActiveOfflineDb();
      const row = db ? await db.exams.get(examId) : undefined;
      if (!row) throw new Error('Exam not found in offline cache');
      return row;
    },
  );

/** Fetches exam with auto-sync of active students and program subjects. */
export const getExamSheet = (examId: string, batchId?: string) =>
  withOfflineRead<ExamSheetPayload>(
    () =>
      api
        .get<ExamSheetPayload>(`/exams/${examId}/sheet`, {
          params: batchId ? { batchId } : undefined,
        })
        .then((r) => r.data),
    async () => {
      const db = getActiveOfflineDb();
      if (!db) throw new Error('Offline storage unavailable');
      const exam = await db.exams.get(examId);
      if (!exam) throw new Error('Exam sheet not cached offline');
      const centerId = String(exam.centerId || '');
      const programId = String(exam.programId || '');

      let students = (await db.students.where('centerId').equals(centerId).toArray()).filter(
        (s) => s.isActive !== false && (!programId || s.programId === programId),
      );
      if (batchId) {
        const enrollments = await db.batchEnrollments.where('batchId').equals(batchId).toArray();
        const enrolledIds = new Set(enrollments.map((e) => String(e.studentId)));
        students = students.filter((s) => enrolledIds.has(s.id));
      }
      const subjects = await db.programSubjects.where('programId').equals(programId).toArray();
      const scores = await db.examScores.where('examId').equals(examId).toArray();

      return {
        id: exam.id,
        name: String(exam.name || ''),
        examType: String(exam.examType || ''),
        examDate: (exam.examDate as string | null) ?? null,
        centerId,
        programId,
        academicYear: (exam.academicYear as ExamSheetPayload['academicYear']) ?? null,
        center: (exam.center as ExamSheetPayload['center']) ?? null,
        program: (exam.program as ExamSheetPayload['program']) ?? null,
        students: students.map((s) => ({
          id: s.id,
          fullName: String(s.fullName || ''),
          rollNumber: (s.rollNumber as string | null) ?? null,
        })),
        subjects: subjects.map((sub) => ({
          id: sub.id,
          name: String(sub.name || ''),
          maxMarks: (sub.maxMarks as number | string) ?? 100,
        })),
        scores: scores as unknown as ExamSheetScore[],
      };
    },
    async (sheet) => {
      const db = getActiveOfflineDb();
      if (!db) return;
      if (sheet.id) {
        await db.exams.put({
          id: sheet.id,
          name: sheet.name,
          examType: sheet.examType,
          examDate: sheet.examDate ?? null,
          centerId: sheet.centerId,
          programId: sheet.programId,
          center: sheet.center ?? null,
          program: sheet.program ?? null,
          academicYear: sheet.academicYear ?? null,
        });
      }
      if (Array.isArray(sheet.subjects) && sheet.subjects.length > 0) {
        await db.programSubjects.bulkPut(
          sheet.subjects.map((sub) => ({
            ...sub,
            programId: sheet.programId,
          })) as unknown as LocalEntityRecord[],
        );
      }
      if (Array.isArray(sheet.scores) && sheet.scores.length > 0) {
        await db.examScores.bulkPut(
          sheet.scores
            .filter((sc) => typeof sc.id === 'string')
            .map((sc) => ({
              ...sc,
              id: sc.id as string,
              examId: sheet.id,
              centerId: sheet.centerId,
              studentId: sc.student?.id ?? '',
              subjectId: sc.subject?.id ?? '',
            })) as unknown as LocalEntityRecord[],
        );
      }
    },
  );

export const upsertExamScores = (examId: string, body: Record<string, unknown>) =>
  withOfflineMutation<{ success: boolean; count?: number; offlineQueued?: boolean }>(
    () =>
      api
        .post<{ success: boolean; count?: number }>(`/exams/${examId}/scores`, body)
        .then((r) => r.data),
    async () => {
      const db = getActiveOfflineDb();
      const scores = Array.isArray(body.scores)
        ? (body.scores as Array<{
            studentId: string;
            subjectId: string;
            marks: number | null;
            isAbsent?: boolean;
            remarks?: string | null;
          }>)
        : [];
      const existingScores = db
        ? await db.examScores.where('examId').equals(examId).toArray()
        : [];
      const existingByKey = new Map(
        existingScores.map((s) => [`${String(s.studentId)}:${String(s.subjectId)}`, s]),
      );

      for (const sc of scores) {
        const key = `${sc.studentId}:${sc.subjectId}`;
        const existing = existingByKey.get(key);
        const entityId = existing?.id || generateClientUuid();
        const baseVersion = typeof existing?.version === 'number' ? existing.version : 1;

        const nextFields = {
          marks: sc.isAbsent ? null : sc.marks,
          isAbsent: Boolean(sc.isAbsent ?? false),
          remarks: sc.remarks ?? null,
        };
        const { baseSnapshot, changedFields } = computeFieldDiff(
          existing as Record<string, unknown> | undefined,
          nextFields,
        );

        const localScore: LocalEntityRecord = {
          ...(existing ?? {
            id: entityId,
            examId,
            studentId: sc.studentId,
            subjectId: sc.subjectId,
            status: 'DRAFT',
            version: 1,
          }),
          ...nextFields,
          updatedAt: new Date().toISOString(),
        };
        if (db) await db.examScores.put(localScore);

        const student = db ? await db.students.get(sc.studentId) : undefined;
        const subject = db ? await db.programSubjects.get(sc.subjectId) : undefined;
        const label = `Exam Score: ${String(student?.fullName || sc.studentId.slice(0, 6))} · ${String(subject?.name || 'Subject')}`;

        await syncEngine.enqueueMutation({
          entityType: 'exam_score',
          entityId,
          entityLabel: label,
          action: existing ? 'UPDATE' : 'CREATE',
          baseVersion,
          baseSnapshot,
          changedFields: {
            ...(Object.keys(changedFields).length > 0 ? changedFields : nextFields),
            examId,
            studentId: sc.studentId,
            subjectId: sc.subjectId,
          },
        });
      }

      return { success: true, count: scores.length, offlineQueued: true };
    },
  );

export const getPendingExamScores = (examId: string) =>
  api.get<Record<string, unknown>[]>(`/exams/${examId}/pending`).then((r) => r.data);
