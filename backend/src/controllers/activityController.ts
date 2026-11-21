import type { NextFunction, Request, Response } from "express";
import type { JwtPayload } from "../utils/jwt.js";
import {
  listActivities,
  getActivity,
  createActivity,
  updateActivity,
  deleteActivity,
  assignVolunteer,
  removeVolunteerAssignment,
  listActivityEnrollments,
  enrollStudentsInActivity,
  updateActivityEnrollmentStatus,
  removeActivityEnrollment,
  getStudentActivityEnrollments,
} from "../services/activityService.js";

type AuthenticatedRequest = Request & { user?: JwtPayload };

export async function listActivitiesController(req: Request, res: Response, next: NextFunction) {
  try {
    const user = (req as AuthenticatedRequest).user!;
    const activities = await listActivities(user, {
      centerId: req.query.centerId as string | undefined,
      programId: req.query.programId as string | undefined,
      status: req.query.status as string | undefined,
      from: req.query.from as string | undefined,
      to: req.query.to as string | undefined,
      search: req.query.search as string | undefined,
    });
    return res.status(200).json(activities);
  } catch (error) {
    return next(error);
  }
}

export async function getActivityController(req: Request, res: Response, next: NextFunction) {
  try {
    const user = (req as AuthenticatedRequest).user!;
    const activity = await getActivity(user, req.params.activityId as string);
    return res.status(200).json(activity);
  } catch (error) {
    return next(error);
  }
}

export async function createActivityController(req: Request, res: Response, next: NextFunction) {
  try {
    const user = (req as AuthenticatedRequest).user!;
    const activity = await createActivity(user, req.body);
    return res.status(201).json(activity);
  } catch (error) {
    return next(error);
  }
}

export async function updateActivityController(req: Request, res: Response, next: NextFunction) {
  try {
    const user = (req as AuthenticatedRequest).user!;
    const activity = await updateActivity(user, req.params.activityId as string, req.body);
    return res.status(200).json(activity);
  } catch (error) {
    return next(error);
  }
}

export async function deleteActivityController(req: Request, res: Response, next: NextFunction) {
  try {
    const user = (req as AuthenticatedRequest).user!;
    await deleteActivity(user, req.params.activityId as string);
    return res.status(204).send();
  } catch (error) {
    return next(error);
  }
}

export async function assignVolunteerController(req: Request, res: Response, next: NextFunction) {
  try {
    const user = (req as AuthenticatedRequest).user!;
    const assignment = await assignVolunteer(user, req.params.activityId as string, req.body);
    return res.status(200).json(assignment);
  } catch (error) {
    return next(error);
  }
}

export async function removeVolunteerAssignmentController(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const user = (req as AuthenticatedRequest).user!;
    await removeVolunteerAssignment(
      user,
      req.params.activityId as string,
      req.params.userId as string,
    );
    return res.status(204).send();
  } catch (error) {
    return next(error);
  }
}

export async function listActivityEnrollmentsController(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const user = (req as AuthenticatedRequest).user!;
    const enrollments = await listActivityEnrollments(user, req.params.activityId as string);
    return res.status(200).json(enrollments);
  } catch (error) {
    return next(error);
  }
}

export async function enrollStudentsInActivityController(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const user = (req as AuthenticatedRequest).user!;
    const result = await enrollStudentsInActivity(
      user,
      req.params.activityId as string,
      req.body.studentIds as string[],
    );
    return res.status(201).json(result);
  } catch (error) {
    return next(error);
  }
}

export async function updateActivityEnrollmentStatusController(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const user = (req as AuthenticatedRequest).user!;
    const updated = await updateActivityEnrollmentStatus(
      user,
      req.params.activityId as string,
      req.params.studentId as string,
      req.body.status as "requested_by_teacher" | "approved_by_admin",
    );
    return res.status(200).json(updated);
  } catch (error) {
    return next(error);
  }
}

export async function removeActivityEnrollmentController(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const user = (req as AuthenticatedRequest).user!;
    await removeActivityEnrollment(
      user,
      req.params.activityId as string,
      req.params.studentId as string,
    );
    return res.status(204).send();
  } catch (error) {
    return next(error);
  }
}

export async function getStudentActivityEnrollmentsController(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const user = (req as AuthenticatedRequest).user!;
    const result = await getStudentActivityEnrollments(user, req.params.studentId as string);
    return res.status(200).json(result);
  } catch (error) {
    return next(error);
  }
}
