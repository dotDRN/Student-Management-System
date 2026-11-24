import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ROLES } from "../config/rbac.js";
import {
  ConflictError,
  ForbiddenError,
  ValidationError,
} from "../lib/errors.js";
import {
  createAcademicYear,
  setCurrentAcademicYear,
} from "../services/academicYearService.js";
import { promoteStudentCohort } from "../services/student.service.js";
import {
  createAcademicYearSchema,
  promoteStudentCohortSchema,
} from "../validators/schemas.js";
import { mockPrismaModel, mockPrismaTransaction } from "./helpers/mockPrisma.js";

const YEAR_2026 = "11111111-1111-4111-8111-111111111111";
const YEAR_2027 = "22222222-2222-4222-8222-222222222222";
const CENTER_1 = "33333333-3333-4333-8333-333333333333";
const CENTER_2 = "44444444-4444-4444-8444-444444444444";
const PROG_1 = "55555555-5555-4555-8555-555555555555";
const PROG_2 = "66666666-6666-4666-8666-666666666666";
const STU_1 = "77777777-7777-4777-8777-777777777777";
const STU_2 = "88888888-8888-4888-8888-888888888888";
const STU_3 = "99999999-9999-4999-8999-999999999999";

const adminUser = { userId: "admin-1", role: ROLES.CENTER_ADMIN, centerIds: [CENTER_1] };
const teacherUser = { userId: "teacher-1", role: ROLES.TEACHER, centerIds: [CENTER_1] };

