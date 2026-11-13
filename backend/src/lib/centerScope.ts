import type { JwtPayload } from "../utils/jwt.js";
import { ForbiddenError } from "./errors.js";
import {
  getScopedCenterIds,
  hasCenterAccess,
  isAdminRole,
  isGlobalAdmin,
} from "../config/rbac.js";

export { isGlobalAdmin, isAdminRole, getScopedCenterIds, hasCenterAccess };

export const centerScope = (user: JwtPayload | undefined) => {
  const tenantFilter = user?.tenantId
    ? { center: { tenantId: user.tenantId } }
    : {};

  if (isGlobalAdmin(user?.role)) {
    return tenantFilter;
  }

  return {
    centerId: {
      in: user?.centerIds || [],
    },
    ...tenantFilter,
  };
};

/**
 * Throws ForbiddenError when a center-scoped user attempts to access a center
 * outside their assigned `centerIds`.
 */
export function assertCenterAccess(
  user: JwtPayload | undefined,
  centerId: string,
  message = "Forbidden: You do not have access to this center.",
): void {
  if (!hasCenterAccess(user, centerId)) {
    throw new ForbiddenError(message);
  }
}

/**
 * Builds a Prisma `centerId` filter value combining global-admin bypass,
 * assigned-center scoping, and an optional explicit `requestedCenterId`.
 */
export function resolveCenterFilter(
  user: JwtPayload | undefined,
  requestedCenterId?: string,
  options: { throwOnDenied?: boolean } = {},
): string | { in: string[] } | undefined {
  if (isGlobalAdmin(user?.role)) {
    return requestedCenterId || undefined;
  }

  const assigned = Array.isArray(user?.centerIds) ? user.centerIds : [];
  if (requestedCenterId) {
    if (!assigned.includes(requestedCenterId)) {
      if (options.throwOnDenied) {
        throw new ForbiddenError("No access to the requested center");
      }
      return { in: [] };
    }
    return requestedCenterId;
  }

  return { in: assigned };
}
