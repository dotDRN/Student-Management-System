import bcrypt from "bcryptjs";
import prisma from '../lib/prisma.js';
import {
  generateAccessToken,
  generateRefreshToken,
  verifyRefreshToken,
} from '@/utils/jwt.js';
import { AppError } from '@/lib/errors.js';

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
};

type ChangePasswordInput = {
  currentPassword: string;
  newPassword: string;
};

type TokenPayload = {
  userId: string;
  email: string;
  role: string;
  centerIds: string[];
  isActive?: boolean;
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

// ----------------------
// Services
// ----------------------

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

    const payload: TokenPayload = {
      userId: user.id,
      email: user.email,
      role: user.role,
      centerIds,
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

export const loginUser = async ({ email, password }: LoginInput) => {
  try {
    const normalizedEmail = email.toLowerCase().trim();
    const user = await prisma.user.findUnique({ where: { email: normalizedEmail } });

    if (!user) {
      console.warn(`Login failed: User not found for email: ${email}`);
      throw new AppError("Invalid credentials", 401);
    }
    if (!user.isActive) throw new AppError("Account is inactive", 403);

    const isValid = await bcrypt.compare(password, user.passwordHash);

    if (!isValid) {
      console.warn(`Login failed: Invalid password for email: ${email}`);
      throw new AppError("Invalid credentials", 401);
    }

    const centerIds = await getCenterIdsByUserId(user.id);

    const payload: TokenPayload = {
      userId: user.id,
      email: user.email,
      role: user.role,
      centerIds,
      isActive: user.isActive,
    };

    let expiresInOverride: string | undefined;
    if (user.role === 'volunteer') {
       const assignment = await prisma.userActivityAssignment.findFirst({
          where: { userId: user.id },
          orderBy: { validUntil: 'desc' },
       });
       if (assignment && assignment.validUntil) {
           const maxAgeMs = assignment.validUntil.getTime() - Date.now();
           if (maxAgeMs > 0) expiresInOverride = `${Math.floor(maxAgeMs / 1000)}s`;
       }
    } else if (['teacher', 'center_admin', 'staff', 'supervisor'].includes(user.role)) {
       expiresInOverride = '24h';
    } else if (user.role === 'super_admin') {
       expiresInOverride = '8h';
    } else if (['student', 'parent'].includes(user.role)) {
       expiresInOverride = '7d';
    }

    return {
      accessToken: generateAccessToken(payload, expiresInOverride),
      refreshToken: generateRefreshToken(payload),
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        centerIds,
      },
    };
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

    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
    });

    if (!user) {
      throw new AppError("Invalid session", 401);
    }

    const centerIds = await getCenterIdsByUserId(user.id);

    const payload: TokenPayload = {
      userId: user.id,
      email: user.email,
      role: user.role,
      centerIds,
    };

    return {
      accessToken: generateAccessToken(payload),
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        centerIds,
      },
    };
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
    });

    if (!user) throw new AppError("User not found", 404);

    const centerIds = await getCenterIdsByUserId(userId);

    return { ...user, centerIds };
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