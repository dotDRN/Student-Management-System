import React, { useCallback, useEffect, useState } from 'react';
import {
  Award,
  BookOpen,
  CalendarCheck,
  GraduationCap,
  IndianRupee,
  Printer,
  Star,
  UserCheck,
} from 'lucide-react';
import { PageWrapper } from '../components/layout/PageWrapper';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { LoadingSpinner } from '../components/ui/LoadingSpinner';
import { EmptyState } from '../components/ui/EmptyState';
import { ErrorMessage } from '../components/ui/ErrorMessage';
import { getApiErrorMessage } from '../services/api';
import {
  getLinkedChildProgress,
  listLinkedChildren,
  type LinkedChildProgressPayload,
  type LinkedChildSummary,
} from '../services/parentPortal.service';
import { formatDate } from '../utils/date';

const ATTENDANCE_BADGE: Record<string, 'success' | 'warning' | 'danger' | 'neutral'> = {
  present: 'success',
  late: 'warning',
  absent: 'danger',
  excused: 'neutral',
  pending: 'neutral',
};

export const ParentPortal: React.FC = () => {
  const [children, setChildren] = useState<LinkedChildSummary[]>([]);
  const [selectedChildId, setSelectedChildId] = useState<string>('');
  const [progress, setProgress] = useState<LinkedChildProgressPayload | null>(null);
  const [loadingChildren, setLoadingChildren] = useState(true);
  const [loadingProgress, setLoadingProgress] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadChildProgress = useCallback(async (studentId: string) => {
    if (!studentId) return;
    setLoadingProgress(true);
    setError(null);
    try {
      const data = await getLinkedChildProgress(studentId);
      setProgress(data);
    } catch (err) {
      setError(getApiErrorMessage(err, 'Could not load student progress snapshot.'));
    } finally {
      setLoadingProgress(false);
    }
  }, []);

  const loadChildren = useCallback(async () => {
    setLoadingChildren(true);
    setError(null);
    try {
      const list = await listLinkedChildren();
      setChildren(list);
      if (list[0]) {
        setSelectedChildId(list[0].id);
        await loadChildProgress(list[0].id);
      }
    } catch (err) {
      setError(getApiErrorMessage(err, 'Could not load linked student accounts.'));
    } finally {
      setLoadingChildren(false);
    }
  }, [loadChildProgress]);

  useEffect(() => {
    void loadChildren();
  }, [loadChildren]);

  const handleSelectChild = (studentId: string) => {
    setSelectedChildId(studentId);
    void loadChildProgress(studentId);
  };

  return (
    <PageWrapper
      title="Family Progress Portal"
      actions={
        progress ? (
          <Button variant="secondary" className="no-print" onClick={() => window.print()}>
            <Printer size={16} className="mr-2" /> Print Progress Summary
          </Button>
        ) : undefined
      }
    >
      {error && (
        <div className="mb-4">
          <ErrorMessage message={error} />
        </div>
      )}

      {loadingChildren ? (
        <LoadingSpinner label="Loading linked student profiles..." />
      ) : children.length === 0 ? (
        <Card>
          <EmptyState
            title="No student linked to your guardian account"
            description="Ask your center administrator to link your parent login under the Student Profile Guardians section."
          />
        </Card>
      ) : (
        <div className="space-y-6">
          {children.length > 1 && (
            <div className="flex flex-wrap gap-2 no-print">
              {children.map((child) => (
                <Button
                  key={child.id}
                  type="button"
                  variant={selectedChildId === child.id ? 'primary' : 'secondary'}
                  size="sm"
                  onClick={() => handleSelectChild(child.id)}
                >
                  <UserCheck size={14} className="mr-1.5" />
                  {child.fullName}
                  {child.program?.name ? ` (${child.program.name})` : ''}
                </Button>
              ))}
            </div>
          )}

          {loadingProgress || !progress ? (
            <LoadingSpinner label="Loading progress report..." />
          ) : (
            <>
              <Card>
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2.5">
                      <h2 className="text-xl font-bold text-neutral-900">
                        {progress.student.fullName}
                      </h2>
                      <Badge variant={progress.student.isActive ? 'success' : 'neutral'}>
                        {progress.student.isActive ? 'Active' : 'Alumni / Inactive'}
                      </Badge>
                    </div>
                    <p className="text-sm text-neutral-600 mt-1">
                      {progress.student.center?.name || 'Center'} ·{' '}
                      {progress.student.program?.name || 'Program'}
                      {progress.student.academicYear?.label
                        ? ` · Academic Year ${progress.student.academicYear.label}`
                        : ''}
                      {progress.student.rollNumber ? ` · Roll ${progress.student.rollNumber}` : ''}
                    </p>
                  </div>
                  <span className="text-xs text-neutral-500">
                    Enrolled on {formatDate(progress.student.enrollmentDate)}
                  </span>
                </div>

                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mt-5">
                  <div className="p-3.5 rounded-xl bg-emerald-50/70 border border-emerald-100">
                    <div className="flex items-center justify-between text-xs text-emerald-700 font-medium">
                      <span>Attendance Rate</span>
                      <CalendarCheck size={15} />
                    </div>
                    <p className="text-2xl font-bold text-emerald-900 mt-1">
                      {progress.attendance.percentage}%
                    </p>
                    <p className="text-xs text-emerald-700/80 mt-0.5">
                      {progress.attendance.presentCount + progress.attendance.lateCount} of{' '}
                      {progress.attendance.totalSessions} sessions
                    </p>
                  </div>

                  <div className="p-3.5 rounded-xl bg-indigo-50/70 border border-indigo-100">
                    <div className="flex items-center justify-between text-xs text-indigo-700 font-medium">
                      <span>Exam Average</span>
                      <GraduationCap size={15} />
                    </div>
                    <p className="text-2xl font-bold text-indigo-900 mt-1">
                      {progress.academics.averagePct !== null
                        ? `${progress.academics.averagePct}%`
                        : '—'}
                    </p>
                    <p className="text-xs text-indigo-700/80 mt-0.5">
                      {progress.academics.scores.length} graded subject entries
                    </p>
                  </div>

                  <div className="p-3.5 rounded-xl bg-brand-50/70 border border-brand-100">
                    <div className="flex items-center justify-between text-xs text-brand-700 font-medium">
                      <span>Holistic Credits</span>
                      <Award size={15} />
                    </div>
                    <p className="text-2xl font-bold text-brand-900 mt-1">
                      {progress.activities.summary.holisticPoints} pts
                    </p>
                    <p className="text-xs text-brand-700/80 mt-0.5">
                      {progress.activities.summary.approvedCount} approved activities
                    </p>
                  </div>

                  <div className="p-3.5 rounded-xl bg-amber-50/70 border border-amber-100">
                    <div className="flex items-center justify-between text-xs text-amber-800 font-medium">
                      <span>Fee Balance Due</span>
                      <IndianRupee size={15} />
                    </div>
                    <p className="text-2xl font-bold text-amber-950 mt-1">
                      {progress.fees.balanceDue !== null
                        ? `₹${progress.fees.balanceDue.toLocaleString()}`
                        : 'N/A'}
                    </p>
                    <p className="text-xs text-amber-800/80 mt-0.5">
                      Paid ₹{progress.fees.feesPaid.toLocaleString()}
                      {progress.fees.totalFees !== null
                        ? ` of ₹${progress.fees.totalFees.toLocaleString()}`
                        : ''}
                    </p>
                  </div>
                </div>
              </Card>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <Card>
                  <h3 className="text-base font-semibold text-neutral-900 mb-3 flex items-center gap-2">
                    <BookOpen size={17} className="text-indigo-600" />
                    Academic Term Progress (Baseline · Midline · Endline)
                  </h3>
                  {progress.academics.comparison.length === 0 ? (
                    <EmptyState
                      title="No term exam comparisons yet"
                      description="Subject scores will appear here after baseline, midline, or endline exams."
                    />
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-neutral-200 text-left text-xs uppercase text-neutral-500">
                            <th className="py-2 pr-3">Subject</th>
                            <th className="py-2 pr-3">Baseline</th>
                            <th className="py-2 pr-3">Midline</th>
                            <th className="py-2">Endline</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-neutral-100">
                          {progress.academics.comparison.map((row) => (
                            <tr key={row.subject}>
                              <td className="py-2 pr-3 font-medium text-neutral-900">{row.subject}</td>
                              <td className="py-2 pr-3">
                                {row.baseline !== null ? `${row.baseline}%` : '—'}
                              </td>
                              <td className="py-2 pr-3">
                                {row.midline !== null ? `${row.midline}%` : '—'}
                              </td>
                              <td className="py-2 font-semibold text-indigo-700">
                                {row.endline !== null ? `${row.endline}%` : '—'}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {progress.academics.scores.length > 0 && (
                    <div className="mt-4 pt-3 border-t border-neutral-100">
                      <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500 mb-2">
                        Recent Exam Scores
                      </p>
                      <div className="space-y-1.5 max-h-48 overflow-y-auto">
                        {progress.academics.scores.slice(0, 12).map((s) => (
                          <div
                            key={s.id}
                            className="flex items-center justify-between text-xs py-1.5 px-2.5 rounded bg-neutral-50"
                          >
                            <span>
                              <strong className="text-neutral-800">{s.subjectName}</strong> ·{' '}
                              {s.examName}
                              {s.academicYearLabel ? ` (${s.academicYearLabel})` : ''}
                            </span>
                            <span className="font-semibold text-neutral-900">
                              {s.isAbsent
                                ? 'Absent'
                                : s.marks !== null
                                  ? `${s.marks}/${s.maxMarks} (${s.percentage}%)`
                                  : '—'}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </Card>

                <Card>
                  <h3 className="text-base font-semibold text-neutral-900 mb-3 flex items-center gap-2">
                    <Star size={17} className="text-amber-500" />
                    Skills & Life Competency Snapshot
                  </h3>
                  {progress.skills.latest.length === 0 ? (
                    <EmptyState
                      title="No skill assessments recorded"
                      description="Latest teacher skill assessments will show up here."
                    />
                  ) : (
                    <div className="space-y-3">
                      {progress.skills.latest.map((sk) => {
                        const pct = Math.min(100, Math.round((sk.level / Math.max(1, sk.maxLevel)) * 100));
                        return (
                          <div key={sk.skillId} className="space-y-1">
                            <div className="flex items-center justify-between text-xs">
                              <span className="font-medium text-neutral-800">
                                {sk.name}
                                {sk.description ? (
                                  <span className="text-neutral-400 ml-1">({sk.description})</span>
                                ) : null}
                              </span>
                              <span className="text-neutral-600 font-semibold">
                                {sk.level} / {sk.maxLevel} · {formatDate(sk.assessedOn)}
                              </span>
                            </div>
                            <div className="h-2 w-full rounded-full bg-neutral-100 overflow-hidden">
                              <div
                                className="h-full rounded-full bg-brand-600"
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </Card>

                <Card>
                  <h3 className="text-base font-semibold text-neutral-900 mb-3 flex items-center gap-2">
                    <CalendarCheck size={17} className="text-emerald-600" />
                    Recent Attendance Sessions
                  </h3>
                  {progress.attendance.recentRecords.length === 0 ? (
                    <EmptyState
                      title="No attendance sessions yet"
                      description="Daily attendance logs appear once recorded."
                    />
                  ) : (
                    <div className="space-y-1.5 max-h-64 overflow-y-auto">
                      {progress.attendance.recentRecords.map((rec) => (
                        <div
                          key={rec.sessionId}
                          className="flex items-center justify-between text-sm px-3 py-2 rounded-lg border border-neutral-100 bg-neutral-50/70"
                        >
                          <span className="text-neutral-700">
                            {rec.sessionDate ? formatDate(rec.sessionDate) : 'Session'}
                          </span>
                          <Badge variant={ATTENDANCE_BADGE[rec.status] ?? 'neutral'}>
                            {rec.status}
                          </Badge>
                        </div>
                      ))}
                    </div>
                  )}
                </Card>

                <Card>
                  <h3 className="text-base font-semibold text-neutral-900 mb-3 flex items-center gap-2">
                    <IndianRupee size={17} className="text-amber-600" />
                    Fee Ledger & Co-Curricular Participation
                  </h3>
                  <div className="space-y-4">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500 mb-2">
                        Payment Receipts ({progress.fees.payments.length})
                      </p>
                      {progress.fees.payments.length === 0 ? (
                        <p className="text-xs text-neutral-500">No fee payments recorded yet.</p>
                      ) : (
                        <div className="space-y-1.5 max-h-36 overflow-y-auto">
                          {progress.fees.payments.map((p) => (
                            <div
                              key={p.id}
                              className="flex items-center justify-between text-xs px-2.5 py-2 rounded bg-neutral-50 border border-neutral-100"
                            >
                              <span>
                                <strong>₹{p.amount.toLocaleString()}</strong>
                                {p.notes ? ` · ${p.notes}` : ''}
                              </span>
                              <span className="text-neutral-500">{formatDate(p.paidAt)}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="pt-3 border-t border-neutral-100">
                      <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500 mb-2">
                        Co-Curricular Activities ({progress.activities.enrollments.length})
                      </p>
                      {progress.activities.enrollments.length === 0 ? (
                        <p className="text-xs text-neutral-500">No co-curricular activities yet.</p>
                      ) : (
                        <div className="space-y-1.5 max-h-36 overflow-y-auto">
                          {progress.activities.enrollments.map((enr) => (
                            <div
                              key={enr.id}
                              className="flex items-center justify-between text-xs px-2.5 py-2 rounded bg-neutral-50 border border-neutral-100"
                            >
                              <span className="font-medium text-neutral-800">
                                {enr.activity?.name || 'Activity'}
                              </span>
                              <Badge
                                variant={
                                  enr.status === 'approved_by_admin' ? 'success' : 'warning'
                                }
                              >
                                {enr.status === 'approved_by_admin' ? 'Approved' : 'Pending'}
                              </Badge>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </Card>
              </div>
            </>
          )}
        </div>
      )}
    </PageWrapper>
  );
};
