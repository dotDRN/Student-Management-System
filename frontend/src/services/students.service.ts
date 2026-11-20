import api from './api';
import { getActiveOfflineDb, syncEngine } from '../offline/syncEngine';
import { withOfflineMutation, withOfflineRead } from '../offline/offlineServiceHelper';
import { computeFieldDiff, generateClientUuid } from '../offline/outboxHelpers';
import type { LocalEntityRecord } from '../offline/offlineDb';
import { useAuthStore } from '../store/useAuthStore';
import type {
  ApiEnvelope,
  AttendanceRecordPayload,
  FeePayment,
  Student,
  StudentCreatePayload,
  StudentProfilePayload,
  StudentUpdatePayload,
  StudentsListResult,
} from '../types';

export type StudentListQuery = {
  page?: number;
  limit?: number;
  search?: string;
  centerId?: string;
  programId?: string;
  batchId?: string;
  sortOrder?: 'name_asc' | 'name_desc' | 'roll_asc' | 'roll_desc' | 'class_asc' | 'class_desc' | '';
  isActive?: boolean | string;
};

export type StudentFilterQuery = Record<string, string | number | boolean | undefined>;

export const getStudents = (params?: StudentListQuery) =>
  withOfflineRead<StudentsListResult>(
    () => api.get<StudentsListResult>('/students', { params }).then((r) => r.data),
    async () => {
      const db = getActiveOfflineDb();
      if (!db) {
        return { students: [], total: 0, page: 1, totalPages: 1, limit: params?.limit ?? 20 };
      }
      let rows = (await db.students.toArray()) as unknown as Student[];
      if (params?.centerId) rows = rows.filter((s) => s.centerId === params.centerId);
      if (params?.programId) rows = rows.filter((s) => s.programId === params.programId);
      if (params?.batchId) {
        const enrollments = await db.batchEnrollments
          .where('batchId')
          .equals(params.batchId)
          .toArray();
        const enrolledIds = new Set(enrollments.map((e) => String(e.studentId)));
        rows = rows.filter((s) => enrolledIds.has(s.id));
      }
      if (params?.isActive !== undefined && params.isActive !== '') {
        const activeTarget = params.isActive === true || params.isActive === 'true';
        rows = rows.filter((s) => Boolean(s.isActive) === activeTarget);
      }
      if (params?.search) {
        const q = params.search.toLowerCase();
        rows = rows.filter(
          (s) =>
            s.fullName?.toLowerCase().includes(q) ||
            (s.rollNumber && s.rollNumber.toLowerCase().includes(q)) ||
            (s.guardianPhone && s.guardianPhone.toLowerCase().includes(q)),
        );
      }
      if (params?.sortOrder === 'name_desc') {
        rows.sort((a, b) => (b.fullName || '').localeCompare(a.fullName || ''));
      } else if (params?.sortOrder === 'roll_asc') {
        rows.sort((a, b) => (a.rollNumber || '').localeCompare(b.rollNumber || ''));
      } else if (params?.sortOrder === 'roll_desc') {
        rows.sort((a, b) => (b.rollNumber || '').localeCompare(a.rollNumber || ''));
      } else {
        rows.sort((a, b) => (a.fullName || '').localeCompare(b.fullName || ''));
      }
      const page = params?.page ?? 1;
      const limit = params?.limit ?? 50;
      const total = rows.length;
      const start = (page - 1) * limit;
      return {
        students: rows.slice(start, start + limit),
        total,
        page,
        totalPages: Math.max(1, Math.ceil(total / limit)),
        limit,
      };
    },
    async (res) => {
      const db = getActiveOfflineDb();
      if (db && Array.isArray(res.students) && res.students.length > 0) {
        await db.students.bulkPut(res.students as unknown as LocalEntityRecord[]);
      }
    },
  );

export const filterStudents = (params?: StudentFilterQuery) =>
  api.get<StudentsListResult>('/students/filter', { params }).then((r) => r.data);

export const getStudentDashboardStats = () =>
  api
    .get<ApiEnvelope<Record<string, unknown>>>('/students/dashboard')
    .then((r) => r.data);

