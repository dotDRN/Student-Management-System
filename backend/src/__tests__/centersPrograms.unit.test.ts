import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { ROLES } from "../config/rbac.js";
import { AppError, NotFoundError, ValidationError } from "../lib/errors.js";
import {
  listCenters,
  getCenterDetails,
  updateCenter,
  deleteCenter,
  assignProgramToCenter,
  removeProgramFromCenter,
  assignUserToCenter,
  removeUserFromCenter,
  createProgram,
  getProgramDetails,
  createProgramSubject,
  updateProgramSubject,
  deleteProgramSubject,
  createSkillDefinition,
  updateSkillDefinition,
  deleteSkillDefinition,
} from "../services/centerService.js";
import { getTodayUtcDateOnly } from "../utils/dateOnly.js";
import { resolveAcademicYearId } from "../utils/academicYear.js";
import {
  assignCenterUserSchema,
  createProgramSchema,
  createProgramSubjectSchema,
  createSkillDefinitionSchema,
  updateProgramSchema,
} from "../validators/schemas.js";
import type { JwtPayload } from "../utils/jwt.js";
import { mockPrismaModel, mockPrismaTransaction } from "./helpers/mockPrisma.js";

describe("Component 1.2: Centers, Programs & Academic Years", () => {
  const teacher: JwtPayload = {
    userId: "u-teacher",
    tenantId: "t1",
    email: "teacher@org.org",
    role: ROLES.TEACHER,
    centerIds: ["c-assigned"],
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

  it("scopes listCenters to assigned centerIds for non-global roles and leaves global admins unscoped", async (t) => {
    const capturedWheres: unknown[] = [];
    mockPrismaModel(t, "center", {
      findMany: async (args: { where?: unknown }) => {
        capturedWheres.push(args?.where);
        return [];
      },
    });

    await listCenters(teacher);
    await listCenters(techAdmin);

    assert.deepEqual(capturedWheres[0], {
      isActive: true,
      id: { in: ["c-assigned"] },
    });
    assert.deepEqual(capturedWheres[1], {
      isActive: true,
    });
  });

  it("allows tech_admin into getCenterDetails and blocks unassigned non-global users", async (t) => {
    mockPrismaModel(t, "userCenterAssignment", {
      findFirst: async () => null,
      findMany: async () => [],
    });
    mockPrismaModel(t, "center", {
      findUnique: async () => ({
        id: "c1",
        name: "Center One",
        location: "Mumbai",
        isActive: true,
        centerPrograms: [],
      }),
    });
    mockPrismaModel(t, "student", {
      findMany: async () => [],
      count: async () => 0,
    });

    await assert.rejects(() => getCenterDetails(teacher, "c1"), NotFoundError);
    const details = await getCenterDetails(techAdmin, "c1");
    assert.equal(details.name, "Center One");
  });

  it("soft-deactivates centers instead of hard-deleting and returns 404/409 properly", async (t) => {
    let findCount = 0;
    let studentCount = 3;
    mockPrismaModel(t, "center", {
      findUnique: async () => {
        findCount += 1;
        if (findCount === 1) return null;
        return { id: "c1", name: "Center 1", isActive: true };
      },
    });
    mockPrismaModel(t, "student", {
      count: async () => studentCount,
    });

    await assert.rejects(() => deleteCenter("missing"), NotFoundError);

    await assert.rejects(() => deleteCenter("c1"), (err: unknown) => {
      return err instanceof AppError && err.statusCode === 409;
    });

    studentCount = 0;
    let softUpdated = false;
    mockPrismaTransaction(t, () => ({
      centerProgram: {
        updateMany: async () => ({ count: 1 }),
      },
      center: {
        update: async ({ data }: { data: { isActive: boolean } }) => {
          softUpdated = data.isActive === false;
          return { id: "c1", isActive: data.isActive };
        },
      },
    }));

    const deleted = await deleteCenter("c1");
    assert.equal(softUpdated, true);
    assert.equal(deleted.isActive, false);
  });

  it("rejects inverted min/max ages on programs and scopes program details students by center", async (t) => {
    assert.equal(
      createProgramSchema.safeParse({ code: "P1", name: "Test", ageMin: 15, ageMax: 10 }).success,
      false,
    );
    assert.equal(
      updateProgramSchema.safeParse({ ageMin: 12, ageMax: 8 }).success,
      false,
    );

    await assert.rejects(
      () => createProgram({ code: "P1", name: "Program", ageMin: 12, ageMax: 8 }),
      ValidationError,
    );

    const capturedStudentWhere: unknown[] = [];
    mockPrismaModel(t, "program", {
      findUnique: async () => ({
        id: "p1",
        code: "P1",
        name: "Program",
        centerPrograms: [],
      }),
    });
    mockPrismaModel(t, "student", {
      findMany: async (args: { where?: unknown }) => {
        capturedStudentWhere.push(args.where);
        return [];
      },
      count: async () => 0,
    });

    await getProgramDetails("p1", teacher);
    assert.deepEqual(capturedStudentWhere[0], {
      programId: "p1",
      isActive: true,
      centerId: { in: ["c-assigned"] },
    });
  });

  it("resolves AcademicYear by UUID, label, and strict/fallback options", async (t) => {
    const validUuid = "11111111-1111-4111-8111-111111111111";
    mockPrismaModel(t, "academicYear", {
      findUnique: async ({ where }: { where: { id: string } }) =>
        where.id === validUuid ? { id: validUuid } : null,
      findFirst: async ({ where }: { where?: { label?: string; isCurrent?: boolean } }) => {
        if (where?.label === "2026-27") return { id: "year-2026-id" };
        if (where?.isCurrent) return { id: "year-current-id" };
        return null;
      },
    });

    assert.equal(await resolveAcademicYearId(validUuid), validUuid);
    assert.equal(await resolveAcademicYearId("2026-27"), "year-2026-id");
    assert.equal(await resolveAcademicYearId(undefined, { fallbackToCurrent: true }), "year-current-id");
    await assert.rejects(() => resolveAcademicYearId("unknown-year", { strict: true }), ValidationError);
  });

  it("blocks center_admin mutations on unassigned centers and enforces UTC assignment revocation", async (t) => {
    const centerAdmin: JwtPayload = {
      userId: "u-ca",
      tenantId: "t1",
      email: "ca@org.org",
      role: ROLES.CENTER_ADMIN,
      centerIds: ["c-own"],
      isActive: true,
    };

    for (const call of [
      () => updateCenter("c-other", { name: "New" }, centerAdmin),
      () => deleteCenter("c-other", centerAdmin),
      () => assignProgramToCenter("c-other", "p1", centerAdmin),
      () => removeProgramFromCenter("c-other", "p1", centerAdmin),
      () => assignUserToCenter("u-ca", "c-other", { userId: "u2" }, centerAdmin),
      () => removeUserFromCenter("c-other", "u2", centerAdmin),
    ]) {
      await assert.rejects(call, (err: unknown) => err instanceof AppError && err.statusCode === 403);
    }

    assert.equal(
      assignCenterUserSchema.safeParse({
        userId: "11111111-1111-4111-8111-111111111111",
        validFrom: "2026-05-10",
        validUntil: "2026-05-01",
      }).success,
      false,
    );

    mockPrismaModel(t, "center", {
      findUnique: async () => ({ id: "c-own", isActive: true }),
    });
    mockPrismaModel(t, "user", {
      findUnique: async () => ({ id: "u2", isActive: true }),
    });
    mockPrismaModel(t, "userCenterAssignment", {
      findFirst: async () => ({ id: "a1", centerId: "c-own", userId: "u2", validFrom: new Date("2026-01-01T00:00:00.000Z") }),
      update: async ({ data }: { data: { validUntil?: Date } }) => ({ id: "a1", ...data }),
    });

    await assert.rejects(
      () =>
        assignUserToCenter(
          "u-ca",
          "c-own",
          { userId: "u2", validFrom: "2026-06-10", validUntil: "2026-06-05" },
          centerAdmin,
        ),
      ValidationError,
    );

    const revoked = await removeUserFromCenter("c-own", "u2", centerAdmin);
    assert.ok(revoked.validUntil);
    assert.ok(revoked.validUntil.getTime() < getTodayUtcDateOnly().getTime());
  });

  it("supports ProgramSubject and SkillDefinition CRUD with 409 duplicates and soft-deactivation", async (t) => {
    assert.equal(createProgramSubjectSchema.safeParse({ name: "Maths", maxMarks: 0 }).success, false);
    assert.equal(createSkillDefinitionSchema.safeParse({ name: "Reading", maxLevel: 25 }).success, false);

    mockPrismaModel(t, "program", {
      findUnique: async () => ({ id: "p1", isActive: true }),
    });

    let activeSubjectConflict = true;
    mockPrismaModel(t, "programSubject", {
      findFirst: async ({ where }: { where?: { id?: { not?: string } } }) => {
        if (where?.id?.not) return null;
        return activeSubjectConflict
          ? { id: "s1", programId: "p1", name: "Maths", maxMarks: 100, isActive: true }
          : { id: "s2", programId: "p1", name: "Science", maxMarks: 100, isActive: false };
      },
      update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => ({
        id: where.id,
        programId: "p1",
        ...data,
      }),
      findUnique: async ({ where }: { where: { id: string } }) =>
        where.id === "s1" || where.id === "s2"
          ? { id: where.id, programId: "p1", name: "Maths", maxMarks: 100, isActive: true }
          : null,
      delete: async ({ where }: { where: { id: string } }) => ({ id: where.id }),
    });

    await assert.rejects(
      () => createProgramSubject("p1", { name: "maths", maxMarks: 100 }),
      (err: unknown) => err instanceof AppError && err.statusCode === 409,
    );

    activeSubjectConflict = false;
    const reactivated = await createProgramSubject("p1", { name: "Science", maxMarks: 50 });
    assert.equal(reactivated.isActive, true);
    assert.equal(reactivated.maxMarks, 50);

    const updatedSub = await updateProgramSubject("p1", "s1", { name: "Applied Maths", maxMarks: 80 });
    assert.equal(updatedSub.name, "Applied Maths");

    let scoreCount = 4;
    mockPrismaModel(t, "examScore", {
      count: async () => scoreCount,
    });
    const softSub = await deleteProgramSubject("p1", "s1");
    assert.deepEqual(softSub, { id: "s1", deleted: false, deactivated: true });

    scoreCount = 0;
    const hardSub = await deleteProgramSubject("p1", "s2");
    assert.deepEqual(hardSub, { id: "s2", deleted: true, deactivated: false });

    mockPrismaModel(t, "skillDefinition", {
      findFirst: async () => null,
      create: async ({ data }: { data: Record<string, unknown> }) => ({ id: "sk1", ...data }),
      findUnique: async ({ where }: { where: { id: string } }) =>
        where.id === "sk1" ? { id: "sk1", programId: "p1", name: "Phonics", maxLevel: 5, isActive: true } : null,
      update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => ({
        id: where.id,
        programId: "p1",
        ...data,
      }),
      delete: async ({ where }: { where: { id: string } }) => ({ id: where.id }),
    });

    const createdSkill = await createSkillDefinition("p1", { name: "Phonics", maxLevel: 5 });
    assert.equal(createdSkill.name, "Phonics");
    const updatedSkill = await updateSkillDefinition("p1", "sk1", { maxLevel: 10 });
    assert.equal(updatedSkill.maxLevel, 10);

    let skillLogCount = 2;
    mockPrismaModel(t, "studentSkillLog", {
      count: async () => skillLogCount,
    });
    assert.deepEqual(await deleteSkillDefinition("p1", "sk1"), {
      id: "sk1",
      deleted: false,
      deactivated: true,
    });

    skillLogCount = 0;
    assert.deepEqual(await deleteSkillDefinition("p1", "sk1"), {
      id: "sk1",
      deleted: true,
      deactivated: false,
    });
  });

  it("includes staffAssignments in getCenterDetails and subjects/skillDefinitions in getProgramDetails", async (t) => {
    mockPrismaModel(t, "userCenterAssignment", {
      findMany: async () => [
        {
          id: "ua1",
          userId: "u-ca",
          validFrom: new Date("2026-01-01T00:00:00.000Z"),
          validUntil: null,
          user: { id: "u-ca", fullName: "Admin A", email: "ca@org.org", role: ROLES.CENTER_ADMIN, isActive: true },
        },
        {
          id: "ua2",
          userId: "u-t",
          validFrom: new Date("2026-01-01T00:00:00.000Z"),
          validUntil: null,
          user: { id: "u-t", fullName: "Teacher B", email: "tb@org.org", role: ROLES.TEACHER, isActive: true },
        },
      ],
    });
    mockPrismaModel(t, "center", {
      findUnique: async () => ({
        id: "c1",
        name: "Center 1",
        location: "Pune",
        isActive: true,
        centerPrograms: [],
      }),
    });
    mockPrismaModel(t, "student", {
      findMany: async () => [],
      count: async () => 0,
    });

    const centerDetail = await getCenterDetails(techAdmin, "c1");
    assert.equal(centerDetail.staffAssignments.length, 2);
    assert.equal(centerDetail.teachers.length, 1);
    assert.equal(centerDetail.userCount, 2);

    mockPrismaModel(t, "program", {
      findUnique: async () => ({
        id: "p1",
        code: "PRI",
        name: "Primary",
        centerPrograms: [],
        subjects: [{ id: "sub1", programId: "p1", name: "English", maxMarks: 100, isActive: true }],
        skillDefinitions: [{ id: "sk1", programId: "p1", name: "Speaking", maxLevel: 5, isActive: true }],
      }),
    });
    const programDetail = await getProgramDetails("p1", techAdmin);
    assert.equal(programDetail.subjects.length, 1);
    assert.equal(programDetail.skillDefinitions.length, 1);
  });
});
