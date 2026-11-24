import type { JwtPayload } from "../../utils/jwt.js";
import * as studentService from "../student.service.js";
import * as studentDossierService from "../studentDossierService.js";
import * as skillService from "../skillService.js";
import {
  generateGeminiStructuredJson,
  getAiProviderStatus,
  runGeminiToolTurn,
  type AiProviderMode,
} from "./llmProvider.js";
import {
  appendTurnToAiThread,
  getAiThread,
  getEntityMemories,
  saveEntityMemory,
  type AiCitation,
  type AiEntityMemoryRecord,
  type AiPageContext,
} from "./memoryEngine.js";
import {
  assertStaffAiChatAccess,
  assertStudentAiAccess,
  sanitizePayloadForAi,
} from "./piiGuard.js";
import {
  executeRegisteredTool,
  getRegisteredToolDefinitions,
  UNIVERSAL_AI_TOOLS,
} from "./toolRegistry.js";

// =============================================================================
// STRUCTURED OUTPUT TYPES
// =============================================================================

export interface Student360BriefingResult {
  studentId: string;
  studentName: string;
  generatedAt: string;
  providerMode: AiProviderMode;
  readinessStatus: "thriving" | "steady" | "needs_support" | "high_priority";
  executiveSummary: string;
  academicTrajectory: {
    headline: string;
    strengths: string[];
    growthAreas: string[];
    momentumNotes: string;
  };
  skillAndBehavioralSynthesis: string;
  riskSignalsAndAttendance: string;
  staffNextSteps: Array<{
    priority: "high" | "medium" | "low";
    action: string;
    ownerRole: string;
    timeline: string;
  }>;
  parentNarrative: {
    english: string;
    hindi: string;
    marathi: string;
  };
  memoriesReferenced: number;
}

export interface CareerUpskillingPlaybookResult {
  studentId: string;
  studentName: string;
  programName: string;
  generatedAt: string;
  providerMode: AiProviderMode;
  learnerDiagnosis: {
    summary: string;
    topStrengths: string[];
    prioritySkillGaps: string[];
    academicReadinessLevel: "foundational" | "developing" | "career_ready";
  };
  recommendedPathways: Array<{
    careerGoal: string;
    industry: string;
    fitScore: number;
    rationale: string;
    targetMilestones: string[];
    suggestedNotes: string;
  }>;
  staffUpskillingProcedure: {
    phase30Days: {
      title: string;
      objective: string;
      staffSteps: string[];
    };
    phase60Days: {
      title: string;
      objective: string;
      staffSteps: string[];
    };
    phase90Days: {
      title: string;
      objective: string;
      staffSteps: string[];
    };
  };
  recommendedSkillDrills: Array<{
    skillName: string;
    currentLevel: number;
    targetLevel: number;
    staffFacilitationProcedure: string;
    frequency: string;
  }>;
  memoriesReferenced: number;
}

export interface OrchestratorChatResponse {
  threadId: string;
  reply: string;
  providerMode: AiProviderMode;
  toolsUsed: string[];
  citations: AiCitation[];
  suggestedFollowUps: string[];
  memoryContextCount: number;
}

// =============================================================================
// HELPERS: CONTEXT & DETERMINISTIC SYNTHESIZERS
// =============================================================================

function computeAgeFromDob(dob?: Date | string | null): number | null {
  if (!dob) return null;
  const parsed = new Date(dob);
  if (Number.isNaN(parsed.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - parsed.getFullYear();
  const m = now.getMonth() - parsed.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < parsed.getDate())) {
    age--;
  }
  return age >= 0 && age <= 100 ? age : null;
}

function buildFollowUpSuggestions(
  message: string,
  context?: AiPageContext,
  toolsUsed: string[] = [],
): string[] {
  if (context?.studentId) {
    return [
      "What 30-day upskilling steps should staff take next for this student?",
      "Summarize any skill assessment remarks or risk alerts for this student.",
      "Draft a supportive progress update I can share with their parent.",
    ];
  }
  if (toolsUsed.includes("get_skills_and_matrix_analytics")) {
    return [
      "Which students have the lowest attendance or exam scores right now?",
      "Search educator skill remarks for common Spoken English or Computing bottlenecks.",
      "Compare Baseline vs Endline exam improvement across subjects.",
    ];
  }
  if (message.toLowerCase().includes("exam") || message.toLowerCase().includes("score")) {
    return [
      "Show me students scoring below 50% who need remedial mentoring.",
      "Summarize our cohort skill proficiency gaps.",
      "Check open early-warning attendance and exam alerts.",
    ];
  }
  return [
    "Give me an overview of attendance and student counts across my centers.",
    "Which students have attendance below 75% or open risk alerts?",
    "Compare Baseline vs Endline exam progress and top skill gaps.",
  ];
}

/**
 * Deterministic multi-tool plan when Gemini API key is not configured or unavailable.
 * Still executes real RBAC-scoped Prisma tools and synthesizes rich markdown grounded in live DB data.
 */
