import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { ROLES } from "../config/rbac.js";
import { AppError, NotFoundError, ValidationError } from "../lib/errors.js";
import {
  listCenters,
  getCenterDetails,
  deleteCenter,
  createProgram,
  getProgramDetails,
} from "../services/centerService.js";
import { resolveAcademicYearId } from "../utils/academicYear.js";
import { createProgramSchema, updateProgramSchema } from "../validators/schemas.js";
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
});
