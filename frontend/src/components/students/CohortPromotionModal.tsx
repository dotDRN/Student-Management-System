import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { GraduationCap } from 'lucide-react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';
import { LoadingSpinner } from '../ui/LoadingSpinner';
import { ErrorMessage } from '../ui/ErrorMessage';
import { useToast } from '../../hooks/useToast';
import { getApiErrorMessage } from '../../services/api';
import { getStudents } from '../../services/students.service';
import {
  listAcademicYears,
  promoteStudentCohort,
  type AcademicYearRecord,
  type CohortTransitionAction,
  type CohortTransitionItem,
} from '../../services/academicYears.service';
import type { CenterSummary, ProgramSummary, Student } from '../../types';

interface CohortPromotionModalProps {
  isOpen: boolean;
  onClose: () => void;
  centers: CenterSummary[];
  programs: ProgramSummary[];
  defaultCenterId?: string;
  onCompleted: () => void;
}

interface RowTransitionState {
  action: CohortTransitionAction;
  targetProgramId: string;
  stream: string;
  post12thChoice: string;
  collegeName: string;
  discontinuationReason: string;
}

const ACTION_LABELS: Record<CohortTransitionAction, string> = {
  promote: 'Promote',
  retain: 'Retain',
  alumni: 'Post-12th Alumni',
  discontinued: 'Discontinued',
};

