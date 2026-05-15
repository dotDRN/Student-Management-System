# ⚙️ SPARSHA OMS - System Architecture

Welcome to the SPARSHA Organization Management System (OMS). This document outlines the high-level architecture of the application, designed to scale across multiple NGO centers while remaining maintainable by a small technical team.

## 🏗️ High-Level Topology

The SPARSHA OMS is a **monorepo** consisting of two deeply decoupled, independent applications:

1.  **Frontend (`/frontend`)**: A Single Page Application (SPA) built with React and Vite. It consumes the REST API.
2.  **Backend (`/backend`)**: A RESTful API server built with Node.js and Express, backed by a PostgreSQL database managed via Prisma ORM.

These two systems communicate exclusively over HTTP/REST using JSON payloads. They do not share code, state, or memory. This strict decoupling ensures that the frontend can be swapped or mobile apps can be introduced in the future without modifying the core backend business logic.

---

## 🖥️ Frontend Architecture (React + Vite)

The frontend is optimized for speed, developer experience, and maintainability.

### Key Technologies
- **Framework:** React 19
- **Build Tool:** Vite (for rapid HMR and optimized production bundling)
- **Styling:** Tailwind CSS (utility-first styling for consistent design)
- **State Management:** Zustand (for global state like Auth and User Profiles)
- **Data Fetching:** React Query & Axios (for caching, refetching, and handling async UI states)
- **Routing:** React Router v7

### Architectural Patterns
- **Feature-Based Routing:** Pages are organized in `/src/pages` by feature (e.g., `Students`, `Exams`, `Forms`).
- **Reusable UI Components:** Shared components (buttons, modals, inputs) live in `/src/components/ui`.
- **Services Abstraction:** All API calls are abstracted into `/src/services/` (e.g., `api.ts`, `students.service.ts`). UI components **never** use `axios` directly; they call service methods. This allows the API URL or payload structure to change in one place.

---

## ⚙️ Backend Architecture (Express + Prisma)

The backend is structurally hardened to support multi-tenant center logic and strict privacy laws (PII stripping).

### Key Technologies
- **Runtime:** Node.js
- **Framework:** Express 5
- **Language:** TypeScript (Strict Mode)
- **ORM:** Prisma 7
- **Database:** PostgreSQL 15+
- **Validation:** Zod (for runtime type checking on HTTP payloads)

### Architectural Pattern: "Fat Service, Thin Controller"

To maintain scalability across the various NGO modules, we enforce a strict separation of concerns:

1.  **Routes (`src/routes/`)**:
    *   Defines the HTTP endpoint path, applies middleware (Authentication, RBAC), and mounts the Controller.
2.  **Controllers (`src/controllers/`)**:
    *   Exclusively responsible for HTTP layer interactions.
    *   They accept the `req`, extract parameters, invoke the corresponding Service, and return the standard `res.json()` envelope.
    *   **No business logic** or Prisma calls belong here.
3.  **Services (`src/services/`)**:
    *   House all business rules, database transactions, and secondary RBAC checks.
    *   This makes the logic highly testable and decoupled from Express.
    *   **All Prisma database calls live here.**
4.  **Validators (`src/validators/`)**:
    *   Zod schemas defining the exact shape of expected inputs.

### The Standard Response Envelope
All successful backend responses strictly adhere to this format to make frontend parsing predictable:
```json
{
  "success": true,
  "data": { ... }, // The actual payload requested
  "message": "Optional contextual message"
}
```

---

## 🗄️ Database Paradigm

We utilize PostgreSQL with Prisma ORM to guarantee data integrity.

- **UUID Primary Keys:** We explicitly avoid integer auto-increment IDs to prevent URL enumeration attacks. Every entity uses `String @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid`.
- **Soft Deletion:** Records are generally not destroyed (`DELETE`). They are deactivated using the `isActive: Boolean` flag. This preserves referential integrity for historical audit logs and reporting.
- **Strict Relations:** Prisma enforces foreign key constraints. For example, a `StudentSkillLog` cannot exist without a valid `Student` and a valid `SkillDefinition`.

> [!TIP]
> **Maintainer Advice:** If you are asked to "delete" a record by the NGO staff, always look for a way to mark it `isActive: false` first. Only use physical deletion for correcting immediate data entry mistakes.
