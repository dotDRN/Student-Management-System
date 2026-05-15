# 🗄️ SPARSHA OMS - Database Architecture

The backend utilizes PostgreSQL 15+, heavily managed and strictly typed using Prisma ORM. This document serves as a guide to the database structure and conventions.

---

## 🏛️ Core Design Principles

1.  **UUID Keys (`@db.Uuid`)**:
    *   Every table uses UUIDs as its primary key (`id`).
    *   We use `dbgenerated("gen_random_uuid()")` to allow the database to generate them natively, resulting in better performance than generating them in Node.js.
    *   *Why?* To prevent ID enumeration (where an attacker could guess `student/5` exists if they see `student/4`).
2.  **Soft Deletion (`isActive`)**:
    *   Data is rarely deleted (`DELETE FROM`). Instead, most core entities (Centers, Users, Students, Activities, Equipment) have an `isActive: Boolean @default(true)` flag.
    *   When an administrator "deletes" a record via the UI, the API sets `isActive` to `false`.
    *   *Why?* It preserves historical integrity. If an Activity is marked completed, and we physically delete the Teacher who hosted it, our historical attendance reports would crash due to broken foreign keys.
3.  **Audit Logs**:
    *   A generic `AuditLog` table stores JSON records (`oldData`, `newData`) of critical actions, ensuring complete traceability of who changed what, when, and from what IP address.

---

## 📚 Major Domains & Entity Relationships

The schema is divided into several major domains.

### 1. Centers & Programs (`Center`, `Program`, `AcademicYear`)
The top-level organizational unit is the **Center**. 
- A Center can offer multiple **Programs** (via the many-to-many `CenterProgram` join table).
- Everything in the system (Students, Equipment, Exams, Activities) strictly belongs to a specific `Center`.

### 2. Users & RBAC (`User`, `UserCenterAssignment`)
A single `User` account can log into the system.
- Users are assigned a global `UserRole` enum (e.g., `super_admin`, `center_admin`, `teacher`).
- Crucially, a User (unless they are a `super_admin`) only has access to the Centers defined in their `UserCenterAssignment` records.

### 3. Students & Transfers (`Student`, `StudentTransfer`)
- A `Student` record stores PII (Name, DOB, Guardian info) and academic tracking (Roll Number, Stream).
- If a student moves locations, a `StudentTransfer` record logs the movement `fromCenterId` and `toCenterId`.

### 4. Activities & Batches (`Activity`, `Batch`)
- An `Activity` represents a class, game, camp, or exam. It has a status (`planned`, `ongoing`, `completed`, `cancelled`).
- A `Batch` groups a specific set of enrolled students under a single teacher for recurring activities.

### 5. Academics (`AttendanceSession`, `Exam`, `StudentSkillLog`)
- **Attendance**: Tracked via `AttendanceSession` (the event) and `AttendanceRecord` (the individual student's presence/absence).
- **Exams**: An `Exam` is created for a specific `AcademicYear` and `Program`. Individual `ExamScore` records link students to `ProgramSubject` scores.
- **Skills**: Soft skills and qualitative metrics are recorded over time in `StudentSkillLog` referencing `SkillDefinition`.

### 6. Dynamic Forms (`FormTemplate`, `FormSubmission`)
- The OMS supports custom-built forms. A `FormTemplate` stores a JSON schema of the questions.
- A `FormSubmission` stores the resulting JSON data linked to a specific `studentId` and `centerId`.

### 7. Resources & Comms (`Equipment`, `Announcement`, `Alert`)
- **Equipment**: Tracked per center. `EquipmentLog` records checkouts and condition changes.
- **Announcements**: Pinned or general messages broadcasted to specific `targetRoles` across centers.
- **Alerts**: System-generated notifications (e.g., "Student X has been absent for 5 days") based on configured `AlertRule` triggers.

---

## 🔧 Managing the Database (Prisma CLI)

As the database maintainer, you will interact with the database entirely through Prisma. Do not write raw SQL unless absolutely necessary.

### 1. Viewing the Database
Run Prisma Studio for a local, web-based database explorer:
```bash
cd backend
npx prisma studio
```
This opens `http://localhost:5555` where you can view, filter, and edit raw records safely.

### 2. Modifying the Schema (Adding Tables/Columns)
If you need to add a new column (e.g., adding `bloodType` to the `Student` model):
1. Open `backend/prisma/schema.prisma`.
2. Add the field: `bloodType String? @map("blood_type")`
3. Generate and apply the migration to your local dev database:
   ```bash
   npx prisma migrate dev --name add_student_blood_type
   ```
4. This will create a `.sql` file in `backend/prisma/migrations/` and update your TypeScript types.
5. Commit the migration file to version control. When the container reboots in production, the `migrate deploy` command will automatically apply it.

> [!WARNING]
> **Never** edit the production database schema directly via SQL. Always use `prisma migrate dev` locally and let Docker apply `prisma migrate deploy` in production. Doing otherwise will break the migration history.
