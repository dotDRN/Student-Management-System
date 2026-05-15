import { Request, Response, NextFunction } from "express";
import * as studentService from '@/services/student.service.js';

/* ─────────────────────────────────────────
   STUDENTS
───────────────────────────────────────── */

export const createStudent = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<Response | void> => {
  try {
    const student = await studentService.createStudent(req.user, req.body);
    return res.status(201).json({ success: true, data: student });
  } catch (err) {
    console.error("Create Student Error:", err);
    next(err);
  }
};

export const getAllStudents = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<Response | void> => {
  try {
    const { page, limit, search, centerId, programId, isActive, sortOrder } = req.query;

    const result = await studentService.getAllStudents(req.user, {
      page: Number(page) || 1,
      limit: Number(limit) || 50,
      search: search as string | undefined,
      centerId: centerId as string | undefined,
      programId: programId as string | undefined,
      sortOrder: sortOrder as string | undefined,
      isActive:
        typeof isActive === "string"
          ? isActive.toLowerCase() === "true"
          : undefined,
    });

    return res.status(200).json(result);
  } catch (err) {
    console.error("Get All Students Error:", err);
    next(err);
  }
};

export const getStudentById = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<Response | void> => {
  try {
    const student = await studentService.getStudentById(
      req.user,
      (req.params.id as string) as string
    );
    return res.status(200).json(student);
  } catch (err) {
    console.error("Get Student By ID Error:", err);
    next(err);
  }
};

export const updateStudent = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<Response | void> => {
  try {
    const student = await studentService.updateStudent(
      req.user,
      (req.params.id as string),
      req.body
    );
    return res.status(200).json(student);
  } catch (err) {
    console.error("Update Student Error:", err);
    next(err);
  }
};

export const deleteStudent = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<Response | void> => {
  try {
    const result = await studentService.deleteStudent(
      req.user,
      (req.params.id as string)
    );
    return res.status(200).json({ success: true, ...result });
  } catch (err) {
    console.error("Delete Student Error:", err);
    next(err);
  }
};

export const filterStudents = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<Response | void> => {
  try {
    const result = await studentService.filterStudents(
      req.user,
      req.query
    );
    return res.status(200).json(result);
  } catch (err) {
    console.error("Filter Students Error:", err);
    next(err);
  }
};

export const getStudentSummary = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<Response | void> => {
  try {
    const summary = await studentService.getStudentSummary(
      req.user,
      (req.params.id as string)
    );
    return res.status(200).json(summary);
  } catch (err) {
    console.error("Student Summary Error:", err);
    next(err);
  }
};

export const getStudentProfile = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<Response | void> => {
  try {
    const profile = await studentService.getStudentProfile(
      req.user,
      (req.params.id as string)
    );
    return res.status(200).json(profile);
  } catch (err) {
    console.error("Student Profile Error:", err);
    next(err);
  }
};

/* ─────────────────────────────────────────
   ATTENDANCE
───────────────────────────────────────── */

export const addAttendance = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<Response | void> => {
  try {
    const record = await studentService.addAttendance(
      req.user,
      (req.params.studentId as string),
      req.body
    );
    return res.status(201).json({ success: true, data: record });
  } catch (err) {
    console.error("Add Attendance Error:", err);
    next(err);
  }
};

export const getAttendanceByStudent = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<Response | void> => {
  try {
    const records = await studentService.getAttendanceByStudent(
      req.user,
      (req.params.studentId as string)
    );
    return res.status(200).json({ success: true, data: records });
  } catch (err) {
    console.error("Get Attendance Error:", err);
    next(err);
  }
};

export const updateAttendance = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<Response | void> => {
  try {
    const record = await studentService.updateAttendance(
      (req.params.id as string),
      req.body
    );
    return res.status(200).json({ success: true, data: record });
  } catch (err) {
    console.error("Update Attendance Error:", err);
    next(err);
  }
};

/* ─────────────────────────────────────────
   SKILLS
───────────────────────────────────────── */

export const addSkill = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<Response | void> => {
  try {
    const record = await studentService.addSkill(
      req.user,
      (req.params.studentId as string),
      req.body
    );
    return res.status(201).json({ success: true, data: record });
  } catch (err) {
    console.error("Add Skill Error:", err);
    next(err);
  }
};

export const getSkillsByStudent = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<Response | void> => {
  try {
    const records = await studentService.getSkillsByStudent(
      req.user,
      (req.params.studentId as string)
    );
    return res.status(200).json({ success: true, data: records });
  } catch (err) {
    console.error("Get Skills Error:", err);
    next(err);
  }
};

