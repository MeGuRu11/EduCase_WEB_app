import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/stores/authStore';
import type { LoginRequest } from '@/types/auth';
import type { UserRole } from '@/types/user';

const homeByRole: Record<UserRole, string> = {
  student: '/student',
  teacher: '/teacher',
  admin: '/admin',
};

export function getHomeByRole(role?: UserRole | null) {
  return role ? homeByRole[role] : '/login';
}

export function useAuth() {
  const navigate = useNavigate();
  const store = useAuthStore();

  return {
    ...store,
    login: async (payload: LoginRequest) => {
      const user = await store.login(payload);
      navigate(user.must_change_password ? '/change-password' : homeByRole[user.role], {
        replace: true,
      });
      return user;
    },
    logout: () => {
      store.logout();
      navigate('/login', { replace: true });
    },
    goHome: () => {
      navigate(getHomeByRole(store.user?.role), { replace: true });
    },
  };
}
