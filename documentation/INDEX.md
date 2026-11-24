# EdBase — Documentation Index

Welcome to the official maintainer and operator documentation for **EdBase** (`v1.4.0`), a multi-tenant, offline-first academic operations and student workspace platform.

Read the guides in order for a complete picture of the system:

## 1. System Fundamentals
* [01-ARCHITECTURE.md](./01-ARCHITECTURE.md) — System topology, monolith/split deployment options, Express 5 "Fat Service, Thin Controller" layering, multi-tenancy (`AsyncLocalStorage` + Prisma `$extends`), offline-first Dexie sync, Socket.IO/WebRTC, and `node-cron`.
* [02-DEPLOYMENT.md](./02-DEPLOYMENT.md) — Production deployment on **Render + Supabase** (`render.yaml`, PgBouncer pooling, SSL, environment variables, Cloudinary), Docker Compose setup, and local development.

## 2. Data, API & Security
* [03-DATABASE.md](./03-DATABASE.md) — PostgreSQL + Prisma 7 schema (`prisma.config.ts` & `@prisma/adapter-pg`), multi-tenant models, offline sync metadata (`version`, `deletedAt`, `SyncOperationLog`), and migration workflow.
* [04-API_REFERENCE.md](./04-API_REFERENCE.md) — Middleware pipeline, error & `503 DB_UNAVAILABLE` offline envelopes, REST endpoints under `/api/*`, `/health`, and Socket.IO/WebRTC events.
* [05-SECURITY_AND_RBAC.md](./05-SECURITY_AND_RBAC.md) — Tenant isolation, role-permission matrix (`super_admin`, `tech_admin`, `center_admin`, `supervisor`, `teacher`, `staff`, `volunteer`, `parent`, `shareholder`), center-scoping, JWT + HttpOnly refresh cookie flow, rate limiting, and Helmet CSP.

## 3. Client & Operations
* [06-FRONTEND.md](./06-FRONTEND.md) — React 19 / Vite 8 / Tailwind v4 architecture, Zustand stores, `usePermission`, Dexie offline sync engine, Workbox PWA, real-time hooks, and route guards.
* [07-MAINTENANCE.md](./07-MAINTENANCE.md) — **Maintainer Playbook.** Adding schema fields & API endpoints, Supabase/Render troubleshooting, offline sync conflict handling, automated tests, and database backup/restore.
