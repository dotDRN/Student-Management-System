import { z } from "zod";

export const aiPageContextSchema = z
  .object({
    route: z.string().max(200).optional(),
    studentId: z.string().uuid().optional(),
    centerId: z.string().uuid().optional(),
    programId: z.string().uuid().optional(),
  })
  .optional();

export const aiChatRequestSchema = z.object({
  message: z.string().trim().min(1, "Message is required").max(4000),
  threadId: z.string().uuid().optional(),
  context: aiPageContextSchema,
});

export const aiCareerPlaybookRequestSchema = z.object({
  focusArea: z.string().trim().max(200).optional(),
  customGoal: z.string().trim().max(200).optional(),
});

export const aiEntityMemoryCreateSchema = z.object({
  entityType: z.enum(["student", "center", "program"]),
  entityId: z.string().uuid("Valid entity UUID is required"),
  category: z.string().trim().max(60).optional(),
  summary: z.string().trim().min(3, "Memory summary must be at least 3 characters").max(1500),
  tags: z.array(z.string().trim().min(1).max(40)).max(10).optional(),
});

export const aiRagSearchSchema = z.object({
  query: z.string().trim().min(1, "Search query is required").max(500),
  centerId: z.string().uuid().optional(),
  studentId: z.string().uuid().optional(),
  sourceTypes: z.array(z.string().trim()).max(10).optional(),
  limit: z.number().int().min(1).max(20).optional(),
});
