import type { CategoryId, PaymentId } from './types';

export type VisualIconId =
  | CategoryId
  | PaymentId
  | 'pending'
  | 'private'
  | 'gift'
  | 'photo'
  | 'prep'
  | 'post'
  | 'weather'
  | 'map'
  | 'scan'
  | 'receipt';

export const VISUAL_ICON_META: Record<VisualIconId, { label: string; color: string; accent: string }> = {
  flight: { label: '機票', color: '#315e8e', accent: '#f5d487' },
  transport: { label: '交通', color: '#2f6f8f', accent: '#c8dfeb' },
  food: { label: '餐飲', color: '#d8503d', accent: '#f7c899' },
  shopping: { label: '購物', color: '#9a5e9d', accent: '#ead2ef' },
  lodging: { label: '住宿', color: '#173a60', accent: '#b9d1e8' },
  ticket: { label: '門票', color: '#c88724', accent: '#f4db9c' },
  localtour: { label: '當地旅遊', color: '#3b7d6b', accent: '#bfe2d5' },
  medicine: { label: '藥品', color: '#c6547e', accent: '#f3c2d3' },
  other: { label: '其他', color: '#6b7280', accent: '#e5e7eb' },
  cash: { label: '現金', color: '#2e8f62', accent: '#c8ead8' },
  credit: { label: '信用卡', color: '#315e8e', accent: '#cddff4' },
  paypay: { label: 'PayPay', color: '#d8503d', accent: '#f9c1b8' },
  suica: { label: 'Suica', color: '#3c8f73', accent: '#cfeee1' },
  pending: { label: '待確認', color: '#c88724', accent: '#f6e5b8' },
  private: { label: '私人', color: '#173a60', accent: '#c7d8e8' },
  gift: { label: '代付', color: '#d8503d', accent: '#f5c5bd' },
  photo: { label: '相片', color: '#6b7280', accent: '#e9edf1' },
  prep: { label: '準備階段', color: '#3b7d6b', accent: '#cde7dd' },
  post: { label: '返程後', color: '#6f5aa8', accent: '#ddd5f2' },
  weather: { label: '天氣', color: '#315e8e', accent: '#d7e8f7' },
  map: { label: '地圖', color: '#c88724', accent: '#f4db9c' },
  scan: { label: '掃描', color: '#d8503d', accent: '#f8c2b9' },
  receipt: { label: '紀錄', color: '#173a60', accent: '#c7d8e8' },
};

export function categoryIconId(id: string): VisualIconId {
  return (id in VISUAL_ICON_META ? id : 'other') as VisualIconId;
}

export function paymentIconId(id: string): VisualIconId {
  return (id in VISUAL_ICON_META ? id : 'cash') as VisualIconId;
}
