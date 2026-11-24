import { hasCenterAccess } from "../lib/centerScope.js";
import { uploadBufferToCloudinary } from "../lib/cloudinary.js";
import { ForbiddenError, NotFoundError, ValidationError } from "../lib/errors.js";
import prisma from "../lib/prisma.js";

export type DossierActor =
  | {
      userId: string;
      role: string;
      centerIds: string[];
      tenantId?: string;
    }
  | undefined;

export const STUDENT_DOCUMENT_TABLE = "student_documents";
export const STUDENT_DOCUMENT_ADD_ACTION = "STUDENT_DOCUMENT_ADDED";
export const MAX_DOCUMENT_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB

export const ALLOWED_DOCUMENT_MIME_TYPES = new Set<string>([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/plain",
  "text/csv",
]);

export type DocumentCategory =
  | "identity"
  | "academic"
  | "certificate"
  | "medical"
  | "consent"
  | "other";

export type DossierTimelineEventType =
  | "enrollment"
  | "lifecycle"
  | "transfer"
  | "exam"
  | "skill"
  | "fee"
  | "activity"
  | "alert"
  | "document";

export type DossierTimelineEvent = {
  id: string;
  date: string;
  type: DossierTimelineEventType;
  title: string;
  subtitle: string;
  badge?: string | null;
};

export type StudentDocumentRecord = {
  id: string;
  title: string;
  category: DocumentCategory;
  url: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
  notes: string | null;
  uploadedAt: string;
  uploadedByName: string | null;
};

export function sanitizeFileName(rawName: string): string {
  const base = rawName.split(/[/\\]/).pop() || "document";
  return base.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 120) || "document";
}

export function validateDocumentUploadMeta(input: {
  mimeType: string;
  fileSize: number;
  fileName: string;
}): { mimeType: string; fileSize: number; fileName: string } {
  const mime = (input.mimeType || "").toLowerCase().trim();
  if (!ALLOWED_DOCUMENT_MIME_TYPES.has(mime)) {
    throw new ValidationError(
      "Unsupported file type. Allowed formats: PDF, JPG, PNG, WEBP, DOC, DOCX, TXT, CSV.",
    );
  }
  if (!Number.isFinite(input.fileSize) || input.fileSize <= 0) {
    throw new ValidationError("Uploaded file cannot be empty.");
  }
  if (input.fileSize > MAX_DOCUMENT_SIZE_BYTES) {
    throw new ValidationError("File size exceeds 10 MB maximum limit.");
  }
  return {
    mimeType: mime,
    fileSize: input.fileSize,
    fileName: sanitizeFileName(input.fileName),
  };
}

export function assertSafeDocumentUrl(rawUrl: string): string {
  const trimmed = rawUrl.trim();
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new ValidationError("Provide a valid http/https document URL.");
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new ValidationError("Only http and https document links are permitted.");
  }
  return parsed.toString();
}

type AuditRowWithUser = {
  id: string;
  action: string;
  tableName: string | null;
  newData: unknown;
  createdAt: Date;
  user?: { id: string; fullName: string } | null;
};

function mapAuditRowToDocument(row: AuditRowWithUser): StudentDocumentRecord {
  const data = (row.newData && typeof row.newData === "object" ? row.newData : {}) as Record<
    string,
    unknown
  >;
  return {
    id: row.id,
    title: typeof data.title === "string" ? data.title : "Student Document",
    category: (typeof data.category === "string" ? data.category : "other") as DocumentCategory,
    url: typeof data.url === "string" ? data.url : "",
    fileName: typeof data.fileName === "string" ? data.fileName : "document",
    mimeType: typeof data.mimeType === "string" ? data.mimeType : "application/octet-stream",
    fileSize: typeof data.fileSize === "number" ? data.fileSize : 0,
    notes: typeof data.notes === "string" ? data.notes : null,
    uploadedAt: row.createdAt.toISOString(),
    uploadedByName: row.user?.fullName ?? null,
  };
}

