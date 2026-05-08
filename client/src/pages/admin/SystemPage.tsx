import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { Skeleton } from '@/components/ui/Skeleton';
import { Table } from '@/components/ui/Table';
import { notify } from '@/components/ui/Toast';
import {
  useAdminBackups,
  useAdminLogs,
  useAdminSysinfo,
  useCreateBackup,
  useDeleteBackup,
  useRestoreBackup,
} from '@/hooks/useAdmin';
import type { BackupInfo, LogLevel, SystemLogOut } from '@/types/admin';
import { useAuthStore } from '@/stores/authStore';
import { formatDateTime } from '@/utils/formatters';

function SelectField({ children, label, onChange, value }: { children: ReactNode; label: string; onChange: (value: string) => void; value: string }) {
  return (
    <label className="block space-y-1.5 text-sm font-medium text-fg">
      <span>{label}</span>
      <select
        className="h-10 rounded border border-border bg-bg px-3 text-sm text-fg focus:border-royal focus:outline-none focus:ring-2 focus:ring-royal/40"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        {children}
      </select>
    </label>
  );
}

function exportLogsCsv(logs: SystemLogOut[]) {
  const rows = ['id;level;message;username;created_at', ...logs.map((log) => [log.id, log.level, log.message, log.username ?? '', log.created_at].join(';'))];
  const link = document.createElement('a');
  link.href = `data:text/csv;charset=utf-8,${encodeURIComponent(rows.join('\n'))}`;
  link.download = 'system_logs.csv';
  link.click();
}

