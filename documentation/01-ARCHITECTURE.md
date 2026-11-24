# EdBase — System Architecture

**Version:** `1.4.0`

**EdBase** is a multi-tenant, offline-first academic operations and student workspace platform designed for multi-center educational institutions and NGOs.

---

## High-Level Topology

The repository is organized as a monorepo with two decoupled TypeScript applications that can run independently in development or as a single unified service in production:

1. **Frontend (`/frontend`):** React 19 + TypeScript SPA bundled with Vite 8, Tailwind CSS v4, Dexie.js (IndexedDB), and Workbox (`vite-plugin-pwa`).
2. **Backend (`/backend`):** Node.js 22+ + Express 5 + Socket.IO server backed by PostgreSQL 15+ (Supabase compatible) via Prisma 7 (`@prisma/adapter-pg` + `pg`).

In production (`NODE_ENV=production`), if `frontend/dist/index.html` exists, Express serves the compiled frontend assets and SPA fallback directly alongside `/api/*`, `/health`, and `/socket.io/*` from a single origin.

### Communication Channels

- **HTTP/REST (`/api/*`):** Primary CRUD, analytics, exports, file uploads, and bidirectional offline sync (`/api/sync/pull`, `/api/sync/push`).
- **WebSockets (`Socket.IO` on `/socket.io`):** Real-time tenant-isolated chat, typing indicators, online presence, live notification delivery, and WebRTC signaling for staff meeting rooms.
- **Peer-to-Peer Media (`WebRTC`):** Browser-to-browser audio, video, and screen sharing orchestrated via Socket.IO signaling (`meeting:webrtc-offer`, `meeting:webrtc-answer`, `meeting:webrtc-ice`).

---

## Frontend Architecture (`/frontend`)

### Core Stack
- **UI & Routing:** React 19, React Router v7 (`ProtectedRoute`, 4-level `RoleGuard`, `/parent` guardian portal).
- **State Management:** Zustand (`useAuthStore`, `useSyncStore`, `useChatStore`, `useNotificationStore`, `useToastStore`).
- **Server & Local State:** TanStack React Query v5 paired with **Dexie.js** IndexedDB databases partitioned per `(tenantId, userId)`.
- **Offline-First & PWA:** `vite-plugin-pwa` generates a Workbox service worker (`dist/sw.js`) with `NetworkOnly` rules for `/api/`, `/socket.io/`, and `/health`, while `SyncEngine` manages causal outbox ordering, temporary ID remapping, and conflict resolution.
- **Visualizations, QR & Exports:** Recharts, `qrcode` (printable student ID cards & scanner modal), and SheetJS (`xlsx`) master workbooks.

### Frontend Layering
- `src/utils/apiBase.ts`: Resolves `API_BASE_URL`, `/health`, and Socket.IO URL consistently across relative (`/api`) and cross-origin deployments.
- `src/services/`: Domain API modules using the central Axios instance (`api.ts`), wrapping reads/writes with `withOfflineRead` and `withOfflineMutation`.
- `src/offline/`: `EdBaseOfflineDb` schema, causal outbox helpers, and `SyncEngine`.
- `src/pages/` & `src/components/`: Feature views and reusable UI primitives (`src/components/ui/`).

---

## Backend Architecture (`/backend`)

### Core Stack
- **Runtime & Framework:** Node.js 22+, Express 5, 100% strict TypeScript (`"type": "module"`).
- **Database Layer:** Prisma 7 (`prisma.config.ts`) using `@prisma/adapter-pg` and `pg.Pool` with SSL auto-detection and PgBouncer resilience.
- **Validation & Security:** Zod v4 schemas, Helmet (with CSP for Google Fonts, Cloudinary, WebSockets, and Service Workers), `express-rate-limit` (proxy-aware via `trust proxy`), strict origin allowlists (`src/config/cors.ts`), and `bcryptjs` + JWT access/refresh tokens.
- **Media, AI & Automation:** Multer memory storage streaming directly to Cloudinary (`src/lib/cloudinary.ts`), Universal AI Orchestrator (`src/services/ai/`) using Google Gemini (`@google/genai`) with tool calling, hybrid RAG, dual-layer memory, and `piiGuard.ts`, plus `node-cron` (`src/cron.ts`) for nightly pending-attendance auto-submission and tenant-scoped risk alert evaluation.

### Layered Pattern: Routes -> Controllers -> Services
1. **Routes (`src/routes/`):** Define endpoint paths and compose middleware (`authenticate`/`requireAuth`, `requireCenterAccess()`, `requirePermission()`, `validate(schema)`).
2. **Controllers (`src/controllers/`):** Parse request parameters, call services, and return JSON responses (or forward errors to `errorHandler`).
3. **Services (`src/services/`):** Encapsulate business rules, Prisma transactions, center scoping, and domain errors (`src/lib/errors.ts`).
4. **Validators (`src/validators/`):** Zod schemas for payloads and queries.

---

## Multi-Tenancy & Isolation

Every request runs inside an `AsyncLocalStorage` store (`src/lib/tenantContext.ts`) populated during authentication (`authenticate` / `requireAuth`) and Socket.IO handshake (`authenticateSocket`):

- `src/lib/prisma.ts` wraps `PrismaClient` with `$extends` to inject `tenantId` automatically on queries/creates/upserts for direct-tenant models (`AcademicYear`, `Center`, `Program`, `User`, `FormTemplate`, `Announcement`, `AlertRule`, `AuditLog`, `Conversation`, `Notification`, `SyncOperationLog`) and via `center: { tenantId }` for center-scoped models.
- Cross-tenant lookups (such as login discovery and slug checks) explicitly opt out via `runWithoutTenantScope`.

---

## Resilience & Offline Sync Architecture

- **Optimistic Locking & Tombstones:** Core synced models carry `version` counters and `deletedAt` timestamps so incremental pulls (`GET /api/sync/pull`) and conflict detection work deterministically.
- **Hybrid Conflict Resolution (`src/services/syncConflictResolver.ts`):** Uses field-level 3-way merge on students, definitive-wins arbitration on pending attendance, and `LOCKED_VERIFIED` protection for verified exam scores.
- **Database Outage Detection (`errorHandler.ts` & `/health`):** When PostgreSQL is unreachable, backend returns HTTP `503` with `code: "DB_UNAVAILABLE"`, signaling the frontend to preserve local offline sessions and queue mutations in IndexedDB.
