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

const preprocessEmptyToNull = <T extends z.ZodTypeAny>(schema: T) =>
  z.preprocess((v) => (v === "" ? null : v), schema.nullable().optional());

const preprocessEmptyToUndefined = <T extends z.ZodTypeAny>(schema: T) =>
  z.preprocess((v) => (v === "" || v === null ? undefined : v), schema.optional());

export const createStudentSchema = z.object({
  fullName: z.string().trim().min(2),
  rollNumber: preprocessEmptyToNull(z.string().trim().min(1)),
  centerId: uuid,
  programId: uuid,
  academicYearId: preprocessEmptyToNull(uuid),
  dob: preprocessEmptyToNull(optionalDateString),
  gender: preprocessEmptyToNull(z.enum(["male", "female", "other"])),
  guardianName: preprocessEmptyToNull(z.string().trim().min(1)),
  guardianPhone: preprocessEmptyToNull(phone10Digit),
  stream: preprocessEmptyToNull(z.string().trim().min(1)),
  post12thChoice: preprocessEmptyToNull(z.string().trim().min(1)),
  collegeName: preprocessEmptyToNull(z.string().trim().min(1)),
  educationDiscontinued: z.boolean().optional(),
  enrollmentDate: preprocessEmptyToUndefined(optionalDateString),
});

export const updateStudentSchema = z.object({
  fullName: z.string().trim().min(2).optional(),
  rollNumber: preprocessEmptyToNull(z.string().trim().min(1)),
  academicYearId: preprocessEmptyToNull(uuid),
  dob: preprocessEmptyToNull(optionalDateString),
  gender: preprocessEmptyToNull(z.enum(["male", "female", "other"])),
  guardianName: preprocessEmptyToNull(z.string().trim().min(1)),
  guardianPhone: preprocessEmptyToNull(phone10Digit),
  stream: preprocessEmptyToNull(z.string().trim().min(1)),
  post12thChoice: preprocessEmptyToNull(z.string().trim().min(1)),
  collegeName: preprocessEmptyToNull(z.string().trim().min(1)),
  educationDiscontinued: z.boolean().optional(),
  enrollmentDate: preprocessEmptyToUndefined(optionalDateString),
  isActive: z.boolean().optional(),
});

export const requestTransferSchema = z.object({
  studentIds: z.array(uuid).min(1),
  reason: preprocessEmptyToNull(z.string().trim().min(1)),
});

export const completeTransferSchema = z.object({
  studentIds: z.array(uuid).min(1),
  newTeacherId: uuid,
  newCenterId: uuid,
  reason: preprocessEmptyToNull(z.string().trim().min(1)),
});

export const addFeePaymentSchema = z.object({
  amount: z.coerce.number().positive("Payment amount must be greater than 0"),
  paymentDate: preprocessEmptyToNull(optionalDateString),
  method: z.string().trim().min(1).optional(),
  reference: preprocessEmptyToNull(z.string().trim().min(1)),
  notes: preprocessEmptyToNull(z.string().trim().min(1)),
});

export const updateStudentFeesSchema = z.object({
  totalFees: z.coerce.number().min(0, "Total fees cannot be negative"),
});

export const createAttendanceSessionSchema = z.object({
  centerId: uuid,
  programId: uuid,
  sessionDate: z.string().min(1),
  activityId: uuid.optional(),
  batchId: preprocessEmptyToUndefined(uuid),
});

export const updateAttendanceSessionRecordsSchema = z.object({
  records: z
    .array(
      z.object({
        recordId: uuid,
        status: z.enum(["pending", "present", "absent", "late", "excused"]),
        remarks: z.string().trim().max(500).nullable().optional(),
      }),
    )
    .min(1),
});

export const createExamSchema = z.object({
  centerIds: z.array(uuid).min(1),
  programId: uuid,
  examType: z.string().trim().min(1),
  academicYearId: z.string().trim().min(1),
  examDate: preprocessEmptyToUndefined(optionalDateString),
  name: z.string().trim().optional(),
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
        subject: z.string().trim().min(1).optional(),
        marks: z.number().min(0).nullable().optional(),
        isAbsent: z.boolean().optional(),
        maxMarks: z.number().positive().max(1000).optional(),
        remarks: z.string().optional(),
      }),
    )
    .min(1),
});

