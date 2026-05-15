import type { Request, Response, NextFunction } from "express";
import type { JwtPayload } from "../lib/auth.js";
import {
  bulkUpdateSessionRecords,
  createSession,
  getAttendanceSummary,
  getPendingSessions,
  getSessionById,
  getSessionRecords,
  getStudentAttendanceHistory,
  listSessions,
  parseHasIncomplete,
  getTodayFreshSheet,
  markHoliday,
  getRecentAbsentees,
} from "../services/attendanceService.js";

type AuthenticatedRequest = Request & { user?: JwtPayload };

export async function createAttendanceSession(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const { centerId, programId, sessionDate, activityId } = req.body as {
      centerId: string;
      programId: string;
      sessionDate: string;
      activityId?: string;
    };

    const result = await createSession((req as AuthenticatedRequest).user!, {
      centerId,
      programId,
      sessionDate,
      activityId,
    });

    if (!result.created) {
      return res.status(409).json(result);
    }

    return res.status(201).json(result);
  } catch (error) {
    return next(error);
  }
}

export async function getAttendanceSessions(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const { centerId, programId, from, to, hasIncomplete } = req.query;

    const result = await listSessions((req as AuthenticatedRequest).user!, {
      centerId: centerId as string | undefined,
      programId: programId as string | undefined,
      from: from as string | undefined,
      to: to as string | undefined,
      hasIncomplete: parseHasIncomplete(hasIncomplete),
    });

    return res.status(200).json(result);
  } catch (error) {
    return next(error);
  }
}

export async function getAttendanceSessionRecords(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const result = await getSessionRecords(
      (req as AuthenticatedRequest).user!,
      req.params.sessionId as string,
    );
    return res.status(200).json(result);
  } catch (error) {
    return next(error);
  }
}

export async function getAttendanceSessionById(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const result = await getSessionById(
      (req as AuthenticatedRequest).user!,
      req.params.sessionId as string,
    );
    return res.status(200).json(result);
  } catch (error) {
    return next(error);
  }
}

export async function updateAttendanceSessionRecords(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const { records } = req.body as {
      records: Array<{
        recordId: string;
        status: "pending" | "present" | "absent" | "late" | "excused";
        remarks?: string;
      }>;
    };
    await bulkUpdateSessionRecords(
      (req as AuthenticatedRequest).user!,
      req.params.sessionId as string,
      records,
    );

    // ✅ Always return consistent structure
    const full = await getSessionById(
      (req as AuthenticatedRequest).user!,
      req.params.sessionId as string,
    );

    return res.status(200).json(full);
  } catch (error) {
    return next(error);
  }
}

export async function getStudentAttendance(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const { from, to, programId } = req.query;
    const result = await getStudentAttendanceHistory(
      (req as AuthenticatedRequest).user!,
      req.params.studentId as string,
      {
        from: from as string | undefined,
        to: to as string | undefined,
        programId: programId as string | undefined,
      },
    );
    return res.status(200).json(result);
  } catch (error) {
    return next(error);
  }
}

export async function getAttendanceSummaryController(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const { centerId, programId, from, to } = req.query;
    const result = await getAttendanceSummary(
      (req as AuthenticatedRequest).user!,
      {
        centerId: centerId as string | undefined,
        programId: programId as string | undefined,
        from: from as string | undefined,
        to: to as string | undefined,
      },
    );
    return res.status(200).json(result);
  } catch (error) {
    return next(error);
  }
}

export async function getPendingSessionsController(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const result = await getPendingSessions(
      (req as AuthenticatedRequest).user!.userId,
    );
    return res.status(200).json({ sessions: result });
  } catch (error) {
    return next(error);
  }
}

export async function getTodayFreshSheetController(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const { centerId, programId } = req.query;
    if (!centerId || !programId) {
      return res.status(400).json({ error: "centerId and programId are required" });
    }
    const result = await getTodayFreshSheet(
      (req as AuthenticatedRequest).user!,
      centerId as string,
      programId as string,
    );
    return res.status(200).json(result);
  } catch (error) {
    return next(error);
  }
}

export async function markHolidayController(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const { isHoliday } = req.body;
    const result = await markHoliday(
      (req as AuthenticatedRequest).user!,
      req.params.sessionId as string,
      Boolean(isHoliday),
    );
    return res.status(200).json(result);
  } catch (error) {
    return next(error);
  }
}

export async function getRecentAbsenteesController(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const days = req.query.days ? parseInt(req.query.days as string, 10) : 7;
    const result = await getRecentAbsentees(
      (req as AuthenticatedRequest).user!,
      days,
    );
    return res.status(200).json(result);
  } catch (error) {
    return next(error);
  }
}
