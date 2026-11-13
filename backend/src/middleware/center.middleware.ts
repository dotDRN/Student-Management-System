import { Request, Response, NextFunction } from "express";
import { isGlobalAdmin } from "../config/rbac.js";
import prisma from "../lib/prisma.js";

function collectTargetCenterIds(req: Request): string[] | null {
  const candidates: string[] = [];
  const params = req.params as Record<string, unknown> | undefined;
  const body = req.body as Record<string, unknown> | undefined;
  const query = req.query as Record<string, unknown> | undefined;

  for (const raw of [params?.centerId, body?.centerId, query?.centerId]) {
    if (typeof raw === "string" && raw.trim()) {
      candidates.push(raw.trim());
    }
  }

  if (body && "centerIds" in body && body.centerIds !== undefined) {
    if (!Array.isArray(body.centerIds)) {
      return null;
    }
    for (const item of body.centerIds) {
      if (typeof item !== "string" || !item.trim()) {
        return null;
      }
      candidates.push(item.trim());
    }
  }

  return Array.from(new Set(candidates));
}

export const requireCenterAccess = () => {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.user) {
        return res
          .status(401)
          .json({ success: false, message: "Authentication is required" });
      }

      const targetCenterIds = collectTargetCenterIds(req);
      if (targetCenterIds === null) {
        return res.status(400).json({
          success: false,
          message: "centerIds must be an array of valid center IDs.",
        });
      }

      // If no specific centerId/centerIds targeted, allow through
      // (downstream services scope queries by tenantId and user.centerIds)
      if (targetCenterIds.length === 0) {
        return next();
      }

      // Tenant boundary check for every targeted center
      if (req.user.tenantId) {
        const ownedCenters = await prisma.center.findMany({
          where: {
            id: { in: targetCenterIds },
            tenantId: req.user.tenantId,
          },
          select: { id: true },
        });

        if (ownedCenters.length !== targetCenterIds.length) {
          return res.status(403).json({
            success: false,
            message: "Forbidden: You do not have access to this center.",
          });
        }
      }

      // Global admins (super_admin, tech_admin) can access all centers in their tenant.
      if (isGlobalAdmin(req.user.role)) {
        return next();
      }

      // Center-scoped roles (including center_admin, supervisor, teacher, staff, volunteer)
      // must have every targeted center in their assigned centerIds.
      const userCenters = Array.isArray(req.user.centerIds)
        ? req.user.centerIds
        : [];
      const hasAllTargets = targetCenterIds.every((id) => userCenters.includes(id));

      if (!hasAllTargets) {
        return res.status(403).json({
          success: false,
          message: "Forbidden: You do not have access to this center.",
        });
      }

      return next();
    } catch (error) {
      return next(error);
    }
  };
};
