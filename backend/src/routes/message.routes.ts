import { Router } from "express";
import {
    sendMessage,
    getMessages,
    searchMessages
} from "../controllers/message.controller.js";
import { authenticate } from "../middleware/auth.middleware.js";

const router = Router();

router.use(authenticate);

router.post("/:conversationId/messages", sendMessage);
router.get("/:conversationId/messages/search", searchMessages);
router.get("/:conversationId/messages", getMessages);

export default router;