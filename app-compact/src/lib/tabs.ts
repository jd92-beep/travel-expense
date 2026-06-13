import type { TabId } from './types';

export const TAB_MANIFEST: Array<{ id: TabId; label: string }> = [
  { id: 'dashboard', label: '主頁' },
  { id: 'history', label: '紀錄' },
  { id: 'timeline', label: '行程' },
  { id: 'scan', label: '記帳' },
  { id: 'weather', label: '天氣' },
  { id: 'stats', label: '統計' },
  { id: 'settings', label: '設定' },
  { id: 'admin', label: 'Console' },
];
