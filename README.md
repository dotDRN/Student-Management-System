# SPARSHA Organization Management System (OMS)

Welcome to the SPARSHA OMS repository. This is an enterprise-grade platform built for the SPARSHA NGO to manage students, staff, academics, and operations across multiple centers.

**Tech Stack:** 
- **Frontend**: React + Vite (Tailwind CSS, Zustand)
- **Backend**: Node.js + Express (Prisma ORM, PostgreSQL)

---

## 📖 Official Documentation

We have provided an exhaustive, structured knowledge base designed specifically for the internal IT maintainers of the NGO. **Please refer to these files for detailed architecture, deployment, and troubleshooting guides.**

👉 **[Start Here: Main Documentation Index](./documentation/INDEX.md)**

### Direct Links:
1. [System Architecture](./documentation/01-ARCHITECTURE.md)
2. [Deployment & Docker](./documentation/02-DEPLOYMENT.md)
3. [Database Schema](./documentation/03-DATABASE.md)
4. [API Reference](./documentation/04-API_REFERENCE.md)
5. [Security & RBAC](./documentation/05-SECURITY_AND_RBAC.md)
6. [Frontend Guide](./documentation/06-FRONTEND.md)
7. [Maintenance Playbook](./documentation/07-MAINTENANCE.md) (Crucial for ongoing management)

*(Note: Older project planning documents have been preserved in `documentation/archive/`.)*

---

## 🚀 Quick Start (Docker Production)

The most reliable way to run the application is via Docker. This handles all dependencies automatically.

1. **Build and Start:**
   ```bash
   docker compose build --no-cache
   docker compose up -d
   ```
2. **Seed the Initial Admin User:**
   *(Run this only on the first boot to create the super_admin account)*
   ```bash
   docker compose exec backend npx prisma db seed
   ```
3. **Access the Application:**
   - **Frontend UI:** `http://localhost:5173`
   - **Backend API:** `http://localhost:5000`
   - **Login Credentials:** `admin@sparsha.org` / `Admin@123`

*If Docker fails during `npm install` with "Exit handler never called", run `./scripts/fix-docker-dns.sh` on your Linux host and rebuild.*

---

## 💻 Local Development (Without Docker)

If you need to run the app natively for development:

1. **Install Dependencies:**
   ```bash
   npm run install:all
   ```
2. **Environment Variables:**
   Copy `.env.example` to `.env` in both `/backend` and `/frontend`. Set `DATABASE_URL` in `backend/.env` to point to a running PostgreSQL 15 instance.
3. **Database Setup:**
   ```bash
   cd backend
   npx prisma generate
   npx prisma migrate dev
   npx prisma db seed
   cd ..
   ```
4. **Start Development Servers:**
   ```bash
   npm run dev
   ```

---

## 📂 Repository Layout

```text
├── backend/            # Express API, Prisma schema, controllers, and services
├── frontend/           # Vite React app, Zustand store, UI components
├── documentation/      # Official maintainer guides (Read these first)
│   ├── archive/        # Legacy planning files
│   └── INDEX.md        # Master Table of Contents
├── scripts/            # Utility shell scripts (e.g., Docker DNS fixes)
├── docker-compose.yml  # Multi-container orchestration
└── Dockerfile          # Multi-stage build process for the stack
```

## License
Internal use for SPARSHA NGO unless stated otherwise.
