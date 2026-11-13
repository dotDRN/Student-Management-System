import { Router } from "express";
import { requireAuth as authenticate } from '../lib/auth.js';
import { requirePermission } from '../middleware/permission.middleware.js';
import { requireCenterAccess } from '../middleware/center.middleware.js';
import { PERMISSIONS } from '../config/rbac.js';
import {
  createAttendanceSession,
  getAttendanceSessionById,
  getAttendanceSessionRecords,
  getAttendanceSessions,
  getAttendanceSummaryController,
  getPendingSessionsController,
  getStudentAttendance,
  updateAttendanceSessionRecords,
  getTodayFreshSheetController,
  markHolidayController,
  getRecentAbsenteesController,
} from '../controllers/attendanceController.js';
import { validate } from '../middleware/validate.js';
import {
  createAttendanceSessionSchema,
  updateAttendanceSessionRecordsSchema,
} from '../validators/schemas.js';

const attendanceRoutes = Router();

attendanceRoutes.use(authenticate);
attendanceRoutes.use(requireCenterAccess());

attendanceRoutes.post(
  "/sessions",
  requirePermission(PERMISSIONS.MANAGE_ATTENDANCE),
  validate(createAttendanceSessionSchema),
  createAttendanceSession,
);
attendanceRoutes.get("/sessions", getAttendanceSessions);
attendanceRoutes.get("/sessions/:sessionId/records", getAttendanceSessionRecords);
attendanceRoutes.get("/sessions/:sessionId", getAttendanceSessionById);
attendanceRoutes.put(
  "/sessions/:sessionId/records",
  requirePermission(PERMISSIONS.MANAGE_ATTENDANCE),
  validate(updateAttendanceSessionRecordsSchema),
  updateAttendanceSessionRecords,
);
attendanceRoutes.get("/students/:studentId", getStudentAttendance);
attendanceRoutes.get("/summary", getAttendanceSummaryController);
attendanceRoutes.get("/pending", getPendingSessionsController);
attendanceRoutes.get(
  "/fresh-sheet",
  requirePermission(PERMISSIONS.MANAGE_ATTENDANCE),
  getTodayFreshSheetController,
);
attendanceRoutes.get("/absentees", getRecentAbsenteesController);
attendanceRoutes.put(
  "/sessions/:sessionId/holiday",
  requirePermission(PERMISSIONS.MANAGE_ATTENDANCE),
  markHolidayController,
);

export default attendanceRoutes;
