import type { ReactNode } from 'react';
import { Handle, Position } from '@xyflow/react';
import { Icon, type IconName } from '@/components/ui/Icon';
import { cn } from '@/utils/cn';

interface NodeViewProps {
  title?: string;
  subtitle: string;
  icon: IconName;
  tone: 'start' | 'data' | 'decision' | 'form' | 'text' | 'success' | 'danger' | 'warning';
  selected?: boolean;
  children?: ReactNode;
  target?: boolean;
  source?: boolean;
}

const tones: Record<NodeViewProps['tone'], string> = {
  danger: 'border-danger/40 bg-danger/15 text-danger-ink',
  data: 'border-sky/40 bg-sky/20 text-cyan-ink',
  decision: 'border-royal/30 bg-royal/10 text-royal-ink',
  form: 'border-purple/30 bg-purple/10 text-purple-ink',
  start: 'border-success/30 bg-success/10 text-success-ink',
  success: 'border-success/40 bg-success/15 text-success-ink',
  text: 'border-cyan/40 bg-cyan/15 text-cyan-ink',
  warning: 'border-warning/40 bg-warning/15 text-warning-ink',
};

export function NodeView({
  children,
  icon,
  selected = false,
  source = true,
  subtitle,
  target = true,
  title,
  tone,
}: NodeViewProps) {
  return (
    <div
      className={cn(
        'min-w-44 rounded-xl border px-4 py-3 shadow-sm',
        'transition-shadow hover:shadow-md',
        tones[tone],
        selected && 'ring-2 ring-royal/50',
      )}
    >
      {target ? <Handle type="target" position={Position.Top} /> : null}
      <div className="flex items-start gap-3">
        <Icon name={icon} className="mt-0.5 h-6 w-6" />
        <div>
          <div className="text-sm font-semibold text-fg">{title || subtitle}</div>
          <div className="text-xs text-fg-muted">{subtitle}</div>
          {children ? <div className="mt-2 text-xs text-fg-muted">{children}</div> : null}
        </div>
      </div>
      {source ? <Handle type="source" position={Position.Bottom} /> : null}
    </div>
  );
}
