import type { NextFunction, Request, Response } from "express";
import type { JwtPayload } from '../lib/auth.js';
import {
  assignProgramToCenter,
  assignUserToCenter,
  createCenter,
  createProgram,
  deleteCenter,
  getCenterDetails,
  getProgramCenters,
  getProgramDetails,
  listCenters,
  listPrograms,
  removeProgramFromCenter,
  removeUserFromCenter,
  updateCenter,
  updateProgram,
} from '../services/centerService.js';

type AuthenticatedRequest = Request & { user?: JwtPayload };

export async function listCentersController(req: Request, res: Response, next: NextFunction) {
  try {
    const centers = await listCenters((req as AuthenticatedRequest).user!);
    return res.status(200).json({ centers });
  } catch (error) {
    return next(error);
  }
}

export async function getCenterController(req: Request, res: Response, next: NextFunction) {
  try {
    const center = await getCenterDetails(
      (req as AuthenticatedRequest).user!,
      req.params.centerId as string,
    );
    return res.status(200).json(center);
  } catch (error) {
    return next(error);
  }
}

export async function createCenterController(req: Request, res: Response, next: NextFunction) {
  try {
    const center = await createCenter(req.body);
    return res.status(201).json(center);
  } catch (error) {
    return next(error);
  }
}

export async function deleteCenterController(req: Request, res: Response, next: NextFunction) {
  try {
    await deleteCenter(req.params.centerId as string);
    return res.status(204).send();
  } catch (error) {
    return next(error);
  }
}

export async function updateCenterController(req: Request, res: Response, next: NextFunction) {
  try {
    const center = await updateCenter(req.params.centerId as string, req.body);
    return res.status(200).json(center);
  } catch (error) {
    return next(error);
  }
}

export async function assignProgramController(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await assignProgramToCenter(
      req.params.centerId as string,
      req.body.programId as string,
    );
    return res.status(200).json(result);
  } catch (error) {
    return next(error);
  }
}

export async function removeProgramController(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await removeProgramFromCenter(
      req.params.centerId as string,
      req.params.programId as string,
    );
    return res.status(200).json(result);
  } catch (error) {
    return next(error);
  }
}

export async function assignUserController(req: Request, res: Response, next: NextFunction) {
  try {
    const user = (req as AuthenticatedRequest).user!;
    const result = await assignUserToCenter(user.userId, req.params.centerId as string, req.body);
    return res.status(200).json(result);
  } catch (error) {
    return next(error);
  }
}

export async function removeUserController(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await removeUserFromCenter(
      req.params.centerId as string,
      req.params.userId as string,
    );
    return res.status(200).json(result);
  } catch (error) {
    return next(error);
  }
}

export async function listProgramsController(_req: Request, res: Response, next: NextFunction) {
  try {
    const programs = await listPrograms();
    return res.status(200).json(programs);
  } catch (error) {
    return next(error);
  }
}

export async function createProgramController(req: Request, res: Response, next: NextFunction) {
  try {
    const program = await createProgram(req.body);
    return res.status(201).json(program);
  } catch (error) {
    return next(error);
  }
}

export async function updateProgramController(req: Request, res: Response, next: NextFunction) {
  try {
    const program = await updateProgram(req.params.programId as string, req.body);
    return res.status(200).json(program);
  } catch (error) {
    return next(error);
  }
}

export async function programCentersController(req: Request, res: Response, next: NextFunction) {
  try {
    const rows = await getProgramCenters(req.params.programId as string);
    return res.status(200).json(rows);
  } catch (error) {
    return next(error);
  }
}

export async function getProgramDetailsController(req: Request, res: Response, next: NextFunction) {
  try {
    const details = await getProgramDetails(req.params.programId as string);
    return res.status(200).json(details);
  } catch (error) {
    return next(error);
  }
}
