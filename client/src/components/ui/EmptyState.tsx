import { Link } from 'react-router-dom';
import type { IconName } from './Icon';
import { Icon } from './Icon';
import { Button } from './Button';

type EmptyAction =
  | { label: string; href: string; onClick?: never }
  | { label: string; onClick: () => void; href?: never };

export interface EmptyStateProps {
  icon: IconName;
  title: string;
  description?: string;
  action?: EmptyAction;
}

export function EmptyState({ action, description, icon, title }: EmptyStateProps) {
  return (
    <div className="py-16 text-center">
      <Icon name={icon} className="mx-auto mb-4 h-12 w-12 text-fg-muted" />
      <h3 className="text-lg font-semibold text-fg">{title}</h3>
      {description ? <p className="mx-auto mt-1 max-w-md text-sm text-fg-muted">{description}</p> : null}
      {action ? (
        <div className="mt-6">
          {action.href ? (
            <Link
              to={action.href}
              className="focus-ring inline-flex h-10 items-center justify-center rounded bg-royal px-4 text-sm font-medium text-white transition-colors hover:bg-cyan"
            >
              {action.label}
            </Link>
          ) : (
            <Button onClick={action.onClick}>{action.label}</Button>
          )}
        </div>
      ) : null}
    </div>
  );
}

export default EmptyState;
