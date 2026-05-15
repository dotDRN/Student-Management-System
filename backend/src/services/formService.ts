import type { Prisma } from "@prisma/client";
import type { JwtPayload } from "../lib/auth.js";
import prisma from "../lib/prisma.js";
import {
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from "../lib/errors.js";


type FormFieldType =
  | "text"
  | "textarea"
  | "date"
  | "number"
  | "boolean"
  | "select";
type FormField = {
  name: string;
  label: string;
  type: FormFieldType;
  required: boolean;
  options?: string[];
};
type FormSchema = {
  fields: FormField[];
  version?: number;
};

type CreateTemplateInput = {
  formType: string;
  name: string;
  schema: FormSchema;
  targetEntity?: string;
};

type SubmitFormInput = {
  templateId: string;
  studentId: string;
  centerId: string;
  data: Record<string, unknown>;
};

function ensureCenterAccess(user: JwtPayload, centerId: string): void {
  if (user.role !== "super_admin" && !user.centerIds.includes(centerId)) {
    throw new ForbiddenError("No access to the requested center");
  }
}

function validateSchema(schema: FormSchema): void {
  if (!schema || !Array.isArray(schema.fields) || schema.fields.length === 0) {
    throw new ValidationError("schema.fields must be a non-empty array");
  }

  for (const field of schema.fields) {
    if (
      !field.name ||
      !field.label ||
      typeof field.required !== "boolean" ||
      !field.type
    ) {
      throw new ValidationError(
        "Each field must have name, label, type, required",
      );
    }
    const allowed: FormFieldType[] = [
      "text",
      "textarea",
      "date",
      "number",
      "boolean",
      "select",
    ];
    if (!allowed.includes(field.type)) {
      throw new ValidationError(`Unsupported field type: ${field.type}`);
    }
    if (
      field.type === "select" &&
      (!Array.isArray(field.options) || field.options.length === 0)
    ) {
      throw new ValidationError(
        "select fields must include non-empty options array",
      );
    }
  }
}

function parseDate(value?: string): Date | undefined {
  if (!value) return undefined;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new ValidationError("Invalid date");
  }
  return date;
}

export async function createTemplate(
  user: JwtPayload,
  input: CreateTemplateInput,
) {
  validateSchema(input.schema);
  const schemaWithVersion = {
    ...input.schema,
    version: input.schema.version ?? 1,
  };

  return prisma.formTemplate.create({
    data: {
      formType: input.formType,
      name: input.name,
      targetEntity: input.targetEntity ?? "student",
      createdBy: user.userId,
      schema: schemaWithVersion as Prisma.InputJsonValue,
    },
  });
}

export async function listTemplates(
  formType?: string,
  options?: { includeInactive?: boolean },
) {
  return prisma.formTemplate.findMany({
    where: {
      ...(options?.includeInactive ? {} : { isActive: true }),
      ...(formType ? { formType } : {}),
    },
    orderBy: { createdAt: "desc" },
  });
}

export async function getTemplateById(templateId: string) {
  const template = await prisma.formTemplate.findUnique({
    where: { id: templateId },
  });
  if (!template) throw new NotFoundError("Form template");
  return template;
}

export async function updateTemplate(
  templateId: string,
  input: CreateTemplateInput,
) {
  const existing = await getTemplateById(templateId);
  validateSchema(input.schema);
  const prevSchema = existing.schema as unknown as FormSchema;
  const schemaWithVersion = {
    ...input.schema,
    version: input.schema.version ?? (prevSchema?.version ?? 1) + 1,
  };

  return prisma.formTemplate.update({
    where: { id: templateId },
    data: {
      formType: input.formType,
      name: input.name,
      schema: schemaWithVersion as Prisma.InputJsonValue,
    },
  });
}

export async function softDeleteTemplate(templateId: string) {
  await getTemplateById(templateId);
  return prisma.formTemplate.update({
    where: { id: templateId },
    data: { isActive: false },
  });
}

export async function submitForm(user: JwtPayload, input: SubmitFormInput) {
  ensureCenterAccess(user, input.centerId);

  const [template, student] = await Promise.all([
    prisma.formTemplate.findUnique({ where: { id: input.templateId } }),
    prisma.student.findUnique({
      where: { id: input.studentId },
      select: { id: true, centerId: true, fullName: true },
    }),
  ]);

  if (!template || !template.isActive) {
    throw new NotFoundError("Form template");
  }
  if (!student) {
    throw new NotFoundError("Student");
  }
  if (student.centerId !== input.centerId) {
    throw new ValidationError("studentId does not belong to centerId");
  }

  const schema = template.schema as unknown as FormSchema;
  validateSchema(schema);
  for (const field of schema.fields) {
    if (field.required) {
      const value = input.data[field.name];
      if (value === undefined || value === null || value === "") {
        throw new ValidationError(`Missing required field: ${field.name}`);
      }
    }
  }

  return prisma.formSubmission.create({
    data: {
      templateId: input.templateId,
      studentId: input.studentId,
      centerId: input.centerId,
      submittedBy: user.userId,
      data: input.data as Prisma.InputJsonValue,
    },
    include: {
      template: { select: { id: true, name: true, formType: true } },
      student: { select: { id: true, fullName: true } },
    },
  });
}

