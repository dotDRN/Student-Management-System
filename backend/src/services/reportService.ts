import type { Prisma } from "@prisma/client";
import prisma from '../lib/prisma.js';
import type { JwtPayload } from '../lib/auth.js';
import { ForbiddenError } from '../lib/errors.js';

// Helper to apply center scope safely
function getCenterScope(user: JwtPayload) {
  return user.role === "super_admin" ? undefined : { in: user.centerIds };
}

// ----------------------------------------------------------------------
// DASHBOARD
// ----------------------------------------------------------------------
export async function getDashboardSummary(user: JwtPayload) {
  const centerScope = getCenterScope(user);

  const [totalStudents, totalCentersList] = await Promise.all([
    prisma.student.count({
      where: { isActive: true, centerId: centerScope },
    }),
    prisma.center.findMany({
      where: { id: centerScope },
      select: { id: true, name: true }
    }),
  ]);

  const centerIds = centerScope ? user.centerIds : totalCentersList.map((c: any) => c.id);

  // Overall Attendance Rate (last 30 days)
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const recentAttendance = await prisma.attendanceRecord.groupBy({
    by: ['status'],
    where: {
      centerId: centerScope,
      session: { sessionDate: { gte: thirtyDaysAgo } }
    },
    _count: { status: true },
  });

  let present = 0, late = 0, totalAtt = 0;
  for (const group of recentAttendance) {
    if (group.status === 'present') present += group._count.status;
    if (group.status === 'late') late += group._count.status;
    totalAtt += group._count.status;
  }
  const overallAttendanceRate = totalAtt === 0 ? 0 : Math.round(((present + late) / totalAtt) * 100);

  // Center Breakdown
  const centerBreakdown = [];
  for (const center of totalCentersList) {
    const studentCount = await prisma.student.count({
      where: { centerId: center.id, isActive: true }
    });
    
    // rate for this specific center
    const cAtt = await prisma.attendanceRecord.groupBy({
      by: ['status'],
      where: { centerId: center.id },
      _count: { status: true },
    });
    let cp = 0, cl = 0, ct = 0;
    for (const g of cAtt) {
      if (g.status === 'present') cp += g._count.status;
      if (g.status === 'late') cl += g._count.status;
      ct += g._count.status;
    }
    const attendanceRate = ct === 0 ? 0 : Math.round(((cp + cl) / ct) * 100);

    centerBreakdown.push({
      centerId: center.id,
      name: center.name,
      studentCount,
      attendanceRate
    });
  }

  // Program Breakdown
  const programCounts = await prisma.student.groupBy({
    by: ['programId'],
    where: { centerId: centerScope, isActive: true },
    _count: { programId: true }
  });

  const programsMap = await prisma.program.findMany({
    where: { id: { in: programCounts.map((p: any) => p.programId) } },
    select: { id: true, name: true }
  });

  const programBreakdown = programCounts.map((pc: any) => {
    const p = programsMap.find((x: any) => x.id === pc.programId);
    return {
      programId: pc.programId,
      name: p?.name || 'Unknown',
      studentCount: pc._count.programId
    };
  });

  // Growth (new students this month)
  const firstOfMonth = new Date();
  firstOfMonth.setDate(1);
  firstOfMonth.setHours(0, 0, 0, 0);

  const newStudentsThisMonth = await prisma.student.count({
    where: { 
      centerId: centerScope, 
      isActive: true,
      enrollmentDate: { gte: firstOfMonth }
    }
  });

  return {
    totalStudents,
    totalCenters: totalCentersList.length,
    overallAttendanceRate,
    newStudentsThisMonth,
    centerBreakdown,
    programBreakdown
  };
}


