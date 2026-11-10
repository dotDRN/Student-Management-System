import bcrypt from "bcryptjs";
import prisma from "../lib/prisma.js";
import {
  generateAccessToken,
  generateRefreshToken,
  verifyRefreshToken,
  JwtPayload,
} from "../utils/jwt.js";
import { AppError } from "../lib/errors.js";
import { runWithoutTenantScope } from "../lib/tenantContext.js";
import {
  RegisterInstanceInput,
  slugifyOrganizationName,
} from "../validators/auth.schema.js";

const SALT_ROUNDS = 10;

// ----------------------
// Types
// ----------------------

type RegisterInput = {
  phone: string;
  email?: string;
  password: string;
};

type LoginInput = {
  email: string;
  password: string;
  slug?: string;
  tenantId?: string;
};

type ChangePasswordInput = {
  currentPassword: string;
  newPassword: string;
};

// ----------------------
// Helpers
// ----------------------

const getCenterIdsByUserId = async (userId: string): Promise<string[]> => {
  try {
    const assignments = await prisma.userCenterAssignment.findMany({
      where: {
        userId,
        OR: [{ validUntil: null }, { validUntil: { gte: new Date() } }],
      },
      select: { centerId: true },
    });

    return assignments.map((a) => a.centerId);
  } catch (err) {
    console.error("Error fetching centerIds:", err);
    throw err;
  }
};

function getCurrentAcademicYearBounds(): {
  label: string;
  startDate: Date;
  endDate: Date;
} {
  const now = new Date();
  const currentYear = now.getFullYear();
  const startYear = now.getMonth() >= 5 ? currentYear : currentYear - 1;
  const endYear = startYear + 1;
  const shortEnd = String(endYear).slice(-2);

  return {
    label: `${startYear}-${shortEnd}`,
    startDate: new Date(startYear, 5, 1), // June 1
    endDate: new Date(endYear, 4, 31), // May 31
  };
}

// ----------------------
// Services
// ----------------------

export const checkSlugAvailability = async (rawSlug: string) => {
  const normalizedSlug = slugifyOrganizationName(rawSlug);
  if (!normalizedSlug || normalizedSlug.length < 2) {
    return {
      available: false,
      normalizedSlug,
      message: "Slug must be at least 2 characters",
    };
  }

  const existing = await runWithoutTenantScope(() =>
    prisma.organization.findUnique({
      where: { slug: normalizedSlug },
      select: { id: true, name: true, slug: true },
    }),
  );

  return {
    available: !existing,
    normalizedSlug,
    organization: existing || undefined,
  };
};

export const registerInstance = async (input: RegisterInstanceInput) => {
  const normalizedEmail = input.email.toLowerCase().trim();
  const normalizedSlug =
    input.slug?.toLowerCase().trim() ||
    slugifyOrganizationName(input.organizationName);

  if (
    !normalizedSlug ||
    normalizedSlug.length < 2 ||
    !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(normalizedSlug)
  ) {
    throw new AppError(
      "Invalid workspace URL slug. Use lowercase letters, numbers, and hyphens.",
      400,
    );
  }

  return runWithoutTenantScope(async () => {
    const existingOrg = await prisma.organization.findUnique({
      where: { slug: normalizedSlug },
    });

    if (existingOrg) {
      throw new AppError(
        `Workspace URL "${normalizedSlug}" is already taken. Please choose another.`,
        409,
      );
    }

    const hashedPassword = await bcrypt.hash(input.password, SALT_ROUNDS);
    const ayBounds = getCurrentAcademicYearBounds();

    const result = await prisma.$transaction(async (tx) => {
      // 1. Create the Organization (Tenant Instance)
      const organization = await tx.organization.create({
        data: {
          name: input.organizationName.trim(),
          slug: normalizedSlug,
          plan: "starter",
          isActive: true,
        },
      });

      // 2. Create the Instance Owner / Super Admin User
      const adminUser = await tx.user.create({
        data: {
          tenantId: organization.id,
          email: normalizedEmail,
          passwordHash: hashedPassword,
          fullName: input.adminName.trim(),
          phone: input.phone?.trim() || null,
          role: "super_admin",
          isActive: true,
        },
      });

      // 3. Create Default Academic Year for this Instance
      const academicYear = await tx.academicYear.create({
        data: {
          tenantId: organization.id,
          label: ayBounds.label,
          startDate: ayBounds.startDate,
          endDate: ayBounds.endDate,
          isCurrent: true,
        },
      });

      // 4. Create Default Center for this Instance
      const defaultCenter = await tx.center.create({
        data: {
          tenantId: organization.id,
          name:
            input.defaultCenterName?.trim() ||
            `${input.organizationName.trim()} - Main Center`,
          location: input.defaultCenterLocation?.trim() || null,
          isActive: true,
        },
      });

      // 5. Assign Admin to the Default Center
      await tx.userCenterAssignment.create({
        data: {
          userId: adminUser.id,
          centerId: defaultCenter.id,
          createdBy: adminUser.id,
          validFrom: new Date(),
        },
      });

      return {
        organization,
        adminUser,
        defaultCenter,
        academicYear,
      };
    });

    const centerIds = [result.defaultCenter.id];

    const payload: JwtPayload = {
      userId: result.adminUser.id,
      tenantId: result.organization.id,
      tenantSlug: result.organization.slug,
      tenantName: result.organization.name,
      email: result.adminUser.email,
      role: result.adminUser.role,
      centerIds,
      isActive: result.adminUser.isActive,
    };

    return {
      accessToken: generateAccessToken(payload, "8h"),
      refreshToken: generateRefreshToken(payload),
      user: {
        id: result.adminUser.id,
        tenantId: result.organization.id,
        tenantSlug: result.organization.slug,
        tenantName: result.organization.name,
        email: result.adminUser.email,
        fullName: result.adminUser.fullName,
        role: result.adminUser.role,
        centerIds,
      },
      organization: result.organization,
    };
  });
};

