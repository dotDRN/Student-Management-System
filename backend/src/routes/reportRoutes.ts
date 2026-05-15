import { Router } from "express";
import { requireAuth as authenticate } from '../lib/auth.js';
import { requirePermission } from '../middleware/permission.middleware.js';
import { requireCenterAccess } from '../middleware/center.middleware.js';
import { PERMISSIONS } from '../config/rbac.js';
import {
  dashboardController,
  attendanceController,
  examsController,
  skillsReportController,
  studentsFilterController,
  exportCsvController
} from '../controllers/reportController.js';

const reportRoutes = Router();

reportRoutes.use(authenticate);
reportRoutes.use(requireCenterAccess());

reportRoutes.get("/dashboard", dashboardController);
reportRoutes.get("/attendance", attendanceController);
reportRoutes.get("/skills", skillsReportController);
reportRoutes.get("/exams", examsController);
reportRoutes.get("/students", studentsFilterController);
reportRoutes.get("/export", requirePermission(PERMISSIONS.VIEW_REPORTS), exportCsvController);

export default reportRoutes;
