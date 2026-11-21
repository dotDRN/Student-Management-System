import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Search, Trash2, UserPlus, Users } from 'lucide-react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';
import { LoadingSpinner } from '../ui/LoadingSpinner';
import { ErrorMessage } from '../ui/ErrorMessage';
import { useToast } from '../../hooks/useToast';
import { usePermission } from '../../hooks/usePermission';
import { useAuthStore } from '../../store/useAuthStore';
import { getApiErrorMessage } from '../../services/api';
import { getStudents } from '../../services/students.service';
import {
  enrollStudentsInActivity,
  listActivityEnrollments,
  removeActivityEnrollment,
  updateActivityEnrollmentStatus,
  type ActivityEnrollmentRecord,
  type ActivityRecord,
} from '../../services/activities.service';
import type { Student } from '../../types';

interface ActivityEnrollmentsModalProps {
  activity: ActivityRecord | null;
  onClose: () => void;
  onUpdated: () => void;
}

export const ActivityEnrollmentsModal: React.FC<ActivityEnrollmentsModalProps> = ({
  activity,
  onClose,
  onUpdated,
}) => {
  const toast = useToast();
  const { can, isAdminRole } = usePermission();
  const currentUser = useAuthStore((s) => s.currentUser);
  const canManageActivities = can('manage', 'activities');

  const [enrollments, setEnrollments] = useState<ActivityEnrollmentRecord[]>([]);
  const [candidates, setCandidates] = useState<Student[]>([]);
  const [selectedStudentIds, setSelectedStudentIds] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [busyStudentId, setBusyStudentId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    if (!activity) return;
    setLoading(true);
    setError(null);
    try {
      const [enrList, stuRes] = await Promise.all([
        listActivityEnrollments(activity.id),
        getStudents({
          centerId: activity.centerId,
          programId: activity.programId || undefined,
          isActive: 'true',
          limit: 200,
          page: 1,
        }),
      ]);
      setEnrollments(enrList);
      setCandidates(Array.isArray(stuRes.students) ? stuRes.students : []);
      setSelectedStudentIds(new Set());
    } catch (err) {
      setError(getApiErrorMessage(err, 'Failed to load activity participants.'));
    } finally {
      setLoading(false);
    }
  }, [activity]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const enrolledIds = useMemo(
    () => new Set(enrollments.map((e) => e.studentId)),
    [enrollments],
  );

  const availableStudents = useMemo(() => {
    const q = search.trim().toLowerCase();
    return candidates.filter((s) => {
      if (enrolledIds.has(s.id)) return false;
      if (!q) return true;
      return (
        s.fullName.toLowerCase().includes(q) ||
        (s.rollNumber || '').toLowerCase().includes(q)
      );
    });
  }, [candidates, enrolledIds, search]);

  const toggleCandidate = (studentId: string) => {
    setSelectedStudentIds((prev) => {
      const next = new Set(prev);
      if (next.has(studentId)) next.delete(studentId);
      else next.add(studentId);
      return next;
    });
  };

  const handleEnrollSelected = async () => {
    if (!activity || selectedStudentIds.size === 0) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await enrollStudentsInActivity(activity.id, Array.from(selectedStudentIds));
      toast.success({
        title:
          res.status === 'approved_by_admin'
            ? `Enrolled ${res.enrolledCount} student(s)`
            : `Submitted ${res.enrolledCount} teacher nomination(s)`,
        description:
          res.status === 'requested_by_teacher'
            ? 'Pending admin approval before appearing in approved credits.'
            : undefined,
      });
      await loadData();
      onUpdated();
    } catch (err) {
      setError(getApiErrorMessage(err, 'Could not enroll selected students.'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleApprove = async (studentId: string) => {
    if (!activity) return;
    setBusyStudentId(studentId);
    try {
      await updateActivityEnrollmentStatus(activity.id, studentId, 'approved_by_admin');
      toast.success({ title: 'Participant approved' });
      await loadData();
      onUpdated();
    } catch (err) {
      toast.error({
        title: 'Approval failed',
        description: getApiErrorMessage(err, 'Could not approve enrollment.'),
      });
    } finally {
      setBusyStudentId(null);
    }
  };

  const handleRemove = async (studentId: string) => {
    if (!activity) return;
    setBusyStudentId(studentId);
    try {
      await removeActivityEnrollment(activity.id, studentId);
      toast.success({ title: 'Participant removed' });
      await loadData();
      onUpdated();
    } catch (err) {
      toast.error({
        title: 'Removal failed',
        description: getApiErrorMessage(err, 'Could not remove enrollment.'),
      });
    } finally {
      setBusyStudentId(null);
    }
  };

  return (
    <Modal
      isOpen={Boolean(activity)}
      onClose={onClose}
      title={activity ? `Participants — ${activity.name}` : 'Participants'}
      maxWidth="2xl"
    >
      {activity && (
        <div className="space-y-5">
          {error && <ErrorMessage message={error} />}

          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-neutral-600 bg-neutral-50 border border-neutral-200 rounded-lg px-3 py-2">
            <span>
              Center: <strong>{activity.center?.name || 'Assigned Center'}</strong>
              {activity.program?.name ? ` · Program: ${activity.program.name}` : ' · Open to all center programs'}
            </span>
            <Badge variant="neutral">{enrollments.length} enrolled</Badge>
          </div>

          {loading ? (
            <LoadingSpinner />
          ) : (
            <>
              <div>
                <h4 className="text-sm font-semibold text-neutral-800 mb-2 flex items-center gap-1.5">
                  <Users size={15} /> Current Enrollments ({enrollments.length})
                </h4>
                {enrollments.length === 0 ? (
                  <p className="text-sm text-neutral-500 border border-dashed border-neutral-200 rounded-lg py-4 text-center">
                    No students enrolled in this activity yet.
                  </p>
                ) : (
                  <div className="max-h-52 overflow-y-auto border border-neutral-200 rounded-xl divide-y divide-neutral-100">
                    {enrollments.map((enr) => {
                      const isPending = enr.status === 'requested_by_teacher';
                      const canRemove =
                        isAdminRole ||
                        (canManageActivities && isPending && enr.requestedBy === currentUser?.id);
                      return (
                        <div
                          key={enr.id}
                          className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5 text-sm bg-white"
                        >
                          <div>
                            <div className="font-medium text-neutral-900">
                              {enr.student?.fullName || 'Student'}
                              {enr.student?.rollNumber ? (
                                <span className="text-xs text-neutral-500 ml-1.5">
                                  ({enr.student.rollNumber})
                                </span>
                              ) : null}
                            </div>
                            <div className="text-xs text-neutral-500">
                              {enr.student?.program?.name || 'Program'}
                              {enr.requestedByUser?.fullName
                                ? ` · Requested by ${enr.requestedByUser.fullName}`
                                : ''}
                            </div>
                          </div>

                          <div className="flex items-center gap-2">
                            <Badge variant={isPending ? 'warning' : 'success'}>
                              {isPending ? 'Pending Approval' : 'Approved'}
                            </Badge>
                            {isAdminRole && isPending && (
                              <Button
                                type="button"
                                size="sm"
                                variant="secondary"
                                isLoading={busyStudentId === enr.studentId}
                                onClick={() => void handleApprove(enr.studentId)}
                              >
                                <CheckCircle2 size={13} className="mr-1" /> Approve
                              </Button>
                            )}
                            {canRemove && (
                              <Button
                                type="button"
                                size="sm"
                                variant="ghost"
                                className="text-danger hover:bg-danger/10"
                                isLoading={busyStudentId === enr.studentId}
                                onClick={() => void handleRemove(enr.studentId)}
                              >
                                <Trash2 size={13} />
                              </Button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {canManageActivities && (
                <div className="border-t border-neutral-200 pt-4 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h4 className="text-sm font-semibold text-neutral-800 flex items-center gap-1.5">
                      <UserPlus size={15} />
                      {isAdminRole ? 'Enroll Students' : 'Nominate Students (Admin Approval)'}
                    </h4>
                    <div className="relative w-full sm:w-56">
                      <Search size={14} className="absolute left-2.5 top-2.5 text-neutral-400" />
                      <input
                        type="text"
                        placeholder="Filter active students..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="w-full h-8 pl-8 pr-2.5 rounded-lg border border-neutral-300 text-xs"
                      />
                    </div>
                  </div>

                  {availableStudents.length === 0 ? (
                    <p className="text-xs text-neutral-500 py-3 text-center bg-neutral-50 rounded-lg">
                      All eligible active students are already enrolled or match no search filter.
                    </p>
                  ) : (
                    <div className="max-h-44 overflow-y-auto border border-neutral-200 rounded-xl divide-y divide-neutral-100">
                      {availableStudents.map((student) => (
                        <label
                          key={student.id}
                          className="flex items-center justify-between gap-2 px-3 py-2 text-sm cursor-pointer hover:bg-neutral-50"
                        >
                          <div className="flex items-center gap-2.5">
                            <input
                              type="checkbox"
                              checked={selectedStudentIds.has(student.id)}
                              onChange={() => toggleCandidate(student.id)}
                              className="rounded border-neutral-300 text-brand-600 focus:ring-brand-500"
                            />
                            <span className="font-medium text-neutral-800">{student.fullName}</span>
                            {student.rollNumber && (
                              <span className="text-xs text-neutral-500">({student.rollNumber})</span>
                            )}
                          </div>
                          <span className="text-xs text-neutral-500">{student.program?.name || ''}</span>
                        </label>
                      ))}
                    </div>
                  )}

                  <div className="flex justify-end gap-2">
                    <Button type="button" variant="secondary" onClick={onClose}>
                      Close
                    </Button>
                    <Button
                      type="button"
                      variant="primary"
                      isLoading={submitting}
                      disabled={selectedStudentIds.size === 0}
                      onClick={() => void handleEnrollSelected()}
                    >
                      <UserPlus size={14} className="mr-1.5" />
                      {isAdminRole ? 'Enroll' : 'Nominate'} ({selectedStudentIds.size})
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </Modal>
  );
};
