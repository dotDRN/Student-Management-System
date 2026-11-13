import React, { useCallback, useEffect, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Download, FileSpreadsheet, Printer } from 'lucide-react';
import { PageWrapper } from '../components/layout/PageWrapper';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { LoadingSpinner } from '../components/ui/LoadingSpinner';
import { ErrorMessage } from '../components/ui/ErrorMessage';
import { useToast } from '../hooks/useToast';
import { getApiErrorMessage } from '../services/api';
import { listCenters, listPrograms } from '../services/centers.service';
import {
  exportReportsCsv,
  getReportsAttendance,
  getReportsDashboard,
  getReportsExams,
  getReportsSkills,
  getReportsWorkbook,
  type AttendanceAnalyticsData,
  type ExamAnalyticsData,
  type ReportsDashboardData,
  type SkillsReportData,
} from '../services/reports.service';
import { downloadMasterWorkbookXlsx } from '../utils/masterWorkbookExport';
import type { CenterSummary, ProgramSummary } from '../types';

const COLORS = ['#3b82f6', '#8b5cf6', '#ec4899', '#10b981', '#f59e0b'];

function toLocalDateInput(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export const Reports: React.FC = () => {
  const toast = useToast();

  const [centers, setCenters] = useState<CenterSummary[]>([]);
  const [programs, setPrograms] = useState<ProgramSummary[]>([]);
  const [centerId, setCenterId] = useState('');
  const [programId, setProgramId] = useState('');
  const [fromDate, setFromDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return toLocalDateInput(d);
  });
  const [toDate, setToDate] = useState(() => toLocalDateInput(new Date()));
  const [academicYear, setAcademicYear] = useState(
    `${new Date().getFullYear()}-${String(new Date().getFullYear() + 1).slice(-2)}`,
  );

  const [dash, setDash] = useState<ReportsDashboardData | null>(null);
  const [att, setAtt] = useState<AttendanceAnalyticsData | null>(null);
  const [ex, setEx] = useState<ExamAnalyticsData | null>(null);
  const [skills, setSkills] = useState<SkillsReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [exportingWorkbook, setExportingWorkbook] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [c, p] = await Promise.all([listCenters(), listPrograms()]);
        if (!alive) return;
        setCenters(c);
        setPrograms(Array.isArray(p) ? p : []);
      } catch {
        // Non-blocking filter metadata failure
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const loadReports = useCallback(async () => {
    setLoading(true);
    setError(null);
    const scopeParams = {
      ...(centerId ? { centerId } : {}),
      ...(programId ? { programId } : {}),
    };
    const [d, a, e, s] = await Promise.allSettled([
      getReportsDashboard(),
      getReportsAttendance({ ...scopeParams, from: fromDate, to: toDate }),
      getReportsExams({ ...scopeParams, academicYear: academicYear.trim() || String(new Date().getFullYear()) }),
      getReportsSkills(scopeParams),
    ]);

    if (d.status === 'fulfilled') setDash(d.value);
    if (a.status === 'fulfilled') setAtt(a.value);
    else setAtt(null);
    if (e.status === 'fulfilled') setEx(e.value);
    else setEx(null);
    if (s.status === 'fulfilled') setSkills(s.value);
    else setSkills(null);

    if (d.status === 'rejected' && a.status === 'rejected') {
      setError('Some report endpoints failed. Check permissions and filter dates.');
    }
    setLoading(false);
  }, [centerId, programId, fromDate, toDate, academicYear]);

  useEffect(() => {
    void loadReports();
  }, [loadReports]);

  const handleExportCsv = async () => {
    try {
      setExporting(true);
      const blob = await exportReportsCsv({
        ...(centerId ? { centerId } : {}),
        ...(programId ? { programId } : {}),
      });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = 'student_analytics_export.csv';
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
      toast.success({
        title: 'CSV exported',
        description: 'Student analytics report downloaded cleanly.',
      });
    } catch (err) {
      toast.error({
        title: 'Export failed',
        description: getApiErrorMessage(err, 'Could not export CSV report.'),
      });
    } finally {
      setExporting(false);
    }
  };

  const handleExportWorkbook = async () => {
    try {
      setExportingWorkbook(true);
      const wbPayload = await getReportsWorkbook({
        ...(centerId ? { centerId } : {}),
        ...(programId ? { programId } : {}),
        ...(fromDate ? { from: fromDate } : {}),
        ...(toDate ? { to: toDate } : {}),
        ...(academicYear.trim() ? { academicYear: academicYear.trim() } : {}),
      });
      downloadMasterWorkbookXlsx(wbPayload);
      toast.success({
        title: 'Master Excel Workbook exported',
        description: `Downloaded 6-sheet workbook (${wbPayload.students.length} students).`,
      });
    } catch (err) {
      toast.error({
        title: 'Workbook export failed',
        description: getApiErrorMessage(err, 'Could not export Excel workbook.'),
      });
    } finally {
      setExportingWorkbook(false);
    }
  };

  const programData = (dash?.programBreakdown ?? []).map((p) => ({
    name: p.name ?? 'Program',
    value: p.studentCount ?? 0,
  }));

  const centerAtt = (dash?.centerBreakdown ?? []).map((c) => ({
    name: c.name ?? 'Center',
    attendance: c.attendanceRate ?? 0,
  }));

  const examSubjects = ex ? Object.keys(ex.baseline) : [];
  const skillProficiencyList = skills?.skillProficiency ?? [];

  if (loading && !dash) {
    return (
      <PageWrapper title="Analytics & Reports">
        <LoadingSpinner />
      </PageWrapper>
    );
  }

  return (
    <PageWrapper
      title="Analytics & Reports"
      actions={
        <div className="flex flex-wrap gap-2">
          <Button
            variant="primary"
            size="sm"
            onClick={() => void handleExportWorkbook()}
            disabled={exportingWorkbook}
          >
            <FileSpreadsheet size={15} className="mr-1.5" />
            {exportingWorkbook ? 'Building Workbook...' : 'Export Excel Workbook (.xlsx)'}
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => void handleExportCsv()}
            disabled={exporting}
          >
            <Download size={15} className="mr-1.5" />
            {exporting ? 'Exporting...' : 'Export CSV'}
          </Button>
          <Button variant="secondary" size="sm" onClick={() => window.print()}>
            <Printer size={15} className="mr-1.5" />
            Print Report
          </Button>
        </div>
      }
    >
      {error && (
        <div className="mb-4">
          <ErrorMessage message={error} />
        </div>
      )}

      {/* Filter Bar */}
      <Card className="mb-6 no-print">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          <div>
            <label className="text-xs font-medium text-neutral-600">Center</label>
            <select
              aria-label="Filter reports by center"
              className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm bg-white"
              value={centerId}
              onChange={(e) => setCenterId(e.target.value)}
            >
              <option value="">All accessible centers</option>
              {centers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-neutral-600">Program</label>
            <select
              aria-label="Filter reports by program"
              className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm bg-white"
              value={programId}
              onChange={(e) => setProgramId(e.target.value)}
            >
              <option value="">All programs</option>
              {programs.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
          <Input
            label="From date"
            type="date"
            value={fromDate}
            onChange={(e) => setFromDate(e.target.value)}
          />
          <Input
            label="To date"
            type="date"
            value={toDate}
            onChange={(e) => setToDate(e.target.value)}
          />
          <Input
            label="Academic year"
            value={academicYear}
            onChange={(e) => setAcademicYear(e.target.value)}
            placeholder="e.g. 2026-27"
          />
        </div>
      </Card>

      {/* Organization KPI Strip */}
      {dash && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <Card className="p-4">
            <p className="text-xs font-medium text-neutral-500">Total Active Students</p>
            <p className="text-2xl font-bold text-neutral-900 mt-1">{dash.totalStudents}</p>
          </Card>
          <Card className="p-4">
            <p className="text-xs font-medium text-neutral-500">Active Centers</p>
            <p className="text-2xl font-bold text-neutral-900 mt-1">{dash.totalCenters}</p>
          </Card>
          <Card className="p-4">
            <p className="text-xs font-medium text-neutral-500">30-Day Attendance Rate</p>
            <p className="text-2xl font-bold text-success-600 mt-1">{dash.overallAttendanceRate}%</p>
          </Card>
          <Card className="p-4">
            <p className="text-xs font-medium text-neutral-500">New Enrollments (This Month)</p>
            <p className="text-2xl font-bold text-primary mt-1">{dash.newStudentsThisMonth}</p>
          </Card>
        </div>
      )}

      {dash?.feeSummary && (
        <Card className="mb-6 p-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-2">
            <div>
              <h2 className="text-sm font-semibold text-neutral-900">Fee Collection Overview</h2>
              <p className="text-xs text-neutral-500">
                {dash.feeSummary.fullyPaidStudents} of {dash.feeSummary.studentsWithFees} fee-enrolled students cleared
              </p>
            </div>
            <div className="flex items-center gap-4 text-xs">
              <span>
                Collected:{' '}
                <strong className="text-emerald-700">
                  ₹{dash.feeSummary.totalCollected.toLocaleString()}
                </strong>
              </span>
              <span>
                Outstanding:{' '}
                <strong className="text-amber-700">
                  ₹{dash.feeSummary.totalOutstanding.toLocaleString()}
                </strong>
              </span>
              <span className="font-bold text-neutral-900">{dash.feeSummary.collectionPct}%</span>
            </div>
          </div>
          <div className="w-full bg-neutral-100 h-2 rounded-full overflow-hidden">
            <div
              className="bg-emerald-500 h-full rounded-full transition-all"
              style={{ width: `${dash.feeSummary.collectionPct}%` }}
            />
          </div>
        </Card>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
        <Card className="min-h-[320px]">
          <h2 className="text-lg font-semibold mb-2">Program distribution (dashboard)</h2>
          {programData.length === 0 ? (
            <p className="text-sm text-neutral-500">No data.</p>
          ) : (
            <div className="h-[280px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={programData}
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={90}
                    dataKey="value"
                    label
                  >
                    {programData.map((_, i) => (
                      <Cell key={i} fill={COLORS[i % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v) => `${v ?? 0} students`} />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>

        <Card className="min-h-[320px]">
          <h2 className="text-lg font-semibold mb-2">Center attendance % (dashboard)</h2>
          {centerAtt.length === 0 ? (
            <p className="text-sm text-neutral-500">No data.</p>
          ) : (
            <div className="h-[280px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={centerAtt} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="name" tickLine={false} axisLine={false} />
                  <YAxis domain={[0, 100]} tickFormatter={(v) => `${v}%`} />
                  <Tooltip formatter={(v) => `${v ?? 0}%`} />
                  <Bar dataKey="attendance" fill="#10b981" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <h2 className="text-lg font-semibold mb-4">Attendance analytics</h2>
          {!att ? (
            <p className="text-sm text-neutral-500">No data available for selected filters.</p>
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                <div className="bg-primary/5 p-3 rounded-lg text-center">
                  <p className="text-xs text-neutral-500 uppercase tracking-wide">Sessions</p>
                  <p className="text-lg font-bold text-primary">{att.summary.totalSessions}</p>
                </div>
                <div className="bg-success-50 p-3 rounded-lg text-center">
                  <p className="text-xs text-neutral-500 uppercase tracking-wide">Avg %</p>
                  <p className="text-lg font-bold text-success-600">{att.summary.averageAttendanceRate}%</p>
                </div>
                <div className="bg-neutral-50 p-3 rounded-lg text-center">
                  <p className="text-xs text-neutral-500 uppercase tracking-wide">Present</p>
                  <p className="text-lg font-bold text-neutral-700">{att.summary.present}</p>
                </div>
                <div className="bg-amber-50 p-3 rounded-lg text-center">
                  <p className="text-xs text-neutral-500 uppercase tracking-wide">Late</p>
                  <p className="text-lg font-bold text-amber-700">{att.summary.late}</p>
                </div>
                <div className="bg-danger-50 p-3 rounded-lg text-center">
                  <p className="text-xs text-neutral-500 uppercase tracking-wide">Absent</p>
                  <p className="text-lg font-bold text-danger-600">{att.summary.absent}</p>
                </div>
              </div>
            </div>
          )}
        </Card>

        <Card>
          <h2 className="text-lg font-semibold mb-4">Exam analytics (Baseline vs Endline)</h2>
          {!ex || examSubjects.length === 0 ? (
            <p className="text-sm text-neutral-500">No exam scores recorded for {academicYear}.</p>
          ) : (
            <div className="space-y-3 max-h-[280px] overflow-auto pr-2">
              {examSubjects.map((subject) => {
                const base = ex.baseline[subject] ?? { avg: 0, min: 0, max: 0 };
                const end = ex.endline[subject] ?? { avg: 0, min: 0, max: 0 };
                const delta = ex.improvement[subject] ?? 0;
                return (
                  <div
                    key={subject}
                    className="flex justify-between items-center bg-white border border-neutral-100 p-3 rounded-xl shadow-sm"
                  >
                    <span className="capitalize font-medium text-neutral-800">{subject}</span>
                    <div className="flex gap-4 text-sm">
                      <div className="text-center">
                        <span className="text-neutral-400 block text-[10px] uppercase">Baseline</span>
                        <span className="font-semibold">{base.avg}</span>
                      </div>
                      <div className="text-center">
                        <span className="text-neutral-400 block text-[10px] uppercase">Endline</span>
                        <span className="font-semibold">{end.avg}</span>
                      </div>
                      <div className="text-center">
                        <span className="text-neutral-400 block text-[10px] uppercase">Delta</span>
                        <span
                          className={`font-semibold ${
                            delta > 0 ? 'text-success-600' : delta < 0 ? 'text-danger-600' : 'text-neutral-600'
                          }`}
                        >
                          {delta > 0 ? `+${delta}` : delta}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>

        <Card className="md:col-span-2">
          <h2 className="text-lg font-semibold mb-4">Skills proficiency report</h2>
          {skillProficiencyList.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {skillProficiencyList.map((skill) => (
                <div
                  key={skill.skillId}
                  className="bg-gradient-to-br from-neutral-50 to-white border border-neutral-100 p-4 rounded-xl shadow-sm"
                >
                  <div className="flex justify-between items-center mb-2">
                    <span className="capitalize font-medium text-neutral-800">{skill.skillName}</span>
                    <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full font-medium">
                      n={skill.sampleSize}
                    </span>
                  </div>
                  <div className="flex items-baseline gap-2">
                    <span className="text-2xl font-bold text-neutral-900">
                      {skill.averageLevel} / {skill.maxLevel}
                    </span>
                    <span className="text-neutral-500 text-xs">({skill.averagePct}%)</span>
                  </div>
                  <div className="w-full bg-neutral-100 rounded-full h-1.5 mt-3 overflow-hidden">
                    <div
                      className="bg-primary h-1.5 rounded-full"
                      style={{ width: `${skill.averagePct}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          ) : skills?.fromExamScoresBySubject && skills.fromExamScoresBySubject.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {skills.fromExamScoresBySubject.map((item) => (
                <div
                  key={item.subject}
                  className="bg-gradient-to-br from-neutral-50 to-white border border-neutral-100 p-4 rounded-xl shadow-sm"
                >
                  <div className="flex justify-between items-center mb-2">
                    <span className="capitalize font-medium text-neutral-800">{item.subject}</span>
                    <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full font-medium">
                      n={item.sampleSize}
                    </span>
                  </div>
                  <div>
                    <span className="text-2xl font-bold text-neutral-900">{item.averageMarks}</span>
                    <span className="text-neutral-500 text-sm ml-1">avg score (subject fallback)</span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-neutral-500">No skill proficiency records logged yet.</p>
          )}
        </Card>
      </div>
    </PageWrapper>
  );
};
