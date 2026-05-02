import { Link, useLocation } from 'react-router-dom';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { getHomeByRole } from '@/hooks/useAuth';
import { useAuthStore } from '@/stores/authStore';

export default function NotFoundPage() {
  const location = useLocation();
  const user = useAuthStore((state) => state.user);
  const homeUrl = getHomeByRole(user?.role);

  return (
    <main className="flex min-h-screen items-center justify-center bg-surface p-6">
      <div className="max-w-md text-center">
        <Icon name="search" className="mx-auto mb-6 h-20 w-20 text-fg-muted" />
        <h1 className="mb-3 text-3xl font-bold text-fg">Страница не найдена</h1>
        <p className="mb-2 text-fg-muted">Запрошенный адрес не существует или был перемещён.</p>
        <p className="mb-8 font-mono text-sm text-fg-muted">{location.pathname}</p>
        <div className="flex justify-center gap-3">
          <Button variant="secondary" onClick={() => window.history.back()}>
            Назад
          </Button>
          <Link
            to={homeUrl}
            className="focus-ring inline-flex h-10 items-center justify-center rounded bg-royal px-4 text-sm font-medium text-white transition-colors hover:bg-cyan"
          >
            На главную
          </Link>
        </div>
      </div>
    </main>
  );
}
