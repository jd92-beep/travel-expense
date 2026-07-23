import { DEFAULT_STATE, isBoss } from './constants';
import { migrateAppState } from '../domain/trip/normalize';
import { loadIndexedState, saveIndexedState } from '../storage/indexedDb';
import {
  loadCredentials,
  loadStoredSnapshot,
  normalizeState,
  saveStoredSnapshot,
  stripSensitiveState,
} from './storage';
import { canonicalReceiptKey, canonicalTombstoneWins } from './receiptTombstones';
import type { AppState, Receipt, ReceiptTombstone } from './types';

export type SnapshotAdapter = {
  load(scope: string): Promise<unknown | null>;
  save(scope: string, state: AppState): Promise<void>;
};

export type PersistResult = {
  localStorage: 'succeeded' | 'failed';
  indexedDb: 'succeeded' | 'failed';
  status: 'succeeded' | 'degraded' | 'failed';
  error: string;
};

const snapshot = (value: unknown): Partial<AppState> | null =>
  value && typeof value === 'object' && !Array.isArray(value) ? value as Partial<AppState> : null;

const receiptsOf = (state: Partial<AppState>) =>
  Array.isArray(state.receipts) ? state.receipts : [];

const tombstonesOf = (state: Partial<AppState>): ReceiptTombstone[] =>
  state.receiptTombstones && typeof state.receiptTombstones === 'object'
    ? Object.values(state.receiptTombstones)
    : [];

function sanitizeSnapshot(value: unknown): Partial<AppState> | null {
  const state = snapshot(value);
  if (!state) return null;
  const { credentialBrokerUrl: _credentialBrokerUrl, ...safe } = stripSensitiveState(state);
  return safe;
}

const freshness = (state: Partial<AppState>) => Math.max(
  Number(state.settingsUpdatedAt || 0),
  Number(state.lastSyncedAt || 0),
  ...receiptsOf(state).map((receipt) =>
    Number(receipt.updatedAt || receipt.createdAt || 0)),
  ...tombstonesOf(state).map((tombstone) => Number(tombstone.deletedAt || 0)),
);

function mergeReceipts(primary: Receipt[], secondary: Receipt[]): Receipt[] {
  const merged = new Map(primary.map((receipt) => [receipt.id, receipt]));
  for (const receipt of secondary) {
    const current = merged.get(receipt.id);
    if (!current || Number(receipt.updatedAt || receipt.createdAt || 0)
      > Number(current.updatedAt || current.createdAt || 0)) {
      merged.set(receipt.id, receipt);
    }
  }
  return [...merged.values()];
}

function mergeTrips(primary: AppState['trips'], secondary: AppState['trips']): NonNullable<AppState['trips']> {
  const merged = new Map((primary || []).map((trip) => [trip.id, trip]));
  for (const trip of secondary || []) {
    if (!merged.has(trip.id)) merged.set(trip.id, trip);
  }
  return [...merged.values()];
}

function mergeTombstones(
  primary: ReceiptTombstone[],
  secondary: ReceiptTombstone[],
): Record<string, ReceiptTombstone> {
  const merged = new Map<string, ReceiptTombstone>();
  for (const tombstone of [...primary, ...secondary]) {
    const key = canonicalReceiptKey({ id: tombstone.supabaseId, ...tombstone });
    if (!key) continue;
    const current = merged.get(key);
    if (!current
      || Number(tombstone.deletedAt || 0) > Number(current.deletedAt || 0)
      || Number(tombstone.deletedAt || 0) === Number(current.deletedAt || 0)
        && Number(tombstone.syncRevision || 0) > Number(current.syncRevision || 0)) {
      merged.set(key, tombstone);
    }
  }
  return Object.fromEntries(merged);
}

function resolveReceiptTombstones(
  receipts: Receipt[],
  tombstones: Record<string, ReceiptTombstone>,
): { receipts: Receipt[]; tombstones: Record<string, ReceiptTombstone> } {
  const nextTombstones = { ...tombstones };
  const activeReceipts = receipts.filter((receipt) => {
    const key = canonicalReceiptKey(receipt);
    const tombstone = nextTombstones[key];
    if (!tombstone) return true;
    const receiptIsNewer = Number(receipt.updatedAt || receipt.createdAt || 0) > Number(tombstone.deletedAt || 0);
    if (receiptIsNewer && !canonicalTombstoneWins(nextTombstones, receipt)) {
      delete nextTombstones[key];
      return true;
    }
    return false;
  });
  return { receipts: activeReceipts, tombstones: nextTombstones };
}

