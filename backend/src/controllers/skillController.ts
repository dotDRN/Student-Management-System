import type { NextFunction, Request, Response } from "express";
import type { JwtPayload } from '../lib/auth.js';
import { getSkillsByStudent, listSkillDefinitions, createSkillLog } from '../services/skillService.js';

type AuthenticatedRequest = Request & { user?: JwtPayload };

export async function createSkillLogController(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await createSkillLog(
      (req as AuthenticatedRequest).user!,
      req.params.studentId as string,
      req.body
    );
    return res.status(201).json(result);
  } catch (error) {
    return next(error);
  }
}

export async function getSkillsByStudentController(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await getSkillsByStudent(
      (req as AuthenticatedRequest).user!,
      req.params.studentId as string
    );
    return res.status(200).json(result);
  } catch (error) {
    return next(error);
  }
}

export async function listSkillDefinitionsController(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await listSkillDefinitions(req.query.programId as string | undefined);
    return res.status(200).json(result);
  } catch (error) {
    return next(error);
  }
}
