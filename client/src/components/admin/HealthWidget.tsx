import { useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { Badge } from '@/components/ui/Badge';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { Skeleton } from '@/components/ui/Skeleton';
import { Table } from '@/components/ui/Table';
import { useAdminHealth, useAdminLogs } from '@/hooks/useAdmin';
import type { HealthStatus, SystemLogOut } from '@/types/admin';
import { formatDateTime } from '@/utils/formatters';

const SOUND_RATE_LIMIT_MS = 5 * 60 * 1000;

const statusMeta: Record<HealthStatus, { label: string; className: string; badge: 'success' | 'warning' | 'danger' }> = {
  ok: { label: 'Система в норме', className: 'border-success/30 bg-success/10 text-success', badge: 'success' },
  warning: { label: 'Требует внимания', className: 'border-warning/30 bg-warning/10 text-warning', badge: 'warning' },
  error: { label: 'Критическая ошибка', className: 'border-danger/30 bg-danger/10 text-danger', badge: 'danger' },
};

function playAlert() {
  if (typeof Audio === 'undefined') return;
  try {
    void new Audio('/sounds/alert.mp3').play().catch(() => undefined);
  } catch {
    // Audio is an accessibility enhancement; visual error state remains authoritative.
  }
}

export default function HealthWidget() {
  const health = useAdminHealth();
  const recentErrors = useAdminLogs('ERROR', 1, 5);
  const previousStatus = useRef<HealthStatus | undefined>(undefined);
  const lastAlertAt = useRef(Number.NEGATIVE_INFINITY);

  useEffect(() => {
    const nextStatus = health.data?.status;
    if (!nextStatus) return;

    const movedToProblem = previousStatus.current === 'ok' && nextStatus !== 'ok';
    const canAlert = Date.now() - lastAlertAt.current >= SOUND_RATE_LIMIT_MS;
    if (movedToProblem && canAlert) {
      playAlert();
      lastAlertAt.current = Date.now();
    }
    previousStatus.current = nextStatus;
  }, [health.data?.status]);

  if (health.isLoading) return <div data-testid="health-widget"><Skeleton rows={4} label="Loading table" /></div>;

  if (health.isError || !health.data) {
    return (
      <div data-testid="health-widget">
        <Card title="HealthWidget">
          <div role="alert" className="rounded border border-danger/30 bg-danger/10 p-4 text-sm text-danger">
            Не удалось загрузить состояние системы.
          </div>
        </Card>
      </div>
    );
  }

  const meta = statusMeta[health.data.status];
  const checkRows = Object.entries(health.data.checks).map(([name, check]) => ({ name, ...check }));
  const logs = recentErrors.data?.items ?? [];

  return (
    <div data-testid="health-widget">
      <Card title="HealthWidget" description="ADR-011: in-app health alerts">
        <div
          role="status"
          data-testid="health-status"
          data-status={health.data.status}
          className={`rounded-lg border px-4 py-3 ${meta.className}`}
        >
          <div className="flex items-center justify-between gap-3">
            <span className="font-semibold">{meta.label}</span>
            <Badge variant={meta.badge}>{health.data.status}</Badge>
          </div>
          <p className="mt-1 text-sm">Версия {health.data.version}</p>
        </div>

        <div className="mt-4 grid gap-4 xl:grid-cols-2">
          <Table
            data={checkRows}
            getRowKey={(row) => row.name}
            emptyMessage="Нет проверок"
            columns={[
              { key: 'name', header: 'Проверка' },
              { key: 'status', header: 'Статус', render: (row) => <Badge variant={statusMeta[row.status].badge}>{row.status}</Badge> },
              { key: 'message', header: 'Детали', render: (row) => row.message ?? row.latency_ms ?? row.free_gb ?? row.count ?? 'ok' },
            ]}
          />

          <div className="rounded-lg border border-border bg-surface p-4">
            <div className="flex items-center justify-between gap-3">
              <h3 className="font-semibold text-fg">Последние ERROR-логи</h3>
              <Link className="focus-ring rounded text-sm text-royal hover:text-cyan" to="/admin/system?tab=logs">
                Все логи
              </Link>
            </div>
            {logs.length ? (
              <ul className="mt-3 space-y-2">
                {logs.slice(0, 5).map((log: SystemLogOut) => (
                  <li key={log.id} className="rounded border border-border bg-bg p-3 text-sm">
                    <p className="font-medium text-fg">{log.message}</p>
                    <p className="text-xs text-fg-muted">{formatDateTime(log.created_at)}</p>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState icon="analytics" title="ERROR-логов нет" />
            )}
          </div>
        </div>
      </Card>
    </div>
  );
}