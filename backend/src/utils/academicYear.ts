import prisma from "../lib/prisma.js";
import { ValidationError } from "../lib/errors.js";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type ResolveAcademicYearOptions = {
  /** Fall back to the tenant's active/latest academic year when input is omitted. */
  fallbackToCurrent?: boolean;
  /** Throw ValidationError when a non-empty input does not match any AcademicYear. */
  strict?: boolean;
};

/**
 * Resolves an AcademicYear UUID from either a UUID string or a label (e.g. "2026-27"),
 * verifying tenant existence in DB.
 */
export async function resolveAcademicYearId(
  input?: string | null,
  options: ResolveAcademicYearOptions = {},
): Promise<string | undefined> {
  const trimmed = typeof input === "string" ? input.trim() : "";

  if (!trimmed) {
    if (!options.fallbackToCurrent) return undefined;
    const current = await getCurrentAcademicYear();
    return current?.id;
  }

  if (UUID_REGEX.test(trimmed)) {
    const existing = await prisma.academicYear.findUnique({
      where: { id: trimmed },
      select: { id: true },
    });
    if (!existing && options.strict) {
      throw new ValidationError("Academic year not found");
    }
    return existing?.id;
  }

  const byLabel = await prisma.academicYear.findFirst({
    where: { label: trimmed },
    select: { id: true },
  });

  if (!byLabel && options.strict) {
    throw new ValidationError(`Academic year '${trimmed}' not found`);
  }

  return byLabel?.id;
}

export async function getCurrentAcademicYear() {
  const current = await prisma.academicYear.findFirst({
    where: { isCurrent: true },
    orderBy: { startDate: "desc" },
  });
  if (current) return current;

  return prisma.academicYear.findFirst({
    orderBy: { startDate: "desc" },
  });
}

export async function listAcademicYears() {
  return prisma.academicYear.findMany({
    orderBy: [{ isCurrent: "desc" }, { startDate: "desc" }],
  });
}
