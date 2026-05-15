import { Router } from "express";
import { requireAuth as authenticate } from '../lib/auth.js';
import { requirePermission } from '../middleware/permission.middleware.js';
import { requireCenterAccess } from '../middleware/center.middleware.js';
import { PERMISSIONS } from '../config/rbac.js';
import { validate } from '../middleware/validate.js';
import { createCenterSchema, createProgramSchema } from '../validators/schemas.js';
import {
  assignProgramController,
  assignUserController,
  createCenterController,
  deleteCenterController,
  createProgramController,
  getCenterController,
  getProgramDetailsController,
  listCentersController,
  listProgramsController,
  programCentersController,
  removeProgramController,
  removeUserController,
  updateCenterController,
  updateProgramController,
} from '../controllers/centerController.js';

const centerRoutes = Router();
const programRoutes = Router();

centerRoutes.use(authenticate);
centerRoutes.use(requireCenterAccess());
programRoutes.use(authenticate);
programRoutes.use(requireCenterAccess());

centerRoutes.get("/", listCentersController);
centerRoutes.get("/:centerId", getCenterController);

centerRoutes.post("/", requirePermission(PERMISSIONS.MANAGE_CENTERS), validate(createCenterSchema), createCenterController);
centerRoutes.delete("/:centerId", requirePermission(PERMISSIONS.MANAGE_CENTERS), deleteCenterController);
centerRoutes.put("/:centerId", requirePermission(PERMISSIONS.MANAGE_CENTERS), updateCenterController);

centerRoutes.post("/:centerId/programs", requirePermission(PERMISSIONS.MANAGE_CENTERS), assignProgramController);
centerRoutes.delete(
  "/:centerId/programs/:programId",
  requirePermission(PERMISSIONS.MANAGE_CENTERS),
  removeProgramController,
);
centerRoutes.post("/:centerId/users", requirePermission(PERMISSIONS.MANAGE_CENTERS), assignUserController);
centerRoutes.delete("/:centerId/users/:userId", requirePermission(PERMISSIONS.MANAGE_CENTERS), removeUserController);

programRoutes.get("/", listProgramsController);
programRoutes.get("/:programId", getProgramDetailsController);
programRoutes.post("/", requirePermission(PERMISSIONS.MANAGE_CENTERS), validate(createProgramSchema), createProgramController);
programRoutes.put("/:programId", requirePermission(PERMISSIONS.MANAGE_CENTERS), updateProgramController);
programRoutes.get("/:programId/centers", requirePermission(PERMISSIONS.MANAGE_CENTERS), programCentersController);

export { programRoutes };
export default centerRoutes;
