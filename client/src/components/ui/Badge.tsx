import type { HTMLAttributes } from 'react';
import { cn } from '@/utils/cn';

export type BadgeVariant = 'success' | 'warning' | 'danger' | 'info' | 'neutral' | 'accent';

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
}

const variants: Record<BadgeVariant, string> = {
  success: 'bg-success/10 text-success',
  warning: 'bg-warning/10 text-warning',
  danger: 'bg-danger/10 text-danger',
  info: 'bg-royal/10 text-royal',
  neutral: 'bg-lavender/40 text-fg-muted',
  accent: 'bg-purple/10 text-purple',
};

export function Badge({ children, className, variant = 'neutral', ...props }: BadgeProps) {
  return (
    <span
      className={cn('inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium', variants[variant], className)}
      {...props}
    >
      {children}
    </span>
  );
}
