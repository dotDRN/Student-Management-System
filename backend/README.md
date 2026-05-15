# SPARSHA API (backend)

Express API for the SPARSHA student administration system: PostgreSQL via Prisma, JWT auth, JSON routes under `/api`.

## Prerequisites

- **Node.js** 20+ (22+ recommended for Prisma 7)
- **PostgreSQL** reachable via `DATABASE_URL`
- **npm**

## Environment

1. Copy the example env file:

```bash
cp .env.example .env
```

2. Edit `.env` and set at minimum:

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `JWT_ACCESS_SECRET` | Yes | Secret for signing access tokens |
| `JWT_REFRESH_SECRET` | Yes | Secret for refresh tokens (if refresh flow enabled) |
| `PORT` | No | Default `5000` |
| `CLIENT_URL` | No | Frontend origin for CORS (dev: `http://localhost:5173`) |

## Install and database

Run these **in order** from the `backend/` directory:

```bash
npm install
```

```bash
npx prisma generate
```

```bash
npx prisma migrate deploy
```

If you are creating a new database from scratch locally, use `npx prisma migrate dev` instead of `deploy` during development (creates/updates DB and applies migrations).

Optional sample data:

```bash
npx prisma db seed
```

## Run (development)

```bash
npm run dev
```

API listens on `http://localhost:5000` (or `PORT`). Health check: `GET http://localhost:5000/health`.

All JSON APIs are under **`/api`** (e.g. `http://localhost:5000/api/auth/login`).

## Build and run (production)

```bash
npm run build
npm run start
```

Requires `npm run build` to emit `dist/` and a configured `DATABASE_URL` on the server.

## What is implemented

- **Auth:** `/api/auth` — login, register, refresh, logout, `/me` (see routes for exact paths).
- **Students:** CRUD, `/api/students/:id/summary`, **`/api/students/:id/profile`** (aggregated dashboard payload).
- **Attendance:** sessions and records under `/api/attendance`.
- **Exams:** list/create, **`/api/exams/:examId/scores`** bulk upsert, student scores, comparison.
- **Forms:** templates CRUD, submissions under `/api/forms`.
- **Centers / programs / users / activities** as registered in `src/app.ts`.
- **Reports:** `/api/reports/dashboard`, analytics, **`/api/reports/pending`**, CSV export (admin).
- **Dashboard alerts:** **`GET /api/dashboard/pending`** — numeric counts for UI badges.

**Center scoping:** Non-admin users get `centerIds` from JWT (active `UserCenterAssignment` rows with `validUntil: null`). Services use `centerScope` / equivalent filters.

**Mixed codebase:** Some routes are TypeScript (`.ts`), others JavaScript (`.js`); behavior is unified through `app.ts`.

## What is not / gaps

- Automated API tests (Jest/Supertest) are not wired in `package.json`.
- `attachAllowedCenters` middleware exists but is not necessarily mounted on every route; enforcement relies primarily on services + JWT `centerIds`.
- Legacy `student.service.js` references old Prisma models in places; keep schema and services aligned when changing the DB.

## Layout

| Path | Role |
|------|------|
| `src/app.ts` | Express app, mounts `/api/*` |
| `src/server.ts` | HTTP server entry |
| `prisma/schema.prisma` | Data model |
| `prisma/migrations/` | SQL migrations |
| `prisma/seed.ts` | Seed script |
| `src/routes/` | Route modules |
| `src/controllers/`, `src/services/` | Handlers and domain logic |
| `src/middleware/` | Auth, validation, errors |

## Prisma commands (reference)

```bash
npx prisma generate          # Regenerate client after schema change
npx prisma migrate dev       # Dev: create migration + apply
npx prisma migrate deploy    # CI/prod: apply existing migrations
npx prisma db seed           # Run seed
npx prisma studio            # GUI for data (optional)
```

## SQL backup and restore

With `DATABASE_URL` configured, run:

```bash
npm run db:backup
```

This creates a timestamped `.sql` file in `backend/backups/`.

Restore from a backup file:

```bash
npm run db:restore -- ./backups/<backup-file>.sql
```
