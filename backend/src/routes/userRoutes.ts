import { Router } from "express";
import { authenticate } from '../middleware/auth.middleware.js';
import { requirePermission } from '../middleware/permission.middleware.js';
import { requireCenterAccess } from '../middleware/center.middleware.js';
import { PERMISSIONS } from '../config/rbac.js';
import {
  createUserController,
  deleteUserController,
  getUserController,
  listUsersController,
  myCentersController,
  resetPasswordController,
  updateUserController,
  updateUserCentersController,
} from '../controllers/userController.js';

const userRoutes = Router();

// 1. All user routes require a valid login
userRoutes.use(authenticate);

// 2. Any logged-in user can see their assigned centers
userRoutes.get("/me/centers", myCentersController);

// 3. User Management - Restricted to Admins
userRoutes.use(requirePermission(PERMISSIONS.MANAGE_USERS));
userRoutes.use(requireCenterAccess());

userRoutes.get("/", listUsersController);
userRoutes.get("/:userId", getUserController);
userRoutes.post("/", createUserController);
userRoutes.put("/:userId", updateUserController);
userRoutes.post("/:userId/reset-password", resetPasswordController);

// NEW FROM VANSH: Update which centers a user is assigned to
userRoutes.put("/:userId/centers", updateUserCentersController);

// 4. Deletion
userRoutes.delete("/:userId", deleteUserController);

export default userRoutes;