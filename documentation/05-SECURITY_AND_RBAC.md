# 🛡️ SPARSHA OMS - Security & Role-Based Access Control

Security is paramount in the SPARSHA OMS due to the presence of minor students' Personal Identifiable Information (PII). The system employs a strict multi-layered security model.

---

## 👥 The User Hierarchy (RBAC)

Every user in the system is assigned a single `UserRole` enum. This role determines the baseline permissions across the entire API and Frontend UI.

### Administrative Roles
- **`super_admin`**: Full god-mode. Bypasses all center-scoping. Can see and edit all centers, all users, and all system settings.
- **`tech_admin`**: Has access to User Management and System Settings to manage staff accounts, but is heavily restricted from viewing Student PII.
- **`center_admin`**: Can manage all operations, staff, and students, but *only* within their explicitly assigned Centers.

### Operational Roles
- **`supervisor`**: Oversees operations across assigned centers, receives high-level alerts, but cannot create new staff accounts.
- **`teacher`**: Core operational role. Can take attendance, submit exam scores, log skills, and manage daily activities for students in their assigned centers.
- **`staff`**: General staff who can manage equipment, forms, and basic logistics.

### External/Limited Roles
- **`volunteer`**: Temporary or restricted access to specific Activities. Cannot view full student profiles.
- **`shareholder`**: Board members or sponsors. Can view high-level dashboard metrics and anonymized reports, but strict PII stripping prevents them from viewing names/contacts.
- **`student` / `parent`**: Restricted to viewing only their own specific profile, attendance, and exam history.

---

## 🏢 Center-Scoping (Horizontal Isolation)

The most critical security feature of the backend is Center-Scoping. It prevents a `teacher` at Center A from viewing or modifying a `student` at Center B.

### How it Works
1. When a user logs in, the `attachAllowedCenters` middleware queries the `UserCenterAssignment` table to find all currently valid centers for that user.
2. It attaches an array of UUIDs to `req.allowedCenterIds`.
3. Inside the Service layer, any database query involving Center-bound entities (Students, Activities, Equipment) MUST include a filter against these IDs.

```typescript
// Example of Center-Scoping logic in a Service
const centerScope = role === 'super_admin' ? {} : { centerId: { in: allowedCenterIds } };

// Safely fetches only students the user is allowed to see
const students = await prisma.student.findMany({
  where: {
    isActive: true,
    ...centerScope
  }
});
```

---

## 🛑 PII Stripping (Vertical Isolation)

While Center-Scoping handles *which* records a user can see, PII Stripping handles *what fields* within those records are visible.

Users like `volunteer`, `shareholder`, and `tech_admin` should not have access to a minor's phone number, exact address, or date of birth.

### Implementation
The backend Services are responsible for detecting these roles and explicitly using Prisma's `omit` or `select` operators to strip sensitive fields before returning the JSON payload.

```typescript
// Example PII stripping logic
const isPiiRestricted = ['shareholder', 'tech_admin', 'volunteer'].includes(userRole);

const studentData = await prisma.student.findUnique({
    where: { id: studentId },
    omit: isPiiRestricted ? { 
        guardianPhone: true, 
        address: true, 
        dob: true 
    } : {}
});
```

> [!WARNING]
> **Security Audit Rule:** If you add a new field to the `Student` table (e.g., `medicalNotes`), you MUST evaluate whether it needs to be added to the PII stripping logic in the relevant `student.service.ts` functions. Failure to do so constitutes a data privacy breach.
