import jwt from "jsonwebtoken";

const ACCESS_SECRET = process.env.JWT_ACCESS_SECRET!;
const REFRESH_SECRET = process.env.JWT_REFRESH_SECRET!;

const ACCESS_EXPIRY = "15m";
const REFRESH_EXPIRY = "7d";

export interface TokenPayload {
  userId: string;
  email: string;
  role: string;
  centerIds: string[];
  isActive?: boolean;
}

/* -------- ACCESS TOKEN -------- */

export const generateAccessToken = (payload: TokenPayload, expiresInOverride?: string) => {
  return jwt.sign(payload, ACCESS_SECRET, {
    expiresIn: (expiresInOverride || ACCESS_EXPIRY) as any,
  });
};

export const verifyAccessToken = (token: string) => {
  return jwt.verify(token, ACCESS_SECRET) as TokenPayload;
};

/* -------- REFRESH TOKEN -------- */

export const generateRefreshToken = (payload: TokenPayload) => {
  return jwt.sign(payload, REFRESH_SECRET, {
    expiresIn: REFRESH_EXPIRY,
  });
};

export const verifyRefreshToken = (token: string) => {
  return jwt.verify(token, REFRESH_SECRET) as TokenPayload;
};