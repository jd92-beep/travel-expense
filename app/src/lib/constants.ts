import type { Category, Payment } from './types';

export const STORAGE_KEY = 'boss-japan-tracker';

export const CATEGORIES: Record<Category, { name: string; icon: string; color: string }> = {
  transport: { name: '交通', icon: '🚆', color: '#60a5fa' },
  food:      { name: '餐飲', icon: '🍜', color: '#f59e0b' },
  shopping:  { name: '購物', icon: '🛍️', color: '#f472b6' },
  lodging:   { name: '住宿', icon: '🏨', color: '#a78bfa' },
  ticket:    { name: '門票', icon: '🎟️', color: '#34d399' },
  medicine:  { name: '藥品', icon: '💊', color: '#fb7185' },
  other:     { name: '其他', icon: '📦', color: '#94a3b8' },
};

export const PAYMENTS: Record<Payment, { name: string; icon: string; color: string }> = {
  cash:   { name: '現金',    icon: '💴', color: '#34d399' },
  credit: { name: '信用卡',   icon: '💳', color: '#60a5fa' },
  paypay: { name: 'PayPay',  icon: '🅿️', color: '#f87171' },
  suica:  { name: 'Suica',   icon: '🎫', color: '#a78bfa' },
};

export const DEFAULT_BUDGET = 101800; // ≈ HKD 5000
export const DEFAULT_RATE = 20.36;    // HKD → JPY
