import { cn } from '@/utils/cn';

export interface SkeletonProps {
  rows?: number;
  label?: string;
  className?: string;
}

export function Skeleton({ className, label = 'Loading', rows = 1 }: SkeletonProps) {
  return (
    <div role="status" aria-label={label} className={cn('space-y-3', className)}>
      {Array.from({ length: rows }).map((_, index) => (
        <div
          key={index}
          data-testid="skeleton-row"
          className="h-4 animate-pulse rounded bg-lavender/40"
        />
      ))}
    </div>
  );
}
