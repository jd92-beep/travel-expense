import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { ErrorBoundary } from './app/ErrorBoundary';
import { ReceiptEditor } from './components/ReceiptEditor';
import { Shell } from './components/Shell';
import { LoadingState, TabSkeleton } from './components/ui';
import { Loader2 } from 'lucide-react';
import { activeTrip, stampReceiptForTrip, stableDayId, stableSpotId } from './domain/trip/normalize';
import { applyItineraryEdit, bakeItineraryOverrides } from './lib/domain';
import { hasCredentialBrokerSession } from './lib/credentialBroker';
import { canUseNotionMirror } from './lib/notionAccess';
import { mergePulledData } from './lib/syncMerge';
import { useAppState } from './lib/useAppState';
import { useSyncEngine } from './lib/useSyncEngine';
import { clearCredentialSession, clearStoredState } from './lib/storage';
import type { AppState, Receipt, SyncQueueItem, TabId, TripInviteSummary, TripProfile } from './lib/types';
import { TAB_MANIFEST } from './lib/tabs';
import { isBoss } from './lib/constants';
import { AuthGate } from './security/AuthGate';
import { HyperframeBackground } from './components/HyperframeBackground';
import { appRatePatchFromSnapshot, fetchLiveCurrencySnapshot, loadCurrencySnapshot, usableSnapshot, type CurrencySnapshot } from './lib/currency';
import { AnimatePresence, motion } from 'motion/react';
import { useEffectsTier } from './lib/performance';
import { acceptSupabaseTripInvite, createSupabaseTripInvite, hasSupabaseSession, useSupabaseAuth } from './lib/supabase';
import { SupabaseGate } from './security/SupabaseGate';
import { clearIndexedState } from './storage/indexedDb';
import { WelcomeGuidePopup, type WelcomeGuideResult } from './components/WelcomeGuidePopup';
import { upsertSupabaseTrip } from './lib/supabase';
import { createTripProfile } from './domain/trip/normalize';
import { hasDeviceTrust, clearDeviceTrust } from './security/deviceTrust';
import { TripThemeProvider } from './theme/tripTheme';

// Trigger Vercel build

const Dashboard = lazy(() => import('./tabs/Dashboard').then((module) => ({ default: module.Dashboard })));
const Scan = lazy(() => import('./tabs/Scan').then((module) => ({ default: module.Scan })));
const Timeline = lazy(() => import('./tabs/Timeline').then((module) => ({ default: module.Timeline })));
const History = lazy(() => import('./tabs/History').then((module) => ({ default: module.History })));
const Weather = lazy(() => import('./tabs/Weather').then((module) => ({ default: module.Weather })));
const Stats = lazy(() => import('./tabs/Stats').then((module) => ({ default: module.Stats })));
const Settings = lazy(() => import('./tabs/Settings').then((module) => ({ default: module.Settings })));

const VALID_TABS = new Set<TabId>(TAB_MANIFEST.map((item) => item.id));
const DEFAULT_LAUNCH_TAB: TabId = 'scan';
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

// Synchronous first-paint hint: "is this phone still logged in?" so a cold open keeps the
// authenticated storage scope instead of flashing the login screen while supabase-js's async
// getSession() runs. Deliberately does NOT reject on an expired access_token and NEVER deletes
// storage — the access_token (JWT) expires ~hourly but the refresh_token is long-lived, and
// supabase-js silently mints a fresh access_token from it. The old code deleted the whole blob
// (refresh_token included) the moment the JWT expired, forcing a full re-login every ~1 hour.
// supabase-js owns eviction: it clears this key itself only when the refresh_token is truly dead.
function storedSupabaseSession(): Session | null {
  try {
    const raw = localStorage.getItem('travel-expense:supabase-auth:v1');
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.user?.id || !parsed?.access_token) return null;
    return parsed as Session;
  } catch {
    return null;
  }
}

