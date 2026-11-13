import type { NextFunction, Request, Response } from "express";
import type { JwtPayload } from '../utils/jwt.js';
import { UserRole } from "@prisma/client";
import { hasCenterAccess, isGlobalAdmin } from '../config/rbac.js';
import {
  createUser,
  getMyCenters,
  getUserById,
  listUsers,
  resetUserPassword,
  softDeleteUser,
  updateUser,
  updateUserCenters,
} from '../services/userService.js';

// Define the custom request type to access req.user
type AuthenticatedRequest = Request & { user?: JwtPayload };

export async function listUsersController(req: Request, res: Response, next: NextFunction) {
  try {
    // 1. Logic Fix: Merge all filters into one object to avoid calling listUsers twice
    const result = await listUsers({
      role: req.query.role as UserRole | undefined,
      centerId: req.query.centerId as string | undefined,
      isActive:
        typeof req.query.isActive === "string"
          ? req.query.isActive.toLowerCase() === "true"
          : undefined,
      search: req.query.search as string | undefined,
      page: req.query.page ? Number(req.query.page) : 1,
      limit: req.query.limit ? Number(req.query.limit) : 50,
    });

    return res.status(200).json(result);
  } catch (error) {
    return next(error);
  }
}

export async function getUserController(req: Request, res: Response, next: NextFunction) {
  try {
    const user = await getUserById(req.params.userId as string);
    return res.status(200).json(user);
  } catch (error) {
    return next(error);
  }
}

export async function createUserController(req: Request, res: Response, next: NextFunction) {
  try {
    const requester = (req as AuthenticatedRequest).user;
    // Extract centerIds from the body along with other fields
    const { role: targetRole, centerIds } = req.body as { role: UserRole, centerIds?: string[] };

    if (!requester || !requester.role) {
      return res.status(401).json({ success: false, error: "Unauthorized" });
    }

    const requesterRole = requester.role as string;

    // --- HIERARCHY LOGIC ---
    if (requesterRole === "super_admin") {
      const allowedForSuper = ["super_admin", "tech_admin", "center_admin", "supervisor", "teacher", "staff", "volunteer"];
      if (!allowedForSuper.includes(targetRole)) {
        return res.status(403).json({
          success: false,
          error: "Invalid role assignment for Super Admin."
        });
      }
    } else if (requesterRole === "tech_admin") {
      const allowedForTech = ["tech_admin", "center_admin", "supervisor", "teacher", "staff", "volunteer"];
      if (!allowedForTech.includes(targetRole)) {
        return res.status(403).json({
          success: false,
          error: "Tech Admins cannot assign Super Admin role."
        });
      }
    } else if (requesterRole === "center_admin") {
      const allowedForAdmin = ["teacher", "staff", "volunteer"];
      if (!allowedForAdmin.includes(targetRole)) {
        return res.status(403).json({
          success: false,
          error: "Center Admins can only create Teachers, Staff, or Volunteers."
        });
      }
      if (Array.isArray(centerIds)) {
        const allAllowed = centerIds.every((cid) => hasCenterAccess(requester, cid));
        if (!allAllowed) {
          return res.status(403).json({
            success: false,
            error: "Center Admins can only assign users to their own centers."
          });
        }
      }
    } else {
      return res.status(403).json({ success: false, error: "Access Denied." });
    }

    // Explicitly include centerIds in the data passed to the service
    const userData = {
      ...req.body,
      centerIds: centerIds || [], // Ensure this is an array
      createdBy: requester?.userId
    };

    const user = await createUser(userData);
    return res.status(201).json(user);
  } catch (error) {
    // This will catch the Prisma nested-write errors if centerIds are malformed
    return next(error);
  }
}

export async function updateUserController(req: Request, res: Response, next: NextFunction) {
  try {
    if ("email" in req.body) {
      return res.status(400).json({ success: false, error: "User ID (Email field) cannot be changed once created." });
    }
    if ("password" in req.body || "passwordHash" in req.body) {
      return res.status(400).json({ success: false, error: "Use the Reset Password option to change passwords." });
    }

    const user = await updateUser(req.params.userId as string, req.body);
    return res.status(200).json(user);
  } catch (error) {
    return next(error);
  }
}

export async function resetPasswordController(req: Request, res: Response, next: NextFunction) {
  try {
    const { newPassword } = req.body as { newPassword: string };
    const result = await resetUserPassword(req.params.userId as string, newPassword);
    return res.status(200).json(result);
  } catch (error) {
    return next(error);
  }
}

export async function deleteUserController(req: Request, res: Response, next: NextFunction) {
  try {
    const requester = (req as AuthenticatedRequest).user!;
    const targetUser = await getUserById(req.params.userId as string);

    const hierarchy: Record<string, number> = {
      [UserRole.super_admin]: 5,
      [UserRole.tech_admin]: 4,
      [UserRole.center_admin]: 3,
      [UserRole.supervisor]: 2,
      [UserRole.teacher]: 1,
      [UserRole.staff]: 0,
      [UserRole.volunteer]: 0,
    };

    const requesterLevel = hierarchy[requester.role] ?? 0;
    const targetLevel = hierarchy[targetUser.role] ?? 0;

    if (requesterLevel <= targetLevel && requester.role !== UserRole.super_admin) {
      return res.status(403).json({
        success: false,
        error: "You do not have permission to delete this user."
      });
    }

    if (!isGlobalAdmin(requester.role)) {
      const targetCenterIds = (
        (targetUser as { centerAssignments?: Array<{ centerId: string }> }).centerAssignments || []
      ).map((assignment) => assignment.centerId);
      const sharesCenter = targetCenterIds.some((cid) => hasCenterAccess(requester, cid));
      if (!sharesCenter) {
        return res.status(403).json({
          success: false,
          error: "You can only delete users assigned to your centers."
        });
      }
    }

    const result = await softDeleteUser(req.params.userId as string, requester);
    return res.status(200).json(result);
  } catch (error) {
    return next(error);
  }
}

export async function myCentersController(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await getMyCenters((req as AuthenticatedRequest).user!);
    return res.status(200).json(result);
  } catch (error) {
    return next(error);
  }
}

export async function updateUserCentersController(req: Request, res: Response, next: NextFunction) {
  try {
    const requester = (req as AuthenticatedRequest).user!;
    const { centerIds } = req.body as { centerIds: string[] };

    if (!Array.isArray(centerIds)) {
      return res.status(400).json({ success: false, error: "centerIds must be an array" });
    }

    const result = await updateUserCenters(
      requester.userId || (requester as any).id,
      req.params.userId as string,
      centerIds,
    );
    return res.status(200).json(result);
  } catch (error) {
    return next(error);
  }
}
