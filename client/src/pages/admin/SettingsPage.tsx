import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Skeleton } from '@/components/ui/Skeleton';
import { notify } from '@/components/ui/Toast';
import { useAdminSettings, useUpdateAdminSettings } from '@/hooks/useAdmin';
import type { SystemSettingUpdate } from '@/types/admin';

interface SettingsForm {
  institution_name: string;
  idle_timeout_min: number;
  max_file_upload_mb: number;
  backup_retention_days: number;
}

const initialForm: SettingsForm = {
  institution_name: '',
  idle_timeout_min: 30,
  max_file_upload_mb: 5,
  backup_retention_days: 90,
};

export default function SettingsPage() {
  const settings = useAdminSettings();
  const updateSettings = useUpdateAdminSettings();
  const [form, setForm] = useState(initialForm);
  const [baseline, setBaseline] = useState(initialForm);

  useEffect(() => {
    if (!settings.data) return;
    const next = {
      institution_name: settings.data.institution_name ?? '',
      idle_timeout_min: settings.data.idle_timeout_min ?? 30,
      max_file_upload_mb: settings.data.max_file_upload_mb ?? 5,
      backup_retention_days: settings.data.backup_retention_days ?? 90,
    };
    setForm(next);
    setBaseline(next);
  }, [settings.data]);

  const isDirty = useMemo(() => JSON.stringify(form) !== JSON.stringify(baseline), [baseline, form]);

  useEffect(() => {
    if (!isDirty) return undefined;
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [isDirty]);

  async function save() {
    const payload: SystemSettingUpdate = {
      institution_name: form.institution_name,
      idle_timeout_min: Number(form.idle_timeout_min),
      max_file_upload_mb: Number(form.max_file_upload_mb),
      backup_retention_days: Number(form.backup_retention_days),
    };
    const saved = await updateSettings.mutateAsync(payload);
    const next = {
      institution_name: saved.institution_name ?? '',
      idle_timeout_min: saved.idle_timeout_min ?? payload.idle_timeout_min ?? 30,
      max_file_upload_mb: saved.max_file_upload_mb ?? payload.max_file_upload_mb ?? 5,
      backup_retention_days: saved.backup_retention_days ?? payload.backup_retention_days ?? 90,
    };
    setForm(next);
    setBaseline(next);
    notify.success('Настройки сохранены');
  }

  if (settings.isLoading) return <Skeleton rows={5} label="Загрузка таблицы" />;

  if (settings.isError || !settings.data) {
    return <div role="alert" className="rounded border border-danger/30 bg-danger/10 p-4 text-danger-ink">Не удалось загрузить настройки.</div>;
  }

  return (
    <div className="space-y-6">
      <header>
        <p className="text-sm font-semibold uppercase tracking-wide text-danger-ink">АДМИНИСТРАТОР: НАСТРОЙКИ</p>
        <h1 className="text-3xl font-bold text-fg">Настройки</h1>
        <p className="mt-1 text-sm text-fg-muted">Параметры учреждения, сессий, загрузок и срока хранения бэкапов.</p>
      </header>

      {isDirty ? (
        <div role="alert" className="rounded border border-warning/30 bg-warning/10 p-4 text-sm font-medium text-warning-ink">
          Есть несохранённые изменения
        </div>
      ) : null}

      <Card title="Системные настройки">
        <form className="grid gap-4 md:grid-cols-2" onSubmit={(event) => { event.preventDefault(); void save(); }}>
          <Input
            label="Название учреждения"
            value={form.institution_name}
            onChange={(event) => setForm((current) => ({ ...current, institution_name: event.target.value }))}
          />
          <Input
            label="Тайм-аут бездействия, мин"
            type="number"
            min={5}
            max={120}
            value={form.idle_timeout_min}
            onChange={(event) => setForm((current) => ({ ...current, idle_timeout_min: Number(event.target.value) }))}
          />
          <Input
            label="Максимальный размер файла, МБ"
            type="number"
            min={1}
            max={50}
            value={form.max_file_upload_mb}
            onChange={(event) => setForm((current) => ({ ...current, max_file_upload_mb: Number(event.target.value) }))}
          />
          <Input
            label="Хранение бэкапов, дней"
            type="number"
            min={7}
            max={365}
            value={form.backup_retention_days}
            onChange={(event) => setForm((current) => ({ ...current, backup_retention_days: Number(event.target.value) }))}
          />
          <div className="md:col-span-2 flex justify-end">
            <Button type="submit" isLoading={updateSettings.isPending} disabled={!isDirty}>Сохранить настройки</Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
