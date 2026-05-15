import prisma from "../lib/prisma.js";

/**
 * Converts academicYear input (UUID or label like "2026-27")
 * into a valid UUID from DB
 */
export async function resolveAcademicYearId(input?: string) {
  if (!input) return undefined;

  const uuidRegex =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  // If already UUID → return as is
  if (uuidRegex.test(input)) return input;

  // Otherwise treat as label
  const year = await prisma.academicYear.findFirst({
    where: { label: input },
  });

  return year?.id; // undefined if not found
}