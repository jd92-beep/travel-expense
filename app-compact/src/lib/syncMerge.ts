import { activeTrip, stampReceiptForTrip } from '../domain/trip/normalize';
import { canonicalizeItineraryRange } from '../domain/trip/itineraryContract';
import { canonicalTombstoneWins, mergeCanonicalReceiptTombstones } from './receiptTombstones';
import type { AppState, Receipt, ReceiptTombstone, SyncQueueItem, TripProfile } from './types';

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
  return Number(receipt.updatedAt || receipt.createdAt || 0);
}

function tripUpdatedAt(trip: TripProfile, isLocal = false) {
  return Number(trip.updatedAt || trip.createdAt || 0);
}

function validTripRange(trip: TripProfile, fallback?: TripProfile): { start: string; end: string } | null {
  const start = String(trip.startDate || fallback?.startDate || '');
  const end = String(trip.endDate || fallback?.endDate || '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end) || end < start) return null;
  return { start, end };
}

function inTripRange(day: TripProfile['itinerary'][number], range: { start: string; end: string } | null): boolean {
  if (!range) return true;
  return day.date >= range.start && day.date <= range.end;
}

function mergeItineraryDay(remote: TripProfile['itinerary'][number] | undefined, local: TripProfile['itinerary'][number] | undefined): TripProfile['itinerary'][number] | null {
  const base = remote || local;
  if (!base) return null;
  return {
    ...local,
    ...remote,
    date: remote?.date || local?.date || base.date,
    day: Number(remote?.day || local?.day || base.day) || 1,
    region: remote?.region || local?.region || base.region,
    lodging: remote?.lodging?.name ? remote.lodging : local?.lodging,
    spots: remote ? remote.spots || [] : local?.spots || [],
  };
}

function tripItineraryVersion(trip?: TripProfile): number {
  return Math.max(0, Number(trip?.itineraryVersion ?? trip?.version) || 0);
}

export function filterSupersededTripQueue(
  queue: SyncQueueItem[],
  localTrips: TripProfile[],
  remoteTrips: TripProfile[],
): SyncQueueItem[] {
  const localById = new Map(localTrips.map((trip) => [trip.id, trip]));
  const superseded = new Set(
    remoteTrips
      .filter((remote) => tripItineraryVersion(remote) > tripItineraryVersion(localById.get(remote.id)))
      .map((remote) => remote.id),
  );
  return queue.filter((item) => item.type !== 'trip' || !superseded.has(item.entityId));
}

function mergeTripItinerary(
  remoteTrip: TripProfile,
  localTrip?: TripProfile,
): TripProfile['itinerary'] {
  const range = validTripRange(remoteTrip, localTrip);
  const remoteDays = (remoteTrip.itinerary || []).filter((day) => inTripRange(day, range));
  const localDays = (localTrip?.itinerary || []).filter((day) => inTripRange(day, range));
  const remoteByDate = new Map(remoteDays.map((day) => [day.date, day]));
  const localByDate = new Map(localDays.map((day) => [day.date, day]));
  const dates = Array.from(new Set([...localDays, ...remoteDays].map((day) => day.date))).sort();
  const mergedDays = dates
    .map((date, idx) => {
      const day = mergeItineraryDay(remoteByDate.get(date), localByDate.get(date));
      return day ? { ...day, day: idx + 1 } : null;
    })
    .filter((day): day is TripProfile['itinerary'][number] => !!day);
  if (!range) return mergedDays;
  return canonicalizeItineraryRange({
    tripId: remoteTrip.id,
    startDate: range.start,
    endDate: range.end,
    itinerary: mergedDays,
    fallbackCurrency: remoteTrip.currencies?.[0],
    fallbackRegion: remoteTrip.destinationSummary || remoteTrip.name,
    fallbackTimezone: remoteTrip.timezones?.[0],
  }).itinerary;
}

export function isReceiptTombstoned(
  state: Pick<AppState, 'notionDeletedIds' | 'notionDeletedSourceIds' | 'receiptTombstones' | 'trips'>,
  receipt: Pick<Receipt, 'id' | 'sourceId' | 'notionPageId' | 'tripId' | 'syncRevision'>,
) {
  const deletedSourceIds = state.notionDeletedSourceIds || [];
  const sourceId = receipt.sourceId || receipt.id;
  const canonicalDeleteWins = canonicalTombstoneWins(state.receiptTombstones, receipt);
  const hasMultipleTrips = Array.isArray(state.trips) && state.trips.filter((trip) => !trip.archived).length > 1;
  const rawLegacyMatchAllowed = !hasMultipleTrips || !receipt.tripId;
  return !!(
    canonicalDeleteWins
    ||
    receipt.notionPageId && state.notionDeletedIds?.includes(receipt.notionPageId)
    || deletedSourceIds.includes(receiptSourceTombstoneKey(receipt))
    || rawLegacyMatchAllowed && sourceId && deletedSourceIds.includes(sourceId)
  );
}

function mergeReceiptTombstones(
  state: AppState,
  pulledReceipts: Receipt[],
  pulledTombstones: ReceiptTombstone[],
): Record<string, ReceiptTombstone> {
  return mergeCanonicalReceiptTombstones(state.receiptTombstones, pulledReceipts, pulledTombstones);
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
  // Legacy Notion rows may not have a tripId. Raw SourceID matching is only safe when the candidate
  // is unique and unscoped; canonical identity is always (TripID, SourceID).
  const rawKeyOf = (r: Pick<Receipt, 'id' | 'sourceId' | 'tripId'>) => rawReceiptSourceId(r.sourceId || r.id, r.tripId);
  const idsByRawSource = new Map<string, string[]>();
  const indexRawSource = (key: string, id: string) => {
    if (!key) return;
    const ids = idsByRawSource.get(key) || [];
    if (!ids.includes(id)) idsByRawSource.set(key, [...ids, id]);
  };
  for (const receipt of state.receipts) indexRawSource(rawKeyOf(receipt), receipt.id);
  for (const remoteReceipt of pulledReceipts) {
    if (isReceiptTombstoned(state, remoteReceipt)) continue;
    const tripSourceKey = receiptTripSourceKey(remoteReceipt);
    const rawSourceKey = rawKeyOf(remoteReceipt);
    const rawCandidates = rawSourceKey ? idsByRawSource.get(rawSourceKey) || [] : [];
    const legacyCandidates = remoteReceipt.tripId
      ? rawCandidates.filter((id) => !byId.get(id)?.tripId)
      : rawCandidates;
    const uniqueLegacyId = legacyCandidates.length === 1 ? legacyCandidates[0] : undefined;
    const matchedId = byId.has(remoteReceipt.id)
      ? remoteReceipt.id
      : (remoteReceipt.supabaseId ? idBySupabaseId.get(remoteReceipt.supabaseId) : undefined)
        || (remoteReceipt.notionPageId ? idByPageId.get(remoteReceipt.notionPageId) : undefined)
        || idByTripSource.get(tripSourceKey)
        || uniqueLegacyId;
    const localReceipt = matchedId ? byId.get(matchedId) : undefined;
    if (!localReceipt) {
      byId.set(remoteReceipt.id, stampForRemote(state, { ...remoteReceipt, syncStatus: 'synced' }));
      if (remoteReceipt.supabaseId) idBySupabaseId.set(remoteReceipt.supabaseId, remoteReceipt.id);
      if (remoteReceipt.notionPageId) idByPageId.set(remoteReceipt.notionPageId, remoteReceipt.id);
      if (tripSourceKey) idByTripSource.set(tripSourceKey, remoteReceipt.id);
      indexRawSource(rawSourceKey, remoteReceipt.id);
      continue;
    }
    const localUpdated = receiptUpdatedAt(localReceipt, true);
    const remoteUpdated = receiptUpdatedAt(remoteReceipt, false);
    const remoteHasMissingLink = !localReceipt.notionPageId && !!remoteReceipt.notionPageId
      || !localReceipt.sourceId && !!remoteReceipt.sourceId;
    const photoUrlChanged = !!remoteReceipt.photoUrl && remoteReceipt.photoUrl !== localReceipt.photoUrl;
    if (remoteUpdated > localUpdated || (remoteUpdated === localUpdated && remoteHasMissingLink)) {
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
      indexRawSource(rawSourceKey, localReceipt.id);
    } else if (photoUrlChanged) {
      // photoUrl comes from a separate table and changes WITHOUT bumping the receipt row's
      // updated_at. Adopt ONLY the photo + identity-link fields — never the money/content fields,
      // which would clobber a newer-but-unpushed local edit (and then push the stale value back).
      byId.set(localReceipt.id, {
        ...localReceipt,
        photoUrl: remoteReceipt.photoUrl || localReceipt.photoUrl,
        supabasePhotoPath: remoteReceipt.supabasePhotoPath || localReceipt.supabasePhotoPath,
        _photoSyncedToSupabase: localReceipt._photoSyncedToSupabase || remoteReceipt._photoSyncedToSupabase,
        supabaseId: localReceipt.supabaseId || remoteReceipt.supabaseId,
        notionPageId: localReceipt.notionPageId || remoteReceipt.notionPageId,
        sourceId: localReceipt.sourceId || remoteReceipt.sourceId,
      });
      if (remoteReceipt.supabaseId) idBySupabaseId.set(remoteReceipt.supabaseId, localReceipt.id);
      if (remoteReceipt.notionPageId) idByPageId.set(remoteReceipt.notionPageId, localReceipt.id);
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
    const remoteItineraryVersion = tripItineraryVersion(remoteTrip);
    const localItineraryVersion = tripItineraryVersion(localTrip);
    const remoteHasMissingLink = localTrip
      ? (!localTrip.supabaseId && !!remoteTrip.supabaseId)
        || (!localTrip.notionPageId && !!remoteTrip.notionPageId)
        || (!localTrip.sourceId && !!remoteTrip.sourceId)
      : true;
    const keepNewerLocalItinerary = !!localTrip && remoteItineraryVersion < localItineraryVersion;
    const itinerary = keepNewerLocalItinerary
      ? localTrip.itinerary || []
      : mergeTripItinerary(remoteTrip, localTrip);
    if (!localTrip || remoteUpdated > localUpdated) {
      byId.set(remoteTrip.id, {
        ...localTrip,
        ...remoteTrip,
        itinerary,
        itineraryVersion: Math.max(localItineraryVersion, remoteItineraryVersion),
        version: Math.max(localTrip?.version || 1, remoteTrip.version || 1),
        _itineraryNeedsRepair: keepNewerLocalItinerary
          ? localTrip._itineraryNeedsRepair
          : remoteTrip._itineraryNeedsRepair,
      });
    } else if (remoteItineraryVersion > localItineraryVersion || remoteHasMissingLink || remoteTrip._itineraryNeedsRepair || remoteTrip.sharing) {
      byId.set(remoteTrip.id, {
        ...localTrip,
        supabaseId: remoteTrip.supabaseId || localTrip.supabaseId,
        notionPageId: remoteTrip.notionPageId || localTrip.notionPageId,
        sourceId: remoteTrip.sourceId || localTrip.sourceId,
        sharing: remoteTrip.sharing || localTrip.sharing,
        itinerary: remoteItineraryVersion > localItineraryVersion ? itinerary : localTrip.itinerary,
        itineraryVersion: Math.max(localItineraryVersion, remoteItineraryVersion),
        _itineraryNeedsRepair: remoteItineraryVersion > localItineraryVersion
          ? remoteTrip._itineraryNeedsRepair
          : localTrip._itineraryNeedsRepair,
        version: Math.max(localTrip.version || 1, remoteTrip.version || 1),
      });
    }
  }
  return {
    trips: [...byId.values()],
    activeTripId,
  };
}

export function mergePulledData(
  state: AppState,
  pulledReceipts: Receipt[],
  pulledTrips: TripProfile[] = [],
  pulledTombstones: ReceiptTombstone[] = [],
): AppState {
  const { trips, activeTripId } = mergePulledTrips(state, pulledTrips);
  const receiptTombstones = mergeReceiptTombstones(state, pulledReceipts, pulledTombstones);
  const baseState = { ...state, trips, activeTripId, receiptTombstones };
  return {
    ...baseState,
    receipts: mergePulledReceipts(baseState, pulledReceipts)
      .filter((receipt) => !isReceiptTombstoned(baseState, receipt)),
  };
}
