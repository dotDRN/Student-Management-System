// backend/src/routes/dashboard.routes.ts

import { Router } from "express";
import type { NextFunction, Request, Response } from "express";
// Import your authorize/requireRole middleware
import { requireAuth as authenticate } from '../lib/auth.js'; 
import { requirePermission } from '../middleware/permission.middleware.js';
import { requireCenterAccess } from '../middleware/center.middleware.js';
import { PERMISSIONS } from '../config/rbac.js';
import type { JwtPayload } from '../lib/auth.js';
import { getDashboardSummary } from '../services/reportService.js';

const dashboardRoutes = Router();

// 1. Authenticate everyone first
dashboardRoutes.use(authenticate);

// 2. RESTRICT: Only allow these roles to access ANY dashboard route
dashboardRoutes.use(requirePermission(PERMISSIONS.VIEW_DASHBOARD));
dashboardRoutes.use(requireCenterAccess());

dashboardRoutes.get("/summary", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = (req as Request & { user?: JwtPayload }).user!;
    const data = await getDashboardSummary(user);
    return res.status(200).json(data);
  } catch (err) {
    return next(err);
  }
});

export default dashboardRoutes;