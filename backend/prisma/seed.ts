import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import bcrypt from "bcryptjs";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log("🚀 Starting TOTAL DB REBUILD & EXTENSIVE SEEDING...");

  // 0. Cleanup Phase (CRITICAL ORDER FOR FOREIGN KEYS)
  console.log("🧹 Cleaning up old records in correct dependency order...");
  
  // Tier 1: Leaf nodes (No dependencies)

  await prisma.announcement.deleteMany();
  await prisma.formSubmission.deleteMany();
  await prisma.formAssignment.deleteMany();
  await prisma.equipmentLog.deleteMany();
  await prisma.studentSkillLog.deleteMany();
  await prisma.examScore.deleteMany();
  await prisma.attendanceRecord.deleteMany(); // Was missing!
  await prisma.studentTransfer.deleteMany();  // New!
  await prisma.feePayment.deleteMany();      // New!
  await prisma.userActivityAssignment.deleteMany();
  await prisma.userCenterAssignment.deleteMany();
  await prisma.parentStudent.deleteMany();    // Was missing!
  await prisma.batchEnrollment.deleteMany();  // Was missing!

  // Tier 2: Dependent nodes
  await prisma.attendanceSession.deleteMany(); // Was missing!
  await prisma.exam.deleteMany();
  await prisma.activity.deleteMany();
  await prisma.equipment.deleteMany();
  await prisma.formTemplate.deleteMany();
  await prisma.skillDefinition.deleteMany();
  await prisma.batch.deleteMany();            // Was missing!

  // Tier 3: Core entities
  await prisma.student.deleteMany();
  await prisma.user.deleteMany();
  await prisma.centerProgram.deleteMany();
  await prisma.center.deleteMany();
  await prisma.programSubject.deleteMany();
  await prisma.program.deleteMany();
  await prisma.academicYear.deleteMany();

  console.log("📅 Seeding Academic Years...");
  const ay2026 = await prisma.academicYear.create({
    data: { label: "2026-27", startDate: new Date(2026, 5, 1), endDate: new Date(2027, 4, 31), isCurrent: true }
  });
  const currentAY = ay2026;

  // 2. Programs & Subjects
  console.log("🎓 Seeding Programs & Subjects...");
  const programData = [
    { code: "SWAYAM", name: "Swayam Youth Development", ageMin: 15, ageMax: 18 },
    { code: "SHIKSHA", name: "Shiksha Early Learning", ageMin: 3, ageMax: 6 },
    { code: "KUSUM", name: "Kusum Women Empowerment", ageMin: 18, ageMax: 45 },
    { code: "UDAY", name: "Uday Vocational Training", ageMin: 18, ageMax: 30 },
  ];
  const pMap: any = {};
  for (const p of programData) {
    pMap[p.code] = await prisma.program.create({
      data: { ...p, isActive: true },
    });
    const subjects = ["English", "Mathematics", "Science", "Digital Literacy", "Social Skills"];
    for (const sName of subjects) {
      await prisma.programSubject.create({
        data: { programId: pMap[p.code].id, name: sName, maxMarks: 100 }
      });
    }
  }

  // 3. Centers
  console.log("🏢 Seeding 5 Centers...");
  const centerData = [
    { name: "Andheri Center", location: "Andheri West, Mumbai" },
    { name: "Dharavi Center", location: "Dharavi Main, Mumbai" },
    { name: "Govandi Center", location: "Govandi East, Mumbai" },
    { name: "Kurla Center", location: "Kurla West, Mumbai" },
    { name: "Malad Center", location: "Malad East, Mumbai" },
  ];
  const centers = [];
  for (const c of centerData) {
    const center = await prisma.center.create({ data: { name: c.name, location: c.location, isActive: true } });
    centers.push(center);
    await prisma.centerProgram.create({
      data: { centerId: center.id, programId: pMap.SWAYAM.id }
    });
    await prisma.centerProgram.create({
      data: { centerId: center.id, programId: pMap.SHIKSHA.id }
    });
  }

  // 4. Users
  console.log("👤 Seeding User Hierarchy...");
  const superPassword = await bcrypt.hash("SuperAdmin@123", 10);
  const staffPassword = await bcrypt.hash("Staff@123", 10);

  const superAdmin = await prisma.user.create({
    data: { email: 'super_admin@sparsha.org', fullName: 'System Super Admin', passwordHash: superPassword, role: 'super_admin', isActive: true },
  });

  const techAdmin = await prisma.user.create({
    data: { email: 'tech_admin@sparsha.org', fullName: 'Technical Support Admin', passwordHash: superPassword, role: 'tech_admin', createdBy: superAdmin.id, isActive: true },
  });

  const cAdmins = [];
  const teachers = [];
  for (let i = 0; i < centers.length; i++) {
    const ca = await prisma.user.create({
      data: { email: `center_admin_${i + 1}@sparsha.org`, fullName: `Admin - ${centers[i].name}`, passwordHash: staffPassword, role: 'center_admin', createdBy: superAdmin.id, isActive: true },
    });
    cAdmins.push(ca);
    await prisma.userCenterAssignment.create({
      data: { userId: ca.id, centerId: centers[i].id, createdBy: superAdmin.id, validFrom: new Date() }
    });

    for (let j = 0; j < 2; j++) {
      const t = await prisma.user.create({
        data: { email: `teacher_${i * 2 + j + 1}@sparsha.org`, fullName: `Teacher ${j + 1} - ${centers[i].name}`, passwordHash: staffPassword, role: 'teacher', createdBy: ca.id, isActive: true },
      });
      teachers.push(t);
      await prisma.userCenterAssignment.create({
        data: { userId: t.id, centerId: centers[i].id, createdBy: ca.id, validFrom: new Date() }
      });
    }

    // Add a staff member for each center
    const st = await prisma.user.create({
      data: { email: `staff_${i + 1}@sparsha.org`, fullName: `Staff - ${centers[i].name}`, passwordHash: staffPassword, role: 'staff', createdBy: ca.id, isActive: true },
    });
    await prisma.userCenterAssignment.create({
      data: { userId: st.id, centerId: centers[i].id, createdBy: ca.id, validFrom: new Date() }
    });
  }

  // 🔥 ADDING VANSH'S TEST USERS
  console.log("💎 Adding Vansh's Test Users...");
  const vanshAdmin = await prisma.user.create({
    data: { email: 'center_admin_1', fullName: 'Vansh - Center Head', passwordHash: superPassword, role: 'center_admin', createdBy: superAdmin.id, isActive: true },
  });
  await prisma.userCenterAssignment.create({
    data: { userId: vanshAdmin.id, centerId: centers[0].id, createdBy: superAdmin.id, validFrom: new Date() }
  });
  
  await prisma.user.create({
    data: { email: 'teacher_1', fullName: 'Teacher One (Vansh)', passwordHash: staffPassword, role: 'teacher', createdBy: vanshAdmin.id, isActive: true },
  });

  // 5. Students
  console.log("🧑‍🎓 Seeding 100 Students...");
  const students = [];
  for (let i = 0; i < 100; i++) {
    const center = centers[i % centers.length];
    const program = i % 2 === 0 ? pMap.SWAYAM : pMap.SHIKSHA;
    const s = await prisma.student.create({
      data: {
        fullName: `Student ${i + 1}`,
        centerId: center.id,
        programId: program.id,
        academicYearId: currentAY.id,
        dob: new Date(2005 + (i % 12), i % 12, (i % 28) + 1),
        gender: i % 2 === 0 ? "male" : "female",
        guardianName: `Parent of ${i + 1}`,
        guardianPhone: `98765432${i.toString().padStart(2, '0')}`,
        isActive: true,
        createdById: teachers[i % teachers.length].id
      }
    });
    students.push(s);
  }

  // 6. Activities
  console.log("🏀 Seeding Activities...");
  for (const center of centers) {
    await prisma.activity.create({
      data: {
        name: `Summer Camp - ${center.name}`,
        description: "Annual summer workshop for youth.",
        centerId: center.id,
        programId: pMap.SWAYAM.id,
        activityType: "general",
        startDate: new Date(2026, 4, 1),
        endDate: new Date(2026, 4, 15),
        createdBy: superAdmin.id,
        status: "planned",
      }
    });
  }

  // 7. Attendance
  console.log("📅 Seeding 14 days of Attendance...");
  for (let d = 14; d >= 0; d--) {
    const date = new Date();
    date.setDate(date.getDate() - d);
    date.setHours(9, 0, 0, 0);

    for (const center of centers) {
      for (const p of [pMap.SWAYAM, pMap.SHIKSHA]) {
        const session = await prisma.attendanceSession.create({
          data: { centerId: center.id, programId: p.id, sessionDate: date, createdBy: teachers[0].id, academicYearId: currentAY.id }
        });
        const centerStudents = students.filter(s => s.centerId === center.id && s.programId === p.id);
        const records = centerStudents.map(s => ({
          sessionId: session.id, studentId: s.id, centerId: center.id, status: Math.random() > 0.15 ? "present" : "absent" as any
        }));
        await prisma.attendanceRecord.createMany({ data: records });
      }
    }
  }

  // 8. Exams
  console.log("📝 Seeding Baseline & Endline Exams...");
  for (const center of centers) {
    const swayamSubs = await prisma.programSubject.findMany({ where: { programId: pMap.SWAYAM.id } });
    const targetSubs = swayamSubs.filter(s => ["English", "Science", "Mathematics"].includes(s.name));
    
    for (const type of ["baseline", "endline"]) {
      const examDate = new Date(currentAY.startDate);
      examDate.setDate(examDate.getDate() + (type === "baseline" ? 30 : 200));
      
      const exam = await prisma.exam.create({
        data: {
          name: `${type.toUpperCase()} Exam 2026 - ${center.name}`,
          examType: type as any,
          centerId: center.id,
          programId: pMap.SWAYAM.id,
          academicYearId: currentAY.id,
          createdBy: teachers[0].id,
          examDate: examDate
        }
      });
      const centerSwayamStudents = students.filter(s => s.centerId === center.id && s.programId === pMap.SWAYAM.id);
      const scores = [];
      for (const s of centerSwayamStudents) {
        for (const sub of targetSubs) {
          scores.push({
            examId: exam.id, studentId: s.id, centerId: center.id, subjectId: sub.id,
            marks: type === "baseline" ? 15 + Math.random() * 20 : 25 + Math.random() * 24,
            enteredBy: teachers[0].id
          });
        }
      }
      await prisma.examScore.createMany({ data: scores });
    }
  }

  // 9. Equipment
  console.log("💻 Seeding Equipment...");
  const categories = ["Electronics", "Furniture", "Stationery"];
  const equipNames = [
    { name: "Dell Optiplex", cat: "Electronics" },
    { name: "Lenovo Thinkpad", cat: "Electronics" },
    { name: "Whiteboard", cat: "Furniture" },
    { name: "Student Desk", cat: "Furniture" },
    { name: "Epson Projector", cat: "Electronics" },
  ];
  for (const center of centers) {
    for (const item of equipNames) {
      await prisma.equipment.create({
        data: {
          name: `${item.name} - ${center.name}`,
          category: item.cat,
          quantity: Math.floor(Math.random() * 10) + 1,
          condition: "good",
          centerId: center.id,
          createdBy: teachers[0].id,
        }
      });
    }
  }

  console.log("🎯 Seeding Skills...");
  const skillDefs = [
    { name: "Basic Computing" },
    { name: "Typing Speed" },
    { name: "Spoken English" },
    { name: "Public Speaking" },
  ];
  const createdSkills = [];
  for (const s of skillDefs) {
    const sk = await prisma.skillDefinition.create({
      data: { name: s.name, programId: pMap.SWAYAM.id, description: "Standard evaluation" }
    });
    createdSkills.push(sk);
  }

  const logs = [];
  for (const student of students) {
    for (const sk of createdSkills) {
      if (Math.random() > 0.5) {
        logs.push({
          studentId: student.id,
          centerId: student.centerId,
          skillId: sk.id,
          level: Math.floor(Math.random() * 5) + 1,
          assessedBy: teachers[0].id,
          remarks: "Periodic assessment",
        });
      }
    }
  }
  await prisma.studentSkillLog.createMany({ data: logs });

  // 11. Fees
  console.log("💰 Seeding Fees...");
  const fees = [];
  for (const student of students) {
    if (Math.random() > 0.3) {
      fees.push({
        studentId: student.id,
        amount: Math.floor(Math.random() * 500) + 100,
        notes: "Monthly fee",
        createdBy: teachers[0].id,
      });
    }
  }
  await prisma.feePayment.createMany({ data: fees });

  // 12. Transfers
  console.log("🚚 Seeding Student Transfers...");
  const transfers = [];
  for (let i = 0; i < 5; i++) {
    transfers.push({
      studentId: students[i].id,
      fromCenterId: centers[0].id,
      toCenterId: centers[1].id,
      transferDate: new Date(),
      reason: "Relocated",
      approvedBy: superAdmin.id,
    });
  }
  await prisma.studentTransfer.createMany({ data: transfers });

  console.log("✅ TOTAL REBUILD COMPLETE.");
  const c = await prisma.user.count();
  console.log("DB USER COUNT AT END:", c);
}

main().catch(e => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());