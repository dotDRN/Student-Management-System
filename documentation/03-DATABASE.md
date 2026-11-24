# EdBase — Database Architecture

EdBase uses **PostgreSQL 15+** (compatible with **Supabase**) managed through **Prisma 7** (`@prisma/adapter-pg` driver adapter + `pg.Pool`).

---

## Prisma 7 Configuration

- **Schema:** [`backend/prisma/schema.prisma`](../backend/prisma/schema.prisma) (`datasource db { provider = "postgresql" }`)
- **CLI Config:** [`backend/prisma.config.ts`](../backend/prisma.config.ts) resolves `process.env["DIRECT_URL"] || process.env["DATABASE_URL"]` so Prisma migrations use a direct/session PostgreSQL connection while runtime queries can use a transaction pooler (such as Supabase PgBouncer on `:6543`).
- **Runtime Client & Pooling (`backend/src/lib/prisma.ts`):**
  - Uses `pg.Pool` (`max: DB_POOL_MAX || 10`, `idleTimeoutMillis: 30000`, `connectionTimeoutMillis: 10000`).
  - Automatically enables SSL (`{ rejectUnauthorized: false }`) for non-local databases (or when `DATABASE_SSL=true`).
  - Attaches a `pool.on("error", ...)` handler so idle pool disconnects do not crash Node.
  - Extends `PrismaClient` with automatic tenant scoping via `AsyncLocalStorage` (`src/lib/tenantContext.ts`).

---

## Core Design Principles

1. **UUID Primary Keys (`@db.Uuid`):** Every entity generates primary keys natively in PostgreSQL via `@default(dbgenerated("gen_random_uuid()"))`, avoiding sequential ID enumeration.
2. **Soft Deletion & Tombstones:**
   - Core entities (`Center`, `Program`, `ProgramSubject`, `SkillDefinition`, `User`, `Activity`, `Batch`, `Student`, `FormTemplate`, `Equipment`, `AlertRule`, `Conversation`) retain history via `isActive: Boolean` (or `isArchived`).
   - Offline-synced entities additionally track **`version: Int`** and **`deletedAt: DateTime?`** tombstones so incremental pulls (`GET /api/sync/pull`) propagate deletions and detect concurrent edits.
3. **Idempotent Offline Sync (`SyncOperationLog` & `clientOperationId`):**
   - `SyncOperationLog` stores `(tenantId, operationId)` results so retried offline sync pushes never duplicate mutations.
   - `FeePayment` carries an optional `clientOperationId` for safe offline fee recording.
4. **Audit Trail (`AuditLog`):** Records entity actions, old/new JSON snapshots, actor ID, and vault document metadata.

---

## Schema Domains (`schema.prisma`)

### 1. Multi-Tenancy & Academic Lifecycles
- `Organization`: Workspace root (`id`, `name`, `slug`, `logoUrl`, `plan`, `isActive`). All 11 direct-tenant models reference `tenantId`.
- `AcademicYear`: Per-tenant academic terms (`label`, `startDate`, `endDate`, `isCurrent`).

### 2. Centers, Programs & Batches
- `Center` & `Program` (linked via `CenterProgram`)
- `ProgramSubject`: Dynamic subjects with configurable `maxMarks` per program
- `SkillDefinition`: Qualitative skill rubric (`maxLevel` per program)
- `Batch` & `BatchEnrollment`: Groups students under a teacher and links to a backing class `Activity`

### 3. Users, Assignments & Guardians
- `User`: Role (`UserRole` enum), credentials (`passwordHash`), `isActive` kill switch, `lastLoginAt`
- `UserCenterAssignment`: Date-bounded (`validFrom`, `validUntil`) center access grants
- `UserActivityAssignment`: Volunteer activity assignments with optional expiry
- `ParentStudent`: Links `parent` role users to specific `Student` records for the `/parent` portal

### 4. Students, Fees & Transfers
- `Student`: Personal/guardian details, `rollNumber`, `academicYearId`, post-12th fields (`stream`, `post12thChoice`, `collegeName`, `educationDiscontinued`), fee totals (`totalFees`, `feesPaid`, `isFullyPaid`), `transferStatus`, `version`, `deletedAt`
- `FeePayment`: Payment history entries with automatic balance recalculation
- `StudentTransfer`: Tracks center-to-center student transfers

### 5. Attendance, Exams, Skills & Activities
- `AttendanceSession` & `AttendanceRecord`: Supports `present`, `absent`, `pending`, `late`, `excused`, plus `isHoliday` sessions and `batchId` scoping
- `Exam` & `ExamScore`: Multi-term (`baseline`, `midline`, `endline`, custom) assessments with `SubmissionStatus` (`DRAFT`, `SUBMITTED`, `VERIFIED`) and `isAbsent` handling
- `StudentSkillLog`: Level ratings (`1..maxLevel`) per skill & date
- `Activity`, `ActivityEnrollment`, `ActivityStatusLog`: Class/camp/visit/game workflows, teacher enrollment requests/approvals, holistic credits

### 6. Dynamic Forms & KoboToolbox
- `FormTemplate`, `FormAssignment`, `FormSubmission`: JSON-schema dynamic forms with optional KoboToolbox external asset/submission IDs (`externalSource`, `externalId`, `koboSubmissionId`)

### 7. Alerts, Announcements, Chat & Notifications
- `AlertRule` & `Alert`: Risk monitoring rules (`consecutive_absences`, `attendance_30d_pct`, `exam_score_drop_pct`, `fee_overdue_balance`)
- `Announcement`: Center/role-targeted announcements with priority and pin flags
- `Conversation`, `ConversationMember`, `Message`, `MessageAttachment`, `MessageReaction`: Real-time chat system
- `Notification`, `NotificationRecipient`, `PushSubscription`: Persistent notification feed and read/archive state
- `Equipment` & `EquipmentLog`: Schema models for center resource inventory

---

## Prisma CLI Workflow

Run from `backend/`:

```bash
# Inspect database visually
npx prisma studio

# Create and apply a local development migration
npx prisma migrate dev --name describe_change

# Apply committed migrations in staging/production
npx prisma migrate deploy

# Regenerate Prisma Client after editing schema.prisma
npx prisma generate
```

> **Rule:** Never alter production tables manually with raw SQL outside Prisma migrations, or `prisma migrate deploy` history will drift.
