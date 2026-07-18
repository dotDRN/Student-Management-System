import jwt from "jsonwebtoken";
import { UnauthorizedError } from "../lib/errors.js";

function getSecret(name: string): string {
  const secret = process.env[name];
  if (!secret) {
    throw new Error(`${name} is not configured`);
  }
  return secret;
}

const ACCESS_EXPIRY = "15m";
const REFRESH_EXPIRY = "7d";

export interface JwtPayload {
  userId: string;
  email: string;
  role: string;
  centerIds: string[];
  isActive: boolean;
}

/* -------- ACCESS TOKEN -------- */

export const generateAccessToken = (payload: JwtPayload, expiresInOverride?: string) => {
  return jwt.sign(payload, getSecret("JWT_ACCESS_SECRET"), {
    expiresIn: (expiresInOverride || ACCESS_EXPIRY) as any,
  });
};

export const verifyAccessToken = (token: string): JwtPayload => {
  try {
    return jwt.verify(token, getSecret("JWT_ACCESS_SECRET")) as JwtPayload;
  } catch (error) {
    throw new UnauthorizedError("Invalid or expired token");
  }
};

/* -------- REFRESH TOKEN -------- */

export const generateRefreshToken = (payload: JwtPayload) => {
  return jwt.sign(payload, getSecret("JWT_REFRESH_SECRET"), {
    expiresIn: REFRESH_EXPIRY,
  });
};

export const verifyRefreshToken = (token: string): JwtPayload => {
  try {
    return jwt.verify(token, getSecret("JWT_REFRESH_SECRET")) as JwtPayload;
  } catch (error) {
    throw new UnauthorizedError("Invalid or expired refresh token");
  }
};