import type { JwtPayload } from "../../utils/jwt.js";
import prisma from "../../lib/prisma.js";
import { getScopedCenterIds } from "../../lib/centerScope.js";
import * as reportService from "../reportService.js";
import * as studentService from "../student.service.js";
import * as studentDossierService from "../studentDossierService.js";
import * as skillService from "../skillService.js";
import * as alertService from "../alertService.js";
import type { LlmToolDefinition } from "./llmProvider.js";
import {
  getEntityMemories,
  saveEntityMemory,
  searchKnowledgeBaseRag,
  type AiCitation,
  type AiEntityType,
} from "./memoryEngine.js";
import { sanitizePayloadForAi } from "./piiGuard.js";

export interface RegisteredAiTool {
  definition: LlmToolDefinition;
  label: string;
  execute: (
    user: JwtPayload,
    args: Record<string, unknown>,
  ) => Promise<{
    data: unknown;
    citations?: AiCitation[];
  }>;
}

function getDefaultDateWindow(days = 30): { from: string; to: string } {
  const to = new Date();
  const from = new Date(to.getTime() - days * 86_400_000);
  return {
    from: from.toISOString().slice(0, 10),
    to: to.toISOString().slice(0, 10),
  };
}

async function resolveCurrentAcademicYearLabel(): Promise<string> {
  const current = await prisma.academicYear.findFirst({
    where: { isCurrent: true },
    select: { label: true },
  });
  if (current?.label) return current.label;
  const latest = await prisma.academicYear.findFirst({
    orderBy: { startDate: "desc" },
    select: { label: true },
  });
  return latest?.label || "2026-27";
}

