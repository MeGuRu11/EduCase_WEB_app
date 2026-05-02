import { forwardRef, useId, type InputHTMLAttributes } from 'react';
import { cn } from '@/utils/cn';

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string;
  hint?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, error, hint, id, label, required, ...props }, ref) => {
    const generatedId = useId();
    const inputId = id ?? generatedId;
    const descriptionId = error ? `${inputId}-error` : hint ? `${inputId}-hint` : undefined;

    return (
      <div className="space-y-1.5">
        <label htmlFor={inputId} className="block text-sm font-medium text-fg">
          {label}
        </label>
        <input
          ref={ref}
          id={inputId}
          required={required}
          aria-invalid={error ? 'true' : undefined}
          aria-describedby={descriptionId}
          className={cn(
            'h-10 w-full rounded border border-border bg-bg px-3 text-sm text-fg',
            'focus:outline-none focus:ring-2 focus:ring-royal/40 focus:border-royal',
            'disabled:bg-surface disabled:text-fg-muted',
            error && 'border-danger',
            className,
          )}
          {...props}
        />
        {error ? (
          <p id={descriptionId} role="alert" className="text-xs text-danger">
            {error}
          </p>
        ) : hint ? (
          <p id={descriptionId} className="text-xs text-fg-muted">
            {hint}
          </p>
        ) : null}
      </div>
    );
  },
);

Input.displayName = 'Input';

export default Input;
