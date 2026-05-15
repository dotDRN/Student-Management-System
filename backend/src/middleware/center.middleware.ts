import { Request, Response, NextFunction } from "express";
import { ADMIN_ROLES, Role } from "../config/rbac.js";

export const requireCenterAccess = () => {
  return (req: any, res: Response, next: NextFunction) => {
    // 1. Check if user exists (Safety Check)
    if (!req.user) {
      return res.status(401).json({ success: false, message: "Authentication is required" });
    }

    const userRole = req.user.role as Role;

    // Admin roles bypass center check
    if (ADMIN_ROLES.includes(userRole)) {
      return next();
    }

    // 2. Extract centerId with optional chaining to prevent crashes
    const targetCenterId = req.params?.centerId || req.body?.centerId || req.query?.centerId;

    if (!targetCenterId) {
      return next();
    }

    // 3. Robust check for center permissions
    // Your error log suggested 'centerId' might be single, while this code uses 'centerIds' array.
    // We use optional chaining and a fallback array to be safe.
    const userCenters = req.user.centerIds || (req.user.centerId ? [req.user.centerId] : []);

    if (!userCenters.includes(targetCenterId as string)) {
      return res.status(403).json({
        success: false,
        message: "Forbidden: You do not have access to this center.",
      });
    }

    next();
  };
};