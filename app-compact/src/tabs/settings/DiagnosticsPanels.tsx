import { AlertTriangle, Cloud, Copy, RotateCcw, Server, ShieldCheck } from 'lucide-react';
import { useMemo } from 'react';
import { saveReceiptRepairIntent } from '../../lib/repairIntent';
import type { SyncEngineState } from '../../lib/types';
import { GlassCard } from '../../components/ui';
import { type SettingsContext } from './shared';
import { syncQueueSummary, compactTripDoctor, buildTripScopeAudit, formatSyncAge, formatSessionExpiry, shortId } from './reports';

export function DiagnosticsPanels({ ctx, syncState, storageScope, brokerReady, notionMirrorReady, supabaseAccountId, supabaseSessionExpiresAt, queuePendingCount, queueFailedCount, changeTab, openSettingsPanel }: { ctx: SettingsContext; syncState?: SyncEngineState; storageScope: string; brokerReady: boolean; notionMirrorReady: boolean; supabaseAccountId: string; supabaseSessionExpiresAt: number; queuePendingCount: number; queueFailedCount: number; changeTab?: (tabId: any) => void; openSettingsPanel: (id: string) => void }) {
  const { state, setStatus, copyText, persons, currentTrip, cloudSyncAvailable, userEmail, onPull, onPush } = ctx;
  const tripDoctor = useMemo(() => compactTripDoctor(state, currentTrip, persons, syncState, cloudSyncAvailable, notionMirrorReady, storageScope), [
    state.receipts,
    state.syncQueue,
    state.trips,
    currentTrip,
    persons,
    syncState,
    cloudSyncAvailable,
    notionMirrorReady,
    storageScope,
  ]);
  const tripScopeAudit = useMemo(() => buildTripScopeAudit(state, currentTrip), [state.receipts, state.trips, currentTrip]);
  const syncTarget = cloudSyncAvailable ? (notionMirrorReady ? 'Supabase + Notion' : 'Supabase only') : (brokerReady ? 'Broker / Notion' : storageScope);
  const storageAccountId = storageScope.startsWith('supabase:') ? storageScope.slice('supabase:'.length) : '';
  const accountSyncHealth = [
    { key: 'account', title: 'Account', value: userEmail ? 'Signed in' : 'Local device', detail: userEmail || shortId(supabaseAccountId || storageAccountId) },
    { key: 'session', title: 'Session', value: cloudSyncAvailable ? formatSessionExpiry(supabaseSessionExpiresAt) : 'Local', detail: brokerReady ? 'Broker active' : 'Broker missing' },
    { key: 'storage', title: 'Storage scope', value: storageAccountId ? 'Supabase scoped' : 'Local', detail: storageAccountId ? shortId(storageAccountId) : storageScope },
    { key: 'backend', title: 'Backend target', value: syncTarget, detail: syncState?.status || state.globalSyncStatus || 'local' },
    { key: 'trip', title: 'Active trip', value: currentTrip.name || 'Current trip', detail: shortId(currentTrip.id || state.activeTripId || '') },
    { key: 'push', title: 'Last push', value: formatSyncAge(syncState?.lastSyncedAt || state.lastSyncedAt || 0), detail: `${queuePendingCount} pending · ${queueFailedCount} failed` },
    { key: 'pull', title: 'Last pull', value: formatSyncAge(state.settingsPulledAt || 0), detail: `Auto sync ${state.autoSync ? 'on' : 'off'}` },
  ];
  const activeQueue = syncQueueSummary(state.syncQueue).active;
  // Built on demand in copyQueueReport — stringifying the queue on every render is wasted work.
  const buildQueueReportText = () => JSON.stringify({
    generatedAt: new Date().toISOString(),
    storageScope,
    account: userEmail || shortId(supabaseAccountId || storageAccountId),
    syncStatus: syncState?.status || state.globalSyncStatus || 'local',
    pending: queuePendingCount,
    failed: queueFailedCount,
    queue: activeQueue.map((item) => ({
      type: item.type,
      op: item.op,
      status: item.status,
      attempts: item.attempts,
      age: formatSyncAge(item.updatedAt || item.createdAt),
      entity: shortId(item.entityId),
      error: item.error || '',
    })),
  }, null, 2);

  function openScopeRepairShortcut() {
    if (!tripScopeAudit.repairReceiptId) {
      changeTab?.('history');
      return;
    }
    saveReceiptRepairIntent(tripScopeAudit.repairReceiptId);
    setStatus(`Opening repair: ${tripScopeAudit.repairReceiptLabel || 'receipt'}`);
    changeTab?.('history');
  }

  async function copyQueueReport() {
    await copyText(buildQueueReportText(), '已複製 sync queue report');
  }

  return (
    <>
    <GlassCard className={`settings-trip-doctor settings-trip-doctor--${tripDoctor.tone}`}>
      <section role="region" aria-label="Compact Trip Doctor">
        <div className="settings-trip-doctor-head">
          <span><ShieldCheck size={16} /> Compact Trip Doctor</span>
          <strong>{tripDoctor.statusLabel}</strong>
        </div>
        <div className="settings-trip-doctor-grid">
          {tripDoctor.items.map((item) => (
            <div className="settings-trip-doctor-item" key={item.key}>
              <span>{item.title}</span>
              <strong>{item.value}</strong>
              <small>{item.detail}</small>
            </div>
          ))}
        </div>
        <div className="settings-trip-doctor-actions">
          <button type="button" onClick={() => changeTab?.('history')}>
            <Copy size={14} />
            <span>Review records</span>
          </button>
          <button type="button" onClick={() => openSettingsPanel('settings-data')}>
            <ShieldCheck size={14} />
            <span>Data safety</span>
          </button>
          <button type="button" onClick={() => openSettingsPanel('settings-credentials')}>
            <Cloud size={14} />
            <span>Connection</span>
          </button>
        </div>
      </section>
          </GlassCard>

          <GlassCard className={`settings-trip-doctor settings-trip-scope-audit settings-trip-scope-audit--${queueFailedCount ? 'warning' : 'ok'}`}>
            <section role="region" aria-label="Account Sync Health">
              <div className="settings-trip-doctor-head">
                <span><Server size={16} /> Account Sync Health</span>
                <strong>{queueFailedCount ? `${queueFailedCount} failed` : syncState?.status || 'local'}</strong>
              </div>
              <div className="settings-trip-doctor-grid">
                {accountSyncHealth.map((item) => (
                  <div className="settings-trip-doctor-item" key={item.key}>
                    <span>{item.title}</span>
                    <strong>{item.value}</strong>
                    <small>{item.detail}</small>
                  </div>
                ))}
              </div>
            </section>
          </GlassCard>

          <GlassCard className={`settings-trip-doctor settings-trip-scope-audit settings-trip-scope-audit--${queueFailedCount ? 'warning' : 'ok'}`}>
            <section role="region" aria-label="Sync Queue Inspector">
              <div className="settings-trip-doctor-head">
                <span><Cloud size={16} /> Sync Queue Inspector</span>
                <strong>{activeQueue.length ? `${activeQueue.length} active` : 'clear'}</strong>
              </div>
              <div className="settings-trip-doctor-grid">
                <div className="settings-trip-doctor-item">
                  <span>Pending</span>
                  <strong>{queuePendingCount}</strong>
                  <small>Ready for retry</small>
                </div>
                <div className="settings-trip-doctor-item">
                  <span>Failed</span>
                  <strong>{queueFailedCount}</strong>
                  <small>{syncState?.error || 'No engine error'}</small>
                </div>
                <div className="settings-trip-doctor-item">
                  <span>Oldest</span>
                  <strong>{activeQueue[0] ? formatSyncAge(activeQueue[0].createdAt) : 'none'}</strong>
                  <small>{activeQueue[0]?.type || 'Queue clear'}</small>
                </div>
              </div>
              <div className="mini-list" aria-label="Sync Queue Inspector Items">
                {activeQueue.slice(0, 6).map((item) => (
                  <span key={item.id}>{item.type} · {item.op} · {item.status} · {item.attempts} tries · {shortId(item.entityId)}</span>
                ))}
                {!activeQueue.length && <span>Queue clear</span>}
              </div>
              <div className="settings-trip-doctor-actions">
                <button type="button" disabled={!onPush || !activeQueue.length} onClick={() => void onPush?.()}>
                  <RotateCcw size={14} />
                  <span>Retry queue</span>
                </button>
                <button type="button" onClick={() => void copyQueueReport()}>
                  <Copy size={14} />
                  <span>Copy report</span>
                </button>
                <button type="button" disabled={!onPull} onClick={() => void onPull?.()}>
                  <Cloud size={14} />
                  <span>Pull now</span>
                </button>
              </div>
            </section>
          </GlassCard>

          <GlassCard className={`settings-trip-doctor settings-trip-scope-audit settings-trip-scope-audit--${tripScopeAudit.tone}`}>
            <section role="region" aria-label="Trip scope audit">
        <div className="settings-trip-doctor-head">
          <span><ShieldCheck size={16} /> Trip Scope Audit</span>
          <strong>{tripScopeAudit.statusLabel}</strong>
        </div>
        <p className="settings-post-trip-helper">{tripScopeAudit.helper}</p>
        <div className="settings-trip-doctor-grid">
          {tripScopeAudit.items.map((item) => (
            <div className="settings-trip-doctor-item" key={item.key}>
              <span>{item.title}</span>
              <strong>{item.value}</strong>
              <small>{item.detail}</small>
            </div>
          ))}
        </div>
        <div className="settings-trip-doctor-actions">
          {tripScopeAudit.repairReceiptId && (
            <button type="button" onClick={openScopeRepairShortcut}>
              <AlertTriangle size={14} />
              <span>Repair first issue</span>
            </button>
          )}
          <button type="button" onClick={() => changeTab?.('history')}>
            <Copy size={14} />
            <span>Review records</span>
          </button>
          <button type="button" onClick={() => openSettingsPanel('settings-data')}>
            <ShieldCheck size={14} />
            <span>Data safety</span>
          </button>
        </div>
      </section>
    </GlassCard>
    </>
  );
}
