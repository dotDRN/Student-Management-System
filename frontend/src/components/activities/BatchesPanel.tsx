import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  CheckSquare,
  Edit2,
  Layers,
  Plus,
  Square,
  Trash2,
  UserMinus,
  Users,
} from 'lucide-react';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { ConfirmModal } from '../ui/ConfirmModal';
import { EmptyState } from '../ui/EmptyState';
import { Input } from '../ui/Input';
import { LoadingSpinner } from '../ui/LoadingSpinner';
import { Modal } from '../ui/Modal';
import { useToast } from '../../hooks/useToast';
import { getApiErrorMessage } from '../../services/api';
import type { ActivityRecord } from '../../services/activities.service';
import {
  createBatch,
  deleteBatch,
  enrollStudentsInBatch,
  getBatchById,
  listBatches,
  removeStudentFromBatch,
  updateBatch,
  type BatchDetail,
  type BatchSummary,
} from '../../services/batches.service';
import { getStudents } from '../../services/students.service';
import { listUsers, type UserAdminItem } from '../../services/users.service';
import type { CenterSummary, ProgramSummary, Student } from '../../types';

interface BatchesPanelProps {
  centers: CenterSummary[];
  programs: ProgramSummary[];
  activities: ActivityRecord[];
  canManageBatches: boolean;
  canDeleteBatches: boolean;
}

interface BatchFormState {
  centerId: string;
  programId: string;
  activityId: string;
  name: string;
  teacherId: string;
  maxStudents: string;
}

