import React, { useEffect, useState } from 'react';
import { PageWrapper } from '../components/layout/PageWrapper';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { LoadingSpinner } from '../components/ui/LoadingSpinner';
import { ErrorMessage } from '../components/ui/ErrorMessage';
import { Shield, RefreshCw, User, Mail, Clock, Bell } from 'lucide-react';
import { useAuthStore } from '../store/useAuthStore';
import { Navigate } from 'react-router-dom';
import { getMe } from '../services/auth.service';
import { notificationPermission } from '../notifications/NotificationPermission';
import { useNotificationStore } from '../store/useNotificationStore';

const BrowserNotificationSettings: React.FC = () => {
  const browserNotificationsEnabled = useNotificationStore(state => state.browserNotificationsEnabled);
  const setBrowserNotificationsEnabled = useNotificationStore(state => state.setBrowserNotificationsEnabled);
  
  const [permission, setPermission] = useState<NotificationPermission>('default');
  const [isSupported, setIsSupported] = useState(false);

  useEffect(() => {
    setIsSupported(notificationPermission.isSupported());
    if (notificationPermission.isSupported()) {
      setPermission(notificationPermission.getPermission());
    }

    const handleFocus = () => {
      if (notificationPermission.isSupported()) {
        setPermission(notificationPermission.getPermission());
      }
    };
    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, []);

  if (!isSupported) {
    return (
      <Card>
        <h3 className="font-semibold text-neutral-900 mb-4 flex items-center gap-2">
          <Bell size={18} className="text-primary" />
          Notifications
        </h3>
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border border-neutral-100 p-4 rounded-xl shadow-sm">
          <div>
            <h4 className="font-medium text-neutral-900">Browser Notifications</h4>
            <p className="text-sm text-neutral-500 mt-1 mb-2">Receive notifications when you're away from the application.</p>
            <div className="flex items-center gap-2">
              <span className="text-sm text-neutral-500">Status:</span>
              <span className="text-sm font-medium text-neutral-500 bg-neutral-100 px-2 py-0.5 rounded">Unsupported</span>
            </div>
          </div>
          <div className="text-xs text-neutral-500 bg-neutral-100 px-3 py-2 rounded-lg max-w-[200px]">
            Your browser does not support notifications.
          </div>
        </div>
      </Card>
    );
  }

  const requestPermission = async () => {
    const newPermission = await notificationPermission.requestPermission();
    setPermission(newPermission);
    if (newPermission === 'granted') {
      setBrowserNotificationsEnabled(true);
    }
  };

  return (
    <Card>
      <h3 className="font-semibold text-neutral-900 mb-4 flex items-center gap-2">
        <Bell size={18} className="text-primary" />
        Notifications
      </h3>
      
      <div className="flex flex-col gap-3 p-4 bg-white shadow-sm border border-neutral-100 rounded-xl hover:shadow-md transition-shadow">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <h4 className="font-medium text-neutral-900">Browser Notifications</h4>
            <p className="text-sm text-neutral-500 mt-1 mb-2">Receive notifications when you're away from the application.</p>
            <div className="flex items-center gap-2">
              <span className="text-sm text-neutral-500">Status:</span>
              {permission === 'granted' && browserNotificationsEnabled && (
                <span className="text-sm font-medium text-green-700 bg-green-50 border border-green-200 px-2 py-0.5 rounded-md">Enabled</span>
              )}
              {(permission === 'default' || (permission === 'granted' && !browserNotificationsEnabled)) && (
                <span className="text-sm font-medium text-neutral-700 bg-neutral-50 border border-neutral-200 px-2 py-0.5 rounded-md">Disabled</span>
              )}
              {permission === 'denied' && (
                <span className="text-sm font-medium text-red-700 bg-red-50 border border-red-200 px-2 py-0.5 rounded-md">Blocked</span>
              )}
            </div>
          </div>
          
          <div>
            {permission === 'default' && (
              <Button variant="primary" size="sm" onClick={() => void requestPermission()}>
                Enable
              </Button>
            )}
            {permission === 'granted' && (
              <Button 
                variant={browserNotificationsEnabled ? 'secondary' : 'primary'} 
                size="sm" 
                onClick={() => setBrowserNotificationsEnabled(!browserNotificationsEnabled)}
              >
                {browserNotificationsEnabled ? 'Turn OFF' : 'Turn ON'}
              </Button>
            )}
            {permission === 'denied' && (
              <div className="text-xs text-red-500 bg-red-50 px-3 py-2 rounded-lg max-w-[200px] border border-red-100">
                Blocked by browser. You must change this site's browser notification permission to enable.
              </div>
            )}
          </div>
        </div>
      </div>
    </Card>
  );
};

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
        <BrowserNotificationSettings />
        
        <Card>
          <h3 className="font-semibold text-neutral-900 mb-4 flex items-center gap-2">
            <Shield size={18} className="text-primary" />
            Admin Profile Overview
          </h3>
          {loading && !profile ? (
            <LoadingSpinner label="Loading profile?" />
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
