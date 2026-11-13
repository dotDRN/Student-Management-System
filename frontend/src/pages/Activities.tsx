import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Calendar,
  CheckCircle2,
  Circle,
  Clock,
  MapPin,
  Plus,
  Trash2,
} from 'lucide-react';
import { PageWrapper } from '../components/layout/PageWrapper';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Modal } from '../components/ui/Modal';
import { ConfirmModal } from '../components/ui/ConfirmModal';
import { LoadingSpinner } from '../components/ui/LoadingSpinner';
import { ErrorMessage } from '../components/ui/ErrorMessage';
import { usePermission } from '../hooks/usePermission';
import { useToast } from '../hooks/useToast';
import { getApiErrorMessage } from '../services/api';
import { listCenters, listPrograms } from '../services/centers.service';
import {
  createActivity,
  deleteActivity,
  listActivities,
  updateActivity,
  type ActivityRecord,
  type ActivityStatus,
  type ActivityType,
} from '../services/activities.service';
import type { CenterSummary, ProgramSummary } from '../types';
import { formatDate } from '../utils/date';

function getTodayDateInput(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

interface ActivityFormState {
  name: string;
  description: string;
  startDate: string;
  endDate: string;
  status: ActivityStatus;
  activityType: ActivityType;
  completionNotes: string;
  centerIds: string[];
  programId: string;
  volunteers: string;
}

const getStatusStyle = (status: ActivityStatus) => {
  switch (status) {
    case 'planned':
      return 'bg-blue-50 text-blue-700 border-blue-200';
    case 'ongoing':
      return 'bg-amber-50 text-amber-700 border-amber-200';
    case 'completed':
      return 'bg-green-50 text-green-700 border-green-200';
    case 'cancelled':
      return 'bg-red-50 text-red-700 border-red-200';
    default:
      return 'bg-neutral-50 text-neutral-700 border-neutral-200';
  }
};

export const Activities: React.FC = () => {
  const { can } = usePermission();
  const toast = useToast();
  const canManageActivities = can('manage', 'activities');
  const canDeleteActivities = can('manage', 'centers');

  const [activities, setActivities] = useState<ActivityRecord[]>([]);
  const [centers, setCenters] = useState<CenterSummary[]>([]);
  const [programs, setPrograms] = useState<ProgramSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [centerFilter, setCenterFilter] = useState<string>('');

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingActivity, setEditingActivity] = useState<ActivityRecord | null>(null);
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);

  const buildEmptyForm = useCallback(
    (defaultCenterIds: string[] = [], defaultProgramId = ''): ActivityFormState => ({
      name: '',
      description: '',
      startDate: getTodayDateInput(),
      endDate: getTodayDateInput(),
      status: 'planned',
      activityType: 'general',
      completionNotes: '',
      centerIds: defaultCenterIds,
      programId: defaultProgramId,
      volunteers: '',
    }),
    [],
  );

  const [formData, setFormData] = useState<ActivityFormState>(() => buildEmptyForm());

  const fetchActivitiesList = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await listActivities();
      setActivities(data);
    } catch (err) {
      setError(getApiErrorMessage(err, 'Failed to fetch activities.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [c, p] = await Promise.all([listCenters(), listPrograms()]);
        if (!alive) return;
        setCenters(c);
        const progs = Array.isArray(p) ? p : [];
        setPrograms(progs);
        setFormData((prev) => ({
          ...prev,
          centerIds: prev.centerIds.length ? prev.centerIds : c[0] ? [c[0].id] : [],
          programId: prev.programId || progs[0]?.id || '',
        }));
      } catch (err) {
        if (alive) {
          setError(getApiErrorMessage(err, 'Failed to load centers or programs.'));
        }
      }
    })();
    void fetchActivitiesList();
    return () => {
      alive = false;
    };
  }, [fetchActivitiesList]);

  const openCreateModal = () => {
    setEditingActivity(null);
    setFormData(
      buildEmptyForm(centers[0] ? [centers[0].id] : [], programs[0]?.id || ''),
    );
    setIsModalOpen(true);
  };

  const openEditModal = (activity: ActivityRecord) => {
    setEditingActivity(activity);
    setFormData({
      name: activity.name,
      description: activity.description ?? '',
      startDate: activity.startDate ? String(activity.startDate).slice(0, 10) : '',
      endDate: activity.endDate ? String(activity.endDate).slice(0, 10) : '',
      status: activity.status,
      activityType: activity.activityType ?? 'general',
      completionNotes: activity.completionNotes ?? '',
      centerIds: activity.centerId ? [activity.centerId] : [],
      programId: activity.programId ?? activity.program?.id ?? '',
      volunteers: Array.isArray(activity.volunteers) ? activity.volunteers.join(', ') : '',
    });
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setEditingActivity(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canManageActivities) return;

    if (formData.startDate && formData.endDate && formData.endDate < formData.startDate) {
      toast.error({
        title: 'Invalid dates',
        description: 'End date cannot be earlier than start date.',
      });
      return;
    }

    if (!editingActivity && formData.centerIds.length === 0) {
      toast.error({
        title: 'Select a center',
        description: 'Choose at least one center for this activity.',
      });
      return;
    }

    const parsedVolunteers = formData.volunteers
      .split(',')
      .map((v) => v.trim())
      .filter(Boolean);

    try {
      setSaving(true);
      if (editingActivity) {
        await updateActivity(editingActivity.id, {
          name: formData.name.trim(),
          description: formData.description.trim() || null,
          startDate: formData.startDate || null,
          endDate: formData.endDate || null,
          status: formData.status,
          activityType: formData.activityType,
          completionNotes: formData.completionNotes.trim() || null,
          programId: formData.programId || null,
          volunteers: parsedVolunteers,
        });
        toast.success({
          title: 'Activity updated',
          description: `"${formData.name.trim()}" was saved.`,
        });
      } else {
        await createActivity({
          name: formData.name.trim(),
          description: formData.description.trim() || undefined,
          startDate: formData.startDate || undefined,
          endDate: formData.endDate || undefined,
          status: formData.status,
          activityType: formData.activityType,
          centerIds: formData.centerIds,
          programId: formData.programId || undefined,
          volunteers: parsedVolunteers,
        });
        toast.success({
          title: 'Activity created',
          description: `"${formData.name.trim()}" scheduled.`,
        });
      }

      closeModal();
      await fetchActivitiesList();
    } catch (err) {
      toast.error({
        title: 'Save failed',
        description: getApiErrorMessage(err, 'Failed to save activity.'),
      });
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTargetId || !canDeleteActivities) return;
    const id = deleteTargetId;
    setDeleteTargetId(null);

    try {
      setLoading(true);
      await deleteActivity(id);
      toast.success({
        title: 'Activity deleted',
        description: 'The activity was removed.',
      });
      await fetchActivitiesList();
    } catch (err) {
      toast.error({
        title: 'Delete failed',
        description: getApiErrorMessage(err, 'Failed to delete activity.'),
      });
      setLoading(false);
    }
  };

  const filteredActivities = useMemo(() => {
    return activities.filter((a) => {
      if (statusFilter && a.status !== statusFilter) return false;
      if (centerFilter && a.centerId !== centerFilter) return false;
      if (searchTerm.trim()) {
        const q = searchTerm.trim().toLowerCase();
        const hay = `${a.name} ${a.description ?? ''} ${a.program?.name ?? ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [activities, statusFilter, centerFilter, searchTerm]);

  if (loading) {
    return (
      <PageWrapper title="Activities">
        <LoadingSpinner />
      </PageWrapper>
    );
  }

  return (
    <PageWrapper title="Activities & Events">
      {error && (
        <div className="mb-4">
          <ErrorMessage message={error} />
        </div>
      )}

      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-neutral-900 flex items-center gap-2">
            <Calendar className="text-primary" />
            Program Activities
          </h1>
          <p className="text-neutral-500">Plan and track developmental activities across centers</p>
        </div>
        {canManageActivities && (
          <Button variant="primary" className="flex items-center gap-2" onClick={openCreateModal}>
            <Plus size={18} />
            Plan New Activity
          </Button>
        )}
      </div>

      {/* KPI Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-6">
        <Card className="p-4 flex items-center gap-4">
          <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
            <Calendar size={20} />
          </div>
          <div>
            <p className="text-xs text-neutral-500 font-medium">Total Activities</p>
            <p className="text-xl font-bold text-neutral-900">{activities.length}</p>
          </div>
        </Card>
        <Card className="p-4 flex items-center gap-4">
          <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center">
            <Clock size={20} />
          </div>
          <div>
            <p className="text-xs text-neutral-500 font-medium">Ongoing</p>
            <p className="text-xl font-bold text-neutral-900">
              {activities.filter((a) => a.status === 'ongoing').length}
            </p>
          </div>
        </Card>
        <Card className="p-4 flex items-center gap-4">
          <div className="w-10 h-10 rounded-xl bg-green-50 text-green-600 flex items-center justify-center">
            <CheckCircle2 size={20} />
          </div>
          <div>
            <p className="text-xs text-neutral-500 font-medium">Completed</p>
            <p className="text-xl font-bold text-neutral-900">
              {activities.filter((a) => a.status === 'completed').length}
            </p>
          </div>
        </Card>
        <Card className="p-4 flex items-center gap-4">
          <div className="w-10 h-10 rounded-xl bg-neutral-50 text-neutral-600 flex items-center justify-center">
            <Circle size={20} />
          </div>
          <div>
            <p className="text-xs text-neutral-500 font-medium">Planned</p>
            <p className="text-xl font-bold text-neutral-900">
              {activities.filter((a) => a.status === 'planned').length}
            </p>
          </div>
        </Card>
      </div>

      {/* Filters */}
      <Card className="mb-6 p-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Input
            placeholder="Search activities by name or description..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
          <select
            aria-label="Filter by center"
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
            aria-label="Filter by status"
            className="rounded-lg border border-neutral-300 px-3 py-2 text-sm bg-white"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="">All statuses</option>
            <option value="planned">Planned</option>
            <option value="ongoing">Ongoing</option>
            <option value="completed">Completed</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </div>
      </Card>

      {/* Activity List */}
      <div className="space-y-4">
        {filteredActivities.length === 0 ? (
          <Card className="p-12 text-center flex flex-col items-center justify-center bg-neutral-50/30 border-dashed">
            <Calendar size={48} className="text-neutral-300 mb-4" />
            <h2 className="text-xl font-bold text-neutral-900 mb-2">No activities found</h2>
            <p className="text-neutral-500 max-w-sm">
              {activities.length === 0
                ? 'Scheduled workshops and events will appear here.'
                : 'No activities match your current filters.'}
            </p>
          </Card>
        ) : (
          filteredActivities.map((activity) => (
            <Card key={activity.id} className="p-6 hover:shadow-md transition-all group">
              <div className="flex flex-col md:flex-row gap-6">
                <div className="flex-1">
                  <div className="flex flex-wrap items-center gap-2 mb-2">
                    <span
                      className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border ${getStatusStyle(activity.status)}`}
                    >
                      {activity.status}
                    </span>
                    {activity.activityType && (
                      <span className="text-xs font-medium text-neutral-600 bg-neutral-100 px-2 py-0.5 rounded-full capitalize">
                        {activity.activityType}
                      </span>
                    )}
                    {activity.program?.name && (
                      <span className="text-xs font-medium text-primary bg-primary/5 px-2 py-0.5 rounded-full">
                        {activity.program.name}
                      </span>
                    )}
                  </div>
                  <h3 className="text-xl font-bold text-neutral-900 group-hover:text-primary transition-colors">
                    {activity.name}
                  </h3>
                  {activity.description && (
                    <p className="text-neutral-600 mt-2 line-clamp-2 text-sm">{activity.description}</p>
                  )}
                  {activity.completionNotes && (
                    <p className="text-xs text-neutral-500 mt-2 bg-neutral-50 border border-neutral-100 rounded-md px-2.5 py-1.5">
                      Notes: {activity.completionNotes}
                    </p>
                  )}

                  <div className="flex flex-wrap items-center gap-6 mt-4">
                    <div className="flex items-center gap-2 text-xs text-neutral-500">
                      <Clock size={14} className="text-neutral-400" />
                      {activity.startDate ? formatDate(activity.startDate, 'MMM d, yyyy') : 'TBD'} –{' '}
                      {activity.endDate ? formatDate(activity.endDate, 'MMM d, yyyy') : 'TBD'}
                    </div>
                    {activity.center?.name && (
                      <div className="flex items-center gap-2 text-xs text-neutral-500">
                        <MapPin size={14} className="text-neutral-400" />
                        {activity.center.name}
                      </div>
                    )}
                  </div>
                </div>

                {(canManageActivities || canDeleteActivities) && (
                  <div className="flex md:flex-col justify-center gap-2 min-w-[160px]">
                    {canManageActivities && (
                      <Button
                        variant="ghost"
                        className="text-xs w-full border border-neutral-100"
                        onClick={() => openEditModal(activity)}
                      >
                        Edit Details
                      </Button>
                    )}
                    {canDeleteActivities && (
                      <Button
                        variant="ghost"
                        className="text-xs text-danger border border-danger/20 hover:bg-danger/10 w-full"
                        onClick={() => setDeleteTargetId(activity.id)}
                      >
                        <Trash2 size={16} className="mr-2" /> Delete
                      </Button>
                    )}
                  </div>
                )}
              </div>
            </Card>
          ))
        )}
      </div>

      <Modal
        isOpen={isModalOpen}
        onClose={closeModal}
        title={editingActivity ? 'Edit Activity' : 'Plan New Activity'}
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-1">Activity Name</label>
            <Input
              required
              value={formData.name}
              onChange={(e) => setFormData((prev) => ({ ...prev, name: e.target.value }))}
              placeholder="E.g. Summer Camp, Drawing Competition"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-1">Description</label>
            <textarea
              className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm"
              rows={3}
              value={formData.description}
              onChange={(e) => setFormData((prev) => ({ ...prev, description: e.target.value }))}
              placeholder="Details about the activity..."
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-1">Activity Type</label>
              <select
                className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm bg-white"
                value={formData.activityType}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, activityType: e.target.value as ActivityType }))
                }
              >
                <option value="general">General</option>
                <option value="class">Class</option>
                <option value="game">Game</option>
                <option value="visit">Visit</option>
                <option value="camp">Camp</option>
                <option value="exam">Exam</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-1">Status</label>
              <select
                className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm bg-white"
                value={formData.status}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, status: e.target.value as ActivityStatus }))
                }
              >
                <option value="planned">Planned</option>
                <option value="ongoing">Ongoing</option>
                <option value="completed">Completed</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-1">Start Date</label>
              <Input
                type="date"
                value={formData.startDate}
                onChange={(e) => setFormData((prev) => ({ ...prev, startDate: e.target.value }))}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-1">End Date</label>
              <Input
                type="date"
                value={formData.endDate}
                onChange={(e) => setFormData((prev) => ({ ...prev, endDate: e.target.value }))}
              />
            </div>
          </div>

          {!editingActivity ? (
            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-1">Centers</label>
              <div className="flex flex-wrap gap-2 p-3 border border-neutral-300 rounded-lg bg-white">
                {centers.map((c) => (
                  <label
                    key={c.id}
                    className="flex items-center gap-2 px-3 py-1 bg-neutral-50 rounded-full border border-neutral-200 cursor-pointer hover:bg-neutral-100"
                  >
                    <input
                      type="checkbox"
                      checked={formData.centerIds.includes(c.id)}
                      onChange={(e) => {
                        setFormData((prev) => ({
                          ...prev,
                          centerIds: e.target.checked
                            ? prev.centerIds.includes(c.id)
                              ? prev.centerIds
                              : [...prev.centerIds, c.id]
                            : prev.centerIds.filter((id) => id !== c.id),
                        }));
                      }}
                    />
                    <span className="text-xs font-medium">{c.name}</span>
                  </label>
                ))}
              </div>
            </div>
          ) : (
            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-1">Center</label>
              <p className="text-sm font-medium text-neutral-800 px-3 py-2 bg-neutral-50 border border-neutral-200 rounded-lg">
                {editingActivity.center?.name ?? 'Assigned Center'}
              </p>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-1">Program</label>
            <select
              className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm bg-white"
              value={formData.programId}
              onChange={(e) => setFormData((prev) => ({ ...prev, programId: e.target.value }))}
            >
              <option value="">All Programs / General</option>
              {programs.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-1">
              Volunteers (Comma separated)
            </label>
            <Input
              value={formData.volunteers}
              onChange={(e) => setFormData((prev) => ({ ...prev, volunteers: e.target.value }))}
              placeholder="E.g. John Doe, Sarah Smith"
            />
          </div>

          {editingActivity && (
            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-1">
                Completion / Status Notes
              </label>
              <textarea
                className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm"
                rows={2}
                value={formData.completionNotes}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, completionNotes: e.target.value }))
                }
                placeholder="Outcome summary or cancellation reason..."
              />
            </div>
          )}

          <div className="flex justify-end gap-3 pt-4">
            <Button type="button" variant="ghost" onClick={closeModal} disabled={saving}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" disabled={saving}>
              {saving ? 'Saving...' : editingActivity ? 'Save Changes' : 'Create Activity'}
            </Button>
          </div>
        </form>
      </Modal>

      <ConfirmModal
        open={deleteTargetId !== null}
        title="Delete Activity"
        message="Are you sure you want to delete this activity? Linked sessions cannot be removed if attendance exists."
        confirmLabel="Delete"
        variant="danger"
        onConfirm={confirmDelete}
        onCancel={() => setDeleteTargetId(null)}
      />
    </PageWrapper>
  );
};
