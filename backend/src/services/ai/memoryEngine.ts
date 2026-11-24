import crypto from "node:crypto";
import type { Prisma } from "@prisma/client";
import prisma from "../../lib/prisma.js";
import type { JwtPayload } from "../../utils/jwt.js";
import { assertCenterAccess, getScopedCenterIds, isGlobalAdmin } from "../../lib/centerScope.js";
import { ForbiddenError, NotFoundError } from "../../lib/errors.js";
import { STUDENT_DOCUMENT_ADD_ACTION, STUDENT_DOCUMENT_TABLE } from "../studentDossierService.js";
import { cosineSimilarity, generateTextEmbedding } from "./llmProvider.js";
import { isPiiRestrictedRole, maskStudentName, sanitizePayloadForAi } from "./piiGuard.js";

export const AI_THREAD_TABLE = "ai_memory_threads";
export const AI_THREAD_ACTION = "AI_MEMORY_THREAD";

export const AI_ENTITY_MEMORY_TABLE = "ai_entity_memories";
export const AI_ENTITY_MEMORY_ACTION = "AI_ENTITY_MEMORY";

export type AiEntityType = "student" | "center" | "program";

export interface AiPageContext {
  route?: string;
  studentId?: string;
  centerId?: string;
  programId?: string;
}

export interface AiCitation {
  sourceType:
    | "student_profile"
    | "skill_remark"
    | "exam_remark"
    | "career_record"
    | "form_submission"
    | "activity_note"
    | "dossier_document"
    | "alert"
    | "entity_memory"
    | "analytics";
  title: string;
  snippet: string;
  entityId?: string;
  studentId?: string;
  centerId?: string;
  date?: string;
  score?: number;
}

export interface AiThreadMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
  toolsUsed?: string[];
  citations?: AiCitation[];
  providerMode?: string;
  context?: AiPageContext;
}

export interface AiThreadRecord {
  id: string;
  title: string;
  userId: string;
  context?: AiPageContext;
  messages: AiThreadMessage[];
  createdAt: string;
  updatedAt: string;
}

export interface AiEntityMemoryRecord {
  id: string;
  entityType: AiEntityType;
  entityId: string;
  centerId: string | null;
  category: string;
  summary: string;
  tags: string[];
  metadata?: Record<string, unknown>;
  createdByName: string | null;
  createdAt: string;
}

export interface RagChunk {
  id: string;
  sourceType: AiCitation["sourceType"];
  title: string;
  text: string;
  studentId?: string;
  centerId?: string;
  date?: string;
}

// =============================================================================
// 1. EPISODIC SESSION MEMORY (MULTI-TURN THREADS)
// =============================================================================

function mapAuditRowToThread(row: {
  id: string;
  userId: string | null;
  newData: unknown;
  createdAt: Date;
}): AiThreadRecord {
  const data = (row.newData && typeof row.newData === "object" ? row.newData : {}) as Record<
    string,
    unknown
  >;
  const messages = Array.isArray(data.messages) ? (data.messages as AiThreadMessage[]) : [];
  return {
    id: row.id,
    title: typeof data.title === "string" && data.title.trim() ? data.title : "New AI Conversation",
    userId: row.userId || "",
    context: (data.context && typeof data.context === "object" ? data.context : undefined) as
      | AiPageContext
      | undefined,
    messages,
    createdAt: row.createdAt.toISOString(),
    updatedAt: typeof data.updatedAt === "string" ? data.updatedAt : row.createdAt.toISOString(),
  };
}

export async function listAiThreads(user: JwtPayload, limit = 25): Promise<
  Array<{
    id: string;
    title: string;
    messageCount: number;
    lastMessagePreview: string;
    context?: AiPageContext;
    updatedAt: string;
    createdAt: string;
  }>
