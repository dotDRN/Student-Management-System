import { Router } from "express";
import { authenticate } from "../middleware/auth.middleware.js";
import { requireCenterAccess } from "../middleware/center.middleware.js";
import { validate } from "../middleware/validate.js";
import {
  aiCareerPlaybookRequestSchema,
  aiChatRequestSchema,
  aiEntityMemoryCreateSchema,
  aiRagSearchSchema,
} from "../validators/aiValidators.js";
import {
  getAiStatus,
  getMemoriesForEntity,
  getThreadById,
  getThreads,
  postAiChat,
  postEntityMemory,
  postRagSearch,
  postStudentBriefing,
  postStudentCareerPlaybook,
  removeThread,
} from "../controllers/aiController.js";

const router = Router();

router.use(authenticate);
router.use(requireCenterAccess());

router.get("/status", getAiStatus);

// Universal Orchestrator Chat & Episodic Thread Memory
router.post("/chat", validate(aiChatRequestSchema), postAiChat);
router.get("/threads", getThreads);
router.get("/threads/:threadId", getThreadById);
router.delete("/threads/:threadId", removeThread);

// Direct Hybrid Semantic + Lexical RAG Search
router.post("/rag/search", validate(aiRagSearchSchema), postRagSearch);

// Student 360° Academic Intelligence & Career Guidance Playbooks
router.post("/students/:studentId/briefing", postStudentBriefing);
router.post(
  "/students/:studentId/career-playbook",
  validate(aiCareerPlaybookRequestSchema),
  postStudentCareerPlaybook,
);

// Long-Term Institutional Entity Memory
router.get("/memories/:entityType/:entityId", getMemoriesForEntity);
router.post("/memories", validate(aiEntityMemoryCreateSchema), postEntityMemory);

export default router;
