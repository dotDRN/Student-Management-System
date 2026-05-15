# 🌐 SPARSHA OMS - API Reference

This document outlines the API architecture, conventions, and key endpoints for the SPARSHA Organization Management System. All endpoints are prefixed with `/api`.

---

## 🛡️ The "Golden Middleware Chain"

Every protected endpoint in this system is enforced by a strict middleware pipeline designed to prevent security breaches, validate data types, and prevent PII leakage:

1.  **`authenticate`**: Validates the JWT (either via `Authorization: Bearer <token>` or `HttpOnly` cookies) and attaches the `req.user` object.
2.  **`requireRole(roles)`**: Hard-blocks users who do not hold the specific `UserRole` enum required for the mutation.
3.  **`attachAllowedCenters`**: Automatically queries the user's active Center assignments from the database. It attaches `req.allowedCenterIds` to the request, which the Service layer uses to automatically restrict `findMany` queries. (Super Admins naturally bypass this).
4.  **`validate(schema)`**: Uses **Zod** schemas (located in `src/validators/`) to rigorously validate `req.body`, `req.query`, and `req.params`. UUID formats, email formats, and string lengths are strictly enforced before the Controller is even executed.

### Standard Response Envelope
All successful requests MUST return the following standard JSON structure:
```json
{
  "success": true,
  "data": { ... }, // Payload
  "message": "Optional contextual message"
}
```
Errors return a similar envelope, handled automatically by the global error handler (`src/middleware/errorHandler.ts`):
```json
{
  "success": false,
  "error": "Descriptive error message",
  "issues": [] // Optional array of Zod validation issues
}
```

---

## 🔑 Authentication (`/api/auth`)

| Method | Endpoint | Access | Purpose |
| :--- | :--- | :--- | :--- |
| `POST` | `/login` | Public | Authenticate via email/password and retrieve tokens |
| `POST` | `/refresh` | Public | Refresh expired access tokens |
| `POST` | `/logout` | Auth | Invalidate current session tokens |
| `GET` | `/me` | Auth | Retrieve current user profile, roles, and allowed centers |

---

## 🏫 Core Management (`/api/students` & `/api/centers`)

| Method | Endpoint | Access | Purpose |
| :--- | :--- | :--- | :--- |
| `GET` | `/students` | `teacher`, `admin`, etc | List students (Filtered by allowed centers) |
| `GET` | `/students/:id/profile` | Auth | Deep fetch of student, skills, and form submissions |
| `POST` | `/students` | `admin` | Register a new student |
| `GET` | `/centers` | Auth | Fetch all centers assigned to current user |

---

## 📊 Academics & Activities (`/api/attendance`, `/api/exams`, `/api/activities`)

| Method | Endpoint | Access | Purpose |
| :--- | :--- | :--- | :--- |
| `POST` | `/attendance/bulk` | `teacher`, `admin` | Submit attendance for a classroom session |
| `GET` | `/attendance/stats` | Auth | Fetch attendance metrics for dashboard |
| `POST` | `/exams/bulk` | `teacher`, `admin` | Submit bulk grades for a specific subject |
| `GET` | `/exams/:id/scores` | Auth | Retrieve all scores for an exam |
| `POST` | `/activities` | `admin`, `teacher`| Create a new class, camp, or visit |

---

## 🏗️ Dynamic Forms & Skills (`/api/forms`, `/api/skills`)

*SPARSHA uses a dynamic JSON-schema builder to avoid hardcoding complex surveys or medical forms.*

| Method | Endpoint | Access | Purpose |
| :--- | :--- | :--- | :--- |
| `GET` | `/forms/templates` | Auth | Fetch active form schemas |
| `POST` | `/forms/submissions` | Auth | Submit dynamic JSON payload linked to a student |
| `POST` | `/skills/log` | `teacher` | Log a qualitative skill assessment (1-5) for a student |

---

## 🏢 Organizational Tools (`/api/equipment`, `/api/announcements`)

| Method | Endpoint | Access | Purpose |
| :--- | :--- | :--- | :--- |
| `GET` | `/equipment` | Auth | List center equipment |
| `POST` | `/equipment/log` | `staff`, `admin` | Record an equipment checkout/checkin |
| `POST` | `/announcements` | `super_admin` | Broadcast pinned messages across multiple centers |

> [!TIP]
> **API Development Rule:** When creating a new endpoint, always define the Zod schema in `/src/validators/` first. Do not manually check `if (!req.body.name)` in the controller. Let Zod handle the validation and reject bad requests automatically.
