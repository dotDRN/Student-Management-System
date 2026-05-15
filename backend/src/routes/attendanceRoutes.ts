import { Router } from "express";
import { requireAuth as authenticate } from '../lib/auth.js';
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

attendanceRoutes.post("/sessions", validate(createAttendanceSessionSchema), createAttendanceSession);
attendanceRoutes.get("/sessions", getAttendanceSessions);
attendanceRoutes.get("/sessions/:sessionId/records", getAttendanceSessionRecords);
attendanceRoutes.get("/sessions/:sessionId", getAttendanceSessionById);
attendanceRoutes.put(
  "/sessions/:sessionId/records",
  validate(updateAttendanceSessionRecordsSchema),
  updateAttendanceSessionRecords,
);
attendanceRoutes.get("/students/:studentId", getStudentAttendance);
attendanceRoutes.get("/summary", getAttendanceSummaryController);
attendanceRoutes.get("/pending", getPendingSessionsController);
attendanceRoutes.get("/fresh-sheet", getTodayFreshSheetController);
attendanceRoutes.get("/absentees", getRecentAbsenteesController);
attendanceRoutes.put("/sessions/:sessionId/holiday", markHolidayController);

export default attendanceRoutes;