export const updateSkill = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<Response | void> => {
  try {
    const record = await studentService.updateSkill(
      (req.params.id as string),
      req.body
    );
    return res.status(200).json({ success: true, data: record });
  } catch (err) {
    console.error("Update Skill Error:", err);
    next(err);
  }
};

export const deleteSkill = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<Response | void> => {
  try {
    const record = await studentService.deleteSkill(req.params.id as string);
    return res.status(200).json({ success: true, data: record });
  } catch (err) {
    console.error("Delete Skill Error:", err);
    next(err);
  }
};

/* ─────────────────────────────────────────
   CAREERS
───────────────────────────────────────── */

export const addCareer = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<Response | void> => {
  try {
    const record = await studentService.addCareer(
      req.user,
      (req.params.studentId as string),
      req.body
    );
    return res.status(201).json({ success: true, data: record });
  } catch (err) {
    console.error("Add Career Error:", err);
    next(err);
  }
};

export const getCareersByStudent = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<Response | void> => {
  try {
    const records = await studentService.getCareersByStudent(
      req.user,
      (req.params.studentId as string)
    );
    return res.status(200).json({ success: true, data: records });
  } catch (err) {
    console.error("Get Careers Error:", err);
    next(err);
  }
};

export const updateCareer = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<Response | void> => {
  try {
    const record = await studentService.updateCareer(
      (req.params.id as string),
      req.body
    );
    return res.status(200).json({ success: true, data: record });
  } catch (err) {
    console.error("Update Career Error:", err);
    next(err);
  }
};

export const deleteCareer = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<Response | void> => {
  try {
    const record = await studentService.deleteCareer(req.params.id as string);
    return res.status(200).json({ success: true, data: record });
  } catch (err) {
    console.error("Delete Career Error:", err);
    next(err);
  }
};

/* ─────────────────────────────────────────
   DASHBOARD
───────────────────────────────────────── */

export const getDashboardStats = async (
  _req: Request,
  res: Response,
  next: NextFunction
): Promise<Response | void> => {
  try {
    const stats = await studentService.getDashboardStats();
    return res.status(200).json({ success: true, data: stats });
  } catch (err) {
    console.error("Dashboard Stats Error:", err);
    next(err);
  }
};

/* ─────────────────────────────────────────
   TRANSFER WORKFLOW
───────────────────────────────────────── */

export const requestTransfer = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<Response | void> => {
  try {
    const { studentIds } = req.body;
    const result = await studentService.requestTransfer(req.user, studentIds);
    return res.status(200).json({ success: true, ...result });
  } catch (err) {
    console.error("Request Transfer Error:", err);
    next(err);
  }
};

export const getTransferRequests = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<Response | void> => {
  try {
    const students = await studentService.getTransferRequests(req.user);
    return res.status(200).json({ success: true, data: students });
  } catch (err) {
    console.error("Get Transfer Requests Error:", err);
    next(err);
  }
};

export const completeTransfer = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<Response | void> => {
  try {
    const { studentIds, newTeacherId, newCenterId } = req.body;
    const result = await studentService.completeTransfer(
      req.user,
      studentIds,
      newTeacherId,
      newCenterId
    );
    return res.status(200).json({ success: true, ...result });
  } catch (err) {
    console.error("Complete Transfer Error:", err);
    next(err);
  }
};

/* ─────────────────────────────────────────
   FEE MANAGEMENT
───────────────────────────────────────── */

export const addFeePayment = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<Response | void> => {
  try {
    const { amount, notes } = req.body;
    const payment = await studentService.addFeePayment(
      req.user,
      req.params.studentId as string,
      Number(amount),
      notes
    );
    return res.status(201).json({ success: true, data: payment });
  } catch (err) {
    console.error("Add Fee Payment Error:", err);
    next(err);
  }
};

export const getFeePayments = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<Response | void> => {
  try {
    const payments = await studentService.getFeePayments(
      req.user,
      req.params.studentId as string
    );
    return res.status(200).json({ success: true, data: payments });
  } catch (err) {
    console.error("Get Fee Payments Error:", err);
    next(err);
  }
};

export const updateStudentFees = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<Response | void> => {
  try {
    const student = await studentService.updateStudentFees(
      req.user,
      req.params.studentId as string,
      req.body
    );
    return res.status(200).json({ success: true, data: student });
  } catch (err) {
    console.error("Update Student Fees Error:", err);
    next(err);
  }
};