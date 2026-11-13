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
