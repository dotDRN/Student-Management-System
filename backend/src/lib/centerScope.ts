import type { JwtPayload } from "../utils/jwt.js";

export const centerScope = (user: JwtPayload | undefined) => {
  const tenantFilter = user?.tenantId
    ? { center: { tenantId: user.tenantId } }
    : {};

  if (user?.role === "super_admin" || user?.role === "tech_admin") {
    return tenantFilter;
  }

  return {
    centerId: {
      in: user?.centerIds || [],
    },
    ...tenantFilter,
  };
};
