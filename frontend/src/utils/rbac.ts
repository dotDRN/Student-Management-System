import type { UserRole } from '../types';

export const ADMIN_ROLES: UserRole[] = ['super_admin', 'tech_admin', 'center_admin'];

export const hasAdminRole = (role?: UserRole | string): boolean => {
  return !!role && ADMIN_ROLES.includes(role as UserRole);
};

export const getHomeRouteForRole = (role?: UserRole | string | null): string => {
  if (role === 'parent') return '/parent';
  return hasAdminRole(role || undefined) ? '/dashboard' : '/students';
};