async function executeDeterministicChatFallback(
  user: JwtPayload,
  message: string,
  context: AiPageContext | undefined,
  entityMemories: AiEntityMemoryRecord[],
): Promise<{
  reply: string;
  toolsUsed: string[];
  citations: AiCitation[];
}> {
  const lower = message.toLowerCase();
  const toolsUsed: string[] = [];
  const citations: AiCitation[] = [];
  const sections: string[] = [];

  const runTool = async (name: string, args: Record<string, unknown>) => {
    const res = await executeRegisteredTool(user, name, args);
    toolsUsed.push(name);
    if (res.citations.length) citations.push(...res.citations);
    return res;
  };

  // 1. Save-to-memory explicit intent
  if ((lower.startsWith("remember") || lower.includes("save to memory") || lower.includes("note that")) && (context?.studentId || context?.centerId)) {
    const targetType = context?.studentId ? "student" : "center";
    const targetId = (context?.studentId || context?.centerId)!;
    const saved = await runTool("remember_entity_insight", {
      entityType: targetType,
      entityId: targetId,
      summary: message.replace(/^remember\s*(that)?\s*/i, "").trim() || message,
      tags: ["staff-note", "ai-copilot"],
    });
    if (saved.ok) {
      sections.push(
        `### Memory Saved\nI have stored this observation in institutional memory for this **${targetType}** so future briefings and staff queries will incorporate it.`,
      );
    }
  }

  // 2. Active Student Context
  if (context?.studentId) {
    const res = await runTool("get_student_360_dossier", { studentId: context.studentId });
    if (res.ok && res.data && typeof res.data === "object") {
      const payload = res.data as any;
      const stu = payload.profile?.student;
      const stats = payload.profile?.stats;
      const examComp = (payload.profile?.examComparison || []) as any[];
      const radar = (payload.profile?.skillRadar || []) as any[];
      const careers = (payload.profile?.careers || []) as any[];

      const name = stu?.fullName || "Selected Student";
      const lines = [
        `### 360° Academic & Development Snapshot — ${name}`,
        `- **Program & Center:** ${stu?.program?.name || "Unassigned"} · ${stu?.center?.name || "Center"}`,
        `- **Attendance:** ${stats?.attendancePct ?? 0}% (${stats?.presentCount ?? 0}/${stats?.totalSessions ?? 0} sessions)`,
        `- **Average Exam Score:** ${stats?.avgExamPct != null ? `${stats.avgExamPct}%` : "No exam scores yet"}`,
        `- **Skill Average:** ${stats?.skillScore != null ? `${stats.skillScore}/5` : "No skill logs yet"}`,
      ];

      if (examComp.length > 0) {
        const subjectSummary = examComp
          .slice(0, 5)
          .map((e) => {
            const b = e.baseline != null ? `${e.baseline}%` : "—";
            const end = e.endline != null ? `${e.endline}%` : "—";
            return `**${e.subject}** (Baseline: ${b} → Endline: ${end})`;
          })
          .join(", ");
        lines.push(`- **Subject Progression:** ${subjectSummary}`);
      }

      if (radar.length > 0) {
        const sortedSkills = [...radar].sort((a, b) => a.score - b.score);
        const lowest = sortedSkills[0];
        const highest = sortedSkills[sortedSkills.length - 1];
        lines.push(
          `- **Skill Signals:** Strongest in **${highest.skill}** (${highest.score}/${highest.maxLevel || 5}); highest growth opportunity in **${lowest.skill}** (${lowest.score}/${lowest.maxLevel || 5}).`,
        );
      }

      if (careers.length > 0) {
        lines.push(
          `- **Recorded Career Goal:** ${careers[0].careerGoal || careers[0].title || "Logged"} (${careers[0].industry || "General"})`,
        );
      }

      sections.push(lines.join("\n"));
    }
  }

  // 3. Intent-based tool selection across all EdBase modules
  const asksOverview =
    lower.includes("overview") ||
    lower.includes("summary") ||
    lower.includes("dashboard") ||
    lower.includes("how many") ||
    lower.includes("center") ||
    lower.includes("fee");
  const asksExams =
    lower.includes("exam") ||
    lower.includes("score") ||
    lower.includes("baseline") ||
    lower.includes("endline") ||
    lower.includes("academic") ||
    lower.includes("subject") ||
    lower.includes("math") ||
    lower.includes("english") ||
    lower.includes("science");
  const asksSkills =
    lower.includes("skill") ||
    lower.includes("upskill") ||
    lower.includes("career") ||
    lower.includes("speaking") ||
    lower.includes("computing") ||
    lower.includes("typing") ||
    lower.includes("develop");
  const asksAttendanceOrRisk =
    lower.includes("attendance") ||
    lower.includes("absent") ||
    lower.includes("alert") ||
    lower.includes("risk") ||
    lower.includes("drop") ||
    lower.includes("struggling") ||
    lower.includes("support");
  const asksStudents =
    lower.includes("student") ||
    lower.includes("list") ||
    lower.includes("who") ||
    lower.includes("below");

  if (asksOverview || (!context?.studentId && !asksExams && !asksSkills && !asksAttendanceOrRisk)) {
    const res = await runTool("get_institution_overview", {});
    if (res.ok && res.data && typeof res.data === "object") {
      const d = res.data as any;
      const centerLines = (d.centerBreakdown || [])
        .slice(0, 6)
        .map((c: any) => `  - **${c.name}**: ${c.studentCount} students · ${c.attendanceRate}% attendance`)
        .join("\n");
      sections.push(
        [
          `### Institutional Operations Overview`,
          `- **Active Learners:** ${d.totalStudents} across **${d.totalCenters}** authorized center(s) (+${d.newStudentsThisMonth} enrolled this month)`,
          `- **30-Day Attendance Rate:** ${d.overallAttendanceRate}% (${d.pendingAttendanceToday} pending session(s) today)`,
          `- **Fee Collection:** ${d.feeSummary?.collectionPct ?? 0}% collected (₹${Number(d.feeSummary?.totalCollected ?? 0).toLocaleString()} / ₹${Number(d.feeSummary?.totalAssigned ?? 0).toLocaleString()})`,
          centerLines ? `- **Center Breakdown:**\n${centerLines}` : "",
        ]
          .filter(Boolean)
          .join("\n"),
      );
    }
  }

  if (asksExams) {
    const res = await runTool("get_exam_analytics", {
      centerId: context?.centerId,
      programId: context?.programId,
    });
    if (res.ok && res.data && typeof res.data === "object") {
      const d = res.data as any;
      const subjects = Object.keys(d.improvement || {});
      if (subjects.length > 0) {
        const rows = subjects
          .map(
            (sub) =>
              `- **${sub.toUpperCase()}**: Baseline avg **${d.baseline?.[sub]?.avg ?? 0}** → Endline avg **${d.endline?.[sub]?.avg ?? 0}** (${d.improvement[sub] >= 0 ? "+" : ""}${d.improvement[sub]} pts)`,
          )
          .join("\n");
        sections.push(`### Baseline → Endline Exam Performance (${d.academicYear})\n${rows}`);
      }
    }
  }

  if (asksSkills) {
    const res = await runTool("get_skills_and_matrix_analytics", {
      centerId: context?.centerId,
      programId: context?.programId,
    });
    if (res.ok && res.data && typeof res.data === "object") {
      const d = res.data as any;
      const prof = (d.skillProficiency || []) as any[];
      if (prof.length > 0) {
        const lowest = [...prof].sort((a, b) => a.averagePct - b.averagePct);
        const rows = lowest
          .slice(0, 6)
          .map(
            (sk) =>
              `- **${sk.skillName}**: Avg Level **${sk.averageLevel}/${sk.maxLevel}** (${sk.averagePct}% · ${sk.sampleSize} assessments)`,
          )
          .join("\n");
        sections.push(
          `### Skill Proficiency & Upskilling Priorities\n${rows}\n\n**Staff Action Guidance:** Prioritize structured weekly micro-drills for **${lowest[0].skillName}** (currently lowest at ${lowest[0].averageLevel}/${lowest[0].maxLevel}) and log follow-up assessments in the Skill Matrix every 30 days.`,
        );
      }
    }
  }

  if (asksAttendanceOrRisk) {
    const res = await runTool("get_attendance_and_alerts", {
      centerId: context?.centerId,
      programId: context?.programId,
    });
    if (res.ok && res.data && typeof res.data === "object") {
      const d = res.data as any;
      const lowList = (d.lowestAttendanceStudents || []).slice(0, 5);
      const alertList = (d.recentOpenAlerts || []).slice(0, 5);
      const lines = [
        `### Attendance & Early-Warning Risk Signals (${d.period?.from} to ${d.period?.to})`,
        `- **Average Attendance:** ${d.attendanceSummary?.averageAttendanceRate ?? 0}% across ${d.attendanceSummary?.totalSessions ?? 0} sessions`,
        `- **Open Risk Alerts:** ${d.openAlertsCount ?? 0}`,
      ];
      if (lowList.length > 0) {
        lines.push(
          `- **Lowest Attendance Learners:** ${lowList.map((s: any) => `${s.fullName} (${s.rate}%)`).join(", ")}`,
        );
      }
      if (alertList.length > 0) {
        lines.push(
          `- **Priority Alerts:**\n${alertList.map((a: any) => `  - ${a.message}`).join("\n")}`,
        );
      }
      sections.push(lines.join("\n"));
    }
  }

  if (asksStudents && !context?.studentId && (lower.includes("below") || lower.includes("low") || lower.includes("at-risk") || lower.includes("struggling"))) {
    const res = await runTool("query_students", {
      centerId: context?.centerId,
      programId: context?.programId,
      attendanceRateMax: lower.includes("attendance") ? 75 : undefined,
      examScoreMax: lower.includes("exam") || lower.includes("score") ? 50 : undefined,
      limit: 10,
    });
    if (res.ok && res.data && typeof res.data === "object") {
      const d = res.data as any;
      const list = (d.students || []) as any[];
      if (list.length > 0) {
        const rows = list
          .slice(0, 8)
          .map(
            (s) =>
              `- **${s.fullName}** (${s.centerName} · ${s.programName || "Program"}): Attendance **${s.attendanceRate}%**, Avg Exam **${s.avgExamScore}%**`,
          )
          .join("\n");
        sections.push(`### Matching Learners Requiring Attention (${d.totalMatched} total)\n${rows}`);
      }
    }
  }

  // 4. Always run Hybrid RAG over qualitative notes, remarks, career records, and memories
  const ragRes = await runTool("search_qualitative_knowledge_rag", {
    query: message,
    centerId: context?.centerId,
    studentId: context?.studentId,
    limit: 5,
  });
  if (ragRes.ok && ragRes.data && typeof ragRes.data === "object") {
    const r = ragRes.data as { results?: AiCitation[]; totalScanned?: number };
    if (r.results && r.results.length > 0) {
      const bullets = r.results
        .slice(0, 4)
        .map((c) => `- **${c.title}**: ${c.snippet}`)
        .join("\n");
      sections.push(`### Qualitative Notes & Knowledge Matches (Hybrid RAG)\n${bullets}`);
    }
  }

  if (entityMemories.length > 0) {
    sections.push(
      `### Remembered Institutional Context (${entityMemories.length} note(s))\n` +
        entityMemories
          .slice(0, 3)
          .map((m) => `- *(${m.category})* ${m.summary}`)
          .join("\n"),
    );
  }

  const reply =
    sections.length > 0
      ? sections.join("\n\n")
      : "I checked your authorized EdBase records, but there isn't enough matching data for that specific query yet. Try asking about center attendance, Baseline vs. Endline exam deltas, cohort skill gaps, or open a student's profile for a 360° academic & career analysis.";

  return { reply, toolsUsed, citations };
}

