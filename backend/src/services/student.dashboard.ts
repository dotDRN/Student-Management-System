import prisma from '../lib/prisma.js';

/* ─────────────────────────────────────────
   DASHBOARD SUMMARY
───────────────────────────────────────── */

export const getDashboardStats = async () => {
  const [totalStudents, totalAttendance, presentCount] = await Promise.all([
    prisma.student.count(),
    prisma.attendanceRecord.count(),
    prisma.attendanceRecord.count({ where: { status: "present" } }),
  ]);

  const attendanceRate =
    totalAttendance > 0 ? Number(((presentCount / totalAttendance) * 100).toFixed(1)) : 0;

  return {
    totalStudents,
    totalSessions: totalAttendance,
    attendanceRate: `${attendanceRate}%`,
    avgSkills: {
      communication: 0,
      confidence: 0,
      computerSkill: 0,
      problemSolving: 0,
      languageSkill: 0,
    },
  };
};
