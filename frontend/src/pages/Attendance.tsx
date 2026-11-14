import React, { useCallback, useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx";
import {
  AlertTriangle,
  CalendarRange,
  CheckCheck,
  Download,
  MessageSquare,
  QrCode,
  RefreshCw,
  WifiOff,
} from "lucide-react";
import { PageWrapper } from "../components/layout/PageWrapper";
import { Card } from "../components/ui/Card";
import { Input } from "../components/ui/Input";
import { Button } from "../components/ui/Button";
import { LoadingSpinner } from "../components/ui/LoadingSpinner";
import { ErrorMessage } from "../components/ui/ErrorMessage";
import { Badge } from "../components/ui/Badge";
import { QrAttendanceModal } from "../components/attendance/QrAttendanceModal";
import { useAuthStore } from "../store/useAuthStore";
import { usePermission } from "../hooks/usePermission";
import { useToast } from "../hooks/useToast";
import { getApiErrorMessage } from "../services/api";
import { formatDate } from "../utils/date";
import { sanitizeSpreadsheetCell } from "../utils/exportSanitize";
import {
  enqueueAttendanceMutation,
  flushAttendanceQueue,
  isLikelyNetworkError,
  listQueuedAttendanceMutations,
  type QueuedAttendanceItem,
} from "../utils/offlineAttendanceQueue";
import { listCenters, listPrograms } from "../services/centers.service";
import { listBatches, type BatchSummary } from "../services/batches.service";
import {
  createAttendanceSession,
  getAttendanceRegister,
  getAttendanceSessionById,
  getRecentAbsentees,
  getTodayFreshSheet,
  markHoliday,
  updateAttendanceSessionRecords,
  type AttendanceRegisterResponse,
  type RecentAbsenteeRecord,
} from "../services/attendance.service";
import type { CenterSummary, ProgramSummary } from "../types";

type Row = {
  recordId: string;
  studentId: string;
  name: string;
  rollNumber: string;
  status: "pending" | "present" | "absent" | "late" | "excused";
  remarks: string;
};

const STATUS_OPTIONS = [
  "pending",
  "present",
  "absent",
  "late",
  "excused",
] as const;

type Status = (typeof STATUS_OPTIONS)[number];

const STATUS_CONFIG: Record<
  Status,
  { label: string; color: string; bg: string }
> = {
  pending: { label: "Pending", color: "#4B5563", bg: "bg-gray-500" },
  present: { label: "Present", color: "#16A34A", bg: "bg-green-600" },
  absent: { label: "Absent", color: "#DC2626", bg: "bg-red-600" },
  late: { label: "Late", color: "#CA8A04", bg: "bg-yellow-600" },
  excused: { label: "Excused", color: "#2563EB", bg: "bg-blue-600" },
};

const MATRIX_CELL_STYLES: Record<string, { code: string; className: string; title: string }> = {
  present: { code: "P", className: "bg-emerald-100 text-emerald-800", title: "Present" },
  late: { code: "L", className: "bg-amber-100 text-amber-800", title: "Late" },
  absent: { code: "A", className: "bg-red-100 text-red-800", title: "Absent" },
  excused: { code: "E", className: "bg-blue-100 text-blue-800", title: "Excused" },
  holiday: { code: "H", className: "bg-neutral-200 text-neutral-600", title: "Holiday" },
  pending: { code: "·", className: "bg-neutral-50 text-neutral-400", title: "Pending" },
};

export function SegmentedSlider({
  value,
  onChange,
}: {
  value: Status;
  onChange: (v: Status) => void;
}) {
  const index = STATUS_OPTIONS.indexOf(value);

  return (
    <div className="relative flex w-full max-w-md items-center bg-gray-100 rounded-xl p-1.5 shadow-inner">
      <div
        className="absolute top-1.5 bottom-1.5 rounded-lg transition-all duration-300 ease-[cubic-bezier(0.4,0,0.2,1)] shadow-md"
        style={{
          width: `calc((100% - 12px) / ${STATUS_OPTIONS.length})`,
          transform: `translateX(${index * 100}%)`,
          backgroundColor: STATUS_CONFIG[value].color,
        }}
      />

      {STATUS_OPTIONS.map((status) => {
        const isActive = status === value;

        return (
          <button
            key={status}
            type="button"
            onClick={() => onChange(status)}
            className={`
              relative z-10 flex-1 px-2 py-1.5 text-xs font-semibold rounded-lg 
              transition-colors duration-200
              ${isActive ? "text-white" : "text-gray-500 hover:text-gray-700"}
            `}
          >
            {STATUS_CONFIG[status].label}
          </button>
        );
      })}
    </div>
  );
}

const getLocalDateStr = () => {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().split("T")[0];
};

export const Attendance: React.FC = () => {
  const selectedCenterId = useAuthStore((s) => s.selectedCenterId);
  const { can, isAdminRole } = usePermission();
  const toast = useToast();
  const isAdmin = isAdminRole;
  const canManageAttendance = can("manage", "attendance");

  const [centers, setCenters] = useState<CenterSummary[]>([]);
  const [programs, setPrograms] = useState<ProgramSummary[]>([]);
  const [batches, setBatches] = useState<BatchSummary[]>([]);
  const [centerId, setCenterId] = useState("");
  const [programId, setProgramId] = useState("");
  const [batchId, setBatchId] = useState("");

  const [date, setDate] = useState(getLocalDateStr());
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [expandedRemarks, setExpandedRemarks] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(false);
  const [boot, setBoot] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(true);
  const [success, setSuccess] = useState(false);
  const [isHoliday, setIsHoliday] = useState(false);
  const [showQrModal, setShowQrModal] = useState(false);
  const [isOnline, setIsOnline] = useState(() =>
    typeof navigator !== "undefined" ? navigator.onLine : true,
  );
  const [queuedMutations, setQueuedMutations] = useState<QueuedAttendanceItem[]>([]);
  const [syncingQueue, setSyncingQueue] = useState(false);

  const [activeTab, setActiveTab] = useState<"mark" | "register" | "absentees">("mark");

  // Monthly register state
  const [registerMonth, setRegisterMonth] = useState(() => getLocalDateStr().slice(0, 7));
  const [registerProgramId, setRegisterProgramId] = useState("");
  const [registerBatchId, setRegisterBatchId] = useState("");
  const [registerData, setRegisterData] = useState<AttendanceRegisterResponse | null>(null);
  const [loadingRegister, setLoadingRegister] = useState(false);

  // Absentees tracker state
  const [absentees, setAbsentees] = useState<RecentAbsenteeRecord[]>([]);
  const [loadingAbsentees, setLoadingAbsentees] = useState(false);
  const [minStreakFilter, setMinStreakFilter] = useState<1 | 2 | 3>(1);
  const [noteDrafts, setNoteDrafts] = useState<Record<string, string>>({});
  const [savingNoteId, setSavingNoteId] = useState<string | null>(null);

  const clearLoadedSession = () => {
    setSessionId(null);
    setRows([]);
    setExpandedRemarks({});
    setSuccess(false);
    setIsHoliday(false);
    setIsEditing(true);
  };

  const refreshOfflineQueue = useCallback(async () => {
    const items = await listQueuedAttendanceMutations();
    setQueuedMutations(items);
    return items;
  }, []);

  const handleFlushOfflineQueue = useCallback(
    async (silent = false) => {
      if (syncingQueue) return;
      const current = await listQueuedAttendanceMutations();
      if (current.length === 0) return;

      setSyncingQueue(true);
      try {
        const result = await flushAttendanceQueue((sid, recs) =>
          updateAttendanceSessionRecords(sid, { records: recs }),
        );
        setQueuedMutations(result.remaining);
        if (result.synced > 0) {
          toast.success({
            title: `Synced ${result.synced} offline attendance sheet${result.synced === 1 ? "" : "s"}`,
          });
        }
        if (result.failed > 0 && !silent) {
          toast.error({
            title: `${result.failed} queued sheet(s) still failed to sync`,
            description: result.remaining[0]?.lastError || "Check connection and retry.",
          });
        }
      } finally {
        setSyncingQueue(false);
      }
    },
    [syncingQueue, toast],
  );

  useEffect(() => {
    let alive = true;
    void listQueuedAttendanceMutations().then((items) => {
      if (alive) setQueuedMutations(items);
    });

    const onOnline = () => {
      setIsOnline(true);
      void handleFlushOfflineQueue(true);
    };
    const onOffline = () => {
      setIsOnline(false);
    };

    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      alive = false;
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, [handleFlushOfflineQueue]);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [c, p] = await Promise.all([listCenters(), listPrograms()]);
        if (!alive) return;
        setCenters(c);
        setPrograms(p);
        const defaultCenter = isAdmin
          ? (c[0]?.id ?? "")
          : (selectedCenterId ?? c[0]?.id ?? "");
        setCenterId(defaultCenter);
        setProgramId(p[0]?.id ?? "");
      } catch (err) {
        if (alive) setError(getApiErrorMessage(err, "Could not load centers or programs."));
      } finally {
        if (alive) setBoot(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [isAdmin, selectedCenterId]);

  useEffect(() => {
    if (!centerId) {
      setBatches([]);
      setBatchId("");
      setRegisterBatchId("");
      return;
    }
    let alive = true;
    listBatches({ centerId })
      .then((list) => {
        if (!alive) return;
        setBatches(Array.isArray(list) ? list : []);
      })
      .catch(() => {
        if (alive) setBatches([]);
      });
    return () => {
      alive = false;
    };
  }, [centerId]);

  const markBatchOptions = useMemo(
    () =>
      batches.filter(
        (b) => !programId || !b.activity?.programId || b.activity.programId === programId,
      ),
    [batches, programId],
  );

  const registerBatchOptions = useMemo(
    () =>
      batches.filter(
        (b) =>
          !registerProgramId ||
          !b.activity?.programId ||
          b.activity.programId === registerProgramId,
      ),
    [batches, registerProgramId],
  );

  useEffect(() => {
    if (batchId && !markBatchOptions.some((b) => b.id === batchId)) {
      setBatchId("");
    }
  }, [batchId, markBatchOptions]);

  useEffect(() => {
    if (registerBatchId && !registerBatchOptions.some((b) => b.id === registerBatchId)) {
      setRegisterBatchId("");
    }
  }, [registerBatchId, registerBatchOptions]);

  const loadRegister = useCallback(async () => {
    if (!centerId || !registerMonth) return;
    setLoadingRegister(true);
    setError(null);
    try {
      const res = await getAttendanceRegister({
        centerId,
        ...(registerProgramId ? { programId: registerProgramId } : {}),
        ...(registerBatchId ? { batchId: registerBatchId } : {}),
        month: registerMonth,
      });
      setRegisterData(res);
    } catch (err) {
      setError(getApiErrorMessage(err, "Could not load monthly register."));
    } finally {
      setLoadingRegister(false);
    }
  }, [centerId, registerProgramId, registerBatchId, registerMonth]);

  const loadAbsentees = useCallback(async () => {
    setLoadingAbsentees(true);
    setError(null);
    try {
      const data = await getRecentAbsentees(7, !isAdmin && centerId ? centerId : undefined);
      setAbsentees(data);
      const initialDrafts: Record<string, string> = {};
      for (const rec of data) {
        initialDrafts[rec.id] = rec.remarks ?? "";
      }
      setNoteDrafts(initialDrafts);
    } catch (err) {
      setError(getApiErrorMessage(err, "Could not load absentees."));
    } finally {
      setLoadingAbsentees(false);
    }
  }, [isAdmin, centerId]);

  useEffect(() => {
    if (activeTab === "register") {
      void loadRegister();
    } else if (activeTab === "absentees") {
      void loadAbsentees();
    }
  }, [activeTab, loadRegister, loadAbsentees]);

  const refreshRows = async (sid: string) => {
    const full = (await getAttendanceSessionById(sid)) as {
      isHoliday?: boolean;
      session?: { isHoliday?: boolean };
      records?: Array<{
        student?: { id: string; fullName: string; rollNumber?: string };
        record?: { id: string; status: string | null; remarks?: string | null };
      }>;
    };
    setIsHoliday(Boolean(full.isHoliday ?? full.session?.isHoliday));
    setRows(
      (full.records ?? []).map((r) => ({
        recordId: r.record?.id ?? "",
        studentId: r.student?.id ?? "",
        name: r.student?.fullName ?? "Student",
        rollNumber: r.student?.rollNumber ?? "",
        status: (r.record?.status as Row["status"]) ?? "pending",
        remarks: r.record?.remarks ?? "",
      })),
    );
  };

  const loadSession = async () => {
    if (!centerId || !programId) return;
    setLoading(true);
    setError(null);
    try {
      const res = (await createAttendanceSession({
        centerId,
        programId,
        sessionDate: date,
        ...(batchId ? { batchId } : {}),
      })) as { created?: boolean; session?: { id: string; isHoliday?: boolean } };
      const sid = res.session?.id;
      if (!sid) throw new Error("No session id");
      setSessionId(sid);
      setIsEditing(true);
      setSuccess(false);
      setIsHoliday(Boolean(res.session?.isHoliday));
      await refreshRows(sid);
    } catch (e: unknown) {
      const ax = e as {
        response?: { status?: number; data?: { session?: { id: string; isHoliday?: boolean } } };
      };
      if (ax.response?.status === 409 && ax.response.data?.session?.id) {
        const sid = ax.response.data.session.id;
        setSessionId(sid);
        setIsHoliday(Boolean(ax.response.data.session.isHoliday));
        await refreshRows(sid);
      } else {
        setError(getApiErrorMessage(e, "Could not create or load session for this date."));
      }
    } finally {
      setLoading(false);
    }
  };

  const loadFreshSheet = async () => {
    if (!centerId || !programId) return;
    setLoading(true);
    setError(null);
    try {
      const full = (await getTodayFreshSheet(centerId, programId, batchId || undefined)) as {
        id?: string;
        isHoliday?: boolean;
        records?: Array<{
          id?: string;
          status?: Row["status"] | null;
          remarks?: string | null;
          student?: { id?: string; fullName?: string; rollNumber?: string | null };
        }>;
      };
      if (!full || !full.id) throw new Error("No session returned");
      setSessionId(full.id);
      setIsEditing(true);
      setSuccess(false);
      setIsHoliday(Boolean(full.isHoliday));
      setDate(getLocalDateStr());

      setRows(
        (full.records ?? []).map((r) => ({
          recordId: r.id ?? "",
          studentId: r.student?.id ?? "",
          name: r.student?.fullName ?? "Student",
          rollNumber: r.student?.rollNumber ?? "",
          status: r.status ?? "pending",
          remarks: r.remarks ?? "",
        })),
      );
    } catch (e: unknown) {
      setError(getApiErrorMessage(e, "Could not load fresh sheet."));
    } finally {
      setLoading(false);
    }
  };

  const handleMarkPendingPresent = () => {
    if (!isEditing || !canManageAttendance) return;
    setRows((prev) =>
      prev.map((r) =>
        r.status === "pending" || !r.status ? { ...r, status: "present" } : r,
      ),
    );
    toast.info({ title: "Marked all pending students as Present", description: "Click Submit Attendance to save." });
  };

  const handleSave = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!sessionId || !isEditing || !canManageAttendance) return;

    setLoading(true);
    setError(null);
    setSuccess(false);

    const records = rows
      .filter((r) => r.recordId)
      .map((r) => ({
        recordId: r.recordId,
        status: r.status || "pending",
        remarks: r.remarks.trim() ? r.remarks.trim() : null,
      }));

    try {
      if (!isOnline) {
        throw { code: "ERR_NETWORK", message: "Browser is offline" };
      }

      await updateAttendanceSessionRecords(sessionId, { records });

      setIsEditing(false);
      setSuccess(true);
      toast.success({ title: "Attendance saved" });
    } catch (err) {
      if (!isOnline || isLikelyNetworkError(err)) {
        const centerLabel = centers.find((c) => c.id === centerId)?.name || "Center";
        const progLabel = programs.find((p) => p.id === programId)?.name || "Program";
        await enqueueAttendanceMutation({
          sessionId,
          sessionLabel: `${centerLabel} · ${progLabel} · ${date}`,
          records,
        });
        await refreshOfflineQueue();
        setIsEditing(false);
        setSuccess(true);
        toast.info({
          title: "Saved to Offline Queue",
          description: "Attendance changes were stored locally and will sync automatically when reconnected.",
        });
      } else {
        setError(getApiErrorMessage(err, "Failed to save attendance."));
      }
    } finally {
      setLoading(false);
    }
  };

  const handleToggleHoliday = async () => {
    if (!sessionId || !canManageAttendance) return;
    setLoading(true);
    setError(null);
    try {
      await markHoliday(sessionId, !isHoliday);
      setIsHoliday(!isHoliday);
      toast.success({ title: !isHoliday ? "Marked as holiday" : "Holiday flag removed" });
    } catch (err) {
      setError(getApiErrorMessage(err, "Failed to mark holiday."));
    } finally {
      setLoading(false);
    }
  };

  const handleExportRegisterExcel = () => {
    if (!registerData || registerData.students.length === 0) return;
    const sheetRows = registerData.students.map((stu) => {
      const base: Record<string, unknown> = {
        "Roll No": sanitizeSpreadsheetCell(stu.rollNumber || ""),
        "Student Name": sanitizeSpreadsheetCell(stu.fullName),
      };
      for (const dayStr of registerData.days) {
        const dayNum = dayStr.slice(-2);
        const st = stu.statuses[dayStr];
        base[dayNum] = MATRIX_CELL_STYLES[st]?.code ?? "";
      }
      base["Present + Late"] = stu.summary.present + stu.summary.late;
      base["Absent"] = stu.summary.absent;
      base["Rate %"] = `${stu.summary.attendanceRate}%`;
      return base;
    });
    const ws = XLSX.utils.json_to_sheet(sheetRows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, `Register_${registerData.month}`);
    XLSX.writeFile(wb, `attendance_register_${registerData.month}.xlsx`);
  };

  const handleSaveFollowupRemark = async (record: RecentAbsenteeRecord) => {
    const sid = record.sessionId ?? record.session?.id;
    if (!sid || !canManageAttendance) return;
    setSavingNoteId(record.id);
    try {
      const note = (noteDrafts[record.id] ?? "").trim();
      await updateAttendanceSessionRecords(sid, {
        records: [{ recordId: record.id, status: "absent", remarks: note || null }],
      });
      toast.success({ title: "Follow-up note saved" });
      await loadAbsentees();
    } catch (err) {
      toast.error({
        title: "Could not save note",
        description: getApiErrorMessage(err, "Please try again."),
      });
    } finally {
      setSavingNoteId(null);
    }
  };

  const pendingCount = useMemo(
    () => rows.filter((r) => r.status === "pending" || !r.status).length,
    [rows],
  );

  const filteredAbsentees = useMemo(
    () => absentees.filter((a) => (a.consecutiveAbsenceStreak ?? 1) >= minStreakFilter),
    [absentees, minStreakFilter],
  );

  if (boot) {
    return (
      <PageWrapper title="Attendance">
        <LoadingSpinner />
      </PageWrapper>
    );
  }

  return (
    <PageWrapper title="Attendance">
      {(!isOnline || queuedMutations.length > 0) && (
        <div
          className={`mb-4 rounded-xl border px-4 py-3 flex flex-wrap items-center justify-between gap-3 text-sm ${
            !isOnline
              ? "bg-amber-50 border-amber-200 text-amber-900"
              : "bg-indigo-50 border-indigo-200 text-indigo-900"
          }`}
        >
          <div className="flex items-center gap-2.5">
            {!isOnline ? <WifiOff size={17} className="shrink-0" /> : <RefreshCw size={17} className="shrink-0" />}
            <div>
              <p className="font-semibold">
                {!isOnline
                  ? "Offline Field Mode Active"
                  : `${queuedMutations.length} Offline Attendance Sheet${queuedMutations.length === 1 ? "" : "s"} Pending Sync`}
              </p>
              <p className="text-xs opacity-80">
                {!isOnline
                  ? `Submissions will be saved to device storage (${queuedMutations.length} queued) and synced automatically when internet returns.`
                  : "Connection restored. Sync queued attendance updates now."}
              </p>
            </div>
          </div>
          {isOnline && queuedMutations.length > 0 && (
            <Button
              type="button"
              size="sm"
              variant="primary"
              isLoading={syncingQueue}
              onClick={() => void handleFlushOfflineQueue(false)}
            >
              <RefreshCw size={14} className="mr-1.5" /> Sync Pending ({queuedMutations.length})
            </Button>
          )}
        </div>
      )}

      <div className="flex flex-wrap border-b border-neutral-200 mb-6 gap-4">
        <button
          className={`pb-2 text-sm font-medium ${activeTab === "mark" ? "border-b-2 border-primary text-primary" : "text-neutral-500 hover:text-neutral-700"}`}
          onClick={() => setActiveTab("mark")}
        >
          Mark Attendance
        </button>
        <button
          className={`pb-2 text-sm font-medium inline-flex items-center gap-1.5 ${activeTab === "register" ? "border-b-2 border-primary text-primary" : "text-neutral-500 hover:text-neutral-700"}`}
          onClick={() => setActiveTab("register")}
        >
          <CalendarRange size={15} /> Monthly Register
        </button>
        <button
          className={`pb-2 text-sm font-medium ${activeTab === "absentees" ? "border-b-2 border-primary text-primary" : "text-neutral-500 hover:text-neutral-700"}`}
          onClick={() => setActiveTab("absentees")}
        >
          Absentees Tracker
        </button>
      </div>

      {error && (
        <div className="mb-4">
          <ErrorMessage message={error} />
        </div>
      )}

      {activeTab === "mark" && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
          <div className="lg:col-span-2 space-y-4">
            <Card>
              <h2 className="text-lg font-semibold mb-4">Session</h2>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-medium text-neutral-600">
                    Center
                  </label>
                  <select
                    className="rounded-lg border border-neutral-300 px-3 py-2 text-sm"
                    value={centerId}
                    onChange={(e) => {
                      setCenterId(e.target.value);
                      clearLoadedSession();
                    }}
                    disabled={centers.length <= 1}
                  >
                    {centers.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-medium text-neutral-600">
                    Program
                  </label>
                  <select
                    className="rounded-lg border border-neutral-300 px-3 py-2 text-sm"
                    value={programId}
                    onChange={(e) => {
                      setProgramId(e.target.value);
                      clearLoadedSession();
                    }}
                  >
                    {programs.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-medium text-neutral-600">
                    Batch / Cohort (Optional)
                  </label>
                  <select
                    aria-label="Session Batch"
                    className="rounded-lg border border-neutral-300 px-3 py-2 text-sm bg-white"
                    value={batchId}
                    onChange={(e) => {
                      setBatchId(e.target.value);
                      clearLoadedSession();
                    }}
                  >
                    <option value="">All Students (Whole Program)</option>
                    {markBatchOptions.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="flex flex-wrap gap-3 items-end">
                <Input
                  type="date"
                  value={date}
                  onChange={(e) => {
                    setDate(e.target.value);
                    clearLoadedSession();
                  }}
                  className="max-w-xs"
                />
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => void loadSession()}
                  isLoading={loading}
                  disabled={!canManageAttendance}
                >
                  Load Session
                </Button>
                <Button
                  type="button"
                  variant="primary"
                  onClick={() => void loadFreshSheet()}
                  isLoading={loading}
                  disabled={!canManageAttendance}
                >
                  Load Today&apos;s Sheet
                </Button>
              </div>
            </Card>

            {sessionId && (
              <Card>
                <div className="flex flex-wrap justify-between items-center gap-3 mb-4">
                  <h2 className="text-lg font-semibold">Students ({rows.length})</h2>
                  <div className="flex flex-wrap items-center gap-3">
                    {isEditing && canManageAttendance && rows.length > 0 && (
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        onClick={() => setShowQrModal(true)}
                      >
                        <QrCode size={15} className="mr-1.5 text-brand-600" />
                        QR Check-In
                      </Button>
                    )}
                    {isEditing && canManageAttendance && pendingCount > 0 && (
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        onClick={handleMarkPendingPresent}
                      >
                        <CheckCheck size={15} className="mr-1.5 text-emerald-600" />
                        Mark All Pending Present ({pendingCount})
                      </Button>
                    )}
                    <label className="flex items-center gap-2 text-sm font-medium text-neutral-700 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={isHoliday}
                        onChange={() => void handleToggleHoliday()}
                        disabled={loading || !canManageAttendance}
                        className="rounded border-neutral-300 text-primary focus:ring-primary"
                      />
                      Mark as Holiday
                    </label>
                  </div>
                </div>
                <form onSubmit={handleSave} className="space-y-4">
                  <div className="border border-neutral-200 rounded-lg divide-y divide-neutral-100">
                    {rows.length === 0 ? (
                      <p className="p-4 text-sm text-neutral-500">
                        No records for this session.
                      </p>
                    ) : (
                      rows.map((r, i) => {
                        const rowKey = r.recordId || r.studentId;
                        const showRemarkInput =
                          Boolean(expandedRemarks[rowKey]) ||
                          Boolean(r.remarks) ||
                          (isEditing && (r.status === "absent" || r.status === "late" || r.status === "excused"));

                        return (
                          <div key={rowKey} className="p-3 space-y-2">
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                              <div>
                                <p className="font-medium text-neutral-900">
                                  {r.name}{" "}
                                  {r.rollNumber ? (
                                    <span className="text-xs text-neutral-400">({r.rollNumber})</span>
                                  ) : null}
                                </p>
                                <div className="flex items-center gap-2 text-xs text-neutral-500">
                                  <span className="capitalize">{r.status || "Pending"}</span>
                                  {isEditing && !showRemarkInput && (
                                    <button
                                      type="button"
                                      onClick={() =>
                                        setExpandedRemarks((prev) => ({ ...prev, [rowKey]: true }))
                                      }
                                      className="inline-flex items-center gap-1 text-brand-700 hover:underline"
                                    >
                                      <MessageSquare size={12} /> Add note
                                    </button>
                                  )}
                                </div>
                              </div>
                              <SegmentedSlider
                                value={r.status || "pending"}
                                onChange={(newStatus) => {
                                  if (!isEditing) return;

                                  setRows((prev) =>
                                    prev.map((x, j) =>
                                      j === i ? { ...x, status: newStatus } : x,
                                    ),
                                  );
                                }}
                              />
                            </div>

                            {showRemarkInput && (
                              <input
                                type="text"
                                disabled={!isEditing}
                                value={r.remarks}
                                onChange={(e) =>
                                  setRows((prev) =>
                                    prev.map((x, j) =>
                                      j === i ? { ...x, remarks: e.target.value } : x,
                                    ),
                                  )
                                }
                                placeholder="Follow-up note or reason (optional)"
                                className="w-full rounded-lg border border-neutral-200 px-3 py-1.5 text-xs bg-neutral-50 focus:bg-white focus:outline-none focus:ring-1 focus:ring-brand-500"
                              />
                            )}
                          </div>
                        );
                      })
                    )}
                  </div>
                  <div className="flex justify-between items-center">
                    {success && (
                      <span className="text-green-600 text-sm font-medium">
                        Attendance submitted successfully
                      </span>
                    )}

                    <div className="flex gap-2 ml-auto">
                      {isEditing ? (
                        <Button
                          type="button"
                          variant="primary"
                          onClick={() => void handleSave()}
                          isLoading={loading}
                          disabled={!rows.length || !canManageAttendance}
                        >
                          Submit Attendance
                        </Button>
                      ) : (
                        <Button
                          type="button"
                          variant="secondary"
                          disabled={!canManageAttendance}
                          onClick={async () => {
                            setLoading(true);
                            await refreshRows(sessionId!);
                            setIsEditing(true);
                            setSuccess(false);
                            setLoading(false);
                          }}
                        >
                          Edit Attendance
                        </Button>
                      )}
                    </div>
                  </div>
                </form>
              </Card>
            )}
          </div>
          <Card>
            <h2 className="text-lg font-semibold mb-2">How it works</h2>
            <p className="text-sm text-neutral-600">
              Pick center, program, and date, then load the session. Use &quot;Mark All
              Pending Present&quot; to speed up roll calls, toggle exceptions cleanly, and add
              follow-up notes before saving.
            </p>
          </Card>
        </div>
      )}

      {activeTab === "register" && (
        <Card>
          <div className="flex flex-wrap items-end justify-between gap-4 mb-4 pb-4 border-b border-neutral-100">
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 flex-1 min-w-[260px]">
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-neutral-600">Center</label>
                <select
                  className="rounded-lg border border-neutral-300 px-3 py-2 text-sm bg-white"
                  value={centerId}
                  onChange={(e) => setCenterId(e.target.value)}
                  disabled={centers.length <= 1}
                >
                  {centers.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-neutral-600">Program</label>
                <select
                  className="rounded-lg border border-neutral-300 px-3 py-2 text-sm bg-white"
                  value={registerProgramId}
                  onChange={(e) => setRegisterProgramId(e.target.value)}
                >
                  <option value="">All Programs</option>
                  {programs.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-neutral-600">Batch</label>
                <select
                  aria-label="Register Batch"
                  className="rounded-lg border border-neutral-300 px-3 py-2 text-sm bg-white"
                  value={registerBatchId}
                  onChange={(e) => setRegisterBatchId(e.target.value)}
                >
                  <option value="">All Batches</option>
                  {registerBatchOptions.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-neutral-600">Month</label>
                <input
                  type="month"
                  value={registerMonth}
                  onChange={(e) => setRegisterMonth(e.target.value)}
                  className="rounded-lg border border-neutral-300 px-3 py-2 text-sm bg-white"
                />
              </div>
            </div>
            <div className="flex gap-2">
              <Button variant="secondary" onClick={() => void loadRegister()} isLoading={loadingRegister}>
                Refresh
              </Button>
              <Button
                variant="primary"
                disabled={!registerData || registerData.students.length === 0}
                onClick={handleExportRegisterExcel}
              >
                <Download size={15} className="mr-1.5" /> Export Excel
              </Button>
            </div>
          </div>

          <div className="flex flex-wrap gap-3 mb-4 text-xs">
            <span className="px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 font-semibold">P = Present</span>
            <span className="px-2 py-0.5 rounded bg-amber-100 text-amber-800 font-semibold">L = Late</span>
            <span className="px-2 py-0.5 rounded bg-red-100 text-red-800 font-semibold">A = Absent</span>
            <span className="px-2 py-0.5 rounded bg-blue-100 text-blue-800 font-semibold">E = Excused</span>
            <span className="px-2 py-0.5 rounded bg-neutral-200 text-neutral-700 font-semibold">H = Holiday</span>
          </div>

          {loadingRegister ? (
            <LoadingSpinner />
          ) : !registerData || registerData.students.length === 0 ? (
            <p className="text-sm text-neutral-500 text-center py-8">
              No student register rows found for this center and month.
            </p>
          ) : (
            <div className="overflow-x-auto border border-neutral-200 rounded-xl">
              <table className="w-full text-xs border-collapse">
                <thead className="bg-neutral-50 border-b border-neutral-200 text-neutral-600">
                  <tr>
                    <th className="py-2.5 px-3 text-left font-semibold sticky left-0 bg-neutral-50 z-10 min-w-[180px] border-r border-neutral-200">
                      Student
                    </th>
                    {registerData.days.map((dayStr) => {
                      const isHol = registerData.holidayDates.includes(dayStr);
                      return (
                        <th
                          key={dayStr}
                          title={dayStr}
                          className={`py-2 px-1.5 text-center font-medium min-w-[28px] ${
                            isHol ? "bg-neutral-200/70 text-neutral-700" : ""
                          }`}
                        >
                          {Number(dayStr.slice(-2))}
                        </th>
                      );
                    })}
                    <th className="py-2.5 px-2 text-center font-semibold border-l border-neutral-200">P+L</th>
                    <th className="py-2.5 px-2 text-center font-semibold">A</th>
                    <th className="py-2.5 px-2 text-center font-semibold">Rate</th>
                  </tr>
                </thead>
                <tbody>
                  {registerData.students.map((stu) => (
                    <tr key={stu.studentId} className="border-b border-neutral-100 hover:bg-neutral-50/60">
                      <td className="py-2 px-3 sticky left-0 bg-white z-10 border-r border-neutral-200">
                        <p className="font-medium text-neutral-900 truncate max-w-[170px]">{stu.fullName}</p>
                        {stu.rollNumber && <p className="text-[11px] text-neutral-400">{stu.rollNumber}</p>}
                      </td>
                      {registerData.days.map((dayStr) => {
                        const status = stu.statuses[dayStr];
                        const meta = status ? MATRIX_CELL_STYLES[status] : undefined;
                        const remark = stu.remarksByDate[dayStr];
                        return (
                          <td key={dayStr} className="py-1.5 px-1 text-center">
                            {meta ? (
                              <span
                                title={remark ? `${dayStr} · ${meta.title}: ${remark}` : `${dayStr} · ${meta.title}`}
                                className={`inline-flex items-center justify-center w-6 h-6 rounded font-semibold ${meta.className}`}
                              >
                                {meta.code}
                              </span>
                            ) : (
                              <span className="text-neutral-300">–</span>
                            )}
                          </td>
                        );
                      })}
                      <td className="py-2 px-2 text-center font-semibold text-emerald-700 border-l border-neutral-200">
                        {stu.summary.present + stu.summary.late}
                      </td>
                      <td className="py-2 px-2 text-center font-semibold text-red-700">
                        {stu.summary.absent}
                      </td>
                      <td className="py-2 px-2 text-center font-bold text-neutral-900">
                        {stu.summary.attendanceRate}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      {activeTab === "absentees" && (
        <Card>
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
            <h2 className="text-lg font-semibold">Absentees Tracker (Last 7 Days)</h2>
            <div className="flex items-center gap-2 text-xs">
              <span className="text-neutral-500 font-medium">Streak Filter:</span>
              {([1, 2, 3] as const).map((threshold) => (
                <Button
                  key={threshold}
                  size="sm"
                  variant={minStreakFilter === threshold ? "primary" : "secondary"}
                  onClick={() => setMinStreakFilter(threshold)}
                >
                  {threshold === 1 ? "All" : `${threshold}+ Days`}
                </Button>
              ))}
            </div>
          </div>
          {loadingAbsentees ? (
            <LoadingSpinner />
          ) : filteredAbsentees.length === 0 ? (
            <p className="p-4 text-sm text-neutral-500">
              No absentees match this filter in the last 7 days.
            </p>
          ) : (
            <div className="border border-neutral-200 rounded-lg divide-y divide-neutral-100 max-h-[560px] overflow-y-auto">
              {filteredAbsentees.map((record) => {
                const streak = record.consecutiveAbsenceStreak ?? 1;
                const sid = record.sessionId ?? record.session?.id;
                return (
                  <div key={record.id} className="p-4 space-y-2.5">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div>
                        <p className="font-medium text-neutral-900">
                          {record.student?.fullName}{" "}
                          {record.student?.rollNumber ? (
                            <span className="text-xs text-neutral-400">({record.student.rollNumber})</span>
                          ) : null}
                        </p>
                        <p className="text-xs text-neutral-500">
                          {record.session?.program?.name} · {record.session?.center?.name}
                        </p>
                        {record.student?.guardianPhone && (
                          <p className="text-xs text-neutral-600 mt-1">
                            Guardian Phone: <a href={`tel:${record.student.guardianPhone}`} className="text-brand-700 hover:underline">{record.student.guardianPhone}</a>
                          </p>
                        )}
                      </div>
                      <div className="flex sm:flex-col items-end gap-1.5">
                        <div className="flex items-center gap-1.5">
                          {streak >= 2 && (
                            <Badge variant={streak >= 3 ? "danger" : "warning"}>
                              {streak >= 3 && <AlertTriangle size={12} className="mr-1 inline" />}
                              {streak}-day streak
                            </Badge>
                          )}
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-800">
                            Absent
                          </span>
                        </div>
                        <p className="text-xs text-neutral-500">
                          {record.session?.sessionDate ? formatDate(record.session.sessionDate) : "—"}
                        </p>
                      </div>
                    </div>

                    {canManageAttendance && sid ? (
                      <div className="flex gap-2 items-center">
                        <input
                          type="text"
                          value={noteDrafts[record.id] ?? ""}
                          onChange={(e) =>
                            setNoteDrafts((prev) => ({ ...prev, [record.id]: e.target.value }))
                          }
                          placeholder="Log guardian outreach or follow-up remark..."
                          className="flex-1 rounded-lg border border-neutral-200 px-3 py-1.5 text-xs bg-neutral-50 focus:bg-white focus:outline-none focus:ring-1 focus:ring-brand-500"
                        />
                        <Button
                          size="sm"
                          variant="secondary"
                          isLoading={savingNoteId === record.id}
                          onClick={() => void handleSaveFollowupRemark(record)}
                        >
                          Save Note
                        </Button>
                      </div>
                    ) : (
                      record.remarks && (
                        <p className="text-xs text-neutral-600 bg-neutral-50 rounded px-2.5 py-1.5">
                          Follow-up note: {record.remarks}
                        </p>
                      )
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      )}

      <QrAttendanceModal
        isOpen={showQrModal}
        onClose={() => setShowQrModal(false)}
        students={rows.map((r) => ({
          studentId: r.studentId,
          name: r.name,
          rollNumber: r.rollNumber,
          status: r.status,
        }))}
        onMarkStudent={(studentId, st) => {
          setRows((prev) =>
            prev.map((row) =>
              row.studentId === studentId ? { ...row, status: st } : row,
            ),
          );
        }}
      />
    </PageWrapper>
  );
};
