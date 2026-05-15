# ⚙️ SPARSHA OMS - Backend Architecture

The backend of SPARSHA is a Node.js + Express API backed by PostgreSQL and managed exclusively via Prisma 7.

## 🏗️ Architectural Pattern: Fat Service, Thin Controller

To maintain extreme scalability across the various NGO modules, we enforce a strict separation of concerns:

1.  **Controllers (`src/controllers/`)**:
    *   Exclusively responsible for HTTP layer interactions.
    *   They accept the request, extract validated parameters, invoke the corresponding Service, and return the standard JSON envelope.
    *   **No business logic** or Prisma calls belong here.
2.  **Services (`src/services/`)**:
    *   House all business rules, database transactions, and secondary RBAC checks.
    *   This makes the logic highly testable without needing to mock Express objects.

## 🗄️ Database Paradigm (Prisma 7)

-   **UUID Keys**: We migrated away from integer IDs. Every entity uses `String @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid`.
-   **Soft Deletion**: Records are never destroyed (`DELETE`). They are deactivated using the `isActive: Boolean` flag. This preserves referential integrity for audit logs.
-   **Configuration**: Prisma 7 no longer accepts `url = env("DATABASE_URL")` directly inside `schema.prisma`. All configuration is handled externally in `prisma.config.ts`.

## 🛡️ Organization Management System (OMS) Security

The backend is structurally hardened to support multi-tenant center logic and strict privacy laws.

### Center-Scoping
The core tenet of the backend is that *no staff member* (except a `super_admin`) can view data outside their assigned centers. 
When a Service executes a Prisma query, it MUST append a `centerScope` derived from the middleware's `req.allowedCenterIds`.
```typescript
const centerScope = role === 'super_admin' ? {} : { centerId: { in: allowedCenterIds } };
// Automatically restricts finding students to the user's localized centers.
await prisma.student.findMany({ where: { ...centerScope } });
```

### PII Data Stripping
Volunteers, Shareholders, and Tech Admins do not have clearance to view Personal Identifiable Information (PII) of the students. The Service layer is responsible for detecting these roles and explicitly using Prisma's `omit` operator to strip phone numbers and exact addresses from the returned payload.

### Transactional Integrity
For features that require audit trails (like changing the status of a bulk activity or transferring equipment), the backend utilizes Prisma `$transaction`. If the audit log fails to write, the status change rolls back.
