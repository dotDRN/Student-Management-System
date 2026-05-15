import React, { useEffect, useState } from 'react';
import { PageWrapper } from '../components/layout/PageWrapper';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { LoadingSpinner } from '../components/ui/LoadingSpinner';
import { ErrorMessage } from '../components/ui/ErrorMessage';
import { Shield, RefreshCw, User, Mail, Clock } from 'lucide-react';
import { useAuthStore } from '../store/useAuthStore';
import { Navigate } from 'react-router-dom';
import { getMe } from '../services/auth.service';

export const Settings: React.FC = () => {
  const currentUser = useAuthStore((s) => s.currentUser);
  const setAuth = useAuthStore((s) => s.setAuth);
  const accessToken = useAuthStore((s) => s.accessToken);
  const isAdmin = ['super_admin', 'center_admin', 'tech_admin'].includes(currentUser?.role || '');

  const [profile, setProfile] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = async () => {
    if (!accessToken) return;
    setLoading(true);
    setError(null);
    try {
      const u = await getMe();
      setProfile(u as unknown as Record<string, unknown>);
      setAuth(
        {
          id: u.id,
          email: u.email,
          name: u.fullName,
          role: u.role,
          centerIds: u.centerIds ?? [],
        },
        accessToken,
      );
    } catch {
      setError('Could not refresh profile.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!isAdmin) {
    return <Navigate to="/dashboard" replace />;
  }

  return (
    <PageWrapper
      title="System Settings"
      actions={
        <Button variant="secondary" size="sm" onClick={() => void refresh()} isLoading={loading}>
          <RefreshCw size={16} className="mr-2" /> Refresh profile
        </Button>
      }
    >
      {error && (
        <div className="mb-4">
          <ErrorMessage message={error} />
        </div>
      )}

      <div className="max-w-3xl grid grid-cols-1 gap-6">
        <Card>
          <h3 className="font-semibold text-neutral-900 mb-4 flex items-center gap-2">
            <Shield size={18} className="text-primary" />
            Admin Profile Overview
          </h3>
          {loading && !profile ? (
            <LoadingSpinner label="Loading profile…" />
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="flex items-center gap-3 p-4 bg-white shadow-sm border border-neutral-100 rounded-xl hover:shadow-md transition-shadow">
                <div className="h-10 w-10 flex items-center justify-center rounded-full bg-primary/10 text-primary">
                  <User size={20} />
                </div>
                <div>
                  <p className="text-xs font-medium text-neutral-500">Full Name</p>
                  <p className="font-semibold text-neutral-900">{(profile as any)?.fullName || currentUser?.name || 'Administrator'}</p>
                </div>
              </div>
              
              <div className="flex items-center gap-3 p-4 bg-white shadow-sm border border-neutral-100 rounded-xl hover:shadow-md transition-shadow">
                <div className="h-10 w-10 flex items-center justify-center rounded-full bg-primary/10 text-primary">
                  <Mail size={20} />
                </div>
                <div>
                  <p className="text-xs font-medium text-neutral-500">Email Address</p>
                  <p className="font-semibold text-neutral-900">{(profile as any)?.email || currentUser?.email || 'N/A'}</p>
                </div>
              </div>

              <div className="flex items-center gap-3 p-4 bg-white shadow-sm border border-neutral-100 rounded-xl hover:shadow-md transition-shadow">
                <div className="h-10 w-10 flex items-center justify-center rounded-full bg-primary/10 text-primary">
                  <Shield size={20} />
                </div>
                <div>
                  <p className="text-xs font-medium text-neutral-500">System Role</p>
                  <p className="font-semibold text-neutral-900 capitalize">{(profile as any)?.role || currentUser?.role || 'Admin'}</p>
                </div>
              </div>

              <div className="flex items-center gap-3 p-4 bg-white shadow-sm border border-neutral-100 rounded-xl hover:shadow-md transition-shadow">
                <div className="h-10 w-10 flex items-center justify-center rounded-full bg-primary/10 text-primary">
                  <Clock size={20} />
                </div>
                <div>
                  <p className="text-xs font-medium text-neutral-500">Joined Date</p>
                  <p className="font-semibold text-neutral-900">
                    {(profile as any)?.createdAt ? new Date((profile as any).createdAt).toLocaleDateString() : 'Active'}
                  </p>
                </div>
              </div>
            </div>
          )}
          <p className="text-xs text-neutral-500 mt-6">
            Institution-wide settings are not yet backed by an API; this panel confirms your session against{' '}
            <code className="text-neutral-700 bg-neutral-100 px-1 py-0.5 rounded">GET /api/auth/me</code>.
          </p>
        </Card>
      </div>
    </PageWrapper>
  );
};