export const registerUser = async ({
  phone,
  email,
  password,
}: RegisterInput) => {
  try {
    const existing = await prisma.user.findFirst({
      where: {
        OR: [
          ...(email ? [{ email }] : []),
          ...(phone ? [{ phone }] : []),
        ],
      },
    });

    if (existing) {
      throw new AppError("User already exists", 400);
    }

    const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);

    const user = await prisma.user.create({
      data: {
        email: email || `${phone}@internal.local`,
        passwordHash: hashedPassword,
        fullName: phone || "User",
        role: "staff",
      },
    });

    const centerIds = await getCenterIdsByUserId(user.id);

    const payload: JwtPayload = {
      userId: user.id,
      tenantId: user.tenantId,
      email: user.email,
      role: user.role,
      centerIds,
      isActive: user.isActive,
    };

    return {
      accessToken: generateAccessToken(payload),
      refreshToken: generateRefreshToken(payload),
      user: { ...user, centerIds },
    };
  } catch (err) {
    console.error("Register Service Error:", err);
    throw err;
  }
};

// ----------------------

export const loginUser = async ({
  email,
  password,
  slug,
  tenantId,
}: LoginInput) => {
  try {
    const normalizedEmail = email.toLowerCase().trim();

    return await runWithoutTenantScope(async () => {
      let targetTenantId = tenantId;

      if (slug && slug.trim()) {
        const org = await prisma.organization.findUnique({
          where: { slug: slug.toLowerCase().trim() },
        });
        if (!org) {
          throw new AppError(`Workspace "${slug}" not found`, 404);
        }
        if (!org.isActive) {
          throw new AppError("This workspace is currently inactive", 403);
        }
        targetTenantId = org.id;
      }

      const candidates = await prisma.user.findMany({
        where: {
          email: normalizedEmail,
          ...(targetTenantId ? { tenantId: targetTenantId } : {}),
        },
        include: {
          organization: true,
        },
        orderBy: { createdAt: "desc" },
      });

      if (candidates.length === 0) {
        console.warn(`Login failed: User not found for email: ${email}`);
        throw new AppError("Invalid credentials", 401);
      }

      // Match password across candidate user accounts
      const validUsers: typeof candidates = [];
      for (const candidate of candidates) {
        const isValid = await bcrypt.compare(password, candidate.passwordHash);
        if (isValid) {
          validUsers.push(candidate);
        }
      }

      if (validUsers.length === 0) {
        console.warn(`Login failed: Invalid password for email: ${email}`);
        throw new AppError("Invalid credentials", 401);
      }

      const activeUsers = validUsers.filter(
        (u) => u.isActive && u.organization?.isActive !== false,
      );

      if (activeUsers.length === 0) {
        throw new AppError("Account or workspace is inactive", 403);
      }

      // If multiple workspaces match and no specific slug/tenantId was supplied,
      // return workspace choices if requested or select the primary one
      if (activeUsers.length > 1 && !targetTenantId) {
        return {
          requiresWorkspaceSelection: true,
          workspaces: activeUsers.map((u) => ({
            tenantId: u.tenantId,
            name: u.organization.name,
            slug: u.organization.slug,
            role: u.role,
          })),
        };
      }

      const user = activeUsers[0];
      const centerIds = await getCenterIdsByUserId(user.id);

      const payload: JwtPayload = {
        userId: user.id,
        tenantId: user.tenantId,
        tenantSlug: user.organization?.slug,
        tenantName: user.organization?.name,
        email: user.email,
        role: user.role,
        centerIds,
        isActive: user.isActive,
      };

      let expiresInOverride: string | undefined;
      if (user.role === "volunteer") {
        const assignment = await prisma.userActivityAssignment.findFirst({
          where: { userId: user.id },
          orderBy: { validUntil: "desc" },
        });
        if (assignment && assignment.validUntil) {
          const maxAgeMs = assignment.validUntil.getTime() - Date.now();
          if (maxAgeMs > 0)
            expiresInOverride = `${Math.floor(maxAgeMs / 1000)}s`;
        }
      } else if (
        ["teacher", "center_admin", "staff", "supervisor"].includes(user.role)
      ) {
        expiresInOverride = "24h";
      } else if (user.role === "super_admin") {
        expiresInOverride = "8h";
      } else if (["student", "parent"].includes(user.role)) {
        expiresInOverride = "7d";
      }

      await prisma.user.update({
        where: { id: user.id },
        data: { lastLoginAt: new Date() },
      });

      return {
        accessToken: generateAccessToken(payload, expiresInOverride),
        refreshToken: generateRefreshToken(payload),
        user: {
          id: user.id,
          tenantId: user.tenantId,
          tenantSlug: user.organization?.slug,
          tenantName: user.organization?.name,
          email: user.email,
          fullName: user.fullName,
          role: user.role,
          centerIds,
        },
        organization: user.organization,
      };
    });
  } catch (err) {
    console.error("Login Service Error:", err);
    throw err;
  }
};

