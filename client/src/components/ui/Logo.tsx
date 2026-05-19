import { useId } from 'react';
import { cn } from '@/utils/cn';

export type LogoSize = 'sm' | 'md' | 'lg';

export interface LogoProps {
  size?: LogoSize;
  showText?: boolean;
  className?: string;
}

const sizeMap: Record<LogoSize, { root: string; mark: string; text: string; gap: string }> = {
  sm: { root: 'h-8', mark: 'h-8 w-8', text: 'text-lg', gap: 'gap-2' },
  md: { root: 'h-10', mark: 'h-10 w-10', text: 'text-2xl', gap: 'gap-3' },
  lg: { root: 'h-14', mark: 'h-14 w-14', text: 'text-4xl', gap: 'gap-4' },
};

export function Logo({ size = 'md', showText = true, className }: LogoProps) {
  const reactId = useId().replace(/:/g, '');
  const gradientId = `epicase-logo-gradient-${reactId}`;
  const arrowId = `epicase-logo-arrow-${reactId}`;
  const config = sizeMap[size];

  return (
    <span className={cn('inline-flex shrink-0 items-center', config.root, showText ? config.gap : '', className)} role="img" aria-label="EpiCase">
      <svg className={cn('shrink-0', config.mark)} viewBox="0 0 48 48" aria-hidden="true" focusable="false">
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="48" y2="48" gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor="var(--color-royal)" />
            <stop offset="0.55" stopColor="var(--color-cyan)" />
            <stop offset="1" stopColor="var(--color-purple)" />
          </linearGradient>
          <marker id={arrowId} markerWidth="5" markerHeight="5" refX="4" refY="2.5" orient="auto" markerUnits="strokeWidth">
            <path d="M0 0 L5 2.5 L0 5 Z" fill="var(--color-bg)" />
          </marker>
        </defs>
        <rect x="7" y="7" width="34" height="34" rx="8" transform="rotate(45 24 24)" fill={`url(#${gradientId})`} />
        <g stroke="var(--color-bg)" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" opacity="0.94">
          <path d="M24 10.5 L12.5 24" markerEnd={`url(#${arrowId})`} />
          <path d="M24 10.5 L35.5 24" markerEnd={`url(#${arrowId})`} />
          <path d="M12.5 24 L24 37.5" markerEnd={`url(#${arrowId})`} />
          <path d="M35.5 24 L24 37.5" markerEnd={`url(#${arrowId})`} />
          <path d="M24 11.5 V36.5" strokeDasharray="2 3" opacity="0.55" />
        </g>
        <g fill="var(--color-bg)">
          <circle cx="24" cy="10.5" r="3.5" />
          <circle cx="12.5" cy="24" r="3.5" />
          <circle cx="35.5" cy="24" r="3.5" />
          <circle cx="24" cy="37.5" r="3.5" />
        </g>
      </svg>
      {showText ? <span className={cn('font-extrabold tracking-tight text-fg', config.text)}>EpiCase</span> : null}
    </span>
  );
}

export default Logo;
