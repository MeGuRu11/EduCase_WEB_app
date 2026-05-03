import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { attemptsApi } from '@/api/attempts';
import { notify } from '@/components/ui/Toast';
import { cn } from '@/utils/cn';

export interface ServerTimerProps {
  attemptId: number;
  expiresAt: string | null;
  initialRemainingSec?: number | null;
  onExpired?: () => void;
}

function secondsFromExpiry(expiresAt: string | null) {
  if (!expiresAt) return null;
  return Math.max(0, Math.ceil((new Date(expiresAt).getTime() - Date.now()) / 1_000));
}

function formatSeconds(value: number | null) {
  if (value === null) return 'Без лимита';
  const minutes = Math.floor(value / 60);
  const seconds = value % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function timerState(remaining: number | null) {
  if (remaining === null) return 'none';
  if (remaining <= 0) return 'expired';
  if (remaining <= 60) return 'danger';
  if (remaining <= 300) return 'warning';
  return 'normal';
}

export default function ServerTimer({ attemptId, expiresAt, initialRemainingSec, onExpired }: ServerTimerProps) {
  const navigate = useNavigate();
  const [remaining, setRemaining] = useState<number | null>(
    initialRemainingSec ?? secondsFromExpiry(expiresAt),
  );
  const finishedRef = useRef(false);
  const warnedFiveRef = useRef(false);
  const warnedOneRef = useRef(false);
  const state = timerState(remaining);

  useEffect(() => {
    setRemaining(initialRemainingSec ?? secondsFromExpiry(expiresAt));
  }, [expiresAt, initialRemainingSec]);

  useEffect(() => {
    if (remaining === null) return undefined;
    const interval = window.setInterval(() => {
      setRemaining((current) => (current === null ? null : Math.max(0, current - 1)));
    }, 1_000);
    return () => window.clearInterval(interval);
  }, [remaining === null]);

  useEffect(() => {
    if (!expiresAt) return undefined;
    const poll = async () => {
      try {
        const serverTime = await attemptsApi.timeRemaining(attemptId);
        setRemaining(serverTime.remaining_sec);
      } catch {
        setRemaining((current) => current);
      }
    };
    const interval = window.setInterval(poll, 30_000);
    return () => window.clearInterval(interval);
  }, [attemptId, expiresAt]);

  useEffect(() => {
    if (remaining === null) return;
    if (remaining <= 300 && remaining > 60 && !warnedFiveRef.current) {
      warnedFiveRef.current = true;
      notify.warning('До конца попытки осталось меньше 5 минут');
    }
    if (remaining <= 60 && remaining > 0 && !warnedOneRef.current) {
      warnedOneRef.current = true;
      notify.warning('До конца попытки осталось меньше 1 минуты');
    }
  }, [remaining]);

  useEffect(() => {
    if (remaining !== 0 || finishedRef.current) return;
    finishedRef.current = true;
    void attemptsApi.finish(attemptId).finally(() => {
      notify.warning('Время истекло');
      onExpired?.();
      navigate(`/student/attempts/${attemptId}/result`);
    });
  }, [attemptId, navigate, onExpired, remaining]);

  const label = useMemo(() => formatSeconds(remaining), [remaining]);

  return (
    <div
      aria-label="time remaining"
      className={cn(
        'tabular-nums rounded-lg border border-border bg-bg px-3 py-2 text-sm font-semibold',
        state === 'normal' && 'text-fg-muted',
        state === 'warning' && 'timer-warning',
        state === 'danger' && 'timer-danger',
        state === 'expired' && 'text-danger',
      )}
      data-timer-state={state}
    >
      {label}
    </div>
  );
}
