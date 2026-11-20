import type { AttendanceStatus, Gender, Prisma } from "@prisma/client";
import prisma from "../lib/prisma.js";
import type { JwtPayload } from "../utils/jwt.js";
import {
  getScopedCenterIds,
  hasCenterAccess,
  PERMISSIONS,
  ROLE_PERMISSIONS,
  type Permission,
  type Role,
} from "../config/rbac.js";
import { ForbiddenError, ValidationError } from "../lib/errors.js";
import { parseUtcDateOnly } from "../utils/dateOnly.js";
import { DEFAULT_TENANT_ID } from "../lib/tenantContext.js";
import { getIO } from "../socket/index.js";
import { SocketRoomManager } from "../socket/socketRooms.js";
import type {
  SyncEntityType,
  SyncMutationItem,
  SyncPullQuery,
  SyncPullResponse,
  SyncPushItemResult,
  SyncPushResponse,
} from "../types/sync.types.js";
import {
  resolveAttendanceRecordConflict,
  resolveExamScoreConflict,
  resolveThreeWayFieldMerge,
  SKILL_LOG_SYNC_UPDATABLE_FIELDS,
  STUDENT_SYNC_UPDATABLE_FIELDS,
} from "./syncConflictResolver.js";

function hasPermission(user: JwtPayload, permission: Permission): boolean {
  const rolePerms = ROLE_PERMISSIONS[user.role as Role] ?? [];
  return rolePerms.includes(permission);
}

function assertSyncPermission(user: JwtPayload, entityType: SyncEntityType): void {
  const permissionMap: Partial<Record<SyncEntityType, Permission>> = {
    student: PERMISSIONS.MANAGE_STUDENTS,
    fee_payment: PERMISSIONS.MANAGE_FEES,
    attendance_session: PERMISSIONS.MANAGE_ATTENDANCE,
    attendance_record: PERMISSIONS.MANAGE_ATTENDANCE,
    exam: PERMISSIONS.MANAGE_EXAMS,
    exam_score: PERMISSIONS.ENTER_EXAM_SCORES,
    skill_log: PERMISSIONS.MANAGE_SKILLS,
  };
  const required = permissionMap[entityType];
  if (required && !hasPermission(user, required)) {
    throw new ForbiddenError(`Missing required permission: ${required}`);
  }
}

function assertCenterScope(user: JwtPayload, centerId: string): void {
  if (!hasCenterAccess(user, centerId)) {
    throw new ForbiddenError("You do not have access to this center");
  }
}

function resolveScopedCenterFilter(
  user: JwtPayload,
  requestedCenterId?: string,
): { centerIds?: string[] } {
  if (requestedCenterId) {
    assertCenterScope(user, requestedCenterId);
    return { centerIds: [requestedCenterId] };
  }
  const scoped = getScopedCenterIds(user);
  return { centerIds: scoped };
}

function remapReference(
  value: unknown,
  idRemaps: Map<string, string>,
): string | undefined {
  if (typeof value !== "string" || !value) return undefined;
  return idRemaps.get(value) ?? value;
}

function serializePrismaRecord<T>(record: T): Record<string, unknown> {
  return JSON.parse(JSON.stringify(record)) as Record<string, unknown>;
}

async function writeAuditEntry(
  tx: Prisma.TransactionClient,
  params: {
    tenantId: string;
    userId: string;
    action: string;
    tableName: string;
    recordId: string;
    oldData?: unknown;
    newData?: unknown;
  },
): Promise<void> {
  await tx.auditLog.create({
    data: {
      tenantId: params.tenantId,
      userId: params.userId,
      action: params.action,
      tableName: params.tableName,
      recordId: params.recordId,
      oldData:
        params.oldData !== undefined
          ? (serializePrismaRecord(params.oldData) as Prisma.InputJsonValue)
          : undefined,
      newData:
        params.newData !== undefined
          ? (serializePrismaRecord(params.newData) as Prisma.InputJsonValue)
          : undefined,
    },
  });
}

/**
 * GET /api/sync/pull
 * Returns a center-scoped delta (or full initial snapshot when `since` is omitted)
 * for all offline-enabled student & academic tables.
 */
