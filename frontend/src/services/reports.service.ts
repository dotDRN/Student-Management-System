import api from './api';
import { getActiveOfflineDb } from '../offline/syncEngine';
import { withOfflineRead } from '../offline/offlineServiceHelper';

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

export interface DashboardFeeSummary {
  totalAssigned: number;
  totalCollected: number;
  totalOutstanding: number;
  collectionPct: number;
  fullyPaidStudents: number;
  studentsWithFees: number;
}

export interface ReportsDashboardData {
  totalStudents: number;
  totalCenters: number;
  overallAttendanceRate: number;
  newStudentsThisMonth: number;
  pendingAttendanceToday?: number;
  pendingTransfersCount?: number;
  feeSummary?: DashboardFeeSummary;
  lowestAttendanceCenters?: CenterBreakdownItem[];
  centerBreakdown: CenterBreakdownItem[];
  programBreakdown: ProgramBreakdownItem[];
}

export interface MasterWorkbookPayload {
  generatedDateUtc: string;
  filters: {
    centerId: string | null;
    programId: string | null;
    from: string | null;
    to: string | null;
    academicYear: string | null;
  };
  kpis: {
    totalStudents: number;
    totalCenters: number;
    overallAttendanceRate: number;
    newStudentsThisMonth: number;
    pendingAttendanceToday: number;
    pendingTransfersCount: number;
    feeCollectionPct: number;
    feeTotalAssigned: number;
    feeTotalCollected: number;
    feeTotalOutstanding: number;
  };
  students: Array<{
    id: string;
    fullName: string;
    rollNumber: string;
    centerName: string;
    programName: string;
    enrollmentDate: string;
    attendanceRate: number;
    avgExamScore: number;
    totalFees: number;
    feesPaid: number;
    balanceDue: number;
    feeStatus: string;
  }>;
  attendanceSummary: AttendanceAnalyticsData | null;
  examPerformance: Array<{
    subject: string;
    baselineAvg: number;
    baselineMin: number;
    baselineMax: number;
    endlineAvg: number;
    endlineMin: number;
    endlineMax: number;
    improvementDelta: number;
  }>;
  skillProficiency: SkillProficiencyItem[];
  feeSummary: Array<{
    centerName: string;
    programName: string;
    studentCount: number;
    studentsWithFeePlan: number;
    fullyPaidCount: number;
    totalAssigned: number;
    totalCollected: number;
    outstanding: number;
    collectionPct: number;
  }>;
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
  withOfflineRead<ReportsDashboardData>(
    () => api.get<ReportsDashboardData>('/reports/dashboard').then((r) => r.data),
    async () => {
      const db = getActiveOfflineDb();
      if (!db) {
        return {
          totalStudents: 0,
          totalCenters: 0,
          overallAttendanceRate: 0,
          newStudentsThisMonth: 0,
          centerBreakdown: [],
          programBreakdown: [],
        };
      }
      const [students, centers, programs, records] = await Promise.all([
        db.students.toArray(),
        db.centers.toArray(),
        db.programs.toArray(),
        db.attendanceRecords.toArray(),
      ]);
      const activeStudents = students.filter((s) => s.isActive !== false);
      const marked = records.filter((r) => r.status !== 'pending' && r.status !== 'excused');
      const present = marked.filter((r) => r.status === 'present' || r.status === 'late').length;
      const overallAttendanceRate =
        marked.length > 0 ? Math.round((present / marked.length) * 100) : 0;

      const monthPrefix = new Date().toISOString().slice(0, 7);
      const newStudentsThisMonth = activeStudents.filter((s) =>
        String(s.enrollmentDate || '').startsWith(monthPrefix),
      ).length;

      let totalAssigned = 0;
      let totalCollected = 0;
      let fullyPaidStudents = 0;
      let studentsWithFees = 0;
      for (const s of activeStudents) {
        const tf = Number(s.totalFees || 0);
        const fp = Number(s.feesPaid || 0);
        if (tf > 0) {
          studentsWithFees += 1;
          totalAssigned += tf;
          totalCollected += fp;
          if (s.isFullyPaid || fp >= tf) fullyPaidStudents += 1;
        }
      }

      const centerBreakdown: CenterBreakdownItem[] = centers.map((c) => {
        const cStudents = activeStudents.filter((s) => s.centerId === c.id);
        const cRecs = marked.filter((r) => r.centerId === c.id);
        const cPres = cRecs.filter((r) => r.status === 'present' || r.status === 'late').length;
        return {
          centerId: c.id,
          name: String(c.name || ''),
          studentCount: cStudents.length,
          attendanceRate: cRecs.length > 0 ? Math.round((cPres / cRecs.length) * 100) : 0,
        };
      });

      const programBreakdown: ProgramBreakdownItem[] = programs.map((p) => ({
        programId: p.id,
        name: String(p.name || ''),
        studentCount: activeStudents.filter((s) => s.programId === p.id).length,
      }));

      return {
        totalStudents: activeStudents.length,
        totalCenters: centers.length,
        overallAttendanceRate,
        newStudentsThisMonth,
        pendingAttendanceToday: 0,
        pendingTransfersCount: activeStudents.filter(
          (s) => s.transferStatus === 'pending_transfer',
        ).length,
        feeSummary: {
          totalAssigned,
          totalCollected,
          totalOutstanding: Math.max(0, totalAssigned - totalCollected),
          collectionPct:
            totalAssigned > 0 ? Math.round((totalCollected / totalAssigned) * 100) : 0,
          fullyPaidStudents,
          studentsWithFees,
        },
        centerBreakdown,
        programBreakdown,
      };
    },
  );

export const getReportsAttendance = (params?: Record<string, string | undefined>) =>
  withOfflineRead<AttendanceAnalyticsData>(
    () => api.get<AttendanceAnalyticsData>('/reports/attendance', { params }).then((r) => r.data),
    async () => ({
      summary: { totalSessions: 0, averageAttendanceRate: 0, present: 0, absent: 0, late: 0 },
      byDate: [],
      byStudent: [],
    }),
  );

export const getReportsExams = (params?: Record<string, string | undefined>) =>
  withOfflineRead<ExamAnalyticsData>(
    () => api.get<ExamAnalyticsData>('/reports/exams', { params }).then((r) => r.data),
    async () => ({
      baseline: {},
      endline: {},
      improvement: {},
      studentPerformance: [],
    }),
  );

export const getReportsSkills = (params?: Record<string, string | undefined>) =>
  withOfflineRead<SkillsReportData>(
    () => api.get<SkillsReportData>('/reports/skills', { params }).then((r) => r.data),
    async () => ({
      skillProficiency: [],
      fromExamScoresBySubject: [],
      skillAveragesByTemplate: [],
    }),
  );

export const getReportsStudents = (params?: Record<string, string | undefined>) =>
  withOfflineRead<Record<string, unknown>[]>(
    () => api.get<Record<string, unknown>[]>('/reports/students', { params }).then((r) => r.data),
    async () => {
      const db = getActiveOfflineDb();
      if (!db) return [];
      let rows = await db.students.toArray();
      if (params?.centerId) rows = rows.filter((s) => s.centerId === params.centerId);
      if (params?.programId) rows = rows.filter((s) => s.programId === params.programId);
      return rows;
    },
  );

export const exportReportsCsv = (params?: Record<string, string | undefined>) =>
  api
    .get<Blob>('/reports/export', {
      params,
      responseType: 'blob',
    })
    .then((r) => r.data);

export const getReportsWorkbook = (params?: Record<string, string | undefined>) =>
  api.get<MasterWorkbookPayload>('/reports/workbook', { params }).then((r) => r.data);
