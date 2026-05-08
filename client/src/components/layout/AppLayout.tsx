import { Outlet, useNavigate } from 'react-router-dom';
import MaintenanceBanner from '@/components/admin/MaintenanceBanner';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { useIdleTimeout } from '@/hooks/useIdleTimeout';
import { useMaintenanceModePolling } from '@/hooks/useMaintenanceMode';
import { useAuthStore } from '@/stores/authStore';
import { Sidebar } from './Sidebar';
import { TopBar } from './TopBar';

export function AppLayout() {
  useMaintenanceModePolling();
  const navigate = useNavigate();
  const logout = useAuthStore((state) => state.logout);
  const { confirmActive, countdown, isPromptOpen } = useIdleTimeout(30, () => {
    logout();
    navigate('/login?reason=idle', { replace: true });
  });

  return (
    <div className="flex min-h-screen bg-surface text-fg">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <MaintenanceBanner />
        <TopBar idleCountdown={isPromptOpen ? countdown : null} />
        <main className="min-w-0 flex-1 p-6">
          <Outlet />
        </main>
      </div>
      <Modal
        open={isPromptOpen}
        title="Вы всё ещё здесь?"
        onClose={confirmActive}
        footer={<Button onClick={confirmActive}>Я здесь</Button>}
      >
        <p className="text-sm text-fg-muted">
          Сессия будет завершена через {countdown} секунд, если активность не возобновится.
        </p>
      </Modal>
    </div>
  );
}

export default AppLayout;
