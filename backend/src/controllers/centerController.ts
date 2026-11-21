import type { NextFunction, Request, Response } from "express";
import type { JwtPayload } from '../utils/jwt.js';
import {
  assignProgramToCenter,
  assignUserToCenter,
  createCenter,
  createProgram,
  createProgramSubject,
  createSkillDefinition,
  deleteCenter,
  deleteProgramSubject,
  deleteSkillDefinition,
  getCenterDetails,
  getProgramCenters,
  getProgramDetails,
  listCenters,
  listPrograms,
  removeProgramFromCenter,
  removeUserFromCenter,
  updateCenter,
  updateProgram,
  updateProgramSubject,
  updateSkillDefinition,
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
    const center = await createCenter(req.body, (req as AuthenticatedRequest).user);
    return res.status(201).json(center);
  } catch (error) {
    return next(error);
  }
}

export async function deleteCenterController(req: Request, res: Response, next: NextFunction) {
  try {
    await deleteCenter(req.params.centerId as string, (req as AuthenticatedRequest).user!);
    return res.status(204).send();
  } catch (error) {
    return next(error);
  }
}

export async function updateCenterController(req: Request, res: Response, next: NextFunction) {
  try {
    const center = await updateCenter(
      req.params.centerId as string,
      req.body,
      (req as AuthenticatedRequest).user!,
    );
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
      (req as AuthenticatedRequest).user!,
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
      (req as AuthenticatedRequest).user!,
    );
    return res.status(200).json(result);
  } catch (error) {
    return next(error);
  }
}

export async function assignUserController(req: Request, res: Response, next: NextFunction) {
  try {
    const user = (req as AuthenticatedRequest).user!;
    const result = await assignUserToCenter(user.userId, req.params.centerId as string, req.body, user);
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
      (req as AuthenticatedRequest).user!,
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
    const rows = await getProgramCenters(
      req.params.programId as string,
      (req as AuthenticatedRequest).user,
    );
    return res.status(200).json(rows);
  } catch (error) {
    return next(error);
  }
}

export async function getProgramDetailsController(req: Request, res: Response, next: NextFunction) {
  try {
    const details = await getProgramDetails(
      req.params.programId as string,
      (req as AuthenticatedRequest).user,
    );
    return res.status(200).json(details);
  } catch (error) {
    return next(error);
  }
}

export async function createProgramSubjectController(req: Request, res: Response, next: NextFunction) {
  try {
    const subject = await createProgramSubject(req.params.programId as string, req.body);
    return res.status(201).json(subject);
  } catch (error) {
    return next(error);
  }
}

export async function updateProgramSubjectController(req: Request, res: Response, next: NextFunction) {
  try {
    const subject = await updateProgramSubject(
      req.params.programId as string,
      req.params.subjectId as string,
      req.body,
    );
    return res.status(200).json(subject);
  } catch (error) {
    return next(error);
  }
}

export async function deleteProgramSubjectController(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await deleteProgramSubject(
      req.params.programId as string,
      req.params.subjectId as string,
    );
    return res.status(200).json(result);
  } catch (error) {
    return next(error);
  }
}

export async function createSkillDefinitionController(req: Request, res: Response, next: NextFunction) {
  try {
    const skill = await createSkillDefinition(req.params.programId as string, req.body);
    return res.status(201).json(skill);
  } catch (error) {
    return next(error);
  }
}

export async function updateSkillDefinitionController(req: Request, res: Response, next: NextFunction) {
  try {
    const skill = await updateSkillDefinition(
      req.params.programId as string,
      req.params.skillId as string,
      req.body,
    );
    return res.status(200).json(skill);
  } catch (error) {
    return next(error);
  }
}

export async function deleteSkillDefinitionController(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await deleteSkillDefinition(
      req.params.programId as string,
      req.params.skillId as string,
    );
    return res.status(200).json(result);
  } catch (error) {
    return next(error);
  }
}
