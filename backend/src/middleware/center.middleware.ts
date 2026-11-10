import { Response, NextFunction } from "express";
import { ADMIN_ROLES, Role } from "../config/rbac.js";
import prisma from "../lib/prisma.js";

export const requireCenterAccess = () => {
  return async (req: any, res: Response, next: NextFunction) => {
    try {
      // 1. Check if user exists (Safety Check)
      if (!req.user) {
        return res
          .status(401)
          .json({ success: false, message: "Authentication is required" });
      }

      const userRole = req.user.role as Role;
      const targetCenterId =
        req.params?.centerId || req.body?.centerId || req.query?.centerId;

      // 2. If no specific centerId is targeted in the request, allow through
      // (Downstream queries remain scoped by tenantId / user.centerIds)
      if (!targetCenterId || typeof targetCenterId !== "string") {
        return next();
      }

      // 3. Admin roles bypass individual center assignment check,
      // but MUST still own the center within their tenant boundary.
      if (ADMIN_ROLES.includes(userRole)) {
        if (req.user.tenantId) {
          const center = await prisma.center.findFirst({
            where: {
              id: targetCenterId,
              tenantId: req.user.tenantId,
            },
            select: { id: true },
          });

          if (!center) {
            return res.status(403).json({
              success: false,
              message: "Forbidden: You do not have access to this center.",
            });
          }
        }
        return next();
      }

      // 4. Non-admin roles must have targetCenterId in their assigned centerIds
      const userCenters =
        req.user.centerIds || (req.user.centerId ? [req.user.centerId] : []);

      if (!userCenters.includes(targetCenterId)) {
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
