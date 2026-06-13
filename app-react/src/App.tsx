import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { ErrorBoundary } from './app/ErrorBoundary';
import { ReceiptEditor } from './components/ReceiptEditor';
import { Shell } from './components/Shell';
import { LoadingState } from './components/ui';
import { Loader2 } from 'lucide-react';
import { activeTrip, stampReceiptForTrip, stableSpotId } from './domain/trip/normalize';
import { hasCredentialBrokerSession } from './lib/credentialBroker';
import { canUseNotionMirror } from './lib/notionAccess';
import { mergePulledData } from './lib/syncMerge';
import { useAppState } from './lib/useAppState';
import { useSyncEngine } from './lib/useSyncEngine';
import { clearCredentialSession, clearStoredState } from './lib/storage';
import type { Receipt, SyncQueueItem, TabId, TripInviteSummary, TripProfile } from './lib/types';
import { TAB_MANIFEST } from './lib/tabs';
import { isBoss } from './lib/constants';
import { AuthGate } from './security/AuthGate';
import { HyperframeBackground } from './components/HyperframeBackground';
import { fetchLiveCurrencySnapshot, loadCurrencySnapshot, usableSnapshot, type CurrencySnapshot } from './lib/currency';
import { AnimatePresence, motion } from 'motion/react';
import { shouldDisableHeavyEffects } from './lib/performance';
import { acceptSupabaseTripInvite, createSupabaseTripInvite, hasSupabaseSession, useSupabaseAuth } from './lib/supabase';
import { SupabaseGate } from './security/SupabaseGate';
import { clearIndexedState } from './storage/indexedDb';
import { WelcomeGuidePopup, type WelcomeGuideResult } from './components/WelcomeGuidePopup';
import { upsertSupabaseTrip } from './lib/supabase';
import { createTripProfile } from './domain/trip/normalize';
import { clearDeviceTrust } from './security/deviceTrust';
import { TripThemeProvider } from './theme/tripTheme';

const Dashboard = lazy(() => import('./tabs/Dashboard').then((module) => ({ default: module.Dashboard })));
const Scan = lazy(() => import('./tabs/Scan').then((module) => ({ default: module.Scan })));
const Timeline = lazy(() => import('./tabs/Timeline').then((module) => ({ default: module.Timeline })));
const History = lazy(() => import('./tabs/History').then((module) => ({ default: module.History })));
const Weather = lazy(() => import('./tabs/Weather').then((module) => ({ default: module.Weather })));
const Stats = lazy(() => import('./tabs/Stats').then((module) => ({ default: module.Stats })));
const Settings = lazy(() => import('./tabs/Settings').then((module) => ({ default: module.Settings })));

const VALID_TABS = new Set<TabId>(TAB_MANIFEST.map((item) => item.id));
const DEFAULT_LAUNCH_TAB: TabId = 'scan';
const bootSyncKeys = new Set<string>();
let bootCurrencyPromise: Promise<CurrencySnapshot> | null = null;

function safeTabId(value: unknown): TabId {
  return typeof value === 'string' && VALID_TABS.has(value as TabId) ? value as TabId : DEFAULT_LAUNCH_TAB;
}

function fetchBootCurrencySnapshot(): Promise<CurrencySnapshot> {
  const cached = usableSnapshot(loadCurrencySnapshot());
  if (cached) return Promise.resolve(cached);
  bootCurrencyPromise ||= fetchLiveCurrencySnapshot().finally(() => {
    bootCurrencyPromise = null;
  });
  return bootCurrencyPromise;
}

function storedSupabaseSession(): Session | null {
  try {
    const raw = localStorage.getItem('travel-expense:supabase-auth:v1');
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed?.user?.id && parsed?.access_token ? parsed as Session : null;
  } catch {
    return null;
  }
}

