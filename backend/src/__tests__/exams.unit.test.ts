import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { ROLES } from "../config/rbac.js";
import { ForbiddenError, ValidationError } from "../lib/errors.js";
import {
  createExam,
  getExamComparison,
  getExamSheet,
  listExams,
  upsertExamScores,
} from "../services/examService.js";
import { getStudentProfile } from "../services/student.service.js";
import type { JwtPayload } from "../utils/jwt.js";
import { mockPrismaModel, mockPrismaTransaction } from "./helpers/mockPrisma.js";

const YEAR_UUID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const PROGRAM_UUID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const CENTER_1 = "cccccccc-cccc-4ccc-8ccc-ccccccccccc1";
const CENTER_2 = "cccccccc-cccc-4ccc-8ccc-ccccccccccc2";
const STUDENT_1 = "dddddddd-dddd-4ddd-8ddd-ddddddddddd1";
const STUDENT_2 = "dddddddd-dddd-4ddd-8ddd-ddddddddddd2";
const SUBJ_MATH = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee1";
const SUBJ_OTHER_PROG = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee9";

describe("Component 1.6: Exams, Subjects, Score Upserts & Comparison", () => {
  const supervisor: JwtPayload = {
    userId: "u-sup",
    tenantId: "t1",
    email: "sup@org.org",
    role: ROLES.SUPERVISOR,
    centerIds: [CENTER_1],
    isActive: true,
  };

  const teacher: JwtPayload = {
    userId: "u-teach",
    tenantId: "t1",
    email: "teach@org.org",
    role: ROLES.TEACHER,
    centerIds: [CENTER_1],
    isActive: true,
  };

  const techAdmin: JwtPayload = {
    userId: "u-tech",
    tenantId: "t1",
    email: "tech@org.org",
    role: ROLES.TECH_ADMIN,
    centerIds: [],
    isActive: true,
  };

  it("createExam resolves AcademicYear label to UUID, uses UTC examDate, and rejects unauthorized centers", async (t) => {
    const queriedExistingWheres: Record<string, unknown>[] = [];
    const createdDatas: Record<string, unknown>[] = [];

    mockPrismaModel(t, "academicYear", {
      findFirst: async (args: { where: { label?: string } }) =>
        args.where.label === "2026-27" ? { id: YEAR_UUID, label: "2026-27" } : null,
    });
    mockPrismaModel(t, "program", {
      findFirst: async () => ({ id: PROGRAM_UUID, isActive: true }),
    });
    mockPrismaModel(t, "center", {
      findFirst: async ({ where }: { where: { id: string } }) => ({
        id: where.id,
        isActive: true,
      }),
    });
    mockPrismaModel(t, "exam", {
      findFirst: async (args: { where: Record<string, unknown> }) => {
        queriedExistingWheres.push(args.where);
        return null;
      },
      create: async (args: { data: Record<string, unknown> }) => {
        createdDatas.push(args.data);
        return { id: "ex-1", ...args.data };
      },
    });

    const created = await createExam(supervisor, {
      centerIds: [CENTER_1],
      programId: PROGRAM_UUID,
      examType: "baseline",
      academicYearId: "2026-27",
      examDate: "2026-11-10",
    });

    assert.equal(created.length, 1);
    assert.equal(queriedExistingWheres[0].academicYearId, YEAR_UUID);
    assert.equal(createdDatas[0].academicYearId, YEAR_UUID);
    assert.equal((createdDatas[0].examDate as Date).toISOString(), "2026-11-10T00:00:00.000Z");

    await assert.rejects(
      () =>
        createExam(supervisor, {
          centerIds: [CENTER_2],
          programId: PROGRAM_UUID,
          examType: "baseline",
          academicYearId: "2026-27",
          examDate: "2026-11-10",
        }),
      ForbiddenError,
    );
  });

  it("listExams blocks cross-center query param spoofing and uses UTC date window", async (t) => {
    const capturedWheres: Record<string, unknown>[] = [];

    mockPrismaModel(t, "academicYear", {
      findUnique: async () => ({ id: YEAR_UUID, label: "2026-27" }),
      findFirst: async () => ({ id: YEAR_UUID, label: "2026-27" }),
    });
    mockPrismaModel(t, "exam", {
      findMany: async (args: { where: Record<string, unknown> }) => {
        capturedWheres.push(args.where);
        return [];
      },
    });

    await assert.rejects(
      () => listExams(teacher, { centerId: CENTER_2 }),
      ForbiddenError,
    );

    await listExams(techAdmin, {
      centerId: CENTER_2,
      examDate: "2026-11-10",
    });

    const dateFilter = capturedWheres[0].examDate as { gte: Date; lt: Date };
    assert.equal(capturedWheres[0].centerId, CENTER_2);
    assert.equal(dateFilter.gte.toISOString(), "2026-11-10T00:00:00.000Z");
    assert.equal(dateFilter.lt.toISOString(), "2026-11-11T00:00:00.000Z");
  });

  it("getExamSheet returns program subjects alongside students and scores", async (t) => {
    mockPrismaModel(t, "exam", {
      findUnique: async () => ({
        id: "ex-1",
        centerId: CENTER_1,
        programId: PROGRAM_UUID,
        examType: "baseline",
        examDate: new Date("2026-11-10T00:00:00.000Z"),
        center: { id: CENTER_1, name: "Center 1" },
        program: { id: PROGRAM_UUID, name: "P1" },
        academicYear: { id: YEAR_UUID, label: "2026-27" },
      }),
    });
    mockPrismaModel(t, "student", {
      findMany: async () => [{ id: STUDENT_1, fullName: "Asha", rollNumber: "01" }],
    });
    mockPrismaModel(t, "programSubject", {
      findMany: async () => [{ id: SUBJ_MATH, name: "Mathematics", maxMarks: 100 }],
    });
    mockPrismaModel(t, "examScore", {
      findMany: async () => [],
    });

    const sheet = await getExamSheet(teacher, "ex-1");
    assert.equal(sheet.students.length, 1);
    assert.equal(sheet.subjects.length, 1);
    assert.equal(sheet.subjects[0].name, "Mathematics");
  });

  it("upsertExamScores validates student enrollment, program subjects, marks bounds, and clears absent marks", async (t) => {
    const upsertedCreates: Record<string, unknown>[] = [];

    mockPrismaModel(t, "exam", {
      findUnique: async () => ({
        id: "ex-1",
        centerId: CENTER_1,
        programId: PROGRAM_UUID,
        program: {
          subjects: [{ id: SUBJ_MATH, name: "Mathematics", maxMarks: 50 }],
        },
      }),
    });
    mockPrismaModel(t, "student", {
      findMany: async () => [{ id: STUDENT_1 }, { id: STUDENT_2 }],
    });
    mockPrismaModel(t, "examScore", {
      upsert: async (args: { create: Record<string, unknown> }) => {
        upsertedCreates.push(args.create);
        return args.create;
      },
    });
    mockPrismaTransaction(t);

    // Rejects marks exceeding subject maxMarks (50)
    await assert.rejects(
      () =>
        upsertExamScores(teacher, "ex-1", {
          scores: [{ studentId: STUDENT_1, subjectId: SUBJ_MATH, marks: 65 }],
        }),
      ValidationError,
    );

    // Rejects subject from another program
    await assert.rejects(
      () =>
        upsertExamScores(teacher, "ex-1", {
          scores: [{ studentId: STUDENT_1, subjectId: SUBJ_OTHER_PROG, marks: 20 }],
        }),
      ValidationError,
    );

    // Rejects student not actively enrolled in this exam's center+program
    await assert.rejects(
      () =>
        upsertExamScores(teacher, "ex-1", {
          scores: [{ studentId: "ffffffff-ffff-4fff-8fff-ffffffffffff", subjectId: SUBJ_MATH, marks: 20 }],
        }),
      ValidationError,
    );

    const res = await upsertExamScores(teacher, "ex-1", {
      scores: [
        { studentId: STUDENT_1, subjectId: SUBJ_MATH, marks: 42, isAbsent: false },
        { studentId: STUDENT_2, subjectId: SUBJ_MATH, marks: 10, isAbsent: true, remarks: "Sick" },
      ],
    });

    assert.equal(res.success, true);
    assert.equal(res.count, 2);
    assert.equal(Number(upsertedCreates[0].marks), 42);
    assert.equal(upsertedCreates[1].marks, null);
    assert.equal(upsertedCreates[1].isAbsent, true);
    assert.equal(upsertedCreates[1].centerId, CENTER_1);
  });

  it("getExamComparison excludes absent/null scores and computes accurate growth", async (t) => {
    mockPrismaModel(t, "exam", {
      findMany: async () => [
        {
          id: "ex-base",
          examType: "baseline",
          scores: [
            { isAbsent: false, marks: 60, subject: { name: "Math" } },
            { isAbsent: true, marks: null, subject: { name: "Math" } },
          ],
        },
        {
          id: "ex-end",
          examType: "endline",
          scores: [
            { isAbsent: false, marks: 90, subject: { name: "Math" } },
          ],
        },
      ],
    });

    await assert.rejects(
      () => getExamComparison(teacher, { centerId: CENTER_2 }),
      ForbiddenError,
    );

    const comp = await getExamComparison(teacher, { centerId: CENTER_1 });
    assert.equal(comp.perSubject.length, 1);
    assert.equal(comp.perSubject[0].subject, "math");
    assert.equal(comp.perSubject[0].baselineAvg, 60);
    assert.equal(comp.perSubject[0].endlineAvg, 90);
    assert.equal(comp.perSubject[0].growth, 50);
  });
});