export async function pullSyncDelta(
  user: JwtPayload,
  query: SyncPullQuery,
): Promise<SyncPullResponse> {
  const serverTime = new Date().toISOString();
  const sinceDate = query.since ? new Date(query.since) : undefined;
  const isFullSnapshot = !sinceDate;
  const { centerIds } = resolveScopedCenterFilter(user, query.centerId);

  const centerWhere = centerIds ? { centerId: { in: centerIds } } : {};
  const centerIdFilter = centerIds ? { id: { in: centerIds } } : {};
  const updatedSince = sinceDate ? { updatedAt: { gt: sinceDate } } : {};
  const createdSince = sinceDate ? { createdAt: { gt: sinceDate } } : {};
  const paidSince = sinceDate ? { paidAt: { gt: sinceDate } } : {};
  const academicYearFilter = query.academicYearId
    ? { academicYearId: query.academicYearId }
    : {};

  const [
    centers,
    programs,
    programSubjects,
    academicYears,
    batches,
    batchEnrollments,
    students,
    feePayments,
    attendanceSessions,
    attendanceRecords,
    exams,
    examScores,
    skillDefinitions,
    skillLogs,
    formTemplates,
    formSubmissions,
  ] = await Promise.all([
    prisma.center.findMany({
      where: { ...centerIdFilter, ...updatedSince },
      orderBy: { name: "asc" },
    }),
    prisma.program.findMany({
      where: { ...updatedSince },
      orderBy: { name: "asc" },
    }),
    prisma.programSubject.findMany({
      where: isFullSnapshot ? {} : { createdAt: { gt: sinceDate } },
      orderBy: { name: "asc" },
    }),
    prisma.academicYear.findMany({
      where: { ...updatedSince },
      orderBy: { startDate: "desc" },
    }),
    prisma.batch.findMany({
      where: { ...centerWhere, ...updatedSince },
      orderBy: { name: "asc" },
    }),
    prisma.batchEnrollment.findMany({
      where: {
        ...(centerIds ? { batch: { centerId: { in: centerIds } } } : {}),
        ...(sinceDate ? { enrolledOn: { gte: new Date(sinceDate.toISOString().slice(0, 10)) } } : {}),
      },
    }),
    prisma.student.findMany({
      where: { ...centerWhere, ...academicYearFilter, ...updatedSince },
      include: {
        center: { select: { id: true, name: true } },
        program: { select: { id: true, name: true, code: true } },
        academicYear: { select: { id: true, label: true } },
      },
      orderBy: { updatedAt: "asc" },
    }),
    prisma.feePayment.findMany({
      where: {
        ...(centerIds ? { student: { centerId: { in: centerIds } } } : {}),
        ...paidSince,
      },
      orderBy: { paidAt: "desc" },
    }),
    prisma.attendanceSession.findMany({
      where: { ...centerWhere, ...academicYearFilter, ...updatedSince },
      include: {
        center: { select: { id: true, name: true } },
        program: { select: { id: true, name: true } },
      },
      orderBy: { sessionDate: "desc" },
    }),
    prisma.attendanceRecord.findMany({
      where: { ...centerWhere, ...updatedSince },
      include: {
        student: { select: { id: true, fullName: true, rollNumber: true } },
      },
      orderBy: { updatedAt: "asc" },
    }),
    prisma.exam.findMany({
      where: { ...centerWhere, ...academicYearFilter, ...updatedSince },
      include: {
        center: { select: { id: true, name: true } },
        program: { select: { id: true, name: true } },
        academicYear: { select: { id: true, label: true } },
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.examScore.findMany({
      where: { ...centerWhere, ...updatedSince },
      include: {
        student: { select: { id: true, fullName: true, rollNumber: true } },
        subject: { select: { id: true, name: true, maxMarks: true } },
      },
      orderBy: { updatedAt: "asc" },
    }),
    prisma.skillDefinition.findMany({
      where: { isActive: true, ...createdSince },
      orderBy: { name: "asc" },
    }),
    prisma.studentSkillLog.findMany({
      where: { ...centerWhere, ...updatedSince },
      include: {
        skill: true,
      },
      orderBy: { updatedAt: "asc" },
    }),
    prisma.formTemplate.findMany({
      where: {
        ...(centerIds ? { OR: [{ centerId: null }, { centerId: { in: centerIds } }] } : {}),
        ...updatedSince,
      },
      orderBy: { updatedAt: "desc" },
    }),
    prisma.formSubmission.findMany({
      where: { ...centerWhere, ...updatedSince },
      orderBy: { submittedAt: "desc" },
    }),
  ]);

  return {
    serverTime,
    isFullSnapshot,
    changes: {
      centers: centers.map(serializePrismaRecord),
      programs: programs.map(serializePrismaRecord),
      programSubjects: programSubjects.map(serializePrismaRecord),
      academicYears: academicYears.map(serializePrismaRecord),
      batches: batches.map(serializePrismaRecord),
      batchEnrollments: batchEnrollments.map(serializePrismaRecord),
      students: students.map(serializePrismaRecord),
      feePayments: feePayments.map(serializePrismaRecord),
      attendanceSessions: attendanceSessions.map(serializePrismaRecord),
      attendanceRecords: attendanceRecords.map(serializePrismaRecord),
      exams: exams.map(serializePrismaRecord),
      examScores: examScores.map(serializePrismaRecord),
      skillDefinitions: skillDefinitions.map(serializePrismaRecord),
      skillLogs: skillLogs.map(serializePrismaRecord),
      formTemplates: formTemplates.map(serializePrismaRecord),
      formSubmissions: formSubmissions.map(serializePrismaRecord),
    },
  };
}

/**
 * Processes a single sync mutation inside a Prisma transaction.
 * Exported for focused unit testing with mockPrisma.
 */
export async function processSingleSyncMutation(
  user: JwtPayload,
  op: SyncMutationItem,
  idRemaps: Map<string, string>,
): Promise<SyncPushItemResult> {
  const tenantId = user.tenantId || DEFAULT_TENANT_ID;

  // 1. Idempotency check
  const existingLog = await prisma.syncOperationLog.findUnique({
    where: { operationId: op.operationId },
  });
  if (existingLog && existingLog.resultJson) {
    const cached = existingLog.resultJson as unknown as SyncPushItemResult;
    if (cached.remappedEntityId) {
      idRemaps.set(op.entityId, cached.remappedEntityId);
    }
    return cached;
  }

  // 2. Permission check
  assertSyncPermission(user, op.entityType);

  const effectiveEntityId = idRemaps.get(op.entityId) ?? op.entityId;
  const f = op.changedFields;

  const result = await prisma.$transaction(async (tx) => {
    let itemResult: SyncPushItemResult;

    switch (op.entityType) {
      case "student":
        itemResult = await handleStudentSync(tx, user, tenantId, op, effectiveEntityId, f);
        break;
      case "fee_payment":
        itemResult = await handleFeePaymentSync(tx, user, tenantId, op, effectiveEntityId, f, idRemaps);
        break;
      case "attendance_session":
        itemResult = await handleAttendanceSessionSync(tx, user, tenantId, op, effectiveEntityId, f, idRemaps);
        break;
      case "attendance_record":
        itemResult = await handleAttendanceRecordSync(tx, user, tenantId, op, effectiveEntityId, f, idRemaps);
        break;
      case "exam":
        itemResult = await handleExamSync(tx, user, op, effectiveEntityId, f);
        break;
      case "exam_score":
        itemResult = await handleExamScoreSync(tx, user, tenantId, op, effectiveEntityId, f, idRemaps);
        break;
      case "skill_log":
        itemResult = await handleSkillLogSync(tx, user, tenantId, op, effectiveEntityId, f, idRemaps);
        break;
      case "form_submission":
        itemResult = await handleFormSubmissionSync(tx, user, op, effectiveEntityId, f, idRemaps);
        break;
      default:
        itemResult = {
          operationId: op.operationId,
          entityType: op.entityType,
          entityId: op.entityId,
          status: "error",
          errorMessage: `Unsupported entity type: ${String(op.entityType)}`,
        };
    }

    // Only log terminal outcomes (applied, merged, deduplicated) into SyncOperationLog
    // so conflicts can be retried later with a new operationId or resolution.
    if (
      itemResult.status === "applied" ||
      itemResult.status === "merged" ||
      itemResult.status === "deduplicated"
    ) {
      await tx.syncOperationLog.create({
        data: {
          operationId: op.operationId,
          tenantId,
          userId: user.userId,
          entityType: op.entityType,
          entityId: itemResult.remappedEntityId ?? effectiveEntityId,
          action: op.action,
          status: itemResult.status,
          resultJson: serializePrismaRecord(itemResult) as Prisma.InputJsonValue,
        },
      });
    }

    return itemResult;
  });

  if (result.remappedEntityId) {
    idRemaps.set(op.entityId, result.remappedEntityId);
  }

  return result;
}

async function handleStudentSync(
  tx: Prisma.TransactionClient,
  user: JwtPayload,
  tenantId: string,
  op: SyncMutationItem,
  entityId: string,
  f: Record<string, unknown>,
): Promise<SyncPushItemResult> {
  if (op.action === "CREATE") {
    const centerId = String(f.centerId ?? "");
    const fullName = String(f.fullName ?? "").trim();
    if (!centerId || !fullName) {
      throw new ValidationError("centerId and fullName are required to create a student");
    }
    assertCenterScope(user, centerId);

    // Deduplicate if already created with same UUID
    const existing = await tx.student.findUnique({ where: { id: entityId } });
    if (existing) {
      return {
        operationId: op.operationId,
        entityType: "student",
        entityId: op.entityId,
        status: "deduplicated",
        newVersion: existing.version,
        serverRecord: serializePrismaRecord(existing),
      };
    }

    const created = await tx.student.create({
      data: {
        id: entityId,
        centerId,
        programId: typeof f.programId === "string" && f.programId ? f.programId : null,
        academicYearId:
          typeof f.academicYearId === "string" && f.academicYearId ? f.academicYearId : null,
        createdById: user.userId,
        fullName,
        rollNumber: typeof f.rollNumber === "string" ? f.rollNumber.trim() || null : null,
        dob: typeof f.dob === "string" && f.dob ? parseUtcDateOnly(f.dob, "dob") : null,
        gender: typeof f.gender === "string" && f.gender ? (f.gender as Gender) : null,
        guardianName: typeof f.guardianName === "string" ? f.guardianName : null,
        guardianPhone: typeof f.guardianPhone === "string" ? f.guardianPhone : null,
        address: typeof f.address === "string" ? f.address : null,
        stream: typeof f.stream === "string" ? f.stream : null,
        post12thChoice: typeof f.post12thChoice === "string" ? f.post12thChoice : null,
        collegeName: typeof f.collegeName === "string" ? f.collegeName : null,
        educationDiscontinued: Boolean(f.educationDiscontinued ?? false),
        enrollmentDate:
          typeof f.enrollmentDate === "string" && f.enrollmentDate
            ? parseUtcDateOnly(f.enrollmentDate, "enrollmentDate")
            : new Date(),
        totalFees:
          f.totalFees !== undefined && f.totalFees !== null && f.totalFees !== ""
            ? Number(f.totalFees)
            : null,
        version: 1,
      },
      include: {
        center: { select: { id: true, name: true } },
        program: { select: { id: true, name: true, code: true } },
        academicYear: { select: { id: true, label: true } },
      },
    });

    return {
      operationId: op.operationId,
      entityType: "student",
      entityId: op.entityId,
      status: "applied",
      newVersion: created.version,
      serverRecord: serializePrismaRecord(created),
    };
  }

  const existing = await tx.student.findUnique({ where: { id: entityId } });
  if (!existing) {
    return {
      operationId: op.operationId,
      entityType: "student",
      entityId: op.entityId,
      status: "conflict",
      conflictReason: "RECORD_DELETED",
      conflictFields: Object.keys(f),
      serverRecord: null,
    };
  }
  assertCenterScope(user, existing.centerId);

  if (op.action === "DELETE") {
    const deleted = await tx.student.update({
      where: { id: entityId },
      data: {
        isActive: false,
        deletedAt: new Date(),
        version: { increment: 1 },
      },
    });
    return {
      operationId: op.operationId,
      entityType: "student",
      entityId: op.entityId,
      status: "applied",
      newVersion: deleted.version,
      serverRecord: serializePrismaRecord(deleted),
    };
  }

  // UPDATE with OCC + Field-Level 3-Way Merge
  const resolution = resolveThreeWayFieldMerge({
    serverRecord: existing as unknown as Record<string, unknown>,
    serverVersion: existing.version,
    baseVersion: op.baseVersion,
    baseSnapshot: op.baseSnapshot,
    changedFields: f,
    allowedFields: STUDENT_SYNC_UPDATABLE_FIELDS,
    forceOverwrite: op.forceOverwrite,
  });

  if (resolution.status === "conflict") {
    return {
      operationId: op.operationId,
      entityType: "student",
      entityId: op.entityId,
      status: "conflict",
      conflictReason: resolution.reason,
      conflictFields: resolution.conflictFields,
      serverRecord: serializePrismaRecord(existing),
    };
  }

  const dataToWrite: Record<string, unknown> = { ...resolution.fieldsToWrite };
  if (typeof dataToWrite.dob === "string" && dataToWrite.dob) {
    dataToWrite.dob = parseUtcDateOnly(dataToWrite.dob, "dob");
  }
  if (dataToWrite.totalFees !== undefined && dataToWrite.totalFees !== null) {
    const totalFeesNum = Number(dataToWrite.totalFees);
    dataToWrite.totalFees = totalFeesNum;
    dataToWrite.isFullyPaid = totalFeesNum > 0 && Number(existing.feesPaid) >= totalFeesNum;
  }

  const hasChanges = Object.keys(dataToWrite).length > 0;
  const updated = hasChanges
    ? await tx.student.update({
        where: { id: entityId },
        data: {
          ...dataToWrite,
          version: { increment: 1 },
        },
        include: {
          center: { select: { id: true, name: true } },
          program: { select: { id: true, name: true, code: true } },
          academicYear: { select: { id: true, label: true } },
        },
      })
    : existing;

  if (resolution.status === "merged" || op.forceOverwrite) {
    await writeAuditEntry(tx, {
      tenantId,
      userId: user.userId,
      action: op.forceOverwrite ? "SYNC_CONFLICT_FORCE_OVERWRITE" : "SYNC_AUTO_MERGE",
      tableName: "students",
      recordId: entityId,
      oldData: existing,
      newData: updated,
    });
  }

  return {
    operationId: op.operationId,
    entityType: "student",
    entityId: op.entityId,
    status: resolution.status,
    newVersion: updated.version,
    autoMergedFields: resolution.autoMergedFields,
    serverRecord: serializePrismaRecord(updated),
  };
}

async function handleFeePaymentSync(
  tx: Prisma.TransactionClient,
  user: JwtPayload,
  _tenantId: string,
  op: SyncMutationItem,
  entityId: string,
  f: Record<string, unknown>,
  idRemaps: Map<string, string>,
): Promise<SyncPushItemResult> {
  if (op.action !== "CREATE") {
    throw new ValidationError("Fee payments are append-only and cannot be mutated offline");
  }

  const studentId = remapReference(f.studentId, idRemaps);
  const amount = Number(f.amount);
  if (!studentId || !Number.isFinite(amount) || amount <= 0) {
    throw new ValidationError("Valid studentId and positive amount are required for fee_payment");
  }

  const student = await tx.student.findUnique({ where: { id: studentId } });
  if (!student) {
    throw new ValidationError("Student not found for fee payment");
  }
  assertCenterScope(user, student.centerId);

  // Deduplicate by clientOperationId or id
  const existing = await tx.feePayment.findFirst({
    where: { OR: [{ id: entityId }, { clientOperationId: op.operationId }] },
  });
  if (existing) {
    return {
      operationId: op.operationId,
      entityType: "fee_payment",
      entityId: op.entityId,
      status: "deduplicated",
      serverRecord: serializePrismaRecord(existing),
    };
  }

  const payment = await tx.feePayment.create({
    data: {
      id: entityId,
      studentId,
      amount,
      notes: typeof f.notes === "string" ? f.notes : null,
      paidAt: typeof f.paidAt === "string" ? new Date(f.paidAt) : new Date(op.clientTimestamp),
      createdBy: user.userId,
      clientOperationId: op.operationId,
    },
  });

  // Event-sourced recomputation of student fee totals
  const agg = await tx.feePayment.aggregate({
    where: { studentId },
    _sum: { amount: true },
  });
  const totalPaid = Number(agg._sum.amount ?? 0);
  const totalFees = Number(student.totalFees ?? 0);

  await tx.student.update({
    where: { id: studentId },
    data: {
      feesPaid: totalPaid,
      isFullyPaid: totalFees > 0 && totalPaid >= totalFees,
      version: { increment: 1 },
    },
  });

  return {
    operationId: op.operationId,
    entityType: "fee_payment",
    entityId: op.entityId,
    status: "applied",
    serverRecord: serializePrismaRecord(payment),
  };
}

async function handleAttendanceSessionSync(
  tx: Prisma.TransactionClient,
  user: JwtPayload,
  _tenantId: string,
  op: SyncMutationItem,
  entityId: string,
  f: Record<string, unknown>,
  idRemaps: Map<string, string>,
): Promise<SyncPushItemResult> {
  if (op.action === "CREATE") {
    const centerId = String(f.centerId ?? "");
    const sessionDateRaw = String(f.sessionDate ?? "");
    if (!centerId || !sessionDateRaw) {
      throw new ValidationError("centerId and sessionDate are required for attendance_session");
    }
    assertCenterScope(user, centerId);

    const sessionDate = parseUtcDateOnly(sessionDateRaw, "sessionDate");
    const programId = typeof f.programId === "string" && f.programId ? f.programId : null;
    const batchId = typeof f.batchId === "string" && f.batchId ? f.batchId : null;
    const activityId = typeof f.activityId === "string" && f.activityId ? f.activityId : null;

    // Natural-key deduplication: two teachers creating today's session offline
    const existingByNaturalKey = await tx.attendanceSession.findFirst({
      where: {
        centerId,
        sessionDate,
        programId,
        batchId,
        activityId,
      },
      include: { records: true },
    });

    if (existingByNaturalKey) {
      if (existingByNaturalKey.id !== entityId) {
        idRemaps.set(op.entityId, existingByNaturalKey.id);
      }
      return {
        operationId: op.operationId,
        entityType: "attendance_session",
        entityId: op.entityId,
        remappedEntityId:
          existingByNaturalKey.id !== op.entityId ? existingByNaturalKey.id : undefined,
        status: "deduplicated",
        newVersion: existingByNaturalKey.version,
        serverRecord: serializePrismaRecord(existingByNaturalKey),
      };
    }

    const created = await tx.attendanceSession.create({
      data: {
        id: entityId,
        centerId,
        programId,
        batchId,
        activityId,
        academicYearId:
          typeof f.academicYearId === "string" && f.academicYearId ? f.academicYearId : null,
        sessionDate,
        isHoliday: Boolean(f.isHoliday ?? false),
        createdBy: user.userId,
        version: 1,
      },
    });

    return {
      operationId: op.operationId,
      entityType: "attendance_session",
      entityId: op.entityId,
      status: "applied",
      newVersion: created.version,
      serverRecord: serializePrismaRecord(created),
    };
  }

  const existing = await tx.attendanceSession.findUnique({ where: { id: entityId } });
  if (!existing) {
    return {
      operationId: op.operationId,
      entityType: "attendance_session",
      entityId: op.entityId,
      status: "conflict",
      conflictReason: "RECORD_DELETED",
      conflictFields: Object.keys(f),
      serverRecord: null,
    };
  }
  assertCenterScope(user, existing.centerId);

  const resolution = resolveThreeWayFieldMerge({
    serverRecord: existing as unknown as Record<string, unknown>,
    serverVersion: existing.version,
    baseVersion: op.baseVersion,
    baseSnapshot: op.baseSnapshot,
    changedFields: f,
    allowedFields: ["isHoliday"],
    forceOverwrite: op.forceOverwrite,
  });

  if (resolution.status === "conflict") {
    return {
      operationId: op.operationId,
      entityType: "attendance_session",
      entityId: op.entityId,
      status: "conflict",
      conflictReason: resolution.reason,
      conflictFields: resolution.conflictFields,
      serverRecord: serializePrismaRecord(existing),
    };
  }

  const updated =
    Object.keys(resolution.fieldsToWrite).length > 0
      ? await tx.attendanceSession.update({
          where: { id: entityId },
          data: {
            ...(typeof resolution.fieldsToWrite.isHoliday === "boolean"
              ? { isHoliday: resolution.fieldsToWrite.isHoliday }
              : {}),
            version: { increment: 1 },
          },
        })
      : existing;

  return {
    operationId: op.operationId,
    entityType: "attendance_session",
    entityId: op.entityId,
    status: resolution.status,
    newVersion: updated.version,
    autoMergedFields: resolution.autoMergedFields,
    serverRecord: serializePrismaRecord(updated),
  };
}

async function handleAttendanceRecordSync(
  tx: Prisma.TransactionClient,
  user: JwtPayload,
  tenantId: string,
  op: SyncMutationItem,
  entityId: string,
  f: Record<string, unknown>,
  idRemaps: Map<string, string>,
): Promise<SyncPushItemResult> {
  const sessionId = remapReference(f.sessionId, idRemaps);
  const studentId = remapReference(f.studentId, idRemaps);

  // Locate existing record by ID or natural key (sessionId, studentId)
  let existing = await tx.attendanceRecord.findUnique({ where: { id: entityId } });
  if (!existing && sessionId && studentId) {
    existing = await tx.attendanceRecord.findUnique({
      where: { sessionId_studentId: { sessionId, studentId } },
    });
  }

  if (!existing) {
    if (!sessionId || !studentId) {
      throw new ValidationError("sessionId and studentId are required for attendance_record");
    }
    const session = await tx.attendanceSession.findUnique({ where: { id: sessionId } });
    if (!session) {
      throw new ValidationError("Attendance session not found");
    }
    assertCenterScope(user, session.centerId);

    const created = await tx.attendanceRecord.create({
      data: {
        id: entityId,
        sessionId,
        studentId,
        centerId: session.centerId,
        status: (f.status as AttendanceStatus) || "present",
        remarks: typeof f.remarks === "string" ? f.remarks : null,
        version: 1,
      },
    });
    return {
      operationId: op.operationId,
      entityType: "attendance_record",
      entityId: op.entityId,
      status: "applied",
      newVersion: created.version,
      serverRecord: serializePrismaRecord(created),
    };
  }

  assertCenterScope(user, existing.centerId);

  const resolution = resolveAttendanceRecordConflict({
    serverRecord: existing as unknown as Record<string, unknown>,
    serverVersion: existing.version,
    baseVersion: op.baseVersion,
    baseSnapshot: op.baseSnapshot,
    changedFields: f,
    forceOverwrite: op.forceOverwrite,
  });

  if (resolution.status === "conflict") {
    return {
      operationId: op.operationId,
      entityType: "attendance_record",
      entityId: op.entityId,
      remappedEntityId: existing.id !== op.entityId ? existing.id : undefined,
      status: "conflict",
      conflictReason: resolution.reason,
      conflictFields: resolution.conflictFields,
      serverRecord: serializePrismaRecord(existing),
    };
  }

  const hasChanges = Object.keys(resolution.fieldsToWrite).length > 0;
  const updated = hasChanges
    ? await tx.attendanceRecord.update({
        where: { id: existing.id },
        data: {
          ...(resolution.fieldsToWrite.status !== undefined
            ? { status: resolution.fieldsToWrite.status as AttendanceStatus }
            : {}),
          ...(resolution.fieldsToWrite.remarks !== undefined
            ? { remarks: resolution.fieldsToWrite.remarks as string | null }
            : {}),
          version: { increment: 1 },
        },
      })
    : existing;

  if (resolution.status === "merged" || op.forceOverwrite) {
    await writeAuditEntry(tx, {
      tenantId,
      userId: user.userId,
      action: op.forceOverwrite ? "SYNC_CONFLICT_FORCE_OVERWRITE" : "SYNC_AUTO_MERGE",
      tableName: "attendance_records",
      recordId: existing.id,
      oldData: existing,
      newData: updated,
    });
  }

  return {
    operationId: op.operationId,
    entityType: "attendance_record",
    entityId: op.entityId,
    remappedEntityId: existing.id !== op.entityId ? existing.id : undefined,
    status: resolution.status,
    newVersion: updated.version,
    autoMergedFields: resolution.autoMergedFields,
    serverRecord: serializePrismaRecord(updated),
  };
}

async function handleExamSync(
  tx: Prisma.TransactionClient,
  user: JwtPayload,
  op: SyncMutationItem,
  entityId: string,
  f: Record<string, unknown>,
): Promise<SyncPushItemResult> {
  if (op.action !== "CREATE") {
    throw new ValidationError("Offline exam sync currently supports CREATE only");
  }
  const centerId = String(f.centerId ?? "");
  const programId = String(f.programId ?? "");
  const name = String(f.name ?? "").trim();
  const examType = String(f.examType ?? "").trim();
  if (!centerId || !programId || !name || !examType) {
    throw new ValidationError("centerId, programId, name, and examType are required for exam");
  }
  assertCenterScope(user, centerId);

  const existing = await tx.exam.findUnique({ where: { id: entityId } });
  if (existing) {
    return {
      operationId: op.operationId,
      entityType: "exam",
      entityId: op.entityId,
      status: "deduplicated",
      newVersion: existing.version,
      serverRecord: serializePrismaRecord(existing),
    };
  }

  const created = await tx.exam.create({
    data: {
      id: entityId,
      centerId,
      programId,
      academicYearId:
        typeof f.academicYearId === "string" && f.academicYearId ? f.academicYearId : null,
      examType,
      name,
      examDate:
        typeof f.examDate === "string" && f.examDate
          ? parseUtcDateOnly(f.examDate, "examDate")
          : null,
      status: "DRAFT",
      createdBy: user.userId,
      version: 1,
    },
  });

  return {
    operationId: op.operationId,
    entityType: "exam",
    entityId: op.entityId,
    status: "applied",
    newVersion: created.version,
    serverRecord: serializePrismaRecord(created),
  };
}

async function handleExamScoreSync(
  tx: Prisma.TransactionClient,
  user: JwtPayload,
  tenantId: string,
  op: SyncMutationItem,
  entityId: string,
  f: Record<string, unknown>,
  idRemaps: Map<string, string>,
): Promise<SyncPushItemResult> {
  const examId = remapReference(f.examId, idRemaps);
  const studentId = remapReference(f.studentId, idRemaps);
  const subjectId = typeof f.subjectId === "string" ? f.subjectId : undefined;

  let existing = await tx.examScore.findUnique({ where: { id: entityId } });
  if (!existing && examId && studentId && subjectId) {
    existing = await tx.examScore.findUnique({
      where: { examId_studentId_subjectId: { examId, studentId, subjectId } },
    });
  }

  const resolvedExamId = existing?.examId ?? examId;
  if (!resolvedExamId) {
    throw new ValidationError("examId is required for exam_score");
  }
  const exam = await tx.exam.findUnique({ where: { id: resolvedExamId } });
  if (!exam) {
    throw new ValidationError("Exam not found");
  }
  assertCenterScope(user, exam.centerId);

  const resolution = resolveExamScoreConflict({
    examStatus: exam.status,
    serverRecord: existing as unknown as Record<string, unknown> | null,
    serverVersion: existing?.version ?? 1,
    baseVersion: op.baseVersion,
    baseSnapshot: op.baseSnapshot,
    changedFields: f,
    forceOverwrite: op.forceOverwrite,
  });

  if (resolution.status === "conflict") {
    return {
      operationId: op.operationId,
      entityType: "exam_score",
      entityId: op.entityId,
      remappedEntityId: existing && existing.id !== op.entityId ? existing.id : undefined,
      status: "conflict",
      conflictReason: resolution.reason,
      conflictFields: resolution.conflictFields,
      serverRecord: existing ? serializePrismaRecord(existing) : null,
    };
  }

  if (!existing) {
    if (!studentId || !subjectId) {
      throw new ValidationError("studentId and subjectId are required to create exam_score");
    }
    const isAbsent = Boolean(f.isAbsent ?? false);
    const marks =
      isAbsent || f.marks === null || f.marks === undefined || f.marks === ""
        ? null
        : Number(f.marks);

    const created = await tx.examScore.create({
      data: {
        id: entityId,
        examId: resolvedExamId,
        studentId,
        subjectId,
        centerId: exam.centerId,
        marks,
        isAbsent,
        remarks: typeof f.remarks === "string" ? f.remarks : null,
        status: "DRAFT",
        enteredBy: user.userId,
        version: 1,
      },
    });
    return {
      operationId: op.operationId,
      entityType: "exam_score",
      entityId: op.entityId,
      status: "applied",
      newVersion: created.version,
      serverRecord: serializePrismaRecord(created),
    };
  }

  const patch: Record<string, unknown> = {};
  if ("isAbsent" in resolution.fieldsToWrite) {
    patch.isAbsent = Boolean(resolution.fieldsToWrite.isAbsent);
  }
  if ("marks" in resolution.fieldsToWrite) {
    const rawMarks = resolution.fieldsToWrite.marks;
    patch.marks =
      patch.isAbsent === true || rawMarks === null || rawMarks === undefined || rawMarks === ""
        ? null
        : Number(rawMarks);
  }
  if ("remarks" in resolution.fieldsToWrite) {
    patch.remarks =
      typeof resolution.fieldsToWrite.remarks === "string"
        ? resolution.fieldsToWrite.remarks
        : null;
  }

  const updated =
    Object.keys(patch).length > 0
      ? await tx.examScore.update({
          where: { id: existing.id },
          data: {
            ...patch,
            enteredBy: user.userId,
            version: { increment: 1 },
          },
        })
      : existing;

  if (resolution.status === "merged" || op.forceOverwrite) {
    await writeAuditEntry(tx, {
      tenantId,
      userId: user.userId,
      action: op.forceOverwrite ? "SYNC_CONFLICT_FORCE_OVERWRITE" : "SYNC_AUTO_MERGE",
      tableName: "exam_scores",
      recordId: existing.id,
      oldData: existing,
      newData: updated,
    });
  }

  return {
    operationId: op.operationId,
    entityType: "exam_score",
    entityId: op.entityId,
    remappedEntityId: existing.id !== op.entityId ? existing.id : undefined,
    status: resolution.status,
    newVersion: updated.version,
    autoMergedFields: resolution.autoMergedFields,
    serverRecord: serializePrismaRecord(updated),
  };
}

async function handleSkillLogSync(
  tx: Prisma.TransactionClient,
  user: JwtPayload,
  tenantId: string,
  op: SyncMutationItem,
  entityId: string,
  f: Record<string, unknown>,
  idRemaps: Map<string, string>,
): Promise<SyncPushItemResult> {
  if (op.action === "CREATE") {
    const studentId = remapReference(f.studentId, idRemaps);
    const skillId = typeof f.skillId === "string" ? f.skillId : "";
    const level = Number(f.level);
    if (!studentId || !skillId || !Number.isInteger(level) || level < 1) {
      throw new ValidationError("studentId, skillId, and positive integer level are required");
    }
    const student = await tx.student.findUnique({ where: { id: studentId } });
    if (!student) throw new ValidationError("Student not found for skill log");
    assertCenterScope(user, student.centerId);

    const existing = await tx.studentSkillLog.findUnique({ where: { id: entityId } });
    if (existing) {
      return {
        operationId: op.operationId,
        entityType: "skill_log",
        entityId: op.entityId,
        status: "deduplicated",
        newVersion: existing.version,
        serverRecord: serializePrismaRecord(existing),
      };
    }

    const created = await tx.studentSkillLog.create({
      data: {
        id: entityId,
        studentId,
        centerId: student.centerId,
        skillId,
        level,
        assessedBy: user.userId,
        assessedOn:
          typeof f.assessedOn === "string" && f.assessedOn
            ? parseUtcDateOnly(f.assessedOn, "assessedOn")
            : new Date(),
        remarks: typeof f.remarks === "string" ? f.remarks : null,
        version: 1,
      },
      include: { skill: true },
    });

    return {
      operationId: op.operationId,
      entityType: "skill_log",
      entityId: op.entityId,
      status: "applied",
      newVersion: created.version,
      serverRecord: serializePrismaRecord(created),
    };
  }

  const existing = await tx.studentSkillLog.findUnique({ where: { id: entityId } });
  if (!existing) {
    return {
      operationId: op.operationId,
      entityType: "skill_log",
      entityId: op.entityId,
      status: "conflict",
      conflictReason: "RECORD_DELETED",
      conflictFields: Object.keys(f),
      serverRecord: null,
    };
  }
  assertCenterScope(user, existing.centerId);

  if (op.action === "DELETE") {
    const deleted = await tx.studentSkillLog.update({
      where: { id: entityId },
      data: { deletedAt: new Date(), version: { increment: 1 } },
    });
    return {
      operationId: op.operationId,
      entityType: "skill_log",
      entityId: op.entityId,
      status: "applied",
      newVersion: deleted.version,
      serverRecord: serializePrismaRecord(deleted),
    };
  }

  const resolution = resolveThreeWayFieldMerge({
    serverRecord: existing as unknown as Record<string, unknown>,
    serverVersion: existing.version,
    baseVersion: op.baseVersion,
    baseSnapshot: op.baseSnapshot,
    changedFields: f,
    allowedFields: SKILL_LOG_SYNC_UPDATABLE_FIELDS,
    forceOverwrite: op.forceOverwrite,
  });

  if (resolution.status === "conflict") {
    return {
      operationId: op.operationId,
      entityType: "skill_log",
      entityId: op.entityId,
      status: "conflict",
      conflictReason: resolution.reason,
      conflictFields: resolution.conflictFields,
      serverRecord: serializePrismaRecord(existing),
    };
  }

  const patch: Record<string, unknown> = { ...resolution.fieldsToWrite };
  if (typeof patch.assessedOn === "string" && patch.assessedOn) {
    patch.assessedOn = parseUtcDateOnly(patch.assessedOn, "assessedOn");
  }
  if (patch.level !== undefined) {
    patch.level = Number(patch.level);
  }

  const updated =
    Object.keys(patch).length > 0
      ? await tx.studentSkillLog.update({
          where: { id: entityId },
          data: {
            ...patch,
            assessedBy: user.userId,
            version: { increment: 1 },
          },
          include: { skill: true },
        })
      : existing;

  if (resolution.status === "merged" || op.forceOverwrite) {
    await writeAuditEntry(tx, {
      tenantId,
      userId: user.userId,
      action: op.forceOverwrite ? "SYNC_CONFLICT_FORCE_OVERWRITE" : "SYNC_AUTO_MERGE",
      tableName: "student_skill_logs",
      recordId: entityId,
      oldData: existing,
      newData: updated,
    });
  }

  return {
    operationId: op.operationId,
    entityType: "skill_log",
    entityId: op.entityId,
    status: resolution.status,
    newVersion: updated.version,
    autoMergedFields: resolution.autoMergedFields,
    serverRecord: serializePrismaRecord(updated),
  };
}

async function handleFormSubmissionSync(
  tx: Prisma.TransactionClient,
  user: JwtPayload,
  op: SyncMutationItem,
  entityId: string,
  f: Record<string, unknown>,
  idRemaps: Map<string, string>,
): Promise<SyncPushItemResult> {
  if (op.action !== "CREATE") {
    throw new ValidationError("Form submissions are append-only when queued offline");
  }
  const templateId = String(f.templateId ?? "");
  const centerId = String(f.centerId ?? "");
  const studentId = remapReference(f.studentId, idRemaps) ?? null;

  if (!templateId || !centerId) {
    throw new ValidationError("templateId and centerId are required for form_submission");
  }
  assertCenterScope(user, centerId);

  const existing = await tx.formSubmission.findUnique({ where: { id: entityId } });
  if (existing) {
    return {
      operationId: op.operationId,
      entityType: "form_submission",
      entityId: op.entityId,
      status: "deduplicated",
      newVersion: existing.version,
      serverRecord: serializePrismaRecord(existing),
    };
  }

  const created = await tx.formSubmission.create({
    data: {
      id: entityId,
      templateId,
      assignmentId: typeof f.assignmentId === "string" ? f.assignmentId : null,
      studentId,
      centerId,
      submittedBy: user.userId,
      startedAt: typeof f.startedAt === "string" ? new Date(f.startedAt) : null,
      submittedAt: new Date(op.clientTimestamp),
      data: (f.data ?? {}) as Prisma.InputJsonValue,
      version: 1,
    },
  });

  return {
    operationId: op.operationId,
    entityType: "form_submission",
    entityId: op.entityId,
    status: "applied",
    newVersion: created.version,
    serverRecord: serializePrismaRecord(created),
  };
}

/**
 * POST /api/sync/push
 * Processes an ordered batch of client mutations non-blockingly:
 * each item runs in its own transaction so one conflict or validation error
 * does not poison subsequent independent items.
 */
export async function pushSyncBatch(
  user: JwtPayload,
  operations: SyncMutationItem[],
): Promise<SyncPushResponse> {
  const results: SyncPushItemResult[] = [];
  const idRemaps = new Map<string, string>();
  const mutatedEntities = new Set<SyncEntityType>();

  for (const op of operations) {
    try {
      const itemResult = await processSingleSyncMutation(user, op, idRemaps);
      results.push(itemResult);
      if (itemResult.status === "applied" || itemResult.status === "merged") {
        mutatedEntities.add(op.entityType);
      }
    } catch (err) {
      results.push({
        operationId: op.operationId,
        entityType: op.entityType,
        entityId: op.entityId,
        status: "error",
        errorMessage: err instanceof Error ? err.message : "Failed to sync operation",
      });
    }
  }

  const serverTime = new Date().toISOString();

  // Notify other online devices in the same tenant to refresh their local cache
  if (mutatedEntities.size > 0) {
    try {
      const io = getIO();
      const tenantId = user.tenantId || DEFAULT_TENANT_ID;
      io.to(SocketRoomManager.getTenantRoomName(tenantId)).emit("sync:updated", {
        entities: Array.from(mutatedEntities),
        updatedBy: user.userId,
        serverTime,
      });
    } catch {
      // Socket.IO may not be initialized in unit tests
    }
  }

  return {
    serverTime,
    results,
    idRemaps: Object.fromEntries(idRemaps.entries()),
  };
}
