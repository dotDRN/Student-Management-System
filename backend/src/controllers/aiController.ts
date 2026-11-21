import type { NextFunction, Request, Response } from "express";
import {
  deleteAiThread,
  getAiThread,
  getEntityMemories,
  listAiThreads,
  saveEntityMemory,
  searchKnowledgeBaseRag,
  type AiEntityType,
} from "../services/ai/memoryEngine.js";
import {
  generateCareerAndSkillPlaybook,
  generateStudent360Briefing,
  getOrchestratorMetadata,
  orchestrateChat,
} from "../services/ai/universalOrchestrator.js";
import { assertStaffAiChatAccess, assertStudentAiAccess } from "../services/ai/piiGuard.js";
import { ValidationError } from "../lib/errors.js";

const VALID_ENTITY_TYPES = new Set<AiEntityType>(["student", "center", "program"]);

export const getAiStatus = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<Response | void> => {
  try {
    return res.status(200).json({
      success: true,
      data: getOrchestratorMetadata(),
    });
  } catch (err) {
    next(err);
  }
};

export const postAiChat = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<Response | void> => {
  try {
    const result = await orchestrateChat(req.user!, req.body);
    return res.status(200).json({
      success: true,
      data: result,
    });
  } catch (err) {
    next(err);
  }
};

export const getThreads = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<Response | void> => {
  try {
    assertStaffAiChatAccess(req.user!);
    const limit = Number(req.query.limit) || 25;
    const threads = await listAiThreads(req.user!, limit);
    return res.status(200).json({
      success: true,
      data: threads,
    });
  } catch (err) {
    next(err);
  }
};

export const getThreadById = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<Response | void> => {
  try {
    assertStaffAiChatAccess(req.user!);
    const thread = await getAiThread(req.user!, req.params.threadId as string);
    return res.status(200).json({
      success: true,
      data: thread,
    });
  } catch (err) {
    next(err);
  }
};

export const removeThread = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<Response | void> => {
  try {
    assertStaffAiChatAccess(req.user!);
    const result = await deleteAiThread(req.user!, req.params.threadId as string);
    return res.status(200).json({
      success: true,
      data: result,
    });
  } catch (err) {
    next(err);
  }
};

export const postRagSearch = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<Response | void> => {
  try {
    assertStaffAiChatAccess(req.user!);
    const result = await searchKnowledgeBaseRag(req.user!, req.body);
    return res.status(200).json({
      success: true,
      data: result,
    });
  } catch (err) {
    next(err);
  }
};

export const postStudentBriefing = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<Response | void> => {
  try {
    const studentId = req.params.studentId as string;
    const briefing = await generateStudent360Briefing(req.user!, studentId);
    return res.status(200).json({
      success: true,
      data: briefing,
    });
  } catch (err) {
    next(err);
  }
};

export const postStudentCareerPlaybook = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<Response | void> => {
  try {
    const studentId = req.params.studentId as string;
    const playbook = await generateCareerAndSkillPlaybook(req.user!, studentId, req.body);
    return res.status(200).json({
      success: true,
      data: playbook,
    });
  } catch (err) {
    next(err);
  }
};

export const getMemoriesForEntity = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<Response | void> => {
  try {
    const entityType = req.params.entityType as AiEntityType;
    const entityId = req.params.entityId as string;
    if (!VALID_ENTITY_TYPES.has(entityType)) {
      throw new ValidationError("entityType must be one of: student, center, program");
    }
    if (entityType === "student") {
      await assertStudentAiAccess(req.user!, entityId);
    } else {
      assertStaffAiChatAccess(req.user!);
    }

    const memories = await getEntityMemories(req.user!, entityType, entityId);
    return res.status(200).json({
      success: true,
      data: memories,
    });
  } catch (err) {
    next(err);
  }
};

export const postEntityMemory = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<Response | void> => {
  try {
    assertStaffAiChatAccess(req.user!);
    const created = await saveEntityMemory(req.user!, req.body);
    return res.status(201).json({
      success: true,
      data: created,
    });
  } catch (err) {
    next(err);
  }
};
