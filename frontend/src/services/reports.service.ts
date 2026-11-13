import api from './api';

export interface CenterBreakdownItem {
  centerId: string;
  name: string;
  studentCount: number;
  attendanceRate: number;
}

export interface ProgramBreakdownItem {
  programId: string;
  name: string;
  studentCount: number;
}

export interface ReportsDashboardData {
  totalStudents: number;
  totalCenters: number;
  overallAttendanceRate: number;
  newStudentsThisMonth: number;
  centerBreakdown: CenterBreakdownItem[];
  programBreakdown: ProgramBreakdownItem[];
}

export interface AttendanceAnalyticsData {
  summary: {
    totalSessions: number;
    averageAttendanceRate: number;
    present: number;
    absent: number;
    late: number;
  };
  byDate: Array<{
    date: string;
    presentCount: number;
    absentCount: number;
    lateCount: number;
    rate: number;
  }>;
  byStudent: Array<{
    studentId: string;
    fullName: string;
    presentCount: number;
    absentCount: number;
    lateCount: number;
    rate: number;
  }>;
}

export interface ExamSubjectBucket {
  avg: number;
  min: number;
  max: number;
}

export interface ExamAnalyticsData {
  baseline: Record<string, ExamSubjectBucket>;
  endline: Record<string, ExamSubjectBucket>;
  improvement: Record<string, number>;
  studentPerformance: Array<{
    studentId: string;
    fullName: string;
    baselineTotal: number;
    endlineTotal: number;
    delta: number;
  }>;
}

export interface SkillProficiencyItem {
  skillId: string;
  skillName: string;
  maxLevel: number;
  averageLevel: number;
  averagePct: number;
  sampleSize: number;
}

export interface SkillsReportData {
  skillProficiency?: SkillProficiencyItem[];
  fromExamScoresBySubject: Array<{
    subject: string;
    averageMarks: number;
    sampleSize: number;
  }>;
  skillAveragesByTemplate: Array<{
    templateId: string;
    name: string;
    formType: string;
    fieldAverages: Record<string, number>;
    submissionCount: number;
  }>;
}

export const getReportsDashboard = () =>
  api.get<ReportsDashboardData>('/reports/dashboard').then((r) => r.data);

export const getReportsAttendance = (params?: Record<string, string | undefined>) =>
  api.get<AttendanceAnalyticsData>('/reports/attendance', { params }).then((r) => r.data);

export const getReportsExams = (params?: Record<string, string | undefined>) =>
  api.get<ExamAnalyticsData>('/reports/exams', { params }).then((r) => r.data);

export const getReportsSkills = (params?: Record<string, string | undefined>) =>
  api.get<SkillsReportData>('/reports/skills', { params }).then((r) => r.data);

export const getReportsStudents = (params?: Record<string, string | undefined>) =>
  api.get<Record<string, unknown>[]>('/reports/students', { params }).then((r) => r.data);

export const exportReportsCsv = (params?: Record<string, string | undefined>) =>
  api
    .get<Blob>('/reports/export', {
      params,
      responseType: 'blob',
    })
    .then((r) => r.data);
