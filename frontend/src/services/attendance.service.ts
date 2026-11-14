import api from './api';

export type CreateSessionBody = {
  centerId: string;
  programId: string;
  sessionDate: string;
  activityId?: string;
  batchId?: string;
};

export type UpdateSessionRecordsBody = Record<string, unknown>;

export const createAttendanceSession = (body: CreateSessionBody) =>
  api.post<Record<string, unknown>>('/attendance/sessions', body).then((r) => r.data);

export const getAttendanceSessions = (params?: Record<string, string | undefined>) =>
  api.get<Record<string, unknown>>('/attendance/sessions', { params }).then((r) => r.data);

export const getAttendanceSessionById = (sessionId: string) =>
  api.get<Record<string, unknown>>(`/attendance/sessions/${sessionId}`).then((r) => r.data);

export const getAttendanceSessionRecords = (sessionId: string) =>
  api.get<{ records: unknown[] }>(`/attendance/sessions/${sessionId}/records`).then((r) => r.data);

export const updateAttendanceSessionRecords = (
  sessionId: string,
  body: UpdateSessionRecordsBody,
) =>
  api
    .put<Record<string, unknown>>(`/attendance/sessions/${sessionId}/records`, body)
    .then((r) => r.data);

export const getStudentAttendance = (studentId: string) =>
  api.get<Record<string, unknown>>(`/attendance/students/${studentId}`).then((r) => r.data);

export const getAttendanceSummary = (params?: Record<string, string | undefined>) =>
  api.get<Record<string, unknown>>('/attendance/summary', { params }).then((r) => r.data);

export const getPendingAttendanceSessions = (params?: Record<string, string | undefined>) =>
  api.get<Record<string, unknown>>('/attendance/pending', { params }).then((r) => r.data);

export const getTodayFreshSheet = (centerId: string, programId: string, batchId?: string) =>
  api
    .get<Record<string, unknown>>('/attendance/fresh-sheet', {
      params: { centerId, programId, ...(batchId ? { batchId } : {}) },
    })
    .then((r) => r.data);

export const markHoliday = (sessionId: string, isHoliday: boolean) =>
  api.put<Record<string, unknown>>(`/attendance/sessions/${sessionId}/holiday`, { isHoliday }).then((r) => r.data);

export type RecentAbsenteeRecord = {
  id: string;
  sessionId?: string;
  studentId?: string;
  status: string;
  remarks?: string | null;
  consecutiveAbsenceStreak?: number;
  student?: {
    id: string;
    fullName: string;
    rollNumber?: string | null;
    guardianPhone?: string | null;
  };
  session?: {
    id?: string;
    sessionDate: string;
    center?: { name: string };
    program?: { name: string };
  };
};

export type AttendanceRegisterStudentRow = {
  studentId: string;
  fullName: string;
  rollNumber?: string | null;
  statuses: Record<string, string>;
  remarksByDate: Record<string, string | null>;
  summary: {
    present: number;
    late: number;
    absent: number;
    excused: number;
    pending: number;
    totalMarked: number;
    attendanceRate: number;
  };
};

export type AttendanceRegisterResponse = {
  centerId: string;
  programId: string | null;
  month: string;
  days: string[];
  holidayDates: string[];
  sessionDates: string[];
  students: AttendanceRegisterStudentRow[];
};

export const getRecentAbsentees = (days: number = 7, centerId?: string) =>
  api
    .get<RecentAbsenteeRecord[]>('/attendance/absentees', {
      params: { days, ...(centerId ? { centerId } : {}) },
    })
    .then((r) => r.data);

export const getAttendanceRegister = (params: {
  centerId: string;
  programId?: string;
  batchId?: string;
  month?: string;
}) => api.get<AttendanceRegisterResponse>('/attendance/register', { params }).then((r) => r.data);
