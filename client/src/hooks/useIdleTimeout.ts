import { useCallback, useEffect, useRef, useState } from 'react';

const ACTIVITY_EVENTS = ['mousemove', 'keydown', 'click', 'scroll', 'touchstart'] as const;

export interface IdleTimeoutState {
  isPromptOpen: boolean;
  countdown: number;
  reset: () => void;
  confirmActive: () => void;
}

export function useIdleTimeout(
  timeoutMin = 30,
  onTimeout: () => void,
  countdownSeconds = 60,
): IdleTimeoutState {
  const [isPromptOpen, setPromptOpen] = useState(false);
  const [countdown, setCountdown] = useState(countdownSeconds);
  const timeoutRef = useRef<number | null>(null);
  const countdownRef = useRef<number | null>(null);
  const onTimeoutRef = useRef(onTimeout);

  useEffect(() => {
    onTimeoutRef.current = onTimeout;
  }, [onTimeout]);

  const clearTimers = useCallback(() => {
    if (timeoutRef.current !== null) window.clearTimeout(timeoutRef.current);
    if (countdownRef.current !== null) window.clearInterval(countdownRef.current);
  }, []);

  const startCountdown = useCallback(() => {
    setPromptOpen(true);
    setCountdown(countdownSeconds);
    if (countdownRef.current !== null) window.clearInterval(countdownRef.current);

    countdownRef.current = window.setInterval(() => {
      setCountdown((value) => {
        if (value <= 1) {
          clearTimers();
          onTimeoutRef.current();
          return 0;
        }
        return value - 1;
      });
    }, 1000);
  }, [clearTimers, countdownSeconds]);

  const reset = useCallback(() => {
    if (isPromptOpen) return;
    if (timeoutRef.current !== null) window.clearTimeout(timeoutRef.current);
    timeoutRef.current = window.setTimeout(startCountdown, timeoutMin * 60 * 1000);
  }, [isPromptOpen, startCountdown, timeoutMin]);

  const confirmActive = useCallback(() => {
    setPromptOpen(false);
    setCountdown(countdownSeconds);
    if (countdownRef.current !== null) window.clearInterval(countdownRef.current);
    if (timeoutRef.current !== null) window.clearTimeout(timeoutRef.current);
    timeoutRef.current = window.setTimeout(startCountdown, timeoutMin * 60 * 1000);
  }, [countdownSeconds, startCountdown, timeoutMin]);

  useEffect(() => {
    ACTIVITY_EVENTS.forEach((eventName) => {
      window.addEventListener(eventName, reset, { passive: true });
    });
    reset();

    return () => {
      clearTimers();
      ACTIVITY_EVENTS.forEach((eventName) => window.removeEventListener(eventName, reset));
    };
  }, [clearTimers, reset]);

  return { isPromptOpen, countdown, reset, confirmActive };
}
