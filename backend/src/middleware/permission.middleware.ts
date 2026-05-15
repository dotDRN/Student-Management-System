import { Request, Response, NextFunction } from "express";
import { ROLE_PERMISSIONS, Permission, Role } from "../config/rbac.js";

export const requirePermission = (permission: Permission) => {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ success: false, message: "Authentication is required" });
    }

    const userRole = req.user.role as Role;
    const allowedPermissions = ROLE_PERMISSIONS[userRole] || [];

    if (!allowedPermissions.includes(permission)) {
      return res.status(403).json({
        success: false,
        message: `Forbidden: requires ${permission} permission`,
      });
    }

    next();
  };
};
