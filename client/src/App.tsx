import { Navigate, Route, Routes } from 'react-router-dom';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { AppLayout } from '@/components/layout/AppLayout';
import { getHomeByRole } from '@/hooks/useAuth';
import AdminDashboard from '@/pages/admin/AdminDashboard';
import SettingsPage from '@/pages/admin/SettingsPage';
import SystemPage from '@/pages/admin/SystemPage';
import UsersPage from '@/pages/admin/UsersPage';
import ChangePasswordPage from '@/pages/auth/ChangePasswordPage';
import LoginPage from '@/pages/auth/LoginPage';
import ForbiddenPage from '@/pages/ForbiddenPage';
import NotFoundPage from '@/pages/NotFoundPage';
import CasePlayerPage from '@/pages/student/CasePlayerPage';
import CaseResultPage from '@/pages/student/CaseResultPage';
import MyCases from '@/pages/student/MyCases';
import MyResults from '@/pages/student/MyResults';
import StudentDashboard from '@/pages/student/StudentDashboard';
import AnalyticsPage from '@/pages/teacher/AnalyticsPage';
import GroupsPage from '@/pages/teacher/GroupsPage';
import MyScenarios from '@/pages/teacher/MyScenarios';
import ScenarioEditorPage from '@/pages/teacher/ScenarioEditorPage';
import ScenarioPreview from '@/pages/teacher/ScenarioPreview';
import TeacherDashboard from '@/pages/teacher/TeacherDashboard';
import { useAuthStore } from '@/stores/authStore';

function RoleHomeRedirect() {
  const user = useAuthStore((state) => state.user);
  return <Navigate to={getHomeByRole(user?.role)} replace />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/change-password" element={<ChangePasswordPage />} />
      <Route path="/forbidden" element={<ForbiddenPage />} />

      <Route element={<ProtectedRoute roles={['student']} />}>
        <Route element={<AppLayout />}>
          <Route path="/student" element={<StudentDashboard />} />
          <Route path="/student/cases" element={<MyCases />} />
          <Route path="/student/cases/:id/play" element={<CasePlayerPage />} />
          <Route path="/student/attempts/:id/result" element={<CaseResultPage />} />
          <Route path="/student/results" element={<MyResults />} />
        </Route>
      </Route>

      <Route element={<ProtectedRoute roles={['teacher', 'admin']} />}>
        <Route element={<AppLayout />}>
          <Route path="/teacher" element={<TeacherDashboard />} />
          <Route path="/teacher/scenarios" element={<MyScenarios />} />
          <Route path="/teacher/scenarios/:id/edit" element={<ScenarioEditorPage />} />
          <Route path="/teacher/scenarios/:id/preview" element={<ScenarioPreview />} />
          <Route path="/teacher/scenarios/:id/analytics" element={<AnalyticsPage />} />
          <Route path="/teacher/analytics" element={<AnalyticsPage />} />
          <Route path="/teacher/groups" element={<GroupsPage />} />
        </Route>
      </Route>

      <Route element={<ProtectedRoute roles={['admin']} />}>
        <Route element={<AppLayout />}>
          <Route path="/admin" element={<AdminDashboard />} />
          <Route path="/admin/users" element={<UsersPage />} />
          <Route path="/admin/system" element={<SystemPage />} />
          <Route path="/admin/settings" element={<SettingsPage />} />
        </Route>
      </Route>

      <Route path="/" element={<RoleHomeRedirect />} />
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}
