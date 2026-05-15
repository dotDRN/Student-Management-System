-- =============================================================================
-- SPARSHA Student Management System
-- PostgreSQL Schema — Phase 1
-- =============================================================================
-- Conventions:
--   - All PKs are UUID (gen_random_uuid())
--   - Every table with student/center data carries center_id directly (no join needed for access control)
--   - Soft deletes via is_active; hard deletes never happen on core data
--   - created_at / updated_at on all tables
--   - All ENUMs as TEXT + CHECK (easier to extend than PG ENUM types)
-- =============================================================================

-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "pgcrypto";


-- =============================================================================
-- 1. FOUNDATION
-- =============================================================================

CREATE TABLE academic_years (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  label       TEXT        NOT NULL UNIQUE,           -- '2024-25'
  start_date  DATE        NOT NULL,
  end_date    DATE        NOT NULL,
  is_current  BOOLEAN     NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Only one current year at a time
CREATE UNIQUE INDEX idx_academic_years_current
  ON academic_years (is_current)
  WHERE is_current = true;


CREATE TABLE centers (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT        NOT NULL,
  location    TEXT,
  is_active   BOOLEAN     NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);


CREATE TABLE programs (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  code        TEXT        NOT NULL UNIQUE,    -- 'SWAYAM', 'SHIKSHA', 'SANSKAR', etc.
  name        TEXT        NOT NULL,
  age_min     INT,
  age_max     INT,
  description TEXT,
  is_active   BOOLEAN     NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);


-- Which programs are active at which center
CREATE TABLE center_programs (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  center_id   UUID        NOT NULL REFERENCES centers(id),
  program_id  UUID        NOT NULL REFERENCES programs(id),
  is_active   BOOLEAN     NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (center_id, program_id)
);

CREATE INDEX idx_center_programs_center   ON center_programs (center_id);
CREATE INDEX idx_center_programs_program  ON center_programs (program_id);


-- Subjects are per-program and configurable by admin
CREATE TABLE program_subjects (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  program_id  UUID        NOT NULL REFERENCES programs(id),
  name        TEXT        NOT NULL,           -- 'Mathematics', 'English', 'Science'
  max_marks   NUMERIC(6,2) NOT NULL DEFAULT 100,
  is_active   BOOLEAN     NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (program_id, name)
);

CREATE INDEX idx_program_subjects_program ON program_subjects (program_id);


-- Skills are per-program, configurable
CREATE TABLE skill_definitions (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  program_id  UUID        NOT NULL REFERENCES programs(id),
  name        TEXT        NOT NULL,           -- 'Reading', 'Numeracy', 'Communication'
  description TEXT,
  max_level   INT         NOT NULL DEFAULT 5,
  is_active   BOOLEAN     NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (program_id, name)
);

CREATE INDEX idx_skill_definitions_program ON skill_definitions (program_id);


-- =============================================================================
-- 2. USERS & ACCESS CONTROL
-- =============================================================================

CREATE TABLE users (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  email         TEXT        NOT NULL UNIQUE,
  password_hash TEXT        NOT NULL,
  full_name     TEXT        NOT NULL,
  phone         TEXT,
  role          TEXT        NOT NULL CHECK (role IN (
                  'super_admin',    -- NGO-wide, no center restriction
                  'center_admin',   -- manages their assigned center(s)
                  'supervisor',     -- oversight, receives alerts
                  'teacher',
                  'staff',
                  'volunteer',      -- time-bound, activity-scoped
                  'student',        -- own records
                  'parent',
                  'shareholder',    -- read-only aggregated dashboards
                  'tech_admin'      -- system config, logs, zero PII
                )),
  is_active     BOOLEAN     NOT NULL DEFAULT true,
  last_login_at TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_users_role     ON users (role);
CREATE INDEX idx_users_active   ON users (is_active) WHERE is_active = true;


-- Persistent center assignments (teachers, staff, center_admin, supervisor)
-- valid_until NULL = permanent
CREATE TABLE user_center_assignments (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID        NOT NULL REFERENCES users(id),
  center_id   UUID        NOT NULL REFERENCES centers(id),
  valid_from  DATE        NOT NULL DEFAULT CURRENT_DATE,
  valid_until DATE,                                        -- NULL = permanent
  created_by  UUID        NOT NULL REFERENCES users(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, center_id)
);

CREATE INDEX idx_uca_user   ON user_center_assignments (user_id);
CREATE INDEX idx_uca_center ON user_center_assignments (center_id);
-- Fast check: is this assignment currently valid?
CREATE INDEX idx_uca_valid  ON user_center_assignments (valid_from, valid_until);


-- =============================================================================
-- 3. ACTIVITIES & BATCHES
-- =============================================================================

-- Activities: any event — class, game, field visit, camp, etc.
CREATE TABLE activities (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  center_id    UUID        NOT NULL REFERENCES centers(id),
  program_id   UUID        REFERENCES programs(id),   -- NULL = not program-specific
  name         TEXT        NOT NULL,
  description  TEXT,
  activity_type TEXT       NOT NULL DEFAULT 'general'  -- 'class','game','visit','camp','general'
                           CHECK (activity_type IN ('class','game','visit','camp','exam','general')),
  start_date   DATE,
  end_date     DATE,
  created_by   UUID        NOT NULL REFERENCES users(id),
  is_active    BOOLEAN     NOT NULL DEFAULT true,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  status       TEXT        NOT NULL DEFAULT 'planned'
                           CHECK (status IN ('planned','ongoing','completed','cancelled')),
  completion_notes TEXT,
  attendance_count INT     -- denormalized for dashboard speed
);

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

CREATE INDEX idx_activities_center  ON activities (center_id);
CREATE INDEX idx_activities_program ON activities (program_id);
CREATE INDEX idx_activities_dates   ON activities (start_date, end_date);


-- Volunteer access: scoped to a specific activity AND time window
CREATE TABLE user_activity_assignments (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID        NOT NULL REFERENCES users(id),
  activity_id UUID        NOT NULL REFERENCES activities(id),
  valid_from  DATE        NOT NULL,
  valid_until DATE,
  created_by  UUID        NOT NULL REFERENCES users(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, activity_id)
);

CREATE INDEX idx_uaa_user     ON user_activity_assignments (user_id);
CREATE INDEX idx_uaa_activity ON user_activity_assignments (activity_id);
CREATE INDEX idx_uaa_valid    ON user_activity_assignments (valid_from, valid_until);


-- Batches: subdivisions of an activity (Morning Batch, Group A, etc.)
CREATE TABLE batches (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  activity_id  UUID        NOT NULL REFERENCES activities(id),
  center_id    UUID        NOT NULL REFERENCES centers(id),   -- denormalized
  name         TEXT        NOT NULL,
  teacher_id   UUID        REFERENCES users(id),
  max_students INT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_batches_activity ON batches (activity_id);
CREATE INDEX idx_batches_center   ON batches (center_id);
CREATE INDEX idx_batches_teacher  ON batches (teacher_id);


-- =============================================================================
-- 4. STUDENTS
-- =============================================================================

CREATE TABLE students (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  center_id        UUID        NOT NULL REFERENCES centers(id),   -- CURRENT center
  program_id       UUID        REFERENCES programs(id),
  academic_year_id UUID        REFERENCES academic_years(id),
  full_name        TEXT        NOT NULL,
  dob              DATE,
  gender           TEXT        CHECK (gender IN ('male','female','other')),
  guardian_name    TEXT,
  guardian_phone   TEXT,
  address          TEXT,
  enrollment_date  DATE        NOT NULL DEFAULT CURRENT_DATE,
  is_active        BOOLEAN     NOT NULL DEFAULT true,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_students_center       ON students (center_id);
CREATE INDEX idx_students_program      ON students (program_id);
CREATE INDEX idx_students_active       ON students (center_id, is_active) WHERE is_active = true;
CREATE INDEX idx_students_name         ON students (full_name);                  -- name search
CREATE INDEX idx_students_academic_yr  ON students (academic_year_id);


-- Transfer history — source of truth for a student's center journey
CREATE TABLE student_transfers (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id      UUID        NOT NULL REFERENCES students(id),
  from_center_id  UUID        NOT NULL REFERENCES centers(id),
  to_center_id    UUID        NOT NULL REFERENCES centers(id),
  transfer_date   DATE        NOT NULL,
  reason          TEXT,
  approved_by     UUID        NOT NULL REFERENCES users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_transfers_student ON student_transfers (student_id);
CREATE INDEX idx_transfers_date    ON student_transfers (transfer_date);


-- Batch enrollment
CREATE TABLE batch_enrollments (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id    UUID        NOT NULL REFERENCES batches(id),
  student_id  UUID        NOT NULL REFERENCES students(id),
  enrolled_on DATE        NOT NULL DEFAULT CURRENT_DATE,
  UNIQUE (batch_id, student_id)
);

CREATE INDEX idx_batch_enrollments_batch   ON batch_enrollments (batch_id);
CREATE INDEX idx_batch_enrollments_student ON batch_enrollments (student_id);


-- Parent ↔ Student link
CREATE TABLE parent_student (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_user_id UUID NOT NULL REFERENCES users(id),
  student_id     UUID NOT NULL REFERENCES students(id),
  UNIQUE (parent_user_id, student_id)
);

CREATE INDEX idx_parent_student_parent  ON parent_student (parent_user_id);
CREATE INDEX idx_parent_student_student ON parent_student (student_id);


-- =============================================================================
-- 5. ATTENDANCE
-- =============================================================================

-- A session = one day of attendance for a program/activity/batch
CREATE TABLE attendance_sessions (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  center_id        UUID        NOT NULL REFERENCES centers(id),
  program_id       UUID        REFERENCES programs(id),
  activity_id      UUID        REFERENCES activities(id),
  batch_id         UUID        REFERENCES batches(id),
  academic_year_id UUID        REFERENCES academic_years(id),
  session_date     DATE        NOT NULL,
  created_by       UUID        NOT NULL REFERENCES users(id),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (center_id, session_date, batch_id, activity_id)  -- prevent duplicate sessions
);

CREATE INDEX idx_attsess_center   ON attendance_sessions (center_id, session_date);
CREATE INDEX idx_attsess_date     ON attendance_sessions (session_date);
CREATE INDEX idx_attsess_program  ON attendance_sessions (program_id);
CREATE INDEX idx_attsess_batch    ON attendance_sessions (batch_id);
CREATE INDEX idx_attsess_acyr     ON attendance_sessions (academic_year_id);


CREATE TABLE attendance_records (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id  UUID        NOT NULL REFERENCES attendance_sessions(id),
  student_id  UUID        NOT NULL REFERENCES students(id),
  center_id   UUID        NOT NULL REFERENCES centers(id),   -- denormalized
  status      TEXT        NOT NULL CHECK (status IN ('present','absent','late','excused')),
  remarks     TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (session_id, student_id)
);

CREATE INDEX idx_attrec_session  ON attendance_records (session_id);
CREATE INDEX idx_attrec_student  ON attendance_records (student_id);
CREATE INDEX idx_attrec_center   ON attendance_records (center_id);
-- For dashboard aggregations: all records for a student at a center
CREATE INDEX idx_attrec_student_center ON attendance_records (student_id, center_id);


-- =============================================================================
-- 6. EXAMS & SCORES
-- =============================================================================

CREATE TABLE exams (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  center_id        UUID        NOT NULL REFERENCES centers(id),
  program_id       UUID        NOT NULL REFERENCES programs(id),
  activity_id      UUID        REFERENCES activities(id),      -- if exam is an activity
  academic_year_id UUID        REFERENCES academic_years(id),
  exam_type        TEXT        NOT NULL CHECK (exam_type IN ('baseline','endline','midterm','unit','other')),
  name             TEXT        NOT NULL,
  exam_date        DATE,
  created_by       UUID        NOT NULL REFERENCES users(id),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_exams_center   ON exams (center_id);
CREATE INDEX idx_exams_program  ON exams (program_id);
CREATE INDEX idx_exams_acyr     ON exams (academic_year_id);
CREATE INDEX idx_exams_type     ON exams (exam_type);


CREATE TABLE exam_scores (
  id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  exam_id     UUID         NOT NULL REFERENCES exams(id),
  student_id  UUID         NOT NULL REFERENCES students(id),
  center_id   UUID         NOT NULL REFERENCES centers(id),   -- denormalized
  subject_id  UUID         NOT NULL REFERENCES program_subjects(id),
  marks       NUMERIC(6,2),
  remarks     TEXT,
  entered_by  UUID         NOT NULL REFERENCES users(id),
  entered_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),
  UNIQUE (exam_id, student_id, subject_id)
);

CREATE INDEX idx_scores_exam    ON exam_scores (exam_id);
CREATE INDEX idx_scores_student ON exam_scores (student_id);
CREATE INDEX idx_scores_center  ON exam_scores (center_id);


-- =============================================================================
-- 7. SKILL TRACKING
-- =============================================================================

-- Log every assessment — never overwrite, always append
CREATE TABLE student_skill_logs (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id   UUID        NOT NULL REFERENCES students(id),
  center_id    UUID        NOT NULL REFERENCES centers(id),   -- denormalized
  skill_id     UUID        NOT NULL REFERENCES skill_definitions(id),
  level        INT         NOT NULL,
  assessed_by  UUID        NOT NULL REFERENCES users(id),
  assessed_on  DATE        NOT NULL DEFAULT CURRENT_DATE,
  remarks      TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_skilllog_student ON student_skill_logs (student_id);
CREATE INDEX idx_skilllog_skill   ON student_skill_logs (skill_id);
CREATE INDEX idx_skilllog_center  ON student_skill_logs (center_id);
CREATE INDEX idx_skilllog_date    ON student_skill_logs (assessed_on);
-- For "latest skill level per student" queries
CREATE INDEX idx_skilllog_student_skill_date ON student_skill_logs (student_id, skill_id, assessed_on DESC);


-- =============================================================================
-- 8. FORMS SYSTEM
-- =============================================================================
-- Design:
--   form_templates     → defines the form (fields, time limit, access rules)
--   form_assignments   → who is required/allowed to fill a specific form instance
--   form_submissions   → the actual filled-in responses + metadata
--
-- Field types supported in schema JSONB:
--   text | textarea | number | date | mcq | msq | file_upload | section
--
-- Access is split:
--   fill_roles    TEXT[]  — roles that can SUBMIT this form
--   view_roles    TEXT[]  — roles that can VIEW submissions
-- =============================================================================

CREATE TABLE form_templates (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name             TEXT        NOT NULL,
  description      TEXT,
  form_type        TEXT        NOT NULL,  -- 'feedback','notice','online_exam','meeting','activity','general'
  center_id        UUID        REFERENCES centers(id),     -- NULL = NGO-wide template
  program_id       UUID        REFERENCES programs(id),    -- NULL = not program-specific
  target_entity    TEXT        NOT NULL CHECK (target_entity IN ('student','parent','teacher','general')),
  time_limit_mins  INT,                                    -- NULL = no time limit
  is_published     BOOLEAN     NOT NULL DEFAULT false,
  is_active        BOOLEAN     NOT NULL DEFAULT true,

  -- Who can submit this form (array of role strings)
  fill_roles       TEXT[]      NOT NULL DEFAULT '{}',

  -- Who can view all submissions (array of role strings)
  -- e.g. '{"teacher","supervisor","center_admin"}' — submitter always sees their own
  view_roles       TEXT[]      NOT NULL DEFAULT '{}',

  -- Field definitions — array of field objects
  -- Each field: { id, label, type, required, options?, min?, max?, placeholder? }
  schema           JSONB       NOT NULL DEFAULT '{"fields": []}',

  created_by       UUID        NOT NULL REFERENCES users(id),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_form_templates_center   ON form_templates (center_id);
CREATE INDEX idx_form_templates_program  ON form_templates (program_id);
CREATE INDEX idx_form_templates_type     ON form_templates (form_type);
CREATE INDEX idx_form_templates_active   ON form_templates (is_active) WHERE is_active = true;
-- GIN index for searching inside the schema JSONB
CREATE INDEX idx_form_templates_schema   ON form_templates USING GIN (schema);


-- Assigns a form to specific users/students (for targeted forms)
-- If no rows exist for a template, form is open to all with fill_roles
CREATE TABLE form_assignments (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id  UUID        NOT NULL REFERENCES form_templates(id),
  assigned_to  UUID        NOT NULL REFERENCES users(id),    -- specific user
  student_id   UUID        REFERENCES students(id),          -- context if form is about a student
  due_date     TIMESTAMPTZ,
  assigned_by  UUID        NOT NULL REFERENCES users(id),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (template_id, assigned_to, student_id)
);

CREATE INDEX idx_form_assignments_template ON form_assignments (template_id);
CREATE INDEX idx_form_assignments_user     ON form_assignments (assigned_to);
CREATE INDEX idx_form_assignments_student  ON form_assignments (student_id);
-- For "my pending forms" dashboard widget
CREATE INDEX idx_form_assignments_due      ON form_assignments (assigned_to, due_date);


CREATE TABLE form_submissions (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id    UUID        NOT NULL REFERENCES form_templates(id),
  assignment_id  UUID        REFERENCES form_assignments(id),  -- NULL if open submission
  student_id     UUID        REFERENCES students(id),          -- context if about a student
  center_id      UUID        NOT NULL REFERENCES centers(id),  -- denormalized
  submitted_by   UUID        NOT NULL REFERENCES users(id),
  started_at     TIMESTAMPTZ,                                  -- for time-limit enforcement
  submitted_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  ip_address     INET,
  user_agent     TEXT,

  -- The actual answers: { "field_001": "answer", "field_002": ["opt_a","opt_b"], ... }
  data           JSONB       NOT NULL DEFAULT '{}'
);

CREATE INDEX idx_form_sub_template   ON form_submissions (template_id);
CREATE INDEX idx_form_sub_student    ON form_submissions (student_id);
CREATE INDEX idx_form_sub_center     ON form_submissions (center_id);
CREATE INDEX idx_form_sub_submitted  ON form_submissions (submitted_by);
CREATE INDEX idx_form_sub_date       ON form_submissions (submitted_at DESC);
-- GIN for searching inside submitted answers
CREATE INDEX idx_form_sub_data       ON form_submissions USING GIN (data);
-- Composite: all submissions for a student on a form
CREATE INDEX idx_form_sub_tmpl_stud  ON form_submissions (template_id, student_id);


-- =============================================================================
-- 9. MESSAGING
-- =============================================================================

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


-- =============================================================================
-- 10. EQUIPMENT & RESOURCES
-- =============================================================================

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


-- =============================================================================
-- 11. ANNOUNCEMENTS
-- =============================================================================

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


-- =============================================================================
-- 12. ALERTS & SUPERVISOR NOTIFICATIONS
-- =============================================================================

CREATE TABLE alert_rules (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  center_id     UUID        REFERENCES centers(id),     -- NULL = applies to all centers
  program_id    UUID        REFERENCES programs(id),    -- NULL = all programs
  metric        TEXT        NOT NULL,  -- 'attendance_rate','exam_score','skill_level'
  condition     TEXT        NOT NULL CHECK (condition IN ('below','above','equals')),
  threshold     NUMERIC     NOT NULL,
  description   TEXT,
  notify_roles  TEXT[]      NOT NULL DEFAULT '{"supervisor"}',
  is_active     BOOLEAN     NOT NULL DEFAULT true,
  created_by    UUID        NOT NULL REFERENCES users(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_alert_rules_center  ON alert_rules (center_id);
CREATE INDEX idx_alert_rules_active  ON alert_rules (is_active) WHERE is_active = true;


CREATE TABLE alerts (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_id       UUID        NOT NULL REFERENCES alert_rules(id),
  recipient_id  UUID        NOT NULL REFERENCES users(id),
  student_id    UUID        REFERENCES students(id),
  center_id     UUID        NOT NULL REFERENCES centers(id),
  message       TEXT        NOT NULL,
  metric_value  NUMERIC,
  is_read       BOOLEAN     NOT NULL DEFAULT false,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_alerts_recipient  ON alerts (recipient_id, is_read);
CREATE INDEX idx_alerts_student    ON alerts (student_id);
CREATE INDEX idx_alerts_center     ON alerts (center_id);
CREATE INDEX idx_alerts_date       ON alerts (created_at DESC);
-- Fast unread count per user (common dashboard query)
CREATE INDEX idx_alerts_unread     ON alerts (recipient_id) WHERE is_read = false;


-- =============================================================================
-- 13. AUDIT LOG
-- =============================================================================

CREATE TABLE audit_log (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID        REFERENCES users(id),
  action      TEXT        NOT NULL CHECK (action IN ('INSERT','UPDATE','DELETE','LOGIN','LOGOUT','ACCESS_DENIED')),
  table_name  TEXT,
  record_id   UUID,
  old_data    JSONB,
  new_data    JSONB,
  ip_address  INET,
  user_agent  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Audit log is append-only. Optimize for retrieval, not updates.
CREATE INDEX idx_audit_user    ON audit_log (user_id, created_at DESC);
CREATE INDEX idx_audit_table   ON audit_log (table_name, record_id);
CREATE INDEX idx_audit_date    ON audit_log (created_at DESC);
-- Keep GIN on new_data for forensic searches
CREATE INDEX idx_audit_newdata ON audit_log USING GIN (new_data);


-- =============================================================================
-- 14. PAGINATION SUPPORT
-- =============================================================================
-- Use KEYSET (cursor) pagination, not OFFSET.
-- OFFSET degrades linearly — at page 500 it scans 500*page_size rows.
-- Keyset uses the last row's (created_at, id) as a cursor — always O(log n).
--
-- Pattern for every paginated query:
--
--   -- First page:
--   SELECT * FROM students
--   WHERE center_id = $1 AND is_active = true
--   ORDER BY created_at DESC, id DESC
--   LIMIT 20;
--
--   -- Next page (pass last row's created_at + id as cursor):
--   SELECT * FROM students
--   WHERE center_id = $1 AND is_active = true
--     AND (created_at, id) < ($last_created_at, $last_id)
--   ORDER BY created_at DESC, id DESC
--   LIMIT 20;
--
-- Indexes to support this pattern (created_at DESC, id DESC) are already
-- covered by the created_at indexes above because PG can scan them backwards.
-- Add composite where needed:

CREATE INDEX idx_students_page     ON students (center_id, created_at DESC, id DESC);
CREATE INDEX idx_sub_page          ON form_submissions (center_id, submitted_at DESC, id DESC);
CREATE INDEX idx_audit_page        ON audit_log (created_at DESC, id DESC);


-- =============================================================================
-- 15. UPDATED_AT TRIGGER (apply to all tables with updated_at)
-- =============================================================================

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_academic_years_updated  BEFORE UPDATE ON academic_years  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_centers_updated         BEFORE UPDATE ON centers         FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_programs_updated        BEFORE UPDATE ON programs        FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_users_updated           BEFORE UPDATE ON users           FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_activities_updated      BEFORE UPDATE ON activities      FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_batches_updated         BEFORE UPDATE ON batches         FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_students_updated        BEFORE UPDATE ON students        FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_form_templates_updated  BEFORE UPDATE ON form_templates  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_equipment_updated       BEFORE UPDATE ON equipment       FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- =============================================================================
-- SCHEMA NOTES FOR THE TEAM
-- =============================================================================
--
-- ADDING A NEW PROGRAM (step-by-step):
--   1. INSERT into programs (code, name, age_min, age_max)
--   2. INSERT into center_programs for each center that will run it
--   3. INSERT into program_subjects for subjects it uses
--   4. INSERT into skill_definitions for skills to track
--   Done. No code changes required.
--
-- ADDING A NEW ROLE:
--   1. ALTER TABLE users DROP CONSTRAINT users_role_check;
--   2. ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN (..., 'new_role'));
--   3. Add access logic in the API middleware.
--
-- FORM FIELD SCHEMA (JSONB contract):
--   {
--     "fields": [
--       { "id": "f1", "label": "Question", "type": "mcq",  "required": true,  "options": ["A","B","C"] },
--       { "id": "f2", "label": "Comment",  "type": "textarea", "required": false },
--       { "id": "f3", "label": "Score",    "type": "number",   "min": 0, "max": 100 },
--       { "id": "f4", "label": "Section",  "type": "section"  },
--       { "id": "f5", "label": "Pick all", "type": "msq",   "options": ["X","Y","Z"] },
--       { "id": "f6", "label": "Document", "type": "file_upload" }
--     ]
--   }
--
-- ACCESS CONTROL ENFORCED IN API (not DB):
--   - super_admin:     no center filter
--   - center_admin:    filter by their user_center_assignments
--   - supervisor:      filter by their user_center_assignments, read-only on most
--   - teacher/staff:   filter by their user_center_assignments, own center only
--   - volunteer:       filter by user_activity_assignments WHERE valid_from <= TODAY <= valid_until
--   - parent:          filter via parent_student JOIN, only their children
--   - shareholder:     aggregated views only, no PII columns returned
--
-- KEYSET PAGINATION:
--   Always pass (last_created_at, last_id) as cursor — never use OFFSET.
--
-- =============================================================================