export default function SystemPage() {
  const navigate = useNavigate();
  const logout = useAuthStore((state) => state.logout);
  const setMaintenanceMode = useAuthStore((state) => state.setMaintenanceMode);
  const [logLevel, setLogLevel] = useState<LogLevel | 'all'>('all');
  const [restoreTarget, setRestoreTarget] = useState<BackupInfo | null>(null);
  const [restoreStep, setRestoreStep] = useState<'idle' | 'first' | 'type' | 'final'>('idle');
  const [typedBackupName, setTypedBackupName] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<BackupInfo | null>(null);
  const [restorePolling, setRestorePolling] = useState(false);
  const sawMaintenanceDuringRestore = useRef(false);

  const sysinfo = useAdminSysinfo(restorePolling ? 5_000 : false);
  const backups = useAdminBackups();
  const logs = useAdminLogs(logLevel, 1, 20);
  const createBackup = useCreateBackup();
  const deleteBackup = useDeleteBackup();
  const restoreBackup = useRestoreBackup();

  useEffect(() => {
    if (!sysinfo.data) return;
    setMaintenanceMode(sysinfo.data.maintenance_mode);
    if (!restorePolling) return;
    if (sysinfo.data.maintenance_mode) {
      sawMaintenanceDuringRestore.current = true;
      return;
    }
    if (sawMaintenanceDuringRestore.current) {
      notify.success('Восстановление завершено');
      setRestorePolling(false);
      sawMaintenanceDuringRestore.current = false;
      logout();
      navigate('/login?reason=system_restored', { replace: true });
    }
  }, [logout, navigate, restorePolling, setMaintenanceMode, sysinfo.data]);

  const isLoading = sysinfo.isLoading || backups.isLoading || logs.isLoading;
  const hasError = sysinfo.isError || backups.isError || logs.isError;
  const logRows = logs.data?.items ?? [];

  function startRestore(backup: BackupInfo) {
    setRestoreTarget(backup);
    setRestoreStep('first');
    setTypedBackupName('');
  }

  async function confirmRestore() {
    if (!restoreTarget) return;
    await restoreBackup.mutateAsync(restoreTarget.filename);
    setRestoreStep('idle');
    setRestoreTarget(null);
    setMaintenanceMode(true);
    setRestorePolling(true);
    sawMaintenanceDuringRestore.current = false;
    void sysinfo.refetch();
  }

  if (isLoading) return <Skeleton rows={6} label="Loading table" />;

  if (hasError || !sysinfo.data) {
    return <div role="alert" className="rounded border border-danger/30 bg-danger/10 p-4 text-danger">Не удалось загрузить системную панель.</div>;
  }

  return (
    <div className="space-y-6">
      <header>
        <p className="text-sm font-semibold uppercase tracking-wide text-danger">Admin system</p>
        <h1 className="text-3xl font-bold text-fg">Система</h1>
        <p className="mt-1 text-sm text-fg-muted">Sysinfo, backups, restore orchestration и журналы.</p>
      </header>

      <section className="grid gap-4 md:grid-cols-5" aria-label="Сведения о системе">
        <Card className="p-5"><p className="text-sm text-fg-muted">Размер БД</p><p className="mt-2 text-2xl font-bold text-fg">{sysinfo.data.db_size_mb.toFixed(1)} МБ</p></Card>
        <Card className="p-5"><p className="text-sm text-fg-muted">Версия</p><p className="mt-2 text-2xl font-bold text-fg">{sysinfo.data.version}</p></Card>
        <Card className="p-5"><p className="text-sm text-fg-muted">Python</p><p className="mt-2 text-2xl font-bold text-fg">{sysinfo.data.python_version}</p></Card>
        <Card className="p-5"><p className="text-sm text-fg-muted">Uptime</p><p className="mt-2 text-2xl font-bold text-fg">{sysinfo.data.uptime_hours.toFixed(1)} ч</p></Card>
        <Card className="p-5"><p className="text-sm text-fg-muted">Maintenance</p><p className="mt-2"><Badge variant={sysinfo.data.maintenance_mode ? 'danger' : 'success'}>{sysinfo.data.maintenance_mode ? 'Включён' : 'Выключен'}</Badge></p></Card>
      </section>

      <Card title="Бэкапы" description="Restore запускается только после triple-confirm.">
        <div className="mb-4 flex justify-end">
          <Button onClick={() => createBackup.mutate()} isLoading={createBackup.isPending}>Создать бэкап</Button>
        </div>
        <Table
          data={backups.data ?? []}
          getRowKey={(backup) => backup.filename}
          emptyMessage="Бэкапов нет"
          columns={[
            { key: 'filename', header: 'Имя файла' },
            { key: 'size_mb', header: 'Размер', render: (backup) => `${backup.size_mb.toFixed(1)} МБ` },
            { key: 'created_at', header: 'Создан', render: (backup) => formatDateTime(backup.created_at) },
            { key: 'age_human', header: 'Возраст' },
            {
              key: 'actions',
              header: 'Действия',
              render: (backup) => (
                <div className="flex flex-wrap gap-2">
                  <a className="focus-ring inline-flex h-8 items-center rounded px-3 text-sm text-royal hover:bg-lavender/30" href={`/api/admin/backup/${encodeURIComponent(backup.filename)}`}>Скачать</a>
                  <Button size="sm" variant="danger" onClick={() => startRestore(backup)}>Восстановить {backup.filename}</Button>
                  <Button size="sm" variant="ghost" onClick={() => setDeleteTarget(backup)}>Удалить</Button>
                </div>
              ),
            },
          ]}
        />
      </Card>

      <Card title="Логи системы">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <SelectField label="Уровень логов" value={logLevel} onChange={(value) => setLogLevel(value as LogLevel | 'all')}>
            <option value="all">Все</option>
            <option value="DEBUG">DEBUG</option>
            <option value="INFO">INFO</option>
            <option value="WARNING">WARNING</option>
            <option value="ERROR">ERROR</option>
            <option value="CRITICAL">CRITICAL</option>
          </SelectField>
          <Button variant="secondary" onClick={() => exportLogsCsv(logRows)}>Экспорт CSV</Button>
        </div>
        <Table
          data={logRows}
          getRowKey={(log) => log.id}
          emptyMessage="Логов нет"
          columns={[
            { key: 'level', header: 'Уровень', render: (log) => <Badge variant={log.level === 'ERROR' || log.level === 'CRITICAL' ? 'danger' : log.level === 'WARNING' ? 'warning' : 'neutral'}>{log.level}</Badge> },
            { key: 'message', header: 'Сообщение' },
            { key: 'username', header: 'Пользователь', render: (log) => log.username ?? 'system' },
            { key: 'created_at', header: 'Дата', render: (log) => formatDateTime(log.created_at) },
          ]}
        />
        <p className="mt-3 text-sm text-fg-muted">Страница {logs.data?.page ?? 1} из {logs.data?.pages ?? 1}</p>
      </Card>

      <ConfirmDialog
        open={restoreStep === 'first'}
        title="Восстановить бэкап"
        description="Это заменит все данные текущей БД данными из бэкапа. Все активные попытки будут прерваны."
        confirmLabel="Я понимаю"
        onCancel={() => setRestoreStep('idle')}
        onConfirm={() => setRestoreStep('type')}
      />

      <Modal
        open={restoreStep === 'type'}
        title="Введите имя бэкапа"
        onClose={() => setRestoreStep('idle')}
        footer={
          <>
            <Button variant="secondary" onClick={() => setRestoreStep('idle')}>Отмена</Button>
            <Button disabled={typedBackupName !== restoreTarget?.filename} onClick={() => setRestoreStep('final')}>Продолжить</Button>
          </>
        }
      >
        <div className="space-y-4">
          <p className="text-sm text-fg-muted">Введите имя бэкапа для подтверждения: <span className="font-semibold text-fg">{restoreTarget?.filename}</span></p>
          <Input label="Имя бэкапа" value={typedBackupName} onChange={(event) => setTypedBackupName(event.target.value)} />
        </div>
      </Modal>

      <ConfirmDialog
        open={restoreStep === 'final'}
        title="ПОДТВЕРДИТЕ восстановление"
        description="Финальное подтверждение. После запуска восстановление нельзя отменить, а текущая сессия будет завершена после окончания операции."
        confirmLabel="Восстановить систему"
        onCancel={() => setRestoreStep('idle')}
        onConfirm={() => void confirmRestore()}
      />

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="Удалить бэкап"
        description={`Бэкап ${deleteTarget?.filename ?? ''} будет удалён без возможности восстановления.`}
        confirmLabel="Удалить"
        onCancel={() => setDeleteTarget(null)}
        onConfirm={() => {
          if (deleteTarget) deleteBackup.mutate(deleteTarget.filename);
          setDeleteTarget(null);
        }}
      />
    </div>
  );
}