// =============================================================================
// 1. UNIVERSAL CHAT ORCHESTRATOR (REACT TOOL LOOP + EPISODIC/ENTITY MEMORY)
// =============================================================================

export async function orchestrateChat(
  user: JwtPayload,
  input: {
    message: string;
    threadId?: string;
    context?: AiPageContext;
  },
): Promise<OrchestratorChatResponse> {
  assertStaffAiChatAccess(user);

  const trimmedMessage = input.message.trim();
  const providerStatus = getAiProviderStatus();

  // Load episodic history if continuing an existing thread
  let priorMessages: Array<{ role: "user" | "assistant"; content: string }> = [];
  if (input.threadId) {
    try {
      const existing = await getAiThread(user, input.threadId);
      priorMessages = existing.messages.slice(-10).map((m) => ({
        role: m.role,
        content: m.content,
      }));
    } catch {
      // Ignore invalid threadId and start fresh
    }
  }

  // Pre-load long-term entity memory if user is viewing a specific student or center
  let entityMemories: AiEntityMemoryRecord[] = [];
  if (input.context?.studentId) {
    try {
      entityMemories = await getEntityMemories(user, "student", input.context.studentId, 6);
    } catch {
      entityMemories = [];
    }
  } else if (input.context?.centerId) {
    try {
      entityMemories = await getEntityMemories(user, "center", input.context.centerId, 6);
    } catch {
      entityMemories = [];
    }
  }

  const toolsUsed = new Set<string>();
  const citations: AiCitation[] = [];
  let finalReply = "";
  let activeMode: AiProviderMode = providerStatus.mode;

  if (providerStatus.hasApiKey) {
    const contextSummary = [
      `Authenticated User Role: ${user.role}`,
      `Current UI Route: ${input.context?.route || "global"}`,
      input.context?.studentId ? `Active Student ID in View: ${input.context.studentId}` : null,
      input.context?.centerId ? `Active Center ID in View: ${input.context.centerId}` : null,
      input.context?.programId ? `Active Program ID in View: ${input.context.programId}` : null,
      entityMemories.length > 0
        ? `Prior Institutional Entity Memories:\n${entityMemories
            .map((m) => `- [${m.category} · ${m.createdAt.slice(0, 10)}] ${m.summary}`)
            .join("\n")}`
        : null,
    ]
      .filter(Boolean)
      .join("\n");

    const systemInstruction = `You are the Universal AI Academic & Operations Orchestrator for EdBase (SPARSHA NGO Student Management System).
You have live access to every component of the application via function-calling tools: institutional dashboards, student academic rosters, 360-degree student dossiers, Baseline/Midline/Endline exams, 1-5 skill matrices, attendance trends, risk alerts, hybrid qualitative RAG over educator remarks/forms/documents, and institutional memory.

Core Guidelines:
1. Always ground answers in real data fetched via tools—never invent student scores, attendance numbers, or remarks.
2. When a Student ID is in the active UI context and the user asks about "this student" or "their progress", immediately call \`get_student_360_dossier\`.
3. When asked about staff guidance, upskilling procedures, or child development, combine quantitative data (exam deltas & skill levels) with concrete, step-by-step pedagogical procedures tailored to Indian NGO learning centers (Programs: SHIKSHA ages 3-6, SWAYAM ages 15-18, UDAY vocational 18-30, KUSUM empowerment 18-45).
4. If the staff asks you to remember an observation or plan for a student/center, call \`remember_entity_insight\`.
5. Keep responses crisp, structured with clean Markdown headings and bullet points, and directly actionable for teachers and center admins.

${contextSummary}`;

    const contents: Array<Record<string, unknown>> = [
      ...priorMessages.map((m) => ({
        role: m.role === "assistant" ? "model" : "user",
        parts: [{ text: m.content }],
      })),
      {
        role: "user",
        parts: [{ text: trimmedMessage }],
      },
    ];

    const toolDefs = getRegisteredToolDefinitions();
    const MAX_HOPS = 4;
    let geminiSucceeded = false;

    for (let hop = 0; hop < MAX_HOPS; hop++) {
      const turn = await runGeminiToolTurn({
        systemInstruction,
        contents,
        tools: toolDefs,
      });

      if (!turn) {
        activeMode = "deterministic-synthesizer";
        break;
      }

      if (turn.functionCalls.length === 0) {
        finalReply = turn.text;
        geminiSucceeded = Boolean(finalReply);
        break;
      }

      if (turn.modelContent) {
        contents.push(turn.modelContent);
      } else {
        contents.push({
          role: "model",
          parts: turn.functionCalls.map((fc) => ({
            functionCall: { name: fc.name, args: fc.args },
          })),
        });
      }

      const functionResponseParts: Array<Record<string, unknown>> = [];
      for (const call of turn.functionCalls) {
        toolsUsed.add(call.name);
        const execResult = await executeRegisteredTool(user, call.name, call.args);
        if (execResult.citations.length > 0) {
          citations.push(...execResult.citations);
        }
        functionResponseParts.push({
          functionResponse: {
            name: call.name,
            response: {
              ok: execResult.ok,
              result: execResult.data,
            },
          },
        });
      }

      contents.push({
        role: "user",
        parts: functionResponseParts,
      });
    }

    if (!geminiSucceeded) {
      activeMode = "deterministic-synthesizer";
    }
  }

  if (!finalReply) {
    const fallback = await executeDeterministicChatFallback(
      user,
      trimmedMessage,
      input.context,
      entityMemories,
    );
    finalReply = fallback.reply;
    for (const t of fallback.toolsUsed) toolsUsed.add(t);
    citations.push(...fallback.citations);
  }

  // Deduplicate citations by title
  const dedupedCitations: AiCitation[] = [];
  const seenCit = new Set<string>();
  for (const c of citations) {
    const key = `${c.sourceType}:${c.title}`;
    if (!seenCit.has(key)) {
      seenCit.add(key);
      dedupedCitations.push(c);
    }
  }

  const toolsArray = Array.from(toolsUsed);

  const savedThread = await appendTurnToAiThread(user, {
    threadId: input.threadId,
    userMessage: trimmedMessage,
    assistantMessage: finalReply,
    context: input.context,
    toolsUsed: toolsArray,
    citations: dedupedCitations.slice(0, 10),
    providerMode: activeMode,
  });

  return {
    threadId: savedThread.id,
    reply: finalReply,
    providerMode: activeMode,
    toolsUsed: toolsArray,
    citations: dedupedCitations.slice(0, 10),
    suggestedFollowUps: buildFollowUpSuggestions(trimmedMessage, input.context, toolsArray),
    memoryContextCount: entityMemories.length,
  };
}

