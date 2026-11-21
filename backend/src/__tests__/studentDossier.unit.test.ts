import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ForbiddenError, NotFoundError, ValidationError } from "../lib/errors.js";
import {
  addStudentDocument,
  assertSafeDocumentUrl,
  deleteStudentDocument,
  getStudentDossier,
  MAX_DOCUMENT_SIZE_BYTES,
  STUDENT_DOCUMENT_ADD_ACTION,
  STUDENT_DOCUMENT_TABLE,
  validateDocumentUploadMeta,
} from "../services/studentDossierService.js";
import { mockPrismaModel } from "./helpers/mockPrisma.js";

const adminUser = {
  userId: "admin-1",
  role: "center_admin",
  centerIds: ["center-1"],
};

describe("Component 3.7: 360° Longitudinal Dossier & Student Document Vault", () => {
  it("validates MIME types, 10MB file size limit, and safe http/https URLs", () => {
    const valid = validateDocumentUploadMeta({
      mimeType: "application/pdf",
      fileSize: 1024,
      fileName: "../../Birth Certificate (2025).pdf",
    });
    assert.equal(valid.fileName, "Birth_Certificate__2025_.pdf");

    assert.throws(
      () =>
        validateDocumentUploadMeta({
          mimeType: "application/x-msdownload",
          fileSize: 512,
          fileName: "malware.exe",
        }),
      ValidationError,
    );

    assert.throws(
      () =>
        validateDocumentUploadMeta({
          mimeType: "application/pdf",
          fileSize: MAX_DOCUMENT_SIZE_BYTES + 1,
          fileName: "huge.pdf",
        }),
      ValidationError,
    );

    assert.equal(assertSafeDocumentUrl("https://docs.example.org/id-card.pdf"), "https://docs.example.org/id-card.pdf");
    assert.throws(() => assertSafeDocumentUrl("javascript:alert(1)"), ValidationError);
    assert.throws(() => assertSafeDocumentUrl("data:text/html,<script>1</script>"), ValidationError);
  });

  it("enforces center isolation and aggregates longitudinal dossier milestones + vault documents", async (t) => {
    let targetCenter = "center-2";

    mockPrismaModel(t, "student", {
      findUnique: async () => ({
        id: "stu-1",
        centerId: targetCenter,
        fullName: "Kiran Das",
        enrollmentDate: new Date("2025-04-01T00:00:00Z"),
        center: { id: targetCenter, name: "East Center" },
        program: { id: "prog-1", name: "Class 8" },
        academicYear: { id: "ay-1", label: "2025-26" },
        transfers: [
          {
            id: "tr-1",
            transferDate: new Date("2025-09-10T00:00:00Z"),
            reason: "Relocation",
            fromCenter: { name: "West Center" },
            toCenter: { name: "East Center" },
            approvedByUser: { fullName: "Principal" },
          },
        ],
        examScores: [
          {
            id: "es-1",
            examId: "ex-1",
            marks: 36,
            isAbsent: false,
            enteredAt: new Date("2026-01-15T10:00:00Z"),
            exam: { id: "ex-1", name: "Midline Exam", examType: "midline", examDate: new Date("2026-01-14T00:00:00Z") },
            subject: { id: "sub-1", name: "Science", maxMarks: 40 },
          },
        ],
        skillLogs: [
          {
            id: "sk-1",
            assessedOn: new Date("2026-02-01T00:00:00Z"),
            level: 4,
            remarks: "Clear presenter",
            skill: { id: "sdef-1", name: "Public Speaking", maxLevel: 5 },
            assessedByUser: { fullName: "Ms. Rao" },
          },
        ],
        feePayments: [
          { id: "fp-1", amount: 500, notes: "Term 1", paidAt: new Date("2025-05-01T00:00:00Z") },
        ],
        activityEnrollments: [
          {
            id: "ae-1",
            status: "approved_by_admin",
            createdAt: new Date("2025-11-01T00:00:00Z"),
            activity: { id: "act-1", name: "Math Club", activityType: "club", status: "ongoing", startDate: new Date("2025-11-05T00:00:00Z") },
          },
        ],
        alerts: [
          {
            id: "al-1",
            ruleId: "rule-1",
            message: "Attendance below 75%",
            isRead: false,
            createdAt: new Date("2026-02-10T08:00:00Z"),
            rule: { metric: "attendance_30d_pct" },
          },
          {
            id: "al-2",
            ruleId: "rule-1",
            message: "Attendance below 75%",
            isRead: true,
            createdAt: new Date("2026-02-10T08:00:00Z"),
            rule: { metric: "attendance_30d_pct" },
          },
        ],
      }),
    });

    mockPrismaModel(t, "auditLog", {
      findMany: async () => [
        {
          id: "aud-life",
          action: "COHORT_LIFECYCLE_TRANSITION",
          tableName: "students",
          newData: { action: "promote" },
          createdAt: new Date("2026-03-31T00:00:00Z"),
          user: { id: "admin-1", fullName: "Admin User" },
        },
        {
          id: "doc-1",
          action: STUDENT_DOCUMENT_ADD_ACTION,
          tableName: STUDENT_DOCUMENT_TABLE,
          newData: {
            title: "Aadhaar Copy",
            category: "identity",
            url: "https://cdn.example.org/aadhaar.pdf",
            fileName: "aadhaar.pdf",
            mimeType: "application/pdf",
            fileSize: 20480,
          },
          createdAt: new Date("2025-04-02T00:00:00Z"),
          user: { id: "admin-1", fullName: "Admin User" },
        },
      ],
    });

    await assert.rejects(() => getStudentDossier(adminUser, "stu-1"), ForbiddenError);

    targetCenter = "center-1";
    const dossier = await getStudentDossier(adminUser, "stu-1");
    assert.equal(dossier.documents.length, 1);
    assert.equal(dossier.documents[0].title, "Aadhaar Copy");
    assert.equal(dossier.summary.examMilestones, 1);
    assert.equal(dossier.summary.transfersCount, 1);
    assert.equal(dossier.summary.totalEvents, 9);
    assert.ok(dossier.timeline[0].type === "lifecycle");
  });

  it("uploads documents via injected storage and blocks deleting non-document audit entries", async (t) => {
    mockPrismaModel(t, "student", {
      findUnique: async () => ({ id: "stu-1", centerId: "center-1", fullName: "Kiran Das" }),
    });

    let findFirstRes: { id: string } | null = null;
    let deletedDocId = "";

    mockPrismaModel(t, "auditLog", {
      create: async ({ data }: { data: { newData: Record<string, unknown> } }) => ({
        id: "doc-new",
        action: STUDENT_DOCUMENT_ADD_ACTION,
        tableName: STUDENT_DOCUMENT_TABLE,
        newData: data.newData,
        createdAt: new Date("2026-04-01T00:00:00Z"),
        user: { id: "admin-1", fullName: "Admin User" },
      }),
      findFirst: async () => findFirstRes,
      delete: async ({ where }: { where: { id: string } }) => {
        deletedDocId = where.id;
        return { id: deletedDocId };
      },
    });

    const created = await addStudentDocument(
      adminUser,
      "stu-1",
      {
        title: "Transfer Certificate",
        category: "academic",
        file: {
          buffer: Buffer.from("%PDF-1.4"),
          originalname: "tc.pdf",
          mimetype: "application/pdf",
          size: 800,
        },
      },
      async (_buf, fileName, mimeType, fileSize) => ({
        id: "cld-1",
        url: "https://res.cloudinary.com/demo/tc.pdf",
        fileName,
        mimeType,
        fileSize,
        resourceType: "raw",
      }),
    );

    assert.equal(created.id, "doc-new");
    assert.equal(created.url, "https://res.cloudinary.com/demo/tc.pdf");

    // Non-document audit ID returns NotFoundError cleanly
    await assert.rejects(
      () => deleteStudentDocument(adminUser, "stu-1", "real-audit-log-id"),
      NotFoundError,
    );

    findFirstRes = { id: "doc-new" };
    const delRes = await deleteStudentDocument(adminUser, "stu-1", "doc-new");
    assert.equal(delRes.deleted, true);
    assert.equal(deletedDocId, "doc-new");
  });
});
