import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ProtectedRoute, RoleGuard } from './components/layout/ProtectedRoute';
import { Login } from './pages/Login';
import { Dashboard } from './pages/Dashboard';
import { StudentList } from './pages/StudentList';
import { StudentRegistration } from './pages/StudentRegistration';
import { StudentDetails } from './pages/StudentDetails';
import { Attendance } from './pages/Attendance';
import { Skills } from './pages/Skills';
import { Careers } from './pages/Careers';
import { Exams } from './pages/Exams';
import { Reports } from './pages/Reports';
import { Settings } from './pages/Settings';
import { UsersAdmin } from './pages/UsersAdmin';
import { CentersPage } from './pages/CentersPage';
import { ProgramsPage } from './pages/ProgramsPage';
import { FormsListPage } from './pages/Forms/FormsListPage';
import { FormBuilderPage } from './pages/Forms/FormBuilderPage';
import { FormRendererPage } from './pages/Forms/FormRendererPage';
import { FormSubmissionsPage } from './pages/Forms/FormSubmissionsPage';
import { Announcements } from './pages/Announcements';
import { Activities } from './pages/Activities';
import { ChatPage } from './pages/ChatPage';
import { NotificationsPage } from './pages/NotificationsPage';
import { MeetingRoomsPage } from './pages/MeetingRoomsPage';
import { ParentPortal } from './pages/ParentPortal';
import { getHomeRouteForRole } from './utils/rbac';

import { useEffect, useState } from "react";
import { useAuthStore } from "./store/useAuthStore";
import { ToastContainer } from './components/toast/ToastContainer';
import { getPendingLocalSyncCounts } from './offline/offlineDb';

function App() {
  const { currentUser, initializeAuth, setAuth, setOfflineSession, setNeedsReauth, logout } = useAuthStore();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const initAuth = async () => {
      try {
        initializeAuth();
        const persisted = useAuthStore.getState();

        // If browser is clearly offline and we have a persisted local user, boot straight into offline mode
        if (typeof navigator !== "undefined" && navigator.onLine === false && persisted.currentUser) {
          setOfflineSession(true);
          return;
        }

        const res = await fetch("/api/auth/refresh", {
          method: "POST",
          credentials: "include",
        });
        if (res.ok) {
          const data = await res.json();
          setAuth(data.user, data.accessToken, data.organization || null);
        } else {
          // Explicit 401/403 from server: preserve local session + prompt re-auth if unsynced local work exists
          if (persisted.currentUser) {
            const tenantId = persisted.currentTenant?.id || persisted.currentUser.tenantId;
            const counts = await getPendingLocalSyncCounts(tenantId, persisted.currentUser.id);
            if (counts.pending > 0 || counts.conflicts > 0) {
              setNeedsReauth(true);
              return;
            }
          }
          await logout();
        }
      } catch {
        // Network error / offline reload: keep persisted session active in offline mode
        const persisted = useAuthStore.getState();
        if (persisted.currentUser) {
          console.log("Offline startup detected — preserving persisted session.");
          setOfflineSession(true);
        } else {
          console.log("No active session");
          await logout();
        }
      } finally {
        setLoading(false);
      }
    };
    initAuth();
  }, [initializeAuth, setAuth, setOfflineSession, setNeedsReauth, logout]);

  if (loading) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-neutral-50">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  const homeRoute = getHomeRouteForRole(currentUser?.role);

  return (
    <BrowserRouter>
      <ToastContainer />
      <Routes>
        <Route path="/login" element={<Login />} />

        {/* Single persistent authenticated layout & Socket.IO connection */}
        <Route element={<ProtectedRoute />}>
          <Route path="/" element={<Navigate to={homeRoute} replace />} />

          {/* --- PARENT / GUARDIAN READ-ONLY PORTAL --- */}
          <Route element={<RoleGuard allowedRoles={['parent']} />}>
            <Route path="/parent" element={<ParentPortal />} />
          </Route>

          {/* --- LEVEL 1: STAFF & ADMIN SHARED ACCESS --- */}
          <Route element={<RoleGuard allowedRoles={['teacher', 'staff', 'supervisor', 'volunteer', 'super_admin', 'center_admin', 'tech_admin']} />}>
            <Route path="/students" element={<StudentList />} />
            <Route path="/students/:id" element={<StudentDetails />} />
            <Route path="/attendance" element={<Attendance />} />
            <Route path="/skills" element={<Skills />} />
            <Route path="/careers" element={<Careers />} />
            <Route path="/exams" element={<Exams />} />
            <Route path="/reports" element={<Reports />} />
            <Route path="/forms" element={<FormsListPage />} />
            <Route path="/forms/:templateId/fill" element={<FormRendererPage />} />
            <Route path="/forms/:templateId/submissions" element={<FormSubmissionsPage />} />
            <Route path="/activities" element={<Activities />} />
            <Route path="/announcements" element={<Announcements />} />
            <Route path="/chat/:conversationId?" element={<ChatPage />} />
            <Route path="/notifications" element={<NotificationsPage />} />
          </Route>

          {/* --- LEVEL 2: DATA ENTRY & STAFF COLLABORATION (Employees & Admins Only) --- */}
          <Route element={<RoleGuard allowedRoles={['teacher', 'staff', 'supervisor', 'super_admin', 'center_admin', 'tech_admin']} />}>
            <Route path="/meetings" element={<MeetingRoomsPage />} />
            <Route path="/students/new" element={<StudentRegistration />} />
            <Route path="/students/:id/edit" element={<StudentRegistration />} />
          </Route>

          {/* --- LEVEL 3: ADMIN & SUPER ADMIN & TECH ADMIN ONLY (Management) --- */}
          <Route element={<RoleGuard allowedRoles={['super_admin', 'center_admin', 'tech_admin']} />}>
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/users" element={<UsersAdmin />} />
            <Route path="/centers" element={<CentersPage />} />
            <Route path="/programs" element={<ProgramsPage />} />
            <Route path="/forms/new" element={<FormBuilderPage />} />
            <Route path="/forms/:templateId/edit" element={<FormBuilderPage />} />
          </Route>

          {/* --- LEVEL 4: SYSTEM ADMINS ONLY (Critical System Config) --- */}
          <Route element={<RoleGuard allowedRoles={['super_admin', 'tech_admin']} />}>
            <Route path="/settings" element={<Settings />} />
          </Route>
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