export function sanitizePublicDemoState(state: AppState, scope: string, userEmail: string | null): AppState {
  if (!scope.startsWith('supabase:') || isBoss(userEmail)) return state;
  const trips = (state.trips || []).filter((trip) => trip.id !== DEFAULT_STATE.activeTripId);
  const activeTripId = trips.find((trip) => trip.id === state.activeTripId && !trip.archived)?.id
    || trips.find((trip) => trip.active && !trip.archived)?.id
    || trips.find((trip) => !trip.archived)?.id
    || '';
  const active = trips.find((trip) => trip.id === activeTripId);
  return {
    ...state,
    trips: trips.map((trip) => ({
      ...trip,
      active: trip.id === activeTripId && !trip.archived,
    })),
    receipts: state.receipts.filter((receipt) => receipt.tripId !== DEFAULT_STATE.activeTripId),
    activeTripId,
    tripName: active?.name || (trips.length ? state.tripName : ''),
    tripDateRange: active
      ? { start: active.startDate, end: active.endDate }
      : state.tripDateRange,
    customItinerary: active?.itinerary || (trips.length ? state.customItinerary : null),
  };
}

export function createScopedPersistence(
  local: SnapshotAdapter,
  indexed: SnapshotAdapter,
) {
  return {
    async hydrateScope(scope: string, userEmail: string | null): Promise<AppState> {
      const [localResult, indexedResult] = await Promise.allSettled([
        local.load(scope),
        indexed.load(scope),
      ]);
      const localValue = localResult.status === 'fulfilled' ? localResult.value : null;
      const indexedValue = indexedResult.status === 'fulfilled' ? indexedResult.value : null;
      const localState = sanitizeSnapshot(localValue);
      const indexedState = sanitizeSnapshot(indexedValue);
      const newest = localState && indexedState
        ? freshness(indexedState) > freshness(localState) ? indexedState : localState
        : localState || indexedState || DEFAULT_STATE;
      const other = newest === localState ? indexedState : localState;
      const receiptTombstones = mergeTombstones(
        tombstonesOf(newest),
        tombstonesOf(other || {}),
      );
      const resolved = resolveReceiptTombstones(
        mergeReceipts(receiptsOf(newest), receiptsOf(other || {})),
        receiptTombstones,
      );
      const merged = other
        ? {
            ...other,
            ...newest,
            receipts: resolved.receipts,
            receiptTombstones: resolved.tombstones,
            trips: mergeTrips(newest.trips, other.trips),
          }
        : { ...newest, receipts: resolved.receipts, receiptTombstones: resolved.tombstones };
      const credentials = scope === 'local' ? loadCredentials() : {};
      return sanitizePublicDemoState(normalizeState(migrateAppState({
        ...merged,
        ...credentials,
      })), scope, userEmail);
    },
    async persistScope(
      scope: string,
      _userEmail: string | null,
      state: AppState,
    ): Promise<PersistResult> {
      const safe = stripSensitiveState(migrateAppState(state));
      const [localResult, indexedResult] = await Promise.allSettled([
        local.save(scope, safe),
        indexed.save(scope, safe),
      ]);
      const localStorage = localResult.status === 'fulfilled' ? 'succeeded' : 'failed';
      const indexedDb = indexedResult.status === 'fulfilled' ? 'succeeded' : 'failed';
      const status = localStorage === 'succeeded' && indexedDb === 'succeeded'
        ? 'succeeded'
        : localStorage === 'succeeded' || indexedDb === 'succeeded'
          ? 'degraded'
          : 'failed';
      const error = [
        localResult.status === 'rejected' ? 'localStorage write failed' : '',
        indexedResult.status === 'rejected' ? 'IndexedDB write failed' : '',
      ].filter(Boolean).join('; ');
      return { localStorage, indexedDb, status, error };
    },
  };
}

const browserPersistence = createScopedPersistence(
  {
    async load(scope) { return loadStoredSnapshot(scope); },
    async save(scope, state) { saveStoredSnapshot(state, scope); },
  },
  {
    load: loadIndexedState,
    async save(scope, state) { await saveIndexedState(state, scope); },
  },
);

export const hydrateScope = browserPersistence.hydrateScope;
export const persistScope = browserPersistence.persistScope;
