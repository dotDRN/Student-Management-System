import { Router } from "express";
import { requireAuth as authenticate } from '../lib/auth.js';
import { requirePermission } from '../middleware/permission.middleware.js';
import { requireCenterAccess } from '../middleware/center.middleware.js';
import { PERMISSIONS } from '../config/rbac.js';
import {
  listActivitiesController,
  getActivityController,
  createActivityController,
  updateActivityController,
  deleteActivityController,
  assignVolunteerController,
  removeVolunteerAssignmentController,
} from '../controllers/activityController.js';

const activityRoutes = Router();

activityRoutes.use(authenticate);
activityRoutes.use(requireCenterAccess());

activityRoutes.get("/", listActivitiesController);
activityRoutes.get("/:activityId", getActivityController);
activityRoutes.post("/", requirePermission(PERMISSIONS.MANAGE_ACTIVITIES), createActivityController);
activityRoutes.put("/:activityId", requirePermission(PERMISSIONS.MANAGE_ACTIVITIES), updateActivityController);
activityRoutes.delete("/:activityId", requirePermission(PERMISSIONS.MANAGE_ACTIVITIES), deleteActivityController);

activityRoutes.post("/:activityId/assign", requirePermission(PERMISSIONS.MANAGE_ACTIVITIES), assignVolunteerController);
activityRoutes.delete("/:activityId/assign/:userId", requirePermission(PERMISSIONS.MANAGE_ACTIVITIES), removeVolunteerAssignmentController);

export default activityRoutes;