> {
  const rows = await prisma.auditLog.findMany({
    where: {
      tableName: AI_THREAD_TABLE,
      action: AI_THREAD_ACTION,
      userId: user.userId,
    },
    orderBy: { createdAt: "desc" },
    take: Math.min(Math.max(limit, 1), 50),
  });

  return rows
    .map((row) => {
      const thread = mapAuditRowToThread(row);
      const lastMsg = thread.messages[thread.messages.length - 1];
      return {
        id: thread.id,
        title: thread.title,
        messageCount: thread.messages.length,
        lastMessagePreview: lastMsg ? lastMsg.content.slice(0, 120) : "",
        context: thread.context,
        updatedAt: thread.updatedAt,
        createdAt: thread.createdAt,
      };
    })
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
}

export async function getAiThread(user: JwtPayload, threadId: string): Promise<AiThreadRecord> {
  const row = await prisma.auditLog.findFirst({
    where: {
      id: threadId,
      tableName: AI_THREAD_TABLE,
      action: AI_THREAD_ACTION,
      userId: user.userId,
    },
  });

  if (!row) {
    throw new NotFoundError("AI conversation thread");
  }

  return mapAuditRowToThread(row);
}

export async function deleteAiThread(user: JwtPayload, threadId: string): Promise<{ deleted: true; id: string }> {
  const existing = await prisma.auditLog.findFirst({
    where: {
      id: threadId,
      tableName: AI_THREAD_TABLE,
      action: AI_THREAD_ACTION,
      userId: user.userId,
    },
    select: { id: true },
  });

  if (!existing) {
    throw new NotFoundError("AI conversation thread");
  }

  await prisma.auditLog.delete({ where: { id: existing.id } });
  return { deleted: true, id: existing.id };
}

export async function appendTurnToAiThread(
  user: JwtPayload,
  params: {
    threadId?: string;
    userMessage: string;
    assistantMessage: string;
    context?: AiPageContext;
    toolsUsed?: string[];
    citations?: AiCitation[];
    providerMode?: string;
  },
): Promise<AiThreadRecord> {
  const nowIso = new Date().toISOString();
  const userTurn: AiThreadMessage = {
    id: crypto.randomUUID(),
    role: "user",
    content: params.userMessage,
    createdAt: nowIso,
    context: params.context,
  };
  const assistantTurn: AiThreadMessage = {
    id: crypto.randomUUID(),
    role: "assistant",
    content: params.assistantMessage,
    createdAt: nowIso,
    toolsUsed: params.toolsUsed ?? [],
    citations: params.citations ?? [],
    providerMode: params.providerMode,
    context: params.context,
  };

  if (params.threadId) {
    const existing = await prisma.auditLog.findFirst({
      where: {
        id: params.threadId,
        tableName: AI_THREAD_TABLE,
        action: AI_THREAD_ACTION,
        userId: user.userId,
      },
    });

    if (existing) {
      const current = mapAuditRowToThread(existing);
      // Keep the most recent 40 messages in episodic thread memory
      const nextMessages = [...current.messages, userTurn, assistantTurn].slice(-40);
      const nextPayload = {
        title: current.title,
        context: params.context ?? current.context,
        messages: nextMessages,
        updatedAt: nowIso,
      };
      const updated = await prisma.auditLog.update({
        where: { id: existing.id },
        data: { newData: nextPayload as unknown as Prisma.InputJsonValue },
      });
      return mapAuditRowToThread(updated);
    }
  }

  const autoTitle =
    params.userMessage.trim().replace(/\s+/g, " ").slice(0, 64) || "EdBase AI Session";

  const created = await prisma.auditLog.create({
    data: {
      userId: user.userId,
      action: AI_THREAD_ACTION,
      tableName: AI_THREAD_TABLE,
      recordId: params.context?.studentId || params.context?.centerId || null,
      newData: {
        title: autoTitle,
        context: params.context,
        messages: [userTurn, assistantTurn],
        updatedAt: nowIso,
      } as unknown as Prisma.InputJsonValue,
    },
  });

  return mapAuditRowToThread(created);
}