// ----------------------------------------------------------------------
// ATTENDANCE ANALYTICS
// ----------------------------------------------------------------------
export async function getAttendanceAnalytics(user: JwtPayload, query: any) {
  const { centerId, programId, from, to } = query;
  if (!from || !to) throw new Error("from and to dates are required");

  const whereSession: Prisma.AttendanceSessionWhereInput = {
    sessionDate: { gte: new Date(from), lte: new Date(to) },
    centerId: getCenterScope(user)
  };

  if (centerId) whereSession.centerId = centerId;
  if (programId) whereSession.programId = programId;

  // Verify access for arbitrary centerId
  if (centerId && user.role !== "super_admin" && !user.centerIds.includes(centerId as string)) {
    throw new ForbiddenError("No access to requested center");
  }

  const sessions = await prisma.attendanceSession.findMany({
    where: whereSession,
    include: {
      records: {
        include: { student: { select: { fullName: true } } }
      }
    }
  });

  let totalPresent = 0, totalAbsent = 0, totalLate = 0;
  
  const byDateMap = new Map<string, any>();
  const byStudentMap = new Map<string, any>();

  for (const session of sessions) {
    const dStr = session.sessionDate.toISOString().split('T')[0];
    if (!byDateMap.has(dStr)) {
      byDateMap.set(dStr, { date: dStr, presentCount: 0, absentCount: 0, lateCount: 0, rate: 0 });
    }
    const dObj = byDateMap.get(dStr);

    for (const record of session.records) {
      // Global counts
      if (record.status === 'present') totalPresent++;
      else if (record.status === 'absent') totalAbsent++;
      else if (record.status === 'late') totalLate++;

      // Date counts
      if (record.status === 'present') dObj.presentCount++;
      else if (record.status === 'absent') dObj.absentCount++;
      else if (record.status === 'late') dObj.lateCount++;

      // Student counts
      if (!byStudentMap.has(record.studentId)) {
        byStudentMap.set(record.studentId, {
          studentId: record.studentId,
          fullName: record.student.fullName,
          presentCount: 0,
          absentCount: 0,
          lateCount: 0,
          rate: 0
        });
      }
      const sObj = byStudentMap.get(record.studentId);
      if (record.status === 'present') sObj.presentCount++;
      else if (record.status === 'absent') sObj.absentCount++;
      else if (record.status === 'late') sObj.lateCount++;
    }
  }

  const totalRecs = totalPresent + totalAbsent + totalLate;
  const averageAttendanceRate = totalRecs === 0 ? 0 : Math.round(((totalPresent + totalLate) / totalRecs) * 100);

  const byDate = Array.from(byDateMap.values()).map(d => {
    const total = d.presentCount + d.absentCount + d.lateCount;
    d.rate = total === 0 ? 0 : Math.round(((d.presentCount + d.lateCount) / total) * 100);
    return d;
  });

  const byStudent = Array.from(byStudentMap.values()).map(s => {
    const total = s.presentCount + s.absentCount + s.lateCount;
    s.rate = total === 0 ? 0 : Math.round(((s.presentCount + s.lateCount) / total) * 100);
    return s;
  });

  byStudent.sort((a, b) => a.rate - b.rate); // lowest ascending

  return {
    summary: {
      totalSessions: sessions.length,
      averageAttendanceRate,
      present: totalPresent,
      absent: totalAbsent,
      late: totalLate
    },
    byDate,
    byStudent
  };
}

