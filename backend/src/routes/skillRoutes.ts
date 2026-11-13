import { Router } from "express";
import { requireAuth as authenticate } from '../lib/auth.js';
import { requirePermission } from '../middleware/permission.middleware.js';
import { requireCenterAccess } from '../middleware/center.middleware.js';
import { PERMISSIONS } from '../config/rbac.js';
import { validate } from '../middleware/validate.js';
import { createSkillSchema } from '../validators/schemas.js';
import {
  getSkillsByStudentController,
  listSkillDefinitionsController,
  createSkillLogController,
} from '../controllers/skillController.js';

const skillRoutes = Router();

skillRoutes.use(authenticate);
skillRoutes.use(requireCenterAccess());

skillRoutes.get("/definitions", listSkillDefinitionsController);
skillRoutes.get("/student/:studentId", getSkillsByStudentController);
skillRoutes.post(
  "/student/:studentId",
  requirePermission(PERMISSIONS.MANAGE_SKILLS),
  validate(createSkillSchema),
  createSkillLogController,
);

export default skillRoutes;
