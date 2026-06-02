import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { ErrorBoundary } from './app/ErrorBoundary';
import { ReceiptEditor } from './components/ReceiptEditor';
import { Shell } from './components/Shell';
import { LoadingState } from './components/ui';
import { activeTrip, stampReceiptForTrip, stableSpotId } from './domain/trip/normalize';
import { hasCredentialBrokerSession } from './lib/credentialBroker';
import { canUseNotionMirror } from './lib/notionAccess';
import { mergePulledData } from './lib/syncMerge';
import { useAppState } from './lib/useAppState';
import { useSyncEngine } from './lib/useSyncEngine';
import { clearCredentialSession, clearStoredState } from './lib/storage';
import type { Receipt, SyncQueueItem, TabId, TripProfile } from './lib/types';
import { TAB_MANIFEST } from './lib/tabs';
import { AuthGate } from './security/AuthGate';
import { HyperframeBackground } from './components/HyperframeBackground';
import { fetchLiveCurrencySnapshot, loadCurrencySnapshot, usableSnapshot, type CurrencySnapshot } from './lib/currency';
import { AnimatePresence, motion } from 'motion/react';
import { shouldDisableHeavyEffects } from './lib/performance';
import { hasSupabaseSession, useSupabaseAuth } from './lib/supabase';
import { SupabaseGate } from './security/SupabaseGate';
import { clearIndexedState } from './storage/indexedDb';
import { WelcomeGuidePopup, type WelcomeGuideResult } from './components/WelcomeGuidePopup';
import { upsertSupabaseTrip } from './lib/supabase';
import { createTripProfile } from './domain/trip/normalize';
import { hasDeviceTrust, clearDeviceTrust } from './security/deviceTrust';
import { TripThemeProvider } from './theme/tripTheme';

const Dashboard = lazy(() => import('./tabs/Dashboard').then((module) => ({ default: module.Dashboard })));
const Scan = lazy(() => import('./tabs/Scan').then((module) => ({ default: module.Scan })));
const Timeline = lazy(() => import('./tabs/Timeline').then((module) => ({ default: module.Timeline })));
const History = lazy(() => import('./tabs/History').then((module) => ({ default: module.History })));
const Weather = lazy(() => import('./tabs/Weather').then((module) => ({ default: module.Weather })));
const Stats = lazy(() => import('./tabs/Stats').then((module) => ({ default: module.Stats })));
const Settings = lazy(() => import('./tabs/Settings').then((module) => ({ default: module.Settings })));

const VALID_TABS = new Set<TabId>(TAB_MANIFEST.map((item) => item.id));
const bootSyncKeys = new Set<string>();
let bootCurrencyPromise: Promise<CurrencySnapshot> | null = null;

function safeTabId(value: unknown): TabId {
  return typeof value === 'string' && VALID_TABS.has(value as TabId) ? value as TabId : 'dashboard';
}

function fetchBootCurrencySnapshot(): Promise<CurrencySnapshot> {
  const cached = usableSnapshot(loadCurrencySnapshot());
  if (cached) return Promise.resolve(cached);
  bootCurrencyPromise ||= fetchLiveCurrencySnapshot().finally(() => {
    bootCurrencyPromise = null;
  });
  return bootCurrencyPromise;
}

