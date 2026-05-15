export type UserRole = 'super_admin' | 'center_admin' | 'supervisor' | 'teacher' | 'staff' | 'volunteer' | 'student' | 'parent' | 'shareholder' | 'tech_admin';
export type Gender = 'male' | 'female' | 'other';
export type AttendanceStatus = 'present' | 'absent' | 'late';
export type ExamType = 'baseline' | 'endline';

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

export interface Student {
  id: string;
  centerId: string;
  programId: string;
  fullName: string;
  dob?: string | Date;
  gender?: Gender;
  guardianName?: string;
  guardianPhone?: string;
  enrollmentDate: string | Date;
  isActive: boolean;
  createdAt: string | Date;
  center?: Center;
  program?: Program;
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
  userId: string;
  allowedCenterIds: string[];
  centerIds: string[];
}

export interface LoginPayload {
  email: string;
  password: string;
}

export interface AuthResponse {
  token: string;
  user: AuthUser;
}
