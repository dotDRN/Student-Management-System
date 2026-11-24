export type AttendanceCounts = {
  present?: number;
  absent?: number;
  late?: number;
  excused?: number;
  pending?: number;
};

export type AttendanceRateOptions = {
  countLateAsPresent?: boolean;
};

/**
 * Canonical attendance percentage across marked instructional records.
 * `pending` and `excused` records are excluded from the denominator.
 */
export function calculateAttendancePercentage(
  counts: AttendanceCounts,
  options: AttendanceRateOptions = {},
): number {
  const countLateAsPresent = options.countLateAsPresent ?? true;
  const present = counts.present ?? 0;
  const absent = counts.absent ?? 0;
  const late = counts.late ?? 0;

  const markedTotal = present + absent + late;
  if (markedTotal <= 0) {
    return 0;
  }

  const attended = present + (countLateAsPresent ? late : 0);
  return Math.round((attended / markedTotal) * 100);
}

export function countAttendanceStatuses(
  records: ReadonlyArray<{ status?: string | null }>,
): Required<AttendanceCounts> {
  const counts: Required<AttendanceCounts> = {
    present: 0,
    absent: 0,
    late: 0,
    excused: 0,
    pending: 0,
  };

  for (const record of records) {
    switch (record.status) {
      case "present":
        counts.present += 1;
        break;
      case "absent":
        counts.absent += 1;
        break;
      case "late":
        counts.late += 1;
        break;
      case "excused":
        counts.excused += 1;
        break;
      case "pending":
        counts.pending += 1;
        break;
      default:
        break;
    }
  }

  return counts;
}
