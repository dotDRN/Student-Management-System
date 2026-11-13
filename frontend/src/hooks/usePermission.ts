import { useAuthStore } from '../store/useAuthStore';
import { ADMIN_ROLES, hasAdminRole } from '../utils/rbac';

const STUDENT_OPS_ROLES = [...ADMIN_ROLES, 'supervisor', 'teacher', 'staff'];
const EDUCATIONAL_ROLES = [...ADMIN_ROLES, 'supervisor', 'teacher'];
const REPORT_VIEWER_ROLES = [...ADMIN_ROLES, 'supervisor', 'teacher', 'staff'];

const PERMISSIONS: Record<string, string[]> = {
  'view:dashboard': [...STUDENT_OPS_ROLES, 'volunteer'],
  'create:student': STUDENT_OPS_ROLES,
  'edit:student': STUDENT_OPS_ROLES,
  'deactivate:student': STUDENT_OPS_ROLES,
  'manage:students': STUDENT_OPS_ROLES,
  'mark:attendance': [...STUDENT_OPS_ROLES, 'volunteer'],
  'edit:attendance': STUDENT_OPS_ROLES,
  'manage:attendance': STUDENT_OPS_ROLES,
  'create:exam': [...ADMIN_ROLES, 'supervisor'],
  'manage:exams': [...ADMIN_ROLES, 'supervisor'],
  'enter:scores': EDUCATIONAL_ROLES,
  'create:form': ADMIN_ROLES,
  'manage:forms': ADMIN_ROLES,
  'create:activity': EDUCATIONAL_ROLES,
  'manage:activities': EDUCATIONAL_ROLES,
  'create:announcement': ADMIN_ROLES,
  'manage:announcements': ADMIN_ROLES,
  'define:skillCategory': ADMIN_ROLES,
  'log:skill': EDUCATIONAL_ROLES,
  'manage:skills': EDUCATIONAL_ROLES,
  'manage:careers': EDUCATIONAL_ROLES,
  'manage:fees': ADMIN_ROLES,
  'manage:transfers': [...ADMIN_ROLES, 'teacher'],
  'manage:users': ADMIN_ROLES,
  'manage:centers': ADMIN_ROLES,
  'view:reports': REPORT_VIEWER_ROLES,
};

export function usePermission() {
  const role = useAuthStore((s) => s.currentUser?.role);

  return {
    can: (action: string, resource: string) => {
      if (!role) return false;
      const allowedRoles = PERMISSIONS[`${action}:${resource}`];
      return allowedRoles?.includes(role) ?? false;
    },
    isAdminRole: hasAdminRole(role),
  };
}
