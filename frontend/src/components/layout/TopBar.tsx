import React from 'react';
import { useAuthStore } from '../../store/useAuthStore';
import { Menu, UserCircle, LogOut, Building2 } from 'lucide-react';
import { NotificationBell } from '../NotificationBell';

interface TopBarProps {
  onMenuClick: () => void;
}

export const TopBar: React.FC<TopBarProps> = ({ onMenuClick }) => {
  const { currentUser, currentTenant, logout } = useAuthStore();

  const instanceName =
    currentTenant?.name || currentUser?.tenantName || 'SPARSHA System';
  const instanceSlug = currentTenant?.slug || currentUser?.tenantSlug;

  const handleLogout = async () => {
    await logout();
    window.location.href = '/login';
  };

  return (
    <header className="bg-white border-b border-neutral-200 h-16 flex items-center justify-between px-4 sticky top-0 z-20">
      <div className="flex items-center gap-3">
        <button
          onClick={onMenuClick}
          className="p-2 md:hidden hover:bg-neutral-100 rounded-lg text-neutral-600 transition-colors"
        >
          <Menu size={24} />
        </button>
        <div className="hidden md:flex items-center gap-2.5">
          <span className="font-semibold text-lg text-primary">{instanceName}</span>
          {instanceSlug && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-brand-50 text-brand-700 border border-brand-100">
              <Building2 size={12} />
              {instanceSlug}
            </span>
          )}
        </div>
      </div>

      <div className="flex items-center gap-3">
        <NotificationBell />
        <div className="flex flex-col items-end hidden sm:flex">
          <span className="text-sm font-medium text-neutral-900">
            {currentUser?.name || currentUser?.fullName || currentUser?.email || 'User'}
          </span>
          <span className="text-xs text-neutral-500 capitalize">
            {currentUser?.role?.replace('_', ' ') || 'Guest'}
          </span>
        </div>

        <div className="h-8 w-8 rounded-full bg-primary/10 text-primary flex items-center justify-center border border-primary/20">
          <UserCircle size={20} />
        </div>

        <button
          onClick={handleLogout}
          className="p-2 hover:bg-danger/10 text-neutral-400 hover:text-danger rounded-lg transition-colors ml-2"
          aria-label="Logout"
        >
          <LogOut size={20} />
        </button>
      </div>
    </header>
  );
};
