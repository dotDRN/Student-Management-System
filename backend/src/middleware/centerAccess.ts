import type { NextFunction, Request, Response } from "express";
import type { JwtPayload } from '../lib/auth.js';

/**
 * Attaches `allowedCenterIds` for non-admin users (from JWT — refreshed at login with active assignments).
 * Admins get `undefined` (no filter). Use with Prisma `centerId: { in: req.allowedCenterIds }` when not admin.
 */
export function attachAllowedCenters(req: Request, _res: Response, next: NextFunction): void {
  const user = (req as Request & { user?: JwtPayload }).user;
  if (!user) {
    next();
    return;
  }
  (req as Request & { allowedCenterIds?: string[] | undefined }).allowedCenterIds =
    (user.role === "super_admin" || user.role === "center_admin") ? undefined : user.centerIds;
  next();
}
