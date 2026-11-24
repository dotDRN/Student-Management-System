import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { ROLES } from "../config/rbac.js";
import { ForbiddenError, NotFoundError, ValidationError } from "../lib/errors.js";
import {
  bulkUpsertSkillLogs,
  createSkillLog,
  deleteSkillLog,
  getSkillMatrix,
  getSkillsByStudent,
  listSkillDefinitions,
  updateSkillLog,
} from "../services/skillService.js";
import type { JwtPayload } from "../utils/jwt.js";
import { mockPrismaModel, mockPrismaTransaction } from "./helpers/mockPrisma.js";

const SKILL_10PT_ID = "11111111-1111-4111-8111-111111111111";
const SKILL_5PT_ID = "22222222-2222-4222-8222-222222222222";
const SKILL_OTHER_PROG_ID = "33333333-3333-4333-8333-333333333333";

describe("Component 1.5: Skills Tracking & Skill Definitions", () => {
  const teacher: JwtPayload = {
    userId: "u-teacher",
    tenantId: "t1",
    email: "teacher@org.org",
    role: ROLES.TEACHER,
    centerIds: ["c1"],
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

  it("getSkillsByStudent enforces center access and uses safe assessor projection", async (t) => {
    let queriedSelect: unknown;

    mockPrismaModel(t, "student", {
      findUnique: async () => ({ id: "st-1", centerId: "c1", programId: "p1" }),
    });
    mockPrismaModel(t, "studentSkillLog", {
      findMany: async (args: { include?: { assessedByUser?: unknown } }) => {
        queriedSelect = args.include?.assessedByUser;
        return [
          {
            id: "log-1",
            studentId: "st-1",
            level: 4,
            skill: { id: SKILL_5PT_ID, name: "Communication", maxLevel: 5 },
            assessedByUser: { id: "u-teacher", fullName: "Teacher A" },
          },
        ];
      },
    });

    const rows = await getSkillsByStudent(teacher, "st-1");
    assert.equal(rows.length, 1);
    assert.deepEqual(queriedSelect, { select: { id: true, fullName: true } });

    mockPrismaModel(t, "student", {
      findUnique: async () => ({ id: "st-2", centerId: "c2", programId: "p1" }),
    });
    await assert.rejects(() => getSkillsByStudent(teacher, "st-2"), ForbiddenError);
  });

  it("createSkillLog derives student.centerId, enforces program match & maxLevel, and parses UTC assessedOn", async (t) => {
    const createdPayloads: Record<string, unknown>[] = [];

    mockPrismaModel(t, "student", {
      findUnique: async () => ({ id: "st-1", centerId: "c1", programId: "p1", isActive: true }),
    });
    mockPrismaModel(t, "skillDefinition", {
      findFirst: async () => ({
        id: SKILL_10PT_ID,
        programId: "p1",
        name: "Coding",
        maxLevel: 10,
        isActive: true,
      }),
    });
    mockPrismaModel(t, "studentSkillLog", {
      create: async (args: { data: Record<string, unknown> }) => {
        createdPayloads.push(args.data);
        return {
          id: "log-new",
          ...args.data,
          skill: { id: SKILL_10PT_ID, name: "Coding", maxLevel: 10 },
          assessedByUser: { id: "u-teacher", fullName: "Teacher A" },
        };
      },
    });

    const created = await createSkillLog(teacher, "st-1", {
      skillId: SKILL_10PT_ID,
      level: 8,
      remarks: "Strong progress",
      assessedOn: "2026-11-10",
      centerId: "c999-tampered",
    });

    assert.equal(created.id, "log-new");
    assert.equal(createdPayloads[0].centerId, "c1");
    assert.equal(createdPayloads[0].assessedBy, "u-teacher");
    assert.equal(createdPayloads[0].level, 8);
    assert.equal((createdPayloads[0].assessedOn as Date).toISOString(), "2026-11-10T00:00:00.000Z");

    await assert.rejects(
      () =>
        createSkillLog(teacher, "st-1", {
          skillId: SKILL_10PT_ID,
          level: 11,
        }),
      ValidationError,
    );

    mockPrismaModel(t, "skillDefinition", {
      findFirst: async () => ({
        id: SKILL_OTHER_PROG_ID,
        programId: "p2",
        name: "Other",
        maxLevel: 5,
        isActive: true,
      }),
    });
    await assert.rejects(
      () =>
        createSkillLog(teacher, "st-1", {
          skillId: SKILL_OTHER_PROG_ID,
          level: 3,
        }),
      ValidationError,
    );
  });

  it("createSkillLog blocks unassigned centers and inactive/missing students", async (t) => {
    mockPrismaModel(t, "student", {
      findUnique: async () => ({ id: "st-other", centerId: "c2", programId: "p1", isActive: true }),
    });
    await assert.rejects(
      () =>
        createSkillLog(teacher, "st-other", {
          skillId: SKILL_5PT_ID,
          level: 3,
        }),
      ForbiddenError,
    );

    mockPrismaModel(t, "student", {
      findUnique: async () => ({ id: "st-inactive", centerId: "c1", programId: "p1", isActive: false }),
    });
    await assert.rejects(
      () =>
        createSkillLog(techAdmin, "st-inactive", {
          skillId: SKILL_5PT_ID,
          level: 3,
        }),
      NotFoundError,
    );
  });

  it("updateSkillLog enforces center scope, target skill program, and maxLevel bounds", async (t) => {
    const updates: Record<string, unknown>[] = [];

    mockPrismaModel(t, "studentSkillLog", {
      findUnique: async () => ({
        id: "log-1",
        studentId: "st-1",
        centerId: "c1",
        skillId: SKILL_10PT_ID,
        level: 8,
        assessedOn: new Date("2026-11-01T00:00:00.000Z"),
        skill: { id: SKILL_10PT_ID, programId: "p1", maxLevel: 10 },
        student: { id: "st-1", centerId: "c1", programId: "p1" },
      }),
      update: async (args: { data: Record<string, unknown> }) => {
        updates.push(args.data);
        return { id: "log-1", ...args.data };
      },
    });
    mockPrismaModel(t, "skillDefinition", {
      findFirst: async () => ({
        id: SKILL_5PT_ID,
        programId: "p1",
        maxLevel: 5,
        isActive: true,
      }),
    });

    // Existing level (8) exceeds new skill's maxLevel (5) unless lowered
    await assert.rejects(
      () => updateSkillLog(teacher, "log-1", { skillId: SKILL_5PT_ID }),
      ValidationError,
    );

    await updateSkillLog(teacher, "log-1", {
      skillId: SKILL_5PT_ID,
      level: 4,
      assessedOn: "2026-11-12",
    });
    assert.equal(updates[0].skillId, SKILL_5PT_ID);
    assert.equal(updates[0].level, 4);
    assert.equal((updates[0].assessedOn as Date).toISOString(), "2026-11-12T00:00:00.000Z");

    mockPrismaModel(t, "studentSkillLog", {
      findUnique: async () => ({
        id: "log-c2",
        centerId: "c2",
        skillId: SKILL_5PT_ID,
        level: 2,
        assessedOn: new Date("2026-11-01T00:00:00.000Z"),
        skill: { id: SKILL_5PT_ID, programId: "p1", maxLevel: 5 },
        student: { id: "st-2", centerId: "c2", programId: "p1" },
      }),
    });
    await assert.rejects(
      () => updateSkillLog(teacher, "log-c2", { level: 3 }),
      ForbiddenError,
    );
  });

  it("deleteSkillLog enforces center access and listSkillDefinitions filters active skills", async (t) => {
    let deletedId: string | null = null;
    let listedWhere: Record<string, unknown> | null = null;

    mockPrismaModel(t, "studentSkillLog", {
      findUnique: async (args: { where: { id: string } }) =>
        args.where.id === "log-c2"
          ? { id: "log-c2", centerId: "c2" }
          : { id: "log-c1", centerId: "c1" },
      delete: async (args: { where: { id: string } }) => {
        deletedId = args.where.id;
        return { id: deletedId };
      },
    });

    await assert.rejects(() => deleteSkillLog(teacher, "log-c2"), ForbiddenError);
    await deleteSkillLog(teacher, "log-c1");
    assert.equal(deletedId, "log-c1");

    mockPrismaModel(t, "skillDefinition", {
      findMany: async (args: { where: Record<string, unknown> }) => {
        listedWhere = args.where;
        return [{ id: SKILL_5PT_ID, name: "A", programId: "p1", maxLevel: 5, isActive: true }];
      },
    });

    const defs = await listSkillDefinitions("p1");
    assert.equal(defs.length, 1);
    assert.deepEqual(listedWhere, { isActive: true, programId: "p1" });
  });
});

describe("Component 2.4: Bulk Class Skill Matrix & Batch Upsert", () => {
  const CENTER_1_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1";
  const CENTER_2_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2";
  const PROGRAM_1_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1";
  const PROGRAM_2_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2";
  const STUDENT_1_ID = "cccccccc-cccc-4ccc-8ccc-ccccccccccc1";
  const STUDENT_2_ID = "cccccccc-cccc-4ccc-8ccc-ccccccccccc2";

  const teacher: JwtPayload = {
    userId: "u-teacher",
    tenantId: "t1",
    email: "teacher@org.org",
    role: ROLES.TEACHER,
    centerIds: [CENTER_1_ID],
    isActive: true,
  };

  it("getSkillMatrix enforces center access and returns center/program matrix with UTC date", async (t) => {
    await assert.rejects(
      () => getSkillMatrix(teacher, { centerId: CENTER_2_ID, programId: PROGRAM_1_ID }),
      ForbiddenError,
    );

    mockPrismaModel(t, "student", {
      findMany: async () => [
        { id: STUDENT_1_ID, fullName: "Asha Rao", rollNumber: "01", programId: PROGRAM_1_ID, centerId: CENTER_1_ID },
      ],
    });
    mockPrismaModel(t, "skillDefinition", {
      findMany: async () => [
        { id: SKILL_5PT_ID, name: "Communication", maxLevel: 5, programId: PROGRAM_1_ID, isActive: true },
      ],
    });
    mockPrismaModel(t, "studentSkillLog", {
      findMany: async () => [
        {
          id: "log-existing",
          studentId: STUDENT_1_ID,
          skillId: SKILL_5PT_ID,
          level: 4,
          remarks: "Strong clarity",
          assessedOn: new Date("2026-11-12T00:00:00.000Z"),
        },
      ],
    });

    const matrix = await getSkillMatrix(teacher, {
      centerId: CENTER_1_ID,
      programId: PROGRAM_1_ID,
      assessedOn: "2026-11-12",
    });
    assert.equal(matrix.assessedOn, "2026-11-12");
    assert.equal(matrix.students.length, 1);
    assert.equal(matrix.skills.length, 1);
    assert.equal(matrix.existingLogs.length, 1);
  });

  it("bulkUpsertSkillLogs validates center, active student, program match & maxLevel, then atomically creates/updates", async (t) => {
    await assert.rejects(
      () =>
        bulkUpsertSkillLogs(teacher, {
          centerId: CENTER_2_ID,
          entries: [{ studentId: STUDENT_1_ID, skillId: SKILL_5PT_ID, level: 3 }],
        }),
      ForbiddenError,
    );

    mockPrismaModel(t, "student", {
      findMany: async () => [
        { id: STUDENT_1_ID, fullName: "Asha Rao", centerId: CENTER_1_ID, programId: PROGRAM_1_ID, isActive: true },
        { id: STUDENT_2_ID, fullName: "Rohan Das", centerId: CENTER_1_ID, programId: PROGRAM_1_ID, isActive: true },
      ],
    });
    mockPrismaModel(t, "skillDefinition", {
      findMany: async () => [
        { id: SKILL_5PT_ID, name: "Communication", programId: PROGRAM_1_ID, maxLevel: 5, isActive: true },
        { id: SKILL_OTHER_PROG_ID, name: "Other Prog Skill", programId: PROGRAM_2_ID, maxLevel: 5, isActive: true },
      ],
    });

    // Rejects level above maxLevel
    await assert.rejects(
      () =>
        bulkUpsertSkillLogs(teacher, {
          centerId: CENTER_1_ID,
          programId: PROGRAM_1_ID,
          assessedOn: "2026-11-12",
          entries: [{ studentId: STUDENT_1_ID, skillId: SKILL_5PT_ID, level: 6 }],
        }),
      ValidationError,
    );

    // Rejects program mismatch between skill definition and student
    await assert.rejects(
      () =>
        bulkUpsertSkillLogs(teacher, {
          centerId: CENTER_1_ID,
          programId: PROGRAM_1_ID,
          assessedOn: "2026-11-12",
          entries: [{ studentId: STUDENT_1_ID, skillId: SKILL_OTHER_PROG_ID, level: 3 }],
        }),
      ValidationError,
    );

    const updates: Record<string, unknown>[] = [];
    const creates: Record<string, unknown>[] = [];
    mockPrismaTransaction(t, () => ({
      studentSkillLog: {
        findMany: async () => [
          {
            id: "existing-log-1",
            studentId: STUDENT_1_ID,
            skillId: SKILL_5PT_ID,
            level: 2,
            remarks: "Old note",
          },
        ],
        update: async (args: { data: Record<string, unknown> }) => {
          updates.push(args.data);
          return { id: "existing-log-1", ...args.data };
        },
        create: async (args: { data: Record<string, unknown> }) => {
          creates.push(args.data);
          return { id: "new-log-1", ...args.data };
        },
      },
    }));

    const result = await bulkUpsertSkillLogs(teacher, {
      centerId: CENTER_1_ID,
      programId: PROGRAM_1_ID,
      assessedOn: "2026-11-12",
      entries: [
        { studentId: STUDENT_1_ID, skillId: SKILL_5PT_ID, level: 4, remarks: "Improved" },
        { studentId: STUDENT_2_ID, skillId: SKILL_5PT_ID, level: 5 },
      ],
    });

    assert.equal(result.assessedOn, "2026-11-12");
    assert.equal(result.updatedCount, 1);
    assert.equal(result.createdCount, 1);
    assert.equal(result.savedCount, 2);
    assert.equal(updates[0].level, 4);
    assert.equal((creates[0].assessedOn as Date).toISOString(), "2026-11-12T00:00:00.000Z");
  });
});