// =============================================================================
// 2. LONG-TERM INSTITUTIONAL ENTITY MEMORY (STUDENT / CENTER / PROGRAM)
// =============================================================================

async function resolveAndAuthorizeEntityCenter(
  user: JwtPayload,
  entityType: AiEntityType,
  entityId: string,
): Promise<string | null> {
  if (entityType === "student") {
    const student = await prisma.student.findUnique({
      where: { id: entityId },
      select: { id: true, centerId: true },
    });
    if (!student) throw new NotFoundError("Student");
    if (user.role !== "parent") {
      assertCenterAccess(user, student.centerId, "No access to this student's AI memory");
    }
    return student.centerId;
  }

  if (entityType === "center") {
    const center = await prisma.center.findUnique({
      where: { id: entityId },
      select: { id: true },
    });
    if (!center) throw new NotFoundError("Center");
    assertCenterAccess(user, center.id, "No access to this center's AI memory");
    return center.id;
  }

  if (entityType === "program") {
    const program = await prisma.program.findUnique({
      where: { id: entityId },
      select: { id: true },
    });
    if (!program) throw new NotFoundError("Program");
    return null;
  }

  throw new ForbiddenError("Unsupported memory entity type");
}

function mapAuditRowToEntityMemory(row: {
  id: string;
  recordId: string | null;
  newData: unknown;
  createdAt: Date;
  user?: { id: string; fullName: string } | null;
}): AiEntityMemoryRecord {
  const data = (row.newData && typeof row.newData === "object" ? row.newData : {}) as Record<
    string,
    unknown
  >;
  return {
    id: row.id,
    entityType: (typeof data.entityType === "string" ? data.entityType : "student") as AiEntityType,
    entityId: row.recordId || (typeof data.entityId === "string" ? data.entityId : ""),
    centerId: typeof data.centerId === "string" ? data.centerId : null,
    category: typeof data.category === "string" ? data.category : "observation",
    summary: typeof data.summary === "string" ? data.summary : "",
    tags: Array.isArray(data.tags) ? data.tags.map(String).slice(0, 10) : [],
    metadata:
      data.metadata && typeof data.metadata === "object"
        ? (data.metadata as Record<string, unknown>)
        : undefined,
    createdByName: row.user?.fullName ?? (typeof data.createdByName === "string" ? data.createdByName : null),
    createdAt: row.createdAt.toISOString(),
  };
}

export async function saveEntityMemory(
  user: JwtPayload,
  input: {
    entityType: AiEntityType;
    entityId: string;
    category?: string;
    summary: string;
    tags?: string[];
    metadata?: Record<string, unknown>;
    skipCenterCheck?: boolean;
    centerIdOverride?: string | null;
  },
): Promise<AiEntityMemoryRecord> {
  const resolvedCenterId = input.skipCenterCheck
    ? (input.centerIdOverride ?? null)
    : await resolveAndAuthorizeEntityCenter(user, input.entityType, input.entityId);

  const created = await prisma.auditLog.create({
    data: {
      userId: user.userId,
      action: AI_ENTITY_MEMORY_ACTION,
      tableName: AI_ENTITY_MEMORY_TABLE,
      recordId: input.entityId,
      newData: {
        entityType: input.entityType,
        entityId: input.entityId,
        centerId: resolvedCenterId,
        category: input.category || "observation",
        summary: input.summary.trim().slice(0, 1500),
        tags: (input.tags ?? []).map((t) => t.trim()).filter(Boolean).slice(0, 10),
        metadata: input.metadata ?? {},
      } as unknown as Prisma.InputJsonValue,
    },
    include: {
      user: { select: { id: true, fullName: true } },
    },
  });

  return sanitizePayloadForAi(user, mapAuditRowToEntityMemory(created));
}

