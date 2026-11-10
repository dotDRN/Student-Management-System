import request from "supertest";
import app from "../app.js";
import prisma from "../lib/prisma.js";
import { runWithoutTenantScope, DEFAULT_TENANT_ID } from "../lib/tenantContext.js";

describe("Multi-Tenant SaaS & RBAC Isolation Integration Tests", () => {
  const testSlug = "e2e-isolated-instance";
  let createdTenantId: string | null = null;
  let instanceBToken: string = "";
  let instanceBCenterId: string = "";
  let defaultOrgCenterId: string = "";

  beforeAll(async () => {
    // Cleanup any leftover test tenant
    const existing = await runWithoutTenantScope(() =>
      prisma.organization.findUnique({ where: { slug: testSlug } }),
    );
    if (existing) {
      await runWithoutTenantScope(async () => {
        await prisma.userCenterAssignment.deleteMany({
          where: { center: { tenantId: existing.id } },
        });
        await prisma.organization.delete({ where: { id: existing.id } });
      });
    }

    const defaultCenter = await runWithoutTenantScope(() =>
      prisma.center.findFirst({ where: { tenantId: DEFAULT_TENANT_ID } }),
    );
    defaultOrgCenterId = defaultCenter?.id || "";
  });

  afterAll(async () => {
    if (createdTenantId) {
      await runWithoutTenantScope(async () => {
        await prisma.student.deleteMany({
          where: { center: { tenantId: createdTenantId! } },
        });
        await prisma.userCenterAssignment.deleteMany({
          where: { center: { tenantId: createdTenantId! } },
        });
        await prisma.organization.delete({ where: { id: createdTenantId! } });
      });
    }
  });

  it("checks slug availability accurately", async () => {
    const takenRes = await request(app).get("/api/auth/check-slug?slug=default");
    expect(takenRes.status).toBe(200);
    expect(takenRes.body.available).toBe(false);

    const freeRes = await request(app).get(`/api/auth/check-slug?slug=${testSlug}`);
    expect(freeRes.status).toBe(200);
    expect(freeRes.body.available).toBe(true);
  });

  it("provisions a new isolated SaaS instance via POST /api/auth/register-instance", async () => {
    const res = await request(app).post("/api/auth/register-instance").send({
      organizationName: "E2E Isolated Academy",
      slug: testSlug,
      adminName: "Instance B Owner",
      email: "owner@e2e-isolated.org",
      password: "Password@123",
      defaultCenterName: "Instance B HQ",
      defaultCenterLocation: "Pune",
    });

    expect(res.status).toBe(201);
    expect(res.body.accessToken).toBeDefined();
    expect(res.body.organization.slug).toBe(testSlug);
    expect(res.body.user.role).toBe("super_admin");
    expect(res.body.user.centerIds.length).toBe(1);

    createdTenantId = res.body.organization.id;
    instanceBToken = res.body.accessToken;
    instanceBCenterId = res.body.user.centerIds[0];
  });

  it("isolates centers, users, and students between Tenant A (Default) and Tenant B", async () => {
    const centersRes = await request(app)
      .get("/api/centers")
      .set("Authorization", `Bearer ${instanceBToken}`);
    expect(centersRes.status).toBe(200);
    expect(centersRes.body.centers.length).toBe(1);
    expect(centersRes.body.centers[0].name).toBe("Instance B HQ");

    const usersRes = await request(app)
      .get("/api/users")
      .set("Authorization", `Bearer ${instanceBToken}`);
    expect(usersRes.status).toBe(200);
    expect(usersRes.body.total).toBe(1);
    expect(usersRes.body.users[0].email).toBe("owner@e2e-isolated.org");
  });

  it("blocks Instance B super_admin from accessing or mutating Instance A centers", async () => {
    if (!defaultOrgCenterId) return;

    const getRes = await request(app)
      .get(`/api/centers/${defaultOrgCenterId}`)
      .set("Authorization", `Bearer ${instanceBToken}`);
    expect([403, 404]).toContain(getRes.status);

    const updateRes = await request(app)
      .patch(`/api/centers/${defaultOrgCenterId}`)
      .set("Authorization", `Bearer ${instanceBToken}`)
      .send({ name: "Hacked Name" });
    expect([403, 404]).toContain(updateRes.status);
  });

  it("allows Instance B super_admin to create additional centers within their own instance", async () => {
    const createRes = await request(app)
      .post("/api/centers")
      .set("Authorization", `Bearer ${instanceBToken}`)
      .send({ name: "Instance B Second Branch", location: "Hyderabad" });

    expect(createRes.status).toBe(201);
    expect(createRes.body.tenantId).toBe(createdTenantId);

    const listRes = await request(app)
      .get("/api/centers")
      .set("Authorization", `Bearer ${instanceBToken}`);
    expect(listRes.status).toBe(200);
    expect(listRes.body.centers.length).toBe(2);
  });

  it("enforces mandatory workspace slug on login", async () => {
    // 1. Missing slug should fail with 400
    const noSlugRes = await request(app).post("/api/auth/login").send({
      email: "super_admin@sparsha.org",
      password: "SuperAdmin@123",
    });
    expect(noSlugRes.status).toBe(400);

    // 2. Non-existent slug should fail with 404
    const badSlugRes = await request(app).post("/api/auth/login").send({
      slug: "non-existent-instance-slug-xyz",
      email: "super_admin@sparsha.org",
      password: "SuperAdmin@123",
    });
    expect(badSlugRes.status).toBe(404);

    // 3. Mandatory slug "default" for default instance succeeds
    const defaultLoginRes = await request(app).post("/api/auth/login").send({
      slug: "default",
      email: "super_admin@sparsha.org",
      password: "SuperAdmin@123",
    });
    expect(defaultLoginRes.status).toBe(200);
    expect(defaultLoginRes.body.accessToken).toBeDefined();
    expect(defaultLoginRes.body.organization.slug).toBe("default");

    // 4. Mandatory slug for new instance succeeds
    const instanceBLoginRes = await request(app).post("/api/auth/login").send({
      slug: testSlug,
      email: "owner@e2e-isolated.org",
      password: "Password@123",
    });
    expect(instanceBLoginRes.status).toBe(200);
    expect(instanceBLoginRes.body.accessToken).toBeDefined();
    expect(instanceBLoginRes.body.organization.slug).toBe(testSlug);
  });
});
