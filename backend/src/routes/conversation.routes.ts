import { Router } from "express";
import {
    createConversation,
    getUserConversations,
    getConversationById,
    updateConversation,
    archiveConversation,
    addMember,
    removeMember,
    getConversationMembers,
    markConversationAsRead
} from "../controllers/conversation.controller.js";
import { authenticate } from "../middleware/auth.middleware.js";

const router = Router();

router.use(authenticate);

router.post("/", createConversation);
router.get("/", getUserConversations);
router.get("/:conversationId", getConversationById);
router.patch("/:conversationId", updateConversation);
router.patch("/:conversationId/archive", archiveConversation);
router.get("/:conversationId/members", getConversationMembers);
router.post("/:conversationId/members", addMember);
router.delete("/:conversationId/members/:memberId", removeMember);
router.patch("/:conversationId/read", markConversationAsRead);

export default router;