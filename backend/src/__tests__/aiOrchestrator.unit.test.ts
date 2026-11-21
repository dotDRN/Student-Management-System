import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ForbiddenError } from "../lib/errors.js";
import type { JwtPayload } from "../utils/jwt.js";
import {
  assertStaffAiChatAccess,
  assertStudentAiAccess,
  isPiiRestrictedRole,
  sanitizePayloadForAi,
} from "../services/ai/piiGuard.js";
import {
  AI_ENTITY_MEMORY_ACTION,
  AI_ENTITY_MEMORY_TABLE,
  AI_THREAD_ACTION,
  AI_THREAD_TABLE,
  appendTurnToAiThread,
  getEntityMemories,
  saveEntityMemory,
  searchKnowledgeBaseRag,
} from "../services/ai/memoryEngine.js";
import {
  generateCareerAndSkillPlaybook,
  generateStudent360Briefing,
  orchestrateChat,
} from "../services/ai/universalOrchestrator.js";
import { mockPrismaModel } from "./helpers/mockPrisma.js";

const teacherCenter1: JwtPayload = {
  userId: "teacher-1",
  tenantId: "00000000-0000-0000-0000-000000000001",
  email: "teacher1@sparsha.org",
  role: "teacher",
  centerIds: ["center-1"],
  isActive: true,
};

const shareholderUser: JwtPayload = {
  userId: "shareholder-1",
  tenantId: "00000000-0000-0000-0000-000000000001",
  email: "sponsor@sparsha.org",
  role: "shareholder",
  centerIds: ["center-1"],
  isActive: true,
};

const parentUser: JwtPayload = {
  userId: "parent-1",
  tenantId: "00000000-0000-0000-0000-000000000001",
  email: "parent1@sparsha.org",
  role: "parent",
  centerIds: [],
  isActive: true,
};

