import api from './api';
import { getActiveOfflineDb, syncEngine } from '../offline/syncEngine';
import { withOfflineMutation, withOfflineRead } from '../offline/offlineServiceHelper';
import { computeFieldDiff, generateClientUuid } from '../offline/outboxHelpers';
import type { LocalEntityRecord } from '../offline/offlineDb';

export type CreateSessionBody = {
  centerId: string;
  programId: string;
  sessionDate: string;
  activityId?: string;
  batchId?: string;
};

export type UpdateSessionRecordsBody = Record<string, unknown>;

export const createAttendanceSession = (body: CreateSessionBody) =>
  withOfflineMutation<Record<string, unknown>>(
    () => api.post<Record<string, unknown>>('/attendance/sessions', body).then((r) => r.data),
    async () => {
      const db = getActiveOfflineDb();
      if (db) {
        const existingSessions = await db.attendanceSessions
          .where('centerId')
          .equals(body.centerId)
          .toArray();
        const targetDate = body.sessionDate.slice(0, 10);
        const match = existingSessions.find(
          (s) =>
            String(s.sessionDate || '').slice(0, 10) === targetDate &&
            (!body.programId || s.programId === body.programId) &&
            (body.batchId ? s.batchId === body.batchId : !s.batchId),
        );
        if (match) {
          const existingRecords = await db.attendanceRecords
            .where('sessionId')
            .equals(match.id)
            .toArray();
          return {
            created: false,
            session: { ...match, records: existingRecords },
            offlineQueued: true,
          };
        }
      }

      const sessionId = generateClientUuid();
      const nowIso = new Date().toISOString();

      let students = db
        ? await db.students.where('centerId').equals(body.centerId).toArray()
        : [];
      students = students.filter(
        (s) => s.isActive !== false && (!body.programId || s.programId === body.programId),
      );
      if (db && body.batchId) {
        const enrollments = await db.batchEnrollments
          .where('batchId')
          .equals(body.batchId)
          .toArray();
        const enrolledIds = new Set(enrollments.map((e) => String(e.studentId)));
        students = students.filter((s) => enrolledIds.has(s.id));
      }

      const [center, program] = db
        ? await Promise.all([
            db.centers.get(body.centerId),
            body.programId ? db.programs.get(body.programId) : Promise.resolve(undefined),
          ])
        : [undefined, undefined];

      const localRecords: LocalEntityRecord[] = students.map((student) => ({
        id: generateClientUuid(),
        sessionId,
        studentId: student.id,
        centerId: body.centerId,
        status: 'pending',
        remarks: null,
        version: 1,
        createdAt: nowIso,
        updatedAt: nowIso,
        student: {
          id: student.id,
          fullName: student.fullName,
          rollNumber: student.rollNumber ?? null,
        },
      }));

      const localSession: LocalEntityRecord = {
        id: sessionId,
        centerId: body.centerId,
        programId: body.programId,
        activityId: body.activityId ?? null,
        batchId: body.batchId ?? null,
        sessionDate: body.sessionDate,
        isHoliday: false,
        version: 1,
        createdAt: nowIso,
        updatedAt: nowIso,
        center: center ?? null,
        program: program ?? null,
      };

      if (db) {
        await db.attendanceSessions.put(localSession);
        if (localRecords.length > 0) {
          await db.attendanceRecords.bulkPut(localRecords);
        }
      }

      await syncEngine.enqueueMutation({
        entityType: 'attendance_session',
        entityId: sessionId,
        entityLabel: `Attendance Session (${body.sessionDate})`,
        action: 'CREATE',
        changedFields: { ...body },
      });

      return { created: true, session: { ...localSession, records: localRecords }, offlineQueued: true };
    },
    async (res) => {
      const db = getActiveOfflineDb();
      const session = (res.session ?? res) as LocalEntityRecord | undefined;
      if (db && session?.id) {
        await db.attendanceSessions.put(session);
        if (Array.isArray(session.records)) {
          await db.attendanceRecords.bulkPut(session.records as LocalEntityRecord[]);
        }
      }
    },
  );

export const getAttendanceSessions = (params?: Record<string, string | undefined>) =>
  withOfflineRead<Record<string, unknown>>(
    () => api.get<Record<string, unknown>>('/attendance/sessions', { params }).then((r) => r.data),
    async () => {
      const db = getActiveOfflineDb();
      if (!db) return { sessions: [] };
      let sessions = await db.attendanceSessions.toArray();
      if (params?.centerId) sessions = sessions.filter((s) => s.centerId === params.centerId);
      if (params?.programId) sessions = sessions.filter((s) => s.programId === params.programId);
      if (params?.batchId) sessions = sessions.filter((s) => s.batchId === params.batchId);
      sessions.sort((a, b) => String(b.sessionDate || '').localeCompare(String(a.sessionDate || '')));
      return { sessions };
    },
    async (res) => {
      const db = getActiveOfflineDb();
      const list = Array.isArray(res) ? res : (res.sessions as LocalEntityRecord[] | undefined);
      if (db && Array.isArray(list) && list.length > 0) {
        await db.attendanceSessions.bulkPut(list as LocalEntityRecord[]);
      }
    },
  );

