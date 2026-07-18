import { NextFunction, Request, RequestHandler, Response } from "express";
import { UserRole } from "@prisma/client";
import { UnauthorizedError } from './errors.js';
import { verifyAccessToken, JwtPayload } from '../utils/jwt.js';

type AuthenticatedRequest = Request & {
  user?: JwtPayload;
};

export const requireAuth: RequestHandler = (
  req: Request,
  _res: Response,
  next: NextFunction,
): void => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    return next(new UnauthorizedError("Authorization token is required"));
  }

  const token = authHeader.split(" ")[1];
  try {
    const decoded = verifyAccessToken(token);
    (req as AuthenticatedRequest).user = decoded; 
    return next();
  } catch (error) {
    return next(error);
  }
}