// =============================================================================
// 2. 360° STUDENT ACADEMIC INTELLIGENCE & MULTILINGUAL PARENT NARRATIVE
// =============================================================================

export async function generateStudent360Briefing(
  user: JwtPayload,
  studentId: string,
): Promise<Student360BriefingResult> {
  await assertStudentAiAccess(user, studentId);

  const [profile, dossier, skills, memories] = await Promise.all([
    studentService.getStudentProfile(user, studentId),
    studentDossierService.getStudentDossier(user, studentId),
    skillService.getSkillsByStudent(user, studentId),
    getEntityMemories(user, "student", studentId, 8),
  ]);

  const sanitizedBundle = sanitizePayloadForAi(user, {
    student: profile.student,
    stats: profile.stats,
    examComparison: profile.examComparison,
    skillRadar: profile.skillRadar,
    recentSkillLogs: skills.slice(0, 12).map((s) => ({
      skill: s.skill?.name,
      level: s.level,
      maxLevel: s.skill?.maxLevel || 5,
      remarks: s.remarks,
      assessedOn: s.assessedOn,
    })),
    careers: profile.careers,
    dossierSummary: dossier.summary,
    recentAlerts: dossier.timeline.filter((t) => t.type === "alert").slice(0, 5),
    documentsCount: dossier.documents.length,
    priorMemories: memories.map((m) => ({
      category: m.category,
      summary: m.summary,
      date: m.createdAt,
    })),
  });

  const safeStudentName = sanitizedBundle.student.fullName || "Student";
  const attendancePct = Number(profile.stats.attendancePct ?? 0);
  const avgExamPct = profile.stats.avgExamPct;
  const skillScore = profile.stats.skillScore;
  const age = computeAgeFromDob(profile.student.dob);

  const openAlerts = dossier.timeline.filter(
    (t) => t.type === "alert" && t.badge === "Open Alert",
  );

  // Compute deterministic analytics baseline (also serves as graceful fallback)
  const subjectDeltas = (profile.examComparison || []).map((e) => ({
    subject: e.subject,
    baseline: e.baseline,
    midline: e.midline,
    endline: e.endline,
    latest: e.endline ?? e.midline ?? e.baseline ?? null,
    delta: e.baseline != null && e.endline != null ? Number((e.endline - e.baseline).toFixed(1)) : null,
  }));

  const strengths = subjectDeltas
    .filter((s) => (s.latest ?? 0) >= 65 || (s.delta ?? 0) >= 10)
    .map((s) => `${s.subject} (${s.latest != null ? `${s.latest}%` : "improving"}${s.delta != null ? `, ${s.delta >= 0 ? "+" : ""}${s.delta}% vs baseline` : ""})`);

  const growthAreas = subjectDeltas
    .filter((s) => s.latest != null && s.latest < 55)
    .map((s) => `${s.subject} (${s.latest}%)`);

  const sortedSkills = [...(profile.skillRadar || [])].sort((a, b) => a.score - b.score);
  const weakSkills = sortedSkills.filter((s) => s.score <= 2);
  const strongSkills = sortedSkills.filter((s) => s.score >= 4);

  let readinessStatus: Student360BriefingResult["readinessStatus"] = "steady";
  if (attendancePct < 65 || openAlerts.length >= 2 || (avgExamPct !== null && avgExamPct < 40)) {
    readinessStatus = "high_priority";
  } else if (attendancePct < 80 || (avgExamPct !== null && avgExamPct < 55) || weakSkills.length >= 2) {
    readinessStatus = "needs_support";
  } else if (attendancePct >= 85 && (avgExamPct === null || avgExamPct >= 70) && (skillScore === null || skillScore >= 3.5)) {
    readinessStatus = "thriving";
  }

  const deterministicResult: Student360BriefingResult = {
    studentId,
    studentName: safeStudentName,
    generatedAt: new Date().toISOString(),
    providerMode: "deterministic-synthesizer",
    readinessStatus,
    executiveSummary: `${safeStudentName} (${profile.student.program?.name || "Enrolled Program"}${age ? `, age ${age}` : ""} at ${profile.student.center?.name || "Center"}) currently shows ${readinessStatus.replace("_", " ")} momentum with ${attendancePct}% attendance${avgExamPct != null ? `, ${avgExamPct}% average exam score` : ""}${skillScore != null ? `, and ${skillScore}/5 average skill proficiency` : ""}.`,
    academicTrajectory: {
      headline:
        avgExamPct != null
          ? `Overall exam average is ${avgExamPct}% across ${subjectDeltas.length} tracked subject(s).`
          : "Baseline and term exam records are still being populated for this learner.",
      strengths:
        strengths.length > 0
          ? strengths
          : strongSkills.map((s) => `${s.skill} (Level ${s.score}/${s.maxLevel || 5})`),
      growthAreas:
        growthAreas.length > 0
          ? growthAreas
          : weakSkills.map((s) => `${s.skill} (Level ${s.score}/${s.maxLevel || 5})`),
      momentumNotes:
        subjectDeltas.some((s) => s.delta != null)
          ? subjectDeltas
              .filter((s) => s.delta != null)
              .map((s) => `${s.subject}: ${s.delta! >= 0 ? "+" : ""}${s.delta}%`)
              .join(" · ")
          : "Record both Baseline and Endline assessments to unlock automated subject-delta velocity tracking.",
    },
    skillAndBehavioralSynthesis:
      sortedSkills.length > 0
        ? `Assessed across ${sortedSkills.length} competency area(s). Top capability: ${sortedSkills[sortedSkills.length - 1].skill} (L${sortedSkills[sortedSkills.length - 1].score}). Priority upskilling area: ${sortedSkills[0].skill} (L${sortedSkills[0].score}).`
        : "No qualitative skill logs recorded yet. Schedule an initial Skill Matrix baseline evaluation.",
    riskSignalsAndAttendance:
      openAlerts.length > 0
        ? `${openAlerts.length} open early-warning alert(s) detected alongside ${attendancePct}% attendance. Latest alert: ${openAlerts[0].title}`
        : attendancePct < 75
          ? `Attendance is at ${attendancePct}%, which is below the 75% continuity benchmark. Proactive guardian check-in recommended.`
          : `Attendance is healthy at ${attendancePct}% with no unresolved early-warning alerts.`,
    staffNextSteps: [
      ...(attendancePct < 75 || openAlerts.length > 0
        ? [
            {
              priority: "high" as const,
              action: "Conduct a supportive guardian phone call or home check-in to identify attendance barriers and stabilize weekly presence.",
              ownerRole: "Center Admin / Teacher",
              timeline: "Within 48 hours",
            },
          ]
        : []),
      ...(growthAreas.length > 0
        ? [
            {
              priority: "high" as const,
              action: `Assign 2 weekly guided remedial practice blocks targeting ${growthAreas.slice(0, 2).join(" and ")} using peer-learning worksheets.`,
              ownerRole: "Subject Teacher",
              timeline: "Next 2 weeks",
            },
          ]
        : []),
      ...(weakSkills.length > 0
        ? [
            {
              priority: "medium" as const,
              action: `Run structured micro-practice drills for ${weakSkills[0].skill} to move from Level ${weakSkills[0].score} to Level ${Math.min(5, weakSkills[0].score + 1)} before the next assessment cycle.`,
              ownerRole: "Skill Mentor",
              timeline: "Next 30 days",
            },
          ]
        : [
            {
              priority: "medium" as const,
              action: "Conduct a 15-minute goal-setting check-in and update the learner's Career Pathways milestones.",
              ownerRole: "Teacher / Counselor",
              timeline: "This month",
            },
          ]),
    ],
    parentNarrative: {
      english: `Dear Parent/Guardian, we are pleased to share ${safeStudentName}'s progress at ${profile.student.center?.name || "our learning center"}. ${safeStudentName} has maintained ${attendancePct}% attendance${avgExamPct != null ? ` and an average exam score of ${avgExamPct}%` : ""}. ${strongSkills.length > 0 ? `They are showing strong confidence in ${strongSkills[0].skill}. ` : ""}${growthAreas.length > 0 ? `With regular practice at home and our extra support in ${growthAreas[0]}, they will continue growing steadily.` : "We encourage continued daily attendance and curiosity at home."}`,
      hindi: `प्रिय अभिभावक, हमें ${profile.student.center?.name || "केंद्र"} में ${safeStudentName} की प्रगति साझा करते हुए खुशी हो रही है। ${safeStudentName} की उपस्थिति ${attendancePct}% रही है${avgExamPct != null ? ` और परीक्षाओं में औसत अंक ${avgExamPct}% रहे हैं` : ""}। ${strongSkills.length > 0 ? `वे ${strongSkills[0].skill} में बहुत अच्छा प्रदर्शन कर रहे हैं। ` : ""}${growthAreas.length > 0 ? `घर पर नियमित अभ्यास और ${growthAreas[0]} में हमारे मार्गदर्शन से वे और भी बेहतर प्रगति करेंगे।` : "हम नियमित उपस्थिति और घर पर पढ़ाई के लिए आपके सहयोग की सराहना करते हैं।"}`,
      marathi: `प्रिय पालक, ${profile.student.center?.name || "केंद्रा"}मधील ${safeStudentName} ची प्रगती आपल्यासोबत शेअर करताना आम्हाला आनंद होत आहे. ${safeStudentName} ची उपस्थिती ${attendancePct}% आहे${avgExamPct != null ? ` आणि परीक्षांमधील सरासरी गुण ${avgExamPct}% आहेत` : ""}. ${strongSkills.length > 0 ? `${strongSkills[0].skill} या कौशल्यामध्ये त्यांची प्रगती कौतुकास्पद आहे. ` : ""}${growthAreas.length > 0 ? `घरी नियमित सराव आणि ${growthAreas[0]} मधील आमच्या मार्गदर्शनामुळे ते आणखी उत्तम प्रगती करतील.` : "नियमित उपस्थिती आणि अभ्यासासाठी तुमच्या सहकार्याबद्दल धन्यवाद."}`,
    },
    memoriesReferenced: memories.length,
  };

  const providerStatus = getAiProviderStatus();
  let finalResult = deterministicResult;

  if (providerStatus.hasApiKey) {
    const aiJson = await generateGeminiStructuredJson<Partial<Student360BriefingResult>>({
      systemInstruction: `You are an expert NGO Academic Counselor and Learner Intelligence Engine for EdBase (SPARSHA OMS).
Analyze the provided 360-degree student JSON dossier and return a valid JSON object matching this exact schema:
{
  "readinessStatus": "thriving" | "steady" | "needs_support" | "high_priority",
  "executiveSummary": "2-3 sentence crisp executive summary",
  "academicTrajectory": {
    "headline": "1 sentence headline",
    "strengths": ["string"],
    "growthAreas": ["string"],
    "momentumNotes": "1-2 sentence trajectory analysis referencing Baseline/Midline/Endline scores if available"
  },
  "skillAndBehavioralSynthesis": "2-3 sentences synthesizing 1-5 skill logs, remarks, and co-curricular activities",
  "riskSignalsAndAttendance": "1-2 sentences analyzing attendance trends, transfers, fee status, or alerts",
  "staffNextSteps": [
    { "priority": "high" | "medium" | "low", "action": "specific pedagogical step", "ownerRole": "Teacher / Center Admin / Mentor", "timeline": "e.g. Next 14 days" }
  ],
  "parentNarrative": {
    "english": "Warm, encouraging 3-4 sentence progress note for parents in simple English",
    "hindi": "Natural, warm translation in Hindi (Devanagari script)",
    "marathi": "Natural, warm translation in Marathi (Devanagari script)"
  }
}
Never invent numbers not present in the data.`,
      prompt: `Generate a 360° Learner Intelligence Briefing from this authorized student record:\n${JSON.stringify(sanitizedBundle)}`,
    });

    if (aiJson && aiJson.executiveSummary && aiJson.parentNarrative) {
      finalResult = {
        ...deterministicResult,
        ...aiJson,
        studentId,
        studentName: safeStudentName,
        generatedAt: new Date().toISOString(),
        providerMode: "gemini",
        academicTrajectory: {
          ...deterministicResult.academicTrajectory,
          ...(aiJson.academicTrajectory || {}),
        },
        parentNarrative: {
          ...deterministicResult.parentNarrative,
          ...(aiJson.parentNarrative || {}),
        },
        staffNextSteps:
          Array.isArray(aiJson.staffNextSteps) && aiJson.staffNextSteps.length > 0
            ? aiJson.staffNextSteps
            : deterministicResult.staffNextSteps,
        memoriesReferenced: memories.length,
      };
    }
  }

  // Persist a concise institutional memory snapshot for future AI context
  if (user.role !== "parent") {
    await saveEntityMemory(user, {
      entityType: "student",
      entityId: studentId,
      centerIdOverride: profile.student.centerId,
      skipCenterCheck: true,
      category: "academic_briefing",
      summary: `[${finalResult.readinessStatus}] ${finalResult.executiveSummary}`,
      tags: ["360-briefing", finalResult.readinessStatus],
      metadata: {
        attendancePct,
        avgExamPct,
        skillScore,
        providerMode: finalResult.providerMode,
      },
    }).catch(() => {});
  }

  return finalResult;
}

