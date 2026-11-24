# EdBase — Maintenance & Troubleshooting Playbook

This playbook covers common development workflows, automated testing, database backups, and **Render + Supabase** operational troubleshooting.

---

## 1. Adding a New Database Field

Example: adding `bloodGroup` to `Student`.

1. **Update Schema (`backend/prisma/schema.prisma`):**
   ```prisma
   model Student {
     // ...existing fields
     bloodGroup String? @map("blood_group")
   }
   ```
2. **Create Local Migration:**
   ```bash
   cd backend
   npx prisma migrate dev --name add_student_blood_group
   ```
3. **Update Zod Validation (`backend/src/validators/schemas.ts`):**
   Add `bloodGroup` to `createStudentSchema` and `updateStudentSchema`.
4. **Update Offline Sync Whitelist (if offline-editable):**
   Check `backend/src/services/syncConflictResolver.ts` and `syncService.ts` so the field merges cleanly during `/api/sync/push`.
5. **Update Frontend (`frontend/src/types/index.ts` & `frontend/src/pages/StudentRegistration.tsx`):**
   Add `bloodGroup?: string | null` and the form field.
6. **Verify & Commit:**
   Run `npm test`, `npm run lint`, and `npm run build` at the root, then commit the Prisma migration SQL alongside the code changes. Render/Docker automatically applies committed migrations via `prisma migrate deploy`.

---

## 2. Adding a New API Endpoint

Example: adding `GET /api/students/top-performers`.

1. **Define Route (`backend/src/routes/student.route.ts`):**
   *(Declare static paths before `/:id` parameterized routes!)*
   ```typescript
   router.get(
     "/top-performers",
     requirePermission(PERMISSIONS.VIEW_REPORTS),
     getTopPerformers,
   );
   ```
2. **Add Controller (`backend/src/controllers/student.controller.ts`):**
   Export a named async handler calling the service and handling errors cleanly.
3. **Add Service Logic (`backend/src/services/student.service.ts`):**
   Export a named function enforcing `resolveCenterFilter(user)` / `assertCenterAccess()` and using `prisma` (which automatically enforces `tenantId` via `AsyncLocalStorage`).

---

## 3. Running Tests & Quality Checks

From the repository root:

```bash
npm test              # Runs backend unit tests + frontend unit tests
npm run lint          # Runs ESLint across frontend/
npm run build:backend # Generates Prisma Client + compiles TypeScript
npm run build:frontend# Type-checks (tsc -b) + builds Vite & Workbox PWA
```

---

## 4. Render + Supabase Troubleshooting

### Prisma Migration Hangs or Fails on Supabase (`:6543`)
- **Cause:** `prisma migrate deploy` uses advisory locks that are incompatible with PgBouncer Transaction Pooling on port `6543`.
- **Fix:** Ensure `DIRECT_URL` is set to the Supabase **Direct** or **Session Pooler** URI on port `5432` (used by `backend/prisma.config.ts`), while `DATABASE_URL` uses the Transaction Pooler URI on port `6543`.

### `SELF_SIGNED_CERT_IN_CHAIN` or Sudden `pg` Pool Crashes
- `backend/src/lib/prisma.ts` automatically configures `ssl: { rejectUnauthorized: false }` for remote PostgreSQL hosts and registers a `pool.on("error", ...)` listener.
- If running against a custom DB host requiring explicit SSL toggling, set `DATABASE_SSL=true` or `DATABASE_SSL=false`.

### `/health` Returns `503 DB_UNAVAILABLE`
- Inspect Render logs for `DATABASE_URL` formatting or Supabase connection exhaustion.
- Adjust `DB_POOL_MAX` (default `10`) if running multiple services against a small Supabase tier.

### WebSocket / Chat / Meeting Rooms Fail to Connect in Production
- Check browser console for `403` / CORS errors: verify `CLIENT_URL` on Render matches your exact `https://...` origin (no trailing slash).
- Confirm `frontend/.env.production` keeps `VITE_API_URL=/api` for single-service Render deploys, or points to your exact backend `https://.../api` URL for split-origin deploys.

### Refresh Login Loop on Split-Origin Deployments
- If the frontend and backend live on different domains, set `COOKIE_CROSS_SITE=true` (or `COOKIE_SAME_SITE=none`) on the backend so the `refreshToken` cookie is sent cross-origin over HTTPS.

### Offline Sync Conflicts
- When two users edit the same student field or mark conflicting attendance offline, the client records the conflict in Dexie `syncConflicts` and opens the conflict resolution modal. Inspect `SyncOperationLog` in PostgreSQL if debugging duplicate client operations.

---

## 5. Docker Troubleshooting

- **`npm install` hangs / "Exit handler never called" during Docker build:** Run `./scripts/fix-docker-dns.sh` on Linux hosts and rebuild.
- **Prisma errors in container:** Ensure `backend/prisma.config.ts` and `backend/prisma/` are present in the final image (`Dockerfile` copies both) and rebuild with `docker compose build --no-cache`.

---

## 6. Database Backups & Restore

### Supabase Managed Backups
Use Supabase's built-in automated daily backups or download logical dumps via Supabase CLI / `pg_dump` using your `DIRECT_URL`.

### CLI Backup / Restore Scripts (`backend/scripts/`)
With `DATABASE_URL` (or `DIRECT_URL`) exported:

```bash
cd backend
npm run db:backup
# Creates backend/backups/edbase_backup_YYYYMMDD_HHMMSS.sql

npm run db:restore -- ./backups/edbase_backup_YYYYMMDD_HHMMSS.sql
```

### Docker Postgres Backup / Restore
```bash
docker exec -t edbase-db pg_dumpall -c -U edbase > edbase_backup_$(date +%Y-%m-%d).sql
cat edbase_backup_file.sql | docker exec -i edbase-db psql -U edbase -d edbase
```
*(Always test restores against a staging database first.)*
