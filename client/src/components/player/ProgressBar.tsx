export interface ProgressBarProps {
  current: number;
  total: number;
}

export function ProgressBar({ current, total }: ProgressBarProps) {
  const safeTotal = Math.max(1, total);
  const pct = Math.min(100, Math.round((current / safeTotal) * 100));
  return (
    <div
      data-testid="progress-bar"
      className="h-2 w-full overflow-hidden rounded-full bg-lavender/40"
      role="progressbar"
      aria-valuenow={pct}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div className="h-full bg-royal-ink transition-all" style={{ width: `${pct}%` }} />
    </div>
  );
}

export default ProgressBar;