export const getStudentById = (id: string) =>
  withOfflineRead<Student>(
    () => api.get<Student>(`/students/${id}`).then((r) => r.data),
    async () => {
      const db = getActiveOfflineDb();
      const row = db ? await db.students.get(id) : undefined;
      if (!row) throw new Error('Student not available in offline cache');
      return row as unknown as Student;
    },
    async (student) => {
      const db = getActiveOfflineDb();
      if (db && student?.id) {
        await db.students.put(student as unknown as LocalEntityRecord);
      }
    },
  );

export const getStudentSummary = (id: string) =>
  api.get<Record<string, unknown>>(`/students/${id}/summary`).then((r) => r.data);

export const getStudentProfile = (id: string) =>
  withOfflineRead<StudentProfilePayload>(
    () => api.get<StudentProfilePayload>(`/students/${id}/profile`).then((r) => r.data),
    async () => {
      const db = getActiveOfflineDb();
      if (!db) throw new Error('Offline storage unavailable');
      const student = (await db.students.get(id)) as unknown as Student | undefined;
      if (!student) throw new Error('Student profile not found in offline cache');
      const [attendance, examScores, skills, submissions] = await Promise.all([
        db.attendanceRecords.where('studentId').equals(id).toArray(),
        db.examScores.where('studentId').equals(id).toArray(),
        db.skillLogs.where('studentId').equals(id).toArray(),
        db.formSubmissions.where('studentId').equals(id).toArray(),
      ]);
      const marked = attendance.filter((a) => a.status !== 'pending' && a.status !== 'excused');
      const presentCount = marked.filter((a) => a.status === 'present' || a.status === 'late').length;
      const attendancePct = marked.length > 0 ? Math.round((presentCount / marked.length) * 100) : 0;
      return {
        student,
        stats: {
          attendancePct,
          totalSessions: marked.length,
          presentCount,
        },
        skills: skills as unknown as StudentProfilePayload['skills'],
        attendance: attendance as unknown as StudentProfilePayload['attendance'],
        examScores: examScores as unknown as StudentProfilePayload['examScores'],
        formSubmissions: submissions as unknown as StudentProfilePayload['formSubmissions'],
      };
    },
    async (profile) => {
      const db = getActiveOfflineDb();
      if (db && profile?.student?.id) {
        await db.students.put(profile.student as unknown as LocalEntityRecord);
      }
    },
  );

export const createStudent = (payload: StudentCreatePayload) =>
  withOfflineMutation<Student>(
    () => api.post<ApiEnvelope<Student>>('/students', payload).then((r) => r.data.data),
    async () => {
      const db = getActiveOfflineDb();
      const id = generateClientUuid();
      const nowIso = new Date().toISOString();
      const [center, program] = db
        ? await Promise.all([
            db.centers.get(payload.centerId),
            payload.programId ? db.programs.get(payload.programId) : Promise.resolve(undefined),
          ])
        : [undefined, undefined];

      const localStudent: Student = {
        id,
        centerId: payload.centerId,
        programId: payload.programId,
        fullName: payload.fullName,
        rollNumber: payload.rollNumber ?? null,
        dob: payload.dob ?? null,
        gender: payload.gender ?? null,
        guardianName: payload.guardianName ?? null,
        guardianPhone: payload.guardianPhone ?? null,
        stream: payload.stream ?? null,
        post12thChoice: payload.post12thChoice ?? null,
        collegeName: payload.collegeName ?? null,
        educationDiscontinued: payload.educationDiscontinued ?? false,
        enrollmentDate: payload.enrollmentDate ?? nowIso.slice(0, 10),
        isActive: payload.isActive ?? true,
        feesPaid: 0,
        isFullyPaid: false,
        version: 1,
        createdAt: nowIso,
        updatedAt: nowIso,
        center: center as unknown as Student['center'],
        program: program as unknown as Student['program'],
      };

      if (db) {
        await db.students.put(localStudent as unknown as LocalEntityRecord);
      }

      await syncEngine.enqueueMutation({
        entityType: 'student',
        entityId: id,
        entityLabel: `Student: ${payload.fullName}`,
        action: 'CREATE',
        changedFields: { ...(payload as unknown as Record<string, unknown>) },
      });

      return localStudent;
    },
    async (created) => {
      const db = getActiveOfflineDb();
      if (db && created?.id) {
        await db.students.put(created as unknown as LocalEntityRecord);
      }
    },
  );