// =============================================================================
// 3. AI SKILL & CAREER GUIDANCE PLAYBOOK GENERATOR (30-60-90 DAY STAFF PROCEDURE)
// =============================================================================

function buildProgramTailoredPathways(params: {
  programCode: string;
  age: number | null;
  strongSubjects: string[];
  strongSkills: string[];
  weakSkills: string[];
  customGoal?: string;
}): CareerUpskillingPlaybookResult["recommendedPathways"] {
  const code = params.programCode.toUpperCase();
  const isEarlyChildhood = code.includes("SHIKSHA") || (params.age !== null && params.age <= 10);

  if (isEarlyChildhood) {
    return [
      {
        careerGoal: params.customGoal || "Foundational Literacy & Numeracy Readiness",
        industry: "Early Childhood Development",
        fitScore: 94,
        rationale: "Age-appropriate primary school readiness pathway focusing on phonics, number sense, and classroom confidence.",
        targetMilestones: [
          "Master phonics and short-sentence reading",
          "Complete foundational arithmetic games (1-100)",
          "Participate in weekly show-and-tell storytelling",
        ],
        suggestedNotes: "Staff should prioritize play-based learning kits and positive reinforcement.",
      },
      {
        careerGoal: "Creative Expression & Social Confidence Track",
        industry: "Holistic Youth Development",
        fitScore: 88,
        rationale: "Builds peer collaboration, fine motor skills, and emotional articulation through structured group activities.",
        targetMilestones: [
          "Lead one small-group art or craft circle",
          "Demonstrate active listening during story hour",
          "Present a drawing or craft to classmates",
        ],
        suggestedNotes: "Pair with outgoing peers during co-curricular camps.",
      },
      {
        careerGoal: "Early STEM Curiosity & Observation",
        industry: "STEM Foundations",
        fitScore: 82,
        rationale: "Nurtures curiosity through nature walks, sorting puzzles, and hands-on science observation.",
        targetMilestones: [
          "Complete 4 guided pattern & logic puzzles",
          "Participate in center science curiosity day",
          "Build a simple observation journal with drawings",
        ],
        suggestedNotes: "Incorporate visual flashcards and tactile puzzles.",
      },
    ];
  }

  const hasDigitalStrength =
    params.strongSubjects.some((s) => s.toLowerCase().includes("digital") || s.toLowerCase().includes("math")) ||
    params.strongSkills.some((s) => s.toLowerCase().includes("comput") || s.toLowerCase().includes("typing"));

  const hasCommStrength =
    params.strongSubjects.some((s) => s.toLowerCase().includes("english") || s.toLowerCase().includes("social")) ||
    params.strongSkills.some((s) => s.toLowerCase().includes("english") || s.toLowerCase().includes("speaking"));

  const pathways: CareerUpskillingPlaybookResult["recommendedPathways"] = [
    {
      careerGoal: params.customGoal || (hasDigitalStrength ? "Junior IT Support & Digital Operations Associate" : "Digital Office & Data Entry Specialist"),
      industry: "Information Technology & BPO",
      fitScore: hasDigitalStrength ? 92 : 84,
      rationale: hasDigitalStrength
        ? "Aligns directly with demonstrated aptitude in Digital Literacy, Mathematics, or Computing skills."
        : "High-employability entry pathway accessible through structured computing and typing upskilling at the center.",
      targetMilestones: [
        "Achieve Level 4+ in Basic Computing & MS Office / Spreadsheets",
        "Reach 35+ WPM accurate Typing Speed",
        "Complete a practical digital portfolio & mock technical interview",
      ],
      suggestedNotes: "Leverage center computers for 30-minute daily guided labs and real spreadsheet exercises.",
    },
    {
      careerGoal: hasCommStrength ? "Customer Success & Retail Operations Coordinator" : "Hospitality & Front-Desk Service Associate",
      industry: "Retail, Services & Hospitality",
      fitScore: hasCommStrength ? 90 : 81,
      rationale: "Builds on interpersonal strengths and offers fast placement pipelines with structured spoken English mentorship.",
      targetMilestones: [
        "Reach Level 4 in Spoken English & Customer Etiquette",
        "Complete 3 role-play workplace communication simulations",
        "Attend an industry exposure visit or job-readiness camp",
      ],
      suggestedNotes: "Use bilingual confidence-building role-plays before introducing formal English interviews.",
    },
    {
      careerGoal: code.includes("KUSUM") || code.includes("UDAY")
        ? "Skilled Vocational & Micro-Entrepreneurship Track"
        : "Polytechnic / ITI Technical Diploma Pathway",
      industry: "Vocational & Technical Trades",
      fitScore: 85,
      rationale: "Provides practical hands-on certification and sustainable livelihood independence with scholarship support.",
      targetMilestones: [
        "Complete career aptitude & trade counseling session",
        "Shortlist 2 accredited ITI / vocational certification institutes",
        "Submit scholarship & admission readiness documents in Dossier Vault",
      ],
      suggestedNotes: "Coordinate with center supervisor to arrange alumni mentor interaction.",
    },
  ];

  return pathways;
}

