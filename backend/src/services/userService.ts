import bcrypt from "bcryptjs";
import type { UserRole } from "@prisma/client";
import { Prisma } from "@prisma/client";
import type { JwtPayload } from '../lib/auth.js';
import prisma from '../lib/prisma.js';
import { AppError, NotFoundError, ValidationError } from '../lib/errors.js';

const SALT_ROUNDS = 10;

function toSafeUser<T extends { passwordHash?: string }>(user: T): Omit<T, "passwordHash"> {
  const { passwordHash: _passwordHash, ...safe } = user;
  return safe;
}

export async function listUsers(query: {
  role?: UserRole;
  centerId?: string;
  isActive?: boolean;
  search?: string;
  page?: number;
  limit?: number;
  createdBy?: string;
}) {
  const page = Math.max(query.page ?? 1, 1);
  const limit = Math.max(query.limit ?? 50, 1);
  const skip = (page - 1) * limit;

  const where = {
    ...(query.createdBy ? { createdBy: query.createdBy } : {}),
    ...(query.role ? { role: query.role } : {}),
    ...(query.centerId
      ? {
          centerAssignments: {
            some: {
              centerId: query.centerId,
            },
          },
        }
      : {}),
    ...(query.isActive !== undefined ? { isActive: query.isActive } : {}),
    ...(query.search
      ? {
          OR: [
            { fullName: { contains: query.search, mode: "insensitive" as const } },
            { email: { contains: query.search, mode: "insensitive" as const } },
          ],
        }
      : {}),
  };

  const [users, total] = await Promise.all([
    prisma.user.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: "desc" },
      include: {
        centerAssignments: {
          include: {
            center: {
              select: { id: true, name: true },
            },
          },
        },
      },
    }),
    prisma.user.count({ where }),
  ]);

  return {
    users: users.map((user) => toSafeUser(user)),
    total,
    page,
    totalPages: Math.ceil(total / limit),
  };
}

export async function getUserById(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      centerAssignments: {
        include: {
          center: {
            select: { id: true, name: true, location: true, isActive: true },
          },
        },
      },
    },
  });

  if (!user) {
    throw new NotFoundError("User");
  }

  return toSafeUser(user);
}

export async function createUser(input: {
  email: string;
  password: string;
  fullName: string;
  phone?: string;
  role: UserRole;
  createdBy?: string;
  centerIds?: string[];
}) {
  try {
    const hashedPassword = await bcrypt.hash(input.password, SALT_ROUNDS);
    
    // We use a transaction to ensure both user and assignments are created or none
    const user = await prisma.user.create({
      data: {
        email: input.email,
        passwordHash: hashedPassword,
        fullName: input.fullName,
        phone: input.phone ?? null,
        role: input.role,
        createdBy: input.createdBy,
        centerAssignments: input.createdBy && input.centerIds?.length
          ? {
              create: input.centerIds.map((id: string) => ({
                center: { connect: { id } },
                createdByUser: { connect: { id: input.createdBy! } },
                validFrom: new Date(),
              })),
            }
          : undefined,
      },
      include: {
        centerAssignments: {
          include: {
            center: {
              select: { id: true, name: true },
            },
          },
        },
      },
    });
    
    return toSafeUser(user);
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new AppError("Email already exists", 409);
    }
    throw error;
  }
}

export async function updateUser(
  userId: string,
  input: { fullName?: string; phone?: string; role?: UserRole; isActive?: boolean },
) {
  await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  const updated = await prisma.user.update({
    where: { id: userId },
    data: {
      ...(input.fullName !== undefined ? { fullName: input.fullName } : {}),
      ...(input.phone !== undefined ? { phone: input.phone } : {}),
      ...(input.role !== undefined ? { role: input.role } : {}),
      ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
    },
    include: {
      centerAssignments: {
        include: {
          center: {
            select: { id: true, name: true },
          },
        },
      },
    },
  });

  return toSafeUser(updated);
}

export async function resetUserPassword(userId: string, newPassword: string) {
  if (newPassword.length < 8) {
    throw new ValidationError("newPassword must be at least 8 characters");
  }

  await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  const passwordHash = await bcrypt.hash(newPassword, SALT_ROUNDS);
  await prisma.user.update({
    where: { id: userId },
    data: { passwordHash },
  });

  return { success: true };
}

export async function softDeleteUser(targetUserId: string, currentUser: JwtPayload) {
  if (targetUserId === currentUser.userId) {
    throw new AppError("You cannot deactivate your own account", 400);
  }

  await prisma.user.findUniqueOrThrow({ where: { id: targetUserId } });
  const user = await prisma.user.update({
    where: { id: targetUserId },
    data: { isActive: false },
  });

  return toSafeUser(user);
}

export async function getMyCenters(currentUser: JwtPayload) {
  const user = await prisma.user.findUnique({
    where: { id: currentUser.userId },
    select: {
      id: true,
      fullName: true,
      role: true,
      centerAssignments: {
        include: {
          center: {
            select: { id: true, name: true, location: true, isActive: true },
          },
        },
        orderBy: { validFrom: "desc" },
      },
    },
  });

  if (!user) {
    throw new NotFoundError("User");
  }

  return {
    userId: user.id,
    fullName: user.fullName,
    role: user.role,
    centerAssignments: user.centerAssignments,
  };
}

export async function updateUserCenters(
  adminId: string,
  targetUserId: string,
  centerIds: string[],
) {
  // Verify the target user exists
  await prisma.user.findUniqueOrThrow({ where: { id: targetUserId } });

  // Delete all existing assignments for this user
  await prisma.userCenterAssignment.deleteMany({
    where: { userId: targetUserId },
  });

  // Create new assignments
  if (centerIds.length > 0) {
    await prisma.userCenterAssignment.createMany({
      data: centerIds.map((centerId) => ({
        userId: targetUserId,
        centerId,
        createdBy: adminId,
        validFrom: new Date(),
      })),
    });
  }

  return getUserById(targetUserId);
}
