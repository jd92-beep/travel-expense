import { Cloud, LogOut, NotebookText, Plane, RotateCcw, Server, ShieldCheck, Sparkles } from 'lucide-react';
import type { Dispatch, SetStateAction } from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { activeTrip, migrateAppState } from '../domain/trip/normalize';
import { APP_VERSION } from '../lib/constants';
import {
  getPersonalNotionIntegration,
  hasCredentialBrokerSession,
  redactedError,
  type PersonalNotionStatus,
} from '../lib/credentialBroker';
import { getPersons } from '../lib/domain';
import { enqueueChange, settleChange } from '../lib/changeJournal';
import { canUseNotionMirror, notionMirrorGuardMessage } from '../lib/notionAccess';
import type { AppState, SyncEngineState, TripDraft, TripProfile } from '../lib/types';
import { useSupabaseAuth } from '../lib/supabase';
import { GlassCard, StatusPill, Toast } from '../components/ui';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../components/ui/tooltip';
import { useModalOpenClass } from '../lib/useModalOpenClass';
import { nonHomeCurrency, type SettingsContext } from './settings/shared';
import { syncQueueSummary } from './settings/reports';
import { PeopleSection } from './settings/PeopleSection';
import { AiModelsSection } from './settings/AiModelsSection';
import { TripManagerSection } from './settings/TripManagerSection';
import { TripSharingSection } from './settings/TripSharingSection';
import { TripUpdateSection } from './settings/TripUpdateSection';
import { TripReviewModal } from './settings/TripReviewModal';
import { CredentialsSection } from './settings/CredentialsSection';
import { DataSection } from './settings/DataSection';
import { AccountSection } from './settings/AccountSection';
import { ThemeSection } from './settings/ThemeSection';
import { ItineraryJsonSection } from './settings/ItineraryJsonSection';
import { StressTestSection } from './settings/StressTestSection';
import { DiagnosticsPanels } from './settings/DiagnosticsPanels';
import { useStressTools } from './settings/useStressTools';

