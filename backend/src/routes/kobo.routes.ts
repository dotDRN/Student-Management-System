import { Router } from "express";
import { authenticate } from '../middleware/auth.middleware.js';
import { requirePermission } from '../middleware/permission.middleware.js';
import { PERMISSIONS } from '../config/rbac.js';
import { syncTemplatesController, syncSubmissionsController } from "../controllers/kobo.controller.js";

const router = Router();

router.use(authenticate);

// Only admins should trigger manual mass syncs
router.post("/sync/templates", requirePermission(PERMISSIONS.MANAGE_FORMS), syncTemplatesController);
router.post("/sync/submissions", requirePermission(PERMISSIONS.MANAGE_FORMS), syncSubmissionsController);

export default router;
