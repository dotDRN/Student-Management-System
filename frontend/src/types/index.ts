export type UserRole = 'super_admin' | 'center_admin' | 'supervisor' | 'teacher' | 'staff' | 'volunteer' | 'student' | 'parent' | 'shareholder' | 'tech_admin';
export type Gender = 'male' | 'female' | 'other';
export type AttendanceStatus = 'present' | 'absent' | 'late';
export type ExamType = string;

export interface Center {
  id: string;
  name: string;
  location?: string;
  isActive: boolean;
  createdAt: string | Date;
}

export interface Program {
  id: string;
  code: string;
  name: string;
  ageMin?: number;
  ageMax?: number;
  description?: string;
  isActive: boolean;
}



export type TransferStatus = 'active' | 'pending_transfer' | 'transferred';

export interface Student {
  id: string;
  centerId: string;
  programId: string;
  academicYearId?: string | null;
  createdById?: string;
  fullName: string;
  rollNumber?: string | null;
  dob?: string | Date | null;
  gender?: Gender | null;
  guardianName?: string | null;
  guardianPhone?: string | null;
  stream?: string | null;
  post12thChoice?: string | null;
  collegeName?: string | null;
  educationDiscontinued?: boolean;
  enrollmentDate: string | Date;
  isActive: boolean;
  transferStatus?: TransferStatus;
  totalFees?: number | null;
  feesPaid?: number;
  isFullyPaid?: boolean;
  createdAt: string | Date;
  center?: Center;
  program?: Program;
  createdByUser?: { id: string; fullName: string } | null;
  batchEnrollments?: Array<{
    id?: string;
    batchId: string;
    enrolledOn?: string;
    batch?: { id: string; name: string };
  }>;
}

export interface User {
  id: string;
  email: string;
  fullName: string;
  phone?: string;
  role: UserRole;
  isActive: boolean;
  createdAt: string | Date;
}

export interface AttendanceSession {
  id: string;
  centerId: string;
  programId: string;
  activityId?: string;
  sessionDate: string | Date;
  createdAt: string | Date;
}

export interface AttendanceRecord {
  id: string;
  sessionId: string;
  studentId: string;
  centerId: string;
  status: AttendanceStatus;
  remarks?: string;
}

export interface Exam {
  id: string;
  centerId: string;
  programId: string;
  examType: ExamType;
  academicYear: string;
  examDate?: string | Date;
}

export interface ExamScore {
  id: string;
  examId: string;
  studentId: string;
  centerId: string;
  subject: string;
  marks?: number;
  maxMarks: number;
  remarks?: string;
}

export interface FormTemplate {
  id: string;
  formType: string;
  name: string;
  schema: FormSchema;
  isActive: boolean;
  createdAt: string | Date;
}

export interface FormSchema {
  fields: FormField[];
}

export type FormFieldType = 'text' | 'number' | 'dropdown' | 'checkbox' | 'date' | 'textarea';

export interface FormField {
  id: string;
  type: FormFieldType;
  label: string;
  required: boolean;
  placeholder?: string;
  options?: string[];
}

export interface FormSubmission {
  id: string;
  templateId: string;
  studentId: string;
  centerId: string;
  submittedBy?: string;
  data: Record<string, unknown>;
  createdAt: string | Date;
}

export interface ApiResponse<T> {
  data: T;
  message?: string;
}

export interface ApiError {
  message: string;
  errors?: Record<string, string[]>;
}

export interface AuthUser extends User {
  allowedCenterIds: string[];
  centerIds?: string[];
}

export interface LoginPayload {
  email: string;
  password: string;
}

export interface AuthResponse {
  token: string;
  user: AuthUser;
}

export interface CenterSummary {
  id: string;
  name: string;
  location?: string | null;
}

export interface ProgramSummary {
  id: string;
  name: string;
  code?: string;
  description?: string;
  ageMin?: number;
  ageMax?: number;
  studentCount?: number;
}

export interface SkillDefinition {
  id: string;
  programId: string;
  name: string;
  description?: string | null;
  maxLevel: number;
  isActive: boolean;
  program?: { id: string; name: string; code?: string };
}

export interface SkillRecord {
  id: string;
  studentId: string;
  centerId?: string;
  skillId?: string;
  level?: number;
  assessedOn?: string | Date;
  remarks?: string | null;
  skill?: SkillDefinition;
  assessedByUser?: { id?: string; fullName: string } | null;
  skillName?: string;
  proficiencyLevel?: string;
  createdAt?: string | Date;
}

export interface CareerRecord {
  id: string;
  studentId: string;
  careerInterest?: string;
  careerGoal?: string;
  industry?: string;
  milestones?: string[];
  stage?: string;
  title?: string;
  description?: string;
  date?: string | Date;
  counselingNotes?: string;
  notes?: string;
  createdAt?: string | Date;
}

export interface StudentProfilePayload {
  student: Student;
  stats?: {
    attendancePct?: number;
    totalSessions?: number;
    presentCount?: number;
    avgExamPct?: number | null;
    skillScore?: number | null;
    careerEntriesCount?: number;
  };
  attendanceTrend?: { date: string; present: number }[];
  examComparison?: {
    subject: string;
    maxMarks?: number;
    baseline: number | null;
    baselineMarks?: number | null;
    baselineAbsent?: boolean;
    midline?: number | null;
    midlineMarks?: number | null;
    midlineAbsent?: boolean;
    endline: number | null;
    endlineMarks?: number | null;
    endlineAbsent?: boolean;
  }[];
  academicYearLabel?: string | null;
  formSubmissions?: {
    id: string;
    templateId?: string;
    createdAt?: string;
    template?: { id?: string; name?: string; formType?: string };
  }[];
  parents?: {
    id?: string;
    parentUserId?: string;
    parent?: { id?: string; fullName?: string; email?: string; phone?: string | null };
  }[];
  skillRadar?: { skill: string; score: number; maxLevel?: number }[];
  skills?: SkillRecord[];
  careerRecords?: CareerRecord[];
  attendance?: AttendanceRecord[];
  examScores?: ExamScore[];
}

export interface StudentCreatePayload {
  centerId: string;
  programId: string;
  fullName: string;
  rollNumber?: string | null;
  dob?: string | Date | null;
  gender?: Gender | null;
  guardianName?: string | null;
  guardianPhone?: string | null;
  enrollmentDate?: string | Date;
  isActive?: boolean;
  stream?: string | null;
  post12thChoice?: string | null;
  collegeName?: string | null;
  educationDiscontinued?: boolean;
}

export type StudentUpdatePayload = Partial<StudentCreatePayload>;

export interface StudentsListResult {
  students: Student[];
  total: number;
  page: number;
  totalPages: number;
  limit: number;
}

export interface AttendanceRecordPayload {
  sessionId?: string;
  studentId: string;
  centerId: string;
  status: AttendanceStatus;
  remarks?: string;
}

export interface ApiEnvelope<T> {
  data: T;
  message?: string;
  status?: string;
}

export interface FeePayment {
  id: string;
  studentId: string;
  amount: number;
  notes?: string | null;
  paidAt: string | Date;
  createdBy: string;
}
