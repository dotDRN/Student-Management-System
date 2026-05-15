# 🌐 SPARSHA OMS - API Reference

This document outlines the API architecture, conventions, and endpoints for the SPARSHA Organization Management System. All endpoints are prefixed with `/api`.

---

## 🛡️ Global Security & Validation Architecture

Every protected endpoint in this system is enforced by a **Golden Middleware Chain** designed to prevent security breaches and PII leakage:

1.  `authenticate`: Validates the `Authorization: Bearer <token>` or `HttpOnly` cookie and attaches `req.user`.
2.  `requireRole(roles)`: Hard-blocks users without specific organizational rank from accessing sensitive mutations.
3.  `attachAllowedCenters`: Automatically queries the user's active Center assignments and restricts any `findMany` database lookup to only those centers. (Super Admins bypass this).
4.  `validate(schema)`: Uses **Zod** to rigorously validate `req.body` and `req.query` types. UUIDs are strictly enforced.

### Standard Response Envelope
All successful requests return the following standard JSON structure:
```json
{
  "success": true,
  "data": { ... }, // Payload
  "message": "Optional contextual message"
}
```

---

## 🔑 Authentication (`/api/auth`)

| Method | Endpoint | Access | Purpose | Zod Schema Requirements |
| :--- | :--- | :--- | :--- | :--- |
| `POST` | `/login` | Public | Authenticate and retrieve JWT / Cookie | `email`, `password` |
| `POST` | `/refresh` | Public | Refresh expired access tokens | *Requires valid HttpOnly Cookie* |
| `POST` | `/logout` | Auth | Invalidate current session tokens | None |
| `GET` | `/me` | Auth | Retrieve current user profile & roles | None |

---

## 🏫 Core Management (`/api/students` & `/api/centers`)

| Method | Endpoint | Access | Purpose |
| :--- | :--- | :--- | :--- |
| `GET` | `/students` | `teacher`, `admin` | List students (Center-scoped) |
| `GET` | `/students/:id/profile` | `teacher`, `admin` | Deep fetch of student, marks, and forms |
| `POST` | `/students` | `admin` | Register a new student |
| `GET` | `/centers` | Auth | Fetch all centers assigned to current user |

---

## 📊 Academics (`/api/attendance` & `/api/exams`)

| Method | Endpoint | Access | Purpose |
| :--- | :--- | :--- | :--- |
| `POST` | `/attendance/bulk` | `teacher`, `admin` | Submit attendance for a classroom session |
| `GET` | `/attendance/stats` | Auth | Fetch attendance metrics for dashboard |
| `POST` | `/exams/bulk` | `teacher`, `admin` | Submit bulk grades for a specific subject |
| `GET` | `/exams/:id/scores` | Auth | Retrieve all scores for an exam |

---

## 🏗️ Dynamic Forms (`/api/forms`)

*SPARSHA uses a dynamic JSON-schema builder to avoid hardcoding forms.*

| Method | Endpoint | Access | Purpose |
| :--- | :--- | :--- | :--- |
| `GET` | `/forms/templates` | Auth | Fetch active form schemas |
| `POST` | `/forms/submissions` | `staff`, `admin` | Submit dynamic JSON payload linked to a student |

---

## 🏢 Organizational Tools (New OMS Features)

| Method | Endpoint | Access | Purpose |
| :--- | :--- | :--- | :--- |
| `GET` | `/messages/threads` | Auth | Fetch direct message threads |
| `POST` | `/equipment/request` | `staff`, `teacher` | Request inventory/equipment |
| `POST` | `/announcements` | `super_admin` | Broadcast messages across multiple centers |

> [!WARNING]  
> **PII Protection Rule:** If a user holding the `shareholder` or `tech_admin` role requests data from `/students`, the backend service will intercept the payload and forcefully omit the `phone`, `dob`, and `guardianName` properties before returning it.