export const createSkillSchema = z.object({
  skillId: uuid,
  level: z.coerce.number().int().min(1, "Level must be at least 1").max(100),
  remarks: preprocessEmptyToNull(z.string().trim().min(1)),
  assessedOn: preprocessEmptyToUndefined(optionalDateString),
});

export const updateSkillSchema = z.object({
  skillId: uuid.optional(),
  level: z.coerce.number().int().min(1, "Level must be at least 1").max(100).optional(),
  remarks: preprocessEmptyToNull(z.string().trim().min(1)),
  assessedOn: preprocessEmptyToUndefined(optionalDateString),
});

export const bulkUpsertSkillLogsSchema = z.object({
  centerId: uuid,
  programId: uuid.optional(),
  assessedOn: preprocessEmptyToUndefined(optionalDateString),
  entries: z
    .array(
      z.object({
        studentId: uuid,
        skillId: uuid,
        level: z.coerce.number().int().min(1, "Level must be at least 1").max(100),
        remarks: preprocessEmptyToNull(z.string().trim().min(1)),
      }),
    )
    .min(1, "At least one skill entry is required")
    .max(500, "Maximum 500 skill entries per batch"),
});

export const createCareerSchema = z.object({
  careerGoal: z.string().min(2),
  industry: z.string().min(2),
  milestones: z.array(z.string()).optional(),
  notes: z.string().optional(),
});

export const createCenterSchema = z.object({
  name: z.string().trim().min(2, "Center name must be at least 2 characters"),
  location: z.string().trim().optional(),
});

export const updateCenterSchema = z.object({
  name: z.string().trim().min(2, "Center name must be at least 2 characters").optional(),
  location: preprocessEmptyToNull(z.string().trim()),
  isActive: z.boolean().optional(),
});

export const createProgramSchema = z
  .object({
    code: z.string().trim().min(1, "Program code is required"),
    name: z.string().trim().min(2, "Program name must be at least 2 characters"),
    ageMin: z.number().int().min(0).optional(),
    ageMax: z.number().int().min(0).optional(),
    description: z.string().trim().optional(),
  })
  .refine(
    (d) => d.ageMin === undefined || d.ageMax === undefined || d.ageMin <= d.ageMax,
    "Minimum age cannot exceed maximum age",
  );

export const updateProgramSchema = z
  .object({
    name: z.string().trim().min(2, "Program name must be at least 2 characters").optional(),
    ageMin: z.number().int().min(0).nullable().optional(),
    ageMax: z.number().int().min(0).nullable().optional(),
    description: z.string().trim().nullable().optional(),
    isActive: z.boolean().optional(),
  })
  .refine(
    (d) =>
      d.ageMin === undefined ||
      d.ageMax === undefined ||
      d.ageMin === null ||
      d.ageMax === null ||
      d.ageMin <= d.ageMax,
    "Minimum age cannot exceed maximum age",
  );

export const activityStatusEnum = z.enum(["planned", "ongoing", "completed", "cancelled"]);
export const activityTypeEnum = z.enum(["class", "game", "visit", "camp", "exam", "general"]);

export const createActivitySchema = z.object({
  centerIds: z.array(uuid).min(1),
  programId: preprocessEmptyToUndefined(uuid),
  name: z.string().trim().min(1),
  description: preprocessEmptyToNull(z.string().trim().min(1)),
  volunteers: z.array(z.string().trim().min(1)).optional(),
  activityType: activityTypeEnum.optional(),
  status: activityStatusEnum.optional(),
  startDate: preprocessEmptyToUndefined(optionalDateString),
  endDate: preprocessEmptyToUndefined(optionalDateString),
});

export const updateActivitySchema = z.object({
  programId: preprocessEmptyToNull(uuid),
  name: z.string().trim().min(1).optional(),
  description: preprocessEmptyToNull(z.string().trim().min(1)),
  volunteers: z.array(z.string().trim().min(1)).optional(),
  activityType: activityTypeEnum.optional(),
  status: activityStatusEnum.optional(),
  completionNotes: preprocessEmptyToNull(z.string().trim().min(1)),
  startDate: preprocessEmptyToNull(optionalDateString),
  endDate: preprocessEmptyToNull(optionalDateString),
});

export const assignVolunteerSchema = z.object({
  userId: uuid,
  validFrom: z
    .string()
    .min(1)
    .refine((s) => !Number.isNaN(Date.parse(s)), "Invalid validFrom date"),
  validUntil: preprocessEmptyToNull(optionalDateString),
});

