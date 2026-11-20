import type { NextFunction, Request, Response } from "express";
import type { JwtPayload } from "../utils/jwt.js";
import { ValidationError } from "../lib/errors.js";
import {
  syncPullQuerySchema,
  syncPushRequestSchema,
} from "../types/sync.types.js";
import { pullSyncDelta, pushSyncBatch } from "../services/syncService.js";

type AuthenticatedRequest = Request & { user?: JwtPayload };

export async function pullSyncController(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const parsed = syncPullQuerySchema.safeParse({
      since: typeof req.query.since === "string" && req.query.since ? req.query.since : undefined,
      centerId:
        typeof req.query.centerId === "string" && req.query.centerId
          ? req.query.centerId
          : undefined,
      academicYearId:
        typeof req.query.academicYearId === "string" && req.query.academicYearId
          ? req.query.academicYearId
          : undefined,
    });

    if (!parsed.success) {
      throw new ValidationError("Invalid sync pull query parameters", parsed.error.flatten());
    }

    const result = await pullSyncDelta((req as AuthenticatedRequest).user!, parsed.data);
    return res.status(200).json(result);
  } catch (error) {
    return next(error);
  }
}

export async function pushSyncController(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const parsed = syncPushRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new ValidationError("Invalid sync push payload", parsed.error.flatten());
    }

    const result = await pushSyncBatch(
      (req as AuthenticatedRequest).user!,
      parsed.data.operations,
    );
    return res.status(200).json(result);
  } catch (error) {
    return next(error);
  }
}
