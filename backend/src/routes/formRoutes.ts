import { Router } from "express";
import { requireAuth as authenticate } from '../lib/auth.js';
import { requirePermission } from '../middleware/permission.middleware.js';
import { requireCenterAccess } from '../middleware/center.middleware.js';
import { PERMISSIONS } from '../config/rbac.js';
import {
  createTemplateController,
  deleteSubmissionController,
  deleteTemplateController,
  getPendingFormsController,
  getStudentSubmissionsController,
  getSubmissionController,
  getTemplateController,
  listSubmissionsController,
  listTemplatesController,
  submitFormController,
  updateTemplateController,
} from '../controllers/formController.js';
import { validate } from '../middleware/validate.js';
import {
  createFormTemplateSchema,
  submitFormSchema,
  updateFormTemplateSchema,
} from '../validators/schemas.js';

const formRoutes = Router();

formRoutes.use(authenticate);
formRoutes.use(requireCenterAccess());

formRoutes.post("/templates", requirePermission(PERMISSIONS.MANAGE_FORMS), validate(createFormTemplateSchema), createTemplateController);


formRoutes.get("/templates", listTemplatesController);
formRoutes.get("/templates/:templateId", getTemplateController);
formRoutes.put(
  "/templates/:templateId",
  requirePermission(PERMISSIONS.MANAGE_FORMS),
  validate(updateFormTemplateSchema),
  updateTemplateController,
);
formRoutes.delete("/templates/:templateId", requirePermission(PERMISSIONS.MANAGE_FORMS), deleteTemplateController);

formRoutes.post("/submissions", validate(submitFormSchema), submitFormController);
formRoutes.get("/submissions", listSubmissionsController);
formRoutes.get("/submissions/:submissionId", getSubmissionController);
formRoutes.delete("/submissions/:submissionId", requirePermission(PERMISSIONS.MANAGE_FORMS), deleteSubmissionController);
formRoutes.get("/submissions/student/:studentId", getStudentSubmissionsController);

formRoutes.get("/pending", getPendingFormsController);

export default formRoutes;
