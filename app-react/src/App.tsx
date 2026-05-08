import { useEffect, useState } from 'react';
import { ErrorBoundary } from './app/ErrorBoundary';
import { ReceiptEditor } from './components/ReceiptEditor';
import { Shell } from './components/Shell';
import { activeTrip, stampReceiptForTrip, stableSpotId } from './domain/trip/normalize';
import { hasCredentialBrokerSession } from './lib/credentialBroker';
import { archiveReceipt, pushReceipt } from './lib/notion';
import { useAppState } from './lib/useAppState';
import type { Receipt, SyncQueueItem, TabId, TripProfile } from './lib/types';
import { AuthGate } from './security/AuthGate';
import { Dashboard } from './tabs/Dashboard';
import { History } from './tabs/History';
import { Scan } from './tabs/Scan';
import { Settings } from './tabs/Settings';
import { Stats } from './tabs/Stats';
import { Timeline } from './tabs/Timeline';
import { Weather } from './tabs/Weather';

export function App() {
  const { state, setState, updateState, upsertReceipt, deleteReceipt, resetLocal } = useAppState();
  const [tab, setTab] = useState<TabId>(state.lastTab || 'dashboard');
  const [editing, setEditing] = useState<Receipt | null | undefined>(undefined);

  useEffect(() => {
    if (state.lastTab && state.lastTab !== tab) setTab(state.lastTab);
    // We only want hydration to restore the last tab once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.lastTab]);

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
    setState((prev) => {
      const tripMap = new Map((prev.trips?.length ? prev.trips : [activeTrip(prev)]).map((trip) => [trip.id, trip]));
      let activeTripId = prev.activeTripId;
      for (const trip of trips) {
        tripMap.set(trip.id, { ...tripMap.get(trip.id), ...trip });
        if (trip.active && !trip.archived) activeTripId = trip.id;
      }
      const mergedTrips = [...tripMap.values()];
      const baseState = { ...prev, activeTripId, trips: mergedTrips };
      const byId = new Map(prev.receipts.map((receipt) => [receipt.id, receipt]));
      for (const receipt of receipts) {
        const stamped = stampReceiptForTrip(baseState, { ...byId.get(receipt.id), ...receipt });
        byId.set(receipt.id, stamped);
      }
      return { ...baseState, receipts: [...byId.values()] };
    });
  };

  return (
    <AuthGate
      credentialBrokerUrl={state.credentialBrokerUrl}
      onBrokerSession={(session) => updateState(session)}
      onUnlocked={() => changeTab('dashboard')}
    >
      <Shell active={tab} onTab={changeTab}>
        <ErrorBoundary>
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
            const next = stampReceiptForTrip(state, { ...receipt, store: receipt.store.replace(/^⏳\s*/, ''), syncStatus: hasCredentialBrokerSession(state) ? 'queued' : 'local' });
            upsertReceipt(next);
            if (state.autoSync && hasCredentialBrokerSession(state)) pushReceipt(state, next).catch(console.warn);
          }}
        />
      )}
      {tab === 'weather' && <Weather state={state} />}
      {tab === 'stats' && <Stats state={state} updateState={updateState} />}
      {tab === 'settings' && <Settings state={state} setState={setState} updateState={updateState} onReset={resetLocal} />}
      {editing !== undefined && (
        <ReceiptEditor
          state={state}
          receipt={editing}
          onCancel={() => setEditing(undefined)}
          onSave={(receipt) => {
            const stamped = stampReceiptForTrip(state, receipt);
            upsertReceipt(stamped);
            if (state.autoSync && hasCredentialBrokerSession(state)) pushReceipt(state, stamped).then((synced) => upsertReceipt({ ...synced, syncStatus: 'synced' })).catch(console.warn);
            setEditing(undefined);
          }}
          onDelete={(receipt) => {
            deleteReceipt(receipt);
            if (state.autoSync && hasCredentialBrokerSession(state)) archiveReceipt(state, receipt).catch(console.warn);
            setEditing(undefined);
          }}
          onAddToItinerary={(receipt) => {
            setState((prev) => {
              const trip = activeTrip(prev);
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
              const trips = (prev.trips || []).map((item) => item.id === trip.id ? { ...item, itinerary, version: item.version + 1, updatedAt: Date.now() } : item);
              const queue: SyncQueueItem = {
                id: `sync_${Date.now()}_${Math.random().toString(16).slice(2)}`,
                type: 'trip',
                entityId: trip.id,
                op: 'update',
                status: 'queued',
                attempts: 0,
                createdAt: Date.now(),
                updatedAt: Date.now(),
              };
              return { ...prev, trips, customItinerary: itinerary, syncQueue: [...(prev.syncQueue || []), queue].slice(-500) };
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
