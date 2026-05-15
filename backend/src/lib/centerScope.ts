import type { TokenPayload } from '../utils/jwt.js';

export const centerScope = (user: TokenPayload | undefined) => {
  if (user?.role === "super_admin" || user?.role === "tech_admin") {
    return {};
  }

  return {
    centerId: {
      in: user?.centerIds || [],
    },
  };
};
