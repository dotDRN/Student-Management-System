import { Router } from "express";
import { PERMISSIONS } from "../config/rbac.js";
import {
  createAcademicYearController,
  listAcademicYearsController,
  setCurrentAcademicYearController,
} from "../controllers/academicYearController.js";
import { requireAuth as authenticate } from "../lib/auth.js";
import { requirePermission } from "../middleware/permission.middleware.js";
import { validate } from "../middleware/validate.js";
import { createAcademicYearSchema } from "../validators/schemas.js";

const academicYearRoutes = Router();

academicYearRoutes.use(authenticate);

academicYearRoutes.get("/", listAcademicYearsController);

academicYearRoutes.post(
  "/",
  requirePermission(PERMISSIONS.MANAGE_CENTERS),
  validate(createAcademicYearSchema),
  createAcademicYearController,
);

academicYearRoutes.patch(
  "/:yearId/set-current",
  requirePermission(PERMISSIONS.MANAGE_CENTERS),
  setCurrentAcademicYearController,
);

export default academicYearRoutes;
