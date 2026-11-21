import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  calculateHolisticCreditSummary,
  enrollStudentsInActivity,
  getStudentActivityEnrollments,
  removeActivityEnrollment,
  updateActivityEnrollmentStatus,
} from "../services/activityService.js";
import type { JwtPayload } from "../utils/jwt.js";
import { mockPrismaModel, mockPrismaTransaction } from "./helpers/mockPrisma.js";

const centerAdmin: JwtPayload = {
  userId: "user-admin-1",
  email: "admin@example.org",
  role: "center_admin",
  centerIds: ["center-1"],
};

const teacherUser: JwtPayload = {
  userId: "user-teacher-1",
  email: "teacher@example.org",
  role: "teacher",
  centerIds: ["center-1"],
};

const otherTeacher: JwtPayload = {
  userId: "user-teacher-2",
  email: "teacher2@example.org",
  role: "teacher",
  centerIds: ["center-1"],
};

describe("Component 3.4: Activity Enrollments & Holistic Credits", () => {
  it("computes holistic credit summary from approved and completed activities", () => {
    const summary = calculateHolisticCreditSummary([
      { status: "approved_by_admin", activity: { status: "completed" } },
      { status: "approved_by_admin", activity: { status: "ongoing" } },
      { status: "requested_by_teacher", activity: { status: "planned" } },
    ]);

    assert.deepEqual(summary, {
      totalEnrolled: 3,
      approvedCount: 2,
      pendingCount: 1,
      completedCount: 1,
      holisticPoints: 7,
    });
  });

  it("sets requested_by_teacher for teachers, skips duplicates, and blocks cross-center students", async (t) => {
    mockPrismaModel(t, "activity", {
      findUnique: async () => ({
        id: "act-1",
        centerId: "center-1",
        programId: "prog-1",
        isActive: true,
      }),
    });

    mockPrismaModel(t, "student", {
      findMany: async () => [
        { id: "stu-1", fullName: "Asha", centerId: "center-1", programId: "prog-1", isActive: true },
        { id: "stu-2", fullName: "Ravi", centerId: "center-1", programId: "prog-1", isActive: true },
      ],
    });

    mockPrismaModel(t, "activityEnrollment", {
      findMany: async () => [{ studentId: "stu-1" }],
    });

    const createdRows: Array<Record<string, unknown>> = [];
    mockPrismaTransaction(t, () => ({
      activityEnrollment: {
        create: async ({ data }: { data: Record<string, unknown> }) => {
          const row = { id: "enr-new", ...data };
          createdRows.push(row);
          return row;
        },
      },
    }));

    const res = await enrollStudentsInActivity(teacherUser, "act-1", ["stu-1", "stu-2", "stu-2"]);
    assert.equal(res.status, "requested_by_teacher");
    assert.equal(res.enrolledCount, 1);
    assert.equal(res.skippedCount, 1);
    assert.equal(createdRows[0].studentId, "stu-2");

    mockPrismaModel(t, "student", {
      findMany: async () => [
        {
          id: "stu-x",
          fullName: "Other Center",
          centerId: "center-2",
          programId: "prog-1",
          isActive: true,
        },
      ],
    });

    await assert.rejects(
      enrollStudentsInActivity(centerAdmin, "act-1", ["stu-x"]),
      /Activity center/,
    );
  });

  it("restricts approval to admins and allows teacher withdrawal of own pending requests", async (t) => {
    mockPrismaModel(t, "activity", {
      findUnique: async () => ({
        id: "act-1",
        centerId: "center-1",
        isActive: true,
      }),
    });

    await assert.rejects(
      updateActivityEnrollmentStatus(teacherUser, "act-1", "stu-1", "approved_by_admin"),
      /Only admins/,
    );

    let enrollmentState = {
      id: "enr-1",
      activityId: "act-1",
      studentId: "stu-1",
      status: "requested_by_teacher",
      requestedBy: "user-teacher-1",
    };
    let deletedId = "";

    mockPrismaModel(t, "activityEnrollment", {
      findUnique: async () => enrollmentState,
      update: async ({ data }: { data: { status: string } }) => ({
        ...enrollmentState,
        status: data.status,
      }),
      delete: async ({ where }: { where: { id: string } }) => {
        deletedId = where.id;
        return { id: deletedId };
      },
    });

    const approved = await updateActivityEnrollmentStatus(
      centerAdmin,
      "act-1",
      "stu-1",
      "approved_by_admin",
    );
    assert.equal(approved.status, "approved_by_admin");

    enrollmentState = {
      ...enrollmentState,
      status: "approved_by_admin",
    };

    await assert.rejects(
      removeActivityEnrollment(otherTeacher, "act-1", "stu-1"),
      /Only admins or the nominating teacher/,
    );

    await removeActivityEnrollment(centerAdmin, "act-1", "stu-1");
    assert.equal(deletedId, "enr-1");
  });

  it("returns student enrollments with holistic summary and blocks cross-center access", async (t) => {
    let studentRecord = {
      id: "stu-1",
      centerId: "center-1",
      isActive: true,
    };

    mockPrismaModel(t, "student", {
      findUnique: async () => studentRecord,
    });
    mockPrismaModel(t, "activityEnrollment", {
      findMany: async () => [
        {
          id: "enr-1",
          status: "approved_by_admin",
          activity: { id: "act-1", name: "Robotics Camp", status: "completed" },
        },
        {
          id: "enr-2",
          status: "requested_by_teacher",
          activity: { id: "act-2", name: "Science Fair", status: "planned" },
        },
      ],
    });

    const result = await getStudentActivityEnrollments(teacherUser, "stu-1");
    assert.equal(result.summary.completedCount, 1);
    assert.equal(result.summary.holisticPoints, 5);

    studentRecord = {
      id: "stu-2",
      centerId: "center-2",
      isActive: true,
    };
    await assert.rejects(getStudentActivityEnrollments(teacherUser, "stu-2"), /No access/);
  });
});
