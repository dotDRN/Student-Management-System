# Project Audit: Out-of-Place Elements & Configuration Errors

This document outlines the current discrepancies between the project implementation and the desired RBAC model/functionality, along with reasons and proposed fixes.

## 1. Redirect Issues (Missing Pages) - [RESOLVED]
- **Affected Routes**: `/equipment`, `/messages`, `/announcements`, `/activities`.
- **Observation**: Clicking these items in the sidebar redirects the user back to the Dashboard.
- **Cause**: These routes were missing from `App.tsx` and the pages were not implemented.
- **Fix**: All routes are now registered, and functional pages (List + Create) are implemented.

## 2. RBAC Discrepancies - [RESOLVED]
- **Attendance Accessibility**:
    - **Observation**: `super_admin` has access to the "Attendance" module.
    - **Requirement**: `super_admin` should focus on management, not daily attendance.
    - **Fix**: `Sidebar.tsx` updated to show Attendance primarily to Center Admin, Teacher, and Staff roles.
- **Technical Admin Role**:
    - **Observation**: No dedicated `tech_admin` role.
    - **Fix**: Added `tech_admin` role to backend and frontend. Tech Admin has access to User Management and Settings.
- **Admin Access to Teacher Tasks**:
    - **Observation**: Admins couldn't create students or log skills.
    - **Fix**: Updated `requireRole` in backend routes to allow `super_admin`, `tech_admin`, and `center_admin` to perform all teacher-level tasks.

## 3. Data Loading Errors - [RESOLVED]
- **Exams**: "Could not load exam comparison."
    - **Cause**: Mismatch between Academic Year labels and UUIDs in analytics logic.
    - **Fix**: Resolved labels to IDs in `examService.ts` and `reportService.ts`.
- **Skills**: "No skill assessment."
    - **Cause**: Missing definitions and logs.
    - **Fix**: Implemented Skill Definitions API and created a recording modal in the frontend.

## 4. System Stabilization (April 2026)
- [x] Fixed Logout redirect loop (Async session invalidation).
- [x] Implemented missing pages: Equipment, Messages, Announcements, Activities.
- [x] Fixed Exam Comparison 500 errors.
- [x] Restored Skill Assessment recording functionality.
- [x] Enhanced DB Seeder for full system validation (100 students, 5 centers).
- [x] Created `SEEDED_DATA.md` for testing reference.