describe("Component 2.5: Cohort Subject Analysis & Multi-Term Report Card", () => {
  const teacher: JwtPayload = {
    userId: "u-teach",
    tenantId: "t1",
    email: "teach@org.org",
    role: ROLES.TEACHER,
    centerIds: [CENTER_1],
    isActive: true,
  };

  it("computes cohort percentages from dynamic maxMarks, keeps non-absent 0 marks, and ranks top/bottom subjects per term", async (t) => {
    mockPrismaModel(t, "exam", {
      findMany: async () => [
        {
          id: "ex-b",
          examType: "baseline",
          scores: [
            // Math maxMarks 50 -> 40/50 = 80% (pass), 10/50 = 20% (fail) -> avg 50%, passRate 50%
            { isAbsent: false, marks: 40, subject: { name: "Math", maxMarks: 50 } },
            { isAbsent: false, marks: 10, subject: { name: "Math", maxMarks: 50 } },
            // Absent score excluded
            { isAbsent: true, marks: 0, subject: { name: "Math", maxMarks: 50 } },
            // English maxMarks 100 -> genuine 0 included (0% fail), 80 (80% pass) -> avg 40%, passRate 50%
            { isAbsent: false, marks: 0, subject: { name: "English", maxMarks: 100 } },
            { isAbsent: false, marks: 80, subject: { name: "English", maxMarks: 100 } },
          ],
        },
        {
          id: "ex-m",
          examType: "midline",
          scores: [
            { isAbsent: false, marks: 45, subject: { name: "Math", maxMarks: 50 } }, // 90%
            { isAbsent: false, marks: 30, subject: { name: "English", maxMarks: 100 } }, // 30%
          ],
        },
        {
          id: "ex-e",
          examType: "endline",
          scores: [
            { isAbsent: false, marks: 50, subject: { name: "Math", maxMarks: 50 } }, // 100%
            { isAbsent: false, marks: 70, subject: { name: "English", maxMarks: 100 } }, // 70%
          ],
        },
      ],
    });

    const comp = await getExamComparison(teacher, { centerId: CENTER_1 });
    assert.equal(comp.passThresholdPct, 40);

    const math = comp.perSubject.find((s) => s.subject === "math");
    const english = comp.perSubject.find((s) => s.subject === "english");
    assert.ok(math && english);

    assert.equal(math.maxMarks, 50);
    assert.equal(math.baselineAvg, 50);
    assert.equal(math.baselineCount, 2);
    assert.equal(math.baselinePassRate, 50);
    assert.equal(math.midlineAvg, 90);
    assert.equal(math.endlineAvg, 100);
    assert.equal(math.growth, 100);
    assert.equal(math.midlineGrowth, 80);

    assert.equal(english.baselineAvg, 40);
    assert.equal(english.baselineCount, 2);
    assert.equal(english.baselinePassRate, 50);

    assert.equal(comp.byTerm.midline.gradedCount, 2);
    assert.equal(comp.byTerm.midline.avgPct, 60);
    assert.equal(comp.byTerm.midline.passRatePct, 50);
    assert.equal(comp.byTerm.midline.topSubject?.subject, "math");
    assert.equal(comp.byTerm.midline.bottomSubject?.subject, "english");
    assert.equal(comp.byTerm.endline.passRatePct, 100);
  });

  it("includes baseline, midline, endline, academicYearLabel, and skill maxLevel in getStudentProfile", async (t) => {
    mockPrismaModel(t, "student", {
      findFirst: async () => ({
        id: STUDENT_1,
        fullName: "Asha Rao",
        centerId: CENTER_1,
        programId: PROGRAM_UUID,
        center: { id: CENTER_1, name: "Center One" },
        program: { id: PROGRAM_UUID, name: "Foundation" },
        attendanceRecords: [],
        examScores: [
          {
            marks: 40,
            isAbsent: false,
            exam: { examType: "baseline", academicYear: { id: YEAR_UUID, label: "2026-27" } },
            subject: { name: "Math", maxMarks: 50 },
          },
          {
            marks: 0,
            isAbsent: false,
            exam: { examType: "midline", academicYear: { id: YEAR_UUID, label: "2026-27" } },
            subject: { name: "Math", maxMarks: 50 },
          },
          {
            marks: 45,
            isAbsent: false,
            exam: { examType: "endline", academicYear: { id: YEAR_UUID, label: "2026-27" } },
            subject: { name: "Math", maxMarks: 50 },
          },
          {
            marks: null,
            isAbsent: true,
            exam: { examType: "endline", academicYear: { id: YEAR_UUID, label: "2026-27" } },
            subject: { name: "Science", maxMarks: 100 },
          },
        ],
        formSubmissions: [],
      }),
    });
    mockPrismaModel(t, "studentSkillLog", {
      findMany: async () => [
        { level: 8, skill: { name: "Coding", maxLevel: 10 } },
      ],
    });
    mockPrismaModel(t, "formTemplate", { findFirst: async () => null });
    mockPrismaModel(t, "parentStudent", { findMany: async () => [] });

    const profile = await getStudentProfile(teacher, STUDENT_1);
    assert.equal(profile.academicYearLabel, "2026-27");
    // (80 + 0 + 90) / 3 = 56.7% (absent Science excluded, non-absent 0 Math midline retained)
    assert.equal(profile.stats.avgExamPct, 56.7);
    const mathRow = profile.examComparison.find((r) => r.subject === "Math");
    assert.ok(mathRow);
    assert.equal(mathRow.baseline, 80);
    assert.equal(mathRow.baselineMarks, 40);
    assert.equal(mathRow.midline, 0);
    assert.equal(mathRow.midlineMarks, 0);
    assert.equal(mathRow.endline, 90);
    assert.equal(profile.skillRadar[0].maxLevel, 10);
  });
});