export async function generateCareerAndSkillPlaybook(
  user: JwtPayload,
  studentId: string,
  options?: { focusArea?: string; customGoal?: string },
): Promise<CareerUpskillingPlaybookResult> {
  await assertStudentAiAccess(user, studentId);

  const [profile, skills, memories] = await Promise.all([
    studentService.getStudentProfile(user, studentId),
    skillService.getSkillsByStudent(user, studentId),
    getEntityMemories(user, "student", studentId, 8),
  ]);

  const sanitizedBundle = sanitizePayloadForAi(user, {
    student: {
      fullName: profile.student.fullName,
      dob: profile.student.dob,
      gender: profile.student.gender,
      stream: profile.student.stream,
      post12thChoice: profile.student.post12thChoice,
      collegeName: profile.student.collegeName,
      educationDiscontinued: profile.student.educationDiscontinued,
      program: profile.student.program,
      center: profile.student.center,
    },
    stats: profile.stats,
    examComparison: profile.examComparison,
    skillRadar: profile.skillRadar,
    skillLogs: skills.slice(0, 15).map((s) => ({
      skillName: s.skill?.name,
      level: s.level,
      maxLevel: s.skill?.maxLevel || 5,
      remarks: s.remarks,
      assessedOn: s.assessedOn,
    })),
    existingCareers: profile.careers,
    priorMemories: memories.map((m) => ({ category: m.category, summary: m.summary })),
    requestedFocusArea: options?.focusArea || null,
    requestedCustomGoal: options?.customGoal || null,
  });

  const safeStudentName = sanitizedBundle.student.fullName || "Student";
  const programName = profile.student.program?.name || "General Program";
  const programCode = profile.student.program?.code || programName;
  const age = computeAgeFromDob(profile.student.dob);

  const strongSubjects = (profile.examComparison || [])
    .filter((e) => (e.endline ?? e.midline ?? e.baseline ?? 0) >= 60)
    .map((e) => e.subject);

  const sortedSkills = [...(profile.skillRadar || [])].sort((a, b) => a.score - b.score);
  const weakSkills = sortedSkills.filter((s) => s.score <= 3);
  const strongSkills = sortedSkills.filter((s) => s.score >= 4).map((s) => s.skill);

  const avgSkill = profile.stats.skillScore ?? 0;
  const avgExam = profile.stats.avgExamPct ?? 0;
  const academicReadinessLevel: CareerUpskillingPlaybookResult["learnerDiagnosis"]["academicReadinessLevel"] =
    avgSkill >= 3.8 && avgExam >= 65
      ? "career_ready"
      : avgSkill >= 2.5 || avgExam >= 45
        ? "developing"
        : "foundational";

  const fallbackPathways = buildProgramTailoredPathways({
    programCode,
    age,
    strongSubjects,
    strongSkills,
    weakSkills: weakSkills.map((s) => s.skill),
    customGoal: options?.customGoal,
  });

  const priorityGaps = weakSkills.length > 0
    ? weakSkills.slice(0, 3).map((s) => `${s.skill} (Level ${s.score}/${s.maxLevel || 5})`)
    : ["Structured career goal mapping", "Workplace communication & portfolio building"];

  const primaryGapName = weakSkills[0]?.skill || "Spoken English & Digital Fluency";
  const secondaryGapName = weakSkills[1]?.skill || "Public Speaking & Confidence";

  const deterministicPlaybook: CareerUpskillingPlaybookResult = {
    studentId,
    studentName: safeStudentName,
    programName,
    generatedAt: new Date().toISOString(),
    providerMode: "deterministic-synthesizer",
    learnerDiagnosis: {
      summary: `${safeStudentName} is enrolled in ${programName}${age ? ` (age ${age})` : ""} with ${academicReadinessLevel.replace("_", " ")} readiness. ${strongSkills.length > 0 ? `Demonstrated strengths in ${strongSkills.join(", ")}. ` : ""}Structured staff mentorship targeting ${primaryGapName} will unlock higher employability and academic confidence.`,
      topStrengths:
        strongSkills.length > 0
          ? strongSkills
          : strongSubjects.length > 0
            ? strongSubjects
            : ["Consistent program participation", "Openness to structured skill coaching"],
      prioritySkillGaps: priorityGaps,
      academicReadinessLevel,
    },
    recommendedPathways: fallbackPathways,
    staffUpskillingProcedure: {
      phase30Days: {
        title: "Days 1–30: Diagnostic Baseline & Micro-Habit Foundation",
        objective: `Close immediate foundational gaps in ${primaryGapName} and establish weekly coaching cadence.`,
        staffSteps: [
          `Conduct a 20-minute 1-on-1 aspiration interview with ${safeStudentName} and confirm one primary career milestone.`,
          `Run 3x weekly 15-minute guided practice drills focused on ${primaryGapName} using scaffolded worksheets or lab tasks.`,
          "Log an updated Skill Matrix assessment with qualitative remarks at Day 30 to measure L+1 progress.",
        ],
      },
      phase60Days: {
        title: "Days 31–60: Applied Practice & Peer Mentoring",
        objective: `Apply core academic and ${secondaryGapName} competencies in realistic projects and group settings.`,
        staffSteps: [
          `Assign a practical mini-project aligned to "${fallbackPathways[0].careerGoal}" (e.g., spreadsheet budget, bilingual pitch, or hands-on model).`,
          `Pair ${safeStudentName} in a peer-buddy group to practice ${secondaryGapName} during Friday activity sessions.`,
          "Review attendance and midline/unit exam progress; trigger remedial tutoring immediately if any subject dips below 50%.",
        ],
      },
      phase90Days: {
        title: "Days 61–90: Portfolio Showcase & Pathway Transition",
        objective: "Validate mastery through mock evaluations, external exposure, and documented dossier readiness.",
        staffSteps: [
          "Host a center-level showcase or mock interview panel and record qualitative mentor feedback in the student's Dossier.",
          "Upload completed certificates, project artifacts, or readiness documents into the Student Document Vault.",
          "Finalize next-quarter progression plan with guardian alignment (vocational course enrollment, scholarship application, or advanced batch promotion).",
        ],
      },
    },
    recommendedSkillDrills: (weakSkills.length > 0
      ? weakSkills.slice(0, 3)
      : [
          { skill: "Spoken English", score: 2, maxLevel: 5 },
          { skill: "Basic Computing", score: 2, maxLevel: 5 },
        ]
    ).map((sk) => ({
      skillName: sk.skill,
      currentLevel: sk.score,
      targetLevel: Math.min(sk.maxLevel || 5, sk.score + 2),
      staffFacilitationProcedure: `Break ${sk.skill} into 15-minute daily guided drills: demonstrate 1 model example, have ${safeStudentName} practice with a peer, and give 1 specific encouragement + 1 correction before logging weekly progress.`,
      frequency: "3 sessions / week (15–20 mins)",
    })),
    memoriesReferenced: memories.length,
  };

  const providerStatus = getAiProviderStatus();
  let finalPlaybook = deterministicPlaybook;

  if (providerStatus.hasApiKey) {
    const aiJson = await generateGeminiStructuredJson<Partial<CareerUpskillingPlaybookResult>>({
      systemInstruction: `You are an expert Youth Career Counselor and Staff Pedagogical Coach for EdBase (SPARSHA NGO in India).
Your job is to help NGO teachers and staff know the EXACT steps and procedures to upskill, mentor, and develop a child based on their academic scores, 1-5 skill logs, age, and program (SHIKSHA ages 3-6, SWAYAM ages 15-18, UDAY vocational 18-30, KUSUM empowerment 18-45).
Return valid JSON matching this exact structure:
{
  "learnerDiagnosis": {
    "summary": "2-3 sentences diagnosing strengths, gaps, and readiness",
    "topStrengths": ["string"],
    "prioritySkillGaps": ["string"],
    "academicReadinessLevel": "foundational" | "developing" | "career_ready"
  },
  "recommendedPathways": [
    {
      "careerGoal": "string",
      "industry": "string",
      "fitScore": 85,
      "rationale": "string grounded in student's actual subjects/skills",
      "targetMilestones": ["milestone 1", "milestone 2", "milestone 3"],
      "suggestedNotes": "concise counseling note for Career Tracking record"
    }
  ],
  "staffUpskillingProcedure": {
    "phase30Days": { "title": "string", "objective": "string", "staffSteps": ["step 1", "step 2", "step 3"] },
    "phase60Days": { "title": "string", "objective": "string", "staffSteps": ["step 1", "step 2", "step 3"] },
    "phase90Days": { "title": "string", "objective": "string", "staffSteps": ["step 1", "step 2", "step 3"] }
  },
  "recommendedSkillDrills": [
    {
      "skillName": "string",
      "currentLevel": 2,
      "targetLevel": 4,
      "staffFacilitationProcedure": "exact procedure for teacher/staff to coach this skill",
      "frequency": "e.g. 3x/week for 20 mins"
    }
  ]
}`,
      prompt: `Generate a Staff Skill & Career Upskilling Playbook for this student:\n${JSON.stringify(sanitizedBundle)}`,
    });

    if (aiJson && aiJson.learnerDiagnosis && Array.isArray(aiJson.recommendedPathways) && aiJson.recommendedPathways.length > 0) {
      finalPlaybook = {
        ...deterministicPlaybook,
        ...aiJson,
        studentId,
        studentName: safeStudentName,
        programName,
        generatedAt: new Date().toISOString(),
        providerMode: "gemini",
        learnerDiagnosis: {
          ...deterministicPlaybook.learnerDiagnosis,
          ...aiJson.learnerDiagnosis,
        },
        staffUpskillingProcedure: {
          ...deterministicPlaybook.staffUpskillingProcedure,
          ...(aiJson.staffUpskillingProcedure || {}),
        },
        recommendedSkillDrills:
          Array.isArray(aiJson.recommendedSkillDrills) && aiJson.recommendedSkillDrills.length > 0
            ? aiJson.recommendedSkillDrills
            : deterministicPlaybook.recommendedSkillDrills,
        memoriesReferenced: memories.length,
      };
    }
  }

  // Persist career guidance snapshot in institutional memory
  if (user.role !== "parent") {
    const topPath = finalPlaybook.recommendedPathways[0];
    await saveEntityMemory(user, {
      entityType: "student",
      entityId: studentId,
      centerIdOverride: profile.student.centerId,
      skipCenterCheck: true,
      category: "career_playbook",
      summary: `Recommended top pathway: ${topPath?.careerGoal || "Holistic Development"} (${topPath?.industry || "General"}). Priority gaps: ${finalPlaybook.learnerDiagnosis.prioritySkillGaps.join(", ")}.`,
      tags: ["career-playbook", "upskilling", programCode.toLowerCase()],
      metadata: {
        topCareerGoal: topPath?.careerGoal,
        readiness: finalPlaybook.learnerDiagnosis.academicReadinessLevel,
        providerMode: finalPlaybook.providerMode,
      },
    }).catch(() => {});
  }

  return finalPlaybook;
}

export function getOrchestratorMetadata() {
  const provider = getAiProviderStatus();
  return {
    ...provider,
    availableTools: UNIVERSAL_AI_TOOLS.map((t) => ({
      name: t.definition.name,
      label: t.label,
      description: t.definition.description,
    })),
    memoryLayers: [
      "Episodic Session Memory (Persistent Multi-Turn Threads)",
      "Long-Term Institutional Entity Memory (Student, Center, Program Insights)",
      "Hybrid Semantic + Lexical RAG (Skill Remarks, Exam Remarks, Career Tracking, Forms, Dossier Docs, Alerts)",
    ],
  };
}
