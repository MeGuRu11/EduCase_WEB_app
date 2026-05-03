import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { EmptyState } from '@/components/ui/EmptyState';
import { Table, type TableColumn } from '@/components/ui/Table';
import {
  useArchiveScenario,
  useDeleteScenario,
  useDuplicateScenario,
  useScenarios,
} from '@/hooks/useScenarios';
import type { ScenarioListOut, ScenarioStatus } from '@/types/scenario';

type Filter = ScenarioStatus | 'all';

const statusVariant: Record<ScenarioStatus, 'accent' | 'info' | 'neutral'> = {
  archived: 'neutral',
  draft: 'accent',
  published: 'info',
};

export default function MyScenarios() {
  const [status, setStatus] = useState<Filter>('all');
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const scenarios = useScenarios({ status });
  const duplicateScenario = useDuplicateScenario();
  const archiveScenario = useArchiveScenario();
  const deleteScenario = useDeleteScenario();

  const complete = () => setMessage('Action completed');
  const columns: TableColumn<ScenarioListOut>[] = [
    {
      header: 'Title',
      key: 'title',
      render: (row) => (
        <div>
          <Link to={`/teacher/scenarios/${row.id}/edit`} className="font-semibold text-royal hover:text-purple">
            {row.title}
          </Link>
          <p className="text-xs text-fg-muted">{row.description}</p>
        </div>
      ),
    },
    {
      header: 'Status',
      key: 'status',
      render: (row) => <Badge variant={statusVariant[row.status]}>{row.status}</Badge>,
    },
    { header: 'Nodes', key: 'node_count' },
    {
      header: 'Actions',
      key: 'actions',
      render: (row) => (
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="secondary" onClick={() => duplicateScenario.mutate(row.id, { onSuccess: complete })}>
            Duplicate
          </Button>
          <Button size="sm" variant="ghost" onClick={() => archiveScenario.mutate(row.id, { onSuccess: complete })}>
            Archive
          </Button>
          <Button size="sm" variant="danger" onClick={() => setDeleteId(row.id)}>
            Delete
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
          <p className="text-sm text-fg-muted">Teacher workspace</p>
          <h1 className="text-3xl font-bold text-fg">My scenarios</h1>
        </div>
        <Button variant="primary">Create scenario</Button>
      </header>

      <div className="rounded-xl border border-border bg-bg p-4">
        <label htmlFor="status-filter" className="mb-1 block text-sm font-medium text-fg">
          Status filter
        </label>
        <select
          id="status-filter"
          value={status}
          onChange={(event) => setStatus(event.target.value as Filter)}
          className="h-10 rounded border border-border bg-bg px-3 text-sm text-fg focus:border-royal focus:outline-none focus:ring-2 focus:ring-royal/40"
        >
          <option value="all">All</option>
          <option value="draft">Draft</option>
          <option value="published">Published</option>
          <option value="archived">Archived</option>
        </select>
      </div>

      {message ? <div className="rounded border border-success/30 bg-success/10 p-3 text-sm text-success">{message}</div> : null}

      {scenarios.data?.length || scenarios.isLoading || scenarios.isError ? (
        <Table
          columns={columns}
          data={scenarios.data ?? []}
          emptyMessage="No scenarios match this filter."
          error={scenarios.error ? 'Failed to load scenarios.' : null}
          getRowKey={(row) => row.id}
          isLoading={scenarios.isLoading}
        />
      ) : (
        <EmptyState
          icon="editor"
          title="No scenarios yet"
          description="Create your first clinical case and assign it to a group."
        />
      )}

      <ConfirmDialog
        open={deleteId !== null}
        title="Delete scenario"
        description="Draft scenarios can be deleted permanently. This action cannot be undone."
        confirmLabel="Confirm delete"
        onCancel={() => setDeleteId(null)}
        onConfirm={confirmDelete}
      />
    </div>
  );
}
