import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageWrapper } from '../components/layout/PageWrapper';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { LoadingSpinner } from '../components/ui/LoadingSpinner';
import { ErrorMessage } from '../components/ui/ErrorMessage';
import { Input } from '../components/ui/Input';
import { ConfirmModal } from '../components/ui/ConfirmModal';
import {
  Building2,
  Plus,
  MapPin,
  Users,
  GraduationCap,
  ArrowLeft,
  UserCircle,
  Pencil,
  Trash2,
  Link2,
  UserPlus,
  X,
} from 'lucide-react';
import {
  listCenters,
  getCenterDetails,
  createCenter,
  updateCenter,
  deleteCenter,
  listPrograms,
  assignProgramToCenter,
  removeProgramFromCenter,
  assignUserToCenter,
  removeUserFromCenter,
  type CenterDetail,
} from '../services/centers.service';
import { listUsers, type UserAdminItem } from '../services/users.service';
import { getApiErrorMessage } from '../services/api';
import { usePermission } from '../hooks/usePermission';
import { useToast } from '../hooks/useToast';
import { formatDate } from '../utils/date';
import type { CenterSummary, ProgramSummary } from '../types';

type ConfirmAction =
  | { type: 'deactivate_center'; centerId: string; centerName: string }
  | { type: 'unlink_program'; centerId: string; programId: string; programName: string }
  | { type: 'remove_staff'; centerId: string; userId: string; userName: string };

