import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { ErrorBoundary } from './app/ErrorBoundary';
import { ReceiptEditor } from './components/ReceiptEditor';
import { Shell } from './components/Shell';
import { LoadingState } from './components/ui';
import { activeTrip, stampReceiptForTrip, stableSpotId } from './domain/trip/normalize';
import { hasCredentialBrokerSession } from './lib/credentialBroker';
import { hasDirectNotionToken } from './lib/notion';
import { mergePulledData } from './lib/syncMerge';
import { useAppState } from './lib/useAppState';
import { useSyncEngine } from './lib/useSyncEngine';
import type { Receipt, SyncQueueItem, TabId, TripProfile } from './lib/types';
import { TAB_MANIFEST } from './lib/tabs';
import { AuthGate } from './security/AuthGate';
import { HyperframeBackground } from './components/HyperframeBackground';
import { fetchLiveCurrencySnapshot, loadCurrencySnapshot, usableSnapshot, type CurrencySnapshot } from './lib/currency';

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
  const { state, setState, updateState, upsertReceipt, deleteReceipt, resetLocal } = useAppState();
  const syncEngine = useSyncEngine(state, setState);
  const { pull, sync } = syncEngine;
  const [tab, setTab] = useState<TabId>(() => safeTabId((typeof window !== 'undefined' && window.location.hash.slice(1)) || state.lastTab));
  const [editing, setEditing] = useState<Receipt | null | undefined>(undefined);
  const bootSyncScheduledKey = useRef('');
  const lastTabHydrated = useRef(false);
  const receiptCountRef = useRef(state.receipts.length);
  receiptCountRef.current = state.receipts.length;
  const safeTab = safeTabId(tab);

  useEffect(() => {
    const onHash = () => {
      const next = safeTabId(window.location.hash.slice(1));
      setTab(next);
      updateState({ lastTab: next });
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, [updateState]);

  useEffect(() => {
    if (lastTabHydrated.current || window.location.hash.slice(1)) return;
    lastTabHydrated.current = true;
    if (state.lastTab && state.lastTab !== safeTab) setTab(safeTabId(state.lastTab));
  }, [safeTab, state.lastTab]);

  useEffect(() => {
    let alive = true;
    fetchBootCurrencySnapshot().then(snapshot => {
      if (!alive) return;
      if (snapshot.rates.JPY) {
        updateState({ rate: Number(snapshot.rates.JPY.toFixed(4)) });
        console.log('[App] Auto-updated live exchange rate:', snapshot.rates.JPY, 'from', snapshot.source);
      }
    }).catch(() => {
      // Background rate refresh is best-effort; Settings/Scan expose explicit
      // refresh errors when the user asks for a live rate.
    });
    return () => {
      alive = false;
    };
  }, [updateState]);

  useEffect(() => {
    if (!navigator.onLine) return;
    if (!hasCredentialBrokerSession(state) && !hasDirectNotionToken()) return;

    const bootSyncKey = [
      hasCredentialBrokerSession(state) ? `broker:${state.credentialSessionExpiresAt || 0}` : 'direct-token',
      receiptCountRef.current === 0 ? 'pull' : 'sync',
    ].join(':');
    if (bootSyncKeys.has(bootSyncKey) || bootSyncScheduledKey.current === bootSyncKey) return;
    bootSyncScheduledKey.current = bootSyncKey;

    const timer = window.setTimeout(() => {
      bootSyncScheduledKey.current = '';
      if (bootSyncKeys.has(bootSyncKey)) return;
      bootSyncKeys.add(bootSyncKey);
      if (receiptCountRef.current === 0) {
        console.log('[App] Boot pull — no local receipts, fetching from Notion');
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
  }, [state.credentialSession, state.credentialSessionExpiresAt, pull, sync]);

  const changeTab = (next: TabId) => {
    const normalized = safeTabId(next);
    setTab(normalized);
    updateState({ lastTab: normalized });
    const hash = `#${normalized}`;
    if (typeof window !== 'undefined' && window.location.hash !== hash) {
      window.history.pushState(null, '', hash);
    }
  };

  const importReceipts = (receipts: Receipt[]) => {
    setState((prev) => {
      const byId = new Map(prev.receipts.map((receipt) => [receipt.id, receipt]));
      for (const receipt of receipts) {
        const stamped = stampReceiptForTrip(prev, { ...byId.get(receipt.id), ...receipt });
        byId.set(receipt.id, stamped);
      }
      return { ...prev, receipts: [...byId.values()] };
    });
  };

  const importRemoteData = (receipts: Receipt[], trips: TripProfile[] = []) => {
    setState((prev) => mergePulledData(prev, receipts, trips));
  };

  return (
    <AuthGate
      credentialBrokerUrl={state.credentialBrokerUrl}
      onBrokerSession={(session) => updateState(session)}
      onUnlocked={() => {
        changeTab('dashboard');
      }}
    >
      <HyperframeBackground />
      <Shell active={safeTab} onTab={changeTab} syncState={syncEngine.engineState}>
        <ErrorBoundary>
          <Suspense fallback={<LoadingState label="載入分頁" />}>
            {safeTab === 'dashboard' && <Dashboard state={state} onOpen={setEditing} onTab={changeTab} onManual={() => setEditing(null)} />}
            {safeTab === 'scan' && (
              <Scan
                state={state}
                onManual={() => setEditing(null)}
                onDraft={setEditing}
                onImport={importReceipts}
              />
            )}
            {safeTab === 'timeline' && <Timeline state={state} setState={setState} onOpen={setEditing} />}
            {safeTab === 'history' && (
              <History
                state={state}
                onOpen={setEditing}
                onImport={importReceipts}
                onHydrate={importRemoteData}
                onConfirmPending={(receipt) => {
                  const next = stampReceiptForTrip(state, { ...receipt, store: receipt.store.replace(/^⏳\s*/, ''), syncStatus: (hasCredentialBrokerSession(state) || hasDirectNotionToken()) ? 'queued' : 'local' });
                  upsertReceipt(next);
                }}
                onPull={syncEngine.pull}
              />
            )}
            {safeTab === 'weather' && <Weather state={state} />}
            {safeTab === 'stats' && <Stats state={state} updateState={updateState} />}
            {safeTab === 'settings' && <Settings state={state} setState={setState} updateState={updateState} onReset={resetLocal} syncState={syncEngine.engineState} onPull={syncEngine.pull} onPush={syncEngine.push} />}
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
    </AuthGate>
  );
}