describe("Component 3.3: Academic Year Lifecycle & Cohort Transitions", () => {
  it("validates AcademicYear creation date order, duplicates, and switches isCurrent atomically", async (t) => {
    assert.equal(
      createAcademicYearSchema.safeParse({
        label: "2027-28",
        startDate: "2027-04-01",
        endDate: "2028-03-31",
      }).success,
      true,
    );

    await assert.rejects(
      () =>
        createAcademicYear(teacherUser, {
          label: "2027-28",
          startDate: "2027-04-01",
          endDate: "2028-03-31",
        }),
      ForbiddenError,
    );

    await assert.rejects(
      () =>
        createAcademicYear(adminUser, {
          label: "2027-28",
          startDate: "2028-04-01",
          endDate: "2027-03-31",
        }),
      ValidationError,
    );

    mockPrismaModel(t, "academicYear", {
      findFirst: async () => ({ id: YEAR_2026 }),
    });

    await assert.rejects(
      () =>
        createAcademicYear(adminUser, {
          label: "2026-27",
          startDate: "2026-04-01",
          endDate: "2027-03-31",
        }),
      ConflictError,
    );

    const txOps: string[] = [];
    mockPrismaModel(t, "academicYear", {
      findFirst: async () => null,
      findUnique: async () => ({ id: YEAR_2027 }),
    });
    mockPrismaTransaction(t, () => ({
      academicYear: {
        updateMany: async () => {
          txOps.push("unsetPrevious");
          return { count: 1 };
        },
        create: async (args: { data: Record<string, unknown> }) => {
          txOps.push("createYear");
          return { id: YEAR_2027, ...args.data };
        },
        update: async () => {
          txOps.push("setCurrent");
          return { id: YEAR_2027, isCurrent: true };
        },
      },
    }));

    const created = await createAcademicYear(adminUser, {
      label: "2027-28",
      startDate: "2027-04-01",
      endDate: "2028-03-31",
      isCurrent: true,
    });
    assert.equal((created as { id: string }).id, YEAR_2027);
    assert.deepEqual(txOps, ["unsetPrevious", "createYear"]);

    await setCurrentAcademicYear(adminUser, YEAR_2027);
    assert.deepEqual(txOps, ["unsetPrevious", "createYear", "unsetPrevious", "setCurrent"]);
  });

  it("validates cohort promotion payload, blocks cross-center promotion, and transitions promote/alumni/discontinued atomically", async (t) => {
    assert.equal(
      promoteStudentCohortSchema.safeParse({
        targetAcademicYearId: "2027-28",
        transitions: [{ studentId: STU_1, action: "promote" }],
      }).success,
      false,
    );

    mockPrismaModel(t, "academicYear", {
      findUnique: async () => ({ id: YEAR_2027 }),
    });
    mockPrismaModel(t, "student", {
      findMany: async () => [
        {
          id: STU_1,
          fullName: "Cross Center Kid",
          centerId: CENTER_2,
          programId: PROG_1,
          academicYearId: YEAR_2026,
          isActive: true,
        },
      ],
    });

    await assert.rejects(
      () =>
        promoteStudentCohort(adminUser, {
          targetAcademicYearId: YEAR_2027,
          transitions: [{ studentId: STU_1, action: "promote", targetProgramId: PROG_2 }],
        }),
      ForbiddenError,
    );

    const updatedPayloads: Array<{ id: string; data: Record<string, unknown> }> = [];
    const auditLogs: Array<Record<string, unknown>> = [];
    let batchCleanedCount = 0;

    mockPrismaModel(t, "student", {
      findMany: async () => [
        {
          id: STU_1,
          fullName: "Student One",
          centerId: CENTER_1,
          programId: PROG_1,
          academicYearId: YEAR_2026,
          isActive: true,
          educationDiscontinued: false,
        },
        {
          id: STU_2,
          fullName: "Student Two",
          centerId: CENTER_1,
          programId: PROG_1,
          academicYearId: YEAR_2026,
          isActive: true,
          educationDiscontinued: false,
        },
        {
          id: STU_3,
          fullName: "Student Three",
          centerId: CENTER_1,
          programId: PROG_1,
          academicYearId: YEAR_2026,
          isActive: true,
          educationDiscontinued: false,
        },
      ],
    });
    mockPrismaModel(t, "program", {
      findMany: async () => [{ id: PROG_2 }],
    });
    mockPrismaTransaction(t, () => ({
      batchEnrollment: {
        deleteMany: async () => {
          batchCleanedCount += 1;
          return { count: 1 };
        },
      },
      student: {
        update: async (args: { where: { id: string }; data: Record<string, unknown> }) => {
          updatedPayloads.push({ id: args.where.id, data: args.data });
          return {
            id: args.where.id,
            programId: args.data.programId ?? PROG_1,
            academicYearId: args.data.academicYearId,
            isActive: args.data.isActive,
            educationDiscontinued: args.data.educationDiscontinued,
            post12thChoice: args.data.post12thChoice ?? null,
            collegeName: args.data.collegeName ?? null,
          };
        },
      },
      auditLog: {
        create: async (args: { data: Record<string, unknown> }) => {
          auditLogs.push(args.data);
          return args.data;
        },
      },
    }));

    const result = await promoteStudentCohort(adminUser, {
      targetAcademicYearId: YEAR_2027,
      transitions: [
        { studentId: STU_1, action: "promote", targetProgramId: PROG_2, stream: "Science" },
        {
          studentId: STU_2,
          action: "alumni",
          post12thChoice: "Engineering",
          collegeName: "NIT Trichy",
        },
        {
          studentId: STU_3,
          action: "discontinued",
          discontinuationReason: "Family relocated",
        },
      ],
    });

    assert.equal(result.updatedCount, 3);
    assert.deepEqual(result.summary, { promoted: 1, retained: 0, alumni: 1, discontinued: 1 });
    assert.equal(batchCleanedCount, 1);
    assert.equal(updatedPayloads[0].data.programId, PROG_2);
    assert.equal(updatedPayloads[0].data.isActive, true);
    assert.equal(updatedPayloads[1].data.isActive, false);
    assert.equal(updatedPayloads[1].data.collegeName, "NIT Trichy");
    assert.equal(updatedPayloads[2].data.educationDiscontinued, true);
    assert.equal(auditLogs.length, 3);
    assert.equal(
      (auditLogs[2].newData as Record<string, unknown>).discontinuationReason,
      "Family relocated",
    );
  });
});
