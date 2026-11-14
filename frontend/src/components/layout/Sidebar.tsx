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
  MessageSquare,
  Bell,
  CalendarRange,
  Megaphone,
  Layers,
  Video,
} from 'lucide-react';

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
}

interface NavItem {
  name: string;
  path: string;
  icon: React.ReactNode;
  viewRoles: string[];
}

interface NavGroup {
  label: string;
  items: NavItem[];
}

function formatWorkspaceName(rawName?: string | null): string {
  if (
    !rawName ||
    rawName === 'SPARSHA' ||
    rawName === 'SPARSHA Default Organization' ||
    rawName === 'SPARSHA Workspace' ||
    rawName === 'VantageEd Workspace'
  ) {
    return 'EduSpace Workspace';
  }
  return rawName;
}

export const Sidebar: React.FC<SidebarProps> = ({ isOpen, onClose }) => {
  const currentUser = useAuthStore((state) => state.currentUser);
  const currentTenant = useAuthStore((state) => state.currentTenant);

  const instanceName = formatWorkspaceName(currentTenant?.name || currentUser?.tenantName);
  const instanceSlug = currentTenant?.slug || currentUser?.tenantSlug || 'default';

  const navGroups: NavGroup[] = [
    {
      label: 'Overview',
      items: [
        { name: 'Dashboard', path: '/dashboard', icon: <LayoutDashboard size={18} />, viewRoles: ['super_admin', 'center_admin', 'tech_admin'] },
        { name: 'Reports & Analytics', path: '/reports', icon: <BarChart3 size={18} />, viewRoles: ['super_admin', 'center_admin', 'tech_admin'] },
      ],
    },
    {
      label: 'Academic & Learner Ops',
      items: [
        { name: 'Students', path: '/students', icon: <Users size={18} />, viewRoles: ['super_admin', 'center_admin', 'tech_admin', 'teacher', 'staff'] },
        { name: 'Attendance', path: '/attendance', icon: <ClipboardCheck size={18} />, viewRoles: ['super_admin', 'center_admin', 'tech_admin', 'teacher', 'staff'] },
        { name: 'Exams & Grading', path: '/exams', icon: <GraduationCap size={18} />, viewRoles: ['super_admin', 'center_admin', 'tech_admin', 'teacher'] },
        { name: 'Skill Matrix', path: '/skills', icon: <Star size={18} />, viewRoles: ['super_admin', 'center_admin', 'tech_admin', 'teacher'] },
        { name: 'Career Pathways', path: '/careers', icon: <Briefcase size={18} />, viewRoles: ['super_admin', 'center_admin', 'tech_admin', 'teacher'] },
        { name: 'Activities & Batches', path: '/activities', icon: <CalendarRange size={18} />, viewRoles: ['super_admin', 'center_admin', 'tech_admin', 'teacher', 'staff'] },
      ],
    },
    {
      label: 'Collaboration & Workflows',
      items: [
        { name: 'Meeting Rooms', path: '/meetings', icon: <Video size={18} />, viewRoles: ['super_admin', 'center_admin', 'tech_admin', 'supervisor', 'teacher', 'staff'] },
        { name: 'Dynamic Forms', path: '/forms', icon: <FileText size={18} />, viewRoles: ['super_admin', 'center_admin', 'tech_admin', 'teacher', 'staff'] },
        { name: 'Messages', path: '/chat', icon: <MessageSquare size={18} />, viewRoles: ['super_admin', 'center_admin', 'tech_admin', 'teacher', 'staff'] },
        { name: 'Announcements', path: '/announcements', icon: <Megaphone size={18} />, viewRoles: ['super_admin', 'center_admin', 'tech_admin', 'teacher', 'staff'] },
        { name: 'Notifications', path: '/notifications', icon: <Bell size={18} />, viewRoles: ['super_admin', 'center_admin', 'tech_admin', 'teacher', 'staff'] },
      ],
    },
    {
      label: 'Family Portal',
      items: [
        { name: 'My Child Progress', path: '/parent', icon: <GraduationCap size={18} />, viewRoles: ['parent'] },
      ],
    },
    {
      label: 'Workspace Admin',
      items: [
        { name: 'Centers', path: '/centers', icon: <Building2 size={18} />, viewRoles: ['super_admin', 'center_admin', 'tech_admin'] },
        { name: 'Programs', path: '/programs', icon: <BookOpen size={18} />, viewRoles: ['super_admin', 'center_admin', 'tech_admin'] },
        { name: 'Users & RBAC', path: '/users', icon: <UserCog size={18} />, viewRoles: ['super_admin', 'center_admin', 'tech_admin'] },
        { name: 'System Settings', path: '/settings', icon: <Settings size={18} />, viewRoles: ['super_admin', 'tech_admin'] },
      ],
    },
  ];

  const visibleGroups = navGroups
    .map((group) => ({
      ...group,
      items: group.items.filter(
        (item) => currentUser?.role && item.viewRoles.includes(currentUser.role),
      ),
    }))
    .filter((group) => group.items.length > 0);

  return (
    <>
      {isOpen && (
        <div
          className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs z-30 md:hidden transition-opacity"
          onClick={onClose}
        />
      )}

      <aside
        className={cn(
          'fixed inset-y-0 left-0 bg-slate-950 text-slate-300 border-r border-slate-800/80 w-[256px] z-40 transform transition-transform duration-300 ease-in-out md:translate-x-0 md:static md:flex-shrink-0 flex flex-col select-none',
          isOpen ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        {/* Platform Brand Header */}
        <div className="h-16 flex items-center justify-between px-4 border-b border-slate-800/80">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-brand-500 to-violet-600 flex items-center justify-center text-white shadow-sm shadow-brand-500/25 shrink-0">
              <Layers size={18} />
            </div>
            <div className="flex items-center gap-2 min-w-0">
              <span
                className="font-bold text-base text-white tracking-tight truncate"
                style={{ fontFamily: 'var(--font-heading)' }}
              >
                EduSpace
              </span>
              <span className="px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider rounded bg-brand-500/15 text-brand-300 border border-brand-500/25">
                Workspace
              </span>
            </div>
          </div>
          <button
            onClick={onClose}
            className="md:hidden p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Active Tenant / Workspace Pill */}
        <div className="px-3 pt-3 pb-1">
          <div className="bg-slate-900/90 border border-slate-800/90 rounded-xl px-3 py-2.5 flex items-center gap-2.5">
            <div className="h-7 w-7 rounded-lg bg-brand-500/15 border border-brand-500/25 text-brand-400 flex items-center justify-center shrink-0">
              <Building2 size={14} />
            </div>
            <div className="min-w-0 flex-1">
              <div
                className="text-xs font-semibold text-slate-100 truncate"
                title={instanceName}
              >
                {instanceName}
              </div>
              <div
                className="text-[11px] text-slate-400 truncate"
                style={{ fontFamily: 'var(--font-mono)' }}
              >
                /{instanceSlug}
              </div>
            </div>
          </div>
        </div>

        {/* Categorized Navigation */}
        <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-5">
          {visibleGroups.map((group) => (
            <div key={group.label}>
              <div className="px-2.5 mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                {group.label}
              </div>
              <div className="space-y-0.5">
                {group.items.map((item) => (
                  <NavLink
                    key={item.name}
                    to={item.path}
                    onClick={onClose}
                    className={({ isActive }) =>
                      cn(
                        'group flex items-center gap-3 px-2.5 py-2 rounded-lg text-[13px] font-medium transition-all border',
                        isActive
                          ? 'bg-brand-600/15 text-white border-brand-500/30 shadow-2xs'
                          : 'text-slate-400 border-transparent hover:bg-slate-900 hover:text-slate-100',
                      )
                    }
                  >
                    {({ isActive }) => (
                      <>
                        <span
                          className={cn(
                            'transition-colors shrink-0',
                            isActive
                              ? 'text-brand-400'
                              : 'text-slate-400 group-hover:text-slate-200',
                          )}
                        >
                          {item.icon}
                        </span>
                        <span className="truncate">{item.name}</span>
                      </>
                    )}
                  </NavLink>
                ))}
              </div>
            </div>
          ))}
        </nav>
      </aside>
    </>
  );
};
