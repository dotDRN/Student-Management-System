import { Router } from "express";
import { requireAuth as authenticate } from "../lib/auth.js";
import { requirePermission } from "../middleware/permission.middleware.js";
import { requireCenterAccess } from "../middleware/center.middleware.js";
import { validate } from "../middleware/validate.js";
import { PERMISSIONS } from "../config/rbac.js";
import {
  activityEnrollStudentsSchema,
  assignVolunteerSchema,
  createActivitySchema,
  updateActivityEnrollmentStatusSchema,
  updateActivitySchema,
} from "../validators/schemas.js";
import {
  listActivitiesController,
  getActivityController,
  createActivityController,
  updateActivityController,
  deleteActivityController,
  assignVolunteerController,
  removeVolunteerAssignmentController,
  listActivityEnrollmentsController,
  enrollStudentsInActivityController,
  updateActivityEnrollmentStatusController,
  removeActivityEnrollmentController,
  getStudentActivityEnrollmentsController,
} from "../controllers/activityController.js";

const activityRoutes = Router();

activityRoutes.use(authenticate);
activityRoutes.use(requireCenterAccess());

activityRoutes.get("/", listActivitiesController);
activityRoutes.get("/students/:studentId", getStudentActivityEnrollmentsController);
activityRoutes.get("/:activityId/enrollments", listActivityEnrollmentsController);
activityRoutes.post(
  "/:activityId/enrollments",
  requirePermission(PERMISSIONS.MANAGE_ACTIVITIES),
  validate(activityEnrollStudentsSchema),
  enrollStudentsInActivityController,
);
activityRoutes.patch(
  "/:activityId/enrollments/:studentId",
  requirePermission(PERMISSIONS.MANAGE_ACTIVITIES),
  validate(updateActivityEnrollmentStatusSchema),
  updateActivityEnrollmentStatusController,
);
activityRoutes.delete(
  "/:activityId/enrollments/:studentId",
  requirePermission(PERMISSIONS.MANAGE_ACTIVITIES),
  removeActivityEnrollmentController,
);
activityRoutes.get("/:activityId", getActivityController);
activityRoutes.post(
  "/",
  requirePermission(PERMISSIONS.MANAGE_ACTIVITIES),
  validate(createActivitySchema),
  createActivityController,
);
activityRoutes.put(
  "/:activityId",
  requirePermission(PERMISSIONS.MANAGE_ACTIVITIES),
  validate(updateActivitySchema),
  updateActivityController,
);
activityRoutes.delete(
  "/:activityId",
  requirePermission(PERMISSIONS.MANAGE_ACTIVITIES),
  deleteActivityController,
);

activityRoutes.post(
  "/:activityId/assign",
  requirePermission(PERMISSIONS.MANAGE_ACTIVITIES),
  validate(assignVolunteerSchema),
  assignVolunteerController,
);
activityRoutes.delete(
  "/:activityId/assign/:userId",
  requirePermission(PERMISSIONS.MANAGE_ACTIVITIES),
  removeVolunteerAssignmentController,
);

export default activityRoutes;
