import api from './api';
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
  api.get<StudentsListResult>('/students', { params }).then((r) => r.data);

export const filterStudents = (params?: StudentFilterQuery) =>
  api.get<StudentsListResult>('/students/filter', { params }).then((r) => r.data);

export const getStudentDashboardStats = () =>
  api
    .get<ApiEnvelope<Record<string, unknown>>>('/students/dashboard')
    .then((r) => r.data);

export const getStudentById = (id: string) =>
  api.get<Student>(`/students/${id}`).then((r) => r.data);

export const getStudentSummary = (id: string) =>
  api.get<Record<string, unknown>>(`/students/${id}/summary`).then((r) => r.data);

export const getStudentProfile = (id: string) =>
  api.get<StudentProfilePayload>(`/students/${id}/profile`).then((r) => r.data);

export const createStudent = (payload: StudentCreatePayload) =>
  api.post<ApiEnvelope<Student>>('/students', payload).then((r) => r.data.data);

export const updateStudent = (id: string, payload: StudentUpdatePayload) =>
  api.put<Student>(`/students/${id}`, payload).then((r) => r.data);

export const deleteStudent = (id: string) =>
  api.delete<Record<string, unknown>>(`/students/${id}`).then((r) => r.data);

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
  api.post<ApiEnvelope<FeePayment>>(`/students/${studentId}/fees`, { amount, notes }).then((r) => r.data.data);

export const getFeePayments = (studentId: string) =>
  api.get<ApiEnvelope<FeePayment[]>>(`/students/${studentId}/fees`).then((r) => r.data.data);

export const updateStudentFees = (studentId: string, data: { totalFees?: number; isFullyPaid?: boolean }) =>
  api.put<ApiEnvelope<Student>>(`/students/${studentId}/fees/update`, data).then((r) => r.data.data);

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


