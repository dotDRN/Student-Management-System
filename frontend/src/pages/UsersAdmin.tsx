import React, { useCallback, useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { PageWrapper } from '../components/layout/PageWrapper';
import { Card } from '../components/ui/Card';
import { Input } from '../components/ui/Input';
import { Button } from '../components/ui/Button';
import { ErrorMessage } from '../components/ui/ErrorMessage';
import { LoadingSpinner } from '../components/ui/LoadingSpinner';
import { DataTable, type DataTableColumn } from '../components/ui/DataTable';
import { useAuthStore } from '../store/useAuthStore';
import {
  createUser,
  deactivateUser,
  listUsers,
  resetUserPassword,
  updateUserCenters,
  type UserAdminItem,
} from '../services/users.service';
import { listCenters } from '../services/centers.service';
import type { UserRole } from '../types';
import { Building2, X, Check } from 'lucide-react';

// Extend UserAdminItem to include centerAssignments from the API
type UserWithCenters = UserAdminItem & {
  centerAssignments?: Array<{
    id: string;
    centerId: string;
    center: { id: string; name: string };
  }>;
};

export const UsersAdmin: React.FC = () => {
  const currentUser = useAuthStore((s) => s.currentUser);
  
  const isAdmin = ['super_admin', 'center_admin', 'tech_admin'].includes(currentUser?.role || '');
  const canAccess = isAdmin;

  const roleOptions: UserRole[] = currentUser?.role === 'super_admin' 
    ? ['super_admin', 'center_admin', 'tech_admin', 'teacher', 'staff', 'volunteer'] 
    : currentUser?.role === 'tech_admin'
    ? ['teacher', 'staff', 'volunteer']
    : ['teacher', 'staff', 'volunteer'];

  const [rows, setRows] = useState<UserWithCenters[]>([]);
  const [centers, setCenters] = useState<{id: string, name: string}[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  // Create user form
  const [email, setEmail] = useState('');
  const [fullName, setFullName] = useState('');
  const [password, setPassword] = useState('');
  const [phone, setPhone] = useState('');
  const [role, setRole] = useState<UserRole>('teacher');
  const [selectedCenterIds, setSelectedCenterIds] = useState<string[]>([]);
  const [creating, setCreating] = useState(false);

  // Edit centers modal
  const [editCentersUserId, setEditCentersUserId] = useState<string | null>(null);
  const [editCentersUserName, setEditCentersUserName] = useState('');
  const [editCenterIds, setEditCenterIds] = useState<string[]>([]);
  const [savingCenters, setSavingCenters] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [userData, centerData] = await Promise.all([
        listUsers({ limit: 100, search: search.trim() || undefined }),
        listCenters()
      ]);
      setRows(userData.users as UserWithCenters[]);
      setCenters(centerData);
    } catch {
      setError('Failed to load data.');
    } finally {
      setLoading(false);
    }
  }, [search]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const toggleCenter = (id: string) => {
    setSelectedCenterIds(prev => 
      prev.includes(id) ? prev.filter(c => c !== id) : [...prev, id]
    );
  };

  const toggleEditCenter = (id: string) => {
    setEditCenterIds(prev =>
      prev.includes(id) ? prev.filter(c => c !== id) : [...prev, id]
    );
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedCenterIds.length === 0) {
        setError('Please assign at least one center to the user.');
        return;
    }

    setCreating(true);
    setError(null);
    try {
      await createUser({
        email: email.trim(),
        fullName: fullName.trim(),
        password,
        role,
        phone: phone.trim() || undefined,
        centerIds: selectedCenterIds,
      });
      setEmail('');
      setFullName('');
      setPassword('');
      setPhone('');
      setRole('teacher');
      setSelectedCenterIds([]);
      await loadData();
    } catch {
      setError('Failed to create user. Check email uniqueness and password length.');
    } finally {
      setCreating(false);
    }
  };

  const handleDeactivate = async (userId: string) => {
    if (!window.confirm('Deactivate this user?')) return;
    try {
      await deactivateUser(userId);
      await loadData();
    } catch {
      setError('Failed to deactivate user.');
    }
  };

  const handleResetPassword = async (userId: string) => {
    const newPassword = window.prompt('Enter a new password (minimum 8 characters):');
    if (!newPassword) return;
    try {
      await resetUserPassword(userId, newPassword);
      window.alert('Password reset successful.');
    } catch {
      setError('Password reset failed.');
    }
  };

  const openEditCenters = (user: UserWithCenters) => {
    setEditCentersUserId(user.id);
    setEditCentersUserName(user.fullName);
    const currentCenterIds = user.centerAssignments?.map(a => a.center?.id || a.centerId) || [];
    setEditCenterIds(currentCenterIds);
  };

  const handleSaveCenters = async () => {
    if (!editCentersUserId) return;
    setSavingCenters(true);
    setError(null);
    try {
      await updateUserCenters(editCentersUserId, editCenterIds);
      setEditCentersUserId(null);
      await loadData();
    } catch {
      setError('Failed to update center assignments.');
    } finally {
      setSavingCenters(false);
    }
  };

  if (!canAccess) {
    return <Navigate to="/dashboard" replace />;
  }

  const columns: DataTableColumn<UserWithCenters>[] = [
    {
      id: 'fullName',
      header: 'User',
      sortable: true,
      cell: (u) => (
        <div>
          <div className="font-medium text-neutral-900">{u.fullName}</div>
          <div className="text-xs text-neutral-500">{u.email}</div>
        </div>
      ),
    },
    { id: 'role', header: 'Role', sortable: true, accessor: (u) => u.role.toUpperCase().replace('_', ' ') },
    { id: 'phone', header: 'Phone', accessor: (u) => u.phone || '-' },
    {
      id: 'centers',
      header: 'Centers',
      cell: (u) => {
        const assignedCenters = u.centerAssignments?.map(a => a.center?.name).filter(Boolean) || [];
        return (
          <div className="flex items-center gap-1 flex-wrap">
            {assignedCenters.length > 0 ? (
              assignedCenters.slice(0, 2).map((name, i) => (
                <span key={i} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-brand-50 text-brand-700 border border-brand-100">
                  <Building2 size={10} />
                  {name}
                </span>
              ))
            ) : (
              <span className="text-xs text-neutral-400 italic">None</span>
            )}
            {assignedCenters.length > 2 && (
              <span className="text-[11px] text-neutral-500 font-medium">+{assignedCenters.length - 2}</span>
            )}
          </div>
        );
      },
    },
    { id: 'isActive', header: 'Status', accessor: (u) => (u.isActive ? 'Active' : 'Inactive') },
    {
      id: 'actions',
      header: '',
      className: 'text-right',
      cell: (u) => (
        <div className="flex justify-end gap-2">
          <Button 
            variant="secondary" 
            size="sm" 
            onClick={() => openEditCenters(u)}
            title="Edit center assignments"
          >
            <Building2 size={14} className="mr-1" />
            Centers
          </Button>
          <Button variant="secondary" size="sm" onClick={() => void handleResetPassword(u.id)}>
            Reset Password
          </Button>
          <Button
            variant="danger"
            size="sm"
            disabled={!u.isActive || currentUser?.id === u.id}
            onClick={() => void handleDeactivate(u.id)}
          >
            Deactivate
          </Button>
        </div>
      ),
    },
  ];

  return (
    <PageWrapper title="User Administration">
      {error && (
        <div className="mb-4">
          <ErrorMessage message={error} />
        </div>
      )}

      {/* Edit Centers Modal */}
      {editCentersUserId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-neutral-900/60 backdrop-blur-sm" onClick={() => setEditCentersUserId(null)} />
          <div className="relative bg-white rounded-2xl shadow-2xl border border-neutral-200 w-full max-w-lg p-0 overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-100 bg-neutral-50">
              <div>
                <h3 className="text-base font-semibold text-neutral-900">Edit Center Assignments</h3>
                <p className="text-sm text-neutral-500 mt-0.5">{editCentersUserName}</p>
              </div>
              <button
                onClick={() => setEditCentersUserId(null)}
                className="p-1.5 rounded-lg hover:bg-neutral-200 text-neutral-500 transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            <div className="px-6 py-4 max-h-[50vh] overflow-y-auto">
              <p className="text-xs text-neutral-500 mb-3">
                Select the centers this user should have access to:
              </p>
              <div className="space-y-1.5">
                {centers.map((c) => (
                  <label
                    key={c.id}
                    className={`flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer transition-all border ${
                      editCenterIds.includes(c.id)
                        ? 'bg-brand-50 border-brand-200 text-brand-800'
                        : 'bg-white border-neutral-100 text-neutral-700 hover:bg-neutral-50'
                    }`}
                  >
                    <input
                      type="checkbox"
                      className="rounded border-neutral-300 text-brand-600 focus:ring-brand-500"
                      checked={editCenterIds.includes(c.id)}
                      onChange={() => toggleEditCenter(c.id)}
                    />
                    <Building2 size={14} className={editCenterIds.includes(c.id) ? 'text-brand-600' : 'text-neutral-400'} />
                    <span className="text-sm font-medium">{c.name}</span>
                    {editCenterIds.includes(c.id) && (
                      <Check size={14} className="ml-auto text-brand-600" />
                    )}
                  </label>
                ))}
              </div>
            </div>

            <div className="flex justify-end gap-2 px-6 py-3 border-t border-neutral-100 bg-neutral-50">
              <Button variant="secondary" size="sm" onClick={() => setEditCentersUserId(null)}>
                Cancel
              </Button>
              <Button
                variant="primary"
                size="sm"
                isLoading={savingCenters}
                onClick={() => void handleSaveCenters()}
              >
                <Check size={14} className="mr-1" />
                Save Assignments
              </Button>
            </div>
          </div>
        </div>
      )}

      <Card className="mb-6">
        <h3 className="text-base font-semibold text-neutral-900 mb-4">Create User</h3>
        <form className="grid grid-cols-1 md:grid-cols-2 gap-3" onSubmit={handleCreate}>
          <Input label="Full Name" value={fullName} onChange={(e) => setFullName(e.target.value)} required />
          <Input label="User ID / Email" type="text" value={email} onChange={(e) => setEmail(e.target.value)} required />
          <Input
            label="Password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            helperText="Minimum 8 characters"
            required
          />
          <Input label="Phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
          
          <div className="w-full flex flex-col gap-1.5">
            <label className="text-xs uppercase tracking-wide text-neutral-600 font-medium">Role</label>
            <select
              className="h-11 rounded-lg border border-neutral-300 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              value={role}
              onChange={(e) => setRole(e.target.value as UserRole)}
            >
              {roleOptions.map((r) => (
                <option key={r} value={r}>
                  {r.toUpperCase().replace('_', ' ')}
                </option>
              ))}
            </select>
          </div>

          <div className="md:col-span-2 mt-2">
            <label className="text-xs uppercase tracking-wide text-neutral-600 font-medium mb-2 block">
              Assigned Centers
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 border border-neutral-200 p-3 rounded-lg max-h-40 overflow-y-auto">
              {centers.map((c) => (
                <label key={c.id} className="flex items-center gap-2 text-sm cursor-pointer hover:bg-neutral-50 p-1 rounded transition-colors">
                  <input
                    type="checkbox"
                    className="rounded border-neutral-300 text-brand-600 focus:ring-brand-500"
                    checked={selectedCenterIds.includes(c.id)}
                    onChange={() => toggleCenter(c.id)}
                  />
                  <span className="truncate">{c.name}</span>
                </label>
              ))}
            </div>
            <p className="text-[10px] text-neutral-500 mt-1 italic">Assign at least one center to the user.</p>
          </div>

          <div className="md:col-span-2">
            <Button type="submit" isLoading={creating} className="w-full md:w-auto">
              Create User
            </Button>
          </div>
        </form>
      </Card>

      <Card>
        <div className="flex gap-2 mb-4">
          <Input
            placeholder="Search by name/email"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void loadData();
            }}
          />
          <Button variant="secondary" onClick={() => void loadData()}>
            Search
          </Button>
        </div>
        {loading ? (
          <LoadingSpinner />
        ) : (
          <DataTable<UserWithCenters>
            columns={columns}
            data={rows}
            rowKey={(u) => u.id}
            filterKeys={['fullName', 'email', 'role']}
            filterPlaceholder="Filter loaded users..."
          />
        )}
      </Card>
    </PageWrapper>
  );
};