export async function getEntityMemories(
  user: JwtPayload,
  entityType: AiEntityType,
  entityId: string,
  limit = 15,
): Promise<AiEntityMemoryRecord[]> {
  await resolveAndAuthorizeEntityCenter(user, entityType, entityId);

  const rows = await prisma.auditLog.findMany({
    where: {
      tableName: AI_ENTITY_MEMORY_TABLE,
      action: AI_ENTITY_MEMORY_ACTION,
      recordId: entityId,
    },
    include: {
      user: { select: { id: true, fullName: true } },
    },
    orderBy: { createdAt: "desc" },
    take: Math.min(Math.max(limit, 1), 40),
  });

  const filtered = rows
    .map(mapAuditRowToEntityMemory)
    .filter((m) => m.entityType === entityType);

  return sanitizePayloadForAi(user, filtered);
}

// =============================================================================
// 3. HYBRID SEMANTIC + LEXICAL RAG RETRIEVER (STRICT CENTER-SCOPED)
// =============================================================================

const STOP_WORDS = new Set([
  "the", "and", "for", "with", "that", "this", "from", "are", "was", "were",
  "have", "has", "had", "what", "which", "who", "how", "about", "into", "their",
  "show", "give", "tell", "list", "find", "all", "can", "you", "please", "student",
  "students", "center", "centers", "program", "programs",
]);

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length >= 2 && !STOP_WORDS.has(t));
}

function computeLexicalScore(queryTokens: string[], rawQuery: string, docText: string): number {
  if (!queryTokens.length) return 0.15;
  const lowerDoc = docText.toLowerCase();
  const docTokens = tokenize(docText);
  if (!docTokens.length) return 0;

  const freq = new Map<string, number>();
  for (const tok of docTokens) {
    freq.set(tok, (freq.get(tok) || 0) + 1);
  }

  let matchedTerms = 0;
  let score = 0;
  for (const qt of queryTokens) {
    const exactCount = freq.get(qt) || 0;
    if (exactCount > 0) {
      matchedTerms += 1;
      // BM25-inspired diminishing term frequency saturation
      score += (exactCount * 2.2) / (exactCount + 1.2);
    } else if (lowerDoc.includes(qt)) {
      matchedTerms += 0.6;
      score += 0.55;
    }
  }

  // Exact phrase boost
  if (rawQuery.trim().length >= 4 && lowerDoc.includes(rawQuery.trim().toLowerCase())) {
    score += 2.0;
  }

  const coverage = matchedTerms / queryTokens.length;
  return Number((score * (0.5 + 0.5 * coverage)).toFixed(4));
}

function buildCenterPrismaFilter(
  user: JwtPayload,
  requestedCenterId?: string,
): string | { in: string[] } | undefined {
  if (requestedCenterId) {
    assertCenterAccess(user, requestedCenterId, "No access to requested center");
    return requestedCenterId;
  }
  const scoped = getScopedCenterIds(user);
  return scoped === undefined ? undefined : { in: scoped };
}

function displayStudentLabel(
  user: JwtPayload,
  student?: { id?: string; fullName?: string } | null,
): string {
  if (!student) return "Student";
  if (isPiiRestrictedRole(user.role)) {
    return maskStudentName(student.id, student.fullName);
  }
  return student.fullName || "Student";
}

/**
 * Retrieves qualitative, unstructured knowledge across EdBase tables using
 * strict center-scoping and hybrid (semantic embedding + lexical BM25) ranking.
 */
