import { Router } from "express";
import { PERMISSIONS } from "../config/rbac.js";
import {
  createBatchController,
  deleteBatchController,
  enrollStudentsInBatchController,
  getBatchByIdController,
  listBatchesController,
  removeStudentFromBatchController,
  updateBatchController,
} from "../controllers/batchController.js";
import { requireAuth as authenticate } from "../lib/auth.js";
import { requireCenterAccess } from "../middleware/center.middleware.js";
import { requirePermission } from "../middleware/permission.middleware.js";
import { validate } from "../middleware/validate.js";
import {
  createBatchSchema,
  enrollBatchStudentsSchema,
  updateBatchSchema,
} from "../validators/schemas.js";

const batchRoutes = Router();

batchRoutes.use(authenticate);
batchRoutes.use(requireCenterAccess());

batchRoutes.get("/", listBatchesController);
batchRoutes.get("/:batchId", getBatchByIdController);

batchRoutes.post(
  "/",
  requirePermission(PERMISSIONS.MANAGE_ACTIVITIES),
  validate(createBatchSchema),
  createBatchController,
);

batchRoutes.put(
  "/:batchId",
  requirePermission(PERMISSIONS.MANAGE_ACTIVITIES),
  validate(updateBatchSchema),
  updateBatchController,
);

batchRoutes.delete(
  "/:batchId",
  requirePermission(PERMISSIONS.MANAGE_ACTIVITIES),
  deleteBatchController,
);

batchRoutes.post(
  "/:batchId/enroll",
  requirePermission(PERMISSIONS.MANAGE_ACTIVITIES),
  validate(enrollBatchStudentsSchema),
  enrollStudentsInBatchController,
);

batchRoutes.delete(
  "/:batchId/enroll/:studentId",
  requirePermission(PERMISSIONS.MANAGE_ACTIVITIES),
  removeStudentFromBatchController,
);

export default batchRoutes;
