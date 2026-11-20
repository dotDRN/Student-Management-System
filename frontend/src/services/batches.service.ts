import api from './api';
import { getActiveOfflineDb } from '../offline/syncEngine';
import { withOfflineRead } from '../offline/offlineServiceHelper';
import type { LocalEntityRecord } from '../offline/offlineDb';

export interface BatchSummary {
  id: string;
  activityId: string;
  centerId: string;
  name: string;
  teacherId?: string | null;
  maxStudents?: number | null;
  createdAt: string;
  updatedAt: string;
  center?: { id: string; name: string } | null;
  teacher?: { id: string; fullName: string; email: string } | null;
  activity?: {
    id: string;
    name: string;
    programId?: string | null;
    program?: { id: string; name: string; code: string } | null;
  } | null;
  _count?: {
    batchEnrollments: number;
    attendanceSessions: number;
  };
}

export interface BatchEnrollmentItem {
  id: string;
  batchId: string;
  studentId: string;
  enrolledOn: string;
  student: {
    id: string;
    fullName: string;
    rollNumber?: string | null;
    programId: string;
    centerId: string;
    isActive: boolean;
    guardianPhone?: string | null;
  };
}

export interface BatchDetail extends BatchSummary {
  batchEnrollments: BatchEnrollmentItem[];
}

export const listBatches = (params?: {
  centerId?: string;
  programId?: string;
  activityId?: string;
  teacherId?: string;
  search?: string;
}) =>
  withOfflineRead<BatchSummary[]>(
    () => api.get<BatchSummary[]>('/batches', { params }).then((r) => r.data),
    async () => {
      const db = getActiveOfflineDb();
      if (!db) return [];
      let rows = (await db.batches.toArray()) as unknown as BatchSummary[];
      if (params?.centerId) rows = rows.filter((b) => b.centerId === params.centerId);
      if (params?.activityId) rows = rows.filter((b) => b.activityId === params.activityId);
      if (params?.teacherId) rows = rows.filter((b) => b.teacherId === params.teacherId);
      if (params?.search) {
        const q = params.search.toLowerCase();
        rows = rows.filter((b) => b.name?.toLowerCase().includes(q));
      }
      return rows;
    },
    async (batches) => {
      const db = getActiveOfflineDb();
      if (db && batches.length > 0) {
        await db.batches.bulkPut(batches as unknown as LocalEntityRecord[]);
      }
    },
  );

export const getBatchById = (batchId: string) =>
  api.get<BatchDetail>(`/batches/${batchId}`).then((r) => r.data);

export const createBatch = (payload: {
  centerId: string;
  programId?: string;
  activityId?: string;
  name: string;
  teacherId?: string | null;
  maxStudents?: number | null;
}) => api.post<BatchSummary>('/batches', payload).then((r) => r.data);

export const updateBatch = (
  batchId: string,
  payload: {
    name?: string;
    teacherId?: string | null;
    maxStudents?: number | null;
  },
) => api.put<BatchSummary>(`/batches/${batchId}`, payload).then((r) => r.data);

export const deleteBatch = (batchId: string) =>
  api.delete<{ deleted: boolean; id: string }>(`/batches/${batchId}`).then((r) => r.data);

export const enrollStudentsInBatch = (batchId: string, studentIds: string[]) =>
  api
    .post<{
      addedCount: number;
      alreadyEnrolledCount: number;
      batch: BatchDetail;
    }>(`/batches/${batchId}/enroll`, { studentIds })
    .then((r) => r.data);

export const removeStudentFromBatch = (batchId: string, studentId: string) =>
  api
    .delete<{ removed: boolean; batchId: string; studentId: string }>(
      `/batches/${batchId}/enroll/${studentId}`,
    )
    .then((r) => r.data);
