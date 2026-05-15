import React, { useEffect, useState } from "react";
import { PageWrapper } from "../components/layout/PageWrapper";
import { Card } from "../components/ui/Card";
import { Input } from "../components/ui/Input";
import { Button } from "../components/ui/Button";
import { LoadingSpinner } from "../components/ui/LoadingSpinner";
import { ErrorMessage } from "../components/ui/ErrorMessage";
import { useAuthStore } from "../store/useAuthStore";
import { listCenters, listPrograms } from "../services/centers.service";
import {
  createAttendanceSession,
  getAttendanceSessionById,
  updateAttendanceSessionRecords,
  getTodayFreshSheet,
  markHoliday,
  getRecentAbsentees,
} from "../services/attendance.service";
import type { CenterSummary, ProgramSummary } from "../types";

type Row = {
  recordId: string;
  studentId: string;
  name: string;
  rollNumber: string;
  status: "pending" | "present" | "absent" | "late" | "excused";
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
      {/* Sliding pill */}
      <div
        className="absolute top-1.5 bottom-1.5 rounded-lg transition-all duration-300 ease-[cubic-bezier(0.4,0,0.2,1)] shadow-md"
        style={{
          // (100% - total padding) / count
          width: `calc((100% - 12px) / ${STATUS_OPTIONS.length})`,
          // Move by its own width * index
          transform: `translateX(${index * 100}%)`,
          backgroundColor: STATUS_CONFIG[value].color,
        }}
      />

      {/* Options */}
      {STATUS_OPTIONS.map((status) => {
        const isActive = status === value;

        return (
          <button
            key={status}
            type="button"
            onClick={() => onChange(status)}
            // flex-1 ensures every button is exactly the same width
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

export const Attendance: React.FC = () => {
  const selectedCenterId = useAuthStore((s) => s.selectedCenterId);
  const isAdmin = useAuthStore((s) => ['super_admin', 'center_admin', 'tech_admin'].includes(s.currentUser?.role || ''));

  const [centers, setCenters] = useState<CenterSummary[]>([]);
  const [programs, setPrograms] = useState<ProgramSummary[]>([]);
  const [centerId, setCenterId] = useState("");
  const [programId, setProgramId] = useState("");
  
  const getLocalDateStr = () => {
    const d = new Date();
    return new Date(d.getTime() - (d.getTimezoneOffset() * 60000)).toISOString().split("T")[0];
  };
  
  const [date, setDate] = useState(getLocalDateStr());
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [boot, setBoot] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(true);
  const [success, setSuccess] = useState(false);
  const [isHoliday, setIsHoliday] = useState(false);

  const [activeTab, setActiveTab] = useState<"mark" | "absentees">("mark");
  const [absentees, setAbsentees] = useState<any[]>([]);
  const [loadingAbsentees, setLoadingAbsentees] = useState(false);

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
      } catch {
        if (alive) setError("Could not load centers or programs.");
      } finally {
        if (alive) setBoot(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [isAdmin, selectedCenterId]);

  useEffect(() => {
    if (activeTab === "absentees") {
      void loadAbsentees();
    }
  }, [activeTab]);

  const loadAbsentees = async () => {
    setLoadingAbsentees(true);
    try {
      const data = await getRecentAbsentees(7);
      setAbsentees(data);
    } catch {
      setError("Could not load absentees.");
    } finally {
      setLoadingAbsentees(false);
    }
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
      })) as { created?: boolean; session?: { id: string; isHoliday?: boolean } };
      const sid = res.session?.id;
      if (!sid) throw new Error("No session id");
      setSessionId(sid);
      setIsEditing(true);
      setSuccess(false);
      setIsHoliday(res.session?.isHoliday || false);
      await refreshRows(sid);
    } catch (e: unknown) {
      const ax = e as {
        response?: { status?: number; data?: { session?: { id: string; isHoliday?: boolean } } };
      };
      if (ax.response?.status === 409 && ax.response.data?.session?.id) {
        const sid = ax.response.data.session.id;
        setSessionId(sid);
        setIsHoliday(ax.response.data.session.isHoliday || false);
        await refreshRows(sid);
      } else {
        const msg = (e as any)?.response?.data?.message;
        setError(msg || "Could not create or load session for this date.");
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
      const full = await getTodayFreshSheet(centerId, programId) as any;
      if (!full || !full.id) throw new Error("No session returned");
      setSessionId(full.id);
      setIsEditing(true);
      setSuccess(false);
      setIsHoliday(full.isHoliday || false);
      setDate(getLocalDateStr());
      
      setRows(
        (full.records ?? []).map((r: any) => ({
          recordId: r.id ?? "",
          studentId: r.student?.id ?? "",
          name: r.student?.fullName ?? "Student",
          rollNumber: r.student?.rollNumber ?? "",
          status: r.status ?? "pending",
        })),
      );
    } catch (e: any) {
      setError(e?.response?.data?.message || "Could not load fresh sheet.");
    } finally {
      setLoading(false);
    }
  };

  const refreshRows = async (sid: string) => {
    const full = (await getAttendanceSessionById(sid)) as {
      isHoliday?: boolean;
      records?: Array<{
        student?: { id: string; fullName: string; rollNumber?: string };
        record?: { id: string; status: string | null };
      }>;
    };
    setIsHoliday(full.isHoliday || false);
    setRows(
      (full.records ?? []).map((r) => ({
        recordId: r.record?.id ?? "",
        studentId: r.student?.id ?? "",
        name: r.student?.fullName ?? "Student",
        rollNumber: r.student?.rollNumber ?? "",
        status: (r.record?.status as Row["status"]) ?? "pending",
      })),
    );
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sessionId) return;

    if (!isEditing) return; // 🔒 prevents accidental submits

    setLoading(true);
    setError(null);
    setSuccess(false);

    try {
      const records = rows
        .filter((r) => r.recordId)
        .map((r) => ({
          recordId: r.recordId,
          status: r.status || "pending",
        }));

      await updateAttendanceSessionRecords(sessionId, { records });

      setIsEditing(false); // 🔒 lock after submit
      setSuccess(true); // ✅ show success
    } catch {
      setError("Failed to save attendance.");
    } finally {
      setLoading(false);
    }
  };

  const handleToggleHoliday = async () => {
    if (!sessionId) return;
    setLoading(true);
    try {
      await markHoliday(sessionId, !isHoliday);
      setIsHoliday(!isHoliday);
    } catch {
      setError("Failed to mark holiday.");
    } finally {
      setLoading(false);
    }
  };

  if (boot)
    return (
      <PageWrapper title="Attendance">
        <LoadingSpinner />
      </PageWrapper>
    );

  return (
    <PageWrapper title="Attendance">
      <div className="flex border-b border-neutral-200 mb-6 gap-4">
        <button
          className={`pb-2 text-sm font-medium ${activeTab === 'mark' ? 'border-b-2 border-primary text-primary' : 'text-neutral-500 hover:text-neutral-700'}`}
          onClick={() => setActiveTab('mark')}
        >
          Mark Attendance
        </button>
        <button
          className={`pb-2 text-sm font-medium ${activeTab === 'absentees' ? 'border-b-2 border-primary text-primary' : 'text-neutral-500 hover:text-neutral-700'}`}
          onClick={() => setActiveTab('absentees')}
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
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-neutral-600">
                  Center
                </label>
                <select
                  className="rounded-lg border border-neutral-300 px-3 py-2 text-sm"
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
                <label className="text-xs font-medium text-neutral-600">
                  Program
                </label>
                <select
                  className="rounded-lg border border-neutral-300 px-3 py-2 text-sm"
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
            </div>
            <div className="flex flex-wrap gap-3 items-end">
              <Input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="max-w-xs"
              />
              <Button
                type="button"
                variant="secondary"
                onClick={() => void loadSession()}
                isLoading={loading}
              >
                Load Session
              </Button>
              <Button
                type="button"
                variant="primary"
                onClick={() => void loadFreshSheet()}
                isLoading={loading}
              >
                Load Today's Sheet
              </Button>
            </div>
          </Card>

          {sessionId && (
            <Card>
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-lg font-semibold">Students</h2>
                <label className="flex items-center gap-2 text-sm font-medium text-neutral-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={isHoliday}
                    onChange={handleToggleHoliday}
                    disabled={loading}
                    className="rounded border-neutral-300 text-primary focus:ring-primary"
                  />
                  Mark as Holiday
                </label>
              </div>
              <form onSubmit={handleSave} className="space-y-4">
                <div className="border border-neutral-200 rounded-lg divide-y divide-neutral-100">
                  {rows.length === 0 ? (
                    <p className="p-4 text-sm text-neutral-500">
                      No records for this session.
                    </p>
                  ) : (
                    rows.map((r, i) => (
                      <div
                        key={r.recordId || r.studentId}
                        className="flex items-center justify-between p-3 gap-3"
                      >
                        <div>
                          <p className="font-medium text-neutral-900">
                            {r.name} {r.rollNumber ? <span className="text-xs text-neutral-400">({r.rollNumber})</span> : null}
                          </p>
                          <p className="text-xs text-neutral-500">
                            {r.status ?? "Pending"}
                          </p>
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
                    ))
                  )}
                </div>
                <div className="flex justify-between items-center">
                  {success && (
                    <span className="text-green-600 text-sm font-medium">
                      Attendance submitted successfully
                    </span>
                  )}

                  <div className="flex gap-2">
                    {/* Use type="button" for both to prevent accidental form submission */}
                    {isEditing ? (
                      <Button
                        type="button"
                        variant="primary"
                        onClick={handleSave} // Explicitly call handleSave
                        isLoading={loading}
                        disabled={!rows.length}
                      >
                        Submit Attendance
                      </Button>
                    ) : (
                      <Button
                        type="button"
                        variant="secondary"
                        onClick={async () => {
                          setLoading(true);
                          await refreshRows(sessionId!); // Reload fresh data from server
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
            Pick center, program, and date, then load the session. Toggle each
            student&apos;s status and save. If a session already exists for that
            day, it opens instead of creating a duplicate.
          </p>
        </Card>
      </div>
      )}

      {activeTab === "absentees" && (
        <Card>
          <h2 className="text-lg font-semibold mb-4">Absentees Tracker (Last 7 Days)</h2>
          {loadingAbsentees ? (
            <LoadingSpinner />
          ) : absentees.length === 0 ? (
            <p className="p-4 text-sm text-neutral-500">No absentees found in the last 7 days.</p>
          ) : (
            <div className="border border-neutral-200 rounded-lg divide-y divide-neutral-100 max-h-[500px] overflow-y-auto">
              {absentees.map((record) => (
                <div key={record.id} className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <p className="font-medium text-neutral-900">
                      {record.student?.fullName} {record.student?.rollNumber ? <span className="text-xs text-neutral-400">({record.student.rollNumber})</span> : null}
                    </p>
                    <p className="text-xs text-neutral-500">
                      {record.session?.program?.name} • {record.session?.center?.name}
                    </p>
                    {record.student?.guardianPhone && (
                      <p className="text-xs text-neutral-600 mt-1">📞 {record.student.guardianPhone}</p>
                    )}
                  </div>
                  <div className="text-right">
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-800">
                      Absent
                    </span>
                    <p className="text-xs text-neutral-500 mt-1">
                      {new Date(record.session?.sessionDate).toLocaleDateString()}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}
    </PageWrapper>
  );
};
