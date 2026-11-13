import type { NextFunction, Request, Response } from "express";
import type { JwtPayload } from "../utils/jwt.js";
import { getScopedCenterIds } from "../config/rbac.js";

/**
 * Attaches `allowedCenterIds` for center-scoped users (`undefined` for global admins).
 * Use with Prisma `centerId: { in: req.allowedCenterIds }` when defined.
 */
export function attachAllowedCenters(req: Request, _res: Response, next: NextFunction): void {
  const user = (req as Request & { user?: JwtPayload }).user;
  if (!user) {
    next();
    return;
  }
  (req as Request & { allowedCenterIds?: string[] | undefined }).allowedCenterIds =
    getScopedCenterIds(user);
  next();
}
