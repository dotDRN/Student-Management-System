import React from 'react';
import { NavLink } from 'react-router-dom';
import { useAuthStore } from '../../store/useAuthStore';
import { cn } from '../ui/Button';
import {
  LayoutDashboard,
  Users,
  ClipboardCheck,
  Star,
  Briefcase,
  GraduationCap,
  BarChart3,
  Settings,
  X,
  FileText,
  UserCog,
  Building2,
  BookOpen,
} from 'lucide-react';

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ isOpen, onClose }) => {
  const currentUser = useAuthStore((state) => state.currentUser);

  // Define Nav Items with detailed role-based access
  const navItems: Array<{
    name: string;
    path: string;
    icon: React.ReactNode;
    viewRoles: string[];
  }> = [
    { name: 'Dashboard', path: '/dashboard', icon: <LayoutDashboard size={20} />, viewRoles: ['super_admin','center_admin','tech_admin'] },
    { name: 'Students', path: '/students', icon: <Users size={20} />, viewRoles: ['super_admin','center_admin','tech_admin','teacher','staff'] },
    { name: 'Attendance', path: '/attendance', icon: <ClipboardCheck size={20} />, viewRoles: ['super_admin','center_admin','tech_admin','teacher','staff'] },
    { name: 'Exams', path: '/exams', icon: <GraduationCap size={20} />, viewRoles: ['super_admin','center_admin','tech_admin','teacher'] },
    { name: 'Skills', path: '/skills', icon: <Star size={20} />, viewRoles: ['super_admin','center_admin','tech_admin','teacher'] },
    { name: 'Careers', path: '/careers', icon: <Briefcase size={20} />, viewRoles: ['super_admin','center_admin','tech_admin','teacher'] },
    { name: 'Forms', path: '/forms', icon: <FileText size={20} />, viewRoles: ['super_admin','center_admin','tech_admin','teacher','staff'] },
    { name: 'Activities', path: '/activities', icon: <Briefcase size={20} />, viewRoles: ['super_admin','center_admin','tech_admin','teacher','staff'] },
    { name: 'Announcements', path: '/announcements', icon: <LayoutDashboard size={20} />, viewRoles: ['super_admin','center_admin','tech_admin','teacher','staff'] },
    { name: 'Centers', path: '/centers', icon: <Building2 size={20} />, viewRoles: ['super_admin','center_admin','tech_admin'] },
    { name: 'Programs', path: '/programs', icon: <BookOpen size={20} />, viewRoles: ['super_admin','center_admin','tech_admin'] },
    { name: 'Reports', path: '/reports', icon: <BarChart3 size={20} />, viewRoles: ['super_admin','center_admin','tech_admin'] },
    { name: 'Users', path: '/users', icon: <UserCog size={20} />, viewRoles: ['super_admin','center_admin','tech_admin'] },
    { name: 'Settings', path: '/settings', icon: <Settings size={20} />, viewRoles: ['super_admin','tech_admin'] },
  ];

  const visibleItems = navItems.filter(item => currentUser?.role && item.viewRoles.includes(currentUser.role));

  return (
    <>
      {isOpen && (
        <div
          className="fixed inset-0 bg-neutral-900/50 z-30 md:hidden transition-opacity"
          onClick={onClose}
        />
      )}

      <aside
        className={cn(
          'fixed inset-y-0 left-0 bg-white border-r border-neutral-200 w-[240px] z-40 transform transition-transform duration-300 ease-in-out md:translate-x-0 md:static md:flex-shrink-0 flex flex-col',
          isOpen ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        <div className="h-16 flex items-center justify-between px-6 border-b border-neutral-100">
          <span className="font-bold text-xl text-brand-600 tracking-tight" style={{ fontFamily: 'var(--font-heading)' }}>
            SPARSHA
          </span>
          <button onClick={onClose} className="md:hidden p-1 text-neutral-400 hover:text-neutral-600 rounded-lg">
            <X size={20} />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto py-6 px-3 space-y-1">
          {visibleItems.map((item) => (
            <NavLink
              key={item.name}
              to={item.path}
              onClick={onClose}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all',
                  isActive
                    ? 'bg-brand-50 text-brand-800 border border-brand-100'
                    : 'text-neutral-600 hover:bg-neutral-50 hover:text-neutral-900',
                )
              }
            >
              <span className="transition-colors shrink-0">{item.icon}</span>
              <span className="truncate">{item.name}</span>
            </NavLink>
          ))}
        </nav>
      </aside>
    </>
  );
};