export function App() {
  const supabaseAuth = useSupabaseAuth();
  const localSupabaseSession = storedSupabaseSession();
  // Trust the local hint only until supabase-js has resolved: once auth settles, a null session
  // means the refresh_token is genuinely dead → drop the hint so the login screen shows instead
  // of a broken "authenticated" state whose API calls all 401.
  const effectiveSupabaseSession = supabaseAuth.session || (supabaseAuth.loading ? localSupabaseSession : null);
  const isCloudSyncActive = hasSupabaseSession(effectiveSupabaseSession);
  const userEmail = effectiveSupabaseSession?.user?.email || null;
  const storageScope = hasSupabaseSession(effectiveSupabaseSession) ? `supabase:${effectiveSupabaseSession.user.id}` : 'local';
  const { state, setState, updateState, upsertReceipt, deleteReceipt, resetLocal, isStorageReady } = useAppState(isCloudSyncActive, storageScope, userEmail);

  const [globalOcrBusy, setGlobalOcrBusy] = useState('');
  const [batch, setBatch] = useState<Array<Receipt & { selected?: boolean }>>([]);
  const [skippedGuide, setSkippedGuide] = useState(false);
  const [isNewTripWizardOpen, setIsNewTripWizardOpen] = useState(false);
  const [acceptedInviteToken, setAcceptedInviteToken] = useState('');
  const bootSyncKeys = useRef(new Set<string>());
  const stateRef = useRef(state);
  stateRef.current = state;

  const handleSaveGuideTrip = async (result: WelcomeGuideResult | TripProfile) => {
    const guide = 'trip' in result
      ? result
      : { trip: result, persons: stateRef.current.persons, shareRatios: stateRef.current.shareRatios, sharingInvites: [] };
    const { trip, persons, shareRatios, sharingInvites } = guide;
    try {
      if (!supabaseAuth.session) throw new Error('Supabase session unavailable');
      const syncedTrip = await upsertSupabaseTrip(supabaseAuth.session, stateRef.current, trip);
      const createdInvites: TripInviteSummary[] = [];
      for (const invite of sharingInvites || []) {
        try {
          createdInvites.push(await createSupabaseTripInvite(supabaseAuth.session, stateRef.current, syncedTrip, invite));
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
        budget: visibleTrip.budget ?? 0,
        tripCurrency: visibleTrip.currencies?.find((currency) => currency !== 'HKD') || prev.tripCurrency,
        customItinerary: visibleTrip.itinerary || [],
        persons,
        shareRatios,
        settingsUpdatedAt: Date.now(),
      }));
    } catch {
      // Cloud save failed — keep the trip locally but tell the user (don't fail silently).
      const invitePart = (sharingInvites && sharingInvites.length)
        ? '；分享邀請要重新連線後再喺設定度發送'
        : '';
      setState((prev) => ({
        ...prev,
        trips: [trip],
        activeTripId: trip.id,
        tripName: trip.name,
        tripDateRange: { start: trip.startDate, end: trip.endDate },
        budget: trip.budget ?? 0,
        tripCurrency: trip.currencies?.find((currency) => currency !== 'HKD') || prev.tripCurrency,
        customItinerary: trip.itinerary || [],
        persons,
        shareRatios,
        settingsUpdatedAt: Date.now(),
        syncError: `旅程已暫存本機，雲端同步未成功，會自動重試${invitePart}`,
        globalSyncStatus: 'error',
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
      destinationSummary: '未設定目的地',
      startDate: today,
      endDate: end,
      budget: 0,
      currency: 'JPY',
    });
    setSkippedGuide(true);
    await handleSaveGuideTrip(placeholderTrip);
  };

  const showGuide =
    hasSupabaseSession(effectiveSupabaseSession) &&
    !isBoss(userEmail) &&
    (state.trips || []).length === 0 &&
    isStorageReady &&
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
    if (!token || token === acceptedInviteToken) return;
    if (!hasSupabaseSession(effectiveSupabaseSession)) {
      localStorage.setItem('travel-expense:pending-invite-token', token);
      window.history.replaceState(null, '', '#login');
      return;
    }
    const pendingToken = localStorage.getItem('travel-expense:pending-invite-token');
    const resolvedToken = token || pendingToken;
    if (!resolvedToken) return;
    localStorage.removeItem('travel-expense:pending-invite-token');
    setAcceptedInviteToken(resolvedToken);
    acceptSupabaseTripInvite(effectiveSupabaseSession, resolvedToken)
      .then(async () => {
        window.history.replaceState(null, '', '#settings');
        setTab('settings');
        await pull();
      })
      .catch((inviteError) => {
        console.error('[TripInvite] accept failed:', inviteError);
        const msg = inviteError instanceof Error ? inviteError.message : 'Trip invite accept failed';
        if (/expired/i.test(msg)) {
          updateState({ syncError: '邀請已過期，請聯絡旅程管理員重新發送邀請。' });
        } else {
          updateState({ syncError: msg });
        }
      });
  }, [acceptedInviteToken, effectiveSupabaseSession, pull, updateState]);

  useEffect(() => {
    if (!hasSupabaseSession(effectiveSupabaseSession)) return;
    const pendingToken = localStorage.getItem('travel-expense:pending-invite-token');
    if (!pendingToken || pendingToken === acceptedInviteToken) return;
    localStorage.removeItem('travel-expense:pending-invite-token');
    setAcceptedInviteToken(pendingToken);
    acceptSupabaseTripInvite(effectiveSupabaseSession, pendingToken)
      .then(async () => {
        window.history.replaceState(null, '', '#settings');
        setTab('settings');
        await pull();
      })
      .catch((inviteError) => {
        console.error('[TripInvite] pending accept failed:', inviteError);
        const msg = inviteError instanceof Error ? inviteError.message : 'Trip invite accept failed';
        if (/expired/i.test(msg)) {
          updateState({ syncError: '邀請已過期，請聯絡旅程管理員重新發送邀請。' });
        } else {
          updateState({ syncError: msg });
        }
      });
  }, [effectiveSupabaseSession, acceptedInviteToken, pull, updateState]);

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
    // Fixed mode: the user pre-exchanged currency before the trip and locked in that rate — skip the
    // background live-rate fetch entirely (not just discard its result), so fixed mode also means no
    // wasted network call on every boot. `state` here is the mount-time value (this effect's dep array
    // is stable), which is correct: rateMode loads synchronously from localStorage before first render.
    if (state.rateMode === 'fixed') return undefined;
    let alive = true;
    fetchBootCurrencySnapshot().then(snapshot => {
      if (!alive) return;
      if (snapshot.rates.JPY) {
        setState((current) => {
          // Re-check: the user could have switched to fixed mode while this fetch was in flight.
          if (current.rateMode === 'fixed') return current;
          return { ...current, ...appRatePatchFromSnapshot(snapshot) };
        });
        console.log('[App] Auto-updated live exchange rate:', snapshot.rates.JPY, 'from', snapshot.source);
      }
    }).catch(() => {
      // Background rate refresh is best-effort; Settings/Scan expose explicit
      // refresh errors when the user asks for a live rate.
    });
    return () => {
      alive = false;
    };
    // Mount-once by design (boot-time fetch); rateMode is read from the mount-time closure, which is
    // correct since it loads synchronously from localStorage before first render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setState]);

  useEffect(() => {
    bootSyncInitiated.current = false;
    bootSyncScheduledKey.current = '';
    // Also forget completed boot-sync keys: signing out of A and back into A within one app
    // session must re-trigger the boot pull, not silently skip it.
    bootSyncKeys.current.clear();
    if (supabaseAuth.configured) clearCredentialSession();
  }, [storageScope, supabaseAuth.configured]);

  // Fix Bug 8.1: Lock automatic bootPull/bootSync logic behind bootSyncInitiated.current
  useEffect(() => {
    if (bootSyncInitiated.current) return;
    if (!isStorageReady) return;
    if (!navigator.onLine) return;
    if (!hasSupabaseSession(effectiveSupabaseSession) && !canUseNotionMirror(state, false, userEmail)) return;

    const bootSyncKey = [
      hasSupabaseSession(effectiveSupabaseSession) ? `supabase:${effectiveSupabaseSession.user.id}` : hasCredentialBrokerSession(state) ? `broker:${state.credentialSessionExpiresAt || 0}` : 'local-dev-credential',
      receiptCountRef.current === 0 ? 'pull' : 'sync',
    ].join(':');
    if (bootSyncKeys.current.has(bootSyncKey) || bootSyncScheduledKey.current === bootSyncKey) return;
    bootSyncScheduledKey.current = bootSyncKey;

    const timer = window.setTimeout(() => {
      bootSyncScheduledKey.current = '';
      if (bootSyncKeys.current.has(bootSyncKey) || bootSyncInitiated.current) return;
      bootSyncKeys.current.add(bootSyncKey);
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
      if (!bootSyncKeys.current.has(bootSyncKey)) bootSyncScheduledKey.current = '';
    };
  }, [isStorageReady, state.credentialSession, state.credentialSessionExpiresAt, pull, sync, effectiveSupabaseSession, userEmail]);

  // One-shot migration: fold legacy per-spot itinerary overrides (personal memo layer)
  // into the trip itinerary so they survive AI updates and reach shared-trip members.
  // Viewers keep the old local-only behaviour — they can't push trip changes.
  useEffect(() => {
    if (!isStorageReady) return;
    setState((prev) => {
      if (!Object.keys(prev.itineraryOverrides || {}).length) return prev;
      if (activeTrip(prev).sharing?.role === 'viewer') return prev;
      const baked = bakeItineraryOverrides(prev);
      if (!baked) return prev;
      console.log('[App] Baking itinerary overrides into trip itinerary (one-shot migration)');
      return { ...applyItineraryEdit(prev, baked), itineraryOverrides: {} };
    });
  }, [isStorageReady, setState]);

  // Auto-connect Notion for Boss when Supabase session is available
  useEffect(() => {
    if (!hasSupabaseSession(supabaseAuth.session)) return;
    if (state.personalNotionConnected) return;
    if (!isBoss(userEmail)) return;

    const DEFAULT_NOTION_DB = '3438d94d5f7c81878221fcda6d65d39d';
    const needsDb = !state.notionDb || state.notionDb !== DEFAULT_NOTION_DB;
    const needsSync = !state.autoSync;

    if (needsDb || needsSync) {
      console.log('[App] Auto-connecting Notion for Boss...');
      const patch: Record<string, unknown> = {};
      if (needsDb) patch.notionDb = DEFAULT_NOTION_DB;
      if (needsSync) patch.autoSync = true;
      updateState(patch as Partial<AppState>);
      console.log('[App] Notion auto-connected:', { notionDb: DEFAULT_NOTION_DB, autoSync: true });
    }
  }, [supabaseAuth.session, state.personalNotionConnected, state.notionDb, state.autoSync, userEmail, updateState]);

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

  const fxTier = useEffectsTier();

  // Windmill Motion Layer: page content swings like a windmill blade / pendulum around a
  // hub anchored below the screen (transformOrigin '50% 130%' on the motion.div). Rotation
  // alone (no x translation) produces the horizontal travel feel, and stays compositor-only
  // (rotate + opacity), which is why this replaced the old x-slide. full = desktop ±18deg
  // spring; balanced (phones) = ±14deg shorter spring (≤250ms perceived); lite = instant swap.
  const windmillAngle = fxTier === 'full' ? 18 : 14;
  const windmillVariants = {
    enter: (dir: number) => ({
      rotate: dir > 0 ? windmillAngle : dir < 0 ? -windmillAngle : 0,
      opacity: 0,
    }),
    center: {
      rotate: 0,
      opacity: 1,
    },
    exit: (dir: number) => ({
      rotate: dir > 0 ? -windmillAngle : dir < 0 ? windmillAngle : 0,
      opacity: 0,
    }),
  };
  const windmillTransition = fxTier === 'full'
    ? { rotate: { type: 'spring' as const, stiffness: 380, damping: 38, mass: 1 }, opacity: { duration: 0.15 } }
    : { rotate: { type: 'spring' as const, stiffness: 420, damping: 40, mass: 0.9 }, opacity: { duration: 0.12 } };

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
      <Shell active={safeTab} onTab={changeTab} syncState={syncEngine.engineState} onRetryFailed={handleSyncRetry} state={state} setState={setState} updateState={updateState} onPull={syncEngine.pull} onOpenNewTripWizard={() => setIsNewTripWizardOpen(true)}>
        {(() => {
              // Single source of truth for tab content — previously duplicated verbatim in the
              // animated and non-animated branches, which invited drift.
              const tabContent = (
                <>
                  {safeTab === 'dashboard' && <Dashboard state={state} setState={setState} updateState={updateState} onOpen={setEditing} onTab={changeTab} onManual={() => setEditing(null)} isWizardOpen={isNewTripWizardOpen} setIsWizardOpen={setIsNewTripWizardOpen} />}
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
                      updateState={updateState}
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
                  {safeTab === 'stats' && <Stats state={state} setState={setState} updateState={updateState} onTab={changeTab} />}
                  {safeTab === 'settings' && <Settings state={state} setState={setState} updateState={updateState} onReset={resetLocal} syncState={syncEngine.engineState} onPull={syncEngine.pull} onPush={syncEngine.push} onPushSettings={syncEngine.pushSettings} cloudSyncAvailable={isCloudSyncActive} storageScope={storageScope} supabaseAccountId={effectiveSupabaseSession?.user?.id || ''} supabaseSessionExpiresAt={(effectiveSupabaseSession?.expires_at || 0) * 1000} changeTab={changeTab} updatePassword={supabaseAuth.updatePassword} userEmail={userEmail} onSignOut={supabaseAuth.signOut} onClearDeviceData={clearSupabaseDeviceData} />}
                </>
              );
              // The keyed ErrorBoundary must live INSIDE the motion.div: when it wrapped
              // AnimatePresence, every tab switch remounted AnimatePresence itself, and with
              // initial={false} no enter/exit animation ever ran — the "transition never
              // shows" bug.
              const bounded = (
                <ErrorBoundary key={safeTab}>
                  <Suspense fallback={<TabSkeleton label="載入分頁" />}>{tabContent}</Suspense>
                </ErrorBoundary>
              );
              if (fxTier === 'lite') {
                return <div className="w-full h-full">{bounded}</div>;
              }
              return (
                <div className="w-full h-full" style={{ overflow: 'hidden' }}>
                  <AnimatePresence mode="wait" initial={false}>
                    <motion.div
                      key={safeTab}
                      custom={direction}
                      variants={windmillVariants}
                      initial="enter"
                      animate="center"
                      exit="exit"
                      transition={windmillTransition}
                      className="w-full h-full will-change-transform"
                      style={{ backfaceVisibility: 'hidden', transformOrigin: '50% 130%' }}
                    >
                      {bounded}
                    </motion.div>
                  </AnimatePresence>
                </div>
              );
        })()}
        <ErrorBoundary>
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
              const rawItinerary = Array.isArray(trip.itinerary) ? trip.itinerary : [];
              let itinerary = rawItinerary.map((day) => ({ ...day, spots: day.spots.map((spot) => ({ ...spot })) }));
              if (!itinerary.length) {
                const fallbackDate = receipt.date || trip.startDate || prev.tripDateRange.start || new Date().toISOString().slice(0, 10);
                itinerary = [{
                  id: stableDayId(trip.id, fallbackDate),
                  dayId: stableDayId(trip.id, fallbackDate),
                  date: fallbackDate,
                  day: 1,
                  region: trip.destinationSummary || 'Trip',
                  timezone: trip.timezones?.[0] || 'Asia/Hong_Kong',
                  currency: trip.currencies?.find((c) => c !== 'HKD') || prev.tripCurrency || 'JPY',
                  spots: [],
                }];
              }
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
    // isStorageReady (not isHydratingScope) is the correct gate here: isHydratingScope flips false
    // right after the synchronous localStorage read, before the async IndexedDB merge lands, letting
    // the app render with a pre-merge (possibly stale/incomplete) snapshot for one paint. isStorageReady
    // additionally waits for indexedReadyScope, matching how showGuide already gates below.
    if (hasSupabaseSession(supabaseAuth.session) && !isStorageReady) {
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
