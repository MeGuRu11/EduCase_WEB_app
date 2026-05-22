import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import type { AxiosError } from 'axios';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { EmptyState } from '@/components/ui/EmptyState';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { Table, type TableColumn } from '@/components/ui/Table';
import {
  useArchiveScenario,
  useCreateScenario,
  useDeleteScenario,
  useDuplicateScenario,
  usePublishScenario,
  useScenarios,
} from '@/hooks/useScenarios';
import type { ScenarioListOut, ScenarioStatus } from '@/types/scenario';

function extractApiErrorMessage(error: unknown) {
  const data = (error as AxiosError<{ detail?: string | Array<{ msg?: string }> }> | undefined)?.response?.data;
  if (typeof data?.detail === 'string') return data.detail;
  if (Array.isArray(data?.detail)) return data.detail.map((item) => item.msg).filter(Boolean).join('; ');
  return 'Не удалось создать сценарий';
}

type Filter = ScenarioStatus | 'all';

const statusVariant: Record<ScenarioStatus, 'accent' | 'info' | 'neutral'> = {
  archived: 'neutral',
  draft: 'accent',
  published: 'info',
};

const statusLabels: Record<ScenarioStatus, string> = {
  archived: 'Архив',
  draft: 'Черновик',
  published: 'Опубликован',
};

export default function MyScenarios() {
  const navigate = useNavigate();
  const [status, setStatus] = useState<Filter>('all');
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [createTitle, setCreateTitle] = useState('');
  const [createDescription, setCreateDescription] = useState('');
  const [createError, setCreateError] = useState('');
  const scenarios = useScenarios({ status });
  const createScenario = useCreateScenario();
  const duplicateScenario = useDuplicateScenario();
  const publishScenario = usePublishScenario();
  const archiveScenario = useArchiveScenario();
  const deleteScenario = useDeleteScenario();

  const complete = () => setMessage('Выполнено');

  const openCreateModal = () => {
    setCreateTitle('');
    setCreateDescription('');
    setCreateError('');
    setCreateOpen(true);
  };

  const submitCreate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setCreateError('');
    if (!createTitle.trim()) {
      setCreateError('Укажите название сценария.');
      return;
    }
    try {
      const scenario = await createScenario.mutateAsync({
        title: createTitle.trim(),
        description: createDescription.trim() || undefined,
      });
      setCreateOpen(false);
      navigate(`/teacher/scenarios/${scenario.id}/edit`);
    } catch (error) {
      setCreateError(extractApiErrorMessage(error));
    }
  };

  const publish = (id: number) => {
    publishScenario.mutate(id, {
      onSuccess: (result) => {
        setMessage(
          result.errors.length
            ? `Не удалось опубликовать: ${result.errors.join('; ')}`
            : 'Сценарий опубликован',
        );
      },
    });
  };

  const columns: TableColumn<ScenarioListOut>[] = [
    {
      header: 'Название',
      key: 'title',
      render: (row) => (
        <div>
          <Link to={`/teacher/scenarios/${row.id}/edit`} className="font-semibold text-royal-ink hover:text-purple-ink">
            {row.title}
          </Link>
          <p className="text-xs text-fg-muted">{row.description}</p>
        </div>
      ),
    },
    {
      header: 'Статус',
      key: 'status',
      render: (row) => <Badge variant={statusVariant[row.status]}>{statusLabels[row.status]}</Badge>,
    },
    { header: 'Узлы', key: 'node_count' },
    {
      header: 'Действия',
      key: 'actions',
      render: (row) => (
        <div className="flex flex-wrap gap-2">
          {row.status === 'draft' ? (
            <Button size="sm" variant="primary" onClick={() => publish(row.id)}>
              Опубликовать
            </Button>
          ) : null}
          <Button size="sm" variant="secondary" onClick={() => duplicateScenario.mutate(row.id, { onSuccess: complete })}>
            Дублировать
          </Button>
          {row.status !== 'archived' ? (
            <Button size="sm" variant="ghost" onClick={() => archiveScenario.mutate(row.id, { onSuccess: complete })}>
              В архив
            </Button>
          ) : null}
          <Button size="sm" variant="danger" onClick={() => setDeleteId(row.id)}>
            Удалить
          </Button>
        </div>
      ),
    },
  ];

  const confirmDelete = () => {
    if (deleteId === null) return;
    deleteScenario.mutate(deleteId, {
      onSuccess: complete,
      onSettled: () => setDeleteId(null),
    });
  };

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm text-fg-muted">Рабочая область преподавателя</p>
          <h1 className="text-3xl font-bold text-fg">Мои сценарии</h1>
        </div>
        <Button variant="primary" onClick={openCreateModal}>
          Создать сценарий
        </Button>
      </header>

      <div className="rounded-xl border border-border bg-bg p-4">
        <label htmlFor="status-filter" className="mb-1 block text-sm font-medium text-fg">
          Фильтр по статусу
        </label>
        <select
          id="status-filter"
          value={status}
          onChange={(event) => setStatus(event.target.value as Filter)}
          className="h-10 rounded border border-border bg-bg px-3 text-sm text-fg focus:border-royal focus:outline-none focus:ring-2 focus:ring-royal/40"
        >
          <option value="all">Все</option>
          <option value="draft">Черновик</option>
          <option value="published">Опубликован</option>
          <option value="archived">Архив</option>
        </select>
      </div>

      {message ? <div className="rounded border border-success/30 bg-success/10 p-3 text-sm text-success-ink">{message}</div> : null}

      {scenarios.data?.length || scenarios.isLoading || scenarios.isError ? (
        <Table
          columns={columns}
          data={scenarios.data ?? []}
          emptyMessage="Нет сценариев по этому фильтру."
          error={scenarios.error ? 'Не удалось загрузить сценарии.' : null}
          getRowKey={(row) => row.id}
          isLoading={scenarios.isLoading}
        />
      ) : (
        <EmptyState
          icon="editor"
          title="Сценариев пока нет"
          description="Создайте первый клинический кейс и назначьте его группе."
        />
      )}

      <Modal
        open={createOpen}
        title="Создать сценарий"
        onClose={() => setCreateOpen(false)}
        footer={
          <>
            <Button variant="secondary" onClick={() => setCreateOpen(false)}>
              Отмена
            </Button>
            <Button type="submit" form="create-scenario-form" isLoading={createScenario.isPending}>
              Создать
            </Button>
          </>
        }
      >
        <form id="create-scenario-form" className="space-y-4" onSubmit={(event) => void submitCreate(event)} noValidate>
          <Input
            label="Название"
            value={createTitle}
            onChange={(event) => setCreateTitle(event.target.value)}
            error={createError || undefined}
          />
          <div className="space-y-1.5">
            <label htmlFor="create-scenario-description" className="block text-sm font-medium text-fg">
              Описание
            </label>
            <textarea
              id="create-scenario-description"
              value={createDescription}
              onChange={(event) => setCreateDescription(event.target.value)}
              rows={4}
              className="w-full rounded border border-border bg-bg px-3 py-2 text-sm text-fg focus:border-royal focus:outline-none focus:ring-2 focus:ring-royal/40"
            />
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={deleteId !== null}
        title="Удалить сценарий"
        description="Черновики удаляются безвозвратно. Это действие нельзя отменить."
        confirmLabel="Удалить"
        onCancel={() => setDeleteId(null)}
        onConfirm={confirmDelete}
      />
    </div>
  );
}