export const getAttendanceSessionById = (sessionId: string) =>
  withOfflineRead<Record<string, unknown>>(
    () => api.get<Record<string, unknown>>(`/attendance/sessions/${sessionId}`).then((r) => r.data),
    async () => {
      const db = getActiveOfflineDb();
      const session = db ? await db.attendanceSessions.get(sessionId) : undefined;
      if (!session) throw new Error('Attendance session not available offline');
      const rawRecords = db
        ? await db.attendanceRecords.where('sessionId').equals(sessionId).toArray()
        : [];
      const students = db ? await db.students.toArray() : [];
      const studentMap = new Map(students.map((s) => [s.id, s]));

      const records = rawRecords.map((rec) => {
        const stu =
          (rec.student as { id: string; fullName: string; rollNumber?: string | null } | undefined) ??
          (rec.studentId && studentMap.get(String(rec.studentId))
            ? {
                id: String(rec.studentId),
                fullName: String(studentMap.get(String(rec.studentId))?.fullName || 'Student'),
                rollNumber:
                  (studentMap.get(String(rec.studentId))?.rollNumber as string | null) ?? null,
              }
            : { id: String(rec.studentId || ''), fullName: 'Student', rollNumber: null });
        const innerRecord = (rec.record as {
          id?: string;
          status?: string | null;
          remarks?: string | null;
        } | undefined) ?? {
          id: rec.id,
          status: String(rec.status ?? 'pending'),
          remarks: (rec.remarks as string | null) ?? null,
        };
        return {
          ...rec,
          id: innerRecord.id || rec.id,
          status: innerRecord.status ?? rec.status ?? 'pending',
          remarks: innerRecord.remarks ?? rec.remarks ?? null,
          student: stu,
          record: {
            id: innerRecord.id || rec.id,
            status: innerRecord.status ?? String(rec.status ?? 'pending'),
            remarks: (innerRecord.remarks ?? rec.remarks ?? null) as string | null,
          },
        };
      });
      return { ...session, records };
    },
    async (res) => {
      const db = getActiveOfflineDb();
      const sessionIdResolved =
        typeof res.id === 'string'
          ? res.id
          : typeof (res.session as { id?: string } | undefined)?.id === 'string'
            ? (res.session as { id: string }).id
            : sessionId;
      if (db && sessionIdResolved) {
        await db.attendanceSessions.put({
          ...(res.session && typeof res.session === 'object' ? (res.session as LocalEntityRecord) : (res as LocalEntityRecord)),
          id: sessionIdResolved,
        });
        if (Array.isArray(res.records)) {
          const normalized: LocalEntityRecord[] = res.records
            .map((item) => {
              const r = item as {
                id?: string;
                status?: string;
                remarks?: string | null;
                student?: { id: string; fullName: string; rollNumber?: string | null };
                record?: { id?: string; status?: string; remarks?: string | null };
              };
              const recId = r.record?.id || r.id;
              if (!recId) return null;
              return {
                id: recId,
                sessionId: sessionIdResolved,
                studentId: r.student?.id ?? null,
                status: r.record?.status ?? r.status ?? 'pending',
                remarks: r.record?.remarks ?? r.remarks ?? null,
                student: r.student,
              } as LocalEntityRecord;
            })
            .filter((x): x is LocalEntityRecord => x !== null);
          if (normalized.length > 0) {
            await db.attendanceRecords.bulkPut(normalized);
          }
        }
      }
    },
  );

export const getAttendanceSessionRecords = (sessionId: string) =>
  withOfflineRead<{ records: unknown[] }>(
    () =>
      api
        .get<{ records: unknown[] }>(`/attendance/sessions/${sessionId}/records`)
        .then((r) => r.data),
    async () => {
      const db = getActiveOfflineDb();
      if (!db) return { records: [] };
      const records = await db.attendanceRecords.where('sessionId').equals(sessionId).toArray();
      return { records };
    },
    async (res) => {
      const db = getActiveOfflineDb();
      if (db && Array.isArray(res.records) && res.records.length > 0) {
        await db.attendanceRecords.bulkPut(res.records as LocalEntityRecord[]);
      }
    },
  );

