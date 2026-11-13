export const ROLES = {
  SUPER_ADMIN: 'super_admin',
  TECH_ADMIN: 'tech_admin',
  CENTER_ADMIN: 'center_admin',
  SUPERVISOR: 'supervisor',
  TEACHER: 'teacher',
  STAFF: 'staff',
  VOLUNTEER: 'volunteer',
  PARENT: 'parent',
  SHAREHOLDER: 'shareholder',
} as const;

export type Role = typeof ROLES[keyof typeof ROLES];

export const PERMISSIONS = {
  VIEW_DASHBOARD: 'view_dashboard',
  MANAGE_STUDENTS: 'manage_students',
  MANAGE_ATTENDANCE: 'manage_attendance',
  MANAGE_EXAMS: 'manage_exams',
  ENTER_EXAM_SCORES: 'enter_exam_scores',
  MANAGE_SKILLS: 'manage_skills',
  MANAGE_CAREERS: 'manage_careers',
  MANAGE_ANNOUNCEMENTS: 'manage_announcements',
  MANAGE_USERS: 'manage_users',
  MANAGE_TRANSFERS: 'manage_transfers',
  MANAGE_FEES: 'manage_fees',
  MANAGE_FORMS: 'manage_forms',
  MANAGE_CENTERS: 'manage_centers',
  VIEW_REPORTS: 'view_reports',
  MANAGE_ACTIVITIES: 'manage_activities',
} as const;

export type Permission = typeof PERMISSIONS[keyof typeof PERMISSIONS];

export const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  [ROLES.SUPER_ADMIN]: Object.values(PERMISSIONS),
  [ROLES.TECH_ADMIN]: Object.values(PERMISSIONS),
  [ROLES.CENTER_ADMIN]: [
    PERMISSIONS.VIEW_DASHBOARD,
    PERMISSIONS.MANAGE_STUDENTS,
    PERMISSIONS.MANAGE_ATTENDANCE,
    PERMISSIONS.MANAGE_EXAMS,
    PERMISSIONS.ENTER_EXAM_SCORES,
    PERMISSIONS.MANAGE_SKILLS,
    PERMISSIONS.MANAGE_CAREERS,
    PERMISSIONS.MANAGE_ANNOUNCEMENTS,
    PERMISSIONS.MANAGE_USERS,
    PERMISSIONS.MANAGE_TRANSFERS,
    PERMISSIONS.MANAGE_FEES,
    PERMISSIONS.MANAGE_FORMS,
    PERMISSIONS.MANAGE_CENTERS,
    PERMISSIONS.VIEW_REPORTS,
    PERMISSIONS.MANAGE_ACTIVITIES,
  ],
  [ROLES.SUPERVISOR]: [
    PERMISSIONS.VIEW_DASHBOARD,
    PERMISSIONS.MANAGE_STUDENTS,
    PERMISSIONS.MANAGE_ATTENDANCE,
    PERMISSIONS.MANAGE_EXAMS,
    PERMISSIONS.ENTER_EXAM_SCORES,
    PERMISSIONS.MANAGE_SKILLS,
    PERMISSIONS.MANAGE_CAREERS,
    PERMISSIONS.VIEW_REPORTS,
    PERMISSIONS.MANAGE_ACTIVITIES,
  ],
  [ROLES.TEACHER]: [
    PERMISSIONS.VIEW_DASHBOARD,
    PERMISSIONS.MANAGE_STUDENTS,
    PERMISSIONS.MANAGE_ATTENDANCE,
    PERMISSIONS.ENTER_EXAM_SCORES,
    PERMISSIONS.MANAGE_SKILLS,
    PERMISSIONS.MANAGE_CAREERS,
    PERMISSIONS.MANAGE_TRANSFERS,
    PERMISSIONS.VIEW_REPORTS,
    PERMISSIONS.MANAGE_ACTIVITIES,
  ],
  [ROLES.STAFF]: [
    PERMISSIONS.VIEW_DASHBOARD,
    PERMISSIONS.MANAGE_STUDENTS,
    PERMISSIONS.MANAGE_ATTENDANCE,
    PERMISSIONS.VIEW_REPORTS,
  ],
  [ROLES.VOLUNTEER]: [
    PERMISSIONS.VIEW_DASHBOARD,
  ],
  [ROLES.PARENT]: [],
  [ROLES.SHAREHOLDER]: [],
};

export const ADMIN_ROLES: Role[] = [
  ROLES.SUPER_ADMIN,
  ROLES.TECH_ADMIN,
  ROLES.CENTER_ADMIN,
];

/**
 * Roles with organization-wide (all-centers within tenant) visibility.
 * `center_admin` holds admin permissions but remains scoped to assigned `centerIds`.
 */
export const GLOBAL_ADMIN_ROLES: Role[] = [
  ROLES.SUPER_ADMIN,
  ROLES.TECH_ADMIN,
];

export function isGlobalAdmin(role?: string | null): boolean {
  return Boolean(role && GLOBAL_ADMIN_ROLES.includes(role as Role));
}

export function isAdminRole(role?: string | null): boolean {
  return Boolean(role && ADMIN_ROLES.includes(role as Role));
}

export function getScopedCenterIds(
  user?: { role?: string; centerIds?: string[] } | null,
): string[] | undefined {
  if (isGlobalAdmin(user?.role)) {
    return undefined;
  }
  return Array.isArray(user?.centerIds) ? user.centerIds : [];
}

export function hasCenterAccess(
  user: { role?: string; centerIds?: string[] } | null | undefined,
  centerId: string,
): boolean {
  if (!centerId) return false;
  if (isGlobalAdmin(user?.role)) return true;
  return Array.isArray(user?.centerIds) && user.centerIds.includes(centerId);
}
