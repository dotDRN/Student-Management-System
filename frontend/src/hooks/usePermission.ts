import { useAuthStore } from '../store/useAuthStore';

const PERMISSIONS: Record<string, string[]> = {
  'create:student': ['super_admin', 'center_admin', 'staff'],
  'edit:student': ['super_admin', 'center_admin', 'staff'],
  'deactivate:student': ['super_admin', 'center_admin'],
  'mark:attendance': ['teacher', 'volunteer'],
  'edit:attendance': ['super_admin', 'center_admin', 'teacher'],
  'create:exam': ['super_admin', 'center_admin', 'teacher'],
  'enter:scores': ['super_admin', 'center_admin', 'teacher'],
  'create:form': ['super_admin', 'center_admin', 'teacher'],
  'create:activity': ['super_admin', 'center_admin'],
  'create:announcement': ['super_admin', 'center_admin'],
  'define:skillCategory': ['super_admin'],
  'log:skill': ['super_admin', 'center_admin', 'teacher']
};

export function usePermission() {
  const role = useAuthStore((s) => s.currentUser?.role);
  
  return {
    can: (action: string, resource: string) => {
      if (!role) return false;
      const allowedRoles = PERMISSIONS[`${action}:${resource}`];
      return allowedRoles?.includes(role) ?? false;
    }
  };
}