// ----------------------------------------------------------------------
// EXAM ANALYTICS
// ----------------------------------------------------------------------
export async function getExamAnalytics(user: JwtPayload, query: any) {
  const { centerId, programId, academicYear } = query;
  if (!academicYear) throw new Error("academicYear is required");

  // Fetch all qualifying exams and scores
  const whereExam: Prisma.ExamWhereInput = {
    academicYear: { label: { contains: academicYear } },
    centerId: getCenterScope(user)
  };
  if (centerId) {
    if (user.role !== "super_admin" && !user.centerIds.includes(centerId as string)) throw new ForbiddenError("Denied");
    whereExam.centerId = centerId;
  }
  if (programId) whereExam.programId = programId;

  const exams = await prisma.exam.findMany({
    where: whereExam,
    include: {
      scores: {
        include: { student: { select: { fullName: true } }, subject: true }
      }
    }
  });

  const baseline = { english: { values: [] as number[], avg: 0, min: 0, max: 0 }, maths: { values: [] as number[], avg: 0, min: 0, max: 0 }, science: { values: [] as number[], avg: 0, min: 0, max: 0 } };
  const endline = { english: { values: [] as number[], avg: 0, min: 0, max: 0 }, maths: { values: [] as number[], avg: 0, min: 0, max: 0 }, science: { values: [] as number[], avg: 0, min: 0, max: 0 } };

  const studentMap = new Map<string, any>();

  for (const exam of exams) {
    const targetObj = exam.examType === 'baseline' ? baseline : endline;
    
    for (const score of exam.scores) {
      if (!score.marks || !score.subject) continue;
      const val = Number(score.marks);
      const sub = score.subject.name.toLowerCase() as 'english' | 'maths' | 'science';

      if (targetObj[sub]) {
        targetObj[sub].values.push(val);
      }

      if (!studentMap.has(score.studentId)) {
        studentMap.set(score.studentId, { studentId: score.studentId, fullName: score.student.fullName, baselineTotal: 0, endlineTotal: 0, delta: 0 });
      }
      const sObj = studentMap.get(score.studentId);
      if (exam.examType === 'baseline') sObj.baselineTotal += val;
      else sObj.endlineTotal += val;
    }
  }

  // Calc metrics
  for (const t of [baseline, endline]) {
    for (const k of ['english', 'maths', 'science'] as const) {
      const v = t[k].values;
      if (v.length > 0) {
        t[k].avg = Math.round(v.reduce((a, b) => a + b, 0) / v.length);
        t[k].min = Math.min(...v);
        t[k].max = Math.max(...v);
      }
    }
  }

  const improvement = {
    english: endline.english.avg - baseline.english.avg,
    maths: endline.maths.avg - baseline.maths.avg,
    science: endline.science.avg - baseline.science.avg,
  };

  const studentPerformance = Array.from(studentMap.values()).map(s => {
    s.delta = s.endlineTotal - s.baselineTotal;
    return s;
  });

  studentPerformance.sort((a, b) => b.delta - a.delta); // ascending logic for most improved last

  return {
    baseline: { english: { avg: baseline.english.avg, min: baseline.english.min, max: baseline.english.max }, maths: { avg: baseline.maths.avg, min: baseline.maths.min, max: baseline.maths.max }, science: { avg: baseline.science.avg, min: baseline.science.min, max: baseline.science.max } },
    endline: { english: { avg: endline.english.avg, min: endline.english.min, max: endline.english.max }, maths: { avg: endline.maths.avg, min: endline.maths.min, max: endline.maths.max }, science: { avg: endline.science.avg, min: endline.science.min, max: endline.science.max } },
    improvement,
    studentPerformance: studentPerformance.reverse() // smallest last initially reversed, actually sort wants most improved last, which means min at index 0
  };
}

// ----------------------------------------------------------------------
// SKILLS REPORT (no dedicated Skill model — averages from exam scores + skill-like forms)
// ----------------------------------------------------------------------
export async function getSkillsReport(user: JwtPayload, query: { centerId?: string; programId?: string }) {
  if (query.centerId && user.role !== "super_admin" && !user.centerIds.includes(query.centerId as string)) {
    throw new ForbiddenError("No access to requested center");
  }

  const centerFilter = query.centerId
    ? query.centerId
    : user.role === "super_admin"
      ? undefined
      : { in: user.centerIds };

  const studentWhere: Prisma.StudentWhereInput = {
    isActive: true,
    ...(centerFilter ? { centerId: centerFilter as string } : user.role === "super_admin" ? {} : { centerId: { in: user.centerIds } }),
    ...(query.programId ? { programId: query.programId as string } : {}),
  };

  const scores = await prisma.examScore.findMany({
    where: {
      student: studentWhere,
    },
    select: {
      subject: true,
      marks: true,
    },
  });

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

  const skillTemplates = await prisma.formTemplate.findMany({
    where: {
      isActive: true,
      formType: { contains: "skill", mode: "insensitive" },
    },
    select: { id: true, name: true, formType: true },
  });

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
    fromExamScoresBySubject,
    skillAveragesByTemplate,
  };
}


