import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Bar,
  BarChart,
  Legend,
  PolarAngleAxis,
  PolarGrid,
  Radar,
  RadarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { PageWrapper } from '../components/layout/PageWrapper';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { LoadingSpinner } from '../components/ui/LoadingSpinner';
import { ErrorMessage } from '../components/ui/ErrorMessage';
import { EmptyState } from '../components/ui/EmptyState';
import { Modal } from '../components/ui/Modal';
import { ArrowLeft, Edit2, Phone, MapPin, Calendar, Map, FileText, IndianRupee, Plus, CheckCircle2, Printer } from 'lucide-react';
import { getStudentProfile, getFeePayments, addFeePayment, updateStudentFees } from '../services/students.service';
import { getSkillsByStudent } from '../services/skills.service';
import { getCareersByStudent } from '../services/career.service';
import { getApiErrorMessage } from '../services/api';
import { usePermission } from '../hooks/usePermission';
import { useToast } from '../hooks/useToast';
import type { StudentProfilePayload, FeePayment } from '../types';
import type { SkillRecord, CareerRecord } from '../types';

const CHART_RED = '#dc2626';
const CHART_RED_SOFT = '#fca5a5';

function radarFromSkills(skills: SkillRecord[] | null): { skill: string; score: number }[] {
  if (!skills?.length) return [];
  const row = skills[0] as unknown as Record<string, unknown>;
  const keys = ['communication', 'confidence', 'computerSkill', 'problemSolving', 'languageSkill'];
  return keys
    .filter((k) => typeof row[k] === 'number')
    .map((k) => ({
      skill: k.replace(/([A-Z])/g, ' $1').replace(/^./, (s) => s.toUpperCase()),
      score: Number(row[k]),
    }));
}

