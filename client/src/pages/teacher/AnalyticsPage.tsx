import { useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { Background, Controls, MiniMap, ReactFlow, type Edge, type Node } from '@xyflow/react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useExportAnalytics, usePathHeatmap, useTeacherScenarioStats } from '@/hooks/useAnalytics';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { Modal } from '@/components/ui/Modal';
import { Skeleton } from '@/components/ui/Skeleton';
import { Table, type TableColumn } from '@/components/ui/Table';
import { formatDuration, formatPercent } from '@/utils/formatters';
import type { AnalyticsExportFormat } from '@/api/analytics';
import type { HeatmapNode as AnalyticsHeatmapNode, StudentRankingEntry, TeacherScenarioStatsOut, WeakNodeOut } from '@/types/analytics';

type AnalyticsTab = 'heatmap' | 'distribution' | 'ranking' | 'weak';
type RankingSort = 'score_desc' | 'duration_asc';

const tabs: Array<{ id: AnalyticsTab; label: string }> = [
  { id: 'heatmap', label: 'Тепловая карта' },
  { id: 'distribution', label: 'Распределение' },
  { id: 'ranking', label: 'Рейтинг' },
  { id: 'weak', label: 'Слабые узлы' },
];

function KpiTile({ label, value }: { label: string; value: string | number }) {
  return (
    <Card className="p-5">
      <p className="text-sm text-fg-muted">{label}</p>
      <p className="mt-2 text-3xl font-bold text-fg tabular-nums">{value}</p>
    </Card>
  );
}

function parseNumber(value: string | undefined) {
  if (!value) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function avgDuration(stat: TeacherScenarioStatsOut) {
  if (!stat.student_ranking.length) return null;
  return Math.round(stat.student_ranking.reduce((sum, row) => sum + row.duration_sec, 0) / stat.student_ranking.length);
}

function heatmapColor(score: number | null) {
  if (score == null) return 'var(--color-lavender)';
  if (score > 80) return 'var(--color-success)';
  if (score > 50) return 'var(--color-warning)';
  return 'var(--color-danger)';
}

function toFlowNodes(nodes: AnalyticsHeatmapNode[]): Node[] {
  return nodes.map((node, index) => {
    const color = heatmapColor(node.avg_score_pct);
    return {
      id: node.id,
      position: { x: 90 + (index % 3) * 260, y: 80 + Math.floor(index / 3) * 150 },
      data: { label: node.title, title: node.title },
      style: {
        background: `color-mix(in srgb, ${color} 14%, var(--color-bg))`,
        border: `2px solid color-mix(in srgb, ${color} 50%, var(--color-border))`,
        borderRadius: '12px',
        color: 'var(--color-fg)',
        padding: '12px 16px',
        width: 180,
      },
    };
  });
}

function toFlowEdges(edges: Array<{ source: string; target: string; traverse_count: number }>): Edge[] {
  return edges.map((edge) => ({
    id: `${edge.source}-${edge.target}`,
    source: edge.source,
    target: edge.target,
    label: String(edge.traverse_count),
    animated: false,
    style: { stroke: 'var(--color-royal)', strokeWidth: 2 },
  }));
}

function distributionData(stat: TeacherScenarioStatsOut) {
  return stat.score_distribution.bins.map((bin, index) => {
    const next = index === stat.score_distribution.bins.length - 1 ? 100 : stat.score_distribution.bins[index + 1];
    return { label: `${bin}-${next}`, count: stat.score_distribution.counts[index] ?? 0 };
  });
}

function weakOnly(nodes: WeakNodeOut[]) {
  return nodes.filter((node) => node.avg_score_pct < 50).sort((a, b) => b.visit_count - a.visit_count);
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function HeatmapTab({ heatmap, isLoading }: { heatmap: ReturnType<typeof usePathHeatmap>['data']; isLoading: boolean }) {
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const selectedNode = heatmap?.nodes.find((node) => node.id === selectedNodeId) ?? null;

  if (isLoading) return <Skeleton rows={5} label="Загрузка..." />;
  if (!heatmap || !heatmap.nodes.length) return <EmptyState icon="analytics" title="Данных тепловой карты пока нет" />;

  return (
    <>
      <div className="h-96 overflow-hidden rounded-lg border border-border bg-bg">
        <ReactFlow
          nodes={toFlowNodes(heatmap.nodes)}
          edges={toFlowEdges(heatmap.edges)}
          fitView
          nodesDraggable={false}
          nodesConnectable={false}
          elementsSelectable={false}
          onNodeClick={(_, node) => setSelectedNodeId(node.id)}
        >
          <Background />
          <Controls />
          <MiniMap />
        </ReactFlow>
      </div>
      <Modal open={selectedNode != null} title={selectedNode?.title ?? 'Узел'} onClose={() => setSelectedNodeId(null)}>
        {selectedNode ? (
          <div className="space-y-2 text-sm text-fg">
            <p>Тип: {selectedNode.node_type}</p>
            <p>Посещений: {selectedNode.visit_count}</p>
            <p>Средний балл: {formatPercent(selectedNode.avg_score_pct)}</p>
          </div>
        ) : null}
      </Modal>
    </>
  );
}

function DistributionTab({ stat }: { stat: TeacherScenarioStatsOut }) {
  const data = distributionData(stat);
  return (
    <Card title="Распределение результатов">
      <div className="h-72">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
            <CartesianGrid stroke="var(--color-border)" strokeDasharray="3 3" />
            <XAxis dataKey="label" stroke="var(--color-fg-muted)" />
            <YAxis stroke="var(--color-fg-muted)" />
            <Tooltip />
            <Bar dataKey="count" fill="var(--color-royal)" radius={[6, 6, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className="mt-3 flex flex-wrap gap-2 text-xs text-fg-muted">
        {data.map((bin) => <span key={bin.label}>{bin.label}</span>)}
      </div>
    </Card>
  );
}

function RankingTab({ stat }: { stat: TeacherScenarioStatsOut }) {
  const [sort, setSort] = useState<RankingSort>('score_desc');
  const rows = [...stat.student_ranking].sort((a, b) => {
    if (sort === 'duration_asc') return a.duration_sec - b.duration_sec;
    return b.score - a.score;
  });
  const columns: TableColumn<StudentRankingEntry>[] = [
    { key: 'student', header: 'Студент', render: (row) => row.full_name },
    { key: 'score', header: 'Балл', render: (row) => formatPercent(row.score) },
    { key: 'duration', header: 'Время', render: (row) => formatDuration(row.duration_sec) },
    { key: 'path', header: 'Путь', render: (row) => row.path.join(' → ') },
  ];

  return (
    <div className="space-y-4">
      <label className="block max-w-xs space-y-1 text-sm font-medium text-fg">
        <span>Сортировка рейтинга</span>
        <select
          className="h-10 w-full rounded border border-border bg-bg px-3 text-sm text-fg focus:border-royal focus:outline-none focus:ring-2 focus:ring-royal/40"
          value={sort}
          onChange={(event) => setSort(event.target.value as RankingSort)}
        >
          <option value="score_desc">По баллу</option>
          <option value="duration_asc">По времени</option>
        </select>
      </label>
      <Table columns={columns} data={rows} getRowKey={(row) => row.user_id} emptyMessage="Рейтинг пока пуст" />
    </div>
  );
}

function WeakNodesTab({ stat }: { stat: TeacherScenarioStatsOut }) {
  const nodes = weakOnly(stat.weak_nodes);
  if (!nodes.length) return <EmptyState icon="analytics" title="Слабых узлов ниже 50% нет" />;

  return (
    <div className="grid gap-3 md:grid-cols-2">
      {nodes.map((node) => (
        <Card key={node.node_id} className="p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="font-semibold text-fg">{node.title}</h3>
              <p className="text-sm text-fg-muted">{node.node_type} · посещений {node.visit_count}</p>
            </div>
            <Badge variant="danger">{formatPercent(node.avg_score_pct)}</Badge>
          </div>
          {node.most_common_wrong_answer ? <p className="mt-3 text-sm text-fg-muted">Частая ошибка: {node.most_common_wrong_answer}</p> : null}
        </Card>
      ))}
    </div>
  );
}

export default function AnalyticsPage() {
  const params = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const routeScenarioId = parseNumber(params.id);
  const groupId = parseNumber(searchParams.get('group_id') ?? undefined);
  const [tab, setTab] = useState<AnalyticsTab>('heatmap');
  const statsQuery = useTeacherScenarioStats(routeScenarioId);
  const stats = statsQuery.data ?? [];
  const stat = (routeScenarioId ? stats.find((item) => item.scenario_id === routeScenarioId) : stats[0]) ?? null;
  const groupOptions = Array.from(
    new Map(
      stats
        .filter((item) => item.group_id != null)
        .map((item) => [item.group_id as number, item.group_name ?? `Группа ${item.group_id}`]),
    ).entries(),
  );
  const scenarioId = routeScenarioId ?? stat?.scenario_id ?? null;
  const heatmap = usePathHeatmap(scenarioId, groupId);
  const exportMutation = useExportAnalytics();

  async function handleExport(format: AnalyticsExportFormat) {
    const blob = await exportMutation.mutateAsync(format);
    downloadBlob(blob, `analytics.${format}`);
  }

  if (statsQuery.isLoading) return <Skeleton rows={6} label="Загрузка..." />;

  if (statsQuery.isError) {
    return <div role="alert" className="rounded border border-danger/30 bg-danger/10 p-4 text-danger-ink">Не удалось загрузить аналитику.</div>;
  }

  if (!stat) {
    return <EmptyState icon="analytics" title="Аналитика пока недоступна" description="Выберите опубликованный сценарий с попытками." />;
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-col justify-between gap-4 lg:flex-row lg:items-start">
        <div>
          <Link to="/teacher/scenarios" className="text-sm font-semibold text-royal-ink hover:text-cyan-ink">← Назад к сценариям</Link>
          <h1 className="mt-2 text-3xl font-bold text-fg">Аналитика · {stat.scenario_title}</h1>
          <p className="text-sm text-fg-muted">{stat.group_name ? `Группа: ${stat.group_name}` : 'Все доступные группы'}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {groupOptions.length ? (
            <label className="space-y-1 text-sm font-medium text-fg">
              <span>Группа</span>
              <select
                className="h-10 rounded border border-border bg-bg px-3 text-sm text-fg focus:border-royal focus:outline-none focus:ring-2 focus:ring-royal/40"
                value={groupId ?? 'all'}
                onChange={(event) => {
                  const next = new URLSearchParams(searchParams);
                  if (event.target.value === 'all') next.delete('group_id');
                  else next.set('group_id', event.target.value);
                  setSearchParams(next);
                }}
              >
                <option value="all">Все группы</option>
                {groupOptions.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
              </select>
            </label>
          ) : null}
          <Button variant="secondary" onClick={() => handleExport('xlsx')}>
            Скачать XLSX
          </Button>
          <Button variant="secondary" onClick={() => handleExport('pdf')}>
            Скачать PDF
          </Button>
        </div>
      </header>

      <section className="grid gap-4 md:grid-cols-4" aria-label="KPI аналитики">
        <KpiTile label="Прошли" value={`${stat.completed}/${stat.total_students}`} />
        <KpiTile label="Средний балл" value={formatPercent(stat.avg_score)} />
        <KpiTile label="Среднее время" value={formatDuration(avgDuration(stat))} />
        <KpiTile label="Правильный путь" value={stat.path_analysis.correct_path_count} />
      </section>

      <Card>
        <div role="tablist" aria-label="Разделы аналитики" className="mb-5 flex flex-wrap gap-2 border-b border-border pb-3">
          {tabs.map((item) => (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={tab === item.id}
              className={tab === item.id
                ? 'focus-ring rounded bg-purple-ink px-3 py-2 text-sm font-semibold text-white'
                : 'focus-ring rounded px-3 py-2 text-sm font-semibold text-fg-muted hover:bg-surface hover:text-fg'}
              onClick={() => setTab(item.id)}
            >
              {item.label}
            </button>
          ))}
        </div>

        {tab === 'heatmap' ? <HeatmapTab heatmap={heatmap.data} isLoading={heatmap.isLoading} /> : null}
        {tab === 'distribution' ? <DistributionTab stat={stat} /> : null}
        {tab === 'ranking' ? <RankingTab stat={stat} /> : null}
        {tab === 'weak' ? <WeakNodesTab stat={stat} /> : null}
      </Card>
    </div>
  );
}