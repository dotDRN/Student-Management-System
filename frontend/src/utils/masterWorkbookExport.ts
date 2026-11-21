import * as XLSX from 'xlsx';
import type { MasterWorkbookPayload } from '../services/reports.service';
import { sanitizeSpreadsheetCell } from './exportSanitize';

type CellInput = string | number | boolean | null | undefined;

function safeRow(cells: CellInput[]) {
  return cells.map((cell) => sanitizeSpreadsheetCell(cell));
}

function buildSheet(rows: CellInput[][], colWidths?: number[]) {
  const sheet = XLSX.utils.aoa_to_sheet(rows.map(safeRow));
  if (colWidths) {
    sheet['!cols'] = colWidths.map((wch) => ({ wch }));
  }
  return sheet;
}

export function downloadMasterWorkbookXlsx(payload: MasterWorkbookPayload) {
  const wb = XLSX.utils.book_new();

  // 1. KPIs sheet
  const kpiRows: CellInput[][] = [
    ['Metric', 'Value'],
    ['Generated Date (UTC)', payload.generatedDateUtc],
    ['Filter Center ID', payload.filters.centerId ?? 'All accessible'],
    ['Filter Program ID', payload.filters.programId ?? 'All programs'],
    ['Filter Date From (UTC)', payload.filters.from ?? '—'],
    ['Filter Date To (UTC)', payload.filters.to ?? '—'],
    ['Filter Academic Year', payload.filters.academicYear ?? '—'],
    ['Total Active Students', payload.kpis.totalStudents],
    ['Active Centers', payload.kpis.totalCenters],
    ['30-Day Attendance Rate (%)', payload.kpis.overallAttendanceRate],
    ['New Enrollments This Month', payload.kpis.newStudentsThisMonth],
    ['Pending Attendance Sheets Today', payload.kpis.pendingAttendanceToday],
    ['Pending Transfer Requests', payload.kpis.pendingTransfersCount],
    ['Total Fee Assigned', payload.kpis.feeTotalAssigned],
    ['Total Fee Collected', payload.kpis.feeTotalCollected],
    ['Total Fee Outstanding', payload.kpis.feeTotalOutstanding],
    ['Fee Collection Rate (%)', payload.kpis.feeCollectionPct],
  ];
  XLSX.utils.book_append_sheet(wb, buildSheet(kpiRows, [34, 28]), 'KPIs');

  // 2. Students sheet
  const studentRows: CellInput[][] = [
    [
      'Student ID',
      'Full Name',
      'Roll Number',
      'Center',
      'Program',
      'Enrollment Date (UTC)',
      'Attendance %',
      'Avg Exam %',
      'Total Fees',
      'Fees Paid',
      'Balance Due',
      'Fee Status',
    ],
    ...payload.students.map((s) => [
      s.id,
      s.fullName,
      s.rollNumber || '—',
      s.centerName,
      s.programName,
      s.enrollmentDate || '—',
      s.attendanceRate,
      s.avgExamScore,
      s.totalFees,
      s.feesPaid,
      s.balanceDue,
      s.feeStatus,
    ]),
  ];
  XLSX.utils.book_append_sheet(
    wb,
    buildSheet(studentRows, [36, 24, 14, 22, 22, 18, 14, 14, 14, 14, 14, 14]),
    'Students',
  );

  // 3. Attendance Summary sheet
  const attRows: CellInput[][] = [['Attendance Analytics Summary']];
  if (payload.attendanceSummary) {
    const s = payload.attendanceSummary.summary;
    attRows.push(
      ['Sessions', 'Avg Attendance %', 'Present', 'Late', 'Absent'],
      [s.totalSessions, s.averageAttendanceRate, s.present, s.late, s.absent],
      [],
      ['Student ID', 'Student Name', 'Present', 'Late', 'Absent', 'Attendance %'],
      ...payload.attendanceSummary.byStudent.map((st) => [
        st.studentId,
        st.fullName,
        st.presentCount,
        st.lateCount,
        st.absentCount,
        st.rate,
      ]),
      [],
      ['Date (UTC)', 'Present', 'Late', 'Absent', 'Rate %'],
      ...payload.attendanceSummary.byDate.map((d) => [
        d.date,
        d.presentCount,
        d.lateCount,
        d.absentCount,
        d.rate,
      ]),
    );
  } else {
    attRows.push(['No date range selected for detailed attendance breakdown.']);
  }
  XLSX.utils.book_append_sheet(
    wb,
    buildSheet(attRows, [36, 24, 12, 12, 12, 14]),
    'Attendance Summary',
  );

  // 4. Exam Performance sheet
  const examRows: CellInput[][] = [
    [
      'Subject',
      'Baseline Avg',
      'Baseline Min',
      'Baseline Max',
      'Endline Avg',
      'Endline Min',
      'Endline Max',
      'Improvement Delta',
    ],
    ...payload.examPerformance.map((e) => [
      e.subject,
      e.baselineAvg,
      e.baselineMin,
      e.baselineMax,
      e.endlineAvg,
      e.endlineMin,
      e.endlineMax,
      e.improvementDelta,
    ]),
  ];
  XLSX.utils.book_append_sheet(
    wb,
    buildSheet(examRows, [24, 14, 14, 14, 14, 14, 14, 18]),
    'Exam Performance',
  );

  // 5. Skill Proficiency sheet
  const skillRows: CellInput[][] = [
    ['Skill Area', 'Average Level', 'Max Level', 'Average Proficiency %', 'Sample Size'],
    ...payload.skillProficiency.map((sk) => [
      sk.skillName,
      sk.averageLevel,
      sk.maxLevel,
      sk.averagePct,
      sk.sampleSize,
    ]),
  ];
  XLSX.utils.book_append_sheet(
    wb,
    buildSheet(skillRows, [28, 16, 14, 22, 14]),
    'Skill Proficiency',
  );

  // 6. Fee Summary sheet
  const feeRows: CellInput[][] = [
    [
      'Center',
      'Program',
      'Active Students',
      'Students With Fee Plan',
      'Fully Paid',
      'Total Assigned',
      'Total Collected',
      'Outstanding Balance',
      'Collection %',
    ],
    ...payload.feeSummary.map((f) => [
      f.centerName,
      f.programName,
      f.studentCount,
      f.studentsWithFeePlan,
      f.fullyPaidCount,
      f.totalAssigned,
      f.totalCollected,
      f.outstanding,
      f.collectionPct,
    ]),
  ];
  XLSX.utils.book_append_sheet(
    wb,
    buildSheet(feeRows, [24, 24, 16, 22, 14, 16, 16, 20, 14]),
    'Fee Summary',
  );

  const fileName = `student_management_master_report_${payload.generatedDateUtc}.xlsx`;
  XLSX.writeFile(wb, fileName);
}