export const CohortPromotionModal: React.FC<CohortPromotionModalProps> = ({
  isOpen,
  onClose,
  centers,
  programs,
  defaultCenterId,
  onCompleted,
}) => {
  const toast = useToast();

  const [sourceCenterId, setSourceCenterId] = useState('');
  const [sourceProgramId, setSourceProgramId] = useState('');
  const [targetAcademicYearId, setTargetAcademicYearId] = useState('');

  const [academicYears, setAcademicYears] = useState<AcademicYearRecord[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [transitionsByStudent, setTransitionsByStudent] = useState<Record<string, RowTransitionState>>({});

  const [bulkAction, setBulkAction] = useState<CohortTransitionAction>('promote');
  const [bulkTargetProgramId, setBulkTargetProgramId] = useState('');
  const [bulkStream, setBulkStream] = useState('');
  const [bulkPost12thChoice, setBulkPost12thChoice] = useState('');
  const [bulkCollegeName, setBulkCollegeName] = useState('');
  const [bulkReason, setBulkReason] = useState('');

  const [loadingCohort, setLoadingCohort] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const effectiveCenterId = sourceCenterId || defaultCenterId || centers[0]?.id || '';
  const effectiveProgramId = sourceProgramId || programs[0]?.id || '';

  const defaultNextProgramId = useMemo(() => {
    const idx = programs.findIndex((p) => p.id === effectiveProgramId);
    if (idx >= 0 && idx + 1 < programs.length) {
      return programs[idx + 1].id;
    }
    return programs[0]?.id || '';
  }, [programs, effectiveProgramId]);

  const loadYearsAndCohort = useCallback(async () => {
    if (!isOpen) return;
    setLoadingCohort(true);
    setError(null);
    try {
      const [yearsRes, studentsRes] = await Promise.all([
        listAcademicYears(),
        effectiveCenterId && effectiveProgramId
          ? getStudents({
              centerId: effectiveCenterId,
              programId: effectiveProgramId,
              isActive: 'true',
              limit: 200,
              page: 1,
            })
          : Promise.resolve({ students: [] as Student[] }),
      ]);

      const yrs = Array.isArray(yearsRes) ? yearsRes : [];
      setAcademicYears(yrs);
      setTargetAcademicYearId((prev) => {
        if (prev && yrs.some((y) => y.id === prev)) return prev;
        const current = yrs.find((y) => y.isCurrent) ?? yrs[0];
        return current?.id || '';
      });

      const fetchedStudents = Array.isArray(studentsRes.students) ? studentsRes.students : [];
      setStudents(fetchedStudents);
      setSelectedIds(new Set(fetchedStudents.map((s) => s.id)));
      setTransitionsByStudent((prev) => {
        const next: Record<string, RowTransitionState> = {};
        for (const student of fetchedStudents) {
          next[student.id] = prev[student.id] ?? {
            action: 'promote',
            targetProgramId: defaultNextProgramId,
            stream: student.stream || '',
            post12thChoice: student.post12thChoice || '',
            collegeName: student.collegeName || '',
            discontinuationReason: '',
          };
        }
        return next;
      });
    } catch (err) {
      setError(getApiErrorMessage(err, 'Failed to load cohort students or academic years.'));
    } finally {
      setLoadingCohort(false);
    }
  }, [isOpen, effectiveCenterId, effectiveProgramId, defaultNextProgramId]);

  useEffect(() => {
    void loadYearsAndCohort();
  }, [loadYearsAndCohort]);

  const toggleStudent = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === students.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(students.map((s) => s.id)));
    }
  };

  const updateRowTransition = (studentId: string, patch: Partial<RowTransitionState>) => {
    setTransitionsByStudent((prev) => ({
      ...prev,
      [studentId]: {
        ...(prev[studentId] ?? {
          action: 'promote',
          targetProgramId: defaultNextProgramId,
          stream: '',
          post12thChoice: '',
          collegeName: '',
          discontinuationReason: '',
        }),
        ...patch,
      },
    }));
  };

  const handleApplyBulk = () => {
    if (selectedIds.size === 0) return;
    setTransitionsByStudent((prev) => {
      const next = { ...prev };
      for (const id of selectedIds) {
        const current = next[id] ?? {
          action: 'promote',
          targetProgramId: defaultNextProgramId,
          stream: '',
          post12thChoice: '',
          collegeName: '',
          discontinuationReason: '',
        };
        next[id] = {
          ...current,
          action: bulkAction,
          targetProgramId:
            bulkAction === 'promote'
              ? bulkTargetProgramId || defaultNextProgramId
              : current.targetProgramId,
          stream: bulkStream.trim() || current.stream,
          post12thChoice: bulkAction === 'alumni' ? bulkPost12thChoice || current.post12thChoice : current.post12thChoice,
          collegeName: bulkAction === 'alumni' ? bulkCollegeName || current.collegeName : current.collegeName,
          discontinuationReason:
            bulkAction === 'discontinued' ? bulkReason || current.discontinuationReason : current.discontinuationReason,
        };
      }
      return next;
    });
  };

  const selectedSummary = useMemo(() => {
    const counts = { promote: 0, retain: 0, alumni: 0, discontinued: 0 };
    for (const id of selectedIds) {
      const row = transitionsByStudent[id];
      if (row) counts[row.action] += 1;
    }
    return counts;
  }, [selectedIds, transitionsByStudent]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!targetAcademicYearId) {
      setError('Select a target academic year before running transitions.');
      return;
    }
    if (selectedIds.size === 0) {
      setError('Select at least one student to transition.');
      return;
    }

    const transitions: CohortTransitionItem[] = [];
    for (const student of students) {
      if (!selectedIds.has(student.id)) continue;
      const state = transitionsByStudent[student.id];
      if (!state) continue;
      if (state.action === 'promote' && !state.targetProgramId) {
        setError(`Select a target program for ${student.fullName}.`);
        return;
      }
      transitions.push({
        studentId: student.id,
        action: state.action,
        targetProgramId: state.action === 'promote' ? state.targetProgramId : undefined,
        stream: state.stream || undefined,
        post12thChoice: state.action === 'alumni' ? state.post12thChoice || undefined : undefined,
        collegeName: state.action === 'alumni' ? state.collegeName || undefined : undefined,
        discontinuationReason:
          state.action === 'discontinued' ? state.discontinuationReason || undefined : undefined,
      });
    }

    setSubmitting(true);
    try {
      const result = await promoteStudentCohort({
        targetAcademicYearId,
        transitions,
      });
      toast.success({
        title: `Transitioned ${result.updatedCount} students`,
        description: `Promoted ${result.summary.promoted}, Retained ${result.summary.retained}, Alumni ${result.summary.alumni}, Discontinued ${result.summary.discontinued}.`,
      });
      onCompleted();
      onClose();
    } catch (err) {
      setError(getApiErrorMessage(err, 'Failed to process cohort transition.'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Year-End Cohort Promotion & Transitions" maxWidth="2xl">
      <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
        {error && <ErrorMessage message={error} />}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wide text-neutral-600 mb-1">
              Source Center
            </label>
            <select
              value={effectiveCenterId}
              onChange={(e) => setSourceCenterId(e.target.value)}
              className="w-full h-9 rounded-lg border border-neutral-300 bg-white px-3 text-sm"
            >
              {centers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wide text-neutral-600 mb-1">
              Source Program
            </label>
            <select
              value={effectiveProgramId}
              onChange={(e) => setSourceProgramId(e.target.value)}
              className="w-full h-9 rounded-lg border border-neutral-300 bg-white px-3 text-sm"
            >
              {programs.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wide text-neutral-600 mb-1">
              Target Academic Year
            </label>
            <select
              value={targetAcademicYearId}
              onChange={(e) => setTargetAcademicYearId(e.target.value)}
              className="w-full h-9 rounded-lg border border-neutral-300 bg-white px-3 text-sm"
            >
              <option value="">Select target year…</option>
              {academicYears.map((y) => (
                <option key={y.id} value={y.id}>
                  {y.label} {y.isCurrent ? '(Current)' : ''}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-3 space-y-2.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs font-semibold uppercase tracking-wide text-neutral-600">
              Bulk Assign to Checked Students ({selectedIds.size})
            </span>
            <Button type="button" size="sm" variant="secondary" onClick={handleApplyBulk} disabled={selectedIds.size === 0}>
              Apply to Selected
            </Button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
            <select
              value={bulkAction}
              onChange={(e) => setBulkAction(e.target.value as CohortTransitionAction)}
              className="h-9 rounded-lg border border-neutral-300 bg-white px-2.5 text-sm"
            >
              {Object.entries(ACTION_LABELS).map(([k, lbl]) => (
                <option key={k} value={k}>
                  {lbl}
                </option>
              ))}
            </select>

            {bulkAction === 'promote' && (
              <select
                value={bulkTargetProgramId || defaultNextProgramId}
                onChange={(e) => setBulkTargetProgramId(e.target.value)}
                className="h-9 rounded-lg border border-neutral-300 bg-white px-2.5 text-sm"
              >
                {programs.map((p) => (
                  <option key={p.id} value={p.id}>
                    Target: {p.name}
                  </option>
                ))}
              </select>
            )}

            <input
              type="text"
              placeholder="Optional stream (e.g. Science)"
              value={bulkStream}
              onChange={(e) => setBulkStream(e.target.value)}
              className="h-9 rounded-lg border border-neutral-300 bg-white px-2.5 text-sm"
            />

            {bulkAction === 'alumni' && (
              <>
                <input
                  type="text"
                  placeholder="Post-12th choice (e.g. B.Sc, Vocational)"
                  value={bulkPost12thChoice}
                  onChange={(e) => setBulkPost12thChoice(e.target.value)}
                  className="h-9 rounded-lg border border-neutral-300 bg-white px-2.5 text-sm"
                />
                <input
                  type="text"
                  placeholder="College / Institution name"
                  value={bulkCollegeName}
                  onChange={(e) => setBulkCollegeName(e.target.value)}
                  className="h-9 rounded-lg border border-neutral-300 bg-white px-2.5 text-sm"
                />
              </>
            )}

            {bulkAction === 'discontinued' && (
              <input
                type="text"
                placeholder="Discontinuation reason"
                value={bulkReason}
                onChange={(e) => setBulkReason(e.target.value)}
                className="h-9 rounded-lg border border-neutral-300 bg-white px-2.5 text-sm md:col-span-2"
              />
            )}
          </div>
        </div>

        {loadingCohort ? (
          <LoadingSpinner />
        ) : students.length === 0 ? (
          <p className="text-sm text-neutral-500 text-center py-6 border border-dashed border-neutral-200 rounded-xl">
            No active students found in this center and program cohort.
          </p>
        ) : (
          <div className="border border-neutral-200 rounded-xl overflow-hidden max-h-[42vh] overflow-y-auto">
            <table className="min-w-full divide-y divide-neutral-200 text-sm">
              <thead className="bg-neutral-50 sticky top-0 z-10">
                <tr>
                  <th className="px-3 py-2 text-left w-10">
                    <input
                      type="checkbox"
                      aria-label="Select all students"
                      checked={students.length > 0 && selectedIds.size === students.length}
                      onChange={toggleSelectAll}
                      className="rounded border-neutral-300 text-brand-600 focus:ring-brand-500"
                    />
                  </th>
                  <th className="px-3 py-2 text-left font-medium text-neutral-600">Student</th>
                  <th className="px-3 py-2 text-left font-medium text-neutral-600">Action</th>
                  <th className="px-3 py-2 text-left font-medium text-neutral-600">Destination / Notes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100 bg-white">
                {students.map((student) => {
                  const checked = selectedIds.has(student.id);
                  const state = transitionsByStudent[student.id] ?? {
                    action: 'promote' as CohortTransitionAction,
                    targetProgramId: defaultNextProgramId,
                    stream: '',
                    post12thChoice: '',
                    collegeName: '',
                    discontinuationReason: '',
                  };
                  return (
                    <tr key={student.id} className={checked ? 'bg-white' : 'bg-neutral-50/50 opacity-60'}>
                      <td className="px-3 py-2">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleStudent(student.id)}
                          className="rounded border-neutral-300 text-brand-600 focus:ring-brand-500"
                        />
                      </td>
                      <td className="px-3 py-2">
                        <div className="font-medium text-neutral-900">{student.fullName}</div>
                        <div className="text-xs text-neutral-500">
                          {student.rollNumber ? `Roll ${student.rollNumber}` : 'No roll'}
                          {student.stream ? ` · ${student.stream}` : ''}
                        </div>
                      </td>
                      <td className="px-3 py-2">
                        <select
                          disabled={!checked}
                          value={state.action}
                          onChange={(e) =>
                            updateRowTransition(student.id, {
                              action: e.target.value as CohortTransitionAction,
                            })
                          }
                          className="h-8 rounded-md border border-neutral-300 bg-white px-2 text-xs"
                        >
                          {Object.entries(ACTION_LABELS).map(([k, lbl]) => (
                            <option key={k} value={k}>
                              {lbl}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="px-3 py-2">
                        {state.action === 'promote' && (
                          <select
                            disabled={!checked}
                            value={state.targetProgramId}
                            onChange={(e) =>
                              updateRowTransition(student.id, { targetProgramId: e.target.value })
                            }
                            className="h-8 w-full rounded-md border border-neutral-300 bg-white px-2 text-xs"
                          >
                            {programs.map((p) => (
                              <option key={p.id} value={p.id}>
                                {p.name}
                              </option>
                            ))}
                          </select>
                        )}
                        {state.action === 'retain' && (
                          <span className="text-xs text-neutral-500">Remains in current program</span>
                        )}
                        {state.action === 'alumni' && (
                          <div className="flex gap-1.5">
                            <input
                              disabled={!checked}
                              type="text"
                              placeholder="Post-12th track"
                              value={state.post12thChoice}
                              onChange={(e) =>
                                updateRowTransition(student.id, { post12thChoice: e.target.value })
                              }
                              className="h-8 w-1/2 rounded-md border border-neutral-300 px-2 text-xs"
                            />
                            <input
                              disabled={!checked}
                              type="text"
                              placeholder="College"
                              value={state.collegeName}
                              onChange={(e) =>
                                updateRowTransition(student.id, { collegeName: e.target.value })
                              }
                              className="h-8 w-1/2 rounded-md border border-neutral-300 px-2 text-xs"
                            />
                          </div>
                        )}
                        {state.action === 'discontinued' && (
                          <input
                            disabled={!checked}
                            type="text"
                            placeholder="Discontinuation reason"
                            value={state.discontinuationReason}
                            onChange={(e) =>
                              updateRowTransition(student.id, { discontinuationReason: e.target.value })
                            }
                            className="h-8 w-full rounded-md border border-neutral-300 px-2 text-xs"
                          />
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-neutral-100">
          <div className="flex flex-wrap gap-1.5 text-xs">
            <Badge variant="success">Promote: {selectedSummary.promote}</Badge>
            <Badge variant="neutral">Retain: {selectedSummary.retain}</Badge>
            <Badge variant="primary">Alumni: {selectedSummary.alumni}</Badge>
            <Badge variant="warning">Discontinued: {selectedSummary.discontinued}</Badge>
          </div>

          <div className="flex gap-2">
            <Button type="button" variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              isLoading={submitting}
              disabled={loadingCohort || selectedIds.size === 0 || !targetAcademicYearId}
            >
              <GraduationCap size={15} className="mr-1.5" />
              Run Cohort Transition ({selectedIds.size})
            </Button>
          </div>
        </div>
      </form>
    </Modal>
  );
};
