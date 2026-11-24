# EdBase — Frontend Development Guide

The **EdBase** frontend (`/frontend`) is a React 19 + TypeScript + Vite 8 + Tailwind CSS v4 Single Page Application with offline-first IndexedDB persistence and real-time collaboration.

---

## Tech Stack

- **UI & Build:** React 19, TypeScript, Vite 8 (Rolldown vendor code splitting), Tailwind CSS v4 (`@tailwindcss/vite`)
- **Fonts:** `Inter`, `Plus Jakarta Sans`, `JetBrains Mono` (configured in `index.html` & `src/index.css`)
- **Routing:** React Router v7
- **State:** Zustand v5 (`useAuthStore`, `useSyncStore`, `useChatStore`, `useNotificationStore`, `useToastStore`)
- **Networking & Realtime:** TanStack React Query v5, Axios (`withCredentials: true`), Socket.IO Client, native WebRTC (`RTCPeerConnection`)
- **Offline & PWA:** Dexie.js v4 (IndexedDB), `vite-plugin-pwa` (Workbox)
- **Utilities:** `qrcode`, Recharts, SheetJS (`xlsx`), React Hook Form, `clsx` + `tailwind-merge` (`src/utils/cn.ts`)

---

## Directory Structure (`frontend/src/`)

- `components/`:
  - `ui/`: Shared primitives (`Button`, `Input`, `Card`, `Modal`, `ConfirmModal`, `Table`, `DataTable`, `Badge`, `EmptyState`, `ErrorMessage`, `LoadingSpinner`)
  - `layout/`: `Sidebar`, `TopBar`, `PageWrapper`, `ProtectedRoute` (`RoleGuard`)
  - `chat/`, `students/`, `attendance/`, `activities/`, `dashboard/`, `forms/`, `settings/`, `skills/`, `sync/`, `toast/`, `NotificationDrawer.tsx`
- `hooks/`: `usePermission`, `useChatSocket`, `useWebRTCMeeting`, `useToast`
- `notifications/`: Browser notification permission & visibility dispatcher (`NotificationDispatcher`, `BrowserNotificationService`, `NotificationPermission`, `NotificationRules`, `NotificationVisibility`)
- `offline/`: `offlineDb.ts` (Dexie schema), `offlineServiceHelper.ts`, `outboxHelpers.ts`, `syncEngine.ts`, `syncTypes.ts`
- `pages/`: Feature routes including `Forms/` (`FormsListPage`, `FormBuilderPage`, `FormRendererPage`, `FormSubmissionsPage`), `MeetingRoomsPage`, `ChatPage`, `NotificationsPage`, `ParentPortal`, `Settings`, etc.
- `services/`: `api.ts` (Axios + 401 refresh & offline/re-auth detection), `socket.service.ts`, and domain services
- `store/`: Zustand stores
- `types/` & `utils/`: Type definitions, `apiBase.ts`, `cn.ts`, `date.ts`, `qrStudent.ts`, `offlineAttendanceQueue.ts`, `masterWorkbookExport.ts`, `exportSanitize.ts`, `rbac.ts`

---

## State Management & Auth Flow

`useAuthStore` (`src/store/useAuthStore.ts`) manages the session state:

```tsx
import { useAuthStore } from '../store/useAuthStore';

const HeaderGreeting = () => {
  const { currentUser, currentTenant, selectedCenterId, isOfflineSession } =
    useAuthStore();

  return (
    <div>
      <h1>Welcome, {currentUser?.fullName}</h1>
      <p>{currentTenant?.name} {isOfflineSession ? '(Offline)' : ''}</p>
    </div>
  );
};
```

On startup (`src/App.tsx`):
- Calls `POST ${API_BASE_URL}/auth/refresh` with `credentials: "include"`.
- If the browser is offline or the backend returns `5xx` (e.g. `503 DB_UNAVAILABLE`), `setOfflineSession(true)` keeps the persisted local workspace running using Dexie.
- If the refresh token expired (`401`) while pending local outbox items exist, `setNeedsReauth(true)` prompts inline re-authentication without discarding queued offline edits.

---

## Offline Storage & Sync (`src/offline/`)

- **`EdBaseOfflineDb` (`offlineDb.ts`):** Opens a separate IndexedDB database per `(tenantId, userId)` containing cached tables (`centers`, `programs`, `programSubjects`, `academicYears`, `batches`, `batchEnrollments`, `students`, `feePayments`, `attendanceSessions`, `attendanceRecords`, `exams`, `examScores`, `skillDefinitions`, `skillLogs`, `formTemplates`, `formSubmissions`) plus `syncMeta`, `syncOutbox`, and `syncConflicts`.
- **`SyncEngine` (`syncEngine.ts`):** Checks backend health via `resolveHealthUrl()`, sorts outbox items causally (`outboxHelpers.ts`), pushes batches to `/api/sync/push`, remaps temporary client UUIDs, and stores any `FIELD_CONFLICT` / `LOCKED_VERIFIED` items in `syncConflicts` for resolution via `useSyncStore`.

---

## API URL Resolution & Services

UI components must never call `axios` directly. Use `/src/services/` modules, which share:
- `API_BASE_URL`, `resolveHealthUrl()`, and `resolveSocketUrl()` in `src/utils/apiBase.ts`.
- Leaving `VITE_API_URL` unset or `/api` connects REST and Socket.IO to the current origin (`window.location.origin`), working seamlessly with both Vite's local dev proxy and Render's single-service production server.

---

## Frontend RBAC & Route Guards

1. **Declarative Permissions (`usePermission`):**
   ```tsx
   import { usePermission } from '../hooks/usePermission';

   const StudentActions = () => {
     const { can, isAdminRole } = usePermission();

     return (
       <div>
         {can('manage', 'students') && <button>Edit Student</button>}
         {isAdminRole && <button>Manage Centers</button>}
       </div>
     );
   };
   ```
2. **Route Hierarchy (`src/App.tsx`):**
   - `/parent`: `parent` role only (`ParentPortal`)
   - Level 1 (Staff/Volunteers/Admins): Students, Attendance, Skills, Careers, Exams, Reports, Forms, Activities, Announcements, Chat, Notifications
   - Level 2 (Employees & Admins, excludes `volunteer`): Meeting Rooms (`/meetings`), Student Registration/Edit
   - Level 3 (Admins: `super_admin`, `center_admin`, `tech_admin`): Dashboard, Users, Centers, Programs, Form Builder
   - Level 4 (System Admins: `super_admin`, `tech_admin`): Settings (`/settings`)
