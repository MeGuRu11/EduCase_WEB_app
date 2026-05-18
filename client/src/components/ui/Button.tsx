import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { cn } from '@/utils/cn';
import { LoadingSpinner } from './LoadingSpinner';

export type ButtonVariant = 'primary' | 'accent' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  isLoading?: boolean;
  leftIcon?: ReactNode;
}

const variants: Record<ButtonVariant, string> = {
  primary: 'bg-royal-ink text-white hover:bg-cyan-ink',
  accent: 'bg-purple-ink text-white hover:bg-purple-ink/90',
  secondary: 'bg-bg text-royal-ink border border-royal hover:bg-royal/5',
  ghost: 'text-fg hover:bg-lavender/30',
  danger: 'bg-danger-ink text-white hover:bg-danger-ink/90',
};

const sizes: Record<ButtonSize, string> = {
  sm: 'h-8 px-3 text-sm',
  md: 'h-10 px-4 text-sm',
  lg: 'h-12 px-6 text-base',
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      children,
      className,
      disabled,
      isLoading = false,
      leftIcon,
      size = 'md',
      type = 'button',
      variant = 'primary',
      ...props
    },
    ref,
  ) => (
    <button
      ref={ref}
      type={type}
      disabled={disabled || isLoading}
      className={cn(
        'focus-ring inline-flex items-center justify-center gap-2 rounded font-medium transition-colors',
        'disabled:cursor-not-allowed disabled:opacity-50',
        variants[variant],
        sizes[size],
        className,
      )}
      {...props}
    >
      {isLoading ? <LoadingSpinner label="Loading" size="sm" /> : leftIcon}
      <span>{children}</span>
    </button>
  ),
);

Button.displayName = 'Button';

export default Button;
