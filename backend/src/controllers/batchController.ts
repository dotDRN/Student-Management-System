import type { NextFunction, Request, Response } from "express";
import {
  createBatch,
  deleteBatch,
  enrollStudentsInBatch,
  getBatchById,
  listBatches,
  removeStudentFromBatch,
  updateBatch,
} from "../services/batchService.js";
import type { JwtPayload } from "../utils/jwt.js";

type AuthenticatedRequest = Request & { user?: JwtPayload };

export async function listBatchesController(req: Request, res: Response, next: NextFunction) {
  try {
    const batches = await listBatches((req as AuthenticatedRequest).user!, {
      centerId: typeof req.query.centerId === "string" ? req.query.centerId : undefined,
      programId: typeof req.query.programId === "string" ? req.query.programId : undefined,
      activityId: typeof req.query.activityId === "string" ? req.query.activityId : undefined,
      teacherId: typeof req.query.teacherId === "string" ? req.query.teacherId : undefined,
      search: typeof req.query.search === "string" ? req.query.search : undefined,
    });
    return res.status(200).json(batches);
  } catch (err) {
    return next(err);
  }
}

export async function getBatchByIdController(req: Request, res: Response, next: NextFunction) {
  try {
    const batch = await getBatchById(
      (req as AuthenticatedRequest).user!,
      req.params.batchId as string,
    );
    return res.status(200).json(batch);
  } catch (err) {
    return next(err);
  }
}

export async function createBatchController(req: Request, res: Response, next: NextFunction) {
  try {
    const batch = await createBatch((req as AuthenticatedRequest).user!, req.body);
    return res.status(201).json(batch);
  } catch (err) {
    return next(err);
  }
}

export async function updateBatchController(req: Request, res: Response, next: NextFunction) {
  try {
    const batch = await updateBatch(
      (req as AuthenticatedRequest).user!,
      req.params.batchId as string,
      req.body,
    );
    return res.status(200).json(batch);
  } catch (err) {
    return next(err);
  }
}

export async function deleteBatchController(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await deleteBatch(
      (req as AuthenticatedRequest).user!,
      req.params.batchId as string,
    );
    return res.status(200).json(result);
  } catch (err) {
    return next(err);
  }
}

export async function enrollStudentsInBatchController(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const result = await enrollStudentsInBatch(
      (req as AuthenticatedRequest).user!,
      req.params.batchId as string,
      req.body.studentIds,
    );
    return res.status(200).json(result);
  } catch (err) {
    return next(err);
  }
}

export async function removeStudentFromBatchController(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const result = await removeStudentFromBatch(
      (req as AuthenticatedRequest).user!,
      req.params.batchId as string,
      req.params.studentId as string,
    );
    return res.status(200).json(result);
  } catch (err) {
    return next(err);
  }
}
