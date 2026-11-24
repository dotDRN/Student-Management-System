import React from 'react';
import type { CareerRecord, StudentProfilePayload } from '../../types';
import { formatDate } from '../../utils/date';

interface StudentReportCardProps {
  profile: StudentProfilePayload;
  radarData: Array<{ skill: string; score: number; maxLevel?: number }>;
  careers: CareerRecord[];
}

function formatTermCell(
  pct: number | null | undefined,
  rawMarks: number | null | undefined,
  maxMarks: number | undefined,
  isAbsent: boolean | undefined,
): string {
  if (isAbsent) return 'Absent';
  if (pct == null) return '—';
  if (rawMarks != null && maxMarks != null) {
    return `${rawMarks}/${maxMarks} (${Number(pct).toFixed(1)}%)`;
  }
  return `${Number(pct).toFixed(1)}%`;
}

export const StudentReportCard: React.FC<StudentReportCardProps> = ({
  profile,
  radarData,
  careers,
}) => {
  const { student, stats, examComparison, academicYearLabel } = profile;
  const fallbackYear = `${new Date().getUTCFullYear()}-${String(new Date().getUTCFullYear() + 1).slice(-2)}`;
  const displayAcademicYear = academicYearLabel || fallbackYear;

  return (
    <div className="space-y-5 text-sm text-neutral-800 bg-white">
      {/* Formal Report Header */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 border-b-2 border-neutral-900 pb-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-brand-700">
            Student Academic &amp; Holistic Progress Report Card
          </p>
          <h2 className="text-2xl font-bold text-neutral-900 mt-1">{student.fullName}</h2>
          <p className="text-xs text-neutral-600 mt-0.5">
            {student.center?.name ?? student.centerId} &bull;{' '}
            {student.program?.name ?? student.programId}
          </p>
        </div>
        <div className="sm:text-right text-xs space-y-1 bg-neutral-50 border border-neutral-200 rounded-lg px-3 py-2">
          <div>
            <span className="text-neutral-500">Academic Year: </span>
            <span className="font-semibold text-neutral-900">{displayAcademicYear}</span>
          </div>
          <div>
            <span className="text-neutral-500">Roll No: </span>
            <span className="font-semibold text-neutral-900">{student.rollNumber || '—'}</span>
          </div>
          <div>
            <span className="text-neutral-500">Generated: </span>
            <span className="font-medium text-neutral-900">
              {formatDate(new Date().toISOString().slice(0, 10), 'MMM d, yyyy')}
            </span>
          </div>
        </div>
      </div>

      {/* Student Metadata & Summary KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="rounded-lg border border-neutral-200 bg-neutral-50/70 p-3">
          <p className="text-[11px] uppercase tracking-wide text-neutral-500">Attendance Rate</p>
          <p className="text-lg font-bold text-neutral-900 mt-0.5">{stats?.attendancePct ?? 0}%</p>
          <p className="text-[11px] text-neutral-500">
            {stats?.presentCount ?? 0} / {stats?.totalSessions ?? 0} sessions
          </p>
        </div>
        <div className="rounded-lg border border-neutral-200 bg-neutral-50/70 p-3">
          <p className="text-[11px] uppercase tracking-wide text-neutral-500">Overall Exam Avg</p>
          <p className="text-lg font-bold text-neutral-900 mt-0.5">
            {stats?.avgExamPct != null ? `${stats.avgExamPct}%` : '—'}
          </p>
          <p className="text-[11px] text-neutral-500">Across graded exams</p>
        </div>
        <div className="rounded-lg border border-neutral-200 bg-neutral-50/70 p-3">
          <p className="text-[11px] uppercase tracking-wide text-neutral-500">Avg Skill Level</p>
          <p className="text-lg font-bold text-neutral-900 mt-0.5">
            {stats?.skillScore != null ? stats.skillScore : '—'}
          </p>
          <p className="text-[11px] text-neutral-500">{radarData.length} skills assessed</p>
        </div>
        <div className="rounded-lg border border-neutral-200 bg-neutral-50/70 p-3">
          <p className="text-[11px] uppercase tracking-wide text-neutral-500">Fee Status</p>
          <p className="text-sm font-bold text-neutral-900 mt-1">
            {student.isFullyPaid
              ? 'Cleared'
              : `₹${Number(student.feesPaid || 0).toLocaleString()} / ₹${Number(student.totalFees || 0).toLocaleString()}`}
          </p>
          <p className="text-[11px] text-neutral-500">
            {student.guardianName ? `Guardian: ${student.guardianName}` : 'No guardian listed'}
          </p>
        </div>
      </div>

      {/* Multi-Term Scholastic Exam Table */}
      <div>
        <h3 className="text-sm font-semibold text-neutral-900 mb-2">
          Multi-Term Scholastic Performance
        </h3>
        {!examComparison || examComparison.length === 0 ? (
          <p className="text-xs text-neutral-500 italic border border-dashed border-neutral-200 rounded-lg p-3">
            No scholastic exam scores recorded yet.
          </p>
        ) : (
          <div className="overflow-x-auto border border-neutral-200 rounded-lg">
            <table className="w-full text-left text-xs">
              <thead className="bg-neutral-50 uppercase text-neutral-600 border-b border-neutral-200">
                <tr>
                  <th className="py-2.5 px-3">Subject</th>
                  <th className="py-2.5 px-3">Baseline</th>
                  <th className="py-2.5 px-3">Midline</th>
                  <th className="py-2.5 px-3">Endline</th>
                  <th className="py-2.5 px-3 text-right">Net Shift</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {examComparison.map((row) => {
                  const netDelta =
                    row.baseline != null && row.endline != null
                      ? Number((row.endline - row.baseline).toFixed(1))
                      : null;
                  return (
                    <tr key={row.subject}>
                      <td className="py-2 px-3 font-medium text-neutral-900 capitalize">
                        {row.subject}
                        {row.maxMarks ? (
                          <span className="ml-1 text-[11px] text-neutral-400">
                            /{row.maxMarks}
                          </span>
                        ) : null}
                      </td>
                      <td className="py-2 px-3">
                        {formatTermCell(
                          row.baseline,
                          row.baselineMarks,
                          row.maxMarks,
                          row.baselineAbsent,
                        )}
                      </td>
                      <td className="py-2 px-3">
                        {formatTermCell(
                          row.midline,
                          row.midlineMarks,
                          row.maxMarks,
                          row.midlineAbsent,
                        )}
                      </td>
                      <td className="py-2 px-3">
                        {formatTermCell(
                          row.endline,
                          row.endlineMarks,
                          row.maxMarks,
                          row.endlineAbsent,
                        )}
                      </td>
                      <td
                        className={`py-2 px-3 text-right font-semibold ${
                          netDelta == null
                            ? 'text-neutral-400'
                            : netDelta > 0
                              ? 'text-emerald-700'
                              : netDelta < 0
                                ? 'text-red-600'
                                : 'text-neutral-700'
                        }`}
                      >
                        {netDelta == null
                          ? '—'
                          : `${netDelta > 0 ? '+' : ''}${netDelta.toFixed(1)} pts`}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Co-Scholastic Skill Rubric */}
      <div>
        <h3 className="text-sm font-semibold text-neutral-900 mb-2">
          Assessed Life &amp; Program Skills
        </h3>
        {radarData.length === 0 ? (
          <p className="text-xs text-neutral-500 italic">No skill assessments recorded yet.</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {radarData.map((s) => {
              const maxLvl = s.maxLevel && s.maxLevel > 0 ? s.maxLevel : 5;
              const pct = Math.min(100, Math.round((s.score / maxLvl) * 100));
              return (
                <div
                  key={s.skill}
                  className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg border border-neutral-200 bg-neutral-50/50 text-xs"
                >
                  <span className="font-medium text-neutral-800">{s.skill}</span>
                  <span className="font-semibold text-brand-700">
                    {s.score}/{maxLvl} ({pct}%)
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Career & Transition Notes */}
      {careers && careers.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-neutral-900 mb-1.5">
            Career Aspirations &amp; Counseling Notes
          </h3>
          <ul className="space-y-1 text-xs text-neutral-700">
            {careers.slice(0, 5).map((c, idx) => (
              <li key={idx}>
                &bull;{' '}
                <span className="font-medium text-neutral-900">
                  {c.careerGoal || c.careerInterest || 'Career Note'}
                </span>
                {c.industry ? ` (${c.industry})` : ''}
                {c.notes ? ` — ${c.notes}` : ''}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Print Sign-Off Row */}
      <div className="hidden print:grid grid-cols-3 gap-6 pt-8 mt-6 border-t border-neutral-200 text-xs text-neutral-600">
        <div>
          <div className="border-t border-neutral-400 pt-1.5">Mentor / Facilitator Signature</div>
        </div>
        <div>
          <div className="border-t border-neutral-400 pt-1.5">Center Coordinator Signature</div>
        </div>
        <div>
          <div className="border-t border-neutral-400 pt-1.5">Parent / Guardian Acknowledgement</div>
        </div>
      </div>
    </div>
  );
};
