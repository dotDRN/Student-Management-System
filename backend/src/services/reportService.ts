import type { Gender, Prisma } from "@prisma/client";
import { getScopedCenterIds } from "../config/rbac.js";
import { assertCenterAccess } from "../lib/centerScope.js";
import { ValidationError } from "../lib/errors.js";
import prisma from "../lib/prisma.js";
import { resolveAcademicYearId } from "../utils/academicYear.js";
import { calculateAttendancePercentage, countAttendanceStatuses } from "../utils/attendanceMetrics.js";
import { formatUtcDateOnly, getTodayUtcDateOnly, parseUtcDateOnly } from "../utils/dateOnly.js";
import type { JwtPayload } from "../utils/jwt.js";

const CSV_FORMULA_PREFIX_RE = /^[=+\-@\t\r]/;

export function formatCsvCell(value: unknown): string {
  const raw = value === null || value === undefined ? "" : String(value);
  const neutralized = CSV_FORMULA_PREFIX_RE.test(raw) ? `'${raw}` : raw;
  return `"${neutralized.replace(/"/g, '""')}"`;
}

function buildCenterFilter(
  user: JwtPayload,
  requestedCenterId?: string,
): string | { in: string[] } | undefined {
  if (requestedCenterId) {
    assertCenterAccess(user, requestedCenterId, "No access to requested center");
    return requestedCenterId;
  }
  const scopedCenterIds = getScopedCenterIds(user);
  return scopedCenterIds === undefined ? undefined : { in: scopedCenterIds };
}

function summarizeGroupedAttendance(
  groups: Array<{ status: string; _count: { status: number } }>,
): number {
  let present = 0;
  let late = 0;
  let absent = 0;
  for (const g of groups) {
    if (g.status === "present") present += g._count.status;
    else if (g.status === "late") late += g._count.status;
    else if (g.status === "absent") absent += g._count.status;
  }
  const total = present + absent + late;
  return total === 0 ? 0 : Math.round(((present + late) / total) * 100);
}