export const updateAttendanceSessionRecords = (
  sessionId: string,
  body: UpdateSessionRecordsBody,
) =>
  withOfflineMutation<Record<string, unknown>>(
    () =>
      api
        .put<Record<string, unknown>>(`/attendance/sessions/${sessionId}/records`, body)
        .then((r) => r.data),
    async () => {
      const db = getActiveOfflineDb();
      const records = Array.isArray(body.records)
        ? (body.records as Array<{
            recordId: string;
            studentId?: string;
            status: string;
            remarks?: string | null;
          }>)
        : [];
      const updatedRecords: LocalEntityRecord[] = [];

      for (const rec of records) {
        const existing = db ? await db.attendanceRecords.get(rec.recordId) : undefined;
        const baseVersion = typeof existing?.version === 'number' ? existing.version : 1;
        const nextFields = {
          status: rec.status,
          remarks: rec.remarks ?? null,
        };
        const { baseSnapshot, changedFields } = computeFieldDiff(
          existing as Record<string, unknown> | undefined,
          nextFields,
        );

        const localRec: LocalEntityRecord = {
          ...(existing ?? {
            id: rec.recordId,
            sessionId,
            studentId: rec.studentId ?? '',
          }),
          ...nextFields,
          updatedAt: new Date().toISOString(),
        };
        updatedRecords.push(localRec);
        if (db) {
          await db.attendanceRecords.put(localRec);
        }

        const effectiveChanges =
          Object.keys(changedFields).length > 0 ? changedFields : nextFields;
        const studentName =
          (existing?.student as { fullName?: string } | undefined)?.fullName ||
          rec.recordId.slice(0, 8);

        await syncEngine.enqueueMutation({
          entityType: 'attendance_record',
          entityId: rec.recordId,
          entityLabel: `Attendance: ${studentName}`,
          action: existing ? 'UPDATE' : 'CREATE',
          baseVersion,
          baseSnapshot,
          changedFields: {
            ...effectiveChanges,
            sessionId,
            ...(localRec.studentId ? { studentId: localRec.studentId } : {}),
          },
        });
      }

      return { id: sessionId, records: updatedRecords, offlineQueued: true };
    },
    async (res) => {
      const db = getActiveOfflineDb();
      if (db && Array.isArray(res.records)) {
        await db.attendanceRecords.bulkPut(res.records as LocalEntityRecord[]);
      }
    },
  );

export const getStudentAttendance = (studentId: string) =>
  withOfflineRead<Record<string, unknown>>(
    () => api.get<Record<string, unknown>>(`/attendance/students/${studentId}`).then((r) => r.data),
    async () => {
      const db = getActiveOfflineDb();
      const records = db
        ? await db.attendanceRecords.where('studentId').equals(studentId).toArray()
        : [];
      return { records };
    },
  );

export const getAttendanceSummary = (params?: Record<string, string | undefined>) =>
  api.get<Record<string, unknown>>('/attendance/summary', { params }).then((r) => r.data);

export const getPendingAttendanceSessions = (params?: Record<string, string | undefined>) =>
  api.get<Record<string, unknown>>('/attendance/pending', { params }).then((r) => r.data);

export const getTodayFreshSheet = (centerId: string, programId: string, batchId?: string) =>
  withOfflineRead<Record<string, unknown>>(
    () =>
      api
        .get<Record<string, unknown>>('/attendance/fresh-sheet', {
          params: { centerId, programId, ...(batchId ? { batchId } : {}) },
        })
        .then((r) => r.data),
    async () => {
      const db = getActiveOfflineDb();
      const today = new Date().toISOString().slice(0, 10);
      if (db) {
        const sessions = await db.attendanceSessions.where('centerId').equals(centerId).toArray();
        const existing = sessions.find(
          (s) =>
            String(s.sessionDate || '').slice(0, 10) === today &&
            s.programId === programId &&
            (batchId ? s.batchId === batchId : !s.batchId),
        );
        if (existing) {
          const records = await db.attendanceRecords.where('sessionId').equals(existing.id).toArray();
          return { ...existing, records };
        }
      }
      const created = await createAttendanceSession({
        centerId,
        programId,
        sessionDate: today,
        ...(batchId ? { batchId } : {}),
      });
      return (created.session as Record<string, unknown>) ?? created;
    },
    async (res) => {
      const db = getActiveOfflineDb();
      if (db && typeof res.id === 'string') {
        await db.attendanceSessions.put(res as LocalEntityRecord);
        if (Array.isArray(res.records)) {
          await db.attendanceRecords.bulkPut(res.records as LocalEntityRecord[]);
        }
      }
    },
  );

