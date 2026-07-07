import type { HealthState } from './types';

export function fmtDate(value: string | null | undefined): string {
  if (!value) return 'Never';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Unknown';
  return date.toLocaleString('zh-HK', { dateStyle: 'short', timeStyle: 'short' });
}

export function classForHealth(status: HealthState): string {
  return `health health-${status}`;
}
