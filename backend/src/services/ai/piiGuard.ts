import type { JwtPayload } from "../../utils/jwt.js";
import { ForbiddenError } from "../../lib/errors.js";
import prisma from "../../lib/prisma.js";

/**
 * Roles subject to vertical PII isolation per EdBase security rules.
 * Never allow minor students' phone numbers, addresses, DOBs, or raw identities
 * to enter LLM prompts for these roles.
 */
export const PII_RESTRICTED_ROLES = new Set<string>([
  "shareholder",
  "tech_admin",
  "volunteer",
]);

export const AI_STAFF_ROLES = new Set<string>([
  "super_admin",
  "tech_admin",
  "center_admin",
  "supervisor",
  "teacher",
  "staff",
  "volunteer",
  "shareholder",
]);

export function isPiiRestrictedRole(role?: string | null): boolean {
  return Boolean(role && PII_RESTRICTED_ROLES.has(role));
}

export function maskStudentName(id: string | undefined, fullName: string | undefined): string {
  const shortCode = (id || "ANON").replace(/[^a-zA-Z0-9]/g, "").slice(0, 6).toUpperCase() || "ANON";
  return `Student #${shortCode}`;
}

const SENSITIVE_PII_KEYS = new Set([
  "guardianPhone",
  "guardian_phone",
  "phone",
  "address",
  "dob",
  "guardianName",
  "guardian_name",
  "email",
  "ipAddress",
  "ip_address",
  "userAgent",
  "user_agent",
  "passwordHash",
  "password_hash",
]);

/**
 * Deeply sanitizes any domain payload before passing it into an LLM prompt
 * or returning it through AI tool outputs.
 */
export function sanitizePayloadForAi<T>(user: JwtPayload, payload: T): T {
  const restricted = isPiiRestrictedRole(user.role);
  return sanitizeNode(payload, restricted) as T;
}

function sanitizeNode(value: unknown, restricted: boolean, depth = 0): unknown {
  if (depth > 8 || value === null || value === undefined) {
    return value;
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (typeof value === "object" && "toNumber" in (value as Record<string, unknown>)) {
    const fn = (value as { toNumber?: unknown }).toNumber;
    if (typeof fn === "function") {
      return Number(value);
    }
  }

  if (Array.isArray(value)) {
    return value.map((item) => sanitizeNode(item, restricted, depth + 1));
  }

  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    const looksLikeStudent =
      ("rollNumber" in record || "enrollmentDate" in record || "studentId" in record || "attendanceRate" in record) &&
      typeof record.fullName === "string";

    for (const [key, val] of Object.entries(record)) {
      // Never leak credential hashes to any role
      if (key === "passwordHash" || key === "password_hash") {
        continue;
      }

      if (restricted && SENSITIVE_PII_KEYS.has(key)) {
        out[key] = "[REDACTED]";
        continue;
      }

      if (restricted && looksLikeStudent && key === "fullName") {
        const idHint =
          (typeof record.studentId === "string" && record.studentId) ||
          (typeof record.id === "string" && record.id) ||
          undefined;
        out[key] = maskStudentName(idHint, String(val));
        continue;
      }

      out[key] = sanitizeNode(val, restricted, depth + 1);
    }
    return out;
  }

  if (restricted && typeof value === "string") {
    // Scrub inline 10-digit phone numbers from free-text remarks when role is PII restricted
    return value.replace(/\b(?:\+?\d[\d\s-]{8,13}\d)\b/g, "[PHONE_REDACTED]");
  }

  return value;
}

/**
 * Ensures a parent/student user can only access AI insights for their own linked student.
 * Staff roles rely on existing center-scoping inside domain services.
 */
export async function assertStudentAiAccess(user: JwtPayload, studentId: string): Promise<void> {
  if (user.role === "parent") {
    const link = await prisma.parentStudent.findFirst({
      where: {
        parentUserId: user.userId,
        studentId,
      },
      select: { id: true },
    });
    if (!link) {
      throw new ForbiddenError("Parents can only access AI insights for their linked children.");
    }
    return;
  }

  if (user.role === "student") {
    throw new ForbiddenError("Direct student AI endpoints are not enabled for this role.");
  }

  if (!AI_STAFF_ROLES.has(user.role)) {
    throw new ForbiddenError("Your role does not have access to AI learner intelligence.");
  }
}

export function assertStaffAiChatAccess(user: JwtPayload): void {
  if (user.role === "parent" || user.role === "student") {
    throw new ForbiddenError("The global Ask EdBase staff copilot is restricted to staff and administrative roles.");
  }
  if (!AI_STAFF_ROLES.has(user.role)) {
    throw new ForbiddenError("Your role does not have access to the AI copilot.");
  }
}
