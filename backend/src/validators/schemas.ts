import { z } from "zod";

const uuid = z.string().uuid();
const optionalDateString = z
  .string()
  .optional()
  .refine((s) => !s || !Number.isNaN(Date.parse(s)), "Invalid date");

const phone10Digit = z
  .string()
  .optional()
  .refine(
    (val) => !val || /^\d{10}$/.test(val),
    "Guardian phone must be exactly 10 digits"
  );

export const createStudentSchema = z.object({
  fullName: z.string().min(2),
  centerId: uuid,
  programId: uuid,
  dob: optionalDateString,
  gender: z.enum(["male", "female", "other"]).optional(),
  guardianName: z.string().optional(),
  guardianPhone: phone10Digit,
});

export const updateStudentSchema = z.object({
  fullName: z.string().min(2).optional(),
  dob: optionalDateString,
  gender: z.enum(["male", "female", "other"]).optional(),
  guardianName: z.string().optional(),
  guardianPhone: phone10Digit,
});

export const createAttendanceSessionSchema = z.object({
  centerId: uuid,
  programId: uuid,
  sessionDate: z.string().min(1),
  activityId: uuid.optional(),
});

export const updateAttendanceSessionRecordsSchema = z.object({
  records: z
    .array(
      z.object({
        recordId: uuid,
        status: z.enum(["pending", "present", "absent", "late", "excused"]),
        remarks: z.string().optional(),
      }),
    )
    .min(1),
});

export const createExamSchema = z.object({
  centerIds: z.array(uuid).min(1),
  programId: uuid,
  examType: z.string().min(1),
  academicYearId: z.string().min(1),
  examDate: optionalDateString,
  name: z.string().optional(),
});

const formFieldSchema = z.object({
  name: z.string().min(1),
  label: z.string().min(1),
  type: z.enum(["text", "textarea", "date", "number", "boolean", "select"]),
  required: z.boolean(),
  options: z.array(z.string()).optional(),
});

export const formSchemaJsonSchema = z.object({
  fields: z.array(formFieldSchema).min(1),
  version: z.number().int().positive().optional(),
});

export const createFormTemplateSchema = z.object({
  formType: z.string().min(1),
  name: z.string().min(1),
  schema: formSchemaJsonSchema,
});

export const updateFormTemplateSchema = createFormTemplateSchema;

export const submitFormSchema = z.object({
  templateId: uuid,
  studentId: uuid,
  centerId: uuid,
  data: z.record(z.string(), z.unknown()),
});

export const upsertExamScoresSchema = z.object({
  scores: z
    .array(
      z.object({
        studentId: uuid,
        subjectId: uuid.optional(),
        subject: z.string().min(1).optional(),
        marks: z.number().nullable().optional(),
        isAbsent: z.boolean().optional(),
        maxMarks: z.number().positive().optional(),
        remarks: z.string().optional(),
      }),
    )
    .min(1),
});

export const createSkillSchema = z.object({
  skillId: uuid,
  level: z.number().int().min(1).max(5),
  remarks: z.string().optional(),
});

export const createCareerSchema = z.object({
  careerGoal: z.string().min(2),
  industry: z.string().min(2),
  milestones: z.array(z.string()).optional(),
  notes: z.string().optional(),
});

export const createCenterSchema = z.object({
  name: z.string().min(2, "Center name must be at least 2 characters"),
  location: z.string().optional(),
});

export const createProgramSchema = z.object({
  code: z.string().min(1, "Program code is required"),
  name: z.string().min(2, "Program name must be at least 2 characters"),
  ageMin: z.number().int().min(0).optional(),
  ageMax: z.number().int().min(0).optional(),
  description: z.string().optional(),
});
