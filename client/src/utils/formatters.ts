export function formatPercent(value: number | null | undefined, digits = 0) {
  if (value == null || Number.isNaN(value)) return '—';
  return `${value.toFixed(digits)}%`;
}

export function formatScore(score: number | null | undefined, max?: number | null) {
  if (score == null || Number.isNaN(score)) return '—';
  if (max == null || max <= 0) return String(Math.round(score));
  return `${Math.round(score)}/${Math.round(max)}`;
}

export function formatDuration(seconds: number | null | undefined) {
  if (seconds == null || Number.isNaN(seconds)) return '—';
  const total = Math.max(0, Math.round(seconds));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  if (hours > 0) return `${hours} ч ${minutes} мин`;
  return `${minutes}:${secs.toString().padStart(2, '0')}`;
}

export function formatHours(hours: number | null | undefined) {
  if (hours == null || Number.isNaN(hours)) return '—';
  return `${hours.toFixed(hours >= 10 ? 0 : 1)} ч`;
}

export function formatDateTime(value: string | null | undefined) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}