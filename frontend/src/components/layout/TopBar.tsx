import React from 'react';
import { useAuthStore } from '../../store/useAuthStore';
import { Menu, LogOut, Building2, ShieldCheck } from 'lucide-react';
import { NotificationBell } from '../NotificationBell';

interface TopBarProps {
  onMenuClick: () => void;
}

function formatWorkspaceName(rawName?: string | null): string {
  if (
    !rawName ||
    rawName === 'SPARSHA' ||
    rawName === 'SPARSHA Default Organization' ||
    rawName === 'SPARSHA Workspace' ||
    rawName === 'VantageEd Workspace'
  ) {
    return 'EdBase Workspace';
  }
  return rawName;
}

export const TopBar: React.FC<TopBarProps> = ({ onMenuClick }) => {
  const { currentUser, currentTenant, logout } = useAuthStore();

  const instanceName = formatWorkspaceName(
    currentTenant?.name || currentUser?.tenantName,
  );
  const instanceSlug = currentTenant?.slug || currentUser?.tenantSlug;

  const displayName =
    currentUser?.name || currentUser?.fullName || currentUser?.email || 'User';
  const initials = displayName
    .split(' ')
    .map((part) => part[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();

  const handleLogout = async () => {
    await logout();
    window.location.href = '/login';
  };

  return (
    <header className="bg-white/90 backdrop-blur-md border-b border-neutral-200/80 h-16 flex items-center justify-between px-4 md:px-6 sticky top-0 z-20">
      <div className="flex items-center gap-3">
        <button
          onClick={onMenuClick}
          className="p-2 md:hidden hover:bg-neutral-100 rounded-lg text-neutral-600 transition-colors"
        >
          <Menu size={22} />
        </button>
        <div className="hidden md:flex items-center gap-2.5">
          <span className="font-semibold text-sm text-neutral-900">
            {instanceName}
          </span>
          {instanceSlug && (
            <span
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium bg-brand-50 text-brand-700 border border-brand-200/60"
              style={{ fontFamily: 'var(--font-mono)' }}
            >
              <Building2 size={11} />
              /{instanceSlug}
            </span>
          )}
        </div>
      </div>

      <div className="flex items-center gap-3">
        <NotificationBell />

        <div className="h-5 w-px bg-neutral-200 hidden sm:block" />

        <div className="flex items-center gap-2.5">
          <div className="hidden sm:flex flex-col items-end">
            <span className="text-sm font-semibold text-neutral-900 leading-tight">
              {displayName}
            </span>
            <span className="inline-flex items-center gap-1 text-[11px] font-medium text-neutral-500 capitalize">
              <ShieldCheck size={11} className="text-brand-600" />
              {currentUser?.role?.replace('_', ' ') || 'Guest'}
            </span>
          </div>

          <div className="h-8 w-8 rounded-lg bg-gradient-to-tr from-brand-600 to-violet-600 text-white text-xs font-bold flex items-center justify-center shadow-2xs">
            {initials || 'U'}
          </div>
        </div>

        <button
          onClick={handleLogout}
          className="p-2 hover:bg-red-50 text-neutral-400 hover:text-red-600 rounded-lg transition-colors ml-1"
          aria-label="Logout"
          title="Sign out"
        >
          <LogOut size={18} />
        </button>
      </div>
    </header>
  );
};
