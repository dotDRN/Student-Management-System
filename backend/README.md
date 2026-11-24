# EdBase API (`backend`)

**Version:** `1.4.0`

Express 5 + TypeScript backend for the **EdBase** multi-tenant academic operations and student workspace platform. Uses Prisma 7 (`@prisma/adapter-pg` + `pg`), PostgreSQL 15+ (Supabase compatible), Zod v4 validation, Socket.IO real-time messaging/WebRTC signaling, Cloudinary storage, and `node-cron`.

## Prerequisites

- **Node.js** 22+
- **PostgreSQL** 15+ reachable via `DATABASE_URL` (and `DIRECT_URL` when using Supabase PgBouncer)
- **npm**

## Environment Setup

```bash
cp .env.example .env
```

| Variable | Required | Description |
| :--- | :--- | :--- |
| `DATABASE_URL` | Yes | Runtime PostgreSQL URI (Supabase Transaction Pooler `:6543` or direct `:5432`) |
| `DIRECT_URL` | Recommended | Direct/Session PostgreSQL URI (`:5432`) used by Prisma CLI (`prisma.config.ts`) |
| `JWT_ACCESS_SECRET` | Yes | Secret for signing short-lived JWT access tokens |
| `JWT_REFRESH_SECRET` | Yes | Secret for signing 7-day HttpOnly refresh tokens |
| `PORT` | No | Server port (default `5000`) |
| `NODE_ENV` | No | `development` or `production` |
| `APP_TIMEZONE` | No | IANA timezone for date-only calculations & nightly cron (e.g. `Asia/Kolkata`, default `UTC`) |
| `CLIENT_URL` / `FRONTEND_URL` / `CORS_ORIGINS` | Prod | Comma-separated allowed frontend origin(s) for Express & Socket.IO CORS |
| `COOKIE_SAME_SITE` | No | Refresh cookie `SameSite` policy (`lax`, `strict`, or `none`; default `lax`) |
| `COOKIE_CROSS_SITE` | No | Set `true` if frontend and API live on different domains (`SameSite=None; Secure`) |
| `DB_POOL_MAX` | No | Max `pg.Pool` connections (default `10`) |
| `DATABASE_SSL` | No | Override SSL (`true`/`false`); auto-enabled for non-local databases |
| `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` (or `CLOUDINARY_URL`) | Media | Required for chat attachments and student dossier document uploads |
| `KOBO_API_URL`, `KOBO_API_TOKEN` | Optional | KoboToolbox survey & submission sync |
| `GEMINI_API_KEY`, `GEMINI_MODEL`, `GEMINI_EMBEDDING_MODEL` | Optional | Google Gemini API key and models (`gemini-2.5-flash`, `text-embedding-004`) for the Universal AI Orchestrator |

## Install & Database Setup

Run from `backend/`:

```bash
npm install
npx prisma generate
npx prisma migrate deploy
```

For local schema development:

```bash
npx prisma migrate dev
```

Optional sample data (**wipes all existing data first — dev only!**):

```bash
npx prisma db seed
```

## Scripts

| Script | Command | Purpose |
| :--- | :--- | :--- |
| `npm run dev` | `tsx watch src/server.ts` | Start hot-reloading TypeScript dev server |
| `npm run build` | `prisma generate && tsc` | Generate Prisma Client and compile to `dist/` |
| `npm start` | `node dist/server.js` | Run compiled production server (with graceful `SIGTERM`/`SIGINT` shutdown) |
| `npm run test:unit` | `node --import tsx --test src/__tests__/*.unit.test.ts` | Run all backend unit test suites |
| `npm run db:setup` | `prisma generate && prisma migrate deploy` | Apply Prisma migrations in CI/production |
| `npm run db:reset` | `prisma migrate reset --force` | Reset local development database |
| `npm run db:backup` | `./scripts/db-backup.sh` | Dump `DATABASE_URL` to `backend/backups/edbase_backup_*.sql` |
| `npm run db:restore` | `./scripts/db-restore.sh` | Restore a SQL backup (`npm run db:restore -- ./backups/<file>.sql`) |

## Core Domains & Routes (`src/app.ts`)

- **Health:** `GET /health` (DB connectivity check with 5s timeout, returns `503 DB_UNAVAILABLE` if offline), `GET /health/live` (liveness probe)
- **Auth & Multi-Tenancy:** `/api/auth` (`check-slug`, `register-instance`, `login`, `refresh`, `logout`, `me`, `change-password`)
- **Offline Sync:** `/api/sync` (`GET /pull`, `POST /push` with causal ordering, 3-way conflict resolution, and `SyncOperationLog` idempotency)
- **Academics & Operations:** `/api/students` (CRUD, profile, 360° dossier & document vault, fees, transfers, cohort promotion, bulk import, guardians), `/api/attendance`, `/api/exams`, `/api/skills`, `/api/activities`, `/api/batches`, `/api/forms`, `/api/kobo`
- **Organization & Governance:** `/api/centers`, `/api/programs`, `/api/users`, `/api/academic-years`, `/api/alerts`, `/api/announcements`, `/api/dashboard`, `/api/reports`, `/api/parent`
- **Real-Time Collaboration:** `/api/chat/conversations`, `/api/chat/messages`, `/api/chat/attachments`, `/api/notifications`, plus Socket.IO namespaces/events for presence, messaging, notifications, and WebRTC meeting rooms.
- **Universal AI Orchestrator:** `/api/ai` (`status`, `chat`, `threads`, `rag/search`, `students/:studentId/briefing`, `students/:studentId/career-playbook`, `memories`) backed by `@google/genai`, hybrid RAG, dual-layer memory, and `piiGuard.ts`.

## Layout

| Path | Role |
| :--- | :--- |
| `prisma/schema.prisma` | PostgreSQL schema (`Organization` multi-tenancy, academic, sync, chat, notifications) |
| `prisma.config.ts` | Prisma 7 CLI datasource (`DIRECT_URL \|\| DATABASE_URL`) & seed config |
| `src/server.ts` | Startup env validation, HTTP + Socket.IO boot, cron start, graceful shutdown |
| `src/app.ts` | Express 5 middleware pipeline, rate limiters, API route mounts, SPA fallback |
| `src/cron.ts` | Nightly tenant-scoped attendance auto-submit & alert evaluation (`node-cron`) |
| `src/lib/` | Prisma `$extends` tenant scoping + `pg.Pool`, `AsyncLocalStorage` context, auth, Cloudinary |
| `src/middleware/` | Auth, center access, RBAC permission guard, Zod validation, `503` error handler |
| `src/socket/` | Socket.IO auth, tenant/conversation rooms, active tracker, WebRTC meeting manager |
| `src/routes/`, `src/controllers/`, `src/services/`, `src/validators/` | 100% TypeScript modular API layers |
| `src/__tests__/` | Unit test suites (Node native test runner + `tsx`) |
