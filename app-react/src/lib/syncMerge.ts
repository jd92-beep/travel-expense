import { activeTrip, stampReceiptForTrip } from '../domain/trip/normalize';
import type { AppState, Receipt, TripProfile } from './types';

const stampForRemote = (state: AppState, receipt: Receipt) => stampReceiptForTrip(state, receipt, { preserveUpdatedAt: true });

export function receiptSourceTombstoneKey(receipt: Pick<Receipt, 'id' | 'sourceId' | 'tripId'>): string {
  const sourceId = receipt.sourceId || receipt.id;
  return receipt.tripId ? `${receipt.tripId}::${sourceId}` : sourceId;
}

export function rawReceiptSourceId(value: unknown, tripId?: string): string {
  const text = String(value || '').trim();
  const tripPrefix = tripId ? `${tripId}::` : '';
  if (tripPrefix && text.startsWith(tripPrefix)) return text.slice(tripPrefix.length);
  const scopedIdx = text.indexOf('::');
  return scopedIdx >= 0 ? text.slice(scopedIdx + 2) : text;
}

function receiptTripSourceKey(receipt: Pick<Receipt, 'id' | 'sourceId' | 'tripId'>): string {
  const sourceId = rawReceiptSourceId(receipt.sourceId || receipt.id, receipt.tripId);
  return receipt.tripId && sourceId ? `${receipt.tripId}::${sourceId}` : '';
}

function receiptUpdatedAt(receipt: Receipt, isLocal = false) {
  return Number(receipt.updatedAt || receipt.createdAt || (isLocal ? Date.now() : 0));
}

function tripUpdatedAt(trip: TripProfile, isLocal = false) {
  return Number(trip.updatedAt || trip.createdAt || (isLocal ? Date.now() : 0));
}

export function isReceiptTombstoned(
  state: Pick<AppState, 'notionDeletedIds' | 'notionDeletedSourceIds' | 'trips'>,
  receipt: Pick<Receipt, 'id' | 'sourceId' | 'notionPageId' | 'tripId'>,
) {
  const deletedSourceIds = state.notionDeletedSourceIds || [];
  const sourceId = receipt.sourceId || receipt.id;
  const hasMultipleTrips = Array.isArray(state.trips) && state.trips.filter((trip) => !trip.archived).length > 1;
  const rawLegacyMatchAllowed = !hasMultipleTrips || !receipt.tripId;
  return !!(
    receipt.notionPageId && state.notionDeletedIds?.includes(receipt.notionPageId)
    || deletedSourceIds.includes(receiptSourceTombstoneKey(receipt))
    || rawLegacyMatchAllowed && sourceId && deletedSourceIds.includes(sourceId)
  );
}

export function mergePulledReceipts(state: AppState, pulledReceipts: Receipt[]): Receipt[] {
  const byId = new Map(state.receipts.map((receipt) => [receipt.id, receipt]));
  const idBySupabaseId = new Map(
    state.receipts
      .filter((receipt) => receipt.supabaseId)
      .map((receipt) => [receipt.supabaseId as string, receipt.id]),
  );
  const idByPageId = new Map(
    state.receipts
      .filter((receipt) => receipt.notionPageId)
      .map((receipt) => [receipt.notionPageId as string, receipt.id]),
  );
  const idByTripSource = new Map(
    state.receipts
      .map((receipt) => [receiptTripSourceKey(receipt), receipt.id] as const)
      .filter(([key]) => key),
  );
  for (const remoteReceipt of pulledReceipts) {
    if (isReceiptTombstoned(state, remoteReceipt)) continue;
    const tripSourceKey = receiptTripSourceKey(remoteReceipt);
    const matchedId = byId.has(remoteReceipt.id)
      ? remoteReceipt.id
      : (remoteReceipt.supabaseId ? idBySupabaseId.get(remoteReceipt.supabaseId) : undefined)
        || (remoteReceipt.notionPageId ? idByPageId.get(remoteReceipt.notionPageId) : undefined)
        || idByTripSource.get(tripSourceKey);
    const localReceipt = matchedId ? byId.get(matchedId) : undefined;
    if (!localReceipt) {
      byId.set(remoteReceipt.id, stampForRemote(state, { ...remoteReceipt, syncStatus: 'synced' }));
      if (remoteReceipt.supabaseId) idBySupabaseId.set(remoteReceipt.supabaseId, remoteReceipt.id);
      if (remoteReceipt.notionPageId) idByPageId.set(remoteReceipt.notionPageId, remoteReceipt.id);
      if (tripSourceKey) idByTripSource.set(tripSourceKey, remoteReceipt.id);
      continue;
    }
    const localUpdated = receiptUpdatedAt(localReceipt, true);
    const remoteUpdated = receiptUpdatedAt(remoteReceipt, false);
    const remoteHasMissingLink = !localReceipt.notionPageId && !!remoteReceipt.notionPageId
      || !localReceipt.sourceId && !!remoteReceipt.sourceId;
    const photoUrlChanged = !!remoteReceipt.photoUrl && remoteReceipt.photoUrl !== localReceipt.photoUrl;
    if (remoteUpdated > localUpdated || (remoteUpdated === localUpdated && remoteHasMissingLink) || photoUrlChanged) {
      byId.set(localReceipt.id, stampForRemote(state, {
        ...localReceipt,
        ...remoteReceipt,
        id: localReceipt.id,
        photoThumb: localReceipt.photoThumb || remoteReceipt.photoThumb,
        photoUrl: remoteReceipt.photoUrl || localReceipt.photoUrl,
        syncStatus: 'synced',
      }));
      if (remoteReceipt.supabaseId) idBySupabaseId.set(remoteReceipt.supabaseId, localReceipt.id);
      if (remoteReceipt.notionPageId) idByPageId.set(remoteReceipt.notionPageId, localReceipt.id);
      if (tripSourceKey) idByTripSource.set(tripSourceKey, localReceipt.id);
    }
  }
  return [...byId.values()];
}

export function mergePulledTrips(state: AppState, pulledTrips: TripProfile[]) {
  const fallbackTrips = state.trips?.length ? state.trips : (pulledTrips.length ? [activeTrip(state)] : []);
  const byId = new Map(fallbackTrips.map((trip) => [trip.id, trip]));
  let activeTripId = state.activeTripId;
  for (const remoteTrip of pulledTrips) {
    const localTrip = byId.get(remoteTrip.id);
    const remoteUpdated = tripUpdatedAt(remoteTrip);
    const localUpdated = localTrip ? tripUpdatedAt(localTrip) : 0;
    const remoteHasMissingLink = localTrip
      ? (!localTrip.notionPageId && !!remoteTrip.notionPageId) || (!localTrip.sourceId && !!remoteTrip.sourceId)
      : true;
    if (!localTrip || remoteUpdated > localUpdated || (remoteUpdated === localUpdated && remoteHasMissingLink)) {
      byId.set(remoteTrip.id, {
        ...localTrip,
        ...remoteTrip,
        itinerary: remoteTrip.itinerary?.length ? remoteTrip.itinerary : localTrip?.itinerary || remoteTrip.itinerary || [],
      });

    }
  }
  return {
    trips: [...byId.values()],
    activeTripId,
  };
}

export function mergePulledData(state: AppState, pulledReceipts: Receipt[], pulledTrips: TripProfile[] = []): AppState {
  const { trips, activeTripId } = mergePulledTrips(state, pulledTrips);
  const baseState = { ...state, trips, activeTripId };
  return {
    ...baseState,
    receipts: mergePulledReceipts(baseState, pulledReceipts),
  };
}
