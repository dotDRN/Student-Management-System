export function centerScopeWhere(role: string, allowedCenterIds: string[]) {
  if (role === 'super_admin') return {};
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
