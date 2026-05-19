import { NavLink } from 'react-router-dom';
import { Icon, type IconName } from '@/components/ui/Icon';
import { Logo } from '@/components/ui/Logo';
import { useAuthStore } from '@/stores/authStore';
import type { UserRole } from '@/types/user';
import { cn } from '@/utils/cn';

interface SidebarItem {
  label: string;
  href: string;
  icon: IconName;
}

const itemsByRole: Record<UserRole, SidebarItem[]> = {
  student: [
    { label: 'Dashboard', href: '/student', icon: 'dashboard' },
    { label: 'Cases', href: '/student/cases', icon: 'cases' },
    { label: 'Results', href: '/student/results', icon: 'attempts' },
  ],
  teacher: [
    { label: 'Dashboard', href: '/teacher', icon: 'dashboard' },
    { label: 'Scenarios', href: '/teacher/scenarios', icon: 'editor' },
    { label: 'Groups', href: '/teacher/groups', icon: 'groups' },
    { label: 'Analytics', href: '/teacher/analytics', icon: 'analytics' },
  ],
  admin: [
    { label: 'Dashboard', href: '/admin', icon: 'admin' },
    { label: 'Users', href: '/admin/users', icon: 'users' },
    { label: 'System', href: '/admin/system', icon: 'system' },
    { label: 'Settings', href: '/admin/settings', icon: 'settings' },
  ],
};

export function Sidebar() {
  const user = useAuthStore((state) => state.user);
  const items = user ? itemsByRole[user.role] : [];

  return (
    <aside className="w-64 shrink-0 border-r border-border bg-bg">
      <div className="flex h-16 items-center border-b border-border px-5">
        <Logo size="sm" />
      </div>
      <nav aria-label="Основная навигация" className="space-y-1 p-3">
        {items.map((item) => (
          <NavLink
            key={item.href}
            to={item.href}
            end
            className={({ isActive }) =>
              cn(
                'focus-ring flex items-center gap-3 rounded px-3 py-2 text-sm font-medium transition-colors',
                isActive ? 'bg-royal/10 text-royal-ink' : 'text-fg-muted hover:bg-lavender/30 hover:text-fg',
              )
            }
          >
            <Icon name={item.icon} className="h-5 w-5" />
            {item.label}
          </NavLink>
        ))}
      </nav>
    </aside>
  );
}

export default Sidebar;
