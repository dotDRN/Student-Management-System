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
      const nowIso = new Date().toISOString();
      const targetCenterIds = Array.isArray(body.centerIds)
        ? (body.centerIds as string[]).filter(Boolean)
        : typeof body.centerId === 'string' && body.centerId
          ? [body.centerId]
          : [];
      const program =
        db && typeof body.programId === 'string'
          ? await db.programs.get(body.programId)
          : undefined;

      // Resolve academicYear by ID or label (e.g. "2026-27")
      let resolvedYear: LocalEntityRecord | undefined;
      if (db && typeof body.academicYearId === 'string' && body.academicYearId) {
        resolvedYear = await db.academicYears.get(body.academicYearId);
        if (!resolvedYear) {
          const allYears = await db.academicYears.toArray();
          resolvedYear = allYears.find((y) => y.label === body.academicYearId);
        }
      }

      const createdExams: ExamListItem[] = [];
      for (const cId of targetCenterIds) {
        const id = generateClientUuid();
        const center = db ? await db.centers.get(cId) : undefined;
        const examTypeStr = String(body.examType ?? 'baseline');
        const examName = String(
          body.name || `${examTypeStr.toUpperCase()} (${String(body.examDate || nowIso.slice(0, 10))})`,
        );

        const localExam: LocalEntityRecord = {
          id,
          centerId: cId,
          programId: String(body.programId ?? ''),
          academicYearId: resolvedYear?.id ?? null,
          name: examName,
          examType: examTypeStr,
          examDate: (body.examDate as string | null) ?? null,
          status: 'DRAFT',
          version: 1,
          createdAt: nowIso,
          updatedAt: nowIso,
          center: center ? { id: center.id, name: String(center.name) } : { id: cId, name: '' },
          program: program ? { id: program.id, name: String(program.name) } : undefined,
          academicYear: resolvedYear
            ? { id: resolvedYear.id, label: String(resolvedYear.label) }
            : typeof body.academicYearId === 'string'
              ? { id: body.academicYearId, label: body.academicYearId }
              : undefined,
        };
        if (db) await db.exams.put(localExam);

        await syncEngine.enqueueMutation({
          entityType: 'exam',
          entityId: id,
          entityLabel: `Exam: ${examName}`,
          action: 'CREATE',
          changedFields: {
            centerId: cId,
            programId: String(body.programId ?? ''),
            academicYearId: resolvedYear?.id ?? null,
            name: examName,
            examType: examTypeStr,
            examDate: (body.examDate as string | null) ?? null,
          },
        });

        createdExams.push(localExam as unknown as ExamListItem);
      }

      return { exams: createdExams };
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
      if (params?.centerId) {
        rows = rows.filter(
          (e) =>
            e.centerId === params.centerId ||
            (e.center as { id?: string } | undefined)?.id === params.centerId,
        );
      }
      if (params?.programId) {
        rows = rows.filter(
          (e) =>
            e.programId === params.programId ||
            (e.program as { id?: string } | undefined)?.id === params.programId,
        );
      }
      if (params?.examType) rows = rows.filter((e) => e.examType === params.examType);
      if (params?.academicYearId) {
        const ay = params.academicYearId;
        rows = rows.filter((e) => {
          const ayObj = e.academicYear as { id?: string; label?: string } | undefined;
          if (!e.academicYearId && !ayObj) return true;
          return e.academicYearId === ay || ayObj?.id === ay || ayObj?.label === ay;
        });
      }
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
  withOfflineRead<ExamComparisonPayload>(
    () => api.get<ExamComparisonPayload>('/exams/comparison', { params }).then((r) => r.data),
    async () => ({ perSubject: [] }),
  );

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
      const subjectMap = new Map(subjects.map((sub) => [sub.id, sub]));
      const studentMap = new Map(students.map((stu) => [stu.id, stu]));
      const rawScores = await db.examScores.where('examId').equals(examId).toArray();
      const scores = rawScores.map((sc) => {
        const stuObj =
          (sc.student as { id: string; fullName: string; rollNumber?: string | null } | undefined) ??
          (sc.studentId && studentMap.get(String(sc.studentId))
            ? {
                id: String(sc.studentId),
                fullName: String(studentMap.get(String(sc.studentId))?.fullName || ''),
                rollNumber: (studentMap.get(String(sc.studentId))?.rollNumber as string | null) ?? null,
              }
            : { id: String(sc.studentId || ''), fullName: '' });
        const subObj =
          (sc.subject as ExamSheetSubject | undefined) ??
          (sc.subjectId && subjectMap.get(String(sc.subjectId))
            ? {
                id: String(sc.subjectId),
                name: String(subjectMap.get(String(sc.subjectId))?.name || ''),
                maxMarks: (subjectMap.get(String(sc.subjectId))?.maxMarks as number | string) ?? 100,
              }
            : undefined);
        return {
          ...sc,
          student: stuObj,
          subject: subObj,
        };
      });

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
      const exam = db ? await db.exams.get(examId) : undefined;
      const programId = String(exam?.programId || '');
      const centerId = String(exam?.centerId || '');
      const scores = Array.isArray(body.scores)
        ? (body.scores as Array<{
            studentId: string;
            subjectId?: string;
            subject?: string;
            maxMarks?: number;
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
        let resolvedSubjectId = sc.subjectId;
        let subjectRecord =
          db && resolvedSubjectId ? await db.programSubjects.get(resolvedSubjectId) : undefined;

        if (!resolvedSubjectId && sc.subject && db) {
          const allSubjects = programId
            ? await db.programSubjects.where('programId').equals(programId).toArray()
            : await db.programSubjects.toArray();
          subjectRecord = allSubjects.find(
            (s) => String(s.name || '').toLowerCase() === sc.subject!.trim().toLowerCase(),
          );
          if (!subjectRecord) {
            const newSubId = generateClientUuid();
            subjectRecord = {
              id: newSubId,
              programId,
              name: sc.subject.trim(),
              maxMarks: sc.maxMarks ?? 100,
              isActive: true,
            };
            await db.programSubjects.put(subjectRecord);
          }
          resolvedSubjectId = subjectRecord.id;
        }
        if (!resolvedSubjectId) continue;

        const key = `${sc.studentId}:${resolvedSubjectId}`;
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

        const student = db ? await db.students.get(sc.studentId) : undefined;

        const localScore: LocalEntityRecord = {
          ...(existing ?? {
            id: entityId,
            examId,
            centerId,
            studentId: sc.studentId,
            subjectId: resolvedSubjectId,
            status: 'DRAFT',
            version: 1,
          }),
          ...nextFields,
          student: student
            ? {
                id: student.id,
                fullName: String(student.fullName || ''),
                rollNumber: (student.rollNumber as string | null) ?? null,
              }
            : { id: sc.studentId, fullName: '' },
          subject: {
            id: resolvedSubjectId,
            name: String(subjectRecord?.name || sc.subject || 'Subject'),
            maxMarks: Number(subjectRecord?.maxMarks ?? sc.maxMarks ?? 100),
          },
          updatedAt: new Date().toISOString(),
        };
        if (db) await db.examScores.put(localScore);

        const label = `Exam Score: ${String(student?.fullName || sc.studentId.slice(0, 6))} · ${String(subjectRecord?.name || sc.subject || 'Subject')}`;

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
            subjectId: resolvedSubjectId,
          },
        });
      }

      return { success: true, count: scores.length, offlineQueued: true };
    },
  );

export const getPendingExamScores = (examId: string) =>
  api.get<Record<string, unknown>[]>(`/exams/${examId}/pending`).then((r) => r.data);