export const UNIVERSAL_AI_TOOLS: RegisteredAiTool[] = [
  {
    label: "Institution & Center Dashboard Metrics",
    definition: {
      name: "get_institution_overview",
      description:
        "Fetches high-level institutional overview across all centers the user can access: total active students, center-by-center student counts and attendance rates, program distribution, lowest attendance centers, pending transfers, and fee collection metrics.",
      parameters: {
        type: "OBJECT",
        properties: {},
      },
    },
    execute: async (user) => {
      const summary = await reportService.getDashboardSummary(user);
      const scopedCenters = getScopedCenterIds(user);
      const programs = await prisma.program.findMany({
        where: { isActive: true },
        select: { id: true, code: true, name: true, ageMin: true, ageMax: true },
        orderBy: { name: "asc" },
      });
      return {
        data: sanitizePayloadForAi(user, {
          ...summary,
          programs,
          scopedCenterCount: scopedCenters === undefined ? "all" : scopedCenters.length,
        }),
        citations: [
          {
            sourceType: "analytics",
            title: "Dashboard Summary & Center Breakdown",
            snippet: `${summary.totalStudents} active students across ${summary.totalCenters} center(s); 30-day attendance ${summary.overallAttendanceRate}%.`,
          },
        ],
      };
    },
  },
  {
    label: "Student Directory & Academic Filter",
    definition: {
      name: "query_students",
      description:
        "Searches and filters active students within the user's authorized centers by name, centerId, programId, gender, age range, attendance rate range (0-100), or average exam score range (0-100).",
      parameters: {
        type: "OBJECT",
        properties: {
          search: { type: "STRING", description: "Optional partial student name to search for." },
          centerId: { type: "STRING", description: "Optional Center UUID filter." },
          programId: { type: "STRING", description: "Optional Program UUID filter." },
          gender: { type: "STRING", description: "Optional gender filter (male, female, other)." },
          attendanceRateMax: {
            type: "NUMBER",
            description: "Upper bound for attendance rate percentage (e.g. 75 to find low-attendance students).",
          },
          attendanceRateMin: {
            type: "NUMBER",
            description: "Lower bound for attendance rate percentage.",
          },
          examScoreMax: {
            type: "NUMBER",
            description: "Upper bound for average exam score percentage (e.g. 50 to find struggling students).",
          },
          examScoreMin: {
            type: "NUMBER",
            description: "Lower bound for average exam score percentage.",
          },
          limit: { type: "NUMBER", description: "Max students to return (default 20, max 40)." },
        },
      },
    },
    execute: async (user, args) => {
      const limit = Math.min(Math.max(Number(args.limit) || 20, 1), 40);
      const hasRateFilter =
        args.attendanceRateMax !== undefined ||
        args.attendanceRateMin !== undefined ||
        args.examScoreMax !== undefined ||
        args.examScoreMin !== undefined;

      if (hasRateFilter || !args.search) {
        const filtered = await reportService.getFilteredStudents(user, {
          centerId: args.centerId,
          programId: args.programId,
          gender: args.gender,
          attendanceRateMin: args.attendanceRateMin,
          attendanceRateMax: args.attendanceRateMax,
          examScoreMin: args.examScoreMin,
          examScoreMax: args.examScoreMax,
        });
        const searchTerm = typeof args.search === "string" ? args.search.trim().toLowerCase() : "";
        const matched = searchTerm
          ? filtered.filter((s) => s.fullName.toLowerCase().includes(searchTerm))
          : filtered;

        const sliced = matched.slice(0, limit);
        const sanitized = sanitizePayloadForAi(user, {
          totalMatched: matched.length,
          students: sliced,
        });

        return {
          data: sanitized,
          citations: [
            {
              sourceType: "analytics",
              title: "Filtered Student Academic Roster",
              snippet: `Found ${matched.length} student(s) matching criteria (showing ${sliced.length}).`,
            },
          ],
        };
      }

      const listRes = await studentService.getAllStudents(user, {
        search: String(args.search),
        centerId: typeof args.centerId === "string" ? args.centerId : undefined,
        programId: typeof args.programId === "string" ? args.programId : undefined,
        limit,
      });

      return {
        data: sanitizePayloadForAi(user, listRes),
        citations: [
          {
            sourceType: "student_profile",
            title: `Student Search: "${String(args.search)}"`,
            snippet: `Found ${listRes.total} matching student record(s).`,
          },
        ],
      };
    },
  },
  {
    label: "360° Student Profile, Dossier & Memory",
    definition: {
      name: "get_student_360_dossier",
      description:
        "Retrieves a single student's complete 360-degree record: demographics, program, attendance stats/trend, Baseline/Midline/Endline exam comparisons, 1-5 skill radar & logs, career tracking goals, dossier timeline, uploaded document metadata, active alerts, and saved institutional AI memories.",
      parameters: {
        type: "OBJECT",
        properties: {
          studentId: { type: "STRING", description: "The Student UUID." },
        },
        required: ["studentId"],
      },
    },
    execute: async (user, args) => {
      const studentId = String(args.studentId || "").trim();
      const [profile, dossier, skills, memories] = await Promise.all([
        studentService.getStudentProfile(user, studentId),
        studentDossierService.getStudentDossier(user, studentId),
        skillService.getSkillsByStudent(user, studentId),
        getEntityMemories(user, "student", studentId, 10),
      ]);

      const payload = sanitizePayloadForAi(user, {
        profile,
        skillsHistory: skills.slice(0, 25),
        dossierSummary: dossier.summary,
        recentTimeline: dossier.timeline.slice(0, 20),
        documents: dossier.documents,
        institutionalMemories: memories,
      });

      const safeStudentName = (payload.profile as { student?: { fullName?: string } })?.student?.fullName || "Student";

      return {
        data: payload,
        citations: [
          {
            sourceType: "student_profile",
            title: `360° Dossier: ${safeStudentName}`,
            snippet: `Attendance ${profile.stats.attendancePct}% · Avg Exam ${profile.stats.avgExamPct ?? "N/A"}% · Skill Avg ${profile.stats.skillScore ?? "N/A"}/5 · ${dossier.summary.totalEvents} timeline milestones · ${memories.length} saved memories.`,
            studentId,
            centerId: profile.student.centerId,
          },
        ],
      };
    },
  },
  {
    label: "Exam Baseline vs. Endline Analytics",
    definition: {
      name: "get_exam_analytics",
      description:
        "Analyzes Baseline vs. Endline exam performance by subject (average, min, max, improvement delta) and individual student progress deltas for an academic year.",
      parameters: {
        type: "OBJECT",
        properties: {
          academicYear: {
            type: "STRING",
            description: "Academic year label (e.g. '2026-27'). Omit to use current academic year.",
          },
          centerId: { type: "STRING", description: "Optional Center UUID." },
          programId: { type: "STRING", description: "Optional Program UUID." },
        },
      },
    },
    execute: async (user, args) => {
      const academicYear =
        typeof args.academicYear === "string" && args.academicYear.trim()
          ? args.academicYear.trim()
          : await resolveCurrentAcademicYearLabel();

      const analytics = await reportService.getExamAnalytics(user, {
        academicYear,
        centerId: args.centerId,
        programId: args.programId,
      });

      const trimmed = {
        academicYear,
        baseline: analytics.baseline,
        endline: analytics.endline,
        improvement: analytics.improvement,
        topImprovers: analytics.studentPerformance.slice(0, 8),
        needsSupport: [...analytics.studentPerformance].reverse().slice(0, 8),
        totalStudentsCompared: analytics.studentPerformance.length,
      };

      return {
        data: sanitizePayloadForAi(user, trimmed),
        citations: [
          {
            sourceType: "analytics",
            title: `Exam Analytics (${academicYear})`,
            snippet: `Compared ${analytics.studentPerformance.length} student(s) across ${Object.keys(analytics.improvement).length} subject(s).`,
          },
        ],
      };
    },
  },
  {
    label: "Skills & Proficiency Gap Analytics",
    definition: {
      name: "get_skills_and_matrix_analytics",
      description:
        "Fetches qualitative skill proficiency averages (1-5 levels) across programs/centers, subject exam averages, and skill form template summaries to pinpoint cohort skill gaps.",
      parameters: {
        type: "OBJECT",
        properties: {
          centerId: { type: "STRING", description: "Optional Center UUID." },
          programId: { type: "STRING", description: "Optional Program UUID." },
        },
      },
    },
    execute: async (user, args) => {
      const [skillsReport, definitions] = await Promise.all([
        reportService.getSkillsReport(user, {
          centerId: typeof args.centerId === "string" ? args.centerId : undefined,
          programId: typeof args.programId === "string" ? args.programId : undefined,
        }),
        skillService.listSkillDefinitions(
          typeof args.programId === "string" ? args.programId : undefined,
        ),
      ]);

      return {
        data: sanitizePayloadForAi(user, {
          ...skillsReport,
          skillDefinitions: definitions.map((d) => ({
            id: d.id,
            name: d.name,
            maxLevel: d.maxLevel,
            program: d.program?.name,
          })),
        }),
        citations: [
          {
            sourceType: "analytics",
            title: "Cohort Skill Proficiency Report",
            snippet: `Analyzed ${skillsReport.skillProficiency.length} tracked skill(s) across ${definitions.length} active definitions.`,
          },
        ],
      };
    },
  },
  {
    label: "Attendance Trends & Risk Alerts",
    definition: {
      name: "get_attendance_and_alerts",
      description:
        "Retrieves attendance trends (default last 30 days), lowest attendance students, and open early-warning risk alerts (consecutive absences, exam drops, overdue fees).",
      parameters: {
        type: "OBJECT",
        properties: {
          centerId: { type: "STRING", description: "Optional Center UUID." },
          programId: { type: "STRING", description: "Optional Program UUID." },
          from: { type: "STRING", description: "Optional start date YYYY-MM-DD (defaults to 30 days ago)." },
          to: { type: "STRING", description: "Optional end date YYYY-MM-DD (defaults to today)." },
        },
      },
    },
    execute: async (user, args) => {
      const defaults = getDefaultDateWindow(30);
      const from = typeof args.from === "string" && args.from ? args.from : defaults.from;
      const to = typeof args.to === "string" && args.to ? args.to : defaults.to;

      const [attendance, alertsRes] = await Promise.all([
        reportService.getAttendanceAnalytics(user, {
          centerId: args.centerId,
          programId: args.programId,
          from,
          to,
        }),
        alertService.listAlerts(user, {
          centerId: typeof args.centerId === "string" ? args.centerId : undefined,
          status: "open",
          limit: 25,
        }),
      ]);

      return {
        data: sanitizePayloadForAi(user, {
          period: { from, to },
          attendanceSummary: attendance.summary,
          lowestAttendanceStudents: attendance.byStudent.slice(0, 10),
          openAlertsCount: alertsRes.openCount,
          recentOpenAlerts: alertsRes.alerts.slice(0, 15).map((a) => ({
            id: a.id,
            studentId: a.studentId,
            studentName: a.student?.fullName,
            centerName: a.center?.name,
            metric: a.rule?.metric,
            message: a.message,
            createdAt: a.createdAt,
          })),
        }),
        citations: [
          {
            sourceType: "alert",
            title: `Attendance (${from} to ${to}) & Early-Warning Alerts`,
            snippet: `Average attendance ${attendance.summary.averageAttendanceRate}% across ${attendance.summary.totalSessions} session(s); ${alertsRes.openCount} open risk alert(s).`,
          },
        ],
      };
    },
  },
  {
    label: "Hybrid Semantic Knowledge RAG Search",
    definition: {
      name: "search_qualitative_knowledge_rag",
      description:
        "Performs hybrid semantic + lexical RAG search across qualitative institutional data: teacher skill remarks, exam feedback remarks, career counseling goals/milestones, dynamic form submissions, activity completion notes, dossier documents, and saved AI entity memories.",
      parameters: {
        type: "OBJECT",
        properties: {
          query: { type: "STRING", description: "Natural language search query." },
          centerId: { type: "STRING", description: "Optional Center UUID filter." },
          studentId: { type: "STRING", description: "Optional Student UUID filter." },
          limit: { type: "NUMBER", description: "Max matching chunks (default 8)." },
        },
        required: ["query"],
      },
    },
    execute: async (user, args) => {
      const ragRes = await searchKnowledgeBaseRag(user, {
        query: String(args.query || ""),
        centerId: typeof args.centerId === "string" ? args.centerId : undefined,
        studentId: typeof args.studentId === "string" ? args.studentId : undefined,
        limit: Number(args.limit) || 8,
      });

      return {
        data: ragRes,
        citations: ragRes.results,
      };
    },
  },
  {
    label: "Institutional Entity Memory Writer",
    definition: {
      name: "remember_entity_insight",
      description:
        "Saves an important observation, mentoring commitment, or intervention note into long-term institutional AI memory for a specific student, center, or program so future AI sessions remember it.",
      parameters: {
        type: "OBJECT",
        properties: {
          entityType: {
            type: "STRING",
            enum: ["student", "center", "program"],
            description: "Type of entity to attach memory to.",
          },
          entityId: { type: "STRING", description: "UUID of the student, center, or program." },
          summary: { type: "STRING", description: "Concise institutional insight to persist." },
          tags: {
            type: "ARRAY",
            items: { type: "STRING" },
            description: "Optional keywords/tags (e.g. ['spoken-english', 'mentoring']).",
          },
        },
        required: ["entityType", "entityId", "summary"],
      },
    },
    execute: async (user, args) => {
      const saved = await saveEntityMemory(user, {
        entityType: String(args.entityType) as AiEntityType,
        entityId: String(args.entityId),
        category: "chat_insight",
        summary: String(args.summary),
        tags: Array.isArray(args.tags) ? args.tags.map(String) : ["ai-copilot"],
      });

      return {
        data: saved,
        citations: [
          {
            sourceType: "entity_memory",
            title: `Saved Institutional Memory (${saved.entityType})`,
            snippet: saved.summary,
            entityId: saved.id,
            studentId: saved.entityType === "student" ? saved.entityId : undefined,
            centerId: saved.centerId ?? undefined,
          },
        ],
      };
    },
  },
];

const toolMap = new Map<string, RegisteredAiTool>(
  UNIVERSAL_AI_TOOLS.map((t) => [t.definition.name, t]),
);

export function getRegisteredToolDefinitions(): LlmToolDefinition[] {
  return UNIVERSAL_AI_TOOLS.map((t) => t.definition);
}

export function getToolByName(name: string): RegisteredAiTool | undefined {
  return toolMap.get(name);
}

export async function executeRegisteredTool(
  user: JwtPayload,
  name: string,
  args: Record<string, unknown>,
): Promise<{
  ok: boolean;
  label: string;
  data: unknown;
  citations: AiCitation[];
}> {
  const tool = toolMap.get(name);
  if (!tool) {
    return {
      ok: false,
      label: name,
      data: { error: `Unknown tool: ${name}` },
      citations: [],
    };
  }

  try {
    const result = await tool.execute(user, args);
    return {
      ok: true,
      label: tool.label,
      data: result.data,
      citations: result.citations ?? [],
    };
  } catch (err) {
    return {
      ok: false,
      label: tool.label,
      data: { error: err instanceof Error ? err.message : "Tool execution failed" },
      citations: [],
    };
  }
}
