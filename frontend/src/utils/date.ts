/**
 * Native JavaScript date utilities
 */

const DATE_ONLY_REGEX = /^(\d{4})-(\d{2})-(\d{2})(?:T00:00:00(?:\.000)?Z)?$/;

function parseDisplayDate(date: Date | string | number): { parsed: Date; isDateOnly: boolean } {
  if (typeof date === 'string') {
    const match = DATE_ONLY_REGEX.exec(date.trim());
    if (match) {
      return {
        parsed: new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]))),
        isDateOnly: true,
      };
    }
  }
  return { parsed: new Date(date), isDateOnly: false };
}

/**
 * Formats a date using Intl.DateTimeFormat or manual string manipulation.
 * Supports patterns: 'MMM d, yyyy', 'MMM d, yyyy • h:mm a', 'yyyy-MM-dd'
 */
export function formatDate(date: Date | string | number, pattern = 'MMM d, yyyy'): string {
  const { parsed: d, isDateOnly } = parseDisplayDate(date);
  if (isNaN(d.getTime())) return 'Invalid Date';

  switch (pattern) {
    case 'MMM d, yyyy': {
      return new Intl.DateTimeFormat('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        ...(isDateOnly ? { timeZone: 'UTC' } : {}),
      }).format(d);
    }

    case 'MMM d, yyyy • h:mm a': {
      const formattedDate = new Intl.DateTimeFormat('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        ...(isDateOnly ? { timeZone: 'UTC' } : {}),
      }).format(d);
      const formattedTime = new Intl.DateTimeFormat('en-US', {
        hour: 'numeric',
        minute: 'numeric',
        hour12: true,
        ...(isDateOnly ? { timeZone: 'UTC' } : {}),
      }).format(d);
      return `${formattedDate} • ${formattedTime}`;
    }

    case 'yyyy-MM-dd': {
      const year = isDateOnly ? d.getUTCFullYear() : d.getFullYear();
      const month = String((isDateOnly ? d.getUTCMonth() : d.getMonth()) + 1).padStart(2, '0');
      const day = String(isDateOnly ? d.getUTCDate() : d.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    }

    default:
      return d.toLocaleDateString();
  }
}