export const CentersPage: React.FC = () => {
  const navigate = useNavigate();
  const { can } = usePermission();
  const toast = useToast();
  const canManageCenters = can('manage', 'centers');

  const [centers, setCenters] = useState<CenterSummary[]>([]);
  const [allPrograms, setAllPrograms] = useState<ProgramSummary[]>([]);
  const [allUsers, setAllUsers] = useState<UserAdminItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Detail view
  const [selectedCenter, setSelectedCenter] = useState<CenterDetail | null>(null);
  const [loadingCenterId, setLoadingCenterId] = useState<string | null>(null);

  // Add center form
  const [showForm, setShowForm] = useState(false);
  const [formName, setFormName] = useState('');
  const [formLocation, setFormLocation] = useState('');
  const [formSaving, setFormSaving] = useState(false);

  // Edit center form
  const [showEditForm, setShowEditForm] = useState(false);
  const [editName, setEditName] = useState('');
  const [editLocation, setEditLocation] = useState('');
  const [editSaving, setEditSaving] = useState(false);

  // Link program state
  const [selectedProgramId, setSelectedProgramId] = useState('');
  const [programLinking, setProgramLinking] = useState(false);

  // Assign staff state
  const [selectedUserId, setSelectedUserId] = useState('');
  const [validFrom, setValidFrom] = useState('');
  const [validUntil, setValidUntil] = useState('');
  const [staffAssigning, setStaffAssigning] = useState(false);

  const [confirmAction, setConfirmAction] = useState<ConfirmAction | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [centerData, programData, userRes] = await Promise.all([
        listCenters(),
        listPrograms().catch(() => [] as ProgramSummary[]),
        canManageCenters
          ? listUsers({ limit: 200, isActive: true }).catch(() => ({ users: [] as UserAdminItem[] }))
          : Promise.resolve({ users: [] as UserAdminItem[] }),
      ]);
      setCenters(Array.isArray(centerData) ? centerData : []);
      setAllPrograms(Array.isArray(programData) ? programData : []);
      setAllUsers(Array.isArray(userRes.users) ? userRes.users.filter((u) => u.isActive) : []);
    } catch (err) {
      setError(getApiErrorMessage(err, 'Failed to load centers.'));
    } finally {
      setLoading(false);
    }
  }, [canManageCenters]);

  useEffect(() => {
    void load();
  }, [load]);

  const refreshCenterDetail = useCallback(async (centerId: string) => {
    const detail = await getCenterDetails(centerId);
    setSelectedCenter(detail);
    return detail;
  }, []);

  const handleSelectCenter = async (centerId: string) => {
    setLoadingCenterId(centerId);
    setError(null);
    setShowEditForm(false);
    setSelectedProgramId('');
    setSelectedUserId('');
    setValidFrom('');
    setValidUntil('');
    try {
      await refreshCenterDetail(centerId);
    } catch (err) {
      setError(getApiErrorMessage(err, 'Failed to load center details.'));
    } finally {
      setLoadingCenterId(null);
    }
  };

  const handleCreateCenter = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName.trim()) return;
    setFormSaving(true);
    setError(null);
    try {
      await createCenter({
        name: formName.trim(),
        location: formLocation.trim() || undefined,
      });
      setFormName('');
      setFormLocation('');
      setShowForm(false);
      toast.success({ title: 'Center created', description: 'The new center is ready for program and staff assignments.' });
      await load();
    } catch (err) {
      const msg = getApiErrorMessage(err, 'Failed to create center.');
      setError(msg);
      toast.error({ title: 'Create center failed', description: msg });
    } finally {
      setFormSaving(false);
    }
  };

  const openEditCenter = () => {
    if (!selectedCenter) return;
    setEditName(selectedCenter.name);
    setEditLocation(selectedCenter.location ?? '');
    setShowEditForm(true);
  };

  const handleUpdateCenter = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCenter || !editName.trim()) return;
    setEditSaving(true);
    try {
      await updateCenter(selectedCenter.id, {
        name: editName.trim(),
        location: editLocation.trim() || null,
      });
      setShowEditForm(false);
      toast.success({ title: 'Center updated' });
      await Promise.all([refreshCenterDetail(selectedCenter.id), load()]);
    } catch (err) {
      toast.error({
        title: 'Update failed',
        description: getApiErrorMessage(err, 'Failed to update center.'),
      });
    } finally {
      setEditSaving(false);
    }
  };

  const handleLinkProgram = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCenter || !selectedProgramId) return;
    setProgramLinking(true);
    try {
      await assignProgramToCenter(selectedCenter.id, selectedProgramId);
      setSelectedProgramId('');
      toast.success({ title: 'Program linked to center' });
      await Promise.all([refreshCenterDetail(selectedCenter.id), load()]);
    } catch (err) {
      toast.error({
        title: 'Link program failed',
        description: getApiErrorMessage(err, 'Failed to link program.'),
      });
    } finally {
      setProgramLinking(false);
    }
  };

  const handleAssignStaff = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCenter || !selectedUserId) return;
    if (validFrom && validUntil && validUntil < validFrom) {
      toast.error({ title: 'Invalid dates', description: 'Valid Until cannot be earlier than Valid From.' });
      return;
    }
    setStaffAssigning(true);
    try {
      await assignUserToCenter(selectedCenter.id, {
        userId: selectedUserId,
        validFrom: validFrom || undefined,
        validUntil: validUntil || null,
      });
      setSelectedUserId('');
      setValidFrom('');
      setValidUntil('');
      toast.success({ title: 'Staff member assigned' });
      await refreshCenterDetail(selectedCenter.id);
    } catch (err) {
      toast.error({
        title: 'Assign staff failed',
        description: getApiErrorMessage(err, 'Failed to assign staff member.'),
      });
    } finally {
      setStaffAssigning(false);
    }
  };

  const executeConfirmedAction = async () => {
    if (!confirmAction) return;
    const action = confirmAction;
    setConfirmAction(null);

    try {
      if (action.type === 'deactivate_center') {
        await deleteCenter(action.centerId);
        setSelectedCenter(null);
        toast.success({ title: 'Center deactivated', description: `${action.centerName} has been deactivated.` });
        await load();
      } else if (action.type === 'unlink_program') {
        await removeProgramFromCenter(action.centerId, action.programId);
        toast.success({ title: 'Program unlinked', description: `${action.programName} was removed from this center.` });
        await Promise.all([refreshCenterDetail(action.centerId), load()]);
      } else if (action.type === 'remove_staff') {
        await removeUserFromCenter(action.centerId, action.userId);
        toast.success({ title: 'Staff removed', description: `${action.userName}'s center assignment has ended.` });
        await refreshCenterDetail(action.centerId);
      }
    } catch (err) {
      toast.error({
        title: 'Action failed',
        description: getApiErrorMessage(err, 'Unable to complete action.'),
      });
    }
  };

  const staffList = useMemo(() => {
    if (!selectedCenter) return [];
    if (selectedCenter.staffAssignments && selectedCenter.staffAssignments.length > 0) {
      return selectedCenter.staffAssignments;
    }
    return selectedCenter.teachers.map((t) => ({
      id: t.id,
      userId: t.id,
      validFrom: '',
      validUntil: null,
      user: t,
    }));
  }, [selectedCenter]);

  const unlinkedPrograms = useMemo(() => {
    if (!selectedCenter) return [];
    const linkedIds = new Set(
      (selectedCenter.centerPrograms ?? []).map((cp) => cp.program.id),
    );
    return allPrograms.filter((p) => !linkedIds.has(p.id));
  }, [allPrograms, selectedCenter]);

  const unassignedUsers = useMemo(() => {
    const assignedIds = new Set(staffList.map((s) => s.userId));
    return allUsers.filter((u) => !assignedIds.has(u.id));
  }, [allUsers, staffList]);

  const confirmCopy = (() => {
    if (!confirmAction) return { title: '', message: '', confirmLabel: 'Confirm' };
    if (confirmAction.type === 'deactivate_center') {
      return {
        title: 'Deactivate Center',
        message: `Deactivate "${confirmAction.centerName}"? Centers with active students cannot be deactivated.`,
        confirmLabel: 'Deactivate Center',
      };
    }
    if (confirmAction.type === 'unlink_program') {
      return {
        title: 'Unlink Program',
        message: `Remove "${confirmAction.programName}" from this center? This is blocked if active students are enrolled in this program at this center.`,
        confirmLabel: 'Remove Program',
      };
    }
    return {
      title: 'Remove Staff Assignment',
      message: `End "${confirmAction.userName}"'s access to this center?`,
      confirmLabel: 'Remove Staff',
    };
  })();

  // Detail view
  if (selectedCenter) {
    return (
      <PageWrapper
        title={selectedCenter.name}
        actions={
          <div className="flex flex-wrap gap-2">
            {canManageCenters && (
              <>
                <Button variant="secondary" onClick={openEditCenter}>
                  <Pencil size={15} className="mr-1.5" /> Edit
                </Button>
                <Button
                  variant="danger"
                  onClick={() =>
                    setConfirmAction({
                      type: 'deactivate_center',
                      centerId: selectedCenter.id,
                      centerName: selectedCenter.name,
                    })
                  }
                >
                  <Trash2 size={15} className="mr-1.5" /> Deactivate
                </Button>
              </>
            )}
            <Button variant="secondary" onClick={() => setSelectedCenter(null)}>
              <ArrowLeft size={16} className="mr-2" /> Back to Centers
            </Button>
          </div>
        }
      >
        {error && <div className="mb-4"><ErrorMessage message={error} /></div>}

        {showEditForm && canManageCenters && (
          <Card className="mb-6 border-2 border-brand-200 bg-brand-50/30">
            <h3 className="text-md font-semibold text-neutral-900 mb-4">Edit Center Details</h3>
            <form onSubmit={(e) => void handleUpdateCenter(e)} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Input
                label="Center Name *"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                required
              />
              <Input
                label="Address / Location"
                value={editLocation}
                onChange={(e) => setEditLocation(e.target.value)}
                placeholder="City / Address"
              />
              <div className="sm:col-span-2 flex gap-2 justify-end">
                <Button variant="secondary" type="button" onClick={() => setShowEditForm(false)}>
                  Cancel
                </Button>
                <Button variant="primary" type="submit" isLoading={editSaving}>
                  Save Changes
                </Button>
              </div>
            </form>
          </Card>
        )}

        {/* Info cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
          <Card className="py-4 text-center">
            <MapPin size={20} className="mx-auto text-neutral-400 mb-1" />
            <p className="text-xs uppercase tracking-wide text-neutral-500 mb-1">Location</p>
            <p className="font-semibold text-neutral-900">{selectedCenter.location || '—'}</p>
          </Card>
          <Card className="py-4 text-center">
            <Users size={20} className="mx-auto text-blue-500 mb-1" />
            <p className="text-xs uppercase tracking-wide text-neutral-500 mb-1">Assigned Staff</p>
            <p className="text-2xl font-bold text-neutral-900">{staffList.length}</p>
          </Card>
          <Card className="py-4 text-center">
            <GraduationCap size={20} className="mx-auto text-emerald-500 mb-1" />
            <p className="text-xs uppercase tracking-wide text-neutral-500 mb-1">Students</p>
            <p className="text-2xl font-bold text-neutral-900">{selectedCenter.studentCount}</p>
          </Card>
        </div>

        {/* Programs */}
        <Card className="mb-6">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-3 border-b border-neutral-100 pb-2">
            <h3 className="text-md font-semibold text-neutral-900 flex items-center gap-2">
              <Link2 size={16} className="text-brand-600" /> Programs Offered
            </h3>
          </div>
          {selectedCenter.centerPrograms && selectedCenter.centerPrograms.length > 0 ? (
            <div className="flex flex-wrap gap-2 mb-4">
              {selectedCenter.centerPrograms.map((cp) => (
                <span
                  key={cp.program.id}
                  className="inline-flex items-center gap-1.5 px-3 py-1 bg-brand-50 text-brand-800 rounded-full text-sm font-medium border border-brand-100"
                >
                  {cp.program.name}
                  {canManageCenters && (
                    <button
                      type="button"
                      aria-label={`Unlink ${cp.program.name}`}
                      onClick={() =>
                        setConfirmAction({
                          type: 'unlink_program',
                          centerId: selectedCenter.id,
                          programId: cp.program.id,
                          programName: cp.program.name,
                        })
                      }
                      className="ml-0.5 rounded-full p-0.5 text-brand-600 hover:bg-brand-100 hover:text-brand-900"
                    >
                      <X size={13} />
                    </button>
                  )}
                </span>
              ))}
            </div>
          ) : (
            <p className="text-sm text-neutral-500 mb-4">No programs linked to this center yet.</p>
          )}

          {canManageCenters && (
            <form onSubmit={(e) => void handleLinkProgram(e)} className="flex flex-wrap items-end gap-3 pt-2 border-t border-neutral-100">
              <div className="flex-1 min-w-[220px]">
                <label className="block text-xs font-medium text-neutral-600 mb-1">Link Another Program</label>
                <select
                  value={selectedProgramId}
                  onChange={(e) => setSelectedProgramId(e.target.value)}
                  className="w-full rounded-xl border border-neutral-200 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-500"
                >
                  <option value="">Select program...</option>
                  {unlinkedPrograms.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({p.code})
                    </option>
                  ))}
                </select>
              </div>
              <Button
                type="submit"
                variant="primary"
                disabled={!selectedProgramId}
                isLoading={programLinking}
              >
                <Plus size={15} className="mr-1" /> Link Program
              </Button>
            </form>
          )}
        </Card>

        {/* Assigned Staff */}
        <Card className="mb-6">
          <h3 className="text-md font-semibold text-neutral-900 mb-3 border-b border-neutral-100 pb-2">
            <Users size={16} className="inline mr-2 text-blue-500" />Assigned Staff & Teachers
          </h3>
          {staffList.length === 0 ? (
            <p className="text-sm text-neutral-500 text-center py-4">No staff assigned to this center.</p>
          ) : (
            <div className="space-y-2 mb-4">
              {staffList.map((a) => (
                <div
                  key={a.userId}
                  className="flex flex-wrap items-center justify-between gap-3 p-2.5 bg-neutral-50 rounded-lg border border-neutral-100"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <UserCircle size={20} className="text-neutral-400 shrink-0" />
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-neutral-900 truncate">{a.user.fullName}</p>
                      <p className="text-xs text-neutral-500">
                        {a.user.email} · <span className="capitalize">{String(a.user.role).replace(/_/g, ' ')}</span>
                        {a.validUntil ? ` · Until ${formatDate(a.validUntil, 'MMM d, yyyy')}` : ''}
                      </p>
                    </div>
                  </div>
                  {canManageCenters && (
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() =>
                        setConfirmAction({
                          type: 'remove_staff',
                          centerId: selectedCenter.id,
                          userId: a.userId,
                          userName: a.user.fullName,
                        })
                      }
                    >
                      Remove
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}

          {canManageCenters && (
            <form
              onSubmit={(e) => void handleAssignStaff(e)}
              className="grid grid-cols-1 sm:grid-cols-4 gap-3 items-end pt-3 border-t border-neutral-100"
            >
              <div className="sm:col-span-2">
                <label className="block text-xs font-medium text-neutral-600 mb-1">Assign Staff Member</label>
                <select
                  value={selectedUserId}
                  onChange={(e) => setSelectedUserId(e.target.value)}
                  className="w-full rounded-xl border border-neutral-200 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-500"
                >
                  <option value="">Select active user...</option>
                  {unassignedUsers.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.fullName} ({String(u.role).replace(/_/g, ' ')})
                    </option>
                  ))}
                </select>
              </div>
              <Input
                label="Valid From"
                type="date"
                value={validFrom}
                onChange={(e) => setValidFrom(e.target.value)}
              />
              <div className="flex gap-2 items-end">
                <div className="flex-1">
                  <Input
                    label="Valid Until"
                    type="date"
                    value={validUntil}
                    onChange={(e) => setValidUntil(e.target.value)}
                  />
                </div>
                <Button
                  type="submit"
                  variant="primary"
                  disabled={!selectedUserId}
                  isLoading={staffAssigning}
                >
                  <UserPlus size={15} className="mr-1" /> Assign
                </Button>
              </div>
            </form>
          )}
        </Card>

        {/* Students list */}
        <Card className="mb-6">
          <h3 className="text-md font-semibold text-neutral-900 mb-3 border-b border-neutral-100 pb-2">
            <GraduationCap size={16} className="inline mr-2 text-emerald-500" />Enrolled Students
          </h3>
          {selectedCenter.students.length === 0 ? (
            <p className="text-sm text-neutral-500 text-center py-4">No students enrolled.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-neutral-200 text-left text-neutral-500">
                    <th className="py-2 pr-3 font-medium">Name</th>
                    <th className="py-2 pr-3 font-medium">Roll No</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedCenter.students.map((s) => (
                    <tr
                      key={s.id}
                      className="border-b border-neutral-100 hover:bg-neutral-50 cursor-pointer"
                      onClick={() => navigate(`/students/${s.id}`)}
                    >
                      <td className="py-2 pr-3 font-medium text-neutral-900">{s.fullName}</td>
                      <td className="py-2 pr-3 text-neutral-600">{s.rollNumber || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <ConfirmModal
          open={confirmAction !== null}
          title={confirmCopy.title}
          message={confirmCopy.message}
          confirmLabel={confirmCopy.confirmLabel}
          variant="danger"
          onConfirm={() => void executeConfirmedAction()}
          onCancel={() => setConfirmAction(null)}
        />
      </PageWrapper>
    );
  }

  // Grid view
  return (
    <PageWrapper
      title="Center Management"
      actions={
        canManageCenters ? (
          <Button variant="primary" onClick={() => setShowForm(true)}>
            <Plus size={16} className="mr-2" /> Add New Center
          </Button>
        ) : undefined
      }
    >
      {error && <div className="mb-4"><ErrorMessage message={error} /></div>}

      {/* Add form modal */}
      {showForm && (
        <Card className="mb-6 border-2 border-brand-200 bg-brand-50/30">
          <h3 className="text-md font-semibold text-neutral-900 mb-4">New Center</h3>
          <form onSubmit={(e) => void handleCreateCenter(e)} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input label="Center Name *" value={formName} onChange={(e) => setFormName(e.target.value)} required />
            <Input label="Address / Location" value={formLocation} onChange={(e) => setFormLocation(e.target.value)} />
            <div className="sm:col-span-2 flex gap-2 justify-end">
              <Button variant="secondary" type="button" onClick={() => setShowForm(false)}>Cancel</Button>
              <Button variant="primary" type="submit" isLoading={formSaving}>Create Center</Button>
            </div>
          </form>
        </Card>
      )}

      {loading ? (
        <LoadingSpinner />
      ) : centers.length === 0 ? (
        <Card className="py-12 text-center">
          <Building2 size={48} className="mx-auto text-neutral-300 mb-3" />
          <p className="text-neutral-500">No centers found. Add one to get started.</p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {centers.map((c) => (
            <Card
              key={c.id}
              className="cursor-pointer hover:shadow-lg hover:border-brand-300 transition-all duration-200 group"
              onClick={() => void handleSelectCenter(c.id)}
            >
              <div className="flex items-start gap-3">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-brand-100 to-brand-200 flex items-center justify-center shrink-0 group-hover:from-brand-200 group-hover:to-brand-300 transition-colors">
                  <Building2 size={24} className="text-brand-700" />
                </div>
                <div className="min-w-0">
                  <h3 className="font-semibold text-neutral-900 group-hover:text-brand-800 transition-colors">{c.name}</h3>
                  {c.location && (
                    <p className="text-xs text-neutral-500 flex items-center gap-1 mt-0.5">
                      <MapPin size={12} /> {c.location}
                    </p>
                  )}
                </div>
              </div>
              {loadingCenterId === c.id && (
                <div className="mt-3 text-xs text-neutral-400">Loading...</div>
              )}
            </Card>
          ))}
        </div>
      )}
    </PageWrapper>
  );
};
