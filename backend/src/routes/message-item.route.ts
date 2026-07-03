import { Router } from "express";
import {
    getMessageById,
    editMessage,
    deleteMessage
} from "../controllers/message.controller.js";
import { authenticate } from "../middleware/auth.middleware.js";

const router = Router();

router.use(authenticate);

router.get("/:messageId", getMessageById);
router.patch("/:messageId", editMessage);
router.delete("/:messageId", deleteMessage);

export default router;