async function assertAuthorizedStudent(user: DossierActor, studentId: string) {
  const student = await prisma.student.findUnique({
    where: { id: studentId },
    select: { id: true, centerId: true, fullName: true },
  });
  if (!student) {
    throw new NotFoundError("Student");
  }
  if (!hasCenterAccess(user, student.centerId)) {
    throw new ForbiddenError("No access to this student's dossier");
  }
  return student;
}

export async function listStudentDocuments(
  user: DossierActor,
  studentId: string,
): Promise<StudentDocumentRecord[]> {
  await assertAuthorizedStudent(user, studentId);

  const rows = await prisma.auditLog.findMany({
    where: {
      tableName: STUDENT_DOCUMENT_TABLE,
      action: STUDENT_DOCUMENT_ADD_ACTION,
      recordId: studentId,
    },
    include: {
      user: { select: { id: true, fullName: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return rows.map((row) => mapAuditRowToDocument(row));
}

export async function addStudentDocument(
  user: DossierActor,
  studentId: string,
  input: {
    title: string;
    category: DocumentCategory;
    notes?: string | null;
    url?: string | null;
    fileName?: string | null;
    file?: {
      buffer: Buffer;
      originalname: string;
      mimetype: string;
      size: number;
    };
  },
  uploadFileFn = uploadBufferToCloudinary,
): Promise<StudentDocumentRecord> {
  await assertAuthorizedStudent(user, studentId);

  let resolvedUrl = "";
  let resolvedFileName = "";
  let resolvedMimeType = "text/uri-list";
  let resolvedFileSize = 0;
  let publicId: string | null = null;

  if (input.file) {
    const validated = validateDocumentUploadMeta({
      mimeType: input.file.mimetype,
      fileSize: input.file.size,
      fileName: input.file.originalname,
    });
    const uploaded = await uploadFileFn(
      input.file.buffer,
      validated.fileName,
      validated.mimeType,
      validated.fileSize,
    );
    resolvedUrl = uploaded.url;
    resolvedFileName = uploaded.fileName || validated.fileName;
    resolvedMimeType = uploaded.mimeType || validated.mimeType;
    resolvedFileSize = uploaded.fileSize || validated.fileSize;
    publicId = uploaded.id || null;
  } else if (input.url) {
    resolvedUrl = assertSafeDocumentUrl(input.url);
    resolvedFileName = sanitizeFileName(input.fileName || input.title);
  } else {
    throw new ValidationError("Provide either a file upload or an https document URL.");
  }

  const created = await prisma.auditLog.create({
    data: {
      userId: user?.userId ?? null,
      action: STUDENT_DOCUMENT_ADD_ACTION,
      tableName: STUDENT_DOCUMENT_TABLE,
      recordId: studentId,
      newData: {
        title: input.title.trim(),
        category: input.category,
        notes: input.notes ?? null,
        url: resolvedUrl,
        publicId,
        fileName: resolvedFileName,
        mimeType: resolvedMimeType,
        fileSize: resolvedFileSize,
      },
    },
    include: {
      user: { select: { id: true, fullName: true } },
    },
  });

  return mapAuditRowToDocument(created);
}

export async function deleteStudentDocument(
  user: DossierActor,
  studentId: string,
  documentId: string,
) {
  await assertAuthorizedStudent(user, studentId);

  const existing = await prisma.auditLog.findFirst({
    where: {
      id: documentId,
      tableName: STUDENT_DOCUMENT_TABLE,
      action: STUDENT_DOCUMENT_ADD_ACTION,
      recordId: studentId,
    },
    select: { id: true },
  });

  if (!existing) {
    throw new NotFoundError("Student document");
  }

  await prisma.auditLog.delete({ where: { id: existing.id } });
  return { deleted: true, id: existing.id };
}

export async function getStudentDossier(user: DossierActor, studentId: string) {
  const student = await prisma.student.findUnique({
    where: { id: studentId },
    include: {
      center: { select: { id: true, name: true } },
      program: { select: { id: true, name: true } },
      academicYear: { select: { id: true, label: true } },
      transfers: {
        include: {
          fromCenter: { select: { name: true } },
          toCenter: { select: { name: true } },
          approvedByUser: { select: { fullName: true } },
        },
        orderBy: { transferDate: "desc" },
      },
      examScores: {
        include: {
          exam: {
            select: { id: true, name: true, examType: true, examDate: true },
          },
          subject: { select: { id: true, name: true, maxMarks: true } },
        },
        orderBy: { enteredAt: "desc" },
      },
      skillLogs: {
        include: {
          skill: { select: { id: true, name: true, maxLevel: true } },
          assessedByUser: { select: { fullName: true } },
        },
        orderBy: [{ assessedOn: "desc" }, { createdAt: "desc" }],
      },
      feePayments: {
        orderBy: { paidAt: "desc" },
      },
      activityEnrollments: {
        include: {
          activity: {
            select: { id: true, name: true, activityType: true, status: true, startDate: true },
          },
        },
        orderBy: { createdAt: "desc" },
      },
      alerts: {
        include: {
          rule: { select: { metric: true } },
        },
        orderBy: { createdAt: "desc" },
        take: 15,
      },
    },
  });

  if (!student) {
    throw new NotFoundError("Student");
  }

  if (!hasCenterAccess(user, student.centerId)) {
    throw new ForbiddenError("No access to this student's dossier");
  }

  const auditRows = await prisma.auditLog.findMany({
    where: {
      recordId: studentId,
      tableName: { in: ["students", STUDENT_DOCUMENT_TABLE] },
    },
    include: {
      user: { select: { id: true, fullName: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  const timeline: DossierTimelineEvent[] = [];

  // 1. Enrollment
  timeline.push({
    id: `enr-${student.id}`,
    date: student.enrollmentDate.toISOString(),
    type: "enrollment",
    title: `Enrolled in ${student.program?.name || "Program"}`,
    subtitle: `${student.center?.name || "Center"}${student.academicYear?.label ? ` · Academic Year ${student.academicYear.label}` : ""}`,
    badge: "Enrollment",
  });

  // 2. Lifecycle Audit Logs & Document Vault
  const documents: StudentDocumentRecord[] = [];
  for (const row of auditRows) {
    if (row.tableName === STUDENT_DOCUMENT_TABLE && row.action === STUDENT_DOCUMENT_ADD_ACTION) {
      const doc = mapAuditRowToDocument(row);
      documents.push(doc);
      timeline.push({
        id: `doc-${doc.id}`,
        date: doc.uploadedAt,
        type: "document",
        title: `Document Added: ${doc.title}`,
        subtitle: `Category: ${doc.category}${doc.uploadedByName ? ` · Uploaded by ${doc.uploadedByName}` : ""}`,
        badge: doc.category,
      });
    } else if (row.tableName === "students" && row.action === "COHORT_LIFECYCLE_TRANSITION") {
      const data = (row.newData && typeof row.newData === "object" ? row.newData : {}) as Record<
        string,
        unknown
      >;
      const actionLabel = typeof data.action === "string" ? data.action : "transition";
      timeline.push({
        id: `life-${row.id}`,
        date: row.createdAt.toISOString(),
        type: "lifecycle",
        title: `Cohort Transition: ${actionLabel.toUpperCase()}`,
        subtitle: `${row.user?.fullName ? `Processed by ${row.user.fullName}` : "Academic year transition"}`,
        badge: actionLabel,
      });
    }
  }

  // 3. Transfers
  for (const tr of student.transfers) {
    timeline.push({
      id: `tr-${tr.id}`,
      date: tr.transferDate.toISOString(),
      type: "transfer",
      title: `Transferred: ${tr.fromCenter?.name || "Center"} -> ${tr.toCenter?.name || "Center"}`,
      subtitle: `${tr.reason ? `${tr.reason} · ` : ""}Approved by ${tr.approvedByUser?.fullName || "Admin"}`,
      badge: "Transfer",
    });
  }

  // 4. Exam milestones grouped by Exam
  const examGroups = new Map<
    string,
    {
      examId: string;
      examName: string;
      examType: string;
      date: Date;
      scoredCount: number;
      absentCount: number;
      pctSum: number;
    }
  >();

  for (const score of student.examScores) {
    const key = score.examId;
    const grp = examGroups.get(key) ?? {
      examId: key,
      examName: score.exam?.name || "Exam",
      examType: score.exam?.examType || "exam",
      date: score.exam?.examDate ?? score.enteredAt,
      scoredCount: 0,
      absentCount: 0,
      pctSum: 0,
    };

    if (score.isAbsent || score.marks === null) {
      grp.absentCount += 1;
    } else {
      const maxMarks = Math.max(1, Number(score.subject?.maxMarks || 100));
      const pct = Math.round((Number(score.marks) / maxMarks) * 100);
      grp.scoredCount += 1;
      grp.pctSum += pct;
    }
    examGroups.set(key, grp);
  }

  for (const grp of examGroups.values()) {
    const avg = grp.scoredCount > 0 ? Math.round(grp.pctSum / grp.scoredCount) : null;
    timeline.push({
      id: `exam-${grp.examId}`,
      date: grp.date.toISOString(),
      type: "exam",
      title: `${grp.examName}${avg !== null ? ` — ${avg}% Avg` : ""}`,
      subtitle: `${grp.scoredCount} graded subject(s)${grp.absentCount > 0 ? ` · ${grp.absentCount} absent` : ""}`,
      badge: grp.examType,
    });
  }

  // 5. Skill assessments
  for (const sk of student.skillLogs) {
    timeline.push({
      id: `sk-${sk.id}`,
      date: sk.assessedOn.toISOString(),
      type: "skill",
      title: `Skill Assessed: ${sk.skill?.name || "Skill"} (${sk.level}/${sk.skill?.maxLevel || 5})`,
      subtitle: `${sk.remarks ? `${sk.remarks} · ` : ""}Assessed by ${sk.assessedByUser?.fullName || "Educator"}`,
      badge: `L${sk.level}`,
    });
  }

  // 6. Fee payments
  for (const fee of student.feePayments) {
    timeline.push({
      id: `fee-${fee.id}`,
      date: fee.paidAt.toISOString(),
      type: "fee",
      title: `Fee Payment: ₹${Number(fee.amount).toLocaleString()}`,
      subtitle: fee.notes || "Recorded fee installment",
      badge: "Paid",
    });
  }

  // 7. Co-curricular activities
  for (const act of student.activityEnrollments) {
    const actDate = act.activity?.startDate ?? act.createdAt;
    timeline.push({
      id: `act-${act.id}`,
      date: actDate.toISOString(),
      type: "activity",
      title: `Activity: ${act.activity?.name || "Activity"}`,
      subtitle: `${act.status === "approved_by_admin" ? "Approved participant" : "Pending teacher nomination"} · Activity status: ${act.activity?.status || "planned"}`,
      badge: act.activity?.activityType || "activity",
    });
  }

  // 8. Risk Alerts (deduplicated by message+day so multiple recipient copies don't clutter timeline)
  const seenAlerts = new Set<string>();
  for (const alert of student.alerts) {
    const dedupeKey = `${alert.ruleId}:${alert.createdAt.toISOString().slice(0, 10)}`;
    if (seenAlerts.has(dedupeKey)) continue;
    seenAlerts.add(dedupeKey);
    timeline.push({
      id: `al-${alert.id}`,
      date: alert.createdAt.toISOString(),
      type: "alert",
      title: alert.message,
      subtitle: `Early-warning rule: ${alert.rule?.metric || "risk"}`,
      badge: alert.isRead ? "Acknowledged" : "Open Alert",
    });
  }

  timeline.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  return {
    studentId: student.id,
    summary: {
      totalEvents: timeline.length,
      examMilestones: examGroups.size,
      skillMilestones: student.skillLogs.length,
      feePaymentsCount: student.feePayments.length,
      transfersCount: student.transfers.length,
      documentCount: documents.length,
    },
    timeline,
    documents,
  };
}
