import { activeTrip, stampReceiptForTrip } from '../domain/trip/normalize';
import type { AppState, Receipt, TripProfile } from './types';

const stampForRemote = (state: AppState, receipt: Receipt) => stampReceiptForTrip(state, receipt, { preserveUpdatedAt: true });

function receiptUpdatedAt(receipt: Receipt) {
  return Number(receipt.updatedAt || receipt.createdAt || 0);
}

function tripUpdatedAt(trip: TripProfile) {
  return Number(trip.updatedAt || trip.createdAt || 0);
}

export function isReceiptTombstoned(state: Pick<AppState, 'notionDeletedIds' | 'notionDeletedSourceIds'>, receipt: Pick<Receipt, 'id' | 'sourceId' | 'notionPageId'>) {
  return !!(
    receipt.notionPageId && state.notionDeletedIds?.includes(receipt.notionPageId)
    || receipt.sourceId && state.notionDeletedSourceIds?.includes(receipt.sourceId)
    || state.notionDeletedSourceIds?.includes(receipt.id)
  );
}

export function mergePulledReceipts(state: AppState, pulledReceipts: Receipt[]): Receipt[] {
  const byId = new Map(state.receipts.map((receipt) => [receipt.id, receipt]));
  for (const remoteReceipt of pulledReceipts) {
    if (isReceiptTombstoned(state, remoteReceipt)) continue;
    const localReceipt = byId.get(remoteReceipt.id);
    if (!localReceipt) {
      byId.set(remoteReceipt.id, stampForRemote(state, { ...remoteReceipt, syncStatus: 'synced' }));
      continue;
    }
    const localUpdated = receiptUpdatedAt(localReceipt);
    const remoteUpdated = receiptUpdatedAt(remoteReceipt);
    const remoteHasMissingLink = !localReceipt.notionPageId && !!remoteReceipt.notionPageId
      || !localReceipt.sourceId && !!remoteReceipt.sourceId;
    if (remoteUpdated > localUpdated || (remoteUpdated === localUpdated && remoteHasMissingLink)) {
      byId.set(remoteReceipt.id, stampForRemote(state, {
        ...localReceipt,
        ...remoteReceipt,
        photoThumb: localReceipt.photoThumb || remoteReceipt.photoThumb,
        photoUrl: localReceipt.photoUrl || remoteReceipt.photoUrl,
        syncStatus: 'synced',
      }));
    }
  }
  return [...byId.values()];
}

export function mergePulledTrips(state: AppState, pulledTrips: TripProfile[]) {
  const fallbackTrips = state.trips?.length ? state.trips : [activeTrip(state)];
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
      byId.set(remoteTrip.id, { ...localTrip, ...remoteTrip });
      if (remoteTrip.active && !remoteTrip.archived) activeTripId = remoteTrip.id;
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
