import { isGlobalAdmin } from "../config/rbac.js";

export function centerScopeWhere(role: string, allowedCenterIds: string[]) {
  if (isGlobalAdmin(role)) return {};
  return { centerId: { in: allowedCenterIds } };
}

export function buildCursorPagination(cursor?: string, take = 50) {
  return {
    take,
    skip: cursor ? 1 : 0,
    cursor: cursor ? { id: cursor } : undefined,
    orderBy: { createdAt: 'desc' as const },
  };
}