describe("Universal AI Orchestrator, Dual-Layer Memory & Security Guardrails", () => {
  it("enforces vertical PII redaction for restricted roles and preserves fields for teachers", () => {
    assert.equal(isPiiRestrictedRole("shareholder"), true);
    assert.equal(isPiiRestrictedRole("tech_admin"), true);
    assert.equal(isPiiRestrictedRole("volunteer"), true);
    assert.equal(isPiiRestrictedRole("teacher"), false);

    const rawStudent = {
      id: "abcdef12-0000-0000-0000-000000000001",
      fullName: "Aarav Kulkarni",
      rollNumber: "SW-101",
      guardianName: "Ramesh Kulkarni",
      guardianPhone: "9876543210",
      address: "12 MG Road, Mumbai",
      dob: "2009-05-12",
      remarks: "Parent reachable at 9876543210 after 6pm",
    };

    const forShareholder = sanitizePayloadForAi(shareholderUser, rawStudent);
    assert.equal(forShareholder.guardianPhone, "[REDACTED]");
    assert.equal(forShareholder.address, "[REDACTED]");
    assert.equal(forShareholder.dob, "[REDACTED]");
    assert.equal(forShareholder.guardianName, "[REDACTED]");
    assert.match(forShareholder.fullName, /^Student #ABCDEF/);
    assert.ok(!forShareholder.remarks.includes("9876543210"));

    const forTeacher = sanitizePayloadForAi(teacherCenter1, rawStudent);
    assert.equal(forTeacher.fullName, "Aarav Kulkarni");
    assert.equal(forTeacher.guardianPhone, "9876543210");
  });

  it("blocks parents from staff global copilot and from unlinked students", async (t) => {
    assert.throws(() => assertStaffAiChatAccess(parentUser), ForbiddenError);

    let linked = false;
    mockPrismaModel(t, "parentStudent", {
      findFirst: async () => (linked ? { id: "ps-1" } : null),
    });

    await assert.rejects(() => assertStudentAiAccess(parentUser, "stu-99"), ForbiddenError);
    linked = true;
    await assert.doesNotReject(() => assertStudentAiAccess(parentUser, "stu-99"));
  });

  it("persists and enforces center isolation on Long-Term Entity Memory and Episodic Threads", async (t) => {
    let studentCenter = "center-2";
    const storedRows: Array<any> = [];

    mockPrismaModel(t, "student", {
      findUnique: async () => ({ id: "stu-1", centerId: studentCenter }),
    });

    mockPrismaModel(t, "auditLog", {
      create: async ({ data }: any) => {
        const row = {
          id: `mem-${storedRows.length + 1}`,
          userId: data.userId,
          action: data.action,
          tableName: data.tableName,
          recordId: data.recordId,
          newData: data.newData,
          createdAt: new Date("2026-11-20T10:00:00Z"),
          user: { id: "teacher-1", fullName: "Teacher One" },
        };
        storedRows.push(row);
        return row;
      },
      findMany: async ({ where }: any) =>
        storedRows.filter(
          (r) =>
            r.tableName === where.tableName &&
            r.action === where.action &&
            (!where.recordId || r.recordId === where.recordId),
        ),
      findFirst: async ({ where }: any) =>
        storedRows.find(
          (r) =>
            r.id === where.id &&
            r.tableName === where.tableName &&
            r.userId === where.userId,
        ) ?? null,
      update: async ({ where, data }: any) => {
        const idx = storedRows.findIndex((r) => r.id === where.id);
        storedRows[idx] = { ...storedRows[idx], newData: data.newData };
        return storedRows[idx];
      },
    });

    // Cross-center access must throw ForbiddenError
    await assert.rejects(
      () =>
        saveEntityMemory(teacherCenter1, {
          entityType: "student",
          entityId: "stu-1",
          summary: "Should fail for another center",
        }),
      ForbiddenError,
    );

    // Same-center access succeeds and can be retrieved
    studentCenter = "center-1";
    const createdMem = await saveEntityMemory(teacherCenter1, {
      entityType: "student",
      entityId: "stu-1",
      category: "staff_observation",
      summary: "Strong visual learner; responds well to peer spoken-English practice.",
      tags: ["spoken-english", "peer-learning"],
    });
    assert.equal(createdMem.entityType, "student");
    assert.equal(createdMem.centerId, "center-1");

    const loaded = await getEntityMemories(teacherCenter1, "student", "stu-1");
    assert.equal(loaded.length, 1);
    assert.equal(loaded[0].tags[0], "spoken-english");

    // Multi-turn episodic thread persistence
    const thread1 = await appendTurnToAiThread(teacherCenter1, {
      userMessage: "How is stu-1 doing?",
      assistantMessage: "Attendance is 88% and improving in English.",
      toolsUsed: ["get_student_360_dossier"],
    });
    assert.equal(thread1.messages.length, 2);

    const thread2 = await appendTurnToAiThread(teacherCenter1, {
      threadId: thread1.id,
      userMessage: "What should staff do next?",
      assistantMessage: "Assign 3x weekly spoken English drills.",
      toolsUsed: ["search_qualitative_knowledge_rag"],
    });
    assert.equal(thread2.id, thread1.id);
    assert.equal(thread2.messages.length, 4);
  });

  it("executes Hybrid RAG over remarks, career notes, and documents while blocking cross-center leaks", async (t) => {
    // Ensure deterministic lexical fallback during unit tests
    const prevKey = process.env.GEMINI_API_KEY;
    delete process.env.GEMINI_API_KEY;

    try {
      mockPrismaModel(t, "studentSkillLog", {
        findMany: async () => [
          {
            id: "skl-1",
            studentId: "stu-1",
            centerId: "center-1",
            level: 2,
            remarks: "Hesitates during Spoken English role-play; needs fluency drills.",
            assessedOn: new Date("2026-11-10T00:00:00Z"),
            student: { id: "stu-1", fullName: "Meera Nair" },
            skill: { name: "Spoken English", maxLevel: 5 },
            center: { name: "Andheri Center" },
          },
        ],
      });
      mockPrismaModel(t, "examScore", { findMany: async () => [] });
      mockPrismaModel(t, "formSubmission", {
        findMany: async () => [
          {
            id: "fs-1",
            studentId: "stu-1",
            centerId: "center-1",
            submittedAt: new Date("2026-11-12T00:00:00Z"),
            template: { name: "Career Tracking", formType: "system" },
            student: { id: "stu-1", fullName: "Meera Nair" },
            data: {
              careerGoal: "Junior IT Support",
              industry: "Technology",
              notes: "Excels in computing labs; wants spoken English coaching.",
            },
          },
        ],
      });
      mockPrismaModel(t, "activity", { findMany: async () => [] });
      mockPrismaModel(t, "alert", { findMany: async () => [] });
      mockPrismaModel(t, "auditLog", { findMany: async () => [] });

      // Cross-center RAG request must be rejected
      await assert.rejects(
        () => searchKnowledgeBaseRag(teacherCenter1, { query: "Spoken English", centerId: "center-2" }),
        ForbiddenError,
      );

      // Authorized center RAG search returns ranked matches
      const rag = await searchKnowledgeBaseRag(teacherCenter1, {
        query: "Spoken English fluency",
      });
      assert.equal(rag.totalScanned, 2);
      assert.ok(rag.results.length >= 1);
      assert.equal(rag.results[0].sourceType, "skill_remark");

      // PII restricted shareholder gets masked student identity in RAG citations
      const ragShareholder = await searchKnowledgeBaseRag(shareholderUser, {
        query: "Spoken English",
      });
      assert.ok(!ragShareholder.results[0].title.includes("Meera Nair"));
      assert.ok(ragShareholder.results[0].title.includes("Student #"));
    } finally {
      if (prevKey !== undefined) process.env.GEMINI_API_KEY = prevKey;
    }
  });

  it("generates 360° Student Briefing, 30-60-90 Day Career Playbook, and Orchestrator Chat grounded in live data", async (t) => {
    const prevKey = process.env.GEMINI_API_KEY;
    delete process.env.GEMINI_API_KEY;

    try {
      const mockStudent = {
        id: "11111111-1111-1111-1111-111111111111",
        centerId: "center-1",
        programId: "prog-swayam",
        fullName: "Rohan Sharma",
        dob: new Date("2009-03-15T00:00:00Z"),
        gender: "male",
        enrollmentDate: new Date("2026-06-01T00:00:00Z"),
        stream: "Science",
        post12thChoice: "Diploma in IT",
        collegeName: null,
        educationDiscontinued: false,
        center: { id: "center-1", name: "Andheri Center" },
        program: { id: "prog-swayam", code: "SWAYAM", name: "Swayam Youth Development" },
        academicYear: { id: "ay-1", label: "2026-27" },
        attendanceRecords: [
          { status: "present", session: { sessionDate: new Date("2026-11-18T00:00:00Z"), isHoliday: false } },
          { status: "present", session: { sessionDate: new Date("2026-11-19T00:00:00Z"), isHoliday: false } },
          { status: "absent", session: { sessionDate: new Date("2026-11-20T00:00:00Z"), isHoliday: false } },
        ],
        examScores: [
          {
            id: "es-1",
            examId: "ex-1",
            marks: 42,
            isAbsent: false,
            enteredAt: new Date("2026-07-01T00:00:00Z"),
            exam: { id: "ex-1", name: "Baseline 2026", examType: "baseline", examDate: new Date("2026-07-01T00:00:00Z"), academicYear: { id: "ay-1", label: "2026-27" } },
            subject: { id: "sub-1", name: "Digital Literacy", maxMarks: 100 },
          },
          {
            id: "es-2",
            examId: "ex-2",
            marks: 78,
            isAbsent: false,
            enteredAt: new Date("2026-11-01T00:00:00Z"),
            exam: { id: "ex-2", name: "Endline 2026", examType: "endline", examDate: new Date("2026-11-01T00:00:00Z"), academicYear: { id: "ay-1", label: "2026-27" } },
            subject: { id: "sub-1", name: "Digital Literacy", maxMarks: 100 },
          },
          {
            id: "es-3",
            examId: "ex-2",
            marks: 44,
            isAbsent: false,
            enteredAt: new Date("2026-11-01T00:00:00Z"),
            exam: { id: "ex-2", name: "Endline 2026", examType: "endline", examDate: new Date("2026-11-01T00:00:00Z"), academicYear: { id: "ay-1", label: "2026-27" } },
            subject: { id: "sub-2", name: "English", maxMarks: 100 },
          },
        ],
        formSubmissions: [],
        transfers: [],
        skillLogs: [
          {
            id: "sl-1",
            studentId: "11111111-1111-1111-1111-111111111111",
            centerId: "center-1",
            level: 4,
            remarks: "Fast learner in computer lab",
            assessedOn: new Date("2026-11-15T00:00:00Z"),
            skill: { id: "sk-1", name: "Basic Computing", maxLevel: 5 },
            assessedByUser: { id: "teacher-1", fullName: "Teacher One" },
          },
          {
            id: "sl-2",
            studentId: "11111111-1111-1111-1111-111111111111",
            centerId: "center-1",
            level: 2,
            remarks: "Shy when speaking in English",
            assessedOn: new Date("2026-11-15T00:00:00Z"),
            skill: { id: "sk-2", name: "Spoken English", maxLevel: 5 },
            assessedByUser: { id: "teacher-1", fullName: "Teacher One" },
          },
        ],
        feePayments: [],
        activityEnrollments: [],
        alerts: [],
      };

      mockPrismaModel(t, "student", {
        findFirst: async () => mockStudent,
        findUnique: async () => mockStudent,
      });
      mockPrismaModel(t, "studentSkillLog", {
        findMany: async () => mockStudent.skillLogs,
      });
      mockPrismaModel(t, "formTemplate", { findFirst: async () => null });
      mockPrismaModel(t, "formSubmission", { findMany: async () => [] });
      mockPrismaModel(t, "parentStudent", { findMany: async () => [] });
      mockPrismaModel(t, "examScore", { findMany: async () => [] });
      mockPrismaModel(t, "activity", { findMany: async () => [] });
      mockPrismaModel(t, "alert", { findMany: async () => [] });
      mockPrismaModel(t, "auditLog", {
        findMany: async () => [],
        findFirst: async () => null,
        create: async ({ data }: any) => ({
          id: "aud-1",
          userId: data.userId,
          action: data.action,
          tableName: data.tableName,
          recordId: data.recordId,
          newData: data.newData,
          createdAt: new Date("2026-11-21T00:00:00Z"),
          user: { id: "teacher-1", fullName: "Teacher One" },
        }),
      });

      const briefing = await generateStudent360Briefing(teacherCenter1, mockStudent.id);
      assert.equal(briefing.studentName, "Rohan Sharma");
      assert.ok(briefing.parentNarrative.english.includes("Rohan Sharma"));
      assert.ok(briefing.parentNarrative.hindi.length > 20);
      assert.ok(briefing.parentNarrative.marathi.length > 20);
      assert.ok(briefing.staffNextSteps.length >= 1);

      const playbook = await generateCareerAndSkillPlaybook(teacherCenter1, mockStudent.id);
      assert.equal(playbook.recommendedPathways.length, 3);
      assert.equal(playbook.staffUpskillingProcedure.phase30Days.staffSteps.length, 3);
      assert.equal(playbook.staffUpskillingProcedure.phase60Days.staffSteps.length, 3);
      assert.equal(playbook.staffUpskillingProcedure.phase90Days.staffSteps.length, 3);
      assert.ok(playbook.recommendedSkillDrills.some((d) => d.skillName === "Spoken English"));

      const chatRes = await orchestrateChat(teacherCenter1, {
        message: "Summarize this student's skills and academic trajectory",
        context: {
          route: `/students/${mockStudent.id}`,
          studentId: mockStudent.id,
        },
      });
      assert.ok(chatRes.threadId);
      assert.ok(chatRes.toolsUsed.includes("get_student_360_dossier"));
      assert.ok(chatRes.reply.includes("Rohan Sharma"));
    } finally {
      if (prevKey !== undefined) process.env.GEMINI_API_KEY = prevKey;
    }
  });
});
