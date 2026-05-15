import type { NextFunction, Request, Response } from "express";
import type { JwtPayload } from '../lib/auth.js';
import { UserRole } from "@prisma/client";
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
    const requester = (req as AuthenticatedRequest).user;

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
      // Admins see all users; other roles only see users they created
      createdBy: (requester?.role === 'super_admin' || requester?.role === 'center_admin') 
        ? undefined 
        : requester?.userId
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
      const allowedForSuper = ["super_admin", "center_admin", "teacher", "staff", "volunteer"];
      if (!allowedForSuper.includes(targetRole)) {
        return res.status(403).json({ 
          success: false, 
          error: "Invalid role assignment for Super Admin." 
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
    } else {
      return res.status(403).json({ success: false, error: "Access Denied." });
    }

    // 🔥 THE FIX: Explicitly include centerIds in the data passed to the service
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

    const hierarchy = {
      [UserRole.super_admin]: 3,
      [UserRole.center_admin]: 2,
      [UserRole.teacher]: 1,
      [UserRole.staff]: 0
    };

    const requesterLevel = hierarchy[requester.role as keyof typeof hierarchy] || 0;
    const targetLevel = hierarchy[targetUser.role as keyof typeof hierarchy] || 0;

    if (requesterLevel <= targetLevel && requester.role !== UserRole.super_admin) {
      return res.status(403).json({ 
        success: false, 
        error: "You do not have permission to delete this user." 
      });
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