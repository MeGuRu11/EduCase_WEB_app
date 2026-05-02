import { cn } from '@/utils/cn';

export interface LoadingSpinnerProps {
  label?: string;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const sizes = {
  sm: 'h-4 w-4',
  md: 'h-6 w-6',
  lg: 'h-10 w-10',
};

export function LoadingSpinner({ className, label = 'Loading', size = 'md' }: LoadingSpinnerProps) {
  return (
    <span role="status" aria-label={label} className={cn('inline-flex items-center justify-center', className)}>
      <span className={cn('block animate-spin rounded-full border-2 border-current border-t-transparent', sizes[size])} />
    </span>
  );
}

export default LoadingSpinner;