export const updateStudent = (id: string, payload: StudentUpdatePayload) =>
  withOfflineMutation<Student>(
    () => api.put<Student>(`/students/${id}`, payload).then((r) => r.data),
    async () => {
      const db = getActiveOfflineDb();
      const existing = db ? await db.students.get(id) : undefined;
      const baseVersion = typeof existing?.version === 'number' ? existing.version : 1;
      const { baseSnapshot, changedFields } = computeFieldDiff(
        existing as Record<string, unknown> | undefined,
        payload as unknown as Record<string, unknown>,
      );

      const updated: LocalEntityRecord = {
        ...(existing ?? { id }),
        ...(payload as Record<string, unknown>),
        id,
        updatedAt: new Date().toISOString(),
      };

      if (db) {
        await db.students.put(updated);
      }

      if (Object.keys(changedFields).length > 0) {
        await syncEngine.enqueueMutation({
          entityType: 'student',
          entityId: id,
          entityLabel: `Student: ${String(updated.fullName || id.slice(0, 8))}`,
          action: 'UPDATE',
          baseVersion,
          baseSnapshot,
          changedFields,
        });
      }

      return updated as unknown as Student;
    },
    async (updated) => {
      const db = getActiveOfflineDb();
      if (db && updated?.id) {
        await db.students.put(updated as unknown as LocalEntityRecord);
      }
    },
  );

export const deleteStudent = (id: string) =>
  withOfflineMutation<Record<string, unknown>>(
    () => api.delete<Record<string, unknown>>(`/students/${id}`).then((r) => r.data),
    async () => {
      const db = getActiveOfflineDb();
      const existing = db ? await db.students.get(id) : undefined;
      if (db) {
        await db.students.delete(id);
      }
      await syncEngine.enqueueMutation({
        entityType: 'student',
        entityId: id,
        entityLabel: `Student: ${String(existing?.fullName || id.slice(0, 8))}`,
        action: 'DELETE',
        baseVersion: typeof existing?.version === 'number' ? existing.version : 1,
        changedFields: {},
      });
      return { success: true, id, offlineQueued: true };
    },
    async () => {
      const db = getActiveOfflineDb();
      if (db) await db.students.delete(id);
    },
  );

export const addStudentAttendance = (studentId: string, payload: AttendanceRecordPayload) =>
  api
    .post<ApiEnvelope<unknown>>(`/students/${studentId}/attendance`, payload)
    .then((r) => r.data);

export const getAttendanceByStudent = (studentId: string) =>
  api
    .get<ApiEnvelope<unknown[]>>(`/students/${studentId}/attendance`)
    .then((r) => r.data);

export const updateStudentAttendance = (attendanceId: string, payload: AttendanceRecordPayload) =>
  api
    .put<ApiEnvelope<unknown>>(`/students/attendance/${attendanceId}`, payload)
    .then((r) => r.data);

// ─────────────── Transfer Workflow ───────────────

export const requestTransfer = (studentIds: string[]) =>
  api.post<{ success: boolean; updated: number }>('/students/transfers/request', { studentIds }).then((r) => r.data);

export const getTransferRequests = () =>
  api.get<ApiEnvelope<Student[]>>('/students/transfers/pending').then((r) => r.data.data);

export const completeTransfer = (studentIds: string[], newTeacherId: string, newCenterId: string) =>
  api.post<{ success: boolean; transferred: number }>('/students/transfers/complete', {
    studentIds,
    newTeacherId,
    newCenterId,
  }).then((r) => r.data);

// ─────────────── Fee Management ───────────────

