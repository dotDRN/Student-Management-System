import api from './api';
import type { HolisticCreditSummary } from './activities.service';

export interface LinkedChildSummary {
  id: string;
  fullName: string;
  rollNumber?: string | null;
  dob?: string | null;
  gender?: string | null;
  enrollmentDate: string;
  isActive: boolean;
  totalFees: number | null;
  feesPaid: number;
  isFullyPaid: boolean;
  center?: { id: string; name: string; location?: string | null } | null;
  program?: { id: string; name: string; code?: string | null } | null;
  academicYear?: { id: string; label: string } | null;
}

export interface LinkedChildProgressPayload {
  student: {
    id: string;
    fullName: string;
    rollNumber?: string | null;
    dob?: string | null;
    gender?: string | null;
    enrollmentDate: string;
    isActive: boolean;
    stream?: string | null;
    center?: { id: string; name: string; location?: string | null } | null;
    program?: { id: string; name: string; code?: string | null } | null;
    academicYear?: { id: string; label: string } | null;
  };
  attendance: {
    percentage: number;
    presentCount: number;
    lateCount: number;
    absentCount: number;
    totalSessions: number;
    recentRecords: Array<{
      sessionId: string;
      sessionDate: string | null;
      status: string;
      remarks: string | null;
    }>;
  };
  academics: {
    averagePct: number | null;
    comparison: Array<{
      subject: string;
      baseline: number | null;
      midline: number | null;
      endline: number | null;
    }>;
    scores: Array<{
      id: string;
      examId: string;
      examName: string;
      examType: string;
      examDate: string | null;
      academicYearLabel: string | null;
      subjectName: string;
      marks: number | null;
      maxMarks: number;
      isAbsent: boolean;
      percentage: number | null;
      remarks: string | null;
    }>;
  };
  skills: {
    latest: Array<{
      skillId: string;
      name: string;
      description: string | null;
      level: number;
      maxLevel: number;
      assessedOn: string;
    }>;
    logs: Array<{
      id: string;
      skillId: string;
      skillName: string;
      description: string | null;
      level: number;
      maxLevel: number;
      assessedOn: string;
      remarks: string | null;
    }>;
  };
  fees: {
    totalFees: number | null;
    feesPaid: number;
    balanceDue: number | null;
    isFullyPaid: boolean;
    payments: Array<{
      id: string;
      amount: number;
      notes: string | null;
      paidAt: string;
    }>;
  };
  activities: {
    summary: HolisticCreditSummary;
    enrollments: Array<{
      id: string;
      status: string;
      createdAt: string;
      activity?: {
        id: string;
        name: string;
        activityType?: string;
        status: string;
        startDate?: string | null;
        endDate?: string | null;
      } | null;
    }>;
  };
}

export const listLinkedChildren = () =>
  api
    .get<LinkedChildSummary[]>('/parent/children')
    .then((r) => (Array.isArray(r.data) ? r.data : []));

export const getLinkedChildProgress = (studentId: string) =>
  api.get<LinkedChildProgressPayload>(`/parent/children/${studentId}/progress`).then((r) => r.data);
