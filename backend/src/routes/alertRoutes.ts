import { Router } from "express";
import { PERMISSIONS } from "../config/rbac.js";
import {
  createAlertRuleController,
  evaluateAlertsController,
  listAlertRulesController,
  listAlertsController,
  updateAlertRuleController,
  updateAlertStatusController,
} from "../controllers/alertController.js";
import { requireAuth as authenticate } from "../lib/auth.js";
import { requireCenterAccess } from "../middleware/center.middleware.js";
import { requirePermission } from "../middleware/permission.middleware.js";
import { validate } from "../middleware/validate.js";
import {
  createAlertRuleSchema,
  updateAlertRuleSchema,
  updateAlertStatusSchema,
} from "../validators/schemas.js";

const alertRoutes = Router();

alertRoutes.use(authenticate);
alertRoutes.use(requireCenterAccess());

alertRoutes.get("/rules", listAlertRulesController);
alertRoutes.post(
  "/rules",
  requirePermission(PERMISSIONS.MANAGE_CENTERS),
  validate(createAlertRuleSchema),
  createAlertRuleController,
);
alertRoutes.put(
  "/rules/:ruleId",
  requirePermission(PERMISSIONS.MANAGE_CENTERS),
  validate(updateAlertRuleSchema),
  updateAlertRuleController,
);

alertRoutes.post(
  "/evaluate",
  requirePermission(PERMISSIONS.MANAGE_CENTERS),
  evaluateAlertsController,
);

alertRoutes.get("/", listAlertsController);
alertRoutes.patch(
  "/:id/status",
  validate(updateAlertStatusSchema),
  updateAlertStatusController,
);

export default alertRoutes;
