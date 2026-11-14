import type { NextFunction, Request, Response } from "express";
import {
  createAlertRule,
  evaluateAlertRules,
  listAlertRules,
  listAlerts,
  updateAlertRule,
  updateAlertStatus,
} from "../services/alertService.js";
import type { JwtPayload } from "../utils/jwt.js";

type AuthenticatedRequest = Request & { user?: JwtPayload };

export async function listAlertRulesController(req: Request, res: Response, next: NextFunction) {
  try {
    const rules = await listAlertRules((req as AuthenticatedRequest).user!, {
      centerId: typeof req.query.centerId === "string" ? req.query.centerId : undefined,
      activeOnly: req.query.activeOnly === "true",
    });
    return res.status(200).json(rules);
  } catch (err) {
    return next(err);
  }
}

export async function createAlertRuleController(req: Request, res: Response, next: NextFunction) {
  try {
    const rule = await createAlertRule((req as AuthenticatedRequest).user!, req.body);
    return res.status(201).json(rule);
  } catch (err) {
    return next(err);
  }
}

export async function updateAlertRuleController(req: Request, res: Response, next: NextFunction) {
  try {
    const rule = await updateAlertRule(
      (req as AuthenticatedRequest).user!,
      req.params.ruleId as string,
      req.body,
    );
    return res.status(200).json(rule);
  } catch (err) {
    return next(err);
  }
}

export async function listAlertsController(req: Request, res: Response, next: NextFunction) {
  try {
    const statusParam =
      req.query.status === "open" || req.query.status === "read" || req.query.status === "all"
        ? req.query.status
        : "open";
    const result = await listAlerts((req as AuthenticatedRequest).user!, {
      centerId: typeof req.query.centerId === "string" ? req.query.centerId : undefined,
      status: statusParam,
      limit: req.query.limit ? Number(req.query.limit) : undefined,
    });
    return res.status(200).json(result);
  } catch (err) {
    return next(err);
  }
}

export async function evaluateAlertsController(req: Request, res: Response, next: NextFunction) {
  try {
    const centerId =
      typeof req.body?.centerId === "string" && req.body.centerId.trim()
        ? req.body.centerId.trim()
        : undefined;
    const summary = await evaluateAlertRules({
      centerId,
      actorUser: (req as AuthenticatedRequest).user!,
    });
    return res.status(200).json(summary);
  } catch (err) {
    return next(err);
  }
}

export async function updateAlertStatusController(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const updated = await updateAlertStatus(
      (req as AuthenticatedRequest).user!,
      req.params.id as string,
      Boolean(req.body.isRead),
    );
    return res.status(200).json(updated);
  } catch (err) {
    return next(err);
  }
}
