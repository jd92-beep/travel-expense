import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatJPY(n: number): string {
  if (!Number.isFinite(n)) return '¥0';
  return '¥' + Math.round(n).toLocaleString('ja-JP');
}

export function formatHKD(jpy: number, rate: number): string {
  if (!rate || !Number.isFinite(jpy)) return '';
  return '≈ HK$' + (jpy / rate).toFixed(2);
}

export function rid(): string {
  return 'r_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
}

export function byDateDesc<T extends { date: string; createdAt?: number }>(a: T, b: T): number {
  if (a.date !== b.date) return a.date < b.date ? 1 : -1;
  return (b.createdAt ?? 0) - (a.createdAt ?? 0);
}
