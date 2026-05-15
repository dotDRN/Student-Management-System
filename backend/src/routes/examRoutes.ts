import { Router } from "express";
import { requireAuth as authenticate } from '../lib/auth.js';
import { requirePermission } from '../middleware/permission.middleware.js';
import { requireCenterAccess } from '../middleware/center.middleware.js';
import { PERMISSIONS } from '../config/rbac.js';
import {
  createExamController,
  getExamByIdController,
  getExamComparisonController,
  getPendingExamScoresController,
  getStudentExamScoresController,
  listExamsController,
  upsertExamScoresController,
  getExamSheetController, // ✅ Merged into the main import block
} from '../controllers/examController.js';
import { validate } from '../middleware/validate.js';
import { createExamSchema, upsertExamScoresSchema } from '../validators/schemas.js';

const examRoutes = Router();

// Apply global middleware to all routes in this file
examRoutes.use(authenticate);
examRoutes.use(requireCenterAccess());

// --- Routes ---

examRoutes.post("/",
  requirePermission(PERMISSIONS.MANAGE_EXAMS),
  validate(createExamSchema),
  createExamController
);

examRoutes.get("/", listExamsController);
examRoutes.get("/comparison", getExamComparisonController);
examRoutes.get("/students/:studentId", getStudentExamScoresController);

// ✅ FIX: Changed 'router' to 'examRoutes'
// ✅ CLEANUP: Removed duplicate authenticate/requireCenterAccess as they are applied globally above
examRoutes.get("/:examId/sheet", getExamSheetController);

examRoutes.get("/:examId", getExamByIdController);

examRoutes.post(
  "/:examId/scores",
  requirePermission(PERMISSIONS.ENTER_EXAM_SCORES),
  validate(upsertExamScoresSchema),
  upsertExamScoresController,
);

examRoutes.get("/:examId/pending", getPendingExamScoresController);

// ✅ FIX: Only one default export
export default examRoutes;