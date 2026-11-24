# EdBase — API Reference

All REST endpoints are mounted under `/api` in [`backend/src/app.ts`](../backend/src/app.ts), except health probes mounted at `/health` and `/health/live`. Real-time communication runs over Socket.IO at `/socket.io`.

---

## Middleware Pipeline

Protected endpoints compose:
1. **`authenticate` / `requireAuth`:** Validates `Authorization: Bearer <token>` JWT, checks `isActive`, verifies center assignment (bypassed for `ADMIN_ROLES` and `parent`), and establishes `AsyncLocalStorage` tenant context (`tenantId` from JWT or `x-tenant-id`).
2. **`requireCenterAccess()` (`src/middleware/center.middleware.ts`):** Extracts any `centerId`/`centerIds` in `params`, `body`, or `query`, verifies those centers belong to `req.user.tenantId` in PostgreSQL, and requires non-global roles (`center_admin`, `supervisor`, `teacher`, `staff`, `volunteer`) to hold every targeted center in `req.user.centerIds`.
3. **`requirePermission(PERMISSIONS.*)` (`src/middleware/permission.middleware.ts`):** Enforces role-to-permission grants from `src/config/rbac.ts`.
4. **`validate(schema)`:** Validates `req.body` / `req.query` / `req.params` using Zod schemas (`src/validators/`).

### Rate Limiting & Error Envelopes
- Global API limiter: `100` requests per 15 minutes in production (`5000` in dev), with `/api/sync` given a higher quota (`300` per 15 min in production).
- **Error Response (`src/middleware/errorHandler.ts`):**
  ```json
  {
    "success": false,
    "error": "Descriptive error message",
    "details": {}
  }
  ```
- **Database Unavailable (`503`):**
  ```json
  {
    "success": false,
    "code": "DB_UNAVAILABLE",
    "error": "Database is currently offline. Using local device storage."
  }
  ```

---

## Health Probes

| Method | Path | Access | Purpose |
| :--- | :--- | :--- | :--- |
| `GET` | `/health` | Public | Executes `SELECT 1` with 5s timeout (`200 ok` or `503 DB_UNAVAILABLE`) |
| `GET` | `/health/live` | Public | Fast process liveness probe (`200 alive`) |

---

## Authentication & Tenancy (`/api/auth`)

| Method | Path | Access | Purpose |
| :--- | :--- | :--- | :--- |
| `GET` | `/check-slug?slug=...` | Public | Check workspace slug availability |
| `POST` | `/register-instance` | Public | Provision new `Organization`, academic year, default center & `super_admin` |
| `POST` | `/register` | Public | Register a basic user account |
| `POST` | `/login` | Public | Authenticate (supports multi-workspace selection if `slug` omitted) |
| `POST` | `/refresh` | Public (Cookie) | Exchange `HttpOnly` `refreshToken` cookie for new access token |
| `POST` | `/logout` | Public | Clear `refreshToken` cookie |
| `GET` | `/me` | Auth | Current user profile, tenant metadata & `centerIds` |
| `POST` | `/change-password` | Auth | Update current user's password |

---

## Offline Sync (`/api/sync`)

| Method | Path | Access | Purpose |
| :--- | :--- | :--- | :--- |
| `GET` | `/pull` | Auth + Center | Delta pull (`?since=...`) of scoped offline tables + tombstones |
| `POST` | `/push` | Auth + Center | Causal batch push of outbox mutations with conflict detection & idempotency |

---

## Students, Dossier, Fees, Transfers & Guardians (`/api/students`)

| Method | Path | Access | Purpose |
| :--- | :--- | :--- | :--- |
| `GET` | `/` & `/filter` & `/dashboard` | Auth + Center | Paginated list, filtered queries, student summary counts |
| `POST` | `/` | `MANAGE_STUDENTS` | Create student |
| `GET` / `PUT` / `DELETE` | `/:id` | Auth / `MANAGE_STUDENTS` | Read, update, or soft-deactivate student |
| `GET` | `/:id/summary` & `/:id/profile` | Auth + Center | Profile stats, attendance trend, exam comparison, skills, careers |
| `GET` | `/:id/dossier` | Auth + Center | 360° longitudinal dossier timeline + vault documents |
| `GET` / `POST` / `DELETE` | `/:id/documents` (`/:documentId`) | Auth / `MANAGE_STUDENTS` | List, upload (Multer -> Cloudinary, 10MB max), or delete vault documents |
| `POST` | `/bulk-import` | `MANAGE_STUDENTS` | Atomic batch student import |
| `POST` | `/promote-cohort` | `MANAGE_STUDENTS` | Academic year cohort promotion / alumni / discontinued transition |
| `POST` / `GET` / `POST` | `/transfers/request`, `/transfers/pending`, `/transfers/complete` | `MANAGE_TRANSFERS` | Center transfer workflow |
| `POST` / `GET` / `PUT` | `/:studentId/fees`, `/:studentId/fees/update` | `MANAGE_FEES` / Auth | Record payments, list ledger, update total fees |
| `POST` / `DELETE` | `/:studentId/guardians` (`/:parentUserId`) | `MANAGE_STUDENTS` | Link or unlink `parent` user accounts |
| `POST`/`GET`/`PUT`/`DELETE` | `/:studentId/skills`, `/skills/matrix`, `/skills/bulk`, `/:studentId/careers` | `MANAGE_SKILLS` / `MANAGE_CAREERS` | Student skill logs, class skill matrix, and career records |

