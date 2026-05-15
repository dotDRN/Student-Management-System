import type { NextFunction, Request, Response } from "express";
import type { JwtPayload } from '../lib/auth.js';
import {
  createExam,
  getExamById,
  getExamComparison,
  getPendingExamScores,
  getStudentExamScores,
  getExamSheet,
  listExams,
  upsertExamScores,
} from '../services/examService.js';

type AuthenticatedRequest = Request & { user?: JwtPayload };

export async function createExamController(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await createExam((req as AuthenticatedRequest).user!, req.body);

    return res.status(201).json(result);
  } catch (error) {
    return next(error);
  }
}

export async function getExamSheetController(req: Request, res: Response, next: NextFunction) {
  try {
    const { examId } = req.params;
    const result = await getExamSheet((req as any).user, examId as string);
    return res.status(200).json(result);
  } catch (error) {
    next(error);
  }
}

export async function listExamsController(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await listExams((req as AuthenticatedRequest).user!, {
      centerId: req.query.centerId as string,
      programId: req.query.programId as string,
      examType: req.query.examType as string,
      academicYearId: req.query.academicYearId as string,
      examDate: req.query.examDate as string, // ✅ FIX
    });

    return res.status(200).json(result);
  } catch (error) {
    return next(error);
  }
}

export async function getExamByIdController(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await getExamById(
      (req as AuthenticatedRequest).user!,
      req.params.examId as string,
    );
    return res.status(200).json(result);
  } catch (error) {
    return next(error);
  }
}

export async function upsertExamScoresController(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const result = await upsertExamScores(
      (req as AuthenticatedRequest).user!,
      req.params.examId as string,
      req.body,
    );
    return res.status(200).json(result);
  } catch (error) {
    return next(error);
  }
}

export async function getPendingExamScoresController(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const result = await getPendingExamScores(
      (req as AuthenticatedRequest).user!,
      req.params.examId as string,
    );
    return res.status(200).json(result);
  } catch (error) {
    return next(error);
  }
}

export async function getExamComparisonController(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const result = await getExamComparison((req as AuthenticatedRequest).user!, {
      centerId: req.query.centerId as string | undefined,
      programId: req.query.programId as string | undefined,
      academicYearId: req.query.academicYearId as string | undefined,
    });
    return res.status(200).json(result);
  } catch (error) {
    return next(error);
  }
}

export async function getStudentExamScoresController(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const result = await getStudentExamScores(
      (req as AuthenticatedRequest).user!,
      req.params.studentId as string,
    );
    return res.status(200).json(result);
  } catch (error) {
    return next(error);
  }
}
