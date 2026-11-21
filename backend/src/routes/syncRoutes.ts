import { Router } from "express";
import { authenticate } from "../middleware/auth.middleware.js";
import {
  pullSyncController,
  pushSyncController,
} from "../controllers/syncController.js";

const router = Router();

router.use(authenticate);

router.get("/pull", pullSyncController);
router.post("/push", pushSyncController);

export default router;