export const BatchesPanel: React.FC<BatchesPanelProps> = ({
  centers,
  programs,
  activities,
  canManageBatches,
  canDeleteBatches,
}) => {
  const toast = useToast();

  const [batches, setBatches] = useState<BatchSummary[]>([]);
  const [teachers, setTeachers] = useState<UserAdminItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [centerFilter, setCenterFilter] = useState('');
  const [programFilter, setProgramFilter] = useState('');
  const [searchTerm, setSearchTerm] = useState('');

  // Create / Edit modal state
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingBatch, setEditingBatch] = useState<BatchSummary | null>(null);
  const [formData, setFormData] = useState<BatchFormState>({
    centerId: centers[0]?.id ?? '',
    programId: programs[0]?.id ?? '',
    activityId: '',
    name: '',
    teacherId: '',
    maxStudents: '',
  });

  // Delete confirm state
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);

  // Roster modal state
  const [rosterBatch, setRosterBatch] = useState<BatchDetail | null>(null);
  const [rosterLoading, setRosterLoading] = useState(false);
  const [eligibleStudents, setEligibleStudents] = useState<Student[]>([]);
  const [selectedToEnroll, setSelectedToEnroll] = useState<Set<string>>(new Set());
  const [rosterSearch, setRosterSearch] = useState('');
  const [rosterBusy, setRosterBusy] = useState(false);

  const fetchBatches = useCallback(async () => {
    setLoading(true);
    try {
      const data = await listBatches({
        ...(centerFilter ? { centerId: centerFilter } : {}),
        ...(programFilter ? { programId: programFilter } : {}),
      });
      setBatches(Array.isArray(data) ? data : []);
    } catch (err) {
      toast.error({
        title: 'Could not load batches',
        description: getApiErrorMessage(err, 'Failed to fetch class batches.'),
      });
    } finally {
      setLoading(false);
    }
  }, [centerFilter, programFilter, toast]);

  useEffect(() => {
    void fetchBatches();
  }, [fetchBatches]);

  useEffect(() => {
    let alive = true;
    listUsers({ limit: 200, isActive: true })
      .then((res) => {
        if (!alive) return;
        const assignable = (res.users ?? []).filter((u) =>
          ['teacher', 'supervisor', 'center_admin', 'super_admin', 'tech_admin', 'staff'].includes(
            u.role,
          ),
        );
        setTeachers(assignable);
      })
      .catch(() => {
        if (alive) setTeachers([]);
      });
    return () => {
      alive = false;
    };
  }, []);

  const filteredBatches = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    if (!q) return batches;
    return batches.filter((b) => {
      const hay = `${b.name} ${b.center?.name ?? ''} ${b.activity?.program?.name ?? ''} ${b.teacher?.fullName ?? ''}`.toLowerCase();
      return hay.includes(q);
    });
  }, [batches, searchTerm]);

  const totalEnrolledSlots = useMemo(
    () => batches.reduce((acc, b) => acc + (b._count?.batchEnrollments ?? 0), 0),
    [batches],
  );

  const assignedTeachersCount = useMemo(
    () => new Set(batches.map((b) => b.teacherId).filter(Boolean)).size,
    [batches],
  );

  const formActivityOptions = useMemo(() => {
    return activities.filter((a) => {
      if (formData.centerId && a.centerId !== formData.centerId) return false;
      if (formData.programId && a.programId && a.programId !== formData.programId) return false;
      return true;
    });
  }, [activities, formData.centerId, formData.programId]);

  const openCreateModal = () => {
    setEditingBatch(null);
    setFormData({
      centerId: centerFilter || centers[0]?.id || '',
      programId: programFilter || programs[0]?.id || '',
      activityId: '',
      name: '',
      teacherId: '',
      maxStudents: '',
    });
    setIsFormOpen(true);
  };

  const openEditModal = (batch: BatchSummary) => {
    setEditingBatch(batch);
    setFormData({
      centerId: batch.centerId,
      programId: batch.activity?.programId ?? programs[0]?.id ?? '',
      activityId: batch.activityId,
      name: batch.name,
      teacherId: batch.teacherId ?? '',
      maxStudents: batch.maxStudents != null ? String(batch.maxStudents) : '',
    });
    setIsFormOpen(true);
  };

  const handleSaveBatch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim()) return;
    setSaving(true);
    try {
      const parsedMax = formData.maxStudents.trim() ? Number(formData.maxStudents.trim()) : null;
      if (editingBatch) {
        await updateBatch(editingBatch.id, {
          name: formData.name.trim(),
          teacherId: formData.teacherId || null,
          maxStudents: parsedMax,
        });
        toast.success({ title: 'Batch updated' });
      } else {
        await createBatch({
          centerId: formData.centerId,
          ...(formData.activityId
            ? { activityId: formData.activityId, programId: formData.programId || undefined }
            : { programId: formData.programId }),
          name: formData.name.trim(),
          teacherId: formData.teacherId || null,
          maxStudents: parsedMax,
        });
        toast.success({ title: 'Batch created' });
      }
      setIsFormOpen(false);
      await fetchBatches();
    } catch (err) {
      toast.error({
        title: editingBatch ? 'Update failed' : 'Create failed',
        description: getApiErrorMessage(err, 'Could not save batch.'),
      });
    } finally {
      setSaving(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!deleteTargetId) return;
    const id = deleteTargetId;
    setDeleteTargetId(null);
    try {
      await deleteBatch(id);
      toast.success({ title: 'Batch deleted' });
      await fetchBatches();
    } catch (err) {
      toast.error({
        title: 'Cannot delete batch',
        description: getApiErrorMessage(err, 'Delete failed.'),
      });
    }
  };

  const openRosterModal = async (batchId: string) => {
    setRosterLoading(true);
    setRosterSearch('');
    setSelectedToEnroll(new Set());
    try {
      const detail = await getBatchById(batchId);
      setRosterBatch(detail);
      const stuRes = await getStudents({
        centerId: detail.centerId,
        ...(detail.activity?.programId ? { programId: detail.activity.programId } : {}),
        isActive: true,
        limit: 200,
      });
      setEligibleStudents(stuRes.students ?? []);
    } catch (err) {
      toast.error({
        title: 'Failed to load batch roster',
        description: getApiErrorMessage(err, 'Could not open roster.'),
      });
    } finally {
      setRosterLoading(false);
    }
  };

  const enrolledIdSet = useMemo(
    () => new Set((rosterBatch?.batchEnrollments ?? []).map((e) => e.studentId)),
    [rosterBatch],
  );

  const availableStudentsToAdd = useMemo(() => {
    const q = rosterSearch.trim().toLowerCase();
    return eligibleStudents.filter((s) => {
      if (enrolledIdSet.has(s.id)) return false;
      if (!q) return true;
      return `${s.fullName} ${s.rollNumber ?? ''}`.toLowerCase().includes(q);
    });
  }, [eligibleStudents, enrolledIdSet, rosterSearch]);

  const toggleEnrollSelect = (studentId: string) => {
    setSelectedToEnroll((prev) => {
      const next = new Set(prev);
      if (next.has(studentId)) next.delete(studentId);
      else next.add(studentId);
      return next;
    });
  };

  const handleEnrollSelected = async () => {
    if (!rosterBatch || selectedToEnroll.size === 0) return;
    setRosterBusy(true);
    try {
      const res = await enrollStudentsInBatch(rosterBatch.id, Array.from(selectedToEnroll));
      setRosterBatch(res.batch);
      setSelectedToEnroll(new Set());
      toast.success({
        title: 'Students enrolled',
        description: `Added ${res.addedCount} student(s) to ${rosterBatch.name}.`,
      });
      await fetchBatches();
    } catch (err) {
      toast.error({
        title: 'Enrollment failed',
        description: getApiErrorMessage(err, 'Could not enroll students.'),
      });
    } finally {
      setRosterBusy(false);
    }
  };

  const handleRemoveStudent = async (studentId: string) => {
    if (!rosterBatch) return;
    setRosterBusy(true);
    try {
      await removeStudentFromBatch(rosterBatch.id, studentId);
      const updated = await getBatchById(rosterBatch.id);
      setRosterBatch(updated);
      toast.success({ title: 'Removed from batch' });
      await fetchBatches();
    } catch (err) {
      toast.error({
        title: 'Removal failed',
        description: getApiErrorMessage(err, 'Could not remove student.'),
      });
    } finally {
      setRosterBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-neutral-900 flex items-center gap-2">
            <Layers className="text-primary" size={22} />
            Class Batches & Cohorts
          </h2>
          <p className="text-sm text-neutral-500">
            Organize students into morning/evening sections with assigned teachers and capacity tracking
          </p>
        </div>
        {canManageBatches && (
          <Button variant="primary" className="inline-flex items-center gap-2" onClick={openCreateModal}>
            <Plus size={18} />
            Create Batch
          </Button>
        )}
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="p-4 flex items-center gap-4">
          <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
            <Layers size={20} />
          </div>
          <div>
            <p className="text-xs text-neutral-500 font-medium">Active Batches</p>
            <p className="text-xl font-bold text-neutral-900">{batches.length}</p>
          </div>
        </Card>
        <Card className="p-4 flex items-center gap-4">
          <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
            <Users size={20} />
          </div>
          <div>
            <p className="text-xs text-neutral-500 font-medium">Total Batch Enrollments</p>
            <p className="text-xl font-bold text-neutral-900">{totalEnrolledSlots}</p>
          </div>
        </Card>
        <Card className="p-4 flex items-center gap-4">
          <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center">
            <Users size={20} />
          </div>
          <div>
            <p className="text-xs text-neutral-500 font-medium">Teachers Assigned</p>
            <p className="text-xl font-bold text-neutral-900">{assignedTeachersCount}</p>
          </div>
        </Card>
      </div>

      {/* Filters */}
      <Card className="p-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Input
            placeholder="Search batch or teacher…"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
          <select
            aria-label="Filter batches by center"
            className="rounded-lg border border-neutral-300 px-3 py-2 text-sm bg-white"
            value={centerFilter}
            onChange={(e) => setCenterFilter(e.target.value)}
          >
            <option value="">All accessible centers</option>
            {centers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <select
            aria-label="Filter batches by program"
            className="rounded-lg border border-neutral-300 px-3 py-2 text-sm bg-white"
            value={programFilter}
            onChange={(e) => setProgramFilter(e.target.value)}
          >
            <option value="">All programs</option>
            {programs.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
      </Card>

      {loading ? (
        <LoadingSpinner label="Loading batches…" />
      ) : filteredBatches.length === 0 ? (
        <EmptyState
          title="No batches found"
          description="Create a batch to group students by section, mentor, or shift."
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredBatches.map((batch) => {
            const enrolled = batch._count?.batchEnrollments ?? 0;
            const sessions = batch._count?.attendanceSessions ?? 0;
            return (
              <Card key={batch.id} className="p-5 flex flex-col justify-between gap-4">
                <div>
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div>
                      <h3 className="text-lg font-bold text-neutral-900">{batch.name}</h3>
                      <p className="text-xs text-neutral-500">
                        {batch.center?.name ?? 'Center'} ·{' '}
                        {batch.activity?.program?.name ?? batch.activity?.name ?? 'Class Cohort'}
                      </p>
                    </div>
                    <Badge variant="primary">
                      {enrolled}
                      {batch.maxStudents ? ` / ${batch.maxStudents}` : ''} students
                    </Badge>
                  </div>

                  <div className="text-xs text-neutral-600 space-y-1 mt-3 bg-neutral-50 rounded-lg p-3 border border-neutral-100">
                    <div>
                      <span className="font-medium text-neutral-700">Teacher:</span>{' '}
                      {batch.teacher?.fullName ?? 'Unassigned'}
                    </div>
                    <div>
                      <span className="font-medium text-neutral-700">Attendance sessions:</span>{' '}
                      {sessions}
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2 pt-2 border-t border-neutral-100">
                  <Button
                    variant="secondary"
                    size="sm"
                    className="flex-1"
                    onClick={() => void openRosterModal(batch.id)}
                  >
                    <Users size={14} className="mr-1.5" />
                    Roster ({enrolled})
                  </Button>
                  {canManageBatches && (
                    <Button
                      variant="ghost"
                      size="sm"
                      aria-label={`Edit ${batch.name}`}
                      onClick={() => openEditModal(batch)}
                    >
                      <Edit2 size={14} />
                    </Button>
                  )}
                  {canDeleteBatches && (
                    <Button
                      variant="ghost"
                      size="sm"
                      aria-label={`Delete ${batch.name}`}
                      className="text-danger hover:bg-danger/10"
                      onClick={() => setDeleteTargetId(batch.id)}
                    >
                      <Trash2 size={14} />
                    </Button>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* Create / Edit Batch Modal */}
      <Modal
        isOpen={isFormOpen}
        onClose={() => setIsFormOpen(false)}
        title={editingBatch ? 'Edit Batch' : 'Create Class Batch'}
      >
        <form onSubmit={handleSaveBatch} className="space-y-4">
          {!editingBatch && (
            <>
              <div>
                <label className="block text-sm font-medium text-neutral-700 mb-1">Center</label>
                <select
                  required
                  className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm bg-white"
                  value={formData.centerId}
                  onChange={(e) =>
                    setFormData((p) => ({ ...p, centerId: e.target.value, activityId: '' }))
                  }
                >
                  {centers.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-neutral-700 mb-1">Program</label>
                <select
                  required={!formData.activityId}
                  className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm bg-white"
                  value={formData.programId}
                  onChange={(e) =>
                    setFormData((p) => ({ ...p, programId: e.target.value, activityId: '' }))
                  }
                >
                  {programs.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>
              {formActivityOptions.length > 0 && (
                <div>
                  <label className="block text-sm font-medium text-neutral-700 mb-1">
                    Linked Activity (optional)
                  </label>
                  <select
                    className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm bg-white"
                    value={formData.activityId}
                    onChange={(e) => setFormData((p) => ({ ...p, activityId: e.target.value }))}
                  >
                    <option value="">Auto-link to program class container</option>
                    {formActivityOptions.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </>
          )}

          <Input
            label="Batch / Section Name"
            required
            placeholder="e.g. Morning Section A"
            value={formData.name}
            onChange={(e) => setFormData((p) => ({ ...p, name: e.target.value }))}
          />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-1">
                Assigned Teacher (optional)
              </label>
              <select
                className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm bg-white"
                value={formData.teacherId}
                onChange={(e) => setFormData((p) => ({ ...p, teacherId: e.target.value }))}
              >
                <option value="">Unassigned</option>
                {teachers.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.fullName}
                  </option>
                ))}
              </select>
            </div>
            <Input
              label="Max Capacity (optional)"
              type="number"
              min="1"
              max="500"
              placeholder="e.g. 30"
              value={formData.maxStudents}
              onChange={(e) => setFormData((p) => ({ ...p, maxStudents: e.target.value }))}
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={() => setIsFormOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" isLoading={saving}>
              {editingBatch ? 'Save Changes' : 'Create Batch'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Roster Management Modal */}
      <Modal
        isOpen={Boolean(rosterBatch) || rosterLoading}
        onClose={() => {
          if (!rosterBusy) setRosterBatch(null);
        }}
        title={rosterBatch ? `${rosterBatch.name} — Student Roster` : 'Loading Roster…'}
        maxWidth="lg"
      >
        {rosterLoading || !rosterBatch ? (
          <LoadingSpinner label="Loading batch roster…" />
        ) : (
          <div className="space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-2 bg-neutral-50 border border-neutral-200 rounded-lg px-4 py-2.5 text-sm">
              <span>
                <strong>{rosterBatch.center?.name}</strong> ·{' '}
                {rosterBatch.activity?.program?.name ?? rosterBatch.activity?.name}
              </span>
              <span className="font-semibold text-neutral-800">
                Enrolled: {rosterBatch.batchEnrollments.length}
                {rosterBatch.maxStudents ? ` / ${rosterBatch.maxStudents}` : ''}
              </span>
            </div>

            {/* Enrolled students */}
            <div>
              <h4 className="text-sm font-semibold text-neutral-800 mb-2">
                Enrolled Students ({rosterBatch.batchEnrollments.length})
              </h4>
              {rosterBatch.batchEnrollments.length === 0 ? (
                <p className="text-sm text-neutral-500 py-3">
                  No students enrolled in this batch yet.
                </p>
              ) : (
                <div className="max-h-48 overflow-y-auto divide-y divide-neutral-100 border border-neutral-200 rounded-lg">
                  {rosterBatch.batchEnrollments.map((item) => (
                    <div
                      key={item.id}
                      className="flex items-center justify-between px-3 py-2 text-sm"
                    >
                      <div>
                        <span className="font-medium text-neutral-900">
                          {item.student.fullName}
                        </span>
                        {item.student.rollNumber && (
                          <span className="text-xs text-neutral-500 ml-2">
                            #{item.student.rollNumber}
                          </span>
                        )}
                      </div>
                      {canManageBatches && (
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={rosterBusy}
                          className="text-danger hover:bg-danger/10"
                          onClick={() => void handleRemoveStudent(item.studentId)}
                        >
                          <UserMinus size={14} className="mr-1" /> Remove
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Enroll more active eligible students */}
            {canManageBatches && (
              <div className="pt-4 border-t border-neutral-200">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
                  <h4 className="text-sm font-semibold text-neutral-800">
                    Add Eligible Students ({availableStudentsToAdd.length} available)
                  </h4>
                  <input
                    type="text"
                    placeholder="Filter by name or roll…"
                    value={rosterSearch}
                    onChange={(e) => setRosterSearch(e.target.value)}
                    className="rounded-lg border border-neutral-300 px-3 py-1.5 text-xs sm:w-56"
                  />
                </div>
                {availableStudentsToAdd.length === 0 ? (
                  <p className="text-xs text-neutral-500">
                    All eligible active students are already enrolled or none match the filter.
                  </p>
                ) : (
                  <div className="max-h-48 overflow-y-auto divide-y divide-neutral-100 border border-neutral-200 rounded-lg mb-3">
                    {availableStudentsToAdd.map((stu) => {
                      const checked = selectedToEnroll.has(stu.id);
                      return (
                        <button
                          key={stu.id}
                          type="button"
                          onClick={() => toggleEnrollSelect(stu.id)}
                          className="w-full flex items-center justify-between px-3 py-2 text-left text-sm hover:bg-neutral-50"
                        >
                          <div className="flex items-center gap-2">
                            {checked ? (
                              <CheckSquare size={16} className="text-primary" />
                            ) : (
                              <Square size={16} className="text-neutral-400" />
                            )}
                            <span className="font-medium text-neutral-900">{stu.fullName}</span>
                            {stu.rollNumber && (
                              <span className="text-xs text-neutral-500">#{stu.rollNumber}</span>
                            )}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}

                <div className="flex justify-end gap-2">
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={rosterBusy}
                    onClick={() => setRosterBatch(null)}
                  >
                    Close
                  </Button>
                  <Button
                    type="button"
                    variant="primary"
                    isLoading={rosterBusy}
                    disabled={selectedToEnroll.size === 0}
                    onClick={() => void handleEnrollSelected()}
                  >
                    Enroll Selected ({selectedToEnroll.size})
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
      </Modal>

      <ConfirmModal
        open={Boolean(deleteTargetId)}
        onCancel={() => setDeleteTargetId(null)}
        onConfirm={handleConfirmDelete}
        title="Delete Batch"
        message="This permanently removes the batch and its student enrollments. Batches with recorded attendance sessions cannot be deleted."
        confirmLabel="Delete Batch"
        variant="danger"
      />
    </div>
  );
};
