import type { ReactNode } from 'react';
import { cn } from '@/utils/cn';

export interface CardProps {
  title?: string;
  description?: string;
  children?: ReactNode;
  footer?: ReactNode;
  className?: string;
  onClick?: () => void;
}

export function Card({ title, description, children, footer, className, onClick }: CardProps) {
  const content = (
    <>
      {(title || description) && (
        <div className="mb-4">
          {title ? <h3 className="text-lg font-semibold text-fg">{title}</h3> : null}
          {description ? <p className="mt-1 text-sm text-fg-muted">{description}</p> : null}
        </div>
      )}
      {children}
      {footer ? <div className="mt-4 border-t border-border pt-4">{footer}</div> : null}
    </>
  );

  const classes = cn(
    'rounded-lg border border-border bg-bg p-6 shadow-sm',
    onClick && 'focus-ring text-left transition-shadow hover:shadow-md',
    className,
  );

  if (onClick) {
    return (
      <button type="button" className={classes} onClick={onClick} aria-label={title}>
        {content}
      </button>
    );
  }

  return <section className={classes}>{content}</section>;
}

export default Card;
