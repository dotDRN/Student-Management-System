# SPARSHA SMS — Role & Permission Architecture
## Production-Level Design Document

---

## 1. Role Hierarchy (Confirmed + Additions)

```
super_admin
    └── center_admin  (one or more per center)
            ├── supervisor
            ├── teacher
            ├── staff
            └── volunteer  (time/activity bound)

Lateral roles (no hierarchy, scoped access):
    parent      → own children only
    student     → own data only
    shareholder → aggregate dashboards, zero PII
    tech_admin  → system config only, zero data access
```

### Role Definitions

**super_admin**
The head of SPARSHA. One person (or a trusted few). Sees all centers, all data,
all reports. Can create center_admins. Can override anything. Receives NGO-wide
aggregate dashboard. This is a real role — the person who is accountable for the
entire organization.

**center_admin**
Branch head. Scoped strictly to their assigned center(s). Creates and manages
teachers/staff/volunteers within their center. Cannot see other centers' data.
Does NOT mark attendance (that's a teacher job — see Section 3).

**supervisor**
Oversight role. Receives automated alerts when students excel or fall behind.
Can view all student data within their center but cannot edit most things.
Think of this as a "read + alert" role. Scope: center-level.

**teacher**
Core educator. Marks attendance, creates forms (tests/feedback), enters exam scores,
tracks skills. Scoped to their assigned center and program/batch.

**staff**
Administrative support. Handles enrollment, records, data entry. Cannot create
forms or enter academic scores. Can manage student profiles and generate reports.

**volunteer**
Scoped to a specific activity AND a time window. Can only see and mark attendance
for students in their assigned activity. No access outside that scope, ever.

**student**
Yes, students have accounts. They can: view their own attendance/scores/skills,
fill forms assigned to them, send messages to their teacher. Nothing else.

**parent**
Tied to specific student(s) via parent_student table. Can view their child's
attendance, scores, skill progress. Can message their child's teacher.

**shareholder**
Aggregate dashboards only. Center-wise totals, program metrics, no names, no PII.
Read-only. This role exists purely for governance/funding visibility.

**tech_admin** ← NEW, PRODUCTION-CRITICAL
System maintenance role. Can access logs, manage deployments, run migrations,
configure system settings. CANNOT read student records, forms, or any PII.
This is separation of concerns — your developer/maintainer should not have
access to real user data. Audited separately.

---

## 2. Feature → Role Matrix

Legend: C = Create | R = Read | U = Update | D = Delete/Deactivate | ✗ = No access

### 2.1 Student Records

| Feature                        | super_admin | center_admin | supervisor | teacher | staff | volunteer | student | parent |
|-------------------------------|-------------|--------------|------------|---------|-------|-----------|---------|--------|
| Enroll new student             | C           | C            | ✗          | ✗       | C     | ✗         | ✗       | ✗      |
| View student list (center)     | R (all)     | R (own)      | R (own)    | R (own) | R (own)| ✗       | ✗       | ✗      |
| View own profile               | —           | —            | —          | —       | —     | —         | R       | R (child)|
| Edit student profile           | U           | U            | ✗          | ✗       | U     | ✗         | ✗       | ✗      |
| Transfer student               | Approve     | Initiate     | ✗          | ✗       | ✗     | ✗         | ✗       | ✗      |
| Deactivate student             | D           | D            | ✗          | ✗       | ✗     | ✗         | ✗       | ✗      |
| View transfer history          | R           | R (own)      | R (own)    | ✗       | ✗     | ✗         | ✗       | ✗      |

### 2.2 Attendance

| Feature                        | super_admin | center_admin | supervisor | teacher | staff | volunteer | student | parent |
|-------------------------------|-------------|--------------|------------|---------|-------|-----------|---------|--------|
| Mark attendance                | ✗           | ✗            | ✗          | C (own) | ✗     | C (activity)| ✗    | ✗      |
| Edit attendance (same day)     | U           | U            | ✗          | U       | ✗     | ✗         | ✗       | ✗      |
| Edit attendance (past)         | U           | ✗            | ✗          | ✗       | ✗     | ✗         | ✗       | ✗      |
| View attendance (center)       | R (all)     | R (own)      | R (own)    | R (own) | R (own)| ✗       | ✗       | ✗      |
| View own attendance            | —           | —            | —          | —       | —     | —         | R       | R (child)|

NOTE: Admin does NOT mark attendance. This is teacher/volunteer territory.
If admin needs to correct a record, that's an edit — logged in audit_log.

### 2.3 Forms (Tests / Feedback / Notices / Surveys)

| Feature                        | super_admin | center_admin | supervisor | teacher | staff | volunteer | student | parent |
|-------------------------------|-------------|--------------|------------|---------|-------|-----------|---------|--------|
| Create form template           | C           | C            | ✗          | C (draft)| ✗    | ✗         | ✗       | ✗      |
| Publish form                   | C           | C            | ✗          | C (own) | ✗     | ✗         | ✗       | ✗      |
| Assign form to users           | C           | C (own)      | ✗          | C (own students)| ✗| ✗      | ✗       | ✗      |
| Fill assigned form             | —           | —            | —          | R+C     | R+C   | R+C       | C       | C      |
| View own submissions           | R           | R            | R          | R       | R     | R         | R       | R      |
| View all submissions (center)  | R           | R (own)      | R (own)    | R (own) | ✗     | ✗         | ✗       | ✗      |

### 2.4 Exams & Scores

| Feature                        | super_admin | center_admin | supervisor | teacher | staff | volunteer | student | parent |
|-------------------------------|-------------|--------------|------------|---------|-------|-----------|---------|--------|
| Create exam                    | C           | C            | ✗          | C       | ✗     | ✗         | ✗       | ✗      |
| Enter scores                   | U           | U            | ✗          | U (own) | ✗     | ✗         | ✗       | ✗      |
| View scores (center)           | R           | R (own)      | R (own)    | R (own) | ✗     | ✗         | ✗       | ✗      |
| View own scores                | —           | —            | —          | —       | —     | —         | R       | R (child)|
| Configure subjects             | C/U/D       | C/U (own)    | ✗          | ✗       | ✗     | ✗         | ✗       | ✗      |

### 2.5 Activities

| Feature                        | super_admin | center_admin | supervisor | teacher | staff | volunteer | student | parent |
|-------------------------------|-------------|--------------|------------|---------|-------|-----------|---------|--------|
| Create activity                | C           | C            | ✗          | Propose | ✗     | ✗         | ✗       | ✗      |
| Manage batches                 | C/U         | C/U (own)    | ✗          | U (assigned)| ✗ | ✗        | ✗       | ✗      |
| View activity status           | R (all)     | R (own)      | R (own)    | R (own) | R (own)| ✗       | ✗       | ✗      |
| Assign volunteer to activity   | C           | C (own)      | ✗          | ✗       | ✗     | ✗         | ✗       | ✗      |
| View activity report           | R (all)     | R (own)      | R (own)    | R (own) | ✗     | ✗         | ✗       | ✗      |

### 2.6 Skills

| Feature                        | super_admin | center_admin | supervisor | teacher | staff | volunteer | student | parent |
|-------------------------------|-------------|--------------|------------|---------|-------|-----------|---------|--------|
| Define skill categories        | C/U/D       | ✗            | ✗          | ✗       | ✗     | ✗         | ✗       | ✗      |
| Log student skill assessment   | C           | C            | ✗          | C (own) | ✗     | ✗         | ✗       | ✗      |
| View skill history             | R (all)     | R (own)      | R (own)    | R (own) | ✗     | ✗         | R (own) | R (child)|

### 2.7 Alerts & Supervisor Notifications

| Feature                        | super_admin | center_admin | supervisor | teacher | staff |
|-------------------------------|-------------|--------------|------------|---------|-------|
| Configure alert rules          | C/U/D       | C/U (own)    | ✗          | ✗       | ✗     |
| Receive alerts                 | All centers | Own center   | Own center | ✗       | ✗     |
| Dismiss/mark read              | R+U         | R+U          | R+U        | ✗       | ✗     |

### 2.8 Messaging (NEW — see schema additions)

| From → To                      | Allowed? |
|-------------------------------|----------|
| student → their teacher        | ✓        |
| student → center_admin         | ✗ (go through teacher) |
| parent → their child's teacher | ✓        |
| parent → center_admin          | ✓        |
| teacher → own students         | ✓        |
| teacher → center_admin         | ✓        |
| teacher → supervisor           | ✓        |
| center_admin → their teachers  | ✓        |
| center_admin → super_admin     | ✓        |
| supervisor → center_admin      | ✓        |
| super_admin → anyone           | ✓        |

No direct student→admin channel. Student raises concern to teacher, teacher escalates.
This mirrors real organizational structure.

### 2.9 Equipment & Resources (NEW)

| Feature                        | super_admin | center_admin | supervisor | teacher | staff |
|-------------------------------|-------------|--------------|------------|---------|-------|
| Add equipment record           | C           | C (own)      | ✗          | ✗       | C (own)|
| Update equipment status        | U           | U (own)      | ✗          | ✗       | U (own)|
| View equipment inventory       | R (all)     | R (own)      | R (own)    | R (own) | R (own)|
| View equipment report          | R (all)     | R (own)      | R (own)    | ✗       | ✗     |

### 2.10 User Management

| Feature                        | super_admin | center_admin |
|-------------------------------|-------------|--------------|
| Create super_admin             | C           | ✗            |
| Create center_admin            | C           | ✗            |
| Create supervisor              | C           | C (own)      |
| Create teacher/staff/volunteer | C           | C (own)      |
| Create parent/student account  | C           | C (own)      |
| Deactivate any user            | D           | D (own center only)|
| View all users                 | R           | R (own)      |
| Reset passwords                | U           | U (own)      |

### 2.11 Dashboards

| Dashboard View                 | super_admin | center_admin | supervisor | teacher | shareholder |
|-------------------------------|-------------|--------------|------------|---------|-------------|
| NGO-wide aggregate             | ✓           | ✗            | ✗          | ✗       | ✓ (no PII)  |
| Center-level summary           | ✓           | ✓ (own)      | ✓ (own)    | ✗       | ✗           |
| Class/batch level              | ✓           | ✓            | ✓          | ✓       | ✗           |
| Individual student             | ✓           | ✓ (own)      | ✓ (own)    | ✓ (own) | ✗           |
| Activity status (all centers)  | ✓           | ✗            | ✗          | ✗       | ✗           |
| Equipment status               | ✓           | ✓ (own)      | ✓ (own)    | ✗       | ✗           |

---

## 3. Schema Additions Required

### 3.1 Messaging

```sql
CREATE TABLE message_threads (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  center_id    UUID NOT NULL REFERENCES centers(id),
  subject      TEXT,
  created_by   UUID NOT NULL REFERENCES users(id),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE thread_participants (
  thread_id  UUID NOT NULL REFERENCES message_threads(id),
  user_id    UUID NOT NULL REFERENCES users(id),
  PRIMARY KEY (thread_id, user_id)
);

CREATE TABLE messages (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id   UUID NOT NULL REFERENCES message_threads(id),
  sender_id   UUID NOT NULL REFERENCES users(id),
  body        TEXT NOT NULL,
  is_read     BOOLEAN NOT NULL DEFAULT false,
  sent_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_messages_thread ON messages (thread_id, sent_at DESC);
CREATE INDEX idx_messages_sender ON messages (sender_id);
CREATE INDEX idx_thread_participants_user ON thread_participants (user_id);
```

### 3.2 Equipment & Resources

```sql
CREATE TABLE equipment (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  center_id    UUID NOT NULL REFERENCES centers(id),
  name         TEXT NOT NULL,
  category     TEXT NOT NULL,     -- 'electronics','furniture','medical','stationery','other'
  quantity     INT NOT NULL DEFAULT 1,
  condition    TEXT NOT NULL DEFAULT 'good'
               CHECK (condition IN ('good','fair','poor','damaged','disposed')),
  acquired_on  DATE,
  notes        TEXT,
  is_active    BOOLEAN NOT NULL DEFAULT true,
  created_by   UUID NOT NULL REFERENCES users(id),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE equipment_logs (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  equipment_id UUID NOT NULL REFERENCES equipment(id),
  center_id    UUID NOT NULL REFERENCES centers(id),
  action       TEXT NOT NULL,   -- 'added','updated','repaired','disposed','transferred'
  notes        TEXT,
  logged_by    UUID NOT NULL REFERENCES users(id),
  logged_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_equipment_center   ON equipment (center_id);
CREATE INDEX idx_equipment_logs_eq  ON equipment_logs (equipment_id);
```

### 3.3 Activity Status Tracking (extend activities table)

```sql
ALTER TABLE activities ADD COLUMN status TEXT NOT NULL DEFAULT 'planned'
  CHECK (status IN ('planned','ongoing','completed','cancelled'));
ALTER TABLE activities ADD COLUMN completion_notes TEXT;
ALTER TABLE activities ADD COLUMN attendance_count INT;  -- denormalized for dashboard speed

-- Log every status change
CREATE TABLE activity_status_log (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  activity_id  UUID NOT NULL REFERENCES activities(id),
  center_id    UUID NOT NULL REFERENCES centers(id),
  from_status  TEXT,
  to_status    TEXT NOT NULL,
  notes        TEXT,
  changed_by   UUID NOT NULL REFERENCES users(id),
  changed_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_actstatus_activity ON activity_status_log (activity_id);
CREATE INDEX idx_actstatus_center   ON activity_status_log (center_id, changed_at DESC);
```

### 3.4 Announcements (distinct from forms — broadcast, not filled)

```sql
CREATE TABLE announcements (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  center_id    UUID REFERENCES centers(id),   -- NULL = NGO-wide
  program_id   UUID REFERENCES programs(id),  -- NULL = all programs
  title        TEXT NOT NULL,
  body         TEXT NOT NULL,
  target_roles TEXT[] NOT NULL DEFAULT '{}',  -- who sees this
  is_pinned    BOOLEAN NOT NULL DEFAULT false,
  expires_at   TIMESTAMPTZ,
  created_by   UUID NOT NULL REFERENCES users(id),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_announcements_center ON announcements (center_id);
CREATE INDEX idx_announcements_expiry ON announcements (expires_at) WHERE expires_at IS NOT NULL;
```

---

## 4. API Middleware — Enforcement Rules

Every API route must run this check stack in order:

```
1. Is user authenticated?            → 401 if not
2. Is user.is_active = true?         → 403 if not
3. Does user's role allow this route? → 403 if not
4. Does user have center access?
   - super_admin, tech_admin:  skip this check
   - all others:               verify user_center_assignments for the requested center_id
5. Is assignment currently valid?
   - volunteers:  check user_activity_assignments WHERE now() BETWEEN valid_from AND valid_until
   - others:      check valid_until IS NULL OR valid_until >= today
6. Log to audit_log
```

tech_admin bypasses data access entirely — they have routes only for:
system health, logs (sanitized), config, deployments. Never student/user data.

---

## 5. Things Commonly Missed at This Stage

**Session expiry.** JWTs should expire in 24h for teachers/admins, 1h for sensitive
operations. Volunteers' tokens should hard-expire at their valid_until date.

**Password policy.** Minimum complexity, forced reset on first login for
system-created accounts. center_admin should be able to reset passwords
for users in their center.

**Rate limiting.** Login endpoint especially. Brute force on an NGO's
student data is a real threat.

**Soft delete everywhere.** Never hard delete users, students, records.
is_active = false is the only "delete" that happens. You may need to
recover data six months later.

**API versioning from day one.** Prefix all routes with /api/v1/.
When you ship v2 changes, v1 still works for old clients. Costs you
nothing now, saves you massive pain later.

**Shareholder dashboard must never return PII in API response.**
Enforce at the query level — SELECT aggregate columns only, no name,
no phone, no dob. Not a frontend concern — backend responsibility.
