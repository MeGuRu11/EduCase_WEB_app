import { useEffect, useRef, useState } from 'react';
import { attemptsApi } from '@/api/attempts';
import { cn } from '@/utils/cn';

const POLL_INTERVAL_MS = 30_000;
const TICK_INTERVAL_MS = 1_000;
const WARNING_THRESHOLD_SEC = 300;
const DANGER_THRESHOLD_SEC = 60;

export interface ServerTimerProps {
  attemptId: number;
  initialExpiresAt: string | null;
  onExpire?: () => void;
}

function format(seconds: number) {
  const safe = Math.max(0, seconds);
  const m = Math.floor(safe / 60).toString().padStart(2, '0');
  const s = (safe % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

function diffSec(expiresAt: string | null) {
  if (!expiresAt) return null;
  const target = new Date(expiresAt).getTime();
  if (Number.isNaN(target)) return null;
  return Math.max(0, Math.floor((target - Date.now()) / 1000));
}

export function ServerTimer({ attemptId, initialExpiresAt, onExpire }: ServerTimerProps) {
  const [expiresAt, setExpiresAt] = useState<string | null>(initialExpiresAt);
  const [remaining, setRemaining] = useState<number | null>(() => diffSec(initialExpiresAt));
  const expiredRef = useRef(false);
  const onExpireRef = useRef(onExpire);
  onExpireRef.current = onExpire;

  // Local 1s countdown
  useEffect(() => {
    if (!expiresAt) return undefined;
    const tick = window.setInterval(() => {
      const left = diffSec(expiresAt);
      setRemaining(left);
      if (left === 0 && !expiredRef.current) {
        expiredRef.current = true;
        onExpireRef.current?.();
      }
    }, TICK_INTERVAL_MS);
    return () => window.clearInterval(tick);
  }, [expiresAt]);

  // Server polling every 30s; cleanup on unmount
  useEffect(() => {
    let cancelled = false;
    const poll = window.setInterval(() => {
      attemptsApi
        .timeRemaining(attemptId)
        .then((r) => {
          if (cancelled) return;
          if (r.expires_at) setExpiresAt(r.expires_at);
          if (r.remaining_sec !== null && r.remaining_sec !== undefined) {
            setRemaining(r.remaining_sec);
            if (r.remaining_sec === 0 && !expiredRef.current) {
              expiredRef.current = true;
              onExpireRef.current?.();
            }
          }
        })
        .catch(() => {
          // 410 / network errors are handled at higher level (axios interceptor + page).
        });
    }, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(poll);
    };
  }, [attemptId]);

  if (remaining === null) return null;

  const state =
    remaining <= DANGER_THRESHOLD_SEC ? 'danger' : remaining <= WARNING_THRESHOLD_SEC ? 'warning' : 'muted';

  const stateClass =
    state === 'danger'
      ? 'text-danger-ink animate-pulse'
      : state === 'warning'
        ? 'text-warning-ink'
        : 'text-fg-muted';

  return (
    <span
      data-testid="server-timer"
      data-state={state}
      aria-live="polite"
      className={cn('font-mono text-sm font-medium', stateClass)}
    >
      {format(remaining)}
    </span>
  );
}

export default ServerTimer;
