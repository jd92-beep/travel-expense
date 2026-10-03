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

// Loop instead of Math.max(...spread): a snapshot with tens of thousands of receipts
// exceeds the argument-count limit and throws RangeError, failing hydration entirely.
const freshness = (state: Partial<AppState>) => {
  let newest = Math.max(
    Number(state.settingsUpdatedAt || 0),
    Number(state.lastSyncedAt || 0),
  );
  for (const receipt of receiptsOf(state)) {
    newest = Math.max(newest, Number(receipt.updatedAt || receipt.createdAt || 0));
  }
  for (const tombstone of tombstonesOf(state)) {
    newest = Math.max(newest, Number(tombstone.deletedAt || 0));
  }
  for (const item of [...(state.trips || []), ...(state.syncQueue || [])]) {
    newest = Math.max(newest, Number(item.updatedAt || item.createdAt || 0));
  }
  return newest;
};

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
    const current = merged.get(trip.id);
    if (!current || Number(trip.updatedAt || trip.createdAt || 0) > Number(current.updatedAt || current.createdAt || 0)) merged.set(trip.id, trip);
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
  const demoTripId: string = DEFAULT_STATE.activeTripId || 'trip_2026_04_nagoya';
  const trips = (state.trips || []).filter((trip) => trip.id !== demoTripId);
  const activeTripId = trips.find((trip) => trip.id === state.activeTripId && !trip.archived)?.id
    || trips.find((trip) => trip.active && !trip.archived)?.id
    || trips.find((trip) => !trip.archived)?.id
    || '';
  const active = trips.find((trip) => trip.id === activeTripId);
  // Per-trip maps keyed by the demo trip id carry the demo roster/ratios — drop those keys
  // too, not just the trips array, or public users inherit demo persons on the demo trip.
  const stripDemoKey = <T,>(map: Record<string, T> | undefined): Record<string, T> | undefined => {
    if (!map || typeof map !== 'object') return map;
    if (!(demoTripId in map)) return map;
    const next = { ...map };
    delete next[demoTripId];
    return next;
  };
  return {
    ...state,
    trips: trips.map((trip) => ({
      ...trip,
      active: trip.id === activeTripId && !trip.archived,
    })),
    receipts: state.receipts.filter((receipt) => receipt.tripId !== demoTripId),
    peopleByTripId: stripDemoKey(state.peopleByTripId),
    shareRatiosByTripId: stripDemoKey(state.shareRatiosByTripId),
    activeTripId,
    tripName: active?.name || (trips.length ? state.tripName : ''),
    tripDateRange: active
      ? { start: active.startDate, end: active.endDate }
      : trips.length
        ? state.tripDateRange
        // No surviving trip at all: never keep the demo name/date range/itinerary.
        : { start: '', end: '' },
    customItinerary: active
      ? (active.itinerary || null)
      : (trips.length ? state.customItinerary : null),
  };
}

export function safeInitialState(scope: string, userEmail: string | null): AppState {
  const credentials = scope === 'local' ? loadCredentials() : {};
  // Do NOT load the stored snapshot here: first paint must wait for hydrateScope's
  // canonical localStorage+IndexedDB merge (security: no poisoned pre-hydrate snapshot).
  // rateMode/rate races are handled by waiting for isStorageReady before the boot
  // live-rate fetch, and by settingsUpdatedAt field merge inside hydrateScope.
  return sanitizePublicDemoState(normalizeState(migrateAppState({
    ...DEFAULT_STATE,
    ...credentials,
  })), scope, userEmail);
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
      // Settings (rate/rateMode/theme/…) must follow settingsUpdatedAt, not overall freshness.
      // A debounced IndexedDB write can lag the localStorage mirror; a receipt-only update must
      // not let a stale rateMode/rate clobber the newer fixed-rate choice.
      // Only defined fields participate: a partial snapshot with the higher settingsUpdatedAt
      // but missing e.g. displayCurrency must not blank the value the other side holds.
      const settingsFrom = (localState?.settingsUpdatedAt || 0) >= (indexedState?.settingsUpdatedAt || 0)
        ? localState
        : indexedState;
      const settingsPatch: Partial<AppState> = {};
      if (settingsFrom) {
        const candidates: Array<keyof AppState> = [
          'settingsUpdatedAt',
          'rate',
          'rateMode',
          'rateTable',
          'tripCurrency',
          'budget',
          'themePreference',
          'displayCurrency',
          'statsIncludeTransportLodging',
          'top10IncludeBigItems',
        ];
        for (const key of candidates) {
          const value = (settingsFrom as Partial<AppState>)[key];
          if (value !== undefined) {
            (settingsPatch as Record<string, unknown>)[key] = value;
          }
        }
      }
      const receiptTombstones = mergeTombstones(
        tombstonesOf(newest),
        tombstonesOf(other || {}),
      );
      const resolved = resolveReceiptTombstones(
        mergeReceipts(receiptsOf(newest), receiptsOf(other || {})),
        receiptTombstones,
      );
      const deletedTripIds = [...new Set([...(localState?.deletedTripIds || []), ...(indexedState?.deletedTripIds || [])])];
      const deletedTrips = new Set(deletedTripIds);
      const merged = other
        ? {
            ...other,
            ...newest,
            ...settingsPatch,
            receipts: resolved.receipts.filter((receipt) => !receipt.tripId || !deletedTrips.has(receipt.tripId)),
            receiptTombstones: resolved.tombstones,
            trips: mergeTrips(newest.trips, other.trips).filter((trip) => !deletedTrips.has(trip.id)),
            deletedTripIds,
          }
        : { ...newest, ...settingsPatch, deletedTripIds,
            trips: newest.trips?.filter((trip) => !deletedTrips.has(trip.id)),
            receipts: resolved.receipts.filter((receipt) => !receipt.tripId || !deletedTrips.has(receipt.tripId)), receiptTombstones: resolved.tombstones };
      const credentials = scope === 'local' ? loadCredentials() : {};
      return sanitizePublicDemoState(normalizeState(migrateAppState({
        ...merged,
        ...credentials,
      })), scope, userEmail);
    },
    async persistScope(
      scope: string,
      userEmail: string | null,
      state: AppState,
    ): Promise<PersistResult> {
      // Scrub demo state on the way OUT as well as on hydrate: a public supabase user's
      // snapshot must never carry the demo trip/persons/itinerary, even if demo data
      // leaked into memory (stale pendingPersist, import, or a pre-scrub state object).
      const safe = stripSensitiveState(migrateAppState(
        sanitizePublicDemoState(state, scope, userEmail),
      ));
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
