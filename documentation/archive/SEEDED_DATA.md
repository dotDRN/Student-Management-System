# Comprehensive Seeded Data Reference

The database has been fully rebuilt and seeded with extensive data across all modules. This document provides a detailed map of the current data state for testing.

## 1. Authentication Credentials
**Security Note**: All sessions have been invalidated due to the database reset. Please log in fresh.

| Role | Email | Password | Access Scope |
|---|---|---|---|
| **Super Admin** | `super_admin@sparsha.org` | `SuperAdmin@123` | System-wide |
| **Tech Admin** | `tech_admin@sparsha.org` | `SuperAdmin@123` | System-wide / Tech Support |
| **Center Admin 1** | `center_admin_1@sparsha.org` | `Staff@123` | Andheri Center |
| **Teacher 1** | `teacher_1@sparsha.org` | `Staff@123` | Andheri Center |
| **Teacher 2** | `teacher_2@sparsha.org` | `Staff@123` | Andheri Center |
| **Center Admin 2** | `center_admin_2@sparsha.org` | `Staff@123` | Dharavi Center |

## 2. Infrastructure
- **5 Centers**: Andheri, Dharavi, Govandi, Kurla, Malad.
- **4 Programs**: SWAYAM (Youth), SHIKSHA (Early Learning), KUSUM (Women), UDAY (Vocational).
- **Academic Years**: 2024-25, 2025-26 (**Current**), 2026-27.

## 3. Module Data (Seeded Details)

### 📊 Reports & Analytics
- **Students**: 100 students (20 per center, 50% SWAYAM, 50% SHIKSHA).
- **Attendance**: **14 days of history** seeded for every student, center, and program.
- **Exams**: Baseline and Endline exams created for all 5 centers (SWAYAM program).
    - Full score sets (5 subjects) populated for all SWAYAM students in Andheri.
    - Endline scores are weighted higher to demonstrate "Improvement" in analytics.

### 🏆 Skills Development
- **5 Skills**: Public Speaking, Critical Thinking, Team Collaboration, Digital Literacy, Emotional Resilience.
- **Logs**: **40 students** have individual assessment logs (Levels 1-5) with professional remarks.

### 📋 Form Management
- **5 Templates**: Career Goal Tracking, Maintenance Audit, Parent Feedback, Health Check, Performance Review.
- **Submissions**: **10 students** have pre-filled submissions for each student-based template.

### 📦 Equipment & Inventory
- **5 Items per Center**: Laptops, Projectors, Science Kits, Whiteboards, First Aid Kits.
- **Status**: All items marked as "Good Condition" and "Active".

### 📢 Communications
- **Announcements**: 2 global announcements (Annual Day, Exam Schedule) with role-based visibility.
- **Messages**: 1 threaded conversation thread between `teacher_1` and `tech_admin` regarding IT Support.

## 4. Troubleshooting
- **Unauthorised / 401**: Clear your browser cookies or use Incognito. The database reset has invalidated old tokens.
- **Redirect Loop**: This is caused by a stale refresh token. Logout and login again with the new credentials.
