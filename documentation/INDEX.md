# 📖 SPARSHA OMS - Documentation Index

Welcome to the official maintainer documentation for the SPARSHA Organization Management System (OMS). 

This guide has been exhaustively compiled for the internal IT team to understand, deploy, maintain, and expand the platform without requiring external freelancer support.

Please read through the documentation in the following order:

## 1. System Fundamentals
* [01-ARCHITECTURE.md](./01-ARCHITECTURE.md) - The high-level topology, monorepo structure, and the "Fat Service, Thin Controller" pattern.
* [02-DEPLOYMENT.md](./02-DEPLOYMENT.md) - How to boot the Docker stack, manage environment variables, and run migrations.

## 2. Data & Security
* [03-DATABASE.md](./03-DATABASE.md) - Understanding the Prisma schema, UUIDs, soft deletions, and core entities.
* [04-API_REFERENCE.md](./04-API_REFERENCE.md) - The "Golden Middleware Chain", REST conventions, and Zod validations.
* [05-SECURITY_AND_RBAC.md](./05-SECURITY_AND_RBAC.md) - Role hierarchies, Center-Scoping (horizontal isolation), and PII Stripping (vertical isolation).

## 3. Client & Expansion
* [06-FRONTEND.md](./06-FRONTEND.md) - The React 19/Vite architecture, Zustand state management, and API integration.
* [07-MAINTENANCE.md](./07-MAINTENANCE.md) - **The Maintainer Playbook.** Step-by-step guides on adding new database fields, new API routes, handling Docker crashes, and performing database backups.

---
*Legacy documentation created during the initial building phases has been preserved in the `archive/` folder for historical reference.*
