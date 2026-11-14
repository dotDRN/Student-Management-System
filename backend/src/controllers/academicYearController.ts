import type { NextFunction, Request, Response } from "express";
import {
  createAcademicYear,
  listAcademicYearsWithStats,
  setCurrentAcademicYear,
} from "../services/academicYearService.js";
import type { JwtPayload } from "../utils/jwt.js";

type AuthenticatedRequest = Request & { user?: JwtPayload };

export async function listAcademicYearsController(_req: Request, res: Response, next: NextFunction) {
  try {
    const years = await listAcademicYearsWithStats();
    return res.status(200).json(years);
  } catch (err) {
    return next(err);
  }
}

export async function createAcademicYearController(req: Request, res: Response, next: NextFunction) {
  try {
    const created = await createAcademicYear((req as AuthenticatedRequest).user!, req.body);
    return res.status(201).json(created);
  } catch (err) {
    return next(err);
  }
}

export async function setCurrentAcademicYearController(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const updated = await setCurrentAcademicYear(
      (req as AuthenticatedRequest).user!,
      req.params.yearId as string,
    );
    return res.status(200).json(updated);
  } catch (err) {
    return next(err);
  }
}
