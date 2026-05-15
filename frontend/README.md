# SPARSHA web app (frontend)

React 19 + TypeScript + Vite + Tailwind CSS 4. Communicates with the backend over **`/api`** (proxied in development).

## Prerequisites

- **Node.js** 20+
- **npm**
- Backend running (default `http://localhost:5000`) when you use the dev proxy — see below.

## Environment (optional)

```bash
cp .env.example .env
```

| Variable | When to set |
|----------|-------------|
| `VITE_API_URL` | **Production builds** — full base URL to the API, including `/api` if that is your mount path (e.g. `https://api.example.com/api`). |
| *(omit)* | **Local dev** — Axios defaults to `baseURL: '/api'`; Vite proxies `/api` → `http://localhost:5000` (`vite.config.ts`). |

## Install

```bash
npm install
```

## Run (development)

Start the **backend first** (port 5000), then:

```bash
npm run dev
```

Open the printed URL (typically **`http://localhost:5173`**). Login uses the backend’s `/api/auth` routes.

## Build and preview

```bash
npm run build
npm run preview
```

For production, set `VITE_API_URL` to your deployed API base so the built static files call the correct host.

## Lint

```bash
npm run lint
```

## What is implemented

- **Auth:** Login; token in `localStorage` + Zustand; protected layout with sidebar and top bar.
- **Pages:** Dashboard, students (list, registration, **detail with charts**), attendance, skills, careers, **exams (bulk score grid)**, **forms** (list, builder, fill, submissions), reports (admin), settings.
- **API client:** `src/services/api.ts` — Axios with `withCredentials`, Bearer token, 401 → logout.
- **UI:** Brand palette (`brand-*`), Sora + DM Sans, shared components under `src/components/ui/`.
- **Charts:** Recharts on student profile and exam-related views.
- **PWA:** Manual manifest + service worker (see `public/`, `main.tsx`).

## What is not / gaps

- Access token is stored in **`localStorage`** (project convention); stricter XSS hygiene would use memory-only + refresh cookie flow end-to-end.
- Some list endpoints still use loose `Record<string, unknown>` types; DTOs could be tightened.
- `vite-plugin-pwa` is not the primary path; PWA is manual.

## Project layout

| Path | Role |
|------|------|
| `src/App.tsx` | Routes |
| `src/services/` | API modules (`api.ts`, `students.service.ts`, …) |
| `src/pages/` | Screens |
| `src/components/` | Layout and UI |
| `src/store/` | Zustand (`useAuthStore`) |
| `vite.config.ts` | Dev proxy for `/api` |