export function App() {
  const supabaseAuth = useSupabaseAuth();
  const localSupabaseSession = storedSupabaseSession();
  const effectiveSupabaseSession = supabaseAuth.session || localSupabaseSession;
  const isCloudSyncActive = hasSupabaseSession(effectiveSupabaseSession);
  const userEmail = effectiveSupabaseSession?.user?.email || null;
  const storageScope = hasSupabaseSession(effectiveSupabaseSession) ? `supabase:${effectiveSupabaseSession.user.id}` : 'local';
  const { state, setState, updateState, upsertReceipt, deleteReceipt, resetLocal, isHydratingScope } = useAppState(isCloudSyncActive, storageScope, userEmail);
  
  const [globalOcrBusy, setGlobalOcrBusy] = useState('');
  const [batch, setBatch] = useState<Array<Receipt & { selected?: boolean }>>([]);
  const [skippedGuide, setSkippedGuide] = useState(false);
  const [acceptedInviteToken, setAcceptedInviteToken] = useState('');

  const handleSaveGuideTrip = async (result: WelcomeGuideResult | TripProfile) => {
    const guide = 'trip' in result
      ? result
      : { trip: result, persons: state.persons, shareRatios: state.shareRatios, sharingInvites: [] };
    const { trip, persons, shareRatios, sharingInvites } = guide;
    try {
      if (!effectiveSupabaseSession) throw new Error('Supabase session unavailable');
      const syncedTrip = await upsertSupabaseTrip(effectiveSupabaseSession, state, trip);
      const createdInvites: TripInviteSummary[] = [];
      for (const invite of sharingInvites || []) {
        try {
          createdInvites.push(await createSupabaseTripInvite(effectiveSupabaseSession, state, syncedTrip, invite));
        } catch (inviteError) {
          console.warn('[WelcomeGuide] Failed to create trip invite:', inviteError);
        }
      }
      const visibleTrip = createdInvites.length
        ? {
          ...syncedTrip,
          sharing: {
            ...(syncedTrip.sharing || { role: 'owner' as const, memberCount: 1, pendingInviteCount: 0, isShared: false }),
            role: syncedTrip.sharing?.role || 'owner',
            isShared: true,
            pendingInviteCount: (syncedTrip.sharing?.pendingInviteCount || 0) + createdInvites.length,
            invites: [...(syncedTrip.sharing?.invites || []), ...createdInvites],
          },
        }
        : syncedTrip;
      setState((prev) => ({
        ...prev,
        trips: [visibleTrip],
        activeTripId: visibleTrip.id,
        tripName: visibleTrip.name,
        tripDateRange: { start: visibleTrip.startDate, end: visibleTrip.endDate },
        budget: visibleTrip.budget ?? prev.budget,
        tripCurrency: visibleTrip.currencies?.find((currency) => currency !== 'HKD') || prev.tripCurrency,
        customItinerary: visibleTrip.itinerary || [],
        persons,
        shareRatios,
        settingsUpdatedAt: Date.now(),
      }));
    } catch (err) {
      console.error('Failed to save guide trip:', err);
      setState((prev) => ({
        ...prev,
        trips: [trip],
        activeTripId: trip.id,
        tripName: trip.name,
        tripDateRange: { start: trip.startDate, end: trip.endDate },
        budget: trip.budget ?? prev.budget,
        tripCurrency: trip.currencies?.find((currency) => currency !== 'HKD') || prev.tripCurrency,
        customItinerary: trip.itinerary || [],
        persons,
        shareRatios,
        settingsUpdatedAt: Date.now(),
      }));
    }
  };

  const handleSkipGuide = async () => {
    const today = new Date().toISOString().slice(0, 10);
    const d = new Date();
    d.setDate(d.getDate() + 5);
    const end = d.toISOString().slice(0, 10);
    const placeholderTrip = createTripProfile({
      name: '我嘅新旅程 📓',
      destinationSummary: '日本',
      startDate: today,
      endDate: end,
      budget: 50000,
      currency: 'JPY',
    });
    setSkippedGuide(true);
    await handleSaveGuideTrip(placeholderTrip);
  };

  const showGuide =
    hasSupabaseSession(effectiveSupabaseSession) &&
    !isBoss(userEmail) &&
    (state.trips || []).length === 0 &&
    !isHydratingScope &&
    !skippedGuide;

  const syncEngine = useSyncEngine(state, setState, effectiveSupabaseSession);
  const { pull, sync } = syncEngine;
  const [tab, setTab] = useState<TabId>(() => safeTabId((typeof window !== 'undefined' && window.location.hash.slice(1)) || DEFAULT_LAUNCH_TAB));
  const [direction, setDirection] = useState<number>(0);
  const [editing, setEditing] = useState<Receipt | null | undefined>(undefined);
  const bootSyncScheduledKey = useRef('');
  const bootSyncInitiated = useRef(false);
  const didHydrateTab = useRef(false);
  const receiptCountRef = useRef(state.receipts.length);
  receiptCountRef.current = state.receipts.length;
  const safeTab = safeTabId(tab);
  const clearSupabaseDeviceData = async () => {
    const scope = hasSupabaseSession(effectiveSupabaseSession) ? `supabase:${effectiveSupabaseSession.user.id}` : storageScope;
    clearStoredState(scope);
    await clearIndexedState(scope);
    clearCredentialSession();
    await clearDeviceTrust();
  };

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const rawHash = window.location.hash.slice(1);
    if (!rawHash.startsWith('accept-invite')) return;
    const query = rawHash.includes('?') ? rawHash.slice(rawHash.indexOf('?') + 1) : '';
    const token = new URLSearchParams(query).get('token')?.trim();
    if (!token || token === acceptedInviteToken || !hasSupabaseSession(effectiveSupabaseSession)) return;
    setAcceptedInviteToken(token);
    acceptSupabaseTripInvite(effectiveSupabaseSession, token)
      .then(async () => {
        window.history.replaceState(null, '', '#settings');
        setTab('settings');
        await pull();
      })
      .catch((inviteError) => {
        console.error('[TripInvite] accept failed:', inviteError);
        updateState({ syncError: inviteError instanceof Error ? inviteError.message : 'Trip invite accept failed' });
      });
  }, [acceptedInviteToken, effectiveSupabaseSession, pull, updateState]);

  useEffect(() => {
    const onHash = () => {
      const rawHash = window.location.hash.slice(1);
      if (rawHash.startsWith('accept-invite')) return;
      const next = safeTabId(rawHash);
      // Fix Bug 9.1: Correct url hash address bar if corrupt
      if (rawHash && rawHash !== next) {
        window.history.replaceState(null, '', `#${next}`);
      }
      setTab((prev) => {
        const currentIndex = TAB_MANIFEST.findIndex((t) => t.id === prev);
        const nextIndex = TAB_MANIFEST.findIndex((t) => t.id === next);
        if (currentIndex !== -1 && nextIndex !== -1 && currentIndex !== nextIndex) {
          setDirection(nextIndex > currentIndex ? 1 : -1);
        }
        return next;
      });
      updateState({ lastTab: next });
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, [updateState]);

  // Open the app on Scan unless the URL explicitly requests another tab.
  useEffect(() => {
    if (didHydrateTab.current) return;
    didHydrateTab.current = true;
    const hash = window.location.hash.slice(1);
    if (!hash) {
      setTab(DEFAULT_LAUNCH_TAB);
      if (state.lastTab !== DEFAULT_LAUNCH_TAB) updateState({ lastTab: DEFAULT_LAUNCH_TAB });
    }
  }, [state.lastTab, updateState]);

  useEffect(() => {
    let alive = true;
    fetchBootCurrencySnapshot().then(snapshot => {
      if (!alive) return;
      if (snapshot.rates.JPY) {
        setState((current) => ({ ...current, rate: Number(snapshot.rates.JPY.toFixed(4)) }));
        console.log('[App] Auto-updated live exchange rate:', snapshot.rates.JPY, 'from', snapshot.source);
      }
    }).catch(() => {
      // Background rate refresh is best-effort; Settings/Scan expose explicit
      // refresh errors when the user asks for a live rate.
    });
    return () => {
      alive = false;
    };
  }, [setState]);

  useEffect(() => {
    bootSyncInitiated.current = false;
    bootSyncScheduledKey.current = '';
    if (supabaseAuth.configured) clearCredentialSession();
  }, [storageScope, supabaseAuth.configured]);

  // Fix Bug 8.1: Lock automatic bootPull/bootSync logic behind bootSyncInitiated.current
  useEffect(() => {
    if (bootSyncInitiated.current) return;
    if (isHydratingScope) return;
    if (!navigator.onLine) return;
    if (!isCloudSyncActive && !canUseNotionMirror(state, false, userEmail)) return;

    const bootSyncKey = [
      isCloudSyncActive ? `supabase:${effectiveSupabaseSession.user.id}` : hasCredentialBrokerSession(state) ? `broker:${state.credentialSessionExpiresAt || 0}` : 'local-dev-credential',
      receiptCountRef.current === 0 ? 'pull' : 'sync',
    ].join(':');
    if (bootSyncKeys.has(bootSyncKey) || bootSyncScheduledKey.current === bootSyncKey) return;
    bootSyncScheduledKey.current = bootSyncKey;

    const timer = window.setTimeout(() => {
      bootSyncScheduledKey.current = '';
      if (bootSyncKeys.has(bootSyncKey) || bootSyncInitiated.current) return;
      bootSyncKeys.add(bootSyncKey);
      bootSyncInitiated.current = true;
      if (receiptCountRef.current === 0) {
        console.log('[App] Boot pull — no local receipts, fetching from configured cloud sources');
        void pull();
      } else {
        console.log('[App] Boot sync — existing local data');
        void sync();
      }
    }, 800);
    return () => {
      window.clearTimeout(timer);
      if (!bootSyncKeys.has(bootSyncKey)) bootSyncScheduledKey.current = '';
    };
  }, [effectiveSupabaseSession, isCloudSyncActive, isHydratingScope, state, pull, sync, userEmail]);

  const changeTab = (next: TabId) => {
    const normalized = safeTabId(next);
    const currentIndex = TAB_MANIFEST.findIndex((t) => t.id === safeTab);
    const nextIndex = TAB_MANIFEST.findIndex((t) => t.id === normalized);
    if (currentIndex !== -1 && nextIndex !== -1 && currentIndex !== nextIndex) {
      setDirection(nextIndex > currentIndex ? 1 : -1);
    }
    setTab(normalized);
    updateState({ lastTab: normalized });
    const hash = `#${normalized}`;
    if (typeof window !== 'undefined' && window.location.hash !== hash) {
      window.history.pushState(null, '', hash);
    }
  };

  const importReceipts = (receipts: Receipt[]) => {
    for (const receipt of receipts) {
      upsertReceipt(stampReceiptForTrip(state, receipt));
    }
  };

  const importRemoteData = (receipts: Receipt[], trips: TripProfile[] = []) => {
    setState((prev) => mergePulledData(prev, receipts, trips));
  };

  const handleSyncRetry = () => {
    syncEngine.retryFailedItems();
    window.setTimeout(() => {
      void syncEngine.sync();
    }, 150);
  };

  const disableHeavy = shouldDisableHeavyEffects();

  const slideVariants = {
    enter: (dir: number) => ({
      x: disableHeavy ? 0 : (dir > 0 ? 50 : dir < 0 ? -50 : 0),
      opacity: 0,
    }),
    center: {
      x: 0,
      opacity: 1,
    },
    exit: (dir: number) => ({
      x: disableHeavy ? 0 : (dir > 0 ? -50 : dir < 0 ? 50 : 0),
      opacity: 0,
    }),
  };

  const appContent = (
    <TripThemeProvider state={state}>
      <HyperframeBackground />
      {showGuide && (
        <WelcomeGuidePopup
          state={state}
          onSave={handleSaveGuideTrip}
          onSkip={handleSkipGuide}
        />
      )}
      {globalOcrBusy && (
        <div className="global-ocr-floating-badge">
          <Loader2 className="global-ocr-floating-spinner" size={14} />
          <span className="global-ocr-floating-text">
            {globalOcrBusy === 'ocr' && 'AI 正在背景辨識收據...'}
            {globalOcrBusy === 'email-image' && 'AI 正在背景解析截圖...'}
            {globalOcrBusy === 'voice' && 'AI 正在背景解析語音...'}
            {globalOcrBusy === 'email' && 'AI 正在背景解析郵件...'}
            {(!['ocr', 'email-image', 'voice', 'email'].includes(globalOcrBusy)) && 'AI 正在背景處理中...'}
          </span>
        </div>
      )}
      <Shell active={safeTab} onTab={changeTab} syncState={syncEngine.engineState} onRetryFailed={handleSyncRetry}>
        <ErrorBoundary key={safeTab}>
          <Suspense fallback={<LoadingState label="載入分頁" />}>
            {disableHeavy ? (
              <div className="w-full h-full">
                {safeTab === 'dashboard' && <Dashboard state={state} setState={setState} updateState={updateState} onOpen={setEditing} onTab={changeTab} onManual={() => setEditing(null)} />}
                {safeTab === 'scan' && (
                  <Scan
                    state={state}
                    onManual={() => setEditing(null)}
                    onDraft={setEditing}
                    onImport={importReceipts}
                    onPull={syncEngine.pull}
                    cloudSyncAvailable={isCloudSyncActive}
                    onBusyChange={setGlobalOcrBusy}
                    batch={batch}
                    setBatch={setBatch}
                  />
                )}
                {safeTab === 'timeline' && <Timeline state={state} setState={setState} onOpen={setEditing} />}
                {safeTab === 'history' && (
                  <History
                    state={state}
                    setState={setState}
                    onOpen={setEditing}
                    onImport={importReceipts}
                    onHydrate={importRemoteData}
                    onConfirmPending={(receipt) => {
                      const next = stampReceiptForTrip(state, { ...receipt, store: receipt.store.replace(/^⏳\s*/, ''), syncStatus: (isCloudSyncActive || canUseNotionMirror(state, false, userEmail)) ? 'queued' : 'local' });
                      upsertReceipt(next);
                    }}
                    onPull={syncEngine.pull}
                    cloudSyncAvailable={isCloudSyncActive}
                  />
                )}
                {safeTab === 'weather' && <Weather state={state} />}
                {safeTab === 'stats' && <Stats state={state} updateState={updateState} />}
                {safeTab === 'settings' && <Settings state={state} setState={setState} updateState={updateState} onReset={resetLocal} syncState={syncEngine.engineState} onPull={syncEngine.pull} onPush={syncEngine.push} onPushSettings={syncEngine.pushSettings} cloudSyncAvailable={isCloudSyncActive} storageScope={storageScope} changeTab={changeTab} updatePassword={supabaseAuth.updatePassword} userEmail={userEmail} onSignOut={supabaseAuth.signOut} onClearDeviceData={clearSupabaseDeviceData} />}
              </div>
            ) : (
              <AnimatePresence mode="wait" initial={false}>
                <motion.div
                  key={safeTab}
                  custom={direction}
                  variants={slideVariants}
                  initial="enter"
                  animate="center"
                  exit="exit"
                  transition={{
                    x: { type: "spring", stiffness: 380, damping: 38, mass: 1 },
                    opacity: { duration: 0.15 }
                  }}
                  className="w-full h-full will-change-transform"
                  style={{ backfaceVisibility: 'hidden', transform: 'translate3d(0,0,0)' }}
                >
                  {safeTab === 'dashboard' && <Dashboard state={state} setState={setState} updateState={updateState} onOpen={setEditing} onTab={changeTab} onManual={() => setEditing(null)} />}
                  {safeTab === 'scan' && (
                    <Scan
                      state={state}
                      onManual={() => setEditing(null)}
                      onDraft={setEditing}
                      onImport={importReceipts}
                      onPull={syncEngine.pull}
                      cloudSyncAvailable={isCloudSyncActive}
                      onBusyChange={setGlobalOcrBusy}
                      batch={batch}
                      setBatch={setBatch}
                    />
                  )}
                  {safeTab === 'timeline' && <Timeline state={state} setState={setState} onOpen={setEditing} />}
                  {safeTab === 'history' && (
                    <History
                      state={state}
                      setState={setState}
                      onOpen={setEditing}
                      onImport={importReceipts}
                      onHydrate={importRemoteData}
                      onConfirmPending={(receipt) => {
                        const next = stampReceiptForTrip(state, { ...receipt, store: receipt.store.replace(/^⏳\s*/, ''), syncStatus: (isCloudSyncActive || canUseNotionMirror(state, false, userEmail)) ? 'queued' : 'local' });
                        upsertReceipt(next);
                      }}
                      onPull={syncEngine.pull}
                      cloudSyncAvailable={isCloudSyncActive}
                    />
                  )}
                  {safeTab === 'weather' && <Weather state={state} />}
                  {safeTab === 'stats' && <Stats state={state} updateState={updateState} />}
                 {safeTab === 'settings' && <Settings state={state} setState={setState} updateState={updateState} onReset={resetLocal} syncState={syncEngine.engineState} onPull={syncEngine.pull} onPush={syncEngine.push} onPushSettings={syncEngine.pushSettings} cloudSyncAvailable={isCloudSyncActive} storageScope={storageScope} changeTab={changeTab} updatePassword={supabaseAuth.updatePassword} userEmail={userEmail} onSignOut={supabaseAuth.signOut} onClearDeviceData={clearSupabaseDeviceData} />}
                </motion.div>
              </AnimatePresence>
            )}
          </Suspense>
          {editing !== undefined && (
        <ReceiptEditor
          state={state}
          receipt={editing}
          onCancel={() => setEditing(undefined)}
          onSave={(receipt) => {
            const stamped = stampReceiptForTrip(state, receipt);
            upsertReceipt(stamped);
            setEditing(undefined);
          }}
          onDelete={(receipt) => {
            deleteReceipt(receipt);
            setEditing(undefined);
          }}
          onAddToItinerary={(receipt) => {
            setState((prev) => {
              const trip = activeTrip(prev);
              const now = Date.now();
              const itinerary = trip.itinerary.map((day) => ({ ...day, spots: day.spots.map((spot) => ({ ...spot })) }));
              const targetIdx = Math.max(0, itinerary.findIndex((day) => day.date === receipt.date));
              const target = itinerary[targetIdx] || itinerary[0];
              const spot = {
                id: stableSpotId(trip.id, target.date, target.spots.length, { time: receipt.time || '12:00', name: receipt.store || '新增行程' }),
                spotId: stableSpotId(trip.id, target.date, target.spots.length, { time: receipt.time || '12:00', name: receipt.store || '新增行程' }),
                time: receipt.time || '12:00',
                name: receipt.store || '新增行程',
                type: receipt.category || 'other',
                note: receipt.note || receipt.bookingRef || '',
                address: receipt.address || '',
                mapUrl: receipt.mapUrl || '',
              };
              target.spots = [...target.spots, spot].sort((a, b) => String(a.time || '').localeCompare(String(b.time || '')));
              const trips = (prev.trips || []).map((item) => item.id === trip.id ? { ...item, itinerary, version: item.version + 1, updatedAt: now } : item);
              const queue: SyncQueueItem = {
                id: `sync_${now}_${Math.random().toString(16).slice(2)}`,
                type: 'trip',
                entityId: trip.id,
                op: 'update',
                status: 'queued',
                attempts: 0,
                createdAt: now,
                updatedAt: now,
                payload: {
                  notionPageId: trip.notionPageId,
                  sourceId: trip.sourceId || trip.id,
                  updatedAt: now,
                },
              };
              return {
                ...prev,
                trips,
                customItinerary: itinerary,
                syncQueue: [
                  ...(prev.syncQueue || []).filter((item) => item.type !== queue.type || item.entityId !== queue.entityId),
                  queue,
                ].slice(-500),
              };
            });
            setEditing(undefined);
            changeTab('timeline');
          }}
        />
      )}
        </ErrorBoundary>
      </Shell>
    </TripThemeProvider>
  );

  if (supabaseAuth.configured) {
    if (isCloudSyncActive && isHydratingScope) {
      return <LoadingState label="載入帳號資料" />;
    }
    return <SupabaseGate auth={supabaseAuth}>{appContent}</SupabaseGate>;
  }

  return (
    <AuthGate
      credentialBrokerUrl={state.credentialBrokerUrl}
      onBrokerSession={(session) => updateState(session)}
      onUnlocked={() => {
        changeTab('dashboard');
      }}
    >
      {appContent}
    </AuthGate>
  );
}
