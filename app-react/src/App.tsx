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
import { AuthGate } from './security/AuthGate';

const Dashboard = lazy(() => import('./tabs/Dashboard').then((module) => ({ default: module.Dashboard })));
const Scan = lazy(() => import('./tabs/Scan').then((module) => ({ default: module.Scan })));
const Timeline = lazy(() => import('./tabs/Timeline').then((module) => ({ default: module.Timeline })));
const History = lazy(() => import('./tabs/History').then((module) => ({ default: module.History })));
const Weather = lazy(() => import('./tabs/Weather').then((module) => ({ default: module.Weather })));
const Stats = lazy(() => import('./tabs/Stats').then((module) => ({ default: module.Stats })));
const Settings = lazy(() => import('./tabs/Settings').then((module) => ({ default: module.Settings })));

export function App() {
  const { state, setState, updateState, upsertReceipt, deleteReceipt, resetLocal } = useAppState();
  const syncEngine = useSyncEngine(state, setState);
  const { pull, sync } = syncEngine;
  const [tab, setTab] = useState<TabId>(state.lastTab || 'dashboard');
  const [editing, setEditing] = useState<Receipt | null | undefined>(undefined);
  const bootSyncInitiated = useRef(false);
  const receiptCountRef = useRef(state.receipts.length);
  receiptCountRef.current = state.receipts.length;

  useEffect(() => {
    if (state.lastTab && state.lastTab !== tab) setTab(state.lastTab);
    // We only want hydration to restore the last tab once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.lastTab]);

  useEffect(() => {
    if (bootSyncInitiated.current) return;
    if (!navigator.onLine) return;
    if (!hasCredentialBrokerSession(state) && !hasDirectNotionToken()) return;

    bootSyncInitiated.current = true;

    const timer = window.setTimeout(() => {
      if (receiptCountRef.current === 0) {
        console.log('[App] Boot pull — no local receipts, fetching from Notion');
        void pull();
      } else {
        console.log('[App] Boot sync — existing local data');
        void sync();
      }
    }, 800);
    return () => window.clearTimeout(timer);
  }, [state.credentialSession, state.credentialSessionExpiresAt, pull, sync]);

  const changeTab = (next: TabId) => {
    setTab(next);
    updateState({ lastTab: next });
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
        if (!bootSyncInitiated.current) {
          bootSyncInitiated.current = true;
          window.setTimeout(() => {
            if (receiptCountRef.current === 0) {
              console.log('[App] Boot pull (unlocked) — no local receipts, fetching from Notion');
              void pull();
            } else {
              console.log('[App] Boot sync (unlocked) — existing local data');
              void syncEngine.sync();
            }
          }, 500);
        }
      }}
    >
      <Shell active={tab} onTab={changeTab} syncState={syncEngine.engineState}>
        <ErrorBoundary>
          <Suspense fallback={<LoadingState label="載入分頁" />}>
            {tab === 'dashboard' && <Dashboard state={state} onOpen={setEditing} onTab={changeTab} onManual={() => setEditing(null)} />}
            {tab === 'scan' && (
              <Scan
                state={state}
                onManual={() => setEditing(null)}
                onDraft={setEditing}
                onImport={importReceipts}
              />
            )}
            {tab === 'timeline' && <Timeline state={state} setState={setState} onOpen={setEditing} />}
            {tab === 'history' && (
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
            {tab === 'weather' && <Weather state={state} />}
            {tab === 'stats' && <Stats state={state} updateState={updateState} />}
            {tab === 'settings' && <Settings state={state} setState={setState} updateState={updateState} onReset={resetLocal} syncState={syncEngine.engineState} onPull={syncEngine.pull} onPush={syncEngine.push} />}
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