export const StudentDetails: React.FC = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { can } = usePermission();
  const { toast } = useToast();
  const canManageFees = can('manage', 'fees');

  const [profile, setProfile] = useState<StudentProfilePayload | null>(null);
  const [skillsRows, setSkillsRows] = useState<SkillRecord[] | null>(null);
  const [careers, setCareers] = useState<CareerRecord[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showReportModal, setShowReportModal] = useState(false);

  // Fee state
  const [feePayments, setFeePayments] = useState<FeePayment[]>([]);
  const [feeAmount, setFeeAmount] = useState('');
  const [feeNotes, setFeeNotes] = useState('');
  const [feeSaving, setFeeSaving] = useState(false);
  const [totalFeesInput, setTotalFeesInput] = useState('');
  const [totalFeesEditing, setTotalFeesEditing] = useState(false);

  const loadFees = useCallback(async (studentId: string) => {
    try {
      const payments = await getFeePayments(studentId);
      setFeePayments(payments || []);
    } catch (err) {
      toast.error({
        title: 'Could not load fee history',
        description: getApiErrorMessage(err, 'Please refresh to try again.'),
      });
    }
  }, [toast]);

  useEffect(() => {
    if (!id) return;
    let alive = true;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const p = await getStudentProfile(id);
        if (!alive) return;
        setProfile(p);
        setTotalFeesInput(p.student.totalFees != null ? String(p.student.totalFees) : '');
        const [sk, cr] = await Promise.allSettled([getSkillsByStudent(id), getCareersByStudent(id)]);
        if (!alive) return;
        if (sk.status === 'fulfilled') setSkillsRows(sk.value as SkillRecord[]);
        else setSkillsRows(null);
        if (cr.status === 'fulfilled') setCareers(cr.value as CareerRecord[]);
        else setCareers(null);
        await loadFees(id);
      } catch {
        if (alive) setError('Could not load student.');
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [id, loadFees]);

  const handleAddPayment = async () => {
    if (!id) return;
    const numericAmount = Number(feeAmount);
    if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
      toast.error({ title: 'Enter a valid payment amount greater than zero.' });
      return;
    }
    setFeeSaving(true);
    try {
      await addFeePayment(id, numericAmount, feeNotes.trim() || undefined);
      setFeeAmount('');
      setFeeNotes('');
      await loadFees(id);
      const p = await getStudentProfile(id);
      setProfile(p);
      toast.success({ title: 'Fee payment recorded' });
    } catch (err) {
      toast.error({
        title: 'Could not record fee payment',
        description: getApiErrorMessage(err, 'Please check the amount and try again.'),
      });
    } finally {
      setFeeSaving(false);
    }
  };

  const handleSaveTotalFees = async () => {
    if (!id) return;
    const numericTotal = Number(totalFeesInput);
    if (!Number.isFinite(numericTotal) || numericTotal < 0) {
      toast.error({ title: 'Total fees must be zero or higher.' });
      return;
    }
    try {
      await updateStudentFees(id, { totalFees: numericTotal });
      const p = await getStudentProfile(id);
      setProfile(p);
      setTotalFeesEditing(false);
      toast.success({ title: 'Total fees updated' });
    } catch (err) {
      toast.error({
        title: 'Could not update total fees',
        description: getApiErrorMessage(err, 'Please try again.'),
      });
    }
  };

  const handleToggleFullyPaid = async () => {
    if (!id || !profile) return;
    try {
      await updateStudentFees(id, { isFullyPaid: !profile.student.isFullyPaid });
      const p = await getStudentProfile(id);
      setProfile(p);
      toast.success({
        title: !profile.student.isFullyPaid ? 'Marked as fully paid' : 'Marked as balance pending',
      });
    } catch (err) {
      toast.error({
        title: 'Could not update fee status',
        description: getApiErrorMessage(err, 'Please try again.'),
      });
    }
  };

  const radarData = useMemo(() => {
    if (!profile) return [];
    if (profile.skillRadar?.length) return profile.skillRadar;
    return radarFromSkills(skillsRows);
  }, [profile, skillsRows]);

  if (loading) {
    return (
      <PageWrapper title="Student Profile">
        <LoadingSpinner />
      </PageWrapper>
    );
  }

  if (error || !profile) {
    return (
      <PageWrapper title="Student">
        <ErrorMessage message={error || 'Student not found.'} />
        <Button className="mt-4" variant="secondary" onClick={() => navigate('/students')}>
          Back to list
        </Button>
      </PageWrapper>
    );
  }

  const { student, stats, attendanceTrend, examComparison, formSubmissions, parents } = profile;

  return (
    <PageWrapper
      title="Student Profile"
      actions={
        <div className="flex gap-2">
          <Button variant="ghost" onClick={() => navigate('/students')} className="bg-white">
            <ArrowLeft size={16} className="mr-2" /> Back
          </Button>
          <Button variant="primary" onClick={() => navigate(`/students/${student.id}/edit`)}>
            <Edit2 size={16} className="mr-2" /> Edit
          </Button>
        </div>
      }
    >
      <Card className="mb-6">
        <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="h-20 w-20 bg-primary/10 text-primary rounded-full flex items-center justify-center text-2xl font-semibold">
              {student.fullName.charAt(0)}
            </div>
            <div>
              <h1 className="text-2xl font-bold text-neutral-900">{student.fullName}</h1>
              <div className="flex items-center gap-2 mt-1 flex-wrap">
                {student.program && <Badge variant="primary">{student.program.name}</Badge>}
                <Badge variant={student.isActive !== false ? 'success' : 'neutral'}>
                  {(student.isActive !== false ? 'Active' : 'Inactive').toUpperCase()}
                </Badge>
              </div>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-x-8 gap-y-2 text-sm text-neutral-600">
            {student.center && (
              <div className="flex items-center gap-2">
                <Map size={16} /> {student.center.name}
              </div>
            )}
            <div className="flex items-center gap-2">
              <Calendar size={16} /> Enrolled{' '}
              {student.enrollmentDate ? String(student.enrollmentDate).slice(0, 10) : '—'}
            </div>
            {student.guardianPhone && (
              <div className="flex items-center gap-2">
                <Phone size={16} /> {student.guardianPhone}
              </div>
            )}
            {student.guardianName && (
              <div className="flex items-center gap-2">
                <MapPin size={16} /> {student.guardianName}
              </div>
            )}
          </div>
        </div>
        <div className="mt-6 pt-6 border-t border-neutral-100 grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
          <div>
            <p className="text-neutral-500">DOB</p>
            <p>{student.dob ? String(student.dob).slice(0, 10) : '—'}</p>
          </div>
          <div>
            <p className="text-neutral-500">Gender</p>
            <p className="capitalize">{student.gender || '—'}</p>
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <Card className="text-center py-6">
          <p className="text-xs font-medium uppercase tracking-wide text-neutral-500 mb-1">Attendance</p>
          <p className="text-3xl font-bold text-neutral-900">{stats?.attendancePct ?? 0}%</p>
          <p className="text-xs text-neutral-500 mt-1">Across recorded sessions</p>
        </Card>
        <Card className="text-center py-6">
          <p className="text-xs font-medium uppercase tracking-wide text-neutral-500 mb-1">Avg exam %</p>
          <p className="text-3xl font-bold text-neutral-900">{stats?.avgExamPct ?? '—'}</p>
          <p className="text-xs text-neutral-500 mt-1">From entered scores</p>
        </Card>
        <Card className="text-center py-6">
          <p className="text-xs font-medium uppercase tracking-wide text-neutral-500 mb-1">Skill score</p>
          <p className="text-3xl font-bold text-neutral-900">
            {stats?.skillScore != null ? stats.skillScore : '—'}
          </p>
          <p className="text-xs text-neutral-500 mt-1">Latest assessment</p>
        </Card>
      </div>

      {/* ─── Fees Section ─── */}
      <Card className="mb-6">
        <div className="flex justify-between items-center mb-4 border-b border-neutral-100 pb-3">
          <h2 className="text-lg font-semibold text-neutral-900 flex items-center gap-2">
            <IndianRupee size={20} /> Fees
          </h2>
          {canManageFees ? (
            <button
              onClick={() => void handleToggleFullyPaid()}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-all border ${
                student.isFullyPaid
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                  : 'bg-neutral-50 text-neutral-600 border-neutral-200 hover:bg-neutral-100'
              }`}
            >
              <CheckCircle2 size={16} className={student.isFullyPaid ? 'text-emerald-600' : 'text-neutral-400'} />
              {student.isFullyPaid ? 'Fully Paid ✓' : 'Mark as Entire Fees Paid'}
            </button>
          ) : (
            <Badge variant={student.isFullyPaid ? 'success' : 'warning'}>
              {student.isFullyPaid ? 'Fully Paid' : 'Balance Due'}
            </Badge>
          )}
        </div>

        {/* Total fees & paid summary */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
          <div className="bg-neutral-50 rounded-lg p-3 border border-neutral-100">
            <p className="text-xs font-medium uppercase tracking-wide text-neutral-500 mb-1">Total Fees</p>
            {canManageFees && totalFeesEditing ? (
              <div className="flex gap-2">
                <input
                  type="number"
                  min="0"
                  value={totalFeesInput}
                  onChange={(e) => setTotalFeesInput(e.target.value)}
                  className="w-full px-2 py-1 border border-neutral-300 rounded text-sm"
                />
                <Button size="sm" variant="primary" onClick={() => void handleSaveTotalFees()}>Save</Button>
                <Button size="sm" variant="ghost" onClick={() => setTotalFeesEditing(false)}>Cancel</Button>
              </div>
            ) : (
              <p
                className={`text-xl font-bold text-neutral-900 ${canManageFees ? 'cursor-pointer' : ''}`}
                onClick={() => {
                  if (canManageFees) setTotalFeesEditing(true);
                }}
              >
                ₹{student.totalFees != null ? Number(student.totalFees).toLocaleString() : '—'}
                {canManageFees && <span className="text-xs text-neutral-400 ml-1">(click to edit)</span>}
              </p>
            )}
          </div>
          <div className="bg-neutral-50 rounded-lg p-3 border border-neutral-100">
            <p className="text-xs font-medium uppercase tracking-wide text-neutral-500 mb-1">Fees Paid</p>
            <p className="text-xl font-bold text-neutral-900">₹{Number(student.feesPaid || 0).toLocaleString()}</p>
          </div>
          <div className="bg-neutral-50 rounded-lg p-3 border border-neutral-100">
            <p className="text-xs font-medium uppercase tracking-wide text-neutral-500 mb-1">Balance</p>
            <p className={`text-xl font-bold ${
              student.isFullyPaid ? 'text-emerald-600' : 'text-amber-600'
            }`}>
              {student.isFullyPaid ? '₹0 (Cleared)' : `₹${Math.max(0, Number(student.totalFees || 0) - Number(student.feesPaid || 0)).toLocaleString()}`}
            </p>
          </div>
        </div>

        {/* Add payment form */}
        {canManageFees && (
          <div className="flex flex-col sm:flex-row gap-2 mb-4 p-3 bg-brand-50/30 rounded-lg border border-brand-100">
            <input
              type="number"
              min="1"
              placeholder="Amount (₹)"
              value={feeAmount}
              onChange={(e) => setFeeAmount(e.target.value)}
              className="flex-1 px-3 py-2 border border-neutral-300 rounded-lg text-sm focus:ring-primary focus:border-primary"
            />
            <input
              type="text"
              placeholder="Notes (optional)"
              value={feeNotes}
              onChange={(e) => setFeeNotes(e.target.value)}
              className="flex-1 px-3 py-2 border border-neutral-300 rounded-lg text-sm focus:ring-primary focus:border-primary"
            />
            <Button variant="primary" size="sm" isLoading={feeSaving} onClick={() => void handleAddPayment()} disabled={!feeAmount}>
              <Plus size={16} className="mr-1" /> Add Payment
            </Button>
          </div>
        )}

        {/* Payment history */}
        {feePayments.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-neutral-200 text-left text-neutral-500">
                  <th className="py-2 pr-3 font-medium">Date & Time</th>
                  <th className="py-2 pr-3 font-medium">Amount</th>
                  <th className="py-2 pr-3 font-medium">Notes</th>
                </tr>
              </thead>
              <tbody>
                {feePayments.map((p) => (
                  <tr key={p.id} className="border-b border-neutral-100 even:bg-neutral-50/50">
                    <td className="py-2 pr-3 text-neutral-600 whitespace-nowrap">
                      {new Date(p.paidAt).toLocaleString()}
                    </td>
                    <td className="py-2 pr-3 font-medium text-neutral-900">₹{Number(p.amount).toLocaleString()}</td>
                    <td className="py-2 pr-3 text-neutral-600">{p.notes || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-neutral-500 text-center py-3">No payment records yet.</p>
        )}
      </Card>

      <Card className="mb-6">
        <div className="flex justify-between items-center mb-4 border-b border-neutral-100 pb-3">
          <h2 className="text-lg font-semibold text-neutral-900">Summary Report</h2>
          <div className="flex gap-2">
            <Button variant="secondary" size="sm" onClick={() => window.print()}>
              Print Report
            </Button>
            <Button variant="primary" size="sm" onClick={() => setShowReportModal(true)}>
              View Report
            </Button>
          </div>
        </div>
        <div className="text-sm text-neutral-700 space-y-3">
          <p>
            <strong>Attendance:</strong> {student.fullName} has attended {stats?.attendancePct ?? 0}% of recorded sessions.
          </p>
          <p>
            <strong>Exams:</strong> Average score across recorded exams is {stats?.avgExamPct ?? '—'}.
            {examComparison && examComparison.length > 0 ? (
              <span> The latest comparison shows data for {examComparison.map((e) => e.subject).join(', ')}.</span>
            ) : null}
          </p>
          <p>
            <strong>Skills:</strong> 
            {radarData.length > 0 ? (
              <span> Top assessed skill is {radarData.reduce((prev, current) => (prev.score > current.score) ? prev : current).skill} with a score of {radarData.reduce((prev, current) => (prev.score > current.score) ? prev : current).score}.</span>
            ) : (
              <span> No skills assessed yet.</span>
            )}
          </p>
        </div>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        <Card>
          <h2 className="text-lg font-semibold text-neutral-900 mb-4">Attendance trend</h2>
          {!attendanceTrend?.length ? (
            <EmptyState title="No attendance yet" description="Records will appear after sessions are saved." />
          ) : (
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={attendanceTrend} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                  <YAxis domain={[0, 1]} ticks={[0, 1]} tickFormatter={(v) => (v === 1 ? 'Present' : 'Absent')} width={56} />
                  <Tooltip />
                  <Bar dataKey="present" fill={CHART_RED} name="Present (1) / Absent (0)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>

        <Card>
          <h2 className="text-lg font-semibold text-neutral-900 mb-4">Exam scores (baseline vs endline)</h2>
          {!examComparison?.length ? (
            <EmptyState title="No exam data" description="Scores show when baseline and endline exams are recorded." />
          ) : (
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={examComparison} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <XAxis dataKey="subject" tick={{ fontSize: 11 }} />
                  <YAxis domain={[0, 100]} tickFormatter={(v) => `${v}%`} />
                  <Tooltip formatter={(v) => (v == null ? '—' : `${Number(v).toFixed(0)}%`)} />
                  <Legend />
                  <Bar dataKey="baseline" fill={CHART_RED_SOFT} name="Baseline" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="endline" fill={CHART_RED} name="Endline" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>

        <Card>
          <h2 className="text-lg font-semibold text-neutral-900 mb-4">Skills</h2>
          {radarData.length === 0 ? (
            <EmptyState
              title="No skill ratings"
              description="Add ratings from the Skills page when the backend exposes them."
            />
          ) : (
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <RadarChart data={radarData}>
                  <PolarGrid />
                  <PolarAngleAxis dataKey="skill" tick={{ fontSize: 11 }} />
                  <Radar dataKey="score" fill={CHART_RED} fillOpacity={0.35} stroke={CHART_RED} />
                  <Tooltip />
                </RadarChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>

        <Card>
          <h2 className="text-lg font-semibold text-neutral-900 mb-4">Career tracking</h2>
          {!careers?.length ? (
            <EmptyState title="No career entries" description="Link aspirations from the Careers workspace." />
          ) : (
            <ul className="space-y-3 text-sm">
              {careers.slice(0, 6).map((c, i) => {
                const career = c as {
                  careerGoal?: string;
                  aspiration?: string;
                  industry?: string;
                  notes?: string;
                  milestones?: string[];
                };
                return (
                  <li key={i} className="border border-neutral-100 rounded-lg p-3 bg-neutral-50/80">
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-medium text-neutral-900">
                        {career.careerGoal || career.aspiration || 'Career note'}
                      </p>
                      {career.industry && (
                        <span className="text-xs font-medium text-brand-700 bg-brand-50 px-2 py-0.5 rounded">
                          {career.industry}
                        </span>
                      )}
                    </div>
                    {career.notes && (
                      <p className="text-neutral-600 mt-1">{career.notes}</p>
                    )}
                    {Array.isArray(career.milestones) && career.milestones.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {career.milestones.map((m, idx) => (
                          <span key={idx} className="text-xs bg-white border border-neutral-200 text-neutral-600 px-2 py-0.5 rounded">
                            {m}
                          </span>
                        ))}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
          <Button variant="secondary" className="mt-4" onClick={() => navigate('/careers')}>
            Open careers
          </Button>
        </Card>
      </div>

      {(parents?.length ?? 0) > 0 && (
        <Card className="mb-6">
          <h2 className="text-lg font-semibold text-neutral-900 mb-3">Linked parents</h2>
          <ul className="text-sm text-neutral-700 space-y-2">
            {parents!.map((ps: { parent?: { fullName?: string; email?: string; phone?: string } }, i: number) => (
              <li key={i}>
                {ps.parent?.fullName ?? 'Parent'} — {ps.parent?.email ?? ps.parent?.phone ?? '—'}
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card>
        <h2 className="text-lg font-semibold text-neutral-900 mb-4">Form submissions</h2>
        {!formSubmissions?.length ? (
          <EmptyState title="No submissions" description="Responses appear when forms are submitted for this student." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-neutral-200 text-left text-neutral-500">
                  <th className="py-2 pr-3 font-medium">Form</th>
                  <th className="py-2 pr-3 font-medium">Type</th>
                  <th className="py-2 pr-3 font-medium">Date</th>
                  <th className="py-2 font-medium text-right">View</th>
                </tr>
              </thead>
              <tbody>
                {formSubmissions.map((row: {
                  id: string;
                  templateId?: string;
                  createdAt?: string;
                  template?: { id?: string; name?: string; formType?: string };
                }) => {
                  const tpl = row.template;
                  const tid = tpl?.id ?? row.templateId;
                  return (
                    <tr key={row.id} className="border-b border-neutral-100 even:bg-neutral-50/50">
                      <td className="py-2 pr-3 font-medium text-neutral-900">{tpl?.name ?? '—'}</td>
                      <td className="py-2 pr-3 text-neutral-600">{tpl?.formType ?? '—'}</td>
                      <td className="py-2 pr-3 text-neutral-600 whitespace-nowrap">
                        {row.createdAt ? new Date(row.createdAt).toLocaleString() : '—'}
                      </td>
                      <td className="py-2 text-right">
                        {tid ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="inline-flex"
                            onClick={() => navigate(`/forms/${tid}/submissions`)}
                          >
                            <FileText size={14} className="mr-1" /> Submissions
                          </Button>
                        ) : (
                          '—'
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Modal
        isOpen={showReportModal}
        onClose={() => setShowReportModal(false)}
        title={`${student.fullName} — Detailed Progress Report`}
        maxWidth="lg"
      >
        <div className="space-y-4 text-sm text-neutral-700">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 bg-neutral-50 p-3 rounded-lg border border-neutral-200">
            <div>
              <p className="text-xs text-neutral-500">Center</p>
              <p className="font-medium text-neutral-900">{student.center?.name ?? student.centerId}</p>
            </div>
            <div>
              <p className="text-xs text-neutral-500">Program</p>
              <p className="font-medium text-neutral-900">{student.program?.name ?? student.programId}</p>
            </div>
            <div>
              <p className="text-xs text-neutral-500">Roll Number</p>
              <p className="font-medium text-neutral-900">{student.rollNumber || '—'}</p>
            </div>
            <div>
              <p className="text-xs text-neutral-500">Attendance Rate</p>
              <p className="font-semibold text-neutral-900">{stats?.attendancePct ?? 0}%</p>
            </div>
            <div>
              <p className="text-xs text-neutral-500">Average Exam Score</p>
              <p className="font-semibold text-neutral-900">
                {stats?.avgExamPct != null ? `${stats.avgExamPct}%` : '—'}
              </p>
            </div>
            <div>
              <p className="text-xs text-neutral-500">Fee Status</p>
              <p className="font-semibold text-neutral-900">
                {student.isFullyPaid
                  ? 'Cleared'
                  : `Paid ₹${Number(student.feesPaid || 0).toLocaleString()} / ₹${Number(student.totalFees || 0).toLocaleString()}`}
              </p>
            </div>
          </div>

          {examComparison && examComparison.length > 0 && (
            <div>
              <h3 className="font-semibold text-neutral-900 mb-2">Exam Performance</h3>
              <table className="w-full text-left border border-neutral-200 rounded-lg overflow-hidden">
                <thead className="bg-neutral-50 text-xs uppercase text-neutral-500">
                  <tr>
                    <th className="py-2 px-3">Subject</th>
                    <th className="py-2 px-3">Baseline</th>
                    <th className="py-2 px-3">Endline</th>
                  </tr>
                </thead>
                <tbody>
                  {examComparison.map((row) => (
                    <tr key={row.subject} className="border-t border-neutral-100">
                      <td className="py-2 px-3 font-medium text-neutral-900">{row.subject}</td>
                      <td className="py-2 px-3">{row.baseline != null ? `${Number(row.baseline).toFixed(1)}%` : '—'}</td>
                      <td className="py-2 px-3">{row.endline != null ? `${Number(row.endline).toFixed(1)}%` : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {radarData.length > 0 && (
            <div>
              <h3 className="font-semibold text-neutral-900 mb-2">Assessed Skills</h3>
              <div className="flex flex-wrap gap-2">
                {radarData.map((s) => (
                  <span key={s.skill} className="px-2.5 py-1 rounded-full bg-neutral-100 text-neutral-800 text-xs font-medium">
                    {s.skill}: {s.score}/5
                  </span>
                ))}
              </div>
            </div>
          )}

          {careers && careers.length > 0 && (
            <div>
              <h3 className="font-semibold text-neutral-900 mb-2">Career Goals</h3>
              <ul className="space-y-1.5">
                {careers.slice(0, 5).map((c, idx) => (
                  <li key={idx} className="text-neutral-700">
                    • <span className="font-medium text-neutral-900">{c.careerGoal || c.careerInterest || 'Career Note'}</span>
                    {c.industry ? ` (${c.industry})` : ''}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-3 border-t border-neutral-200">
            <Button variant="secondary" size="sm" onClick={() => window.print()}>
              <Printer size={14} className="mr-1.5" /> Print Report
            </Button>
            <Button variant="primary" size="sm" onClick={() => setShowReportModal(false)}>
              Close
            </Button>
          </div>
        </div>
      </Modal>
    </PageWrapper>
  );
};