export const markHoliday = (sessionId: string, isHoliday: boolean) =>
  withOfflineMutation<Record<string, unknown>>(
    () =>
      api
        .put<Record<string, unknown>>(`/attendance/sessions/${sessionId}/holiday`, { isHoliday })
        .then((r) => r.data),
    async () => {
      const db = getActiveOfflineDb();
      const existing = db ? await db.attendanceSessions.get(sessionId) : undefined;
      const baseVersion = typeof existing?.version === 'number' ? existing.version : 1;
      const updated: LocalEntityRecord = {
        ...(existing ?? { id: sessionId }),
        isHoliday,
        updatedAt: new Date().toISOString(),
      };
      if (db) await db.attendanceSessions.put(updated);
      await syncEngine.enqueueMutation({
        entityType: 'attendance_session',
        entityId: sessionId,
        entityLabel: `Holiday toggle (${String(existing?.sessionDate || sessionId.slice(0, 8))})`,
        action: 'UPDATE',
        baseVersion,
        baseSnapshot: { isHoliday: existing?.isHoliday ?? false },
        changedFields: { isHoliday },
      });
      return { ...updated, offlineQueued: true };
    },
    async (res) => {
      const db = getActiveOfflineDb();
      if (db && typeof res.id === 'string') {
        await db.attendanceSessions.put(res as LocalEntityRecord);
      }
    },
  );

export type RecentAbsenteeRecord = {
  id: string;
  sessionId?: string;
  studentId?: string;
  status: string;
  remarks?: string | null;
  consecutiveAbsenceStreak?: number;
  student?: {
    id: string;
    fullName: string;
    rollNumber?: string | null;
    guardianPhone?: string | null;
  };
  session?: {
    id?: string;
    sessionDate: string;
    center?: { name: string };
    program?: { name: string };
  };
};

export type AttendanceRegisterStudentRow = {
  studentId: string;
  fullName: string;
  rollNumber?: string | null;
  statuses: Record<string, string>;
  remarksByDate: Record<string, string | null>;
  summary: {
    present: number;
    late: number;
    absent: number;
    excused: number;
    pending: number;
    totalMarked: number;
    attendanceRate: number;
  };
};

export type AttendanceRegisterResponse = {
  centerId: string;
  programId: string | null;
  month: string;
  days: string[];
  holidayDates: string[];
  sessionDates: string[];
  students: AttendanceRegisterStudentRow[];
};

export const getRecentAbsentees = (days: number = 7, centerId?: string) =>
  withOfflineRead<RecentAbsenteeRecord[]>(
    () =>
      api
        .get<RecentAbsenteeRecord[]>('/attendance/absentees', {
          params: { days, ...(centerId ? { centerId } : {}) },
        })
        .then((r) => r.data),
    async () => {
      const db = getActiveOfflineDb();
      if (!db) return [];
      const [records, sessions, students, centers, programs] = await Promise.all([
        db.attendanceRecords.toArray(),
        db.attendanceSessions.toArray(),
        db.students.toArray(),
        db.centers.toArray(),
        db.programs.toArray(),
      ]);
      const sessionMap = new Map(sessions.map((s) => [s.id, s]));
      const studentMap = new Map(students.map((s) => [s.id, s]));
      const centerMap = new Map(centers.map((c) => [c.id, c]));
      const programMap = new Map(programs.map((p) => [p.id, p]));

      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - days);
      const cutoffStr = cutoff.toISOString().slice(0, 10);

      const absentRecords = records.filter((r) => {
        if (r.status !== 'absent') return false;
        const sess = r.sessionId ? sessionMap.get(String(r.sessionId)) : undefined;
        if (!sess || sess.isHoliday) return false;
        if (centerId && sess.centerId !== centerId) return false;
        const sDate = String(sess.sessionDate || '').slice(0, 10);
        return sDate >= cutoffStr;
      });

      return absentRecords.map((r) => {
        const sess = r.sessionId ? sessionMap.get(String(r.sessionId)) : undefined;
        const stu = r.studentId ? studentMap.get(String(r.studentId)) : undefined;
        const cName = sess?.centerId ? String(centerMap.get(String(sess.centerId))?.name || '') : '';
        const pName = sess?.programId ? String(programMap.get(String(sess.programId))?.name || '') : '';
        return {
          id: r.id,
          sessionId: String(r.sessionId || ''),
          studentId: String(r.studentId || ''),
          status: 'absent',
          remarks: (r.remarks as string | null) ?? null,
          consecutiveAbsenceStreak: 1,
          student: stu
            ? {
                id: stu.id,
                fullName: String(stu.fullName || 'Student'),
                rollNumber: (stu.rollNumber as string | null) ?? null,
                guardianPhone: (stu.guardianPhone as string | null) ?? null,
              }
            : (r.student as RecentAbsenteeRecord['student']),
          session: sess
            ? {
                id: sess.id,
                sessionDate: String(sess.sessionDate || '').slice(0, 10),
                center: cName ? { name: cName } : undefined,
                program: pName ? { name: pName } : undefined,
              }
            : undefined,
        };
      });
    },
  );

