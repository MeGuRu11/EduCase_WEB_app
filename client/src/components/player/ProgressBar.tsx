import type { NodeOut } from '@/types/scenario';

export interface ProgressBarProps {
  currentNode?: NodeOut | null;
  path: string[];
}

export default function ProgressBar({ currentNode, path }: ProgressBarProps) {
  const completed = Math.max(path.length, currentNode ? 1 : 0);
  const percent = Math.min(100, completed * 20);

  return (
    <div className="space-y-2" aria-label="Case progress">
      <div className="flex items-center justify-between text-xs text-fg-muted">
        <span>Прогресс</span>
        <span>{completed} шаг.</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-lavender/40">
        <div className="h-full rounded-full bg-royal transition-all" style={{ width: `${percent}%` }} />
      </div>
      {currentNode ? (
        <p className="text-xs text-fg-muted">
          Текущий этап: <span className="font-medium text-fg">{currentNode.title}</span>
        </p>
      ) : null}
    </div>
  );
}