export async function listSubmissions(
  user: JwtPayload,
  query: {
    templateId?: string;
    studentId?: string;
    centerId?: string;
    from?: string;
    to?: string;
    page?: number;
    limit?: number;
  },
) {
  const page = Math.max(query.page ?? 1, 1);
  const limit = Math.max(query.limit ?? 50, 1);
  const skip = (page - 1) * limit;
  const from = parseDate(query.from);
  const to = parseDate(query.to);

  const centerFilter =
    user.role === "super_admin"
      ? query.centerId
      : query.centerId
        ? user.centerIds.includes(query.centerId)
          ? query.centerId
          : { in: [] as string[] }
        : { in: user.centerIds };

  const where = {
    centerId: centerFilter,
    ...(query.templateId ? { templateId: query.templateId } : {}),
    ...(query.studentId ? { studentId: query.studentId } : {}),
    ...(from || to
      ? {
        submittedAt: {
          ...(from ? { gte: from } : {}),
          ...(to ? { lte: to } : {}),
        },
      }
      : {}),
  };

  const [submissions, total] = await Promise.all([
    prisma.formSubmission.findMany({
      where,
      skip,
      take: limit,
      orderBy: { submittedAt: "desc" },
      include: {
        template: { select: { name: true, formType: true } },
        student: { select: { fullName: true } },
      },
    }),
    prisma.formSubmission.count({ where }),
  ]);

  return {
    submissions,
    total,
    page,
    totalPages: Math.ceil(total / limit),
  };
}

export async function getSubmissionById(
  user: JwtPayload,
  submissionId: string,
) {
  const submission = await prisma.formSubmission.findUnique({
    where: { id: submissionId },
    include: {
      template: true,
      student: true,
    },
  });
  if (!submission) throw new NotFoundError("Form submission");
  ensureCenterAccess(user, submission.centerId);
  return submission;
}

export async function deleteSubmission(submissionId: string) {
  await prisma.formSubmission.findUniqueOrThrow({
    where: { id: submissionId },
  });
  await prisma.formSubmission.delete({ where: { id: submissionId } });
  return { success: true };
}

export async function getStudentSubmissions(
  user: JwtPayload,
  studentId: string,
) {
  const student = await prisma.student.findUnique({ where: { id: studentId } });
  if (!student) throw new NotFoundError("Student");
  ensureCenterAccess(user, student.centerId);

  const submissions = await prisma.formSubmission.findMany({
    where: { studentId },
    include: {
      template: { select: { id: true, name: true, formType: true } },
    },
    orderBy: { submittedAt: "desc" },
  });

  const grouped = submissions.reduce<Record<string, typeof submissions>>(
    (acc, row) => {
      const key = row.template.formType;
      if (!acc[key]) acc[key] = [];
      acc[key].push(row);
      return acc;
    },
    {},
  );

  return { studentId, groupedByFormType: grouped };
}

export async function getPendingSubmissions(
  user: JwtPayload,
  query: { templateId?: string; centerId?: string },
) {
  if (!query.templateId) {
    throw new ValidationError("templateId is required");
  }

  const centerId =
    query.centerId ??
    (user.role === "super_admin"
      ? undefined
      : user.centerIds.length === 1
        ? user.centerIds[0]
        : undefined);
  if (!centerId && user.role !== "super_admin") {
    throw new ValidationError("centerId is required for multi-center users");
  }
  if (centerId) ensureCenterAccess(user, centerId);

  const studentWhere = {
    ...(centerId
      ? { centerId }
      : user.role === "super_admin"
        ? {}
        : { centerId: { in: user.centerIds } }),
    isActive: true,
  };

  const students = await prisma.student.findMany({
    where: studentWhere,
    select: { id: true, fullName: true, centerId: true, programId: true },
    orderBy: { fullName: "asc" },
  });

  const existing = await prisma.formSubmission.findMany({
    where: {
      templateId: query.templateId,
      studentId: { in: students.map((s) => s.id) },
    },
    select: { studentId: true },
  });
  const submittedIds = new Set(existing.map((row) => row.studentId));

  return students.filter((student) => !submittedIds.has(student.id));
}

