const SPREADSHEET_FORMULA_RE = /^[=+\-@\t\r]/;

/**
 * Neutralizes spreadsheet formula injection (CSV/XLSX DDE payloads starting with
 * =, +, -, @, Tab, or CR) before serializing cells to `.xlsx` or `.csv`.
 */
export function sanitizeSpreadsheetCell(
  value: string | number | boolean | null | undefined,
): string | number | boolean {
  if (value === null || value === undefined) return '—';
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  const text = String(value);
  if (!text) return '—';
  return SPREADSHEET_FORMULA_RE.test(text) ? `'${text}` : text;
}
