import { NextFunction, Request, RequestHandler, Response } from "express";
import { UnauthorizedError } from "./errors.js";
import { verifyAccessToken, JwtPayload } from "../utils/jwt.js";
import { DEFAULT_TENANT_ID, runWithTenantContext } from "./tenantContext.js";

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
    const tenantId =
      decoded.tenantId ||
      (req.headers["x-tenant-id"] as string | undefined) ||
      DEFAULT_TENANT_ID;

    decoded.tenantId = tenantId;
    (req as AuthenticatedRequest).user = decoded;

    runWithTenantContext(
      {
        tenantId,
        userId: decoded.userId,
        role: decoded.role,
      },
      () => next(),
    );
  } catch (error) {
    return next(error);
  }
};
