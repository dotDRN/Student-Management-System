# 🔧 SPARSHA OMS - Maintenance & Troubleshooting Playbook

This document is specifically written for the internal IT Maintainer of the NGO. It covers common scenarios you will face and how to resolve them without needing to contact the original development team.

---

## 🛠️ Scenario 1: Adding a New Field to the Database

**Goal:** The NGO wants to track the "Blood Group" of every student.

1. **Update the Schema:**
   Open `backend/prisma/schema.prisma`. Locate the `Student` model and add the field.
   ```prisma
   model Student {
     // ... existing fields
     bloodGroup String? @map("blood_group")
   }
   ```
2. **Create the Migration (Locally):**
   Run the development migration command to generate the SQL files.
   ```bash
   cd backend
   npx prisma migrate dev --name add_blood_group
   ```
3. **Update the Backend Validations:**
   Open `backend/src/validators/student.schema.ts` and add the field to the Zod schema so the API accepts it during `POST` and `PUT` requests.
   ```typescript
   bloodGroup: z.string().optional(),
   ```
4. **Update the Frontend:**
   Open `frontend/src/types/index.ts` (or wherever your interfaces are) and add `bloodGroup?: string` to the `Student` interface. Then, add an input field in the `StudentRegistration.tsx` component.
5. **Deploy:**
   Commit the code to GitHub. When you run `docker compose up --build` on the production server, the container will automatically run `npx prisma migrate deploy` and apply the new column safely.

---

## 🛠️ Scenario 2: Adding a New API Endpoint

**Goal:** You need a new route to fetch "Top Performing Students".

1. **Create the Route:**
   Open `backend/src/routes/student.routes.ts` and add the definition.
   ```typescript
   router.get('/top-performers', authenticate, attachAllowedCenters, StudentController.getTopPerformers);
   ```
2. **Create the Controller:**
   Open `backend/src/controllers/student.controller.ts`.
   ```typescript
   static async getTopPerformers(req: Request, res: Response) {
       const students = await StudentService.getTopPerformers(req.allowedCenterIds);
       res.json({ success: true, data: students });
   }
   ```
3. **Create the Service (The Brains):**
   Open `backend/src/services/student.service.ts`.
   ```typescript
   static async getTopPerformers(allowedCenterIds: string[]) {
       return await prisma.student.findMany({
           where: { centerId: { in: allowedCenterIds }, isActive: true },
           orderBy: { /* some logic */ },
           take: 10
       });
   }
   ```

---

## 🚨 Troubleshooting Docker Issues

### "Exit handler never called" or Network Errors during Build
If `docker compose build` fails randomly while trying to run `npm install`:
- This is a known Docker DNS issue on some Linux servers.
- **Fix:** Run the provided fix script: `./scripts/fix-docker-dns.sh`, then restart docker and rebuild.

### The Backend Container Keeps Crashing/Restarting
1. Check the logs: `docker compose logs -f backend`
2. **"Can't reach database server"**: The Postgres container isn't ready or the `DATABASE_URL` in `.env` is wrong.
3. **"PrismaClientInitializationError"**: Prisma wasn't generated properly. Run `docker compose build --no-cache`.

### The Frontend is showing a Blank White Screen
1. Open the browser's Developer Tools (F12) -> Console.
2. If you see CORS errors: Your backend isn't allowing requests from your frontend URL. Check the `CLIENT_URL` in `backend/.env`.
3. If you see 404s for API requests: Your frontend built with the wrong `VITE_API_URL`. Ensure your `.env` is correct and rebuild the container.

---

## 💾 Backups

Database backups are critical. Since the Postgres data is stored in a Docker volume (`pgdata`), you should periodically dump the database.

**To create a manual backup:**
```bash
docker exec -t sparsha-db pg_dumpall -c -U sparsha > dump_$(date +%Y-%m-%d).sql
```

**To restore a backup:**
```bash
cat dump_file.sql | docker exec -i sparsha-db psql -U sparsha -d sparsha
```
*(Always test your restore commands on a staging server first!)*
