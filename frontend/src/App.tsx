import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ProtectedRoute } from './components/layout/ProtectedRoute';
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

import { useEffect, useState } from "react";
import { useAuthStore } from "./store/useAuthStore";

function App() {
  const { currentUser, initializeAuth, setAuth, logout } = useAuthStore();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const initAuth = async () => {
      try {
        initializeAuth();
        const res = await fetch("/api/auth/refresh", {
          method: "POST",
          credentials: "include",
        });
        if (res.ok) {
          const data = await res.json();
          setAuth(data.user, data.accessToken);
        } else {
          logout();
        }
      } catch (err) {
        console.log("No active session");
        logout();
      } finally {
        setLoading(false);
      }
    };
    initAuth();
  }, [initializeAuth, setAuth, logout]);

  if (loading) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-neutral-50">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  const isAdmin = ['super_admin', 'center_admin', 'tech_admin'].includes(currentUser?.role || '');

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />

        {/* --- LEVEL 1: SHARED ACCESS (Teachers & Admins) --- */}
        <Route element={<ProtectedRoute />}>
          <Route path="/" element={<Navigate to={isAdmin ? "/dashboard" : "/students"} replace />} />

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
        </Route>

        {/* --- LEVEL 2: DATA ENTRY (Teachers & Admins) --- */}
        <Route element={<ProtectedRoute allowedRoles={['teacher', 'staff', 'super_admin', 'center_admin', 'tech_admin']} />}>
          <Route path="/students/new" element={<StudentRegistration />} />
          <Route path="/students/:id/edit" element={<StudentRegistration />} />
        </Route>

        {/* --- LEVEL 3: ADMIN & SUPER ADMIN & TECH ADMIN ONLY (Management) --- */}
        <Route element={<ProtectedRoute allowedRoles={['super_admin', 'center_admin', 'tech_admin']} />}>
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/users" element={<UsersAdmin />} />
          <Route path="/centers" element={<CentersPage />} />
          <Route path="/programs" element={<ProgramsPage />} />
          <Route path="/forms/new" element={<FormBuilderPage />} />
          <Route path="/forms/:templateId/edit" element={<FormBuilderPage />} />
        </Route>

        {/* --- LEVEL 4: SYSTEM ADMINS ONLY (Critical System Config) --- */}
        <Route element={<ProtectedRoute allowedRoles={['super_admin', 'tech_admin']} />}>
          <Route path="/settings" element={<Settings />} />
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;