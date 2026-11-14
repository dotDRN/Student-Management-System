import api from './api';

export type ActivityStatus = 'planned' | 'ongoing' | 'completed' | 'cancelled';
export type ActivityType = 'class' | 'game' | 'visit' | 'camp' | 'exam' | 'general';

export interface ActivityRecord {
  id: string;
  centerId: string;
  programId?: string | null;
  name: string;
  description?: string | null;
  activityType?: ActivityType;
  status: ActivityStatus;
  completionNotes?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  volunteers: string[];
  center?: { id?: string; name: string } | null;
  program?: { id?: string; name: string } | null;
  _count?: { activityEnrollments?: number };
}

export interface ListActivitiesQuery {
  centerId?: string;
  programId?: string;
  status?: ActivityStatus;
  from?: string;
  to?: string;
  search?: string;
}

export interface CreateActivityPayload {
  centerIds: string[];
  programId?: string;
  name: string;
  description?: string;
  activityType?: ActivityType;
  status?: ActivityStatus;
  startDate?: string;
  endDate?: string;
  volunteers?: string[];
}

export interface UpdateActivityPayload {
  programId?: string | null;
  name?: string;
  description?: string | null;
  activityType?: ActivityType;
  status?: ActivityStatus;
  completionNotes?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  volunteers?: string[];
}

export const listActivities = (params?: ListActivitiesQuery) =>
  api.get<ActivityRecord[]>('/activities', { params }).then((r) => (Array.isArray(r.data) ? r.data : []));

export const getActivity = (activityId: string) =>
  api.get<ActivityRecord>(`/activities/${activityId}`).then((r) => r.data);

export const createActivity = (payload: CreateActivityPayload) =>
  api.post<ActivityRecord[]>('/activities', payload).then((r) => r.data);

export const updateActivity = (activityId: string, payload: UpdateActivityPayload) =>
  api.put<ActivityRecord>(`/activities/${activityId}`, payload).then((r) => r.data);

export const deleteActivity = (activityId: string) =>
  api.delete(`/activities/${activityId}`);

export type ActivityEnrollmentStatus = 'requested_by_teacher' | 'approved_by_admin';

export interface ActivityEnrollmentRecord {
  id: string;
  activityId: string;
  studentId: string;
  status: ActivityEnrollmentStatus;
  requestedBy: string;
  createdAt: string;
  student?: {
    id: string;
    fullName: string;
    rollNumber?: string | null;
    centerId: string;
    programId: string;
    program?: { id: string; name: string } | null;
  };
  requestedByUser?: {
    id: string;
    fullName: string;
    role?: string;
  } | null;
  activity?: {
    id: string;
    name: string;
    activityType?: ActivityType;
    status: ActivityStatus;
    startDate?: string | null;
    endDate?: string | null;
    center?: { id: string; name: string } | null;
    program?: { id: string; name: string } | null;
  };
}

export interface HolisticCreditSummary {
  totalEnrolled: number;
  approvedCount: number;
  pendingCount: number;
  completedCount: number;
  holisticPoints: number;
}

export interface StudentActivityEnrollmentsResponse {
  studentId: string;
  enrollments: ActivityEnrollmentRecord[];
  summary: HolisticCreditSummary;
}

export const listActivityEnrollments = (activityId: string) =>
  api
    .get<ActivityEnrollmentRecord[]>(`/activities/${activityId}/enrollments`)
    .then((r) => (Array.isArray(r.data) ? r.data : []));

export const enrollStudentsInActivity = (activityId: string, studentIds: string[]) =>
  api
    .post<{
      activityId: string;
      status: ActivityEnrollmentStatus;
      enrolledCount: number;
      skippedCount: number;
      enrollments: ActivityEnrollmentRecord[];
    }>(`/activities/${activityId}/enrollments`, { studentIds })
    .then((r) => r.data);

export const updateActivityEnrollmentStatus = (
  activityId: string,
  studentId: string,
  status: ActivityEnrollmentStatus,
) =>
  api
    .patch<ActivityEnrollmentRecord>(`/activities/${activityId}/enrollments/${studentId}`, {
      status,
    })
    .then((r) => r.data);

export const removeActivityEnrollment = (activityId: string, studentId: string) =>
  api.delete(`/activities/${activityId}/enrollments/${studentId}`);

export const getStudentActivityEnrollments = (studentId: string) =>
  api
    .get<StudentActivityEnrollmentsResponse>(`/activities/students/${studentId}`)
    .then((r) => r.data);
