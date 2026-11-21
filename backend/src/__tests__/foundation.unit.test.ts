import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { Request, Response } from "express";
import {
  ROLES,
  isGlobalAdmin,
  isAdminRole,
  getScopedCenterIds,
  hasCenterAccess,
} from "../config/rbac.js";
import {
  assertCenterAccess,
  resolveCenterFilter,
} from "../lib/centerScope.js";
import { requireAuth } from "../lib/auth.js";
import { generateAccessToken } from "../utils/jwt.js";
import { AppError as ReExportedAppError } from "../utils/AppError.js";
import { AppError as CanonicalAppError, ForbiddenError, UnauthorizedError } from "../lib/errors.js";
import {
  parseUtcDateOnly,
  parseOptionalUtcDateOnly,
  formatUtcDateOnly,
  getTodayUtcDateOnly,
} from "../utils/dateOnly.js";
import {
  calculateAttendancePercentage,
  countAttendanceStatuses,
} from "../utils/attendanceMetrics.js";
import type { JwtPayload } from "../utils/jwt.js";

describe("Component 1.1: Shared RBAC & Center Scope Helpers", () => {
  it("distinguishes global admins from center-scoped admins", () => {
    assert.equal(isGlobalAdmin(ROLES.SUPER_ADMIN), true);
    assert.equal(isGlobalAdmin(ROLES.TECH_ADMIN), true);
    assert.equal(isGlobalAdmin(ROLES.CENTER_ADMIN), false);
    assert.equal(isGlobalAdmin(ROLES.TEACHER), false);

    assert.equal(isAdminRole(ROLES.CENTER_ADMIN), true);
    assert.equal(isAdminRole(ROLES.TECH_ADMIN), true);
    assert.equal(isAdminRole(ROLES.TEACHER), false);
  });

  it("scopes centerIds properly for tech_admin vs center_admin", () => {
    assert.equal(getScopedCenterIds({ role: ROLES.TECH_ADMIN, centerIds: [] }), undefined);
    assert.deepEqual(
      getScopedCenterIds({ role: ROLES.CENTER_ADMIN, centerIds: ["c1"] }),
      ["c1"],
    );
    assert.equal(hasCenterAccess({ role: ROLES.TECH_ADMIN, centerIds: [] }, "c99"), true);
    assert.equal(hasCenterAccess({ role: ROLES.CENTER_ADMIN, centerIds: ["c1"] }, "c1"), true);
    assert.equal(hasCenterAccess({ role: ROLES.CENTER_ADMIN, centerIds: ["c1"] }, "c2"), false);
  });

  it("throws ForbiddenError when assertCenterAccess fails", () => {
    const teacher: JwtPayload = {
      userId: "u1",
      tenantId: "t1",
      email: "t@org.com",
      role: ROLES.TEACHER,
      centerIds: ["c1"],
      isActive: true,
    };
    assert.doesNotThrow(() => assertCenterAccess(teacher, "c1"));
    assert.throws(() => assertCenterAccess(teacher, "c2"), ForbiddenError);

    assert.deepEqual(resolveCenterFilter(teacher), { in: ["c1"] });
    assert.equal(resolveCenterFilter(teacher, "c1"), "c1");
    assert.deepEqual(resolveCenterFilter(teacher, "c2"), { in: [] });
    assert.throws(() => resolveCenterFilter(teacher, "c2", { throwOnDenied: true }), ForbiddenError);
  });

  it("unifies AppError class across modules", () => {
    const err = new ReExportedAppError("test", 400);
    assert.equal(err instanceof CanonicalAppError, true);
  });
});

describe("Component 1.1: requireAuth Parity", () => {
  it("rejects inactive users and centerless teachers while allowing tech_admin", () => {
    process.env.JWT_ACCESS_SECRET = "test-access-secret-123456";

    const runMiddleware = (payload: JwtPayload): Promise<unknown> =>
      new Promise((resolve) => {
        const token = generateAccessToken(payload);
        const req = {
          headers: { authorization: `Bearer ${token}` },
        } as unknown as Request;
        requireAuth(req, {} as Response, (err?: unknown) => resolve(err ?? null));
      });

    return Promise.all([
      runMiddleware({
        userId: "u-inactive",
        tenantId: "t1",
        email: "inactive@org.com",
        role: ROLES.TEACHER,
        centerIds: ["c1"],
        isActive: false,
      }).then((err) => assert.equal(err instanceof ForbiddenError, true)),

      runMiddleware({
        userId: "u-no-center",
        tenantId: "t1",
        email: "noc@org.com",
        role: ROLES.TEACHER,
        centerIds: [],
        isActive: true,
      }).then((err) => assert.equal(err instanceof ForbiddenError, true)),

      runMiddleware({
        userId: "u-tech",
        tenantId: "t1",
        email: "tech@org.com",
        role: ROLES.TECH_ADMIN,
        centerIds: [],
        isActive: true,
      }).then((err) => assert.equal(err, null)),

      new Promise<void>((resolve) => {
        const req = { headers: {} } as unknown as Request;
        requireAuth(req, {} as Response, (err?: unknown) => {
          assert.equal(err instanceof UnauthorizedError, true);
          resolve();
        });
      }),
    ]);
  });
});

describe("Component 1.1: Canonical UTC Date & Attendance Helpers", () => {
  it("parses date-only strings deterministically in UTC and rejects invalid calendar dates", () => {
    const d = parseUtcDateOnly("2026-11-13");
    assert.equal(d.toISOString(), "2026-11-13T00:00:00.000Z");
    assert.equal(formatUtcDateOnly(d), "2026-11-13");

    assert.equal(parseOptionalUtcDateOnly(""), undefined);
    assert.throws(() => parseUtcDateOnly("2026-02-30"));
    assert.throws(() => parseUtcDateOnly("not-a-date"));
  });

  it("computes timezone-aware UTC date-only for today", () => {
    // 2026-11-13T19:00:00.000Z is already 2026-11-14T00:30:00+05:30 in Asia/Kolkata
    const ref = new Date("2026-11-13T19:00:00.000Z");
    const istDate = getTodayUtcDateOnly(ref, "Asia/Kolkata");
    const utcDate = getTodayUtcDateOnly(ref, "UTC");
    assert.equal(formatUtcDateOnly(istDate), "2026-11-14");
    assert.equal(formatUtcDateOnly(utcDate), "2026-11-13");
  });

  it("calculates canonical attendance percentage excluding pending and excused", () => {
    const counts = countAttendanceStatuses([
      { status: "present" },
      { status: "present" },
      { status: "late" },
      { status: "absent" },
      { status: "excused" },
      { status: "pending" },
    ]);
    assert.deepEqual(counts, {
      present: 2,
      absent: 1,
      late: 1,
      excused: 1,
      pending: 1,
    });
    // markedTotal = 2 + 1 + 1 = 4; present + late = 3 -> 75%
    assert.equal(calculateAttendancePercentage(counts), 75);
    assert.equal(calculateAttendancePercentage({ pending: 5, excused: 2 }), 0);
  });
});