// ----------------------

export const refreshAccessToken = async (token: string) => {
  try {
    if (!token) {
      throw new AppError("Refresh token required", 401);
    }

    const decoded = verifyRefreshToken(token);

    return await runWithoutTenantScope(async () => {
      const user = await prisma.user.findUnique({
        where: { id: decoded.userId },
        include: { organization: true },
      });

      if (!user || !user.isActive || user.organization?.isActive === false) {
        throw new AppError("Invalid session", 401);
      }

      const centerIds = await getCenterIdsByUserId(user.id);

      const payload: JwtPayload = {
        userId: user.id,
        tenantId: user.tenantId,
        tenantSlug: user.organization?.slug,
        tenantName: user.organization?.name,
        email: user.email,
        role: user.role,
        centerIds,
        isActive: user.isActive,
      };

      return {
        accessToken: generateAccessToken(payload),
        user: {
          id: user.id,
          tenantId: user.tenantId,
          tenantSlug: user.organization?.slug,
          tenantName: user.organization?.name,
          email: user.email,
          fullName: user.fullName,
          role: user.role,
          centerIds,
        },
        organization: user.organization,
      };
    });
  } catch (err) {
    console.error("Refresh Token Service Error:", err);
    throw err;
  }
};

// ----------------------

export const getMe = async (userId: string) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { organization: true },
    });

    if (!user) throw new AppError("User not found", 404);

    const centerIds = await getCenterIdsByUserId(userId);

    return {
      ...user,
      tenantSlug: user.organization?.slug,
      tenantName: user.organization?.name,
      centerIds,
    };
  } catch (err) {
    console.error("GetMe Service Error:", err);
    throw err;
  }
};

// ----------------------

export const changePassword = async (
  userId: string,
  { currentPassword, newPassword }: ChangePasswordInput,
) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) throw new AppError("User not found", 404);

    const isValid = await bcrypt.compare(currentPassword, user.passwordHash);

    if (!isValid) {
      throw new AppError("Current password incorrect", 400);
    }

    const hashedNew = await bcrypt.hash(newPassword, SALT_ROUNDS);

    await prisma.user.update({
      where: { id: userId },
      data: { passwordHash: hashedNew },
    });

    return { message: "Password updated successfully" };
  } catch (err) {
    console.error("Change Password Service Error:", err);
    throw err;
  }
};
