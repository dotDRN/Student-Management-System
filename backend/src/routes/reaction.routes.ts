import { Router } from "express";
import {
    addReaction,
    removeReaction
} from "../controllers/reaction.controller.js";
import { authenticate } from "../middleware/auth.middleware.js";

const router = Router();

router.use(authenticate);

router.post("/:messageId/reactions", addReaction);
router.delete("/:messageId/reactions", removeReaction);

export default router;