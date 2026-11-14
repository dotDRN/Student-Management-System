import { Router } from "express";
import {
  getLinkedChildProgressController,
  listLinkedChildrenController,
} from "../controllers/parentPortalController.js";
import { requireAuth } from "../lib/auth.js";

const parentPortalRoutes = Router();

parentPortalRoutes.use(requireAuth);

parentPortalRoutes.get("/children", listLinkedChildrenController);
parentPortalRoutes.get("/children/:studentId/progress", getLinkedChildProgressController);

export default parentPortalRoutes;
