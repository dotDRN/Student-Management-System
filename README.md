# EdBase — Multi-Tenant Academic Operations & Student Workspace Platform

**Version:** `2.0.0`

**EdBase** is an offline-capable, multi-tenant institutional operations and learner intelligence platform built to manage distributed centers, academic lifecycles, student progress, dynamic form workflows, real-time staff communication, and guardian engagement.

## Key Capabilities

- **Multi-Tenant Workspaces (`Organization`):** Tenant isolation enforced via `AsyncLocalStorage` and Prisma `$extends`, with self-service workspace onboarding (`/api/auth/register-instance` & slug availability check).
- **Offline-First PWA & Hybrid Sync:** IndexedDB local persistence (`Dexie.js`), Workbox service worker (`vite-plugin-pwa`), causal outbox queue, field-level 3-way conflict detection, and `503 DB_UNAVAILABLE` offline fallback.
- **Student Lifecycle & 360° Dossier:** Student enrollment, bulk import, cohort promotion, center transfers, fee ledger, guardian linking, longitudinal dossier timeline, Cloudinary-backed document vault, and printable QR student ID cards with QR attendance scanning.
- **Academics, Attendance & Holistic Tracking:** Fresh daily attendance sheets, holiday handling, monthly registers, consecutive-absence streaks, dynamic-subject exams with baseline/midline/endline comparison, skill matrices, career tracking, batches, and activity enrollments.
- **Early-Warning Alerts & Nightly Automation:** Configurable risk rules (`consecutive_absences`, `attendance_30d_pct`, `exam_score_drop_pct`, `fee_overdue_balance`) evaluated per active tenant via `node-cron`.
- **Parent / Guardian Portal:** Read-only `/parent` portal scoped strictly to `ParentStudent` links.
- **Real-Time Collaboration:** Socket.IO chat (direct/group/entity threads, attachments, reactions, read receipts), persistent in-app & browser notifications, and peer-to-peer WebRTC staff meeting rooms (voice, video, screen share, moderation, ephemeral chat).
- **Dynamic Forms & Reporting:** JSON-schema form builder, KoboToolbox sync, filtered analytics, CSV export (with formula neutralization), and multi-sheet Excel master workbooks (`xlsx`).
- **Universal AI Orchestrator & Dual-Layer Memory (Google Gemini):** Role- and center-scoped AI Copilot (`AiCopilotDrawer`), hybrid semantic + lexical RAG search, episodic threads & long-term institutional entity memory, 360° Student AI Briefings, 30-60-90 Day Career Guidance Playbooks, and vertical PII redaction (`piiGuard.ts`).

## Tech Stack

- **Frontend:** React 19, TypeScript, Vite 8, Tailwind CSS v4, Zustand, TanStack React Query v5, Dexie.js, Workbox (`vite-plugin-pwa`), Socket.IO Client, Recharts, SheetJS (`xlsx`), QRCode.
- **Backend:** Node.js 22+, Express 5, TypeScript, Prisma 7 (`@prisma/adapter-pg` + `pg`), PostgreSQL 15+ (Supabase compatible), Zod v4, Socket.IO, Google Gemini (`@google/genai`), Cloudinary, Multer, `node-cron`, Helmet, `express-rate-limit`.

---

## Documentation

Start with **[Documentation Index](./documentation/INDEX.md)** or jump directly to a guide:

1. [System Architecture](./documentation/01-ARCHITECTURE.md)
2. [Deployment (Render, Supabase & Docker)](./documentation/02-DEPLOYMENT.md)
3. [Database Architecture](./documentation/03-DATABASE.md)
4. [API Reference](./documentation/04-API_REFERENCE.md)
5. [Security, Multi-Tenancy & RBAC](./documentation/05-SECURITY_AND_RBAC.md)
6. [Frontend Guide](./documentation/06-FRONTEND.md)
7. [Maintenance Playbook](./documentation/07-MAINTENANCE.md)

---

## Prerequisites

- **Node.js** 22+ and **npm**
- **PostgreSQL** 15+ (local Postgres, Docker, or managed **Supabase**)

## Quick Start (Local Development)

