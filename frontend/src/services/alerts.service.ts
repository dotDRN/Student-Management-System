import api from './api';

export type AlertMetric =
  | 'consecutive_absences'
  | 'attendance_30d_pct'
  | 'exam_score_drop_pct'
  | 'fee_overdue_balance';

export type AlertCondition = 'lt' | 'lte' | 'gt' | 'gte' | 'eq';

export interface AlertRuleRecord {
  id: string;
  centerId?: string | null;
  programId?: string | null;
  metric: AlertMetric;
  condition: AlertCondition;
  threshold: number | string;
  description?: string | null;
  notifyRoles: string[];
  isActive: boolean;
  createdAt: string;
  center?: { id: string; name: string } | null;
  program?: { id: string; name: string } | null;
  createdByUser?: { id: string; fullName: string } | null;
  _count?: { alerts: number };
}

export interface AlertRecord {
  id: string;
  ruleId: string;
  recipientId: string;
  studentId?: string | null;
  centerId: string;
  message: string;
  metricValue?: number | string | null;
  isRead: boolean;
  createdAt: string;
  rule?: {
    id: string;
    metric: AlertMetric;
    condition: AlertCondition;
    threshold: number | string;
    description?: string | null;
  } | null;
  student?: {
    id: string;
    fullName: string;
    rollNumber?: string | null;
    programId?: string | null;
  } | null;
  center?: { id: string; name: string } | null;
  recipient?: { id: string; fullName: string; role: string } | null;
}

export const listAlertRules = (params?: { centerId?: string; activeOnly?: boolean }) =>
  api.get<AlertRuleRecord[]>('/alerts/rules', { params }).then((r) => r.data);

export const createAlertRule = (payload: {
  centerId?: string | null;
  programId?: string | null;
  metric: AlertMetric;
  condition: AlertCondition;
  threshold: number;
  description?: string | null;
  notifyRoles: string[];
}) => api.post<AlertRuleRecord>('/alerts/rules', payload).then((r) => r.data);

export const updateAlertRule = (
  ruleId: string,
  payload: Partial<{
    metric: AlertMetric;
    condition: AlertCondition;
    threshold: number;
    description: string | null;
    notifyRoles: string[];
    isActive: boolean;
  }>,
) => api.put<AlertRuleRecord>(`/alerts/rules/${ruleId}`, payload).then((r) => r.data);

export const listAlerts = (params?: {
  centerId?: string;
  status?: 'open' | 'read' | 'all';
  limit?: number;
}) =>
  api
    .get<{ alerts: AlertRecord[]; openCount: number }>('/alerts', { params })
    .then((r) => r.data);

export const evaluateAlertRulesNow = (centerId?: string) =>
  api
    .post<{
      evaluatedRules: number;
      evaluatedStudents: number;
      createdAlerts: number;
      skippedDuplicates: number;
    }>('/alerts/evaluate', centerId ? { centerId } : {})
    .then((r) => r.data);

export const updateAlertStatus = (alertId: string, isRead: boolean) =>
  api.patch<AlertRecord>(`/alerts/${alertId}/status`, { isRead }).then((r) => r.data);
