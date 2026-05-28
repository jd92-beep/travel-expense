import { AlertCircle, CheckCircle2, CloudOff, Loader2, RefreshCw } from 'lucide-react';
import type { SyncEngineState } from '../lib/types';

const config = {
  idle: { label: 'Sync idle', tone: 'neutral', icon: RefreshCw },
  queued: { label: 'Sync queued', tone: 'warning', icon: RefreshCw },
  pushing: { label: 'Pushing', tone: 'info', icon: Loader2 },
  pulling: { label: 'Pulling', tone: 'info', icon: Loader2 },
  synced: { label: 'Synced', tone: 'ok', icon: CheckCircle2 },
  error: { label: 'Sync error', tone: 'danger', icon: AlertCircle },
  offline: { label: 'Offline', tone: 'warning', icon: CloudOff },
} as const;

function relativeTime(value: number) {
  if (!value) return '未同步';
  const seconds = Math.max(1, Math.round((Date.now() - value) / 1000));
  if (seconds < 60) return `${seconds}s 前`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m 前`;
  return `${Math.round(minutes / 60)}h 前`;
}

export function SyncStatusIndicator({ state }: { state: SyncEngineState }) {
  const item = config[state.status] || config.idle;
  const Icon = item.icon;
  const title = `${item.label} · ${relativeTime(state.lastSyncedAt)}${state.pendingCount ? ` · ${state.pendingCount} pending` : ''}${state.error ? ` · ${state.error}` : ''}`;
  return (
    <span className={`sync-status-indicator ${item.tone}`} title={title} aria-label={title}>
      <Icon size={14} className={state.status === 'pushing' || state.status === 'pulling' ? 'spin' : ''} />
      <span>{item.label}</span>
      {state.pendingCount > 0 && <b>{state.pendingCount}</b>}
    </span>
  );
}