export const addFeePayment = (studentId: string, amount: number, notes?: string) =>
  withOfflineMutation<FeePayment>(
    () =>
      api
        .post<ApiEnvelope<FeePayment>>(`/students/${studentId}/fees`, { amount, notes })
        .then((r) => r.data.data),
    async () => {
      const db = getActiveOfflineDb();
      const paymentId = generateClientUuid();
      const nowIso = new Date().toISOString();
      const createdBy = useAuthStore.getState().currentUser?.id || '';

      const localPayment: FeePayment = {
        id: paymentId,
        studentId,
        amount,
        notes: notes ?? null,
        paidAt: nowIso,
        createdBy,
      };

      if (db) {
        await db.feePayments.put(localPayment as unknown as LocalEntityRecord);
        const student = await db.students.get(studentId);
        if (student) {
          const nextPaid = Number(student.feesPaid || 0) + Number(amount);
          const totalFees = Number(student.totalFees || 0);
          await db.students.put({
            ...student,
            feesPaid: nextPaid,
            isFullyPaid: totalFees > 0 && nextPaid >= totalFees,
          });
        }
      }

      await syncEngine.enqueueMutation({
        entityType: 'fee_payment',
        entityId: paymentId,
        entityLabel: `Fee Payment (₹${amount})`,
        action: 'CREATE',
        changedFields: { studentId, amount, notes: notes ?? null, paidAt: nowIso },
      });

      return localPayment;
    },
    async (payment) => {
      const db = getActiveOfflineDb();
      if (db && payment?.id) {
        await db.feePayments.put(payment as unknown as LocalEntityRecord);
      }
    },
  );

export const getFeePayments = (studentId: string) =>
  withOfflineRead<FeePayment[]>(
    () => api.get<ApiEnvelope<FeePayment[]>>(`/students/${studentId}/fees`).then((r) => r.data.data),
    async () => {
      const db = getActiveOfflineDb();
      if (!db) return [];
      const rows = await db.feePayments.where('studentId').equals(studentId).toArray();
      return (rows as unknown as FeePayment[]).sort((a, b) =>
        String(b.paidAt).localeCompare(String(a.paidAt)),
      );
    },
    async (payments) => {
      const db = getActiveOfflineDb();
      if (db && payments.length > 0) {
        await db.feePayments.bulkPut(payments as unknown as LocalEntityRecord[]);
      }
    },
  );

export const updateStudentFees = (studentId: string, data: { totalFees?: number; isFullyPaid?: boolean }) =>
  withOfflineMutation<Student>(
    () =>
      api
        .put<ApiEnvelope<Student>>(`/students/${studentId}/fees/update`, data)
        .then((r) => r.data.data),
    async () => {
      const db = getActiveOfflineDb();
      const existing = db ? await db.students.get(studentId) : undefined;
      const baseVersion = typeof existing?.version === 'number' ? existing.version : 1;
      const { baseSnapshot, changedFields } = computeFieldDiff(
        existing as Record<string, unknown> | undefined,
        data as Record<string, unknown>,
      );
      const nextTotal = data.totalFees ?? Number(existing?.totalFees ?? 0);
      const feesPaid = Number(existing?.feesPaid ?? 0);
      const updated: LocalEntityRecord = {
        ...(existing ?? { id: studentId }),
        ...data,
        isFullyPaid: nextTotal > 0 ? feesPaid >= nextTotal : Boolean(data.isFullyPaid),
        updatedAt: new Date().toISOString(),
      };
      if (db) await db.students.put(updated);
      await syncEngine.enqueueMutation({
        entityType: 'student',
        entityId: studentId,
        entityLabel: `Student Fees: ${String(existing?.fullName || studentId.slice(0, 8))}`,
        action: 'UPDATE',
        baseVersion,
        baseSnapshot,
        changedFields,
      });
      return updated as unknown as Student;
    },
    async (student) => {
      const db = getActiveOfflineDb();
      if (db && student?.id) {
        await db.students.put(student as unknown as LocalEntityRecord);
      }
    },
  );

// ─────────────── Bulk Import & Guardians ───────────────