export async function searchKnowledgeBaseRag(
  user: JwtPayload,
  params: {
    query: string;
    centerId?: string;
    studentId?: string;
    sourceTypes?: string[];
    limit?: number;
  },
): Promise<{
  totalScanned: number;
  usedVectorEmbeddings: boolean;
  results: AiCitation[];
}> {
  const limit = Math.min(Math.max(params.limit || 8, 1), 20);
  const centerFilter = buildCenterPrismaFilter(user, params.centerId);
  const allowedSources = params.sourceTypes?.length ? new Set(params.sourceTypes) : null;

  const includeSource = (src: string) => !allowedSources || allowedSources.has(src);

  const studentWhere = params.studentId ? { studentId: params.studentId } : {};
  const centerWhere = centerFilter ? { centerId: centerFilter } : {};

  // Verify student center scope when targeting a specific student
  if (params.studentId) {
    const stu = await prisma.student.findUnique({
      where: { id: params.studentId },
      select: { id: true, centerId: true },
    });
    if (!stu) throw new NotFoundError("Student");
    if (user.role !== "parent") {
      assertCenterAccess(user, stu.centerId, "No access to this student's records");
    }
  }

  const [skillLogs, examScores, formSubs, activities, alerts, docRows, memoryRows] =
    await Promise.all([
      includeSource("skill_remark")
        ? prisma.studentSkillLog.findMany({
            where: {
              ...centerWhere,
              ...studentWhere,
              remarks: { not: null },
            },
            include: {
              student: { select: { id: true, fullName: true } },
              skill: { select: { name: true, maxLevel: true } },
              center: { select: { name: true } },
            },
            orderBy: { assessedOn: "desc" },
            take: 60,
          })
        : Promise.resolve([]),
      includeSource("exam_remark")
        ? prisma.examScore.findMany({
            where: {
              ...centerWhere,
              ...studentWhere,
              remarks: { not: null },
            },
            include: {
              student: { select: { id: true, fullName: true } },
              subject: { select: { name: true, maxMarks: true } },
              exam: { select: { name: true, examType: true, examDate: true } },
            },
            orderBy: { enteredAt: "desc" },
            take: 60,
          })
        : Promise.resolve([]),
      includeSource("form_submission") || includeSource("career_record")
        ? prisma.formSubmission.findMany({
            where: {
              ...centerWhere,
              ...studentWhere,
            },
            include: {
              template: { select: { name: true, formType: true } },
              student: { select: { id: true, fullName: true } },
            },
            orderBy: { submittedAt: "desc" },
            take: 60,
          })
        : Promise.resolve([]),
      includeSource("activity_note") && !params.studentId
        ? prisma.activity.findMany({
            where: {
              ...centerWhere,
              isActive: true,
            },
            include: {
              center: { select: { name: true } },
              program: { select: { name: true } },
            },
            orderBy: { updatedAt: "desc" },
            take: 40,
          })
        : Promise.resolve([]),
      includeSource("alert")
        ? prisma.alert.findMany({
            where: {
              ...centerWhere,
              ...studentWhere,
            },
            include: {
              student: { select: { id: true, fullName: true } },
              rule: { select: { metric: true } },
            },
            orderBy: { createdAt: "desc" },
            take: 40,
          })
        : Promise.resolve([]),
      includeSource("dossier_document")
        ? prisma.auditLog.findMany({
            where: {
              tableName: STUDENT_DOCUMENT_TABLE,
              action: STUDENT_DOCUMENT_ADD_ACTION,
              ...(params.studentId ? { recordId: params.studentId } : {}),
            },
            orderBy: { createdAt: "desc" },
            take: 40,
          })
        : Promise.resolve([]),
      includeSource("entity_memory")
        ? prisma.auditLog.findMany({
            where: {
              tableName: AI_ENTITY_MEMORY_TABLE,
              action: AI_ENTITY_MEMORY_ACTION,
              ...(params.studentId ? { recordId: params.studentId } : {}),
            },
            orderBy: { createdAt: "desc" },
            take: 40,
          })
        : Promise.resolve([]),
    ]);

  const chunks: RagChunk[] = [];
  const allowedCenterSet = isGlobalAdmin(user.role)
    ? null
    : new Set(Array.isArray(user.centerIds) ? user.centerIds : []);

  for (const log of skillLogs) {
    if (!log.remarks?.trim()) continue;
    const stuName = displayStudentLabel(user, log.student);
    chunks.push({
      id: `skill-${log.id}`,
      sourceType: "skill_remark",
      title: `${stuName} · Skill: ${log.skill?.name || "Skill"} (L${log.level}/${log.skill?.maxLevel || 5})`,
      text: `${stuName} at ${log.center?.name || "Center"} scored Level ${log.level}/${log.skill?.maxLevel || 5} in ${log.skill?.name || "Skill"}. Educator remarks: ${log.remarks}`,
      studentId: log.studentId,
      centerId: log.centerId,
      date: log.assessedOn.toISOString(),
    });
  }

  for (const score of examScores) {
    if (!score.remarks?.trim()) continue;
    const stuName = displayStudentLabel(user, score.student);
    chunks.push({
      id: `exam-${score.id}`,
      sourceType: "exam_remark",
      title: `${stuName} · ${score.exam?.name || "Exam"} (${score.subject?.name || "Subject"})`,
      text: `${stuName} ${score.exam?.examType || "exam"} ${score.subject?.name || "subject"} marks: ${score.marks ?? "N/A"}/${score.subject?.maxMarks ?? 100}. Remarks: ${score.remarks}`,
      studentId: score.studentId,
      centerId: score.centerId,
      date: (score.exam?.examDate ?? score.enteredAt).toISOString(),
    });
  }

  for (const sub of formSubs) {
    const dataObj = (sub.data && typeof sub.data === "object" ? sub.data : {}) as Record<
      string,
      unknown
    >;
    const serialized = Object.entries(dataObj)
      .filter(([, v]) => v !== null && v !== undefined && String(v).trim() !== "")
      .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(", ") : String(v)}`)
      .join(" | ");
    if (!serialized) continue;

    const isCareer = (sub.template?.name || "").toLowerCase().includes("career");
    const sourceType = isCareer ? "career_record" : "form_submission";
    if (!includeSource(sourceType)) continue;

    const stuName = displayStudentLabel(user, sub.student);
    chunks.push({
      id: `form-${sub.id}`,
      sourceType,
      title: `${stuName} · ${sub.template?.name || "Form Submission"}`,
      text: `${stuName} (${sub.template?.name || "Form"}): ${serialized}`,
      studentId: sub.studentId ?? undefined,
      centerId: sub.centerId,
      date: sub.submittedAt.toISOString(),
    });
  }

  for (const act of activities) {
    const details = [act.description, act.completionNotes].filter(Boolean).join(" · ");
    if (!details.trim()) continue;
    chunks.push({
      id: `act-${act.id}`,
      sourceType: "activity_note",
      title: `Activity: ${act.name} (${act.center?.name || "Center"})`,
      text: `Activity ${act.name} (${act.activityType}, status: ${act.status}) for ${act.program?.name || "All Programs"} at ${act.center?.name || "Center"}. ${details}`,
      centerId: act.centerId,
      date: (act.startDate ?? act.updatedAt).toISOString(),
    });
  }

  for (const alert of alerts) {
    const stuName = displayStudentLabel(user, alert.student);
    const sanitizedMessage = isPiiRestrictedRole(user.role)
      ? alert.message.replace(alert.student?.fullName || "__NO_MATCH__", stuName)
      : alert.message;
    chunks.push({
      id: `alert-${alert.id}`,
      sourceType: "alert",
      title: `Risk Alert (${alert.rule?.metric || "metric"}) · ${stuName}`,
      text: `${sanitizedMessage} (Status: ${alert.isRead ? "acknowledged" : "open"})`,
      studentId: alert.studentId ?? undefined,
      centerId: alert.centerId,
      date: alert.createdAt.toISOString(),
    });
  }

  // Filter AuditLog-backed Dossier Documents by student center ownership
  if (docRows.length > 0) {
    const docStudentIds = Array.from(
      new Set(docRows.map((d) => d.recordId).filter((id): id is string => Boolean(id))),
    );
    const docStudents = docStudentIds.length
      ? await prisma.student.findMany({
          where: { id: { in: docStudentIds } },
          select: { id: true, fullName: true, centerId: true },
        })
      : [];
    const docStudentMap = new Map(docStudents.map((s) => [s.id, s]));

    for (const row of docRows) {
      const stu = row.recordId ? docStudentMap.get(row.recordId) : undefined;
      if (!stu) continue;
      if (params.centerId && stu.centerId !== params.centerId) continue;
      if (allowedCenterSet && !allowedCenterSet.has(stu.centerId)) continue;

      const data = (row.newData && typeof row.newData === "object" ? row.newData : {}) as Record<
        string,
        unknown
      >;
      const title = typeof data.title === "string" ? data.title : "Student Document";
      const category = typeof data.category === "string" ? data.category : "other";
      const notes = typeof data.notes === "string" ? data.notes : "";
      const stuName = displayStudentLabel(user, stu);

      chunks.push({
        id: `doc-${row.id}`,
        sourceType: "dossier_document",
        title: `Dossier Document: ${title} (${category}) · ${stuName}`,
        text: `${stuName} uploaded document "${title}" (category: ${category}, file: ${String(data.fileName || "")}). ${notes}`,
        studentId: stu.id,
        centerId: stu.centerId,
        date: row.createdAt.toISOString(),
      });
    }
  }

  // Filter Entity Memories by center scope
  for (const row of memoryRows) {
    const mem = mapAuditRowToEntityMemory(row);
    if (params.centerId && mem.centerId && mem.centerId !== params.centerId) continue;
    if (allowedCenterSet && mem.centerId && !allowedCenterSet.has(mem.centerId)) continue;
    if (!mem.summary) continue;

    chunks.push({
      id: `mem-${mem.id}`,
      sourceType: "entity_memory",
      title: `Institutional Memory (${mem.entityType} · ${mem.category})`,
      text: `${mem.summary}${mem.tags.length ? ` [Tags: ${mem.tags.join(", ")}]` : ""}`,
      studentId: mem.entityType === "student" ? mem.entityId : undefined,
      centerId: mem.centerId ?? undefined,
      date: mem.createdAt,
    });
  }

  // Hybrid ranking: Lexical BM25 first, then semantic vector re-ranking on top candidates if Gemini embeddings are available
  const queryTokens = tokenize(params.query);
  const scoredLexical = chunks.map((chunk) => ({
    chunk,
    lexical: computeLexicalScore(queryTokens, params.query, `${chunk.title} ${chunk.text}`),
  }));

  scoredLexical.sort((a, b) => b.lexical - a.lexical);

  // Re-rank top 18 lexical candidates with vector embeddings when GEMINI_API_KEY is available
  let usedVectorEmbeddings = false;
  const topCandidates = scoredLexical.slice(0, 18);
  const queryEmbedding = params.query.trim() ? await generateTextEmbedding(params.query) : null;

  const finalScored = await Promise.all(
    topCandidates.map(async (item) => {
      let semantic = 0;
      if (queryEmbedding) {
        const docEmb = await generateTextEmbedding(`${item.chunk.title}. ${item.chunk.text}`);
        if (docEmb) {
          usedVectorEmbeddings = true;
          semantic = Math.max(0, cosineSimilarity(queryEmbedding, docEmb));
        }
      }
      const combinedScore = queryEmbedding
        ? Number((semantic * 0.65 + Math.min(item.lexical / 5, 1) * 0.35).toFixed(4))
        : item.lexical;

      return {
        ...item,
        combinedScore,
      };
    }),
  );

  finalScored.sort((a, b) => b.combinedScore - a.combinedScore);

  const results: AiCitation[] = finalScored
    .filter((item) => item.combinedScore > 0 || !params.query.trim())
    .slice(0, limit)
    .map((item) => ({
      sourceType: item.chunk.sourceType,
      title: item.chunk.title,
      snippet: item.chunk.text.slice(0, 320),
      entityId: item.chunk.id,
      studentId: item.chunk.studentId,
      centerId: item.chunk.centerId,
      date: item.chunk.date,
      score: item.combinedScore,
    }));

  return {
    totalScanned: chunks.length,
    usedVectorEmbeddings,
    results: sanitizePayloadForAi(user, results),
  };
}
