import type { JwtPayload } from '../utils/jwt.js';

export const centerScope = (user: JwtPayload | undefined) => {
  if (user?.role === "super_admin" || user?.role === "tech_admin") {
    return {};
  }

  return {
    centerId: {
      in: user?.centerIds || [],
    },
  };
};