export const getAttendanceRegister = (params: {
  centerId: string;
  programId?: string;
  batchId?: string;
  month?: string;
}) =>
  withOfflineRead<AttendanceRegisterResponse>(
    () =>
      api
        .get<AttendanceRegisterResponse>('/attendance/register', { params })
        .then((r) => r.data),
    async () => {
      const month = params.month || new Date().toISOString().slice(0, 7);
      const [yearNum, monthNum] = month.split('-').map(Number);
      const daysInMonth = new Date(yearNum, monthNum, 0).getDate();
      const days: string[] = [];
      for (let d = 1; d <= daysInMonth; d += 1) {
        days.push(`${month}-${String(d).padStart(2, '0')}`);
      }

      const db = getActiveOfflineDb();
      if (!db) {
        return {
          centerId: params.centerId,
          programId: params.programId ?? null,
          month,
          days,
          holidayDates: [],
          sessionDates: [],
          students: [],
        };
      }

      let students = await db.students.where('centerId').equals(params.centerId).toArray();
      if (params.programId) {
        students = students.filter((s) => s.programId === params.programId);
      }
      if (params.batchId) {
        const enrollments = await db.batchEnrollments
          .where('batchId')
          .equals(params.batchId)
          .toArray();
        const enrolledIds = new Set(enrollments.map((e) => String(e.studentId)));
        students = students.filter((s) => enrolledIds.has(s.id));
      }

      const sessions = (await db.attendanceSessions.where('centerId').equals(params.centerId).toArray()).filter(
        (s) =>
          String(s.sessionDate || '').startsWith(month) &&
          (!params.programId || s.programId === params.programId) &&
          (!params.batchId || s.batchId === params.batchId),
      );
      const sessionIds = new Set(sessions.map((s) => s.id));
      const sessionDateById = new Map(
        sessions.map((s) => [s.id, String(s.sessionDate || '').slice(0, 10)]),
      );
      const holidayDates = sessions
        .filter((s) => Boolean(s.isHoliday))
        .map((s) => String(s.sessionDate || '').slice(0, 10));
      const holidaySet = new Set(holidayDates);
      const sessionDates = Array.from(new Set(sessionDateById.values())).sort();

      const allRecords = (await db.attendanceRecords.where('centerId').equals(params.centerId).toArray()).filter(
        (r) => r.sessionId && sessionIds.has(String(r.sessionId)),
      );

      const studentRows: AttendanceRegisterStudentRow[] = students.map((stu) => {
        const statuses: Record<string, string> = {};
        const remarksByDate: Record<string, string | null> = {};
        for (const hDate of holidayDates) {
          statuses[hDate] = 'holiday';
        }
        const stuRecs = allRecords.filter((r) => r.studentId === stu.id);
        for (const rec of stuRecs) {
          const dStr = sessionDateById.get(String(rec.sessionId));
          if (!dStr) continue;
          if (!holidaySet.has(dStr)) {
            statuses[dStr] = String(rec.status || 'pending');
          }
          remarksByDate[dStr] = (rec.remarks as string | null) ?? null;
        }
        let present = 0;
        let late = 0;
        let absent = 0;
        let excused = 0;
        let pending = 0;
        for (const st of Object.values(statuses)) {
          if (st === 'present') present += 1;
          else if (st === 'late') late += 1;
          else if (st === 'absent') absent += 1;
          else if (st === 'excused') excused += 1;
          else if (st === 'pending') pending += 1;
        }
        const totalMarked = present + late + absent;
        const attendanceRate =
          totalMarked > 0 ? Math.round(((present + late) / totalMarked) * 100) : 0;
        return {
          studentId: stu.id,
          fullName: String(stu.fullName || 'Student'),
          rollNumber: (stu.rollNumber as string | null) ?? null,
          statuses,
          remarksByDate,
          summary: {
            present,
            late,
            absent,
            excused,
            pending,
            totalMarked,
            attendanceRate,
          },
        };
      });

      return {
        centerId: params.centerId,
        programId: params.programId ?? null,
        month,
        days,
        holidayDates,
        sessionDates,
        students: studentRows,
      };
    },
  );