1. **Install all dependencies:**
   ```bash
   npm run install:all
   ```
2. **Configure environment variables:**
   Copy `backend/.env.example` to `backend/.env` (and optionally `frontend/.env.example` to `frontend/.env`). Set `DATABASE_URL`, `DIRECT_URL`, `JWT_ACCESS_SECRET`, and `JWT_REFRESH_SECRET` in `backend/.env`.
3. **Run migrations and generate Prisma Client:**
   ```bash
   npm run db:deploy
   ```
   *(For creating new local migrations during development, run `npx prisma migrate dev` inside `backend/`.)*
4. **Seed development sample data (optional — dev databases only!):**
   > **Warning:** `prisma db seed` deletes all existing rows across every table before inserting demo records. Never run it on a production database.
   ```bash
   npx --prefix backend prisma db seed
   ```
   Seeded demo workspace & credentials:
   - **Workspace slug:** `default`
   - **Super Admin:** `super_admin@edbase.org` / `SuperAdmin@123`
   - **Tech Admin:** `tech_admin@edbase.org` / `SuperAdmin@123`
   - **Center Admins / Teachers / Staff:** `center_admin_1@edbase.org`, `teacher_1@edbase.org`, `staff_1@edbase.org` / `Staff@123`
5. **Start both dev servers:**
   ```bash
   npm run dev
   ```
   - Frontend: `http://localhost:5173` (proxies `/api`, `/health`, and `/socket.io` to port `5000`)
   - Backend: `http://localhost:5000`

---

## Scripts (Root)

| Command | Purpose |
| :--- | :--- |
| `npm run install:all` | Install root, backend, and frontend dependencies |
| `npm run dev` | Run backend (`tsx watch`) and frontend (`vite`) concurrently |
| `npm run build` | Install dependencies and build both backend and frontend for production |
| `npm run build:backend` | Generate Prisma Client and compile TypeScript (`backend/dist`) |
| `npm run build:frontend` | Type-check (`tsc -b`) and bundle frontend + PWA (`frontend/dist`) |
| `npm start` | Start production Express server (`node backend/dist/server.js`, also serves `frontend/dist`) |
| `npm run db:deploy` | Generate Prisma Client and apply pending migrations (`prisma migrate deploy`) |
| `npm run lint` | Run ESLint across `frontend/` |
| `npm test` | Run all backend and frontend unit tests |

---

## Production Deployment (Render + Supabase)

EdBase is configured via [`render.yaml`](./render.yaml) to run as a single **Render Web Service** (Express API + Socket.IO + static `frontend/dist` SPA) backed by **Supabase PostgreSQL**:

1. Create a Supabase project and collect both the **Transaction Pooler** connection string (`DATABASE_URL`, port `6543` with `?pgbouncer=true&sslmode=require`) and the **Direct/Session** connection string (`DIRECT_URL`, port `5432`).
2. Deploy via Render Blueprint (`render.yaml`) or create a Node Web Service with:
   - **Build Command:** `npm run build`
   - **Start Command:** `npm run db:deploy && npm start`
   - **Health Check Path:** `/health`
3. Configure `DATABASE_URL`, `DIRECT_URL`, `CLIENT_URL`, `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, and Cloudinary credentials (`CLOUDINARY_*`).

See **[Deployment Guide](./documentation/02-DEPLOYMENT.md)** for full step-by-step instructions and Docker Compose usage.

---

## Repository Layout

```text
├── backend/              # Express 5 API, Socket.IO, Prisma 7 schema & migrations, tests
├── frontend/             # React 19 + Vite 8 SPA, Dexie offline DB, Workbox PWA, tests
├── documentation/        # Architecture, deployment, database, API, RBAC, and maintenance guides
├── scripts/              # Host helper scripts (e.g., Docker DNS helper)
├── Dockerfile            # Multi-stage production container image (Node 22 + Prisma 7)
├── docker-compose.yml    # Containerized app + PostgreSQL 15 stack
├── render.yaml           # Render Blueprint infrastructure spec
└── package.json          # Root monorepo orchestration scripts
```

## License
Proprietary unless stated otherwise.
