import type { NextFunction, Request, Response } from "express";
import type { JwtPayload } from '../lib/auth.js';
import {
  getDashboardSummary,
  getAttendanceAnalytics,
  getExamAnalytics,
  getFilteredStudents,
  exportStudentDataCsv,
  getSkillsReport,
} from '../services/reportService.js';

type AuthenticatedRequest = Request & { user?: JwtPayload };

export async function dashboardController(req: Request, res: Response, next: NextFunction) {
  try {
    const user = (req as AuthenticatedRequest).user!;
    const data = await getDashboardSummary(user);
    return res.status(200).json(data);
  } catch (err) {
    return next(err);
  }
}

export async function attendanceController(req: Request, res: Response, next: NextFunction) {
  try {
    const user = (req as AuthenticatedRequest).user!;
    const data = await getAttendanceAnalytics(user, req.query);
    return res.status(200).json(data);
  } catch (err) {
    return next(err);
  }
}

export async function examsController(req: Request, res: Response, next: NextFunction) {
  try {
    const user = (req as AuthenticatedRequest).user!;
    const data = await getExamAnalytics(user, req.query);
    return res.status(200).json(data);
  } catch (err) {
    return next(err);
  }
}

export async function skillsReportController(req: Request, res: Response, next: NextFunction) {
  try {
    const user = (req as AuthenticatedRequest).user!;
    const data = await getSkillsReport(user, {
      centerId: req.query.centerId as string | undefined,
      programId: req.query.programId as string | undefined,
    });
    return res.status(200).json(data);
  } catch (err) {
    return next(err);
  }
}

export async function studentsFilterController(req: Request, res: Response, next: NextFunction) {
  try {
    const user = (req as AuthenticatedRequest).user!;
    const data = await getFilteredStudents(user, req.query);
    return res.status(200).json(data);
  } catch (err) {
    return next(err);
  }
}

export async function exportCsvController(req: Request, res: Response, next: NextFunction) {
  try {
    const user = (req as AuthenticatedRequest).user!;
    const csvString = await exportStudentDataCsv(user, req.query);
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", "attachment; filename=student_export.csv");
    return res.status(200).send(csvString);
  } catch (err) {
    return next(err);
  }
}
