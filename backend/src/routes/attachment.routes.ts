import { Router } from "express";
import {
    uploadAttachment,
    deleteAttachment
} from "../controllers/attachment.controller.js";
import { authenticate } from "../middleware/auth.middleware.js";

const router = Router();

router.use(authenticate);

router.post("/:messageId", uploadAttachment);
router.delete("/:attachmentId", deleteAttachment);

export default router;