export function App() {
  const supabaseAuth = useSupabaseAuth();
  const hasLocalSupabaseSession = () => {
    try {
      const stored = localStorage.getItem('travel-expense:supabase-auth:v1');
      if (!stored) return false;
      const parsed = JSON.parse(stored);
      return !!parsed?.access_token;
    } catch {
      return false;
    }
  };
  const isCloudSyncActive = hasSupabaseSession(supabaseAuth.session) || hasLocalSupabaseSession();
  const userEmail = supabaseAuth.session?.user?.email || null;
  const storageScope = hasSupabaseSession(supabaseAuth.session) ? `supabase:${supabaseAuth.session.user.id}` : 'local';
  const { state, setState, updateState, upsertReceipt, deleteReceipt, resetLocal, isHydratingScope } = useAppState(isCloudSyncActive, storageScope, userEmail);

  const [skippedGuide, setSkippedGuide] = useState(false);
  const [isNewTripWizardOpen, setIsNewTripWizardOpen] = useState(false);

  const handleSaveGuideTrip = async (result: WelcomeGuideResult | TripProfile) => {
    const guide = 'trip' in result
      ? result
      : { trip: result, persons: state.persons, shareRatios: state.shareRatios };
    const { trip, persons, shareRatios } = guide;
    try {
      const syncedTrip = await upsertSupabaseTrip(supabaseAuth.session!, state, trip);
      setState((prev) => ({
        ...prev,
        trips: [syncedTrip],
        activeTripId: syncedTrip.id,
        tripName: syncedTrip.name,
        tripDateRange: { start: syncedTrip.startDate, end: syncedTrip.endDate },
        budget: syncedTrip.budget ?? prev.budget,
        tripCurrency: syncedTrip.currencies?.find((currency) => currency !== 'HKD') || prev.tripCurrency,
        customItinerary: syncedTrip.itinerary || [],
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
    hasSupabaseSession(supabaseAuth.session) &&
    userEmail?.toLowerCase() !== 'vc06456@gmail.com' &&
    (state.trips || []).length === 0 &&
    !isHydratingScope &&
    !skippedGuide;

  const syncEngine = useSyncEngine(state, setState, supabaseAuth.session);
  const { pull, sync } = syncEngine;
  const [tab, setTab] = useState<TabId>(() => safeTabId((typeof window !== 'undefined' && window.location.hash.slice(1)) || 'dashboard'));
  const [direction, setDirection] = useState<number>(0);
  const [editing, setEditing] = useState<Receipt | null | undefined>(undefined);
  const bootSyncScheduledKey = useRef('');
  const bootSyncInitiated = useRef(false);
  const didHydrateTab = useRef(false);
  const receiptCountRef = useRef(state.receipts.length);
  receiptCountRef.current = state.receipts.length;
  const safeTab = safeTabId(tab);
  const clearSupabaseDeviceData = async () => {
    const scope = hasSupabaseSession(supabaseAuth.session) ? `supabase:${supabaseAuth.session.user.id}` : storageScope;
    clearStoredState(scope);
    await clearIndexedState(scope);
    clearCredentialSession();
    await clearDeviceTrust();
  };

  useEffect(() => {
    const onHash = () => {
      const rawHash = window.location.hash.slice(1);
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

  // Fix Bug 9.2: Hydrate tab once from state on boot if no hash present
  useEffect(() => {
    if (didHydrateTab.current) return;
    if (state.lastTab) {
      didHydrateTab.current = true;
      const hash = window.location.hash.slice(1);
      if (!hash) {
        setTab(safeTabId(state.lastTab));
      }
    }
  }, [state.lastTab]);

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
    if (!hasSupabaseSession(supabaseAuth.session) && !canUseNotionMirror(state, false, userEmail)) return;

    const bootSyncKey = [
      hasSupabaseSession(supabaseAuth.session) ? `supabase:${supabaseAuth.session.user.id}` : hasCredentialBrokerSession(state) ? `broker:${state.credentialSessionExpiresAt || 0}` : 'local-dev-credential',
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
  }, [isHydratingScope, state.credentialSession, state.credentialSessionExpiresAt, pull, sync, supabaseAuth.session]);

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
      <Shell active={safeTab} onTab={changeTab} syncState={syncEngine.engineState} onRetryFailed={handleSyncRetry} state={state} setState={setState} onPull={syncEngine.pull} onOpenNewTripWizard={() => setIsNewTripWizardOpen(true)}>
        <ErrorBoundary key={safeTab}>
          <Suspense fallback={<LoadingState label="載入分頁" />}>
            {disableHeavy ? (
              <div className="w-full h-full">
                {safeTab === 'dashboard' && <Dashboard state={state} setState={setState} updateState={updateState} onOpen={setEditing} onTab={changeTab} onManual={() => setEditing(null)} isWizardOpen={isNewTripWizardOpen} setIsWizardOpen={setIsNewTripWizardOpen} />}
                {safeTab === 'scan' && (
                  <Scan
                    state={state}
                    onManual={() => setEditing(null)}
                    onDraft={setEditing}
                    onImport={importReceipts}
                    onPull={syncEngine.pull}
                    cloudSyncAvailable={isCloudSyncActive}
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
                  {safeTab === 'dashboard' && <Dashboard state={state} setState={setState} updateState={updateState} onOpen={setEditing} onTab={changeTab} onManual={() => setEditing(null)} isWizardOpen={isNewTripWizardOpen} setIsWizardOpen={setIsNewTripWizardOpen} />}
                  {safeTab === 'scan' && (
                    <Scan
                      state={state}
                      onManual={() => setEditing(null)}
                      onDraft={setEditing}
                      onImport={importReceipts}
                      onPull={syncEngine.pull}
                      cloudSyncAvailable={isCloudSyncActive}
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
                  {safeTab === 'stats' && <Stats state={state} updateState={updateState} onTab={changeTab} />}
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
    if (hasSupabaseSession(supabaseAuth.session) && isHydratingScope) {
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