export const assignCenterProgramSchema = z.object({
  programId: uuid,
});

export const assignCenterUserSchema = z
  .object({
    userId: uuid,
    validFrom: preprocessEmptyToUndefined(optionalDateString),
    validUntil: preprocessEmptyToNull(optionalDateString),
  })
  .refine(
    (d) =>
      !d.validFrom ||
      !d.validUntil ||
      Date.parse(d.validUntil) >= Date.parse(d.validFrom),
    "validUntil cannot be earlier than validFrom",
  );

export const createProgramSubjectSchema = z.object({
  name: z.string().trim().min(1, "Subject name is required").max(120),
  maxMarks: z.coerce
    .number()
    .positive("Max marks must be greater than 0")
    .max(9999.99, "Max marks cannot exceed 9999.99")
    .optional(),
});

export const updateProgramSubjectSchema = z.object({
  name: z.string().trim().min(1, "Subject name cannot be empty").max(120).optional(),
  maxMarks: z.coerce
    .number()
    .positive("Max marks must be greater than 0")
    .max(9999.99, "Max marks cannot exceed 9999.99")
    .optional(),
  isActive: z.boolean().optional(),
});

export const createSkillDefinitionSchema = z.object({
  name: z.string().trim().min(1, "Skill name is required").max(120),
  description: preprocessEmptyToNull(z.string().trim().max(500)),
  maxLevel: z.coerce.number().int().min(1).max(20).optional(),
});

export const updateSkillDefinitionSchema = z.object({
  name: z.string().trim().min(1, "Skill name cannot be empty").max(120).optional(),
  description: preprocessEmptyToNull(z.string().trim().max(500)),
  maxLevel: z.coerce.number().int().min(1).max(20).optional(),
  isActive: z.boolean().optional(),
});

export const bulkImportStudentRowSchema = z.object({
  fullName: z.string().trim().min(2, "Full name must be at least 2 characters"),
  rollNumber: preprocessEmptyToNull(z.string().trim().min(1)),
  dob: preprocessEmptyToNull(optionalDateString),
  gender: preprocessEmptyToNull(z.enum(["male", "female", "other"])),
  guardianName: preprocessEmptyToNull(z.string().trim().min(1)),
  guardianPhone: preprocessEmptyToNull(phone10Digit),
  address: preprocessEmptyToNull(z.string().trim().min(1)),
  stream: preprocessEmptyToNull(z.string().trim().min(1)),
  post12thChoice: preprocessEmptyToNull(z.string().trim().min(1)),
  collegeName: preprocessEmptyToNull(z.string().trim().min(1)),
  educationDiscontinued: z.boolean().optional(),
  enrollmentDate: preprocessEmptyToUndefined(optionalDateString),
  totalFees: preprocessEmptyToUndefined(z.coerce.number().nonnegative().max(10000000)),
});

export const bulkImportStudentsSchema = z.object({
  centerId: uuid,
  programId: uuid,
  academicYearId: preprocessEmptyToNull(uuid),
  students: z
    .array(bulkImportStudentRowSchema)
    .min(1, "At least one student row is required")
    .max(200, "Maximum 200 students can be imported in one batch"),
});

export const linkGuardianSchema = z
  .object({
    parentUserId: preprocessEmptyToUndefined(uuid),
    email: preprocessEmptyToUndefined(z.string().trim().email("Valid parent email is required")),
  })
  .refine(
    (d) => Boolean(d.parentUserId || d.email),
    "Either parentUserId or parent email is required",
  );

export const createBatchSchema = z
  .object({
    centerId: uuid,
    programId: preprocessEmptyToUndefined(uuid),
    activityId: preprocessEmptyToUndefined(uuid),
    name: z.string().trim().min(1, "Batch name is required").max(120),
    teacherId: preprocessEmptyToNull(uuid),
    maxStudents: preprocessEmptyToNull(z.coerce.number().int().min(1).max(500)),
  })
  .refine(
    (d) => Boolean(d.activityId || d.programId),
    "Either activityId or programId is required",
  );

export const updateBatchSchema = z.object({
  name: z.string().trim().min(1, "Batch name cannot be empty").max(120).optional(),
  teacherId: preprocessEmptyToNull(uuid),
  maxStudents: preprocessEmptyToNull(z.coerce.number().int().min(1).max(500)),
});

export const enrollBatchStudentsSchema = z.object({
  studentIds: z.array(uuid).min(1, "Select at least one student").max(200),
});