// ----------------------------------------------------------------------
// DASHBOARD
// ----------------------------------------------------------------------
export async function getDashboardSummary(user: JwtPayload) {
  const centerScope = buildCenterFilter(user);

  const [totalStudents, totalCentersList] = await Promise.all([
    prisma.student.count({
      where: { isActive: true, ...(centerScope ? { centerId: centerScope } : {}) },
    }),
    prisma.center.findMany({
      where: { isActive: true, ...(centerScope ? { id: centerScope } : {}) },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);

  const todayUtc = getTodayUtcDateOnly();
  const thirtyDaysAgoUtc = new Date(todayUtc.getTime() - 30 * 86_400_000);
  const nextDayUtc = new Date(todayUtc.getTime() + 86_400_000);

  const [
    recentAttendance,
    pendingAttendanceToday,
    pendingTransfersCount,
    feeAggregate,
    studentsWithFees,
    fullyPaidStudents,
  ] = await Promise.all([
    prisma.attendanceRecord.groupBy({
      by: ["status"],
      where: {
        ...(centerScope ? { centerId: centerScope } : {}),
        status: { in: ["present", "absent", "late"] },
        session: {
          isHoliday: false,
          sessionDate: { gte: thirtyDaysAgoUtc },
        },
      },
      _count: { status: true },
    }),
    prisma.attendanceSession.count({
      where: {
        ...(centerScope ? { centerId: centerScope } : {}),
        isHoliday: false,
        sessionDate: { gte: todayUtc, lt: nextDayUtc },
        records: { some: { status: "pending" } },
      },
    }),
    prisma.student.count({
      where: {
        ...(centerScope ? { centerId: centerScope } : {}),
        isActive: true,
        transferStatus: "pending_transfer",
      },
    }),
    prisma.student.aggregate({
      where: {
        ...(centerScope ? { centerId: centerScope } : {}),
        isActive: true,
      },
      _sum: { totalFees: true, feesPaid: true },
    }),
    prisma.student.count({
      where: {
        ...(centerScope ? { centerId: centerScope } : {}),
        isActive: true,
        totalFees: { gt: 0 },
      },
    }),
    prisma.student.count({
      where: {
        ...(centerScope ? { centerId: centerScope } : {}),
        isActive: true,
        totalFees: { gt: 0 },
        isFullyPaid: true,
      },
    }),
  ]);

  const overallAttendanceRate = summarizeGroupedAttendance(recentAttendance);
  const totalAssigned = Number(feeAggregate._sum?.totalFees ?? 0);
  const totalCollected = Number(feeAggregate._sum?.feesPaid ?? 0);
  const totalOutstanding = Math.max(0, Number((totalAssigned - totalCollected).toFixed(2)));
  const collectionPct =
    totalAssigned > 0 ? Math.min(100, Math.round((totalCollected / totalAssigned) * 100)) : 0;

  const centerBreakdown = [];
  for (const center of totalCentersList) {
    const [studentCount, cAtt] = await Promise.all([
      prisma.student.count({
        where: { centerId: center.id, isActive: true },
      }),
      prisma.attendanceRecord.groupBy({
        by: ["status"],
        where: {
          centerId: center.id,
          status: { in: ["present", "absent", "late"] },
          session: { isHoliday: false },
        },
        _count: { status: true },
      }),
    ]);

    centerBreakdown.push({
      centerId: center.id,
      name: center.name,
      studentCount,
      attendanceRate: summarizeGroupedAttendance(cAtt),
    });
  }

  const lowestAttendanceCenters = [...centerBreakdown]
    .filter((c) => c.studentCount > 0)
    .sort((a, b) => a.attendanceRate - b.attendanceRate || a.name.localeCompare(b.name))
    .slice(0, 3);

  const programCounts = await prisma.student.groupBy({
    by: ["programId"],
    where: { ...(centerScope ? { centerId: centerScope } : {}), isActive: true },
    _count: { programId: true },
  });

  const programIds = programCounts
    .map((p) => p.programId)
    .filter((id): id is string => id !== null);
  const programsMap =
    programIds.length > 0
      ? await prisma.program.findMany({
          where: { id: { in: programIds } },
          select: { id: true, name: true },
        })
      : [];

  const programNameById = new Map(programsMap.map((p) => [p.id, p.name]));
  const programBreakdown = programCounts.map((pc) => ({
    programId: pc.programId,
    name: pc.programId ? (programNameById.get(pc.programId) ?? "Unknown") : "Unassigned",
    studentCount: pc._count.programId,
  }));

  const firstOfMonthUtc = new Date(
    Date.UTC(todayUtc.getUTCFullYear(), todayUtc.getUTCMonth(), 1),
  );

  const newStudentsThisMonth = await prisma.student.count({
    where: {
      ...(centerScope ? { centerId: centerScope } : {}),
      isActive: true,
      enrollmentDate: { gte: firstOfMonthUtc },
    },
  });

  return {
    totalStudents,
    totalCenters: totalCentersList.length,
    overallAttendanceRate,
    newStudentsThisMonth,
    pendingAttendanceToday,
    pendingTransfersCount,
    feeSummary: {
      totalAssigned,
      totalCollected,
      totalOutstanding,
      collectionPct,
      fullyPaidStudents,
      studentsWithFees,
    },
    lowestAttendanceCenters,
    centerBreakdown,
    programBreakdown,
  };
}

// ----------------------------------------------------------------------
// ATTENDANCE ANALYTICS
// ----------------------------------------------------------------------
export async function getAttendanceAnalytics(
  user: JwtPayload,
  query: Record<string, unknown>,
) {
  const centerId = typeof query.centerId === "string" && query.centerId ? query.centerId : undefined;
  const programId = typeof query.programId === "string" && query.programId ? query.programId : undefined;
  const from = typeof query.from === "string" ? query.from : "";
  const to = typeof query.to === "string" ? query.to : "";

  if (!from || !to) {
    throw new ValidationError("from and to dates are required");
  }

  const fromDate = parseUtcDateOnly(from, "from");
  const toDate = parseUtcDateOnly(to, "to");
  if (toDate < fromDate) {
    throw new ValidationError("to date cannot be earlier than from date");
  }

  const centerScope = buildCenterFilter(user, centerId);

  const whereSession: Prisma.AttendanceSessionWhereInput = {
    isHoliday: false,
    sessionDate: { gte: fromDate, lte: toDate },
    ...(centerScope ? { centerId: centerScope } : {}),
    ...(programId ? { programId } : {}),
  };

  const sessions = await prisma.attendanceSession.findMany({
    where: whereSession,
    include: {
      records: {
        include: { student: { select: { fullName: true } } },
      },
    },
    orderBy: { sessionDate: "asc" },
  });

  let totalPresent = 0;
  let totalAbsent = 0;
  let totalLate = 0;

  const byDateMap = new Map<
    string,
    { date: string; presentCount: number; absentCount: number; lateCount: number; rate: number }
  >();
  const byStudentMap = new Map<
    string,
    { studentId: string; fullName: string; presentCount: number; absentCount: number; lateCount: number; rate: number }
  >();

  for (const session of sessions) {
    const dStr = session.sessionDate.toISOString().split("T")[0];
    if (!byDateMap.has(dStr)) {
      byDateMap.set(dStr, { date: dStr, presentCount: 0, absentCount: 0, lateCount: 0, rate: 0 });
    }
    const dObj = byDateMap.get(dStr)!;

    for (const record of session.records) {
      if (record.status !== "present" && record.status !== "absent" && record.status !== "late") {
        continue;
      }

      if (record.status === "present") {
        totalPresent++;
        dObj.presentCount++;
      } else if (record.status === "absent") {
        totalAbsent++;
        dObj.absentCount++;
      } else {
        totalLate++;
        dObj.lateCount++;
      }

      if (!byStudentMap.has(record.studentId)) {
        byStudentMap.set(record.studentId, {
          studentId: record.studentId,
          fullName: record.student.fullName,
          presentCount: 0,
          absentCount: 0,
          lateCount: 0,
          rate: 0,
        });
      }
      const sObj = byStudentMap.get(record.studentId)!;
      if (record.status === "present") sObj.presentCount++;
      else if (record.status === "absent") sObj.absentCount++;
      else sObj.lateCount++;
    }
  }

  const totalRecs = totalPresent + totalAbsent + totalLate;
  const averageAttendanceRate =
    totalRecs === 0 ? 0 : Math.round(((totalPresent + totalLate) / totalRecs) * 100);

  const byDate = Array.from(byDateMap.values()).map((d) => {
    const total = d.presentCount + d.absentCount + d.lateCount;
    return {
      ...d,
      rate: total === 0 ? 0 : Math.round(((d.presentCount + d.lateCount) / total) * 100),
    };
  });

  const byStudent = Array.from(byStudentMap.values())
    .map((s) => {
      const total = s.presentCount + s.absentCount + s.lateCount;
      return {
        ...s,
        rate: total === 0 ? 0 : Math.round(((s.presentCount + s.lateCount) / total) * 100),
      };
    })
    .sort((a, b) => a.rate - b.rate);

  return {
    summary: {
      totalSessions: sessions.length,
      averageAttendanceRate,
      present: totalPresent,
      absent: totalAbsent,
      late: totalLate,
    },
    byDate,
    byStudent,
  };
}

// ----------------------------------------------------------------------
// EXAM ANALYTICS
// ----------------------------------------------------------------------
type SubjectBucket = { avg: number; min: number; max: number };

export async function getExamAnalytics(user: JwtPayload, query: Record<string, unknown>) {
  const centerId = typeof query.centerId === "string" && query.centerId ? query.centerId : undefined;
  const programId = typeof query.programId === "string" && query.programId ? query.programId : undefined;
  const academicYear = typeof query.academicYear === "string" ? query.academicYear.trim() : "";

  if (!academicYear) {
    throw new ValidationError("academicYear is required");
  }

  const centerScope = buildCenterFilter(user, centerId);
  const resolvedYearId = await resolveAcademicYearId(academicYear);

  const whereExam: Prisma.ExamWhereInput = {
    ...(resolvedYearId
      ? { academicYearId: resolvedYearId }
      : { academicYear: { label: { contains: academicYear, mode: "insensitive" } } }),
    ...(centerScope ? { centerId: centerScope } : {}),
    ...(programId ? { programId } : {}),
  };

  const exams = await prisma.exam.findMany({
    where: whereExam,
    include: {
      scores: {
        include: {
          student: { select: { fullName: true } },
          subject: true,
        },
      },
    },
  });

  const baselineValues = new Map<string, number[]>();
  const endlineValues = new Map<string, number[]>();
  const allSubjects = new Set<string>();
  const studentMap = new Map<
    string,
    { studentId: string; fullName: string; baselineTotal: number; endlineTotal: number; delta: number }
  >();

  for (const exam of exams) {
    const kind = exam.examType.trim().toLowerCase();
    if (kind !== "baseline" && kind !== "endline") continue;

    for (const score of exam.scores) {
      if (score.isAbsent || score.marks === null || score.marks === undefined || !score.subject) {
        continue;
      }
      const val = Number(score.marks);
      if (!Number.isFinite(val)) continue;

      const subKey = score.subject.name.trim().toLowerCase();
      allSubjects.add(subKey);
      const targetMap = kind === "baseline" ? baselineValues : endlineValues;
      const list = targetMap.get(subKey) ?? [];
      list.push(val);
      targetMap.set(subKey, list);

      if (!studentMap.has(score.studentId)) {
        studentMap.set(score.studentId, {
          studentId: score.studentId,
          fullName: score.student.fullName,
          baselineTotal: 0,
          endlineTotal: 0,
          delta: 0,
        });
      }
      const sObj = studentMap.get(score.studentId)!;
      if (kind === "baseline") sObj.baselineTotal += val;
      else sObj.endlineTotal += val;
    }
  }

  const summarizeValues = (vals: number[] | undefined): SubjectBucket => {
    if (!vals || vals.length === 0) return { avg: 0, min: 0, max: 0 };
    const avg = Math.round(vals.reduce((a, b) => a + b, 0) / vals.length);
    return { avg, min: Math.min(...vals), max: Math.max(...vals) };
  };

  const baseline: Record<string, SubjectBucket> = {};
  const endline: Record<string, SubjectBucket> = {};
  const improvement: Record<string, number> = {};

  for (const sub of Array.from(allSubjects).sort()) {
    baseline[sub] = summarizeValues(baselineValues.get(sub));
    endline[sub] = summarizeValues(endlineValues.get(sub));
    improvement[sub] = endline[sub].avg - baseline[sub].avg;
  }

  const studentPerformance = Array.from(studentMap.values())
    .map((s) => ({
      ...s,
      delta: Number((s.endlineTotal - s.baselineTotal).toFixed(2)),
    }))
    .sort((a, b) => b.delta - a.delta);

  return {
    baseline,
    endline,
    improvement,
    studentPerformance,
  };
}

// ----------------------------------------------------------------------
// SKILLS REPORT (StudentSkillLog + legacy form & exam summaries)
// ----------------------------------------------------------------------
export async function getSkillsReport(
  user: JwtPayload,
  query: { centerId?: string; programId?: string },
) {
  const centerFilter = buildCenterFilter(user, query.centerId);

  const studentWhere: Prisma.StudentWhereInput = {
    isActive: true,
    ...(centerFilter ? { centerId: centerFilter } : {}),
    ...(query.programId ? { programId: query.programId } : {}),
  };

  const [skillLogs, scores, skillTemplates] = await Promise.all([
    prisma.studentSkillLog.findMany({
      where: { student: studentWhere },
      include: {
        skill: {
          select: { id: true, name: true, maxLevel: true },
        },
      },
    }),
    prisma.examScore.findMany({
      where: {
        student: studentWhere,
        isAbsent: false,
        marks: { not: null },
      },
      select: {
        subject: true,
        marks: true,
      },
    }),
    prisma.formTemplate.findMany({
      where: {
        isActive: true,
        formType: { contains: "skill", mode: "insensitive" },
      },
      select: { id: true, name: true, formType: true },
    }),
  ]);

  const bySkillId = new Map<
    string,
    { skillId: string; skillName: string; maxLevel: number; sum: number; count: number }
  >();
  for (const log of skillLogs) {
    if (!log.skill) continue;
    const maxLevel = log.skill.maxLevel > 0 ? log.skill.maxLevel : 5;
    const prev = bySkillId.get(log.skill.id) ?? {
      skillId: log.skill.id,
      skillName: log.skill.name,
      maxLevel,
      sum: 0,
      count: 0,
    };
    prev.sum += log.level;
    prev.count += 1;
    bySkillId.set(log.skill.id, prev);
  }

  const skillProficiency = Array.from(bySkillId.values())
    .map((entry) => {
      const averageLevel = Number((entry.sum / entry.count).toFixed(2));
      const averagePct = Math.min(
        100,
        Math.max(0, Math.round((averageLevel / entry.maxLevel) * 100)),
      );
      return {
        skillId: entry.skillId,
        skillName: entry.skillName,
        maxLevel: entry.maxLevel,
        averageLevel,
        averagePct,
        sampleSize: entry.count,
      };
    })
    .sort((a, b) => b.averagePct - a.averagePct);

  const bySubject = new Map<string, { sum: number; count: number }>();
  for (const row of scores) {
    if (row.marks === null || !row.subject) continue;
    const key = row.subject.name.toLowerCase();
    const prev = bySubject.get(key) ?? { sum: 0, count: 0 };
    prev.sum += Number(row.marks);
    prev.count += 1;
    bySubject.set(key, prev);
  }

  const fromExamScoresBySubject = [...bySubject.entries()].map(([subject, { sum, count }]) => ({
    subject,
    averageMarks: count ? Number((sum / count).toFixed(2)) : 0,
    sampleSize: count,
  }));

  const skillAveragesByTemplate: Array<{
    templateId: string;
    name: string;
    formType: string;
    fieldAverages: Record<string, number>;
    submissionCount: number;
  }> = [];

  for (const tpl of skillTemplates) {
    const submissions = await prisma.formSubmission.findMany({
      where: {
        templateId: tpl.id,
        student: studentWhere,
      },
      select: { data: true },
    });

    const numericSums = new Map<string, { sum: number; n: number }>();
    for (const sub of submissions) {
      const data = sub.data as Record<string, unknown>;
      if (!data || typeof data !== "object") continue;
      for (const [k, v] of Object.entries(data)) {
        if (typeof v === "number" && !Number.isNaN(v)) {
          const cur = numericSums.get(k) ?? { sum: 0, n: 0 };
          cur.sum += v;
          cur.n += 1;
          numericSums.set(k, cur);
        }
      }
    }

    const fieldAverages: Record<string, number> = {};
    for (const [k, { sum, n }] of numericSums) {
      fieldAverages[k] = n ? Number((sum / n).toFixed(2)) : 0;
    }

    skillAveragesByTemplate.push({
      templateId: tpl.id,
      name: tpl.name,
      formType: tpl.formType,
      fieldAverages,
      submissionCount: submissions.length,
    });
  }

  return {
    skillProficiency,
    fromExamScoresBySubject,
    skillAveragesByTemplate,
  };
}

// ----------------------------------------------------------------------
// STUDENTS FILTER & EXPORT
// ----------------------------------------------------------------------
function computeStudentRates(student: {
  attendanceRecords: Array<{ status: string }>;
  examScores: Array<{
    isAbsent?: boolean | null;
    marks: unknown;
    subject: { maxMarks: unknown } | null;
  }>;
}): { attendanceRate: number; avgExamScore: number } {
  const attendanceRate = calculateAttendancePercentage(
    countAttendanceStatuses(student.attendanceRecords),
  );

  const validRatios = student.examScores
    .filter((x) => !x.isAbsent && x.marks !== null && x.marks !== undefined)
    .map((x) => {
      const max = Number(x.subject?.maxMarks ?? 100);
      if (!Number.isFinite(max) || max <= 0) return null;
      return Number(x.marks) / max;
    })
    .filter((ratio): ratio is number => ratio !== null && Number.isFinite(ratio));

  const avgExamScore =
    validRatios.length === 0
      ? 0
      : Math.round((validRatios.reduce((a, b) => a + b, 0) / validRatios.length) * 100);

  return { attendanceRate, avgExamScore };
}

export async function getFilteredStudents(user: JwtPayload, query: Record<string, unknown>) {
  const centerId = typeof query.centerId === "string" && query.centerId ? query.centerId : undefined;
  const programId = typeof query.programId === "string" && query.programId ? query.programId : undefined;
  const gender = typeof query.gender === "string" && query.gender ? query.gender : undefined;
  const ageMin = query.ageMin !== undefined && query.ageMin !== "" ? Number(query.ageMin) : undefined;
  const ageMax = query.ageMax !== undefined && query.ageMax !== "" ? Number(query.ageMax) : undefined;
  const aMin =
    query.attendanceRateMin !== undefined && query.attendanceRateMin !== ""
      ? Number(query.attendanceRateMin)
      : 0;
  const aMax =
    query.attendanceRateMax !== undefined && query.attendanceRateMax !== ""
      ? Number(query.attendanceRateMax)
      : 100;
  const eMin =
    query.examScoreMin !== undefined && query.examScoreMin !== ""
      ? Number(query.examScoreMin)
      : 0;
  const eMax =
    query.examScoreMax !== undefined && query.examScoreMax !== ""
      ? Number(query.examScoreMax)
      : 100;

  const centerFilter = buildCenterFilter(user, centerId);

  const whereStudent: Prisma.StudentWhereInput = {
    ...(centerFilter ? { centerId: centerFilter } : {}),
    isActive: true,
    ...(programId ? { programId } : {}),
    ...(gender ? { gender: gender as Gender } : {}),
  };

  if (ageMin !== undefined || ageMax !== undefined) {
    const today = getTodayUtcDateOnly();
    whereStudent.dob = {};
    if (ageMin !== undefined && Number.isFinite(ageMin)) {
      whereStudent.dob.lte = new Date(
        Date.UTC(today.getUTCFullYear() - ageMin, today.getUTCMonth(), today.getUTCDate()),
      );
    }
    if (ageMax !== undefined && Number.isFinite(ageMax)) {
      whereStudent.dob.gte = new Date(
        Date.UTC(today.getUTCFullYear() - ageMax - 1, today.getUTCMonth(), today.getUTCDate()),
      );
    }
  }

  const rawStudents = await prisma.student.findMany({
    where: whereStudent,
    include: {
      center: { select: { id: true, name: true } },
      program: { select: { id: true, name: true } },
      attendanceRecords: {
        where: { session: { isHoliday: false } },
        select: { status: true },
      },
      examScores: {
        include: { subject: { select: { maxMarks: true } } },
      },
    },
    orderBy: { fullName: "asc" },
  });

  const results = [];
  for (const s of rawStudents) {
    const { attendanceRate: aRate, avgExamScore: eRate } = computeStudentRates(s);

    if (aRate >= aMin && aRate <= aMax && eRate >= eMin && eRate <= eMax) {
      results.push({
        id: s.id,
        fullName: s.fullName,
        centerId: s.centerId,
        centerName: s.center?.name ?? s.centerId,
        programId: s.programId,
        programName: s.program?.name ?? s.programId,
        attendanceRate: aRate,
        avgExamScore: eRate,
      });
    }
  }

  return results;
}

export async function exportStudentDataCsv(
  user: JwtPayload,
  query: Record<string, unknown>,
): Promise<string> {
  const data = await getFilteredStudents(user, query);
  const header = "id,fullName,centerName,programName,attendanceRate,avgExamScore\n";

  if (data.length === 0) return header;

  const rows = data
    .map((d) =>
      [
        formatCsvCell(d.id),
        formatCsvCell(d.fullName),
        formatCsvCell(d.centerName),
        formatCsvCell(d.programName),
        String(d.attendanceRate),
        String(d.avgExamScore),
      ].join(","),
    )
    .join("\n");

  return header + rows + "\n";
}

export async function getMasterWorkbookData(
  user: JwtPayload,
  query: Record<string, unknown>,
) {
  const centerId = typeof query.centerId === "string" && query.centerId ? query.centerId : undefined;
  const programId = typeof query.programId === "string" && query.programId ? query.programId : undefined;
  const from = typeof query.from === "string" && query.from ? query.from : undefined;
  const to = typeof query.to === "string" && query.to ? query.to : undefined;
  const academicYear =
    typeof query.academicYear === "string" && query.academicYear ? query.academicYear : undefined;

  const centerFilter = buildCenterFilter(user, centerId);

  const [dashboard, attendanceAnalytics, examAnalytics, skillsReport, rawStudents] =
    await Promise.all([
      getDashboardSummary(user),
      from && to
        ? getAttendanceAnalytics(user, { centerId, programId, from, to })
        : Promise.resolve(null),
      academicYear
        ? getExamAnalytics(user, { centerId, programId, academicYear })
        : Promise.resolve(null),
      getSkillsReport(user, { centerId, programId }),
      prisma.student.findMany({
        where: {
          ...(centerFilter ? { centerId: centerFilter } : {}),
          isActive: true,
          ...(programId ? { programId } : {}),
        },
        include: {
          center: { select: { id: true, name: true } },
          program: { select: { id: true, name: true } },
          attendanceRecords: {
            where: { session: { isHoliday: false } },
            select: { status: true },
          },
          examScores: {
            include: { subject: { select: { maxMarks: true } } },
          },
        },
        orderBy: [{ center: { name: "asc" } }, { fullName: "asc" }],
      }),
    ]);

  const feeGroups = new Map<
    string,
    {
      centerName: string;
      programName: string;
      studentCount: number;
      studentsWithFeePlan: number;
      fullyPaidCount: number;
      totalAssigned: number;
      totalCollected: number;
    }
  >();

  const students = rawStudents.map((s) => {
    const { attendanceRate, avgExamScore } = computeStudentRates(s);
    const centerName = s.center?.name ?? s.centerId;
    const programName = s.program?.name ?? s.programId ?? "Unassigned";
    const totalFees = s.totalFees != null ? Number(s.totalFees) : 0;
    const feesPaid = Number(s.feesPaid ?? 0);
    const balanceDue = Math.max(0, Number((totalFees - feesPaid).toFixed(2)));
    const feeStatus =
      totalFees <= 0
        ? "No Fee Plan"
        : s.isFullyPaid || balanceDue <= 0
          ? "Cleared"
          : feesPaid > 0
            ? "Partial"
            : "Pending";

    const groupKey = `${centerName}:::${programName}`;
    const existingGroup = feeGroups.get(groupKey) ?? {
      centerName,
      programName,
      studentCount: 0,
      studentsWithFeePlan: 0,
      fullyPaidCount: 0,
      totalAssigned: 0,
      totalCollected: 0,
    };
    existingGroup.studentCount += 1;
    if (totalFees > 0) {
      existingGroup.studentsWithFeePlan += 1;
      existingGroup.totalAssigned += totalFees;
      existingGroup.totalCollected += feesPaid;
      if (s.isFullyPaid || balanceDue <= 0) {
        existingGroup.fullyPaidCount += 1;
      }
    }
    feeGroups.set(groupKey, existingGroup);

    return {
      id: s.id,
      fullName: s.fullName,
      rollNumber: s.rollNumber ?? "",
      centerName,
      programName,
      enrollmentDate: s.enrollmentDate
        ? formatUtcDateOnly(new Date(s.enrollmentDate))
        : "",
      attendanceRate,
      avgExamScore,
      totalFees,
      feesPaid,
      balanceDue,
      feeStatus,
    };
  });

  const feeSummary = Array.from(feeGroups.values())
    .sort(
      (a, b) =>
        a.centerName.localeCompare(b.centerName) || a.programName.localeCompare(b.programName),
    )
    .map((g) => ({
      centerName: g.centerName,
      programName: g.programName,
      studentCount: g.studentCount,
      studentsWithFeePlan: g.studentsWithFeePlan,
      fullyPaidCount: g.fullyPaidCount,
      totalAssigned: Number(g.totalAssigned.toFixed(2)),
      totalCollected: Number(g.totalCollected.toFixed(2)),
      outstanding: Math.max(0, Number((g.totalAssigned - g.totalCollected).toFixed(2))),
      collectionPct:
        g.totalAssigned > 0
          ? Math.min(100, Math.round((g.totalCollected / g.totalAssigned) * 100))
          : 0,
    }));

  const examPerformance: Array<{
    subject: string;
    baselineAvg: number;
    baselineMin: number;
    baselineMax: number;
    endlineAvg: number;
    endlineMin: number;
    endlineMax: number;
    improvementDelta: number;
  }> = [];

  if (examAnalytics) {
    const subjects = new Set([
      ...Object.keys(examAnalytics.baseline),
      ...Object.keys(examAnalytics.endline),
    ]);
    for (const subj of Array.from(subjects).sort()) {
      const b = examAnalytics.baseline[subj] ?? { avg: 0, min: 0, max: 0 };
      const e = examAnalytics.endline[subj] ?? { avg: 0, min: 0, max: 0 };
      examPerformance.push({
        subject: subj,
        baselineAvg: b.avg,
        baselineMin: b.min,
        baselineMax: b.max,
        endlineAvg: e.avg,
        endlineMin: e.min,
        endlineMax: e.max,
        improvementDelta: examAnalytics.improvement[subj] ?? 0,
      });
    }
  }

  return {
    generatedDateUtc: formatUtcDateOnly(getTodayUtcDateOnly()),
    filters: {
      centerId: centerId ?? null,
      programId: programId ?? null,
      from: from ?? null,
      to: to ?? null,
      academicYear: academicYear ?? null,
    },
    kpis: {
      totalStudents: dashboard.totalStudents,
      totalCenters: dashboard.totalCenters,
      overallAttendanceRate: dashboard.overallAttendanceRate,
      newStudentsThisMonth: dashboard.newStudentsThisMonth,
      pendingAttendanceToday: dashboard.pendingAttendanceToday,
      pendingTransfersCount: dashboard.pendingTransfersCount,
      feeCollectionPct: dashboard.feeSummary.collectionPct,
      feeTotalAssigned: dashboard.feeSummary.totalAssigned,
      feeTotalCollected: dashboard.feeSummary.totalCollected,
      feeTotalOutstanding: dashboard.feeSummary.totalOutstanding,
    },
    students,
    attendanceSummary: attendanceAnalytics
      ? {
          summary: attendanceAnalytics.summary,
          byDate: attendanceAnalytics.byDate,
          byStudent: attendanceAnalytics.byStudent,
        }
      : null,
    examPerformance,
    skillProficiency: skillsReport.skillProficiency ?? [],
    feeSummary,
  };
}
