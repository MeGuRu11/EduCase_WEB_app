import { cn } from '@/utils/cn';

const iconMap = {
  logo: 'logo-primary',
  dashboard: 'ico-dashboard',
  cases: 'ico-cases',
  groups: 'ico-groups',
  users: 'ico-users',
  analytics: 'ico-analytics',
  attempts: 'ico-attempts',
  editor: 'ico-editor',
  player: 'ico-player',
  admin: 'ico-admin',
  system: 'ico-system',
  settings: 'ico-settings',
  login: 'ico-login',
  heatmap: 'ico-heatmap',
  check: 'ico-check',
  cross: 'ico-cross',
  warn: 'ico-warn',
  info: 'ico-info',
  download: 'ico-download',
  search: 'ico-search',
  lock: 'ico-lock',
  clock: 'ico-clock',
  nodeStart: 'ico-node-start',
  nodeData: 'ico-node-data',
  nodeDecision: 'ico-node-decision',
  nodeForm: 'ico-node-form',
  nodeText: 'ico-node-text',
  nodeFinal: 'ico-node-final',
} as const;

export type IconName = keyof typeof iconMap;

export interface IconProps {
  name: IconName;
  className?: string;
  title?: string;
}

export function Icon({ name, className = 'h-5 w-5', title }: IconProps) {
  const symbol = iconMap[name];

  return (
    <svg
      className={cn('shrink-0', className)}
      role="img"
      aria-hidden={title ? undefined : true}
      aria-label={title}
    >
      <use href={`/branding.svg#${symbol}`} />
    </svg>
  );
}
