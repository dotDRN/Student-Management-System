import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/useAuthStore';
import { getApiErrorMessage } from '../services/api';
import { getHomeRouteForRole } from '../utils/rbac';
import {
  login,
  registerInstance,
  checkSlugAvailability,
  type WorkspaceOption,
} from '../services/auth.service';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Card } from '../components/ui/Card';
import { ErrorMessage } from '../components/ui/ErrorMessage';
import { LoadingSpinner } from '../components/ui/LoadingSpinner';
import {
  Building2,
  CheckCircle2,
  XCircle,
  ArrowRight,
  LogIn,
  Sparkles,
  Layers,
} from 'lucide-react';

function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

export const Login: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'login' | 'create'>('login');

  // Sign In state
  const [workspaceSlug, setWorkspaceSlug] = useState(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      return params.get('slug') || params.get('org') || '';
    }
    return '';
  });
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [workspaceOptions, setWorkspaceOptions] = useState<WorkspaceOption[]>([]);

  // Create Instance state
  const [organizationName, setOrganizationName] = useState('');
  const [instanceSlug, setInstanceSlug] = useState('');
  const [slugManuallyEdited, setSlugManuallyEdited] = useState(false);
  const [slugChecking, setSlugChecking] = useState(false);
  const [slugAvailable, setSlugAvailable] = useState<boolean | null>(null);
  const [defaultCenterName, setDefaultCenterName] = useState('');
  const [defaultCenterLocation, setDefaultCenterLocation] = useState('');
  const [adminName, setAdminName] = useState('');
  const [adminEmail, setAdminEmail] = useState('');
  const [adminPhone, setAdminPhone] = useState('');
  const [adminPassword, setAdminPassword] = useState('');

  // Shared UI state
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const setAuth = useAuthStore((s) => s.setAuth);
  const accessToken = useAuthStore((s) => s.accessToken);
  const currentUser = useAuthStore((s) => s.currentUser);
  const navigate = useNavigate();

  useEffect(() => {
    if (accessToken && currentUser) {
      navigate(getHomeRouteForRole(currentUser.role), { replace: true });
    }
  }, [accessToken, currentUser, navigate]);

  // Auto-generate slug when organization name changes (unless manually edited)
  useEffect(() => {
    if (!slugManuallyEdited) {
      setInstanceSlug(slugify(organizationName));
    }
  }, [organizationName, slugManuallyEdited]);

  // Debounced live slug availability check
  useEffect(() => {
    if (activeTab !== 'create') return;
    const normalized = slugify(instanceSlug);
    if (!normalized || normalized.length < 2) {
      setSlugAvailable(null);
      return;
    }

    let cancelled = false;
    setSlugChecking(true);
    const timer = setTimeout(async () => {
      try {
        const res = await checkSlugAvailability(normalized);
        if (!cancelled) {
          setSlugAvailable(res.available);
        }
      } catch {
        if (!cancelled) {
          setSlugAvailable(null);
        }
      } finally {
        if (!cancelled) {
          setSlugChecking(false);
        }
      }
    }, 350);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [instanceSlug, activeTab]);

  const executeLogin = async (selectedTenantId?: string) => {
    setIsLoading(true);
    setError('');

    const trimmedSlug = workspaceSlug.trim().toLowerCase();
    if (!selectedTenantId && !trimmedSlug) {
      setError('Workspace slug is required. Enter "default" for the main instance or your instance slug.');
      setIsLoading(false);
      return;
    }

    try {
      const res = await login(email.trim(), password.trim(), {
        slug: trimmedSlug || undefined,
        tenantId: selectedTenantId,
      });

      if (res.requiresWorkspaceSelection && res.workspaces?.length) {
        setWorkspaceOptions(res.workspaces);
        return;
      }

      const token = res.accessToken || res.token;
      const user = res.user;
      if (!token || !user) throw new Error('No access token received');

      setAuth(
        {
          id: user.id,
          tenantId: user.tenantId,
          tenantSlug: user.tenantSlug,
          tenantName: user.tenantName,
          email: user.email,
          name: user.fullName,
          fullName: user.fullName,
          role: user.role,
          centerIds: user.centerIds ?? [],
        },
        token,
        res.organization || null,
      );

      navigate(getHomeRouteForRole(user.role));
    } catch (err) {
      setError(getApiErrorMessage(err, 'Login failed. Check your credentials.'));
    } finally {
      setIsLoading(false);
    }
  };

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await executeLogin();
  };

  const handleCreateInstanceSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');

    try {
      const normalizedSlug = slugify(instanceSlug || organizationName);
      if (normalizedSlug.length < 2) {
        setError('Please enter a valid organization name and workspace slug.');
        setIsLoading(false);
        return;
      }

      const res = await registerInstance({
        organizationName: organizationName.trim(),
        slug: normalizedSlug,
        adminName: adminName.trim(),
        email: adminEmail.trim(),
        password: adminPassword,
        phone: adminPhone.trim() || undefined,
        defaultCenterName: defaultCenterName.trim() || undefined,
        defaultCenterLocation: defaultCenterLocation.trim() || undefined,
      });

      setAuth(
        {
          id: res.user.id,
          tenantId: res.user.tenantId,
          tenantSlug: res.user.tenantSlug,
          tenantName: res.user.tenantName,
          email: res.user.email,
          name: res.user.fullName,
          fullName: res.user.fullName,
          role: res.user.role,
          centerIds: res.user.centerIds ?? [],
        },
        res.accessToken,
        res.organization,
      );

      navigate('/dashboard');
    } catch (err) {
      setError(
        getApiErrorMessage(err, 'Failed to create instance. Please check your details and try again.'),
      );
    } finally {
      setIsLoading(false);
    }
  };

  if (accessToken) {
    return <LoadingSpinner label="Redirecting…" />;
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-slate-950 relative overflow-hidden">
      {/* Subtle Executive Indigo & Violet Ambient Glow */}
      <div className="pointer-events-none absolute -top-40 left-1/2 -translate-x-1/2 h-[420px] w-[720px] rounded-full bg-gradient-to-tr from-brand-600/25 via-violet-600/15 to-transparent blur-3xl" />

      <Card className="max-w-lg w-full shadow-2xl border border-slate-800/10 relative z-10 p-6 sm:p-8">
        {/* Brand Header */}
        <div className="flex flex-col items-center mb-6">
          <div className="h-13 w-13 bg-gradient-to-br from-brand-500 to-violet-600 rounded-2xl flex items-center justify-center mb-3.5 text-white shadow-md shadow-brand-500/25">
            <Layers size={26} />
          </div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-extrabold text-neutral-900 tracking-tight">
              EduSpace
            </h1>
            <span className="px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider rounded-full bg-brand-50 text-brand-700 border border-brand-200/80">
              Workspace
            </span>
          </div>
          <p className="text-sm text-neutral-500 mt-1 text-center">
            Multi-Tenant Academic Operations & Student Workspace Platform
          </p>
        </div>

        {/* Mode Switcher Tabs */}
        <div className="grid grid-cols-2 gap-1 p-1 bg-neutral-100 rounded-xl mb-6">
          <button
            type="button"
            onClick={() => {
              setActiveTab('login');
              setError('');
              setWorkspaceOptions([]);
            }}
            className={`flex items-center justify-center gap-2 py-2.5 px-3 rounded-lg text-sm font-semibold transition-all ${
              activeTab === 'login'
                ? 'bg-white text-brand-700 shadow-sm'
                : 'text-neutral-600 hover:text-neutral-900'
            }`}
          >
            <LogIn size={16} />
            Sign In
          </button>
          <button
            type="button"
            onClick={() => {
              setActiveTab('create');
              setError('');
              setWorkspaceOptions([]);
            }}
            className={`flex items-center justify-center gap-2 py-2.5 px-3 rounded-lg text-sm font-semibold transition-all ${
              activeTab === 'create'
                ? 'bg-white text-brand-700 shadow-sm'
                : 'text-neutral-600 hover:text-neutral-900'
            }`}
          >
            <Sparkles size={16} />
            Create New Instance
          </button>
        </div>

        {error && (
          <div className="mb-5">
            <ErrorMessage message={error} />
          </div>
        )}

        {/* TAB 1: SIGN IN */}
        {activeTab === 'login' && (
          <>
            {workspaceOptions.length > 0 ? (
              <div className="space-y-3">
                <div className="text-sm font-medium text-neutral-700 mb-2">
                  Your account belongs to multiple instances. Select a workspace to continue:
                </div>
                {workspaceOptions.map((ws) => (
                  <button
                    key={ws.tenantId}
                    type="button"
                    onClick={() => executeLogin(ws.tenantId)}
                    className="w-full flex items-center justify-between p-3.5 rounded-xl border border-neutral-200 hover:border-brand-500 hover:bg-brand-50/40 transition-all text-left"
                  >
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-lg bg-brand-50 text-brand-600 flex items-center justify-center">
                        <Building2 size={20} />
                      </div>
                      <div>
                        <div className="font-semibold text-neutral-900">{ws.name}</div>
                        <div className="text-xs text-neutral-500">
                          Slug: <span className="font-mono">{ws.slug}</span> • Role:{' '}
                          <span className="capitalize">{ws.role.replace('_', ' ')}</span>
                        </div>
                      </div>
                    </div>
                    <ArrowRight size={18} className="text-neutral-400" />
                  </button>
                ))}
                <Button
                  type="button"
                  variant="secondary"
                  className="w-full mt-2"
                  onClick={() => setWorkspaceOptions([])}
                >
                  Back to Login
                </Button>
              </div>
            ) : (
              <form onSubmit={handleLoginSubmit} className="space-y-4">
                <Input
                  label="Workspace / Instance Slug"
                  type="text"
                  value={workspaceSlug}
                  onChange={(e) => setWorkspaceSlug(e.target.value)}
                  placeholder="e.g. default or your-instance-slug"
                  helperText="Enter 'default' for the main instance, or your custom instance slug"
                  autoComplete="organization"
                  required
                />
                <Input
                  label="Email Address"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="e.g. super_admin@sparsha.org"
                  autoComplete="email"
                  required
                />
                <Input
                  label="Password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  autoComplete="current-password"
                  required
                />

                <Button
                  type="submit"
                  variant="primary"
                  className="w-full mt-2"
                  isLoading={isLoading}
                >
                  Sign In to Workspace
                </Button>

                <div className="pt-3 border-t border-neutral-100 text-center">
                  <span className="text-xs text-neutral-500">
                    Want to set up your own centers and students?{' '}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setActiveTab('create');
                      setError('');
                    }}
                    className="text-xs font-semibold text-brand-600 hover:text-brand-700 underline cursor-pointer"
                  >
                    Create a new instance
                  </button>
                </div>
              </form>
            )}
          </>
        )}

        {/* TAB 2: CREATE NEW INSTANCE */}
        {activeTab === 'create' && (
          <form onSubmit={handleCreateInstanceSubmit} className="space-y-4">
            <div className="p-3 bg-brand-50/60 border border-brand-100 rounded-xl text-xs text-brand-800">
              Launch an isolated workspace for your organization. You will be provisioned as the{' '}
              <span className="font-semibold">Instance Super Admin</span> with full control over
              centers, programs, staff, and students.
            </div>

            <Input
              label="Organization / Instance Name"
              type="text"
              value={organizationName}
              onChange={(e) => setOrganizationName(e.target.value)}
              placeholder="e.g. Sunrise Learning Foundation"
              required
            />

            <div>
              <Input
                label="Workspace URL Slug"
                type="text"
                value={instanceSlug}
                onChange={(e) => {
                  setSlugManuallyEdited(true);
                  setInstanceSlug(slugify(e.target.value));
                }}
                placeholder="e.g. sunrise-learning"
                required
              />
              {instanceSlug.length >= 2 && (
                <div className="mt-1.5 flex items-center gap-1.5 text-xs">
                  {slugChecking ? (
                    <span className="text-neutral-500">Checking availability…</span>
                  ) : slugAvailable === true ? (
                    <span className="text-emerald-600 flex items-center gap-1 font-medium">
                      <CheckCircle2 size={14} /> Workspace slug "{instanceSlug}" is available
                    </span>
                  ) : slugAvailable === false ? (
                    <span className="text-red-600 flex items-center gap-1 font-medium">
                      <XCircle size={14} /> Workspace slug "{instanceSlug}" is already taken
                    </span>
                  ) : null}
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Input
                label="First Center Name (Optional)"
                type="text"
                value={defaultCenterName}
                onChange={(e) => setDefaultCenterName(e.target.value)}
                placeholder="e.g. Main Campus"
              />
              <Input
                label="Center Location (Optional)"
                type="text"
                value={defaultCenterLocation}
                onChange={(e) => setDefaultCenterLocation(e.target.value)}
                placeholder="e.g. Bengaluru"
              />
            </div>

            <div className="border-t border-neutral-100 pt-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-neutral-400 mb-3">
                Administrator Account
              </p>
              <div className="space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <Input
                    label="Your Full Name"
                    type="text"
                    value={adminName}
                    onChange={(e) => setAdminName(e.target.value)}
                    placeholder="e.g. Priya Sharma"
                    required
                  />
                  <Input
                    label="Phone Number (Optional)"
                    type="tel"
                    value={adminPhone}
                    onChange={(e) => setAdminPhone(e.target.value)}
                    placeholder="e.g. 9876543210"
                  />
                </div>
                <Input
                  label="Admin Email Address"
                  type="email"
                  value={adminEmail}
                  onChange={(e) => setAdminEmail(e.target.value)}
                  placeholder="admin@yourorganization.org"
                  autoComplete="email"
                  required
                />
                <Input
                  label="Admin Password (min 8 characters)"
                  type="password"
                  value={adminPassword}
                  onChange={(e) => setAdminPassword(e.target.value)}
                  placeholder="••••••••"
                  autoComplete="new-password"
                  required
                />
              </div>
            </div>

            <Button
              type="submit"
              variant="primary"
              className="w-full mt-2"
              isLoading={isLoading}
              disabled={slugAvailable === false}
            >
              Create Instance & Launch Workspace
            </Button>
          </form>
        )}
      </Card>
    </div>
  );
};
