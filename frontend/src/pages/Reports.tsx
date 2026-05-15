import React, { useEffect, useMemo, useState } from 'react';
import { PageWrapper } from '../components/layout/PageWrapper';
import { Card } from '../components/ui/Card';
import { LoadingSpinner } from '../components/ui/LoadingSpinner';
import { ErrorMessage } from '../components/ui/ErrorMessage';
import {
  getReportsDashboard,
  getReportsAttendance,
  getReportsExams,
  getReportsSkills,
} from '../services/reports.service';
import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  Legend,
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
} from 'recharts';

const COLORS = ['#3b82f6', '#8b5cf6', '#ec4899'];

export const Reports: React.FC = () => {
  const [dash, setDash] = useState<Record<string, unknown> | null>(null);
  const [att, setAtt] = useState<Record<string, unknown> | null>(null);
  const [ex, setEx] = useState<Record<string, unknown> | null>(null);
  const [skills, setSkills] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const range = useMemo(() => {
    const to = new Date();
    const from = new Date();
    from.setDate(from.getDate() - 30);
    const iso = (d: Date) => d.toISOString().split('T')[0];
    return { from: iso(from), to: iso(to) };
  }, []);

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      setError(null);
      const year = String(new Date().getFullYear());
      try {
        const [d, a, e, s] = await Promise.allSettled([
          getReportsDashboard(),
          getReportsAttendance({ from: range.from, to: range.to }),
          getReportsExams({ academicYear: year }),
          getReportsSkills(),
        ]);
        if (!alive) return;
        if (d.status === 'fulfilled') setDash(d.value as Record<string, unknown>);
        if (a.status === 'fulfilled') setAtt(a.value as Record<string, unknown>);
        if (e.status === 'fulfilled') setEx(e.value as Record<string, unknown>);
        if (s.status === 'fulfilled') setSkills(s.value as Record<string, unknown>);
        if (d.status === 'rejected' && a.status === 'rejected') {
          setError('Some report endpoints failed. Check permissions and query parameters.');
        }
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [range.from, range.to]);

  const programData = ((dash?.programBreakdown as Array<{ name?: string; studentCount?: number }>) ?? []).map(
    (p) => ({
      name: p.name ?? 'Program',
      value: p.studentCount ?? 0,
    }),
  );

  const centerAtt = ((dash?.centerBreakdown as Array<{ name?: string; attendanceRate?: number }>) ?? []).map(
    (c) => ({
      name: c.name ?? 'Center',
      attendance: c.attendanceRate ?? 0,
    }),
  );

  if (loading) {
    return (
      <PageWrapper title="Analytics & Reports">
        <LoadingSpinner />
      </PageWrapper>
    );
  }

  return (
    <PageWrapper title="Analytics & Reports">
      {error && (
        <div className="mb-4">
          <ErrorMessage message={error} />
        </div>
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
            <p className="text-sm text-neutral-500">No data available.</p>
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <div className="bg-primary/5 p-3 rounded-lg text-center">
                  <p className="text-xs text-neutral-500 uppercase tracking-wide">Sessions</p>
                  <p className="text-lg font-bold text-primary">{(att as any).summary?.totalSessions || 0}</p>
                </div>
                <div className="bg-success-50 p-3 rounded-lg text-center">
                  <p className="text-xs text-neutral-500 uppercase tracking-wide">Avg %</p>
                  <p className="text-lg font-bold text-success-600">{(att as any).summary?.averageAttendanceRate || 0}%</p>
                </div>
                <div className="bg-neutral-50 p-3 rounded-lg text-center">
                  <p className="text-xs text-neutral-500 uppercase tracking-wide">Present</p>
                  <p className="text-lg font-bold text-neutral-700">{(att as any).summary?.present || 0}</p>
                </div>
                <div className="bg-danger-50 p-3 rounded-lg text-center">
                  <p className="text-xs text-neutral-500 uppercase tracking-wide">Absent</p>
                  <p className="text-lg font-bold text-danger-600">{(att as any).summary?.absent || 0}</p>
                </div>
              </div>
            </div>
          )}
        </Card>
        
        <Card>
          <h2 className="text-lg font-semibold mb-4">Exam analytics</h2>
          {!ex || !(ex as any).baseline ? (
            <p className="text-sm text-neutral-500">No data available.</p>
          ) : (
            <div className="space-y-3 max-h-[240px] overflow-auto pr-2 custom-scrollbar">
              {Object.entries((ex as any).baseline || {}).map(([subject, data]: [string, any]) => (
                <div key={subject} className="flex justify-between items-center bg-white border border-neutral-100 p-3 rounded-xl shadow-sm">
                  <span className="capitalize font-medium text-neutral-800">{subject}</span>
                  <div className="flex gap-4 text-sm">
                    <div className="text-center"><span className="text-neutral-400 block text-[10px] uppercase">Avg</span><span className="font-semibold">{data.avg || 0}</span></div>
                    <div className="text-center"><span className="text-neutral-400 block text-[10px] uppercase">Min</span><span className="font-medium text-danger-500">{data.min || 0}</span></div>
                    <div className="text-center"><span className="text-neutral-400 block text-[10px] uppercase">Max</span><span className="font-medium text-success-500">{data.max || 0}</span></div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
        
        <Card className="md:col-span-2">
          <h2 className="text-lg font-semibold mb-4">Skills report</h2>
          {!skills || !(skills as any).fromExamScoresBySubject?.length ? (
            <p className="text-sm text-neutral-500">No data available.</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {((skills as any).fromExamScoresBySubject || []).map((skill: any, i: number) => (
                <div key={i} className="bg-gradient-to-br from-neutral-50 to-white border border-neutral-100 p-4 rounded-xl shadow-sm hover:shadow transition-shadow">
                  <div className="flex justify-between items-center mb-2">
                    <span className="capitalize font-medium text-neutral-800">{skill.subject}</span>
                    <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full font-medium">n={skill.sampleSize}</span>
                  </div>
                  <div>
                    <span className="text-2xl font-bold text-neutral-900">{skill.averageMarks}</span>
                    <span className="text-neutral-500 text-sm ml-1">avg score</span>
                  </div>
                  <div className="w-full bg-neutral-100 rounded-full h-1.5 mt-3 overflow-hidden">
                    <div className="bg-primary h-1.5 rounded-full" style={{ width: `${Math.min(100, Math.max(0, (skill.averageMarks / 50) * 100))}%` }}></div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </PageWrapper>
  );
};
