import type { NextFunction, Request, Response } from "express";
import { getLinkedChildProgress, listLinkedChildren } from "../services/parentPortalService.js";
import type { JwtPayload } from "../utils/jwt.js";

type AuthenticatedRequest = Request & { user?: JwtPayload };

export async function listLinkedChildrenController(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const user = (req as AuthenticatedRequest).user!;
    const children = await listLinkedChildren(user);
    return res.status(200).json(children);
  } catch (error) {
    return next(error);
  }
}

export async function getLinkedChildProgressController(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const user = (req as AuthenticatedRequest).user!;
    const progress = await getLinkedChildProgress(user, req.params.studentId as string);
    return res.status(200).json(progress);
  } catch (error) {
    return next(error);
  }
}
