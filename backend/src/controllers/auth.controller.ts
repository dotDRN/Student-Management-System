import { Request, Response, NextFunction } from "express";
import * as authService from '@/services/auth.service.js';
import { verifyRefreshToken, generateAccessToken } from '@/utils/jwt.js';
import { AppError } from '@/lib/errors.js';
// Extend Request to include user (from auth middleware)

/**
 * POST /api/auth/register
 */
export const register = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<Response | void> => {
  try {
    const { phone, email, password } = req.body as {
      phone?: string;
      email?: string;
      password?: string;
    };

    if (!phone || !password) {
      return res.status(400).json({
        success: false,
        message: "Phone and password are required",
      });
    }

    if (password.length < 8) {
      return res.status(400).json({
        success: false,
        message: "Password must be at least 8 characters",
      });
    }

    const { accessToken, refreshToken, user } = await authService.registerUser({
      phone,
      email,
      password,
    });

    // set refresh token cookie
    res.cookie("refreshToken", refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    return res.status(201).json({
      success: true,
      message: "Registration successful",
      data: { user, accessToken },
    });
  } catch (err) {
    console.error("Register Error:", err);
    next(err);
  }
};

/**
 * POST /api/auth/login
 */
export const login = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { email, password } = req.body;

    const { accessToken, refreshToken, user } = await authService.loginUser({
      email,
      password,
    });

    // 🔥 store refresh token in cookie
    res.cookie("refreshToken", refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    return res.json({
      accessToken,
      user,
    });
  } catch (err) {
    console.error("Login Error:", err);
    next(err);
  }
};

/**
 * POST /api/auth/refresh
 * Accepts token in request body
 */
export const refresh = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const token = req.cookies.refreshToken;
    if (!token) throw new AppError("Unauthorized", 401);

    const result = await authService.refreshAccessToken(token);
    return res.json(result);
  } catch (err) {
    res.clearCookie("refreshToken");
    next(err);
  }
};

/**
 * POST /api/auth/logout
 */
export const logout = (_req: Request, res: Response) => {
  res.clearCookie("refreshToken");

  return res.json({
    success: true,
    message: "Logged out",
  });
};

/**
 * GET /api/auth/me  (protected)
 */
export const getMe = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<Response | void> => {
  try {
    if (!req.user?.userId) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized",
      });
    }

    const user = await authService.getMe(req.user.userId);

    return res.status(200).json({
      user,
    });
  } catch (err) {
    console.error("GetMe Error:", err);
    next(err);
  }
};

/**
 * PUT /api/auth/change-password  (protected)
 */
export const changePassword = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<Response | void> => {
  try {
    if (!req.user?.userId) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized",
      });
    }

    const { currentPassword, newPassword } = req.body as {
      currentPassword?: string;
      newPassword?: string;
    };

    if (!currentPassword || !newPassword) {
      return res.status(400).json({
        success: false,
        message: "currentPassword and newPassword are required",
      });
    }

    if (newPassword.length < 8) {
      return res.status(400).json({
        success: false,
        message: "New password must be at least 8 characters",
      });
    }

    await authService.changePassword(req.user.userId, {
      currentPassword,
      newPassword,
    });

    return res.status(200).json({
      success: true,
      message: "Password updated successfully",
    });
  } catch (err) {
    console.error("Change Password Error:", err);
    next(err);
  }
};
