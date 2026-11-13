import { ValidationError } from "../lib/errors.js";

const DATE_ONLY_REGEX = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * Parses a YYYY-MM-DD string, ISO timestamp, or Date into UTC midnight
 * (`YYYY-MM-DDT00:00:00.000Z`) matching Prisma `@db.Date` columns.
 */
export function parseUtcDateOnly(value: string | Date, fieldName = "date"): Date {
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) {
      throw new ValidationError(`${fieldName} must be a valid date`);
    }
    return new Date(
      Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()),
    );
  }

  const trimmed = typeof value === "string" ? value.trim() : "";
  if (!trimmed) {
    throw new ValidationError(`${fieldName} must be a valid date`);
  }

  const match = DATE_ONLY_REGEX.exec(trimmed);
  if (match) {
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    const utcDate = new Date(Date.UTC(year, month - 1, day));
    if (
      utcDate.getUTCFullYear() !== year ||
      utcDate.getUTCMonth() !== month - 1 ||
      utcDate.getUTCDate() !== day
    ) {
      throw new ValidationError(`${fieldName} must be a valid date`);
    }
    return utcDate;
  }

  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) {
    throw new ValidationError(`${fieldName} must be a valid date`);
  }

  return new Date(
    Date.UTC(parsed.getUTCFullYear(), parsed.getUTCMonth(), parsed.getUTCDate()),
  );
}

export function parseOptionalUtcDateOnly(
  value: string | Date | undefined | null,
  fieldName = "date",
): Date | undefined {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }
  return parseUtcDateOnly(value, fieldName);
}

export function formatUtcDateOnly(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function getTodayUtcDateOnly(
  reference: Date = new Date(),
  timeZone: string | undefined = process.env.APP_TIMEZONE,
): Date {
  if (timeZone) {
    const formatted = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(reference);
    return parseUtcDateOnly(formatted, "today");
  }

  return new Date(
    Date.UTC(reference.getFullYear(), reference.getMonth(), reference.getDate()),
  );
}
