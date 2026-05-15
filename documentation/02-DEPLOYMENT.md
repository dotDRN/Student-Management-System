# 🚀 SPARSHA OMS - Deployment & Infrastructure

The SPARSHA OMS is fully containerized using Docker, allowing it to be deployed consistently on any Linux, macOS, or Windows host that supports Docker Compose.

---

## 🐋 Docker Architecture

We utilize a multi-stage `Dockerfile` and a `docker-compose.yml` file to manage the stack.

The stack consists of three services:
1. **`db`**: A PostgreSQL 15 container holding the persistent data.
2. **`backend`**: The Node.js Express API.
3. **`frontend`**: The statically built React frontend served via a lightweight Node `serve` process.

Both `backend` and `frontend` services are built from the same multi-stage Dockerfile (`sparsha-app:latest`) but run different start commands based on the `docker-compose.yml`.

### The `Dockerfile` Build Process
The multi-stage build works as follows:
- **`backend-builder`**: Installs dependencies and runs `npx prisma generate` and `tsc` to compile TypeScript to JavaScript in `/dist`.
- **`frontend-builder`**: Installs legacy-peer dependencies and runs `vite build` to generate static assets in `/dist`. *Note: The API URL is injected at this stage via the `VITE_API_URL` build argument.*
- **`production`**: Copies the built `/dist` folders from both builders. It installs `serve` globally.

---

## ⚙️ Environment Variables

Before starting the application, ensure you have your `.env` files correctly set up. 

### Backend (`backend/.env`)
Create this file based on `backend/.env.example`.
```env
NODE_ENV=production
PORT=5000
DATABASE_URL=postgresql://sparsha:sparsha@db:5432/sparsha
JWT_ACCESS_SECRET=your_super_secret_access_key
JWT_REFRESH_SECRET=your_super_secret_refresh_key
CLIENT_URL=http://localhost:5173
```
*Note:* The `DATABASE_URL` in production points to the `db` service defined in `docker-compose.yml`.

### Frontend (`frontend/.env`)
Create this file based on `frontend/.env.example`.
```env
VITE_API_URL=http://localhost:5000/api
```
*Note:* In Docker, the `VITE_API_URL` is typically passed via `docker-compose.yml` `args`, but having the `.env` file is good practice for local development.

---

## 🏃‍♂️ Booting the Application (Production)

To start the full stack, run the following command from the repository root:

```bash
docker compose build --no-cache
docker compose up -d
```

### What happens on boot?
1. The `db` container starts.
2. The `backend` container waits for the `db` to be healthy.
3. Once healthy, the backend runs its startup command:
   ```bash
   sh -c "cd backend && npx prisma migrate deploy && node dist/server.js"
   ```
   **This ensures that the database schema is automatically created or updated to the latest version before the server accepts traffic.**
4. The `frontend` container starts serving the compiled assets on port `5173`.

### Verifying Logs
To ensure everything started smoothly, inspect the logs:
```bash
docker compose logs -f backend
```

---

## 💾 Database Setup & Seeding

When deploying for the very first time on a fresh server, the database will be empty (though the tables will exist thanks to `migrate deploy`). 

You must seed the database with the initial `super_admin` account to be able to log in.

**To seed the database inside the running Docker container:**
```bash
docker compose exec backend npx prisma db seed
```
This will run the script located at `backend/prisma/seed.ts`. 

> [!IMPORTANT]
> The seed script will generate a root user with the credentials:
> **Email:** `admin@sparsha.org`
> **Password:** `Admin@123`
> You should immediately log in and change this password in a production environment.

---

## 🛠️ Local Development (Without Docker)

If you are writing code and want to run the stack locally for development with Hot Module Replacement (HMR):

1. **Install everything:**
   ```bash
   npm run install:all
   ```
2. **Start a local Postgres database** (e.g., using Postgres.app on Mac or a local Docker Postgres container mapping to port 5432).
3. **Update your `backend/.env`** to point `DATABASE_URL` to your `localhost` postgres instance.
4. **Run migrations and seed:**
   ```bash
   cd backend
   npx prisma generate
   npx prisma migrate dev
   npx prisma db seed
   cd ..
   ```
5. **Start both servers concurrently:**
   ```bash
   npm run dev
   ```
   *Frontend will run on `http://localhost:5173` and backend on `http://localhost:5000`.*
