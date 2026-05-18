import type { ReactNode } from 'react';
import { cn } from '@/utils/cn';
import { Skeleton } from './Skeleton';

export interface TableColumn<T> {
  key: string;
  header: string;
  render?: (row: T) => ReactNode;
}

export interface TableProps<T> {
  columns: TableColumn<T>[];
  data: T[];
  getRowKey: (row: T) => string | number;
  isLoading?: boolean;
  error?: string | null;
  emptyMessage?: string;
  className?: string;
}

export function Table<T>({
  className,
  columns,
  data,
  emptyMessage = 'Нет данных',
  error,
  getRowKey,
  isLoading = false,
}: TableProps<T>) {
  if (isLoading) {
    return <Skeleton rows={4} label="Loading table" />;
  }

  if (error) {
    return (
      <div role="alert" className="rounded border border-danger/30 bg-danger/10 p-4 text-sm text-danger-ink">
        {error}
      </div>
    );
  }

  return (
    <div className={cn('overflow-x-auto rounded-lg border border-border bg-bg', className)}>
      <table className="min-w-full text-sm">
        <thead>
          <tr className="border-b border-border">
            {columns.map((column) => (
              <th key={column.key} className="px-4 py-3 text-left font-semibold text-fg-muted">
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.length ? (
            data.map((row) => (
              <tr key={getRowKey(row)} className="border-b border-border last:border-b-0 hover:bg-surface">
                {columns.map((column) => (
                  <td key={column.key} className="px-4 py-3 text-fg">
                    {column.render ? column.render(row) : String((row as Record<string, unknown>)[column.key] ?? '')}
                  </td>
                ))}
              </tr>
            ))
          ) : (
            <tr>
              <td className="px-4 py-8 text-center text-fg-muted" colSpan={columns.length}>
                {emptyMessage}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
