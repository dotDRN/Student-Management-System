import type { NextFunction, Request, Response } from "express";
import type { JwtPayload } from '../lib/auth.js';
import {
  createTemplate,
  deleteSubmission,
  getPendingSubmissions,
  getStudentSubmissions,
  getSubmissionById,
  getTemplateById,
  listSubmissions,
  listTemplates,
  softDeleteTemplate,
  submitForm,
  updateTemplate
} from '../services/formService.js';

type AuthenticatedRequest = Request & { user?: JwtPayload };


export async function createTemplateController(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await createTemplate((req as AuthenticatedRequest).user!, req.body);
    return res.status(201).json(result);
  } catch (error) {
    return next(error);
  }
}

export async function listTemplatesController(req: Request, res: Response, next: NextFunction) {
  try {
    const user = (req as AuthenticatedRequest).user!;
    const includeInactive =
      user.role === "super_admin" &&
      (req.query.includeInactive === "true" || req.query.includeInactive === "1");
    const result = await listTemplates(req.query.formType as string | undefined, {
      includeInactive,
    });
    return res.status(200).json({ templates: result });
  } catch (error) {
    return next(error);
  }
}

export async function getTemplateController(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await getTemplateById(req.params.templateId as string);
    return res.status(200).json(result);
  } catch (error) {
    return next(error);
  }
}

export async function updateTemplateController(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await updateTemplate(req.params.templateId as string, req.body);
    return res.status(200).json(result);
  } catch (error) {
    return next(error);
  }
}

export async function deleteTemplateController(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await softDeleteTemplate(req.params.templateId as string);
    return res.status(200).json(result);
  } catch (error) {
    return next(error);
  }
}

export async function submitFormController(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await submitForm((req as AuthenticatedRequest).user!, req.body);
    return res.status(201).json(result);
  } catch (error) {
    return next(error);
  }
}

export async function listSubmissionsController(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await listSubmissions((req as AuthenticatedRequest).user!, {
      templateId: req.query.templateId as string | undefined,
      studentId: req.query.studentId as string | undefined,
      centerId: req.query.centerId as string | undefined,
      from: req.query.from as string | undefined,
      to: req.query.to as string | undefined,
      page: req.query.page ? Number(req.query.page) : 1,
      limit: req.query.limit ? Number(req.query.limit) : 50,
    });
    return res.status(200).json(result);
  } catch (error) {
    return next(error);
  }
}

export async function getSubmissionController(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await getSubmissionById(
      (req as AuthenticatedRequest).user!,
      req.params.submissionId as string,
    );
    return res.status(200).json(result);
  } catch (error) {
    return next(error);
  }
}

export async function deleteSubmissionController(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await deleteSubmission(req.params.submissionId as string);
    return res.status(200).json(result);
  } catch (error) {
    return next(error);
  }
}

export async function getStudentSubmissionsController(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const result = await getStudentSubmissions(
      (req as AuthenticatedRequest).user!,
      req.params.studentId as string,
    );
    return res.status(200).json(result);
  } catch (error) {
    return next(error);
  }
}

export async function getPendingFormsController(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await getPendingSubmissions((req as AuthenticatedRequest).user!, {
      templateId: req.query.templateId as string | undefined,
      centerId: req.query.centerId as string | undefined,
    });
    return res.status(200).json({ students: result });
  } catch (error) {
    return next(error);
  }
}
