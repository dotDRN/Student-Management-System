import React, { useCallback, useEffect, useState } from "react";
import axios from "axios";
import { PageWrapper } from "../components/layout/PageWrapper";
import { Card } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { Input } from "../components/ui/Input";
import { LoadingSpinner } from "../components/ui/LoadingSpinner";
import { ErrorMessage } from "../components/ui/ErrorMessage";
import { EmptyState } from "../components/ui/EmptyState";
import {
  createExam,
  getExamSheet,
  getExamComparison,
  listExams,
  upsertExamScores,
} from "../services/exams.service";
import { listCenters, listPrograms } from "../services/centers.service";
import { useAuthStore } from "../store/useAuthStore";
import type { CenterSummary, ProgramSummary } from "../types";

type SubjectCol = {
  id: string;
  name: string;
  maxMarks: number;
  isNew?: boolean;
};
type GridRow = {
  marks: Record<string, string>;
  remarks: string;
  isAbsent: boolean;
};

const emptyRow = (cols: SubjectCol[]): GridRow => {
  const marks: Record<string, string> = {};
  for (const c of cols) marks[c.id] = "";

  return {
    marks,
    remarks: "",
    isAbsent: false,
  };
};

export const Exams: React.FC = () => {
  const selectedCenterId = useAuthStore((s) => s.selectedCenterId);
  const userRole = useAuthStore((s) => s.currentUser?.role || "");
  const isAdmin = ["super_admin", "center_admin", "tech_admin", "teacher"].includes(
    userRole,
  );

  const [centers, setCenters] = useState<CenterSummary[]>([]);
  const [programs, setPrograms] = useState<ProgramSummary[]>([]);
  const [centerId, setCenterId] = useState("");
  const [createCenterIds, setCreateCenterIds] = useState<string[]>([]);
  const [programId, setProgramId] = useState("");
  const [examType, setExamType] = useState("baseline");
  const [academicYear, setAcademicYear] = useState(
    `${new Date().getFullYear()}-${String(new Date().getFullYear() + 1).slice(-2)}`,
  );
  const [examDate, setExamDate] = useState(() =>
    new Date().toISOString().slice(0, 10),
  );

  const [examId, setExamId] = useState<string | null>(null);
  const [examLabel, setExamLabel] = useState("");
  const [subjects, setSubjects] = useState<SubjectCol[]>([]);
  const [grid, setGrid] = useState<Record<string, GridRow>>({});
  const [studentOrder, setStudentOrder] = useState<
    Array<{ id: string; fullName: string }>
  >([]);
  const [newSubjectName, setNewSubjectName] = useState("");
  const [availableExams, setAvailableExams] = useState<
    Array<{
      id: string;
      name: string;
      examType: string;
      center?: { name: string };
      createdAt: string;
    }>
  >([]);

  const [comparison, setComparison] = useState<Record<string, unknown> | null>(
    null,
  );
  const [listLoading, setListLoading] = useState(true);
  const [workspaceLoading, setWorkspaceLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Boot
  useEffect(() => {
    let alive = true;
    (async () => {
      setListLoading(true);
      try {
        const [c, p] = await Promise.all([listCenters(), listPrograms()]);
        if (!alive) return;
        setCenters(c);
        setPrograms(Array.isArray(p) ? p : []);
        const first =
          (!isAdmin && selectedCenterId ? selectedCenterId : c[0]?.id) ?? "";
        setCenterId(first);
        setCreateCenterIds(first ? [first] : []);
        setProgramId(p[0]?.id ?? "");
      } catch {
        if (alive) setError("Failed to load centers or programs.");
      } finally {
        if (alive) setListLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [isAdmin, selectedCenterId]);

  useEffect(() => {
    if (programs.length > 0 && !programs.some((p) => p.id === programId))
      setProgramId(programs[0].id);
  }, [programs, programId]);

  // Comparison
  const loadComparison = useCallback(async () => {
    try {
      const q: Record<string, string | undefined> = {
        academicYearId: academicYear,
      };
      if (!isAdmin && centerId) q.centerId = centerId;
      if (programId) q.programId = programId;
      setComparison((await getExamComparison(q)) as any);
    } catch {
      /* silent */
    }
  }, [academicYear, centerId, programId, isAdmin]);

  useEffect(() => {
    void loadComparison();
  }, [loadComparison]);

  // Hydrate grid from sheet endpoint response
  const hydrateFromSheet = useCallback((res: any) => {
    setExamId(res.id);
    setExamLabel(
      `${res.examType ?? ""} · ${res.academicYear?.label ?? ""} · ${
        res.examDate ? new Date(res.examDate).toLocaleDateString() : ""
      }`,
    );

    // Discover subjects from existing scores
    const subMap = new Map<string, SubjectCol>();
    for (const sc of res.scores || []) {
      if (sc.subject && !subMap.has(sc.subject.id)) {
        subMap.set(sc.subject.id, {
          id: sc.subject.id,
          name: sc.subject.name,
          maxMarks: sc.subject.maxMarks ? Number(sc.subject.maxMarks) : 100,
        });
      }
    }
    const cols = Array.from(subMap.values());
    setSubjects(cols);

    // Build student list from res.students (all enrolled students)
    const order: Array<{ id: string; fullName: string }> = (
      res.students || []
    ).map((s: any) => ({ id: s.id, fullName: s.fullName }));
    setStudentOrder(order);

    // Build grid: fill from scores
    const nextGrid: Record<string, GridRow> = {};
    for (const st of order) nextGrid[st.id] = emptyRow(cols);

    for (const sc of res.scores || []) {
      const row = nextGrid[sc.student?.id];
      if (!row) continue;
      if (sc.subject?.id) {
        row.marks[sc.subject.id] = sc.marks != null ? String(sc.marks) : "";
      }
      if (sc.isAbsent) row.isAbsent = true;
      if (sc.remarks && !row.remarks) row.remarks = sc.remarks;
    }
    setGrid(nextGrid);
  }, []);

  useEffect(() => {
    setExamId(null);
    setSubjects([]);
    setGrid({});
    setStudentOrder([]);
  }, [examDate]);

  const loadWorkspace = async (id: string) => {
    setWorkspaceLoading(true);
    setError(null);
    try {
      hydrateFromSheet(await getExamSheet(id));
    } catch {
      setError("Could not load exam workspace.");
    } finally {
      setWorkspaceLoading(false);
    }
  };

  // Prepare exam (admin only)
  const prepareExam = async () => {
    if (createCenterIds.length === 0 || !programId || !examType) {
      setError("Select center(s), program, and exam type.");
      return;
    }
    setError(null);
    setWorkspaceLoading(true);
    try {
      const res = (await createExam({
        centerIds: createCenterIds,
        programId,
        examType,
        academicYearId: academicYear,
        examDate,
      })) as any;
      const list = Array.isArray(res) ? res : res.exams || [];
      if (list[0]?.id) await loadWorkspace(list[0].id);
      else setError("Exam created but no ID returned.");
    } catch (err: unknown) {
      if (axios.isAxiosError(err)) {
        setError(
          `Error (${err.response?.status}): ${err.response?.data?.message || "Check inputs."}`,
        );
      } else setError("An unexpected error occurred.");
    } finally {
      setWorkspaceLoading(false);
    }
  };

  // Load from list (teachers + admins)
  const pickFromList = async () => {
    if (!centerId || !programId) return;

    setWorkspaceLoading(true);
    setError(null);

    try {
      const list = await listExams({
        centerId,
        programId,
        examType,
        academicYearId: academicYear,
        examDate,
      });

      if (!list?.length) {
        setError('No exam found. Ask an admin to create one first.');
      } else if (list.length === 1) {
        await loadWorkspace(list[0].id);
      } else {
        // Show picker for multiple exams
        setAvailableExams(list);
        setWorkspaceLoading(false);
        return;
      }

      await loadWorkspace(list[0].id);
    } catch {
      setError("Failed to load exam.");
    } finally {
      setWorkspaceLoading(false);
    }
  };

  const selectExam = async (id: string) => {
    setAvailableExams([]);
    await loadWorkspace(id);
  };

  // Add subject column (teacher types a name)
  const addSubjectColumn = () => {
    const name = newSubjectName.trim();
    if (!name) return;
    if (subjects.some((s) => s.name.toLowerCase() === name.toLowerCase())) {
      setError(`Subject "${name}" already exists.`);
      return;
    }
    const tempId = `new_${Date.now()}`;
    const col: SubjectCol = { id: tempId, name, maxMarks: 100, isNew: true };
    setSubjects((prev) => [...prev, col]);
    setGrid((prev) => {
      const next = { ...prev };
      for (const sid of Object.keys(next)) {
        next[sid] = {
          ...next[sid],
          marks: {
            ...next[sid].marks,
            [tempId]: "",
          },
        };
      }
      return next;
    });
    setNewSubjectName("");
    setError(null);
  };

  // Remove a subject column (only new ones that haven't been saved)
  const removeSubjectColumn = (colId: string) => {
    setSubjects((prev) => prev.filter((s) => s.id !== colId));
    setGrid((prev) => {
      const next = { ...prev };
      for (const sid of Object.keys(next)) {
        const row = next[sid];
        const { [colId]: _, ...restMarks } = row.marks;

        next[sid] = {
          ...row,
          marks: restMarks,
        };
        next[sid] = row as GridRow;
      }
      return next;
    });
  };

  const updateCell = (studentId: string, subjectId: string, value: string) => {
    setGrid((p) => {
      const row = p[studentId] ?? emptyRow(subjects);

      return {
        ...p,
        [studentId]: {
          ...row,
          marks: {
            ...row.marks,
            [subjectId]: value,
          },
        },
      };
    });
  };

  const updateRemarks = (studentId: string, value: string) => {
    setGrid((p) => {
      const row = p[studentId] ?? emptyRow(subjects);

      return {
        ...p,
        [studentId]: {
          ...row,
          remarks: value,
        },
      };
    });
  };

  const toggleAbsent = (studentId: string) => {
    setGrid((p) => {
      const row = p[studentId] ?? emptyRow(subjects);

      return {
        ...p,
        [studentId]: {
          ...row,
          isAbsent: !row.isAbsent,
        },
      };
    });
  };

  // Submit scores — sends subject name for new subjects (backend auto-creates)
  const submitScores = async () => {
    if (!examId) return;
    const scores: any[] = [];

    for (const { id: sid } of studentOrder) {
      const g = grid[sid];
      if (!g) continue;
      for (const col of subjects) {
        let n: number | null = null;
        if (!g.isAbsent) {
          const raw = (g.marks[col.id] ?? "").trim();
          if (raw === "") continue;
          n = Number(raw);
          if (Number.isNaN(n) || n < 0 || n > col.maxMarks) {
            setError(`Marks must be 0–${col.maxMarks} for ${col.name}.`);
            return;
          }
        }
        scores.push({
          studentId: sid,
          ...(col.isNew
            ? { subject: col.name }
            : { subjectId: col.id, subject: col.name }),
          marks: n,
          isAbsent: g.isAbsent,
          maxMarks: col.maxMarks,
          ...(g.remarks.trim() ? { remarks: g.remarks.trim() } : {}),
        });
      }
    }
    if (!scores.length) {
      setError("Enter at least one score.");
      return;
    }

    setSaving(true);
    setError(null);
    try {
      await upsertExamScores(examId, { scores });
      await loadWorkspace(examId);
      await loadComparison();
    } catch {
      setError("Save failed.");
    } finally {
      setSaving(false);
    }
  };

  const rowIncomplete = (sid: string) => {
    const g = grid[sid];
    if (!g || g.isAbsent) return false;
    return subjects.some((s) => (g.marks[s.id] ?? "").trim() === "");
  };

  if (listLoading)
    return (
      <PageWrapper title="Exams">
        <LoadingSpinner />
      </PageWrapper>
    );

  return (
    <PageWrapper title="Exams">
      {error && (
        <div className="mb-4">
          <ErrorMessage message={error} />
        </div>
      )}

      {/* Exam Setup */}
      <Card className="mb-6">
        <h2 className="text-lg font-semibold text-neutral-900 mb-4">
          Exam setup
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-4">
          {isAdmin && (
            <div>
              <label className="text-xs font-medium text-neutral-600">
                Centers (For Creation)
              </label>
              <div className="mt-1 flex flex-col gap-1 max-h-32 overflow-y-auto border border-neutral-300 rounded-lg p-2 bg-white">
                {centers.map((c) => (
                  <label key={c.id} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={createCenterIds.includes(c.id)}
                      onChange={(e) =>
                        e.target.checked
                          ? setCreateCenterIds((p) => [...p, c.id])
                          : setCreateCenterIds((p) =>
                              p.filter((id) => id !== c.id),
                            )
                      }
                    />
                    {c.name}
                  </label>
                ))}
              </div>
            </div>
          )}
          <div>
            <label className="text-xs font-medium text-neutral-600">
              Center (For Viewing)
            </label>
            <select
              className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm bg-white"
              value={centerId}
              onChange={(e) => setCenterId(e.target.value)}
            >
              {centers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-neutral-600">
              Program
            </label>
            <select
              className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm bg-white"
              value={programId}
              onChange={(e) => setProgramId(e.target.value)}
            >
              {programs.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-neutral-600">
              Exam type
            </label>
            <input
              list="exam-types"
              className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm bg-white"
              value={examType}
              onChange={(e) => setExamType(e.target.value)}
              placeholder="e.g. baseline, endline"
            />
            <datalist id="exam-types">
              <option value="baseline" />
              <option value="endline" />
            </datalist>
          </div>
          <Input
            label="Academic year"
            value={academicYear}
            onChange={(e) => setAcademicYear(e.target.value)}
          />
          <Input
            label="Exam date"
            type="date"
            value={examDate}
            onChange={(e) => setExamDate(e.target.value)}
          />
        </div>
        <div className="flex flex-wrap gap-2">
          {isAdmin && (
            <Button
              type="button"
              variant="primary"
              onClick={() => void prepareExam()}
              disabled={workspaceLoading}
            >
              {workspaceLoading ? "Loading…" : "Create & Open Exam"}
            </Button>
          )}
          <Button
            type="button"
            variant="secondary"
            onClick={() => void pickFromList()}
            disabled={workspaceLoading}
          >
            Load existing exam
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => void loadComparison()}
          >
            Refresh comparison
          </Button>
        </div>
        {examId && (
          <p className="text-sm text-neutral-600 mt-3">
            Active:{" "}
            <span className="font-medium text-neutral-900">{examLabel}</span> (
            {examId.slice(0, 8)}…)
          </p>
        )}

        {/* Exam picker when multiple exams found */}
        {availableExams.length > 1 && (
          <div className="mt-4 p-3 bg-brand-50/40 border border-brand-200 rounded-lg">
            <p className="text-sm font-medium text-neutral-700 mb-2">
              Multiple exams found — select one:
            </p>
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {availableExams.map((ex) => (
                <button
                  key={ex.id}
                  onClick={() => void selectExam(ex.id)}
                  className="w-full text-left p-3 bg-white rounded-lg border border-neutral-200 hover:border-brand-400 hover:shadow-sm transition-all flex justify-between items-center"
                >
                  <div>
                    <span className="font-medium text-neutral-900">
                      {ex.name || ex.examType}
                    </span>
                    {ex.center?.name && (
                      <span className="text-xs text-neutral-500 ml-2">
                        ({ex.center.name})
                      </span>
                    )}
                  </div>
                  <span className="text-xs text-neutral-400">
                    {new Date(ex.createdAt).toLocaleDateString()}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}
      </Card>

      {/* Marks Workspace */}
      {workspaceLoading ? (
        <LoadingSpinner />
      ) : !examId ? (
        <EmptyState
          title="No exam loaded"
          description={
            isAdmin
              ? 'Select filters and click "Create & Open Exam" or "Load existing exam".'
              : 'Select filters and click "Load existing exam" to enter marks.'
          }
        />
      ) : (
        <Card className="mb-6 overflow-x-auto">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-lg font-semibold text-neutral-900">
              Marks entry ({studentOrder.length} students
              {subjects.length > 0 ? ` × ${subjects.length} subjects` : ""})
            </h2>
            <Button
              type="button"
              variant="primary"
              isLoading={saving}
              onClick={() => void submitScores()}
              disabled={subjects.length === 0}
            >
              Save all scores
            </Button>
          </div>

          {/* Add Subject */}
          <div className="flex items-end gap-2 mb-4 p-3 bg-neutral-50 rounded-lg border border-neutral-200">
            <div className="flex-1">
              <label className="text-xs font-medium text-neutral-600">
                Add subject column
              </label>
              <input
                className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm bg-white"
                value={newSubjectName}
                onChange={(e) => setNewSubjectName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addSubjectColumn()}
                placeholder="Type subject name (e.g. English, Mathematics, Science)"
              />
            </div>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={addSubjectColumn}
            >
              + Add
            </Button>
          </div>

          {subjects.length === 0 ? (
            <div className="p-8 text-center border border-dashed border-neutral-200 rounded-xl bg-neutral-50">
              <p className="text-neutral-500 font-medium">
                No subjects added yet.
              </p>
              <p className="text-neutral-400 text-sm mt-1">
                Type a subject name above and click "+ Add" to start entering
                marks.
              </p>
            </div>
          ) : (
            <table className="w-full text-sm min-w-[720px]">
              <thead className="sticky top-0 bg-white z-10 shadow-sm">
                <tr className="border-b border-neutral-200 text-left text-neutral-600">
                  <th className="py-2 pr-3 font-medium">Student</th>
                  <th className="py-2 pr-2 font-medium w-16 text-center">
                    Absent
                  </th>
                  {subjects.map((col) => (
                    <th key={col.id} className="py-2 pr-2 font-medium">
                      <span className="capitalize">{col.name}</span>
                      {col.isNew && (
                        <button
                          onClick={() => removeSubjectColumn(col.id)}
                          className="ml-1 text-danger-500 hover:text-danger-700 text-xs"
                          title="Remove"
                        >
                          ✕
                        </button>
                      )}
                    </th>
                  ))}
                  <th className="py-2 pr-2 font-medium min-w-[140px]">
                    Remarks
                  </th>
                </tr>
              </thead>
              <tbody>
                {studentOrder.length === 0 ? (
                  <tr>
                    <td
                      colSpan={subjects.length + 3}
                      className="py-8 text-center text-neutral-500"
                    >
                      No students in this center + program.
                    </td>
                  </tr>
                ) : (
                  studentOrder.map((s, idx) => {
                    const g = grid[s.id] || emptyRow(subjects);
                    const inc = rowIncomplete(s.id);
                    return (
                      <tr
                        key={s.id}
                        className={`border-b border-neutral-100 ${idx % 2 === 1 ? "bg-neutral-50/80" : ""} ${inc ? "bg-amber-50" : ""} hover:bg-brand-50/60`}
                      >
                        <td className="py-2 pr-3 font-medium text-neutral-900 whitespace-nowrap">
                          {s.fullName}
                        </td>
                        <td className="py-1 pr-1 text-center">
                          <input
                            type="checkbox"
                            checked={g.isAbsent}
                            onChange={() => toggleAbsent(s.id)}
                            className="w-4 h-4 text-brand-600 rounded focus:ring-brand-500 border-neutral-300"
                          />
                        </td>
                        {subjects.map((col) => (
                          <td key={col.id} className="py-1 pr-1">
                            <input
                              className={`w-20 rounded border border-neutral-300 px-2 py-1.5 text-sm focus:ring-2 focus:ring-brand-500 focus:border-transparent ${g.isAbsent ? "bg-neutral-100 opacity-50 cursor-not-allowed" : ""}`}
                              inputMode="numeric"
                              value={g.marks[col.id] ?? ""}
                              disabled={g.isAbsent}
                              onChange={(e) =>
                                updateCell(s.id, col.id, e.target.value)
                              }
                            />
                          </td>
                        ))}
                        <td className="py-1 pr-1">
                          <input
                            className="w-full min-w-[120px] rounded border border-neutral-300 px-2 py-1.5 text-sm focus:ring-2 focus:ring-brand-500"
                            value={g.remarks ?? ""}
                            onChange={(e) =>
                              updateRemarks(s.id, e.target.value)
                            }
                            placeholder="Optional"
                          />
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          )}
          <p className="text-xs text-neutral-500 mt-3">
            Add subjects above, enter marks, then save. Rows with empty subjects
            are highlighted.
          </p>
        </Card>
      )}

      {/* Comparison */}
      <Card>
        <h2 className="text-lg font-semibold mb-4">
          Baseline vs Endline Comparison
        </h2>
        {!comparison || !(comparison as any).perSubject?.length ? (
          <div className="p-8 text-center border border-dashed border-neutral-200 rounded-xl bg-neutral-50">
            <p className="text-neutral-500 font-medium">
              No comparison data available.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {((comparison as any).perSubject || []).map((sub: any) => (
              <div
                key={sub.subject}
                className="bg-white p-4 rounded-xl border border-neutral-100 shadow-sm relative overflow-hidden"
              >
                <div
                  className={`absolute top-0 right-0 w-2 h-full ${sub.growth > 0 ? "bg-success-400" : sub.growth < 0 ? "bg-danger-400" : "bg-neutral-300"}`}
                />
                <p className="capitalize font-semibold text-neutral-900 mb-3">
                  {sub.subject}
                </p>
                <div className="flex justify-between text-sm bg-neutral-50 p-2 rounded mb-1">
                  <span className="text-neutral-600">Baseline Avg:</span>
                  <span className="font-medium">
                    {sub.baselineAvg?.toFixed(1) || "-"}
                  </span>
                </div>
                <div className="flex justify-between text-sm bg-neutral-50 p-2 rounded mb-1">
                  <span className="text-neutral-600">Endline Avg:</span>
                  <span className="font-medium">
                    {sub.endlineAvg?.toFixed(1) || "-"}
                  </span>
                </div>
                <div className="flex justify-between text-sm font-semibold mt-3 pt-2 border-t border-neutral-100">
                  <span>Growth:</span>
                  <span
                    className={
                      sub.growth > 0
                        ? "text-success-600"
                        : sub.growth < 0
                          ? "text-danger-600"
                          : "text-neutral-600"
                    }
                  >
                    {sub.growth > 0 ? "+" : ""}
                    {sub.growth?.toFixed(1) || 0}%
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </PageWrapper>
  );
};
