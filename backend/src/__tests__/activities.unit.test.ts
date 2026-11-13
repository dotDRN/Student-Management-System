import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { ROLES } from "../config/rbac.js";
import { ForbiddenError, ValidationError } from "../lib/errors.js";
import {
  assignVolunteer,
  createActivity,
  deleteActivity,
  listActivities,
  removeVolunteerAssignment,
  updateActivity,
} from "../services/activityService.js";
import type { JwtPayload } from "../utils/jwt.js";
import { mockPrismaModel, mockPrismaTransaction } from "./helpers/mockPrisma.js";

const CENTER_1 = "cccccccc-cccc-4ccc-8ccc-ccccccccccc1";
const CENTER_2 = "cccccccc-cccc-4ccc-8ccc-ccccccccccc2";
const PROGRAM_1 = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const USER_VOL = "11111111-1111-4111-8111-111111111111";

describe("Component 1.7: Activities, Status Workflow & Volunteer Assignments", () => {
  const teacher: JwtPayload = {
    userId: "u-teacher",
    tenantId: "t1",
    email: "t@org.org",
    role: ROLES.TEACHER,
    centerIds: [CENTER_1],
    isActive: true,
  };

  const centerAdmin: JwtPayload = {
    userId: "u-ca",
    tenantId: "t1",
    email: "ca@org.org",
    role: ROLES.CENTER_ADMIN,
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

  const volunteer: JwtPayload = {
    userId: USER_VOL,
    tenantId: "t1",
    email: "vol@org.org",
    role: ROLES.VOLUNTEER,
    centerIds: [CENTER_1],
    isActive: true,
  };

  it("listActivities allows tech_admin globally, blocks cross-center spoofing, and scopes volunteers", async (t) => {
    const wheres: Record<string, unknown>[] = [];

    mockPrismaModel(t, "activity", {
      findMany: async (args: { where: Record<string, unknown> }) => {
        wheres.push(args.where);
        return [];
      },
    });

    await assert.rejects(
      () => listActivities(teacher, { centerId: CENTER_2 }),
      ForbiddenError,
    );

    await assert.rejects(
      () => listActivities(teacher, { status: "in_progress" }),
      ValidationError,
    );

    await listActivities(techAdmin, { status: "ongoing", from: "2026-11-01" });
    assert.equal("centerId" in wheres[0], false);
    assert.equal(wheres[0].isActive, true);
    assert.equal(wheres[0].status, "ongoing");
    assert.equal(
      ((wheres[0].startDate as { gte: Date }).gte).toISOString(),
      "2026-11-01T00:00:00.000Z",
    );

    await listActivities(volunteer, {});
    assert.ok(wheres[1].userAssignments);
  });

  it("createActivity validates UTC dates, center access, and endDate >= startDate", async (t) => {
    const createdDatas: Record<string, unknown>[] = [];

    mockPrismaModel(t, "center", {
      findFirst: async ({ where }: { where: { id: string } }) => ({
        id: where.id,
        isActive: true,
      }),
    });
    mockPrismaModel(t, "program", {
      findFirst: async () => ({ id: PROGRAM_1, isActive: true }),
    });
    mockPrismaTransaction(t, () => ({
      activity: {
        create: async (args: { data: Record<string, unknown> }) => {
          createdDatas.push(args.data);
          return { id: "act-1", ...args.data };
        },
      },
    }));

    await assert.rejects(
      () =>
        createActivity(teacher, {
          centerIds: [CENTER_1],
          name: "Bad Dates Camp",
          startDate: "2026-11-15",
          endDate: "2026-11-10",
        }),
      ValidationError,
    );

    await assert.rejects(
      () =>
        createActivity(teacher, {
          centerIds: [CENTER_2],
          name: "Cross-Center Camp",
        }),
      ForbiddenError,
    );

    const created = await createActivity(techAdmin, {
      centerIds: [CENTER_1, CENTER_1],
      programId: PROGRAM_1,
      name: "Science Fair",
      status: "ongoing",
      activityType: "camp",
      startDate: "2026-11-10",
      endDate: "2026-11-12",
      volunteers: ["  Asha ", ""],
    });

    assert.equal(created.length, 1);
    assert.equal(createdDatas[0].status, "ongoing");
    assert.equal(createdDatas[0].activityType, "camp");
    assert.deepEqual(createdDatas[0].volunteers, ["Asha"]);
    assert.equal(
      (createdDatas[0].startDate as Date).toISOString(),
      "2026-11-10T00:00:00.000Z",
    );
  });

  it("updateActivity persists status transitions, completionNotes, date ordering, and ActivityStatusLog", async (t) => {
    const updatedPayloads: Record<string, unknown>[] = [];
    const statusLogs: Record<string, unknown>[] = [];

    mockPrismaModel(t, "activity", {
      findUnique: async () => ({
        id: "act-1",
        centerId: CENTER_1,
        programId: PROGRAM_1,
        name: "Workshop",
        status: "planned",
        startDate: new Date("2026-11-10T00:00:00.000Z"),
        endDate: new Date("2026-11-12T00:00:00.000Z"),
        isActive: true,
      }),
    });
    mockPrismaTransaction(t, () => ({
      activity: {
        update: async (args: { data: Record<string, unknown> }) => {
          updatedPayloads.push(args.data);
          return { id: "act-1", ...args.data };
        },
      },
      activityStatusLog: {
        create: async (args: { data: Record<string, unknown> }) => {
          statusLogs.push(args.data);
          return args.data;
        },
      },
    }));

    // Updating endDate earlier than stored startDate should fail
    await assert.rejects(
      () =>
        updateActivity(teacher, "act-1", {
          endDate: "2026-11-05",
        }),
      ValidationError,
    );

    await updateActivity(teacher, "act-1", {
      status: "completed",
      completionNotes: "Completed with 25 participants",
      volunteers: ["Mentor 1"],
    });

    assert.equal(updatedPayloads[0].status, "completed");
    assert.equal(updatedPayloads[0].completionNotes, "Completed with 25 participants");
    assert.equal(statusLogs.length, 1);
    assert.equal(statusLogs[0].fromStatus, "planned");
    assert.equal(statusLogs[0].toStatus, "completed");
  });

  it("deleteActivity enforces admin center access, blocks sessions, and soft-deactivates enrollments", async (t) => {
    let softDeactivated = false;

    mockPrismaModel(t, "activity", {
      findUnique: async (args: { where: { id: string } }) => {
        if (args.where.id === "act-sessions") {
          return {
            id: "act-sessions",
            centerId: CENTER_1,
            isActive: true,
            _count: { attendanceSessions: 1, batches: 0, exams: 0, activityEnrollments: 0 },
          };
        }
        return {
          id: "act-enrolled",
          centerId: CENTER_1,
          isActive: true,
          _count: { attendanceSessions: 0, batches: 0, exams: 0, activityEnrollments: 2 },
        };
      },
      update: async () => {
        softDeactivated = true;
        return { id: "act-enrolled", isActive: false };
      },
    });

    await assert.rejects(
      () => deleteActivity(teacher, "act-enrolled"),
      ForbiddenError,
    );
    await assert.rejects(
      () => deleteActivity(centerAdmin, "act-sessions"),
      ValidationError,
    );

    await deleteActivity(centerAdmin, "act-enrolled");
    assert.equal(softDeactivated, true);
  });

  it("assignVolunteer & removeVolunteerAssignment enforce center access and UTC dates", async (t) => {
    const upserts: Record<string, unknown>[] = [];
    let deletedAssignmentId: string | null = null;

    mockPrismaModel(t, "activity", {
      findUnique: async (args: { where: { id: string } }) => ({
        id: args.where.id,
        centerId: args.where.id === "act-c2" ? CENTER_2 : CENTER_1,
        isActive: true,
      }),
    });
    mockPrismaModel(t, "user", {
      findFirst: async () => ({ id: USER_VOL }),
    });
    mockPrismaModel(t, "userActivityAssignment", {
      upsert: async (args: Record<string, unknown>) => {
        upserts.push(args);
        return { id: "ua-1" };
      },
      findFirst: async () => ({ id: "ua-1" }),
      delete: async (args: { where: { id: string } }) => {
        deletedAssignmentId = args.where.id;
        return { id: deletedAssignmentId };
      },
    });

    // Cross-center assignment blocked
    await assert.rejects(
      () =>
        assignVolunteer(teacher, "act-c2", {
          userId: USER_VOL,
          validFrom: "2026-11-10",
        }),
      ForbiddenError,
    );

    // Date range validation
    await assert.rejects(
      () =>
        assignVolunteer(teacher, "act-c1", {
          userId: USER_VOL,
          validFrom: "2026-11-15",
          validUntil: "2026-11-10",
        }),
      ValidationError,
    );

    await assignVolunteer(teacher, "act-c1", {
      userId: USER_VOL,
      validFrom: "2026-11-10",
      validUntil: "2026-11-20",
    });
    assert.equal(upserts.length, 1);

    await assert.rejects(
      () => removeVolunteerAssignment(teacher, "act-c2", USER_VOL),
      ForbiddenError,
    );
    await removeVolunteerAssignment(teacher, "act-c1", USER_VOL);
    assert.equal(deletedAssignmentId, "ua-1");
  });
});