export interface BulkImportStudentRowInput {
  fullName: string;
  rollNumber?: string;
  dob?: string;
  gender?: 'male' | 'female' | 'other';
  guardianName?: string;
  guardianPhone?: string;
  address?: string;
  stream?: string;
  post12thChoice?: string;
  collegeName?: string;
  educationDiscontinued?: boolean;
  enrollmentDate?: string;
  totalFees?: number;
}

export interface BulkImportStudentsResponse {
  success: boolean;
  createdCount: number;
  students: Student[];
}

export interface GuardianLinkItem {
  id: string;
  parentUserId: string;
  studentId: string;
  parent: {
    id: string;
    fullName: string;
    email: string;
    phone?: string | null;
  };
}

export const bulkImportStudents = (payload: {
  centerId: string;
  programId: string;
  academicYearId?: string | null;
  students: BulkImportStudentRowInput[];
}) => api.post<BulkImportStudentsResponse>('/students/bulk-import', payload).then((r) => r.data);

export const linkGuardian = (studentId: string, payload: { parentUserId?: string; email?: string }) =>
  api.post<ApiEnvelope<GuardianLinkItem>>(`/students/${studentId}/guardians`, payload).then((r) => r.data.data);

export const unlinkGuardian = (studentId: string, parentUserId: string) =>
  api.delete<{ success: boolean; deleted: boolean }>(`/students/${studentId}/guardians/${parentUserId}`).then((r) => r.data);

// ─────────────── 360° Longitudinal Dossier & Document Vault ───────────────

export type DocumentCategory =
  | 'identity'
  | 'academic'
  | 'certificate'
  | 'medical'
  | 'consent'
  | 'other';

export type DossierTimelineEventType =
  | 'enrollment'
  | 'lifecycle'
  | 'transfer'
  | 'exam'
  | 'skill'
  | 'fee'
  | 'activity'
  | 'alert'
  | 'document';

export interface DossierTimelineEvent {
  id: string;
  date: string;
  type: DossierTimelineEventType;
  title: string;
  subtitle: string;
  badge?: string | null;
}

export interface StudentDocumentRecord {
  id: string;
  title: string;
  category: DocumentCategory;
  url: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
  notes: string | null;
  uploadedAt: string;
  uploadedByName: string | null;
}

export interface StudentDossierResponse {
  studentId: string;
  summary: {
    totalEvents: number;
    examMilestones: number;
    skillMilestones: number;
    feePaymentsCount: number;
    transfersCount: number;
    documentCount: number;
  };
  timeline: DossierTimelineEvent[];
  documents: StudentDocumentRecord[];
}

export interface AddStudentDocumentPayload {
  title: string;
  category: DocumentCategory;
  notes?: string;
  url?: string;
  fileName?: string;
  file?: File;
}

export const getStudentDossier = (studentId: string) =>
  api.get<ApiEnvelope<StudentDossierResponse>>(`/students/${studentId}/dossier`).then((r) => r.data.data);

export const listStudentDocuments = (studentId: string) =>
  api.get<ApiEnvelope<StudentDocumentRecord[]>>(`/students/${studentId}/documents`).then((r) => r.data.data);

export const addStudentDocument = (studentId: string, payload: AddStudentDocumentPayload) => {
  if (payload.file) {
    const formData = new FormData();
    formData.append('title', payload.title);
    formData.append('category', payload.category);
    if (payload.notes) formData.append('notes', payload.notes);
    formData.append('file', payload.file);
    return api
      .post<ApiEnvelope<StudentDocumentRecord>>(`/students/${studentId}/documents`, formData)
      .then((r) => r.data.data);
  }
  return api
    .post<ApiEnvelope<StudentDocumentRecord>>(`/students/${studentId}/documents`, {
      title: payload.title,
      category: payload.category,
      notes: payload.notes,
      url: payload.url,
      fileName: payload.fileName,
    })
    .then((r) => r.data.data);
};

export const deleteStudentDocument = (studentId: string, documentId: string) =>
  api
    .delete<{ success: boolean; deleted: boolean; id: string }>(`/students/${studentId}/documents/${documentId}`)
    .then((r) => r.data);


