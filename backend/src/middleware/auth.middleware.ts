import { Request, Response, NextFunction } from "express";
import { verifyAccessToken } from "../utils/jwt.js";
import { ADMIN_ROLES, ROLES, Role } from "../config/rbac.js";
import { DEFAULT_TENANT_ID, runWithTenantContext } from "../lib/tenantContext.js";

/**
 * AUTHENTICATE: The "Front Gate"
 * Verifies the JWT token, checks if the account is active, and binds the tenant context.
 */
export const authenticate = (req: Request, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({
      success: false,
      message: "No token provided. Access denied.",
    });
  }

  const token = authHeader.split(" ")[1];

  try {
    const decoded = verifyAccessToken(token);

    // Check if account is still active (Kill-switch)
    if (decoded.isActive === false) {
      return res.status(403).json({
        success: false,
        message: "Account is inactive. Please contact administrator.",
      });
    }

    // Ensure user has at least one center assigned (unless admin or linked parent)
    if (
      !ADMIN_ROLES.includes(decoded.role as Role) &&
      decoded.role !== ROLES.PARENT &&
      (!decoded.centerIds || decoded.centerIds.length === 0)
    ) {
      return res.status(403).json({
        success: false,
        message: "No centers assigned to user.",
      });
    }

    const tenantId =
      decoded.tenantId ||
      (req.headers["x-tenant-id"] as string | undefined) ||
      DEFAULT_TENANT_ID;

    decoded.tenantId = tenantId;
    req.user = decoded;

    return runWithTenantContext(
      {
        tenantId,
        userId: decoded.userId,
        role: decoded.role,
      },
      () => next(),
    );
  } catch (err) {
    return res.status(401).json({
      success: false,
      message: "Invalid or expired token.",
    });
  }
};

export const protect = authenticate;
