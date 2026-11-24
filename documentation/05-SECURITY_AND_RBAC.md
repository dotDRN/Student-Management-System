# EdBase — Security, Multi-Tenancy & RBAC

EdBase protects student records and institutional data using tenant isolation, role-based permission checks, center scoping, transport security, and strict cookie/CORS policies.

---

## 1. Multi-Tenant Isolation

- Every JWT access/refresh token carries `tenantId` (bound to `Organization.id`).
- `authenticate` / `requireAuth` wraps the Express request lifecycle in `runWithTenantContext({ tenantId, userId, role }, ...)` (`backend/src/lib/tenantContext.ts`).
- `backend/src/lib/prisma.ts` uses a Prisma `$extends` query extension to automatically scope reads and writes on direct-tenant models (`tenantId`) and center-scoped models (`center: { tenantId }`).
- `requireCenterAccess()` explicitly checks that any `centerId` / `centerIds` passed in `params`, `body`, or `query` exist inside `req.user.tenantId`.
- Socket.IO connections join tenant-scoped rooms (`SocketRoomManager.getTenantRoomName(tenantId)`), isolating presence, chat broadcasts, and meeting room lobbies across organizations.
- Nightly cron (`backend/src/cron.ts`) iterates active organizations and runs `evaluateAlertRules()` inside each tenant's `runWithTenantContext`.

---

## 2. Role Hierarchy & Permissions (`backend/src/config/rbac.ts`)

Every `User` has one `UserRole`. Permissions are evaluated via `requirePermission(PERMISSIONS.*)` on the backend and `usePermission().can(action, resource)` on the frontend.

| Role | Scope | Capabilities |
| :--- | :--- | :--- |
| **`super_admin`** | Global (all centers in tenant) | All 15 permissions (`Object.values(PERMISSIONS)`), system settings, workspace administration |
| **`tech_admin`** | Global (all centers in tenant) | All 15 permissions (`Object.values(PERMISSIONS)`) and global center visibility (`GLOBAL_ADMIN_ROLES`) |
| **`center_admin`** | Center-scoped (`centerIds`) | All 15 permissions, strictly constrained to assigned centers |
| **`supervisor`** | Center-scoped (`centerIds`) | Dashboard, Students, Attendance, Exams, Exam Scores, Skills, Careers, Reports, Activities |
| **`teacher`** | Center-scoped (`centerIds`) | Dashboard, Students, Attendance, Exam Scores, Skills, Careers, Transfers, Reports, Activities |
| **`staff`** | Center-scoped (`centerIds`) | Dashboard, Students, Attendance, Reports |
| **`volunteer`** | Center-scoped (`centerIds`) | Dashboard (`VIEW_DASHBOARD`), assigned activities, attendance marking |
| **`parent`** | Linked children only (`ParentStudent`) | Read-only access to `/api/parent/children*` and `/parent` UI |
| **`shareholder`** | Reserved | Empty permission grant in `ROLE_PERMISSIONS` |

### Active Kill-Switch & Center Guards
- Setting `user.isActive = false` (or `organization.isActive = false`) blocks token refresh, API access (with `isActive === false` in JWT), and Socket.IO connections (`authenticateSocket` queries `user.isActive` live from the database).
- Non-admin staff/teacher/supervisor/volunteer accounts with zero active `UserCenterAssignment` rows are rejected at authentication (`No centers assigned to user.`). `parent` accounts are permitted without center assignments and restricted strictly to their `ParentStudent` links.

---

## 3. Center-Scoping Enforcement

1. When logging in or refreshing, `getCenterIdsByUserId()` queries active `UserCenterAssignment` records where `validUntil` is `null` or `>= today` (`UTC`).
2. `centerIds` is embedded in the signed JWT and verified by `requireCenterAccess()` (`backend/src/middleware/center.middleware.ts`) against `params.centerId`, `body.centerId`, `query.centerId`, and `body.centerIds`.
3. Services additionally apply `resolveCenterFilter(user, requestedCenterId)` / `assertCenterAccess(user, centerId)` (`src/lib/centerScope.ts`) for records fetched by primary key (`studentId`, `examId`, `sessionId`, `activityId`).

---

## 4. Authentication, Cookies, CORS & Transport Security

- **Passwords:** Hashed with `bcryptjs` (`SALT_ROUNDS = 10`). User service and auth service strip `passwordHash` from all API responses.
- **Access & Refresh Tokens (`src/utils/jwt.ts`, `src/controllers/auth.controller.ts`):**
  - Short-lived Bearer access token (`JWT_ACCESS_SECRET`) sent via `Authorization: Bearer <token>`.
  - 7-day `HttpOnly` `refreshToken` cookie (`JWT_REFRESH_SECRET`), cleared with matching `{ httpOnly, secure, sameSite, path: "/" }` attributes on logout/invalid refresh.
  - `COOKIE_SAME_SITE` defaults to `lax` (set `COOKIE_CROSS_SITE=true` or `COOKIE_SAME_SITE=none` only when frontend and backend are deployed on different domains).
- **CORS (`src/config/cors.ts`):** Enforces explicit origin allowlists (`CLIENT_URL`, `FRONTEND_URL`, `CORS_ORIGINS`, `RENDER_EXTERNAL_URL`) for both Express and Socket.IO (`localhost`/`127.0.0.1` allowed only when `NODE_ENV !== "production"`).
- **AI Guardrails (`src/services/ai/piiGuard.ts` & `universalOrchestrator.ts`):** AI tool calls, hybrid RAG search, episodic threads, and entity memories enforce tenant + center isolation, block `parent` access to the staff copilot or unlinked students, and apply vertical PII redaction for restricted roles before passing context to Gemini.
- **HTTP Hardening (`src/app.ts`):**
  - `app.set("trust proxy", 1)` for accurate client IP rate limiting behind Render's proxy.
  - `helmet` security headers with CSP tuned for `'self'`, Google Fonts, Cloudinary assets, WebSockets (`ws:`/`wss:`), and PWA service workers (`worker-src 'self' blob:`).
  - CSV exports (`src/utils/exportSanitize.ts`) neutralize spreadsheet formula injection (`=`, `+`, `-`, `@`).