// ----------------------------------------------------------------------
// STUDENTS FILTER
// ----------------------------------------------------------------------
export async function getFilteredStudents(user: JwtPayload, query: any) {
  const { centerId, programId, ageMin, ageMax, gender, attendanceRateMin, attendanceRateMax, examScoreMin, examScoreMax } = query;
  
  if (centerId && user.role !== "super_admin" && !user.centerIds.includes(centerId as string)) throw new ForbiddenError("Denied");

  const whereStudent: Prisma.StudentWhereInput = {
    centerId: centerId ? (centerId as string) : getCenterScope(user),
    isActive: true
  };
  if (programId) whereStudent.programId = programId as string;
  if (gender) whereStudent.gender = gender as any;

  if (ageMin || ageMax) {
    const now = new Date();
    whereStudent.dob = {};
    if (ageMin) {
      const d = new Date(); d.setFullYear(now.getFullYear() - Number(ageMin));
      whereStudent.dob.lte = d;
    }
    if (ageMax) {
      const d = new Date(); d.setFullYear(now.getFullYear() - Number(ageMax) - 1);
      whereStudent.dob.gte = d;
    }
  }

  const rawStudents = await prisma.student.findMany({
    where: whereStudent,
    include: {
      attendanceRecords: true,
      examScores: true
    }
  });

  const aMin = attendanceRateMin ? Number(attendanceRateMin) : 0;
  const aMax = attendanceRateMax ? Number(attendanceRateMax) : 100;
  const eMin = examScoreMin ? Number(examScoreMin) : 0;
  const eMax = examScoreMax ? Number(examScoreMax) : 100;

  const results = [];
  for (const s of rawStudents) {
    // Math logic attendance
    const tAtt = s.attendanceRecords.length;
    const pAtt = s.attendanceRecords.filter((x: any) => x.status === 'present' || x.status === 'late').length;
    const aRate = tAtt === 0 ? 0 : Math.round((pAtt / tAtt) * 100);

    // Math logic exam
    const tEx = s.examScores.length;
    const validScores = s.examScores.filter((x: any) => x.marks !== null).map((x: any) => Number(x.marks) / Number(x.maxMarks));
    const eRate = validScores.length === 0 ? 0 : Math.round((validScores.reduce((a: number, b: number) => a + b, 0) / validScores.length) * 100);

    if (aRate >= aMin && aRate <= aMax && eRate >= eMin && eRate <= eMax) {
      results.push({
        id: s.id,
        fullName: s.fullName,
        centerId: s.centerId,
        programId: s.programId,
        attendanceRate: aRate,
        avgExamScore: eRate
      });
    }
  }

  return results;
}

// ----------------------------------------------------------------------
// EXPORT (CSV)
// ----------------------------------------------------------------------
export async function exportStudentDataCsv(user: JwtPayload, query: any): Promise<string> {
  const data = await getFilteredStudents(user, query); // reuse the same broad logic
  
  if (data.length === 0) return "id,fullName,centerId,programId,attendanceRate,avgExamScore\n";

  const headers = "id,fullName,centerId,programId,attendanceRate,avgExamScore\n";
  const rows = data.map(d => 
    `"${d.id}","${d.fullName}","${d.centerId}","${d.programId}",${d.attendanceRate},${d.avgExamScore}`
  ).join("\n");

  return headers + rows;
}
