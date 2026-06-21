import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { ErrorBoundary } from './app/ErrorBoundary';
import { ReceiptEditor } from './components/ReceiptEditor';
import { Shell } from './components/Shell';
import { LoadingState } from './components/ui';
import { Loader2 } from 'lucide-react';
import { activeTrip, stampReceiptForTrip, stableDayId, stableSpotId } from './domain/trip/normalize';
import { addDaysYmd, processRecurringRules, todayYmd } from './lib/domain';
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
import { shouldDisableHeavyEffects } from './lib/performance';
import { acceptSupabaseTripInvite, createSupabaseTripInvite, handleNativeAuthRedirectUrl, hasSupabaseSession, useSupabaseAuth } from './lib/supabase';
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

function storedSupabaseSession(): Session | null {
  try {
    const raw = localStorage.getItem('travel-expense:supabase-auth:v1');
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!(parsed?.user?.id && parsed?.access_token)) return null;
    // Reject an expired stored session so the app doesn't render as "cloud sync active" against a
    // dead token (which would just spew auth-failed sync items). supabaseAuth refreshes the real one.
    const expEpoch = Number(parsed.expires_at) * 1000;
    if (Number.isFinite(expEpoch) && expEpoch > 0 && expEpoch <= Date.now()) return null;
    return parsed as Session;
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
  // Stable ref so the mount-once native deep-link effect doesn't re-run when updateState's identity
  // changes on login (storageScope flip) — re-running would re-drain the single-use PKCE launch URL.
  const updateStateRef = useRef(updateState);
  updateStateRef.current = updateState;

  const [globalOcrBusy, setGlobalOcrBusy] = useState('');
  const [batch, setBatch] = useState<Array<Receipt & { selected?: boolean }>>([]);
  const [skippedGuide, setSkippedGuide] = useState(false);
  const [isNewTripWizardOpen, setIsNewTripWizardOpen] = useState(false);
  const [acceptedInviteToken, setAcceptedInviteToken] = useState('');
  const bootSyncKeys = useRef(new Set<string>());
  const stateRef = useRef(state);
  stateRef.current = state;

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const capacitor = (window as Window & {
      Capacitor?: {
        getPlatform?: () => string;
        isNativePlatform?: () => boolean;
      };
    }).Capacitor;
    const nativeAndroid = capacitor?.getPlatform?.() === 'android'
      || (!!capacitor?.isNativePlatform?.() && /android/i.test(window.navigator.userAgent || ''));
    if (!nativeAndroid) return undefined;
    document.body.classList.add('compact-native-android');

    let cancelled = false;
    let removeAppUrlListener: (() => void) | undefined;
    // Dedupe: a cold-start deep link is delivered by BOTH getLaunchUrl() and appUrlOpen.
    // Processing the same URL twice would, under a PKCE flow, fail the single-use code exchange.
    const processedUrls = new Set<string>();

    const processUrl = async (url?: string) => {
      if (!url || processedUrls.has(url)) return;
      processedUrls.add(url);
      try {
        const handled = await handleNativeAuthRedirectUrl(url);
        if (!handled) return;
        try {
          const { Browser } = await import('@capacitor/browser');
          await Browser.close();
        } catch {
          // Android system-browser close is best-effort; auth state is already set.
        }
      } catch (nativeAuthError) {
        console.error('[NativeAuth] Android redirect handling failed:', nativeAuthError);
        updateStateRef.current({
          syncError: nativeAuthError instanceof Error ? nativeAuthError.message : 'Android 登入回跳未成功，請再試一次。',
        });
      }
    };

    void (async () => {
      const { App: CapacitorApp } = await import('@capacitor/app');
      // Register the listener BEFORE draining the launch URL so a deep link arriving
      // during init isn't dropped; the dedupe set guards against double-handling.
      const listener = await CapacitorApp.addListener('appUrlOpen', (event) => {
        void processUrl(event.url);
      });
      if (cancelled) {
        await listener.remove();
        return;
      }
      removeAppUrlListener = () => {
        void listener.remove();
      };
      const launch = await CapacitorApp.getLaunchUrl().catch(() => null);
      await processUrl(launch?.url);
    })().catch((nativeAuthInitError) => {
      console.warn('[NativeAuth] Android listener unavailable:', nativeAuthInitError);
    });

    return () => {
      cancelled = true;
      document.body.classList.remove('compact-native-android');
      removeAppUrlListener?.();
    };
    // Mount-once: updateState is read via updateStateRef so a login-time identity change can't
    // re-run this effect and re-process the single-use launch URL.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
    const today = todayYmd();
    const end = addDaysYmd(today, 5);
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
    !isHydratingScope &&
    !skippedGuide;

  const syncEngine = useSyncEngine(state, setState, supabaseAuth.session);
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
    let alive = true;
    fetchBootCurrencySnapshot().then(snapshot => {
      if (!alive) return;
      if (snapshot.rates.JPY) {
        setState((current) => ({ ...current, ...appRatePatchFromSnapshot(snapshot) }));
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
  }, [isHydratingScope, state.credentialSession, state.credentialSessionExpiresAt, pull, sync, supabaseAuth.session]);

  // Process recurring rules once the scope's state has finished hydrating (localStorage is sync but
  // IndexedDB merges async — running on bare mount could miss rules that arrive from IndexedDB).
  // processRecurringRules is idempotent (it advances nextRun), so a re-run after a scope change is safe.
  useEffect(() => {
    if (isHydratingScope || !state.recurringRules?.length) return;
    const { receipts: newReceipts, updatedRules } = processRecurringRules(state);
    if (newReceipts.length) {
      // Route through upsertReceipt so each spawned receipt is stamped + enqueued for cloud sync —
      // updateState only queues settings, so the old path left recurring receipts local-only.
      newReceipts.forEach((r) => upsertReceipt(r));
      updateState({ recurringRules: updatedRules });
      console.log(`[App] Recurring: spawned ${newReceipts.length} receipt(s) from ${updatedRules.length} rule(s)`);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isHydratingScope]);

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

  const editingRef = useRef(editing);
  editingRef.current = editing;
  const wizardOpenRef = useRef(isNewTripWizardOpen);
  wizardOpenRef.current = isNewTripWizardOpen;
  const safeTabRef = useRef(safeTab);
  safeTabRef.current = safeTab;
  const changeTabRef = useRef(changeTab);
  changeTabRef.current = changeTab;

  // Android hardware back button: dismiss an open editor/wizard/overlay → return to the home
  // tab → press-again-to-exit. Native-only (guarded); web/browser back behaviour is untouched.
  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const capacitor = (window as Window & {
      Capacitor?: { getPlatform?: () => string; isNativePlatform?: () => boolean };
    }).Capacitor;
    const nativeAndroid = capacitor?.getPlatform?.() === 'android'
      || (!!capacitor?.isNativePlatform?.() && /android/i.test(window.navigator.userAgent || ''));
    if (!nativeAndroid) return undefined;

    let cancelled = false;
    let removeListener: (() => void) | undefined;
    let exitArmed = false;
    let exitTimer: ReturnType<typeof setTimeout> | undefined;

    const hint = (message: string) => {
      const el = document.createElement('div');
      el.textContent = message;
      el.setAttribute('role', 'status');
      el.style.cssText = 'position:fixed;left:50%;bottom:calc(96px + env(safe-area-inset-bottom));transform:translateX(-50%);z-index:9999;background:rgba(20,20,20,.92);color:#fff;padding:10px 16px;border-radius:999px;font-size:14px;pointer-events:none;transition:opacity .3s;opacity:0';
      document.body.appendChild(el);
      requestAnimationFrame(() => { el.style.opacity = '1'; });
      setTimeout(() => { el.style.opacity = '0'; setTimeout(() => el.remove(), 300); }, 1600);
    };

    void (async () => {
      const { App: CapacitorApp } = await import('@capacitor/app');
      const listener = await CapacitorApp.addListener('backButton', () => {
        // 1) Close the top-most open overlay. The app's modals are custom `.modal-backdrop`
        //    elements whose backdrop onClick dismisses them; click the top-most visible one.
        //    DOM order = stacking order, so the last match is the top-most (a delete-confirm
        //    nested inside the editor closes before the editor itself). getClientRects() is the
        //    visibility test because offsetParent is unreliable for position:fixed elements.
        // Exclude the welcome guide: its backdrop onClick is "skip" which provisions a placeholder
        // trip — hardware-back should not silently commit that. Back falls through to exit instead.
        const backdrops = Array.from(document.querySelectorAll<HTMLElement>('.modal-backdrop:not(.welcome-guide-backdrop)'))
          .filter((el) => el.getClientRects().length > 0);
        if (backdrops.length) { backdrops[backdrops.length - 1].click(); return; }
        // Fallback for any overlay that doesn't use `.modal-backdrop`.
        if (editingRef.current !== undefined) { setEditing(undefined); return; }
        if (wizardOpenRef.current) { setIsNewTripWizardOpen(false); return; }
        // 2) Not on the home tab → go home.
        if (safeTabRef.current !== DEFAULT_LAUNCH_TAB) { changeTabRef.current(DEFAULT_LAUNCH_TAB); return; }
        // 3) Home tab → press back twice within 2s to exit.
        if (exitArmed) { void CapacitorApp.exitApp(); return; }
        exitArmed = true;
        hint('再撳一次返回鍵離開');
        exitTimer = setTimeout(() => { exitArmed = false; }, 2000);
      });
      if (cancelled) { await listener.remove(); return; }
      removeListener = () => { void listener.remove(); };
    })().catch((backButtonError) => {
      console.warn('[BackButton] listener unavailable:', backButtonError);
    });

    return () => {
      cancelled = true;
      if (exitTimer) clearTimeout(exitTimer);
      removeListener?.();
    };
  }, []);

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
      <Shell active={safeTab} onTab={changeTab} syncState={syncEngine.engineState} onRetryFailed={handleSyncRetry} state={state} setState={setState} updateState={updateState} onPull={syncEngine.pull} onOpenNewTripWizard={() => setIsNewTripWizardOpen(true)}>
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
                {safeTab === 'stats' && <Stats state={state} setState={setState} updateState={updateState} onTab={changeTab} upsertReceipt={upsertReceipt} deleteReceipt={deleteReceipt} />}
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
                  {safeTab === 'stats' && <Stats state={state} setState={setState} updateState={updateState} onTab={changeTab} upsertReceipt={upsertReceipt} deleteReceipt={deleteReceipt} />}
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
              const rawItinerary = Array.isArray(trip.itinerary) ? trip.itinerary : [];
              let itinerary = rawItinerary.map((day) => ({ ...day, spots: day.spots.map((spot) => ({ ...spot })) }));
              if (!itinerary.length) {
                const fallbackDate = receipt.date || trip.startDate || prev.tripDateRange.start || todayYmd();
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
                type: receipt.category && receipt.category !== 'settlement' ? receipt.category : 'other',
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
