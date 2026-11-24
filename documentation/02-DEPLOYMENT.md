# EdBase — Deployment & Infrastructure

This guide covers deploying **EdBase** (`v1.4.0`) to **Render + Supabase** for production, running via **Docker Compose**, and setting up **local development**.

---

## 1. Production Deployment: Render + Supabase

EdBase is designed to deploy cleanly as a **single Render Web Service** (Express 5 API + Socket.IO + static `frontend/dist` SPA) backed by a **Supabase PostgreSQL** database.

### Step A: Prepare Supabase PostgreSQL

1. Create a new project in [Supabase](https://supabase.com/).
2. Open **Project Settings -> Database** (or the **Connect** button) and copy **both** connection strings:
   - **Transaction Pooler (Port `6543`) -> `DATABASE_URL`:**
     Used at runtime by `pg.Pool` + `@prisma/adapter-pg`. Append `?pgbouncer=true&sslmode=require` (replace `[YOUR-PASSWORD]` with your database password).
     ```text
     postgresql://postgres.[PROJECT-REF]:[PASSWORD]@aws-0-[REGION].pooler.supabase.com:6543/postgres?pgbouncer=true&sslmode=require
     ```
   - **Session Pooler or Direct Connection (Port `5432`) -> `DIRECT_URL`:**
     Used by `backend/prisma.config.ts` during `prisma migrate deploy` (Prisma migrations require a direct/session connection rather than PgBouncer transaction mode).
     ```text
     postgresql://postgres.[PROJECT-REF]:[PASSWORD]@aws-0-[REGION].pooler.supabase.com:5432/postgres?sslmode=require
     ```
   *(Note: If your Render region/network uses IPv4 only and Supabase Direct `db.<ref>.supabase.co` resolves to IPv6, use Supabase's **Session Pooler** URI on port `5432` for `DIRECT_URL`.)*

### Step B: Prepare Cloudinary (Recommended for Uploads)

Chat file/image attachments (`POST /api/chat/attachments`) and Student Document Vault uploads (`POST /api/students/:id/documents`) stream directly from memory to **Cloudinary** (Render's local filesystem is ephemeral):

1. Create a free Cloudinary account and copy **Cloud Name**, **API Key**, and **API Secret**.
2. Set `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, and `CLOUDINARY_API_SECRET` (or `CLOUDINARY_URL`).

### Step C: Deploy to Render (Blueprint or Manual)

#### Option 1: Render Blueprint (`render.yaml`)
The repository includes a ready-to-use [`render.yaml`](../render.yaml):

1. Push your branch (`main` after merging `dev`) to GitHub.
2. In Render, choose **New -> Blueprint**, connect the repository, and let Render read `render.yaml`.
3. Fill in the prompted `sync: false` secrets (`DATABASE_URL`, `DIRECT_URL`, `CLIENT_URL`, `CLOUDINARY_*`, and optionally `KOBO_API_TOKEN`).

#### Option 2: Manual Render Web Service
Create a **Web Service** on Render with:
- **Runtime:** `Node` (Node 22+)
- **Root Directory:** *(leave blank / repo root)*
- **Build Command:** `npm run build`
- **Start Command:** `npm run db:deploy && npm start`
- **Health Check Path:** `/health`

*(Tip: On paid Render plans, you can move `npm run db:deploy` into Render's **Pre-Deploy Command** and keep **Start Command** as `npm start`. On the Render Free plan, `preDeployCommand` is not supported, so chaining `npm run db:deploy && npm start` applies migrations automatically on boot.)*

### Step D: Production Environment Variables (Render)

| Variable | Required | Value / Notes |
| :--- | :--- | :--- |
| `NODE_ENV` | Yes | `production` |
| `DATABASE_URL` | Yes | Supabase Pooler URI (`:6543`) with `?pgbouncer=true&sslmode=require` |
| `DIRECT_URL` | Yes | Supabase Direct or Session Pooler URI (`:5432`) for migrations |
| `JWT_ACCESS_SECRET` | Yes | 64-byte random hex string |
| `JWT_REFRESH_SECRET` | Yes | Different 64-byte random hex string |
| `CLIENT_URL` | Yes | Your live Render URL, e.g. `https://edbase.onrender.com` (no trailing slash) |
| `APP_TIMEZONE` | Recommended | e.g. `Asia/Kolkata` (controls UTC date-only boundaries & nightly cron time) |
| `CLOUDINARY_CLOUD_NAME` | Media | Cloudinary cloud name |
| `CLOUDINARY_API_KEY` | Media | Cloudinary API key |
| `CLOUDINARY_API_SECRET` | Media | Cloudinary API secret |
| `COOKIE_SAME_SITE` | Optional | Defaults to `lax` (ideal for single Render service). Set `none` if frontend is hosted on a separate domain |
| `DB_POOL_MAX` | Optional | Max `pg.Pool` connections per instance (default `10`) |
| `KOBO_API_URL`, `KOBO_API_TOKEN` | Optional | KoboToolbox API endpoint and token |

### Step E: First-Time Admin Provisioning

Once live on Render:
- **Recommended for production:** Open the login page and use **Create New Workspace / Register Instance** (`POST /api/auth/register-instance`) to provision your organization, default center, current academic year, and `super_admin` user cleanly without demo clutter.
- **Demo seeding (optional/testing only):**
  > **Warning:** `prisma db seed` wipes all existing tables before inserting demo records. Never run it on a database containing live data.

### Render Operational Notes

- **Trust Proxy & Rate Limiting:** `backend/src/app.ts` enables `app.set("trust proxy", 1)` so `express-rate-limit` tracks real client IPs behind Render's TLS proxy.
- **Socket.IO & WebRTC:** Render supports WebSockets natively on Web Services. In `frontend/.env.production`, `VITE_API_URL=/api`, and `socket.service.ts` automatically connects to `window.location.origin` over `wss://`.
- **Render Free Tier Spin-Down & Cron:** Free Render services sleep after 15 minutes of inactivity, which pauses the in-process `node-cron` scheduler (`23:59` nightly attendance auto-submit & risk alerts). Upgrade to an always-on instance or trigger evaluation via an external scheduler if guaranteed nightly cron execution is required.

---

## 2. Docker Compose Deployment

A multi-stage `Dockerfile` (Node 22 + OpenSSL + Prisma 7 `prisma.config.ts`) and `docker-compose.yml` are provided for containerized hosting:

```bash
docker compose build --no-cache
docker compose up -d
```

The `app` container serves both the Express API and static `frontend/dist` on port `5000`, waits for Postgres (`db`) health, runs `npx prisma migrate deploy`, and starts `node dist/server.js`.

Check health and logs:
```bash
docker compose logs -f app
curl http://localhost:5000/health
```

Optional dev/demo database seed inside container (empty DB only):
```bash
docker compose exec app sh -c "cd backend && npx prisma db seed"
```

---

## 3. Local Development (Without Docker)

1. **Install dependencies:**
   ```bash
   npm run install:all
   ```
2. **Configure environment:**
   Copy `backend/.env.example` to `backend/.env` and set `DATABASE_URL`, `DIRECT_URL` (can match `DATABASE_URL` locally), `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, and `CLIENT_URL=http://localhost:5173`.
   *(Leave `frontend/.env` unset or `VITE_API_URL=/api` so Vite proxies `/api`, `/health`, and `/socket.io` to `http://localhost:5000` without CORS issues.)*
3. **Migrate & optionally seed:**
   ```bash
   cd backend
   npx prisma generate
   npx prisma migrate dev
   npx prisma db seed   # Optional dev demo data only
   cd ..
   ```
   Demo seeded credentials (workspace slug `default`):
   - `super_admin@edbase.org` / `SuperAdmin@123`
   - `tech_admin@edbase.org` / `SuperAdmin@123`
   - `center_admin_1@edbase.org`, `teacher_1@edbase.org`, `staff_1@edbase.org` / `Staff@123`
4. **Run dev servers concurrently:**
   ```bash
   npm run dev
   ```
   - Frontend: `http://localhost:5173`
   - Backend: `http://localhost:5000`
