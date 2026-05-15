import { Router } from "express";
import {
  createStudent,
  getAllStudents,
  filterStudents,
  getStudentById,
  getStudentSummary,
  getStudentProfile,
  updateStudent,
  deleteStudent,
  addAttendance,
  getAttendanceByStudent,
  updateAttendance,
  addSkill,
  getSkillsByStudent,
  updateSkill,
  addCareer,
  getCareersByStudent,
  updateCareer,
  deleteSkill,
  deleteCareer,
  getDashboardStats,
  requestTransfer,
  getTransferRequests,
  completeTransfer,
  addFeePayment,
  getFeePayments,
  updateStudentFees,
} from '../controllers/student.controller.js';
import { authenticate } from '../middleware/auth.middleware.js';
import { requirePermission } from '../middleware/permission.middleware.js';
import { requireCenterAccess } from '../middleware/center.middleware.js';
import { PERMISSIONS } from '../config/rbac.js';
import { validate } from '../middleware/validate.js';
import { createStudentSchema, updateStudentSchema, createSkillSchema, createCareerSchema } from '../validators/schemas.js';

const router = Router();

// 1. All student routes are protected
router.use(authenticate);
router.use(requireCenterAccess());

// 2. Dashboards & Filters (Admins/CEO can view these)
router.get("/filter", filterStudents);
router.get("/dashboard", getDashboardStats);

// 3. Transfer Workflow (NEW FROM VANSH)
router.post(
  "/transfers/request",
  requirePermission(PERMISSIONS.MANAGE_TRANSFERS),
  requestTransfer
);
router.get(
  "/transfers/pending",
  requirePermission(PERMISSIONS.MANAGE_TRANSFERS),
  getTransferRequests
);
router.post(
  "/transfers/complete",
  requirePermission(PERMISSIONS.MANAGE_TRANSFERS),
  completeTransfer
);

// 4. Students CRUD
router.post(
  "/", 
  requirePermission(PERMISSIONS.MANAGE_STUDENTS), 
  validate(createStudentSchema), 
  createStudent
);

// Everyone can view lists and profiles
router.get("/", getAllStudents);
router.get("/:id/summary", getStudentSummary);
router.get("/:id/profile", getStudentProfile);
router.get("/:id", getStudentById);

router.put(
  "/:id", 
  requirePermission(PERMISSIONS.MANAGE_STUDENTS), 
  validate(updateStudentSchema), 
  updateStudent
);

// Delete remains restricted to Admins
router.delete("/:id", requirePermission(PERMISSIONS.MANAGE_STUDENTS), deleteStudent);

// 5. Attendance
router.post("/:studentId/attendance", requirePermission(PERMISSIONS.MANAGE_ATTENDANCE), addAttendance);
router.get("/:studentId/attendance", getAttendanceByStudent);
router.put("/attendance/:id", requirePermission(PERMISSIONS.MANAGE_ATTENDANCE), updateAttendance);

// 6. Skills
router.post("/:studentId/skills", requirePermission(PERMISSIONS.MANAGE_SKILLS), validate(createSkillSchema), addSkill);
router.get("/:studentId/skills", getSkillsByStudent);
router.put("/skills/:id", requirePermission(PERMISSIONS.MANAGE_SKILLS), validate(createSkillSchema), updateSkill);
router.delete("/skills/:id", requirePermission(PERMISSIONS.MANAGE_SKILLS), deleteSkill);

// 7. Careers
router.post("/:studentId/careers", requirePermission(PERMISSIONS.MANAGE_CAREERS), validate(createCareerSchema), addCareer);
router.get("/:studentId/careers", getCareersByStudent);
router.put("/careers/:id", requirePermission(PERMISSIONS.MANAGE_CAREERS), validate(createCareerSchema), updateCareer);
router.delete("/careers/:id", requirePermission(PERMISSIONS.MANAGE_CAREERS), deleteCareer);

// 8. Fee Management (NEW FROM VANSH)
router.post(
  "/:studentId/fees",
  requirePermission(PERMISSIONS.MANAGE_FEES),
  addFeePayment
);
router.get("/:studentId/fees", getFeePayments);
router.put(
  "/:studentId/fees/update",
  requirePermission(PERMISSIONS.MANAGE_FEES),
  updateStudentFees
);

export default router;