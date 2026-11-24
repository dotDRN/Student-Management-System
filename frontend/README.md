# EdBase Web App (`frontend`)

**Version:** `2.0.0`

React 19 + TypeScript + Vite 8 + Tailwind CSS v4 frontend for **EdBase**, featuring offline-first local storage (Dexie.js IndexedDB + sync engine), Workbox PWA caching (`vite-plugin-pwa`), real-time Socket.IO chat/notifications, and WebRTC staff meeting rooms.

## Prerequisites

- **Node.js** 22+
- **npm**
- Running backend API on port `5000` when using the Vite dev proxy

## Environment Variables (Optional)

```bash
cp .env.example .env
```

| Variable | Description |
| :--- | :--- |
| `VITE_API_URL` | Omit or set `/api` for Vite dev proxy and single-service Express deploys. Set full origin + `/api` (e.g. `https://api.example.com/api`) for split-origin deployments. |
| `VITE_KOBO_URL` | Optional custom KoboToolbox portal URL opened from the Forms page (defaults to `https://kf.kobotoolbox.org`). |

## Install & Run

```bash
npm install --legacy-peer-deps
npm run dev
```

Opens at `http://localhost:5173`. Vite proxies `/api`, `/health`, and `/socket.io` (WebSockets) to `http://localhost:5000`.

## Scripts

| Script | Command | Purpose |
| :--- | :--- | :--- |
| `npm run dev` | `vite` | Start Vite dev server with HMR & dev Workbox PWA |
| `npm run build` | `tsc -b && vite build` | Type-check and build production bundle + PWA (`dist/`) |
| `npm run lint` | `eslint .` | Lint all TypeScript/React source files |
| `npm test` | `node --test tests/*.test.ts` | Run QR/offline queue and sync engine helper unit tests |
| `npm run preview` | `vite preview` | Preview production build locally |

## Implemented Architecture

- **Auth & Multi-Tenant Session (`src/store/useAuthStore.ts`, `src/App.tsx`):** JWT access token in Zustand + 7-day HttpOnly refresh cookie (`/api/auth/refresh`), workspace slug switching, and offline startup fallback when network or database is unavailable.
- **Offline-First Storage & Sync (`src/offline/`):** Per-tenant/per-user Dexie IndexedDB databases (`offlineDb.ts`), read-through caching + offline mutation outbox (`offlineServiceHelper.ts`), causal outbox sorting + temp ID remapping (`outboxHelpers.ts`), and bidirectional sync (`syncEngine.ts`, `useSyncStore.ts`).
- **PWA (`vite.config.ts`):** `vite-plugin-pwa` (`generateSW`) with `NetworkOnly` rules for `/api/`, `/socket.io/`, and `/health`, plus Rolldown vendor code splitting.
- **Real-Time Collaboration:** Socket.IO client (`src/services/socket.service.ts`), live chat & attachments (`src/pages/ChatPage.tsx`, `src/hooks/useChatSocket.ts`), notification drawer & browser notifications (`src/notifications/`), and WebRTC staff meeting rooms (`src/pages/MeetingRoomsPage.tsx`, `src/hooks/useWebRTCMeeting.ts`).
- **AI Copilot & Intelligence (`src/components/ai/`, `src/services/ai.service.ts`, `src/store/useAiCopilotStore.ts`):** Global staff AI Copilot drawer (`AiCopilotDrawer`), 360° Student AI Briefing card (`StudentAiBriefingCard`), and Career AI Guidance panel (`CareerAiGuidancePanel`).
- **UI & Design System:** Tailwind CSS v4 (`brand-*` indigo palette), `Inter`, `Plus Jakarta Sans`, and `JetBrains Mono` fonts, shared UI components (`src/components/ui/`), Recharts analytics, QR ID cards & scanner, and SheetJS (`xlsx`) exports.

## Project Layout

| Path | Role |
| :--- | :--- |
| `src/App.tsx` | Auth bootstrap and 4-tier `RoleGuard` + `ParentPortal` route configuration |
| `src/pages/` | Feature screens (Dashboard, Students, Attendance, Exams, Skills, Careers, Activities, Forms, Reports, Centers, Programs, Users, Settings, Announcements, Chat, Notifications, MeetingRooms, ParentPortal) |
| `src/components/` | Feature modules and reusable UI primitives (`ui/`, `layout/`, `chat/`, `students/`, `attendance/`, `activities/`, `dashboard/`, `forms/`, `settings/`, `skills/`, `sync/`, `toast/`) |
| `src/offline/` | Dexie schema, outbox helpers, offline service wrappers, and `SyncEngine` |
| `src/notifications/` | Browser notification permissions, visibility filters, and dispatcher |
| `src/services/` | Axios API client (`api.ts`), Socket.IO client (`socket.service.ts`), and domain service modules |
| `src/store/` | Zustand stores (`useAuthStore`, `useChatStore`, `useNotificationStore`, `useSyncStore`, `useToastStore`) |
| `src/utils/` | API URL resolution (`apiBase.ts`), `cn`, date, QR payloads, offline attendance queue, Excel export, and RBAC helpers |
| `tests/` | Unit tests for QR payloads, offline queue coalescing, and sync outbox helpers |