---

## Attendance, Exams, Skills & Activities

- **`/api/attendance`:** `POST /sessions`, `GET /sessions`, `GET /sessions/:sessionId`, `GET /sessions/:sessionId/records`, `PUT /sessions/:sessionId/records`, `PUT /sessions/:sessionId/holiday`, `GET /fresh-sheet`, `GET /register`, `GET /summary`, `GET /pending`, `GET /absentees`, `GET /students/:studentId`.
- **`/api/exams`:** `POST /`, `GET /`, `GET /comparison`, `GET /students/:studentId`, `GET /:examId/sheet`, `GET /:examId`, `POST /:examId/scores`, `GET /:examId/pending`.
- **`/api/skills`:** `GET /definitions`, `GET /student/:studentId`, `POST /`, `PUT /:skillLogId`, `DELETE /:skillLogId`.
- **`/api/activities`:** `GET /`, `POST /`, `GET /:activityId`, `PUT /:activityId`, `DELETE /:activityId`, `POST /:activityId/assign`, `DELETE /:activityId/assign/:userId`, `GET /:activityId/enrollments`, `GET /students/:studentId`, `POST /:activityId/enrollments`, `PATCH /:activityId/enrollments/:enrollmentId`, `DELETE /:activityId/enrollments/:enrollmentId`.
- **`/api/batches`:** `GET /`, `GET /:batchId`, `POST /`, `PUT /:batchId`, `DELETE /:batchId`, `POST /:batchId/enroll`, `DELETE /:batchId/enroll/:studentId`.

---

## Forms, Kobo, Organizations, Users, Alerts & Reporting

- **`/api/forms`:** Templates CRUD (`/templates`, `/templates/:templateId`), submissions (`/submissions`, `/submissions/:submissionId`, `/submissions/student/:studentId`), `/pending`.
- **`/api/kobo`:** `POST /sync/templates`, `POST /sync/submissions` (`MANAGE_FORMS`).
- **`/api/centers` & `/api/programs`:** Centers CRUD, center-program/user assignments, Programs CRUD, `/:programId/subjects`, `/:programId/skills`.
- **`/api/users`:** `GET /me/centers`, Users CRUD, `/:userId/reset-password`, `/:userId/centers`.
- **`/api/academic-years`:** `GET /`, `POST /`, `PATCH /:yearId/set-current`.
- **`/api/alerts`:** `GET /rules`, `POST /rules`, `PUT /rules/:ruleId`, `POST /evaluate`, `GET /`, `PATCH /:alertId/read`.
- **`/api/announcements`:** `GET /`, `POST /`, `PUT /:id`, `DELETE /:id`.
- **`/api/parent`:** `GET /children`, `GET /children/:studentId/progress` (`parent` role only).
- **`/api/dashboard`:** `GET /summary` (operational metrics & widgets).
- **`/api/reports`:** `GET /dashboard`, `GET /attendance`, `GET /skills`, `GET /exams`, `GET /students`, `GET /export` (CSV), `GET /workbook` (6-sheet Excel JSON payload).

---

## Real-Time Collaboration (`/api/chat/*`, `/api/notifications` & Socket.IO)

- **`/api/chat/conversations`:** Search chat users (`GET /users`), CRUD conversations, archive, members, read receipts, plus `/:conversationId/messages` (`POST`, `GET`, `GET /search`).
- **`/api/chat/messages`:** `GET /:messageId`, `PATCH /:messageId`, `DELETE /:messageId`, `POST/DELETE /:messageId/reactions`.
- **`/api/chat/attachments`:** `POST /` & `POST /:messageId` (Multer memory -> Cloudinary, 15MB max), `DELETE /:attachmentId`.
- **`/api/notifications`:** `GET /`, `GET /unread-count`, `PATCH /read-all`, `PATCH /:id/read`, `PATCH /:id/archive`.
- **Socket.IO Events (`/socket.io`):** Authenticated via `socket.handshake.auth.token`; supports `conversation:join/leave/focus/blur`, `typing:start/stop`, `presence:update`, `message:*`, `notification:*`, and `meeting:*` (`list`, `create`, `join`, `leave`, `end`, `lock-toggle`, `media-state`, `admin-mute`, `admin-kick`, `chat-send`, `reaction`, `webrtc-offer`, `webrtc-answer`, `webrtc-ice`).
