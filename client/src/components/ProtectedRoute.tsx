import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { notify } from '@/components/ui/Toast';
import { useAuthStore } from '@/stores/authStore';
import type { UserRole } from '@/types/user';

const homeByRole: Record<UserRole, string> = {
  student: '/student',
  teacher: '/teacher',
  admin: '/admin',
};

export function ProtectedRoute({ roles }: { roles?: UserRole[] }) {
  const { isAuthenticated, user } = useAuthStore();
  const location = useLocation();

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ returnTo: location.pathname }} replace />;
  }

  if (user?.must_change_password && location.pathname !== '/change-password') {
    return <Navigate to="/change-password" replace />;
  }

  if (roles && user && !roles.includes(user.role)) {
    notify.error('У вас нет доступа к этой странице');
    return <Navigate to={homeByRole[user.role]} replace />;
  }

  return <Outlet />;
}
