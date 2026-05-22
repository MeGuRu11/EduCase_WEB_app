import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { useAuthStore } from '@/stores/authStore';

export interface TopBarProps {
  idleCountdown?: number | null;
}

function initials(name?: string) {
  if (!name) return 'EC';
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('');
}

export function TopBar({ idleCountdown = null }: TopBarProps) {
  const user = useAuthStore((state) => state.user);
  const logout = useAuthStore((state) => state.logout);

  return (
    <header className="flex h-16 items-center justify-between border-b border-border bg-bg px-6">
      <div>
        <p className="text-sm text-fg-muted">Рабочая область</p>
        <p className="text-lg font-semibold text-fg">{user?.full_name ?? 'EpiCase'}</p>
      </div>
      <div className="flex items-center gap-3">
        {idleCountdown !== null ? (
          <span className="inline-flex items-center gap-2 rounded-full bg-warning/10 px-3 py-1 text-sm text-warning-ink">
            <Icon name="clock" className="h-4 w-4" />
            Выход через {idleCountdown} сек.
          </span>
        ) : null}
        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-royal/10 text-sm font-semibold text-royal-ink">
          {initials(user?.full_name)}
        </div>
        <Button variant="ghost" size="sm" onClick={logout}>
          Выйти
        </Button>
      </div>
    </header>
  );
}

export default TopBar;