export function Settings({
  state,
  setState,
  updateState,
  onReset,
  syncState,
  onPull,
  onPush,
  cloudSyncAvailable = false,
  storageScope = 'local',
  supabaseAccountId = '',
  supabaseSessionExpiresAt = 0,
  changeTab,
  updatePassword,
  userEmail = null,
  onSignOut,
  onClearDeviceData,
  onReopenGuide,
}: {
  state: AppState;
  setState: Dispatch<SetStateAction<AppState>>;
  updateState: (patch: Partial<AppState>) => void;
  onReset: () => void;
  syncState?: SyncEngineState;
  onPull?: () => Promise<void>;
  onPush?: () => Promise<void>;
  cloudSyncAvailable?: boolean;
  storageScope?: string;
  supabaseAccountId?: string;
  supabaseSessionExpiresAt?: number;
  changeTab?: (tabId: any) => void;
  updatePassword?: (password: string) => Promise<void>;
  userEmail?: string | null;
  onSignOut?: () => Promise<void> | void;
  onClearDeviceData?: () => Promise<void> | void;
  onReopenGuide?: () => void;
}) {
  const supabaseAuth = useSupabaseAuth();
  // Memoized on the slices they actually read so the sections' doctor/audit/settlement memos
  // hold across unrelated re-renders (typing in a form no longer recomputes everything).
  const persons = useMemo(() => getPersons(state), [state.persons]);
  const currentTrip = useMemo(
    () => activeTrip(state),
    [state.trips, state.activeTripId, state.tripName, state.tripDateRange, state.customItinerary, state.tripCurrency, state.budget],
  );
  const trips = state.trips?.length ? state.trips : [currentTrip];
  const nonHomeCurrencyForTrip = (trip: Partial<TripProfile> | undefined, fallback = 'JPY') => nonHomeCurrency(state, trip, fallback);
  const [isMobile, setIsMobile] = useState(() => typeof window !== 'undefined' && window.innerWidth <= 768);
  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth <= 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState('');
  const [tripDraft, setTripDraft] = useState<TripDraft | null>(null);
  const [tripDraftModalOpen, setTripDraftModalOpen] = useState(false);
  const [personalNotionDb, setPersonalNotionDb] = useState(state.notionDb || '');
  const [personalNotionStatus, setPersonalNotionStatus] = useState<PersonalNotionStatus | null>(null);
  const sharingSession = supabaseAuth.session;

  useModalOpenClass(tripDraftModalOpen);

  // Reconcile the Notion pill with the broker-held connection once per signed-in session:
  // the pill state is session-only, so without this it shows 未連接 (and keeps 中斷連接
  // disabled) after an app restart even when the server-side connection is still valid.
  const personalNotionFetchedRef = useRef(false);
  useEffect(() => {
    if (!cloudSyncAvailable || personalNotionFetchedRef.current) return;
    personalNotionFetchedRef.current = true;
    let cancelled = false;
    void (async () => {
      try {
        const result = await getPersonalNotionIntegration(state);
        if (cancelled) return;
        setPersonalNotionStatus(result);
        if (result.databaseId) setPersonalNotionDb(result.databaseId);
        const connected = result.status === 'connected';
        if (connected !== state.personalNotionConnected || (connected && !!result.databaseId && result.databaseId !== state.notionDb)) {
          applyPersonalNotionConnection(result.databaseId || '', connected);
        }
      } catch {
        // Offline / broker unreachable: keep the last known pill instead of flashing 未連接.
      }
    })();
    return () => { cancelled = true; };
    // Runs once per signed-in session; state is read at fetch time.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cloudSyncAvailable]);

  const handleSupabaseSignOut = async () => {
    if (!onSignOut) return;
    setBusy('登出 Supabase');
    setStatus('');
    try {
      await onSignOut();
    } catch (err) {
      setStatus(`登出失敗：${redactedError(err)}`);
    } finally {
      setBusy('');
    }
  };

  const brokerReady = hasCredentialBrokerSession(state);
  const notionMirrorReady = canUseNotionMirror(state, cloudSyncAvailable, userEmail);
  const buildLabel = `v${APP_VERSION}`;
  const failedSyncCount = syncState?.failedCount || 0;
  const pendingSyncCount = syncState?.pendingCount || 0;
  const syncPillTone = syncState?.status === 'error' || failedSyncCount ? 'danger' : pendingSyncCount ? 'warning' : 'ok';
  const syncPillDetail = failedSyncCount
    ? ` · ${failedSyncCount} failed${pendingSyncCount ? ` · ${pendingSyncCount} pending` : ''}`
    : pendingSyncCount
      ? ` · ${pendingSyncCount}`
      : '';
  const queueSummary = syncQueueSummary(state.syncQueue);
  const queuePendingCount = Math.max(pendingSyncCount, queueSummary.pending.length);
  const queueFailedCount = Math.max(failedSyncCount, queueSummary.failed.length);

  useEffect(() => {
    setPersonalNotionDb(state.notionDb || '');
  }, [state.notionDb]);

  const stress = useStressTools(userEmail, setStatus);
  const { showStressPanel } = stress;

  async function run(label: string, fn: () => Promise<string>) {
    setBusy(label);
    setStatus(`${label}…`);
    try {
      setStatus(await fn());
    } catch (error) {
      setStatus(`${label}失敗：${redactedError(error)}`);
    } finally {
      setBusy('');
    }
  }

  function openSettingsPanel(id: string) {
    const trigger = document.querySelector<HTMLButtonElement>(`[aria-controls="${id}-panel"]`);
    if (trigger && trigger.getAttribute('aria-expanded') !== 'true') trigger.click();
    window.setTimeout(() => trigger?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 40);
  }

  function applyPersonalNotionConnection(databaseId: string, connected: boolean) {
    const cleanDb = databaseId.trim();
    setState((prev) => {
      const now = Date.now();
      const trips = (prev.trips || []).map((trip) => {
        const { notionDb: _notionDb, ...localTrip } = trip;
        return { ...localTrip, updatedAt: trip.updatedAt };
      });
      return migrateAppState({
        ...prev,
        notionDb: cleanDb || prev.notionDb,
        personalNotionConnected: connected,
        trips,
        settingsUpdatedAt: now,
        syncQueue: enqueueChange(prev.syncQueue, {
          type: 'settings',
          entityId: 'app-settings',
          op: 'upsert',
          payload: { updatedAt: now },
        }),
      });
    });
  }

  // Always-available recovery for normal users (the stress-gated inspector has its own buttons):
  // requeue failed/error items via the change journal — same manual-retry semantics as the sync
  // engine's retryFailedItems — then push (or pull when only a pull handler is available).
  async function retrySyncNow() {
    setState((current) => ({
      ...current,
      syncQueue: (current.syncQueue || []).reduce(
        (queue, item) => (item.status === 'error' || item.status === 'failed'
          ? settleChange(queue, item.id, { kind: 'manual-retry' }).queue
          : queue),
        current.syncQueue || [],
      ),
      globalSyncStatus: 'queued',
      syncError: '',
    }));
    if (onPush) await onPush();
    else if (onPull) await onPull();
  }

  function requireNotionMirror(label: string) {
    if (notionMirrorReady) return true;
    const message = notionMirrorGuardMessage(state, cloudSyncAvailable, userEmail);
    setStatus(`${label} 已安全暫停：${message || 'Notion mirror 未設定。'}`);
    return false;
  }

  function applyTripDraft(draft: TripDraft) {
    setState((prev) => {
      const now = Date.now();
      const prevTrips = prev.trips?.length ? prev.trips : [activeTrip(prev)];
      // Snapshot outgoing active-trip people even when the draft trip id is brand new
      // (switchTrip returns null if the target trip does not exist yet).
      const prevTripId = prev.activeTripId;
      const peopleByTripId = { ...(prev.peopleByTripId || {}) };
      const shareRatiosByTripId = { ...(prev.shareRatiosByTripId || {}) };
      if (prevTripId && prevTripId !== draft.trip.id && prev.persons?.length) {
        peopleByTripId[prevTripId] = prev.persons;
        if (prev.shareRatios) shareRatiosByTripId[prevTripId] = prev.shareRatios;
      }
      const exists = prevTrips.some((trip) => trip.id === draft.trip.id);
      const tripsNext = exists
        ? prevTrips.map((trip) => trip.id === draft.trip.id ? { ...draft.trip, active: true, archived: false } : { ...trip, active: false })
        : [...prevTrips.map((trip) => ({ ...trip, active: false })), { ...draft.trip, active: true, archived: false }];
      return migrateAppState({
        ...prev,
        peopleByTripId,
        shareRatiosByTripId,
        // Applying a trip draft does not change the live companion list; maps snapshot the outgoing trip.
        persons: prev.persons,
        shareRatios: prev.shareRatios,
        activeTripId: draft.trip.id,
        trips: tripsNext,
        tripName: draft.trip.name,
        tripDateRange: { start: draft.trip.startDate, end: draft.trip.endDate },
        tripCurrency: nonHomeCurrencyForTrip(draft.trip, prev.tripCurrency),
        budget: draft.trip.budget,
        customItinerary: draft.trip.itinerary,
        // Personal day/spot patches must not re-key onto a newly extracted itinerary.
        itineraryOverrides: {},
        settingsUpdatedAt: now,
        syncQueue: enqueueChange(enqueueChange(prev.syncQueue, {
          type: 'trip',
          entityId: draft.trip.id,
          op: exists ? 'update' : 'create',
          payload: {
            sourceId: draft.trip.sourceId || `trip_${draft.trip.id}`,
            updatedAt: draft.trip.updatedAt,
          },
        }), {
          type: 'settings',
          entityId: 'app-settings',
          op: 'upsert',
          payload: { updatedAt: now },
        }),
      });
    });
    setTripDraft(null);
    setTripDraftModalOpen(false);
    setStatus(`已套用旅程：${draft.trip.name}`);
  }

  async function copyText(text: string, ok: string) {
    try {
      if (!navigator.clipboard?.writeText) throw new Error('clipboard unavailable');
      await navigator.clipboard.writeText(text);
      setStatus(ok);
    } catch {
      // Never dump the secret link into a toast — a prompt keeps it selectable for manual copy.
      window.prompt('複製呢條連結', text);
    }
  }

  const ctx: SettingsContext = {
    state,
    setState,
    updateState,
    busy,
    setBusy,
    setStatus,
    run,
    copyText,
    persons,
    currentTrip,
    trips,
    cloudSyncAvailable,
    userEmail,
    showStressPanel,
    onPull,
    onPush,
  };


  return (
    <section className="japanese-washi-bg w-full min-h-screen px-4 pb-28 pt-6 relative overflow-y-auto settings-tab settings-screen">
      <div className="japanese-sun-decor" />
      <div className="japanese-sakura-decor" />
      <div className="stack w-full relative z-10">
      <GlassCard className="settings-command">
        <div>
          <h2>{isMobile ? '安全設定主控台' : '設定控制中心'} ⚙️</h2>
          <TooltipProvider>
            <div className="stats-status-row settings-status-tooltips">
              <Tooltip>
                <TooltipTrigger asChild>
                  <span><StatusPill tone="info"><Plane size={14} /> {trips.length} 個旅程</StatusPill></span>
                </TooltipTrigger>
                <TooltipContent>目前保存在此帳號/裝置嘅旅程數量</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span><StatusPill tone={brokerReady ? 'ok' : 'warning'}><Server size={14} /> Broker {brokerReady ? 'session active' : 'session missing'}</StatusPill></span>
                </TooltipTrigger>
                <TooltipContent>Credential Broker unlock/session 狀態</TooltipContent>
              </Tooltip>
              {syncState && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span><StatusPill tone={syncPillTone}><Cloud size={14} /> Sync {syncState.status}{syncPillDetail}</StatusPill></span>
                  </TooltipTrigger>
                  <TooltipContent>雲端同步狀態、等待上傳隊列與失敗重試數</TooltipContent>
                </Tooltip>
              )}
              <Tooltip>
                <TooltipTrigger asChild>
                  <span><StatusPill tone={personalNotionStatus?.status === 'connected' ? 'ok' : 'neutral'}><NotebookText size={14} /> Notion {personalNotionStatus?.status === 'connected' ? '鏡像已連接' : cloudSyncAvailable ? '鏡像未連接' : '鏡像（登入後可用）'}</StatusPill></span>
                </TooltipTrigger>
                <TooltipContent>Notion 係可選鏡像備份，唔影響 Supabase 同步。喺下方「連線（進階）」連接你自己嘅 Notion database，新記帳就會自動鏡像過去。</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span><StatusPill tone="neutral"><ShieldCheck size={14} /> {buildLabel}</StatusPill></span>
                </TooltipTrigger>
                <TooltipContent>目前前端 build / security marker</TooltipContent>
              </Tooltip>
            </div>
          </TooltipProvider>
          {(queueFailedCount > 0 || syncState?.status === 'error' || !!state.syncError) && (onPush || onPull) && (
            <div className="settings-sync-retry" role="group" aria-label="同步修復">
              <button type="button" className="secondary compact" disabled={!!busy} onClick={() => void retrySyncNow()} aria-label="重試同步">
                <RotateCcw size={14} /> 重試同步{queueFailedCount ? `（${queueFailedCount} 項失敗）` : ''}
              </button>
              {onPull && (
                <button type="button" className="secondary compact" disabled={!!busy} onClick={() => void onPull()} aria-label="拉取雲端資料">
                  <Cloud size={14} /> 拉取
                </button>
              )}
            </div>
          )}
          <div className="settings-preview-controls" aria-label="設定快速操作">
            <button type="button" onClick={() => openSettingsPanel('settings-trip')}>
              <Plane size={17} />
              <span>旅程</span>
              <small>{trips.length} 個</small>
            </button>
            <button type="button" onClick={() => openSettingsPanel('settings-trip-update')}>
              <Sparkles size={17} />
              <span>行程 AI</span>
              <small>更新</small>
            </button>
            <button type="button" onClick={() => openSettingsPanel('settings-data')}>
              <ShieldCheck size={17} />
              <span>備份</span>
              <small>資料管理</small>
            </button>
          </div>
        </div>
      </GlassCard>

      {showStressPanel && (
        <DiagnosticsPanels
          ctx={ctx}
          syncState={syncState}
          storageScope={storageScope}
          brokerReady={brokerReady}
          notionMirrorReady={notionMirrorReady}
          supabaseAccountId={supabaseAccountId}
          supabaseSessionExpiresAt={supabaseSessionExpiresAt}
          queuePendingCount={queuePendingCount}
          queueFailedCount={queueFailedCount}
          changeTab={changeTab}
          openSettingsPanel={openSettingsPanel}
        />
      )}
      <PeopleSection ctx={ctx} />
      <AiModelsSection ctx={ctx} brokerReady={brokerReady} />
      <TripManagerSection ctx={ctx} openTripDraft={(draft) => { setTripDraft(draft); setTripDraftModalOpen(true); }} />
      <TripSharingSection ctx={ctx} sharingSession={sharingSession} />
      <TripUpdateSection
        ctx={ctx}
        tripDraft={tripDraft}
        setTripDraft={setTripDraft}
        setTripDraftModalOpen={setTripDraftModalOpen}
        applyTripDraft={applyTripDraft}
        requireNotionMirror={requireNotionMirror}
      />
      <CredentialsSection
        ctx={ctx}
        brokerReady={brokerReady}
        personalNotionStatus={personalNotionStatus}
        setPersonalNotionStatus={setPersonalNotionStatus}
        personalNotionDb={personalNotionDb}
        setPersonalNotionDb={setPersonalNotionDb}
        applyPersonalNotionConnection={applyPersonalNotionConnection}
      />
      <DataSection ctx={ctx} syncState={syncState} storageScope={storageScope} brokerReady={brokerReady} notionMirrorReady={notionMirrorReady} onReset={onReset} />
      <AccountSection
        ctx={ctx}
        updatePassword={updatePassword}
        onSignOut={onSignOut}
        onSignOutClick={handleSupabaseSignOut}
        onClearDeviceData={onClearDeviceData}
        onReset={onReset}
        deleteUserAccount={supabaseAuth.deleteUserAccount}
      />
      <ThemeSection ctx={ctx} />
      {showStressPanel && <ItineraryJsonSection ctx={ctx} />}
      {stress.stressToolsUnlocked && showStressPanel && <StressTestSection ctx={ctx} stress={stress} changeTab={changeTab} />}

      {tripDraftModalOpen && tripDraft && (
        <TripReviewModal state={state} tripDraft={tripDraft} setTripDraftModalOpen={setTripDraftModalOpen} applyTripDraft={applyTripDraft} />
      )}

      {status && <Toast tone={/失敗|未連線|暫停|請輸入/.test(status) ? 'warning' : 'success'}>{status}</Toast>}

      {onReopenGuide && (
        <div style={{ display: 'flex', justifyContent: 'center', marginTop: '2rem' }}>
          <button type="button" className="secondary" onClick={onReopenGuide}>
            <Sparkles size={14} /> 重新開啟歡迎指南
          </button>
        </div>
      )}

      {onSignOut && (
        <div style={{ display: 'flex', justifyContent: 'center', marginTop: '1.25rem' }}>
          <button
            type="button"
            className="danger"
            disabled={!!busy}
            onClick={() => {
              if (window.confirm('確定要登出帳號？')) void handleSupabaseSignOut();
            }}
          >
            <LogOut size={16} /> 登出帳號
          </button>
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'center', marginTop: '2rem', paddingBottom: '2rem' }}>
        <span onClick={stress.handleVersionClick} style={{ cursor: 'pointer', userSelect: 'none', color: '#000000', fontSize: '12px', letterSpacing: '0.05em' }}>
          Build: {buildLabel} {stress.clickCount > 0 ? `(${stress.clickCount}/5)` : ''} {showStressPanel ? '🔓' : '🔒'}
        </span>
      </div>

      </div>
    </section>
  );
}