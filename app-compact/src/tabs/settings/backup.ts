import type { AppState, Receipt, TripProfile } from '../../lib/types';
import { stripSensitiveState } from '../../lib/storage';

export const MAX_SAFE_AMOUNT = 1_000_000_000;



export function clampFinite(value: unknown, fallback: number, min = 0, max = MAX_SAFE_AMOUNT): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

export function validateBackupSchema(payload: unknown): boolean {
  if (!payload || typeof payload !== 'object') return false;
  const p = payload as Record<string, unknown>;

  if (p.receipts !== undefined && !Array.isArray(p.receipts)) return false;
  if (p.persons !== undefined) {
    if (!Array.isArray(p.persons)) return false;
    for (const item of p.persons) {
      if (!item || typeof item !== 'object') return false;
      const person = item as Record<string, unknown>;
      if (typeof person.id !== 'string' || typeof person.name !== 'string') return false;
    }
  }
  if (p.trips !== undefined) {
    if (!Array.isArray(p.trips)) return false;
    for (const item of p.trips) {
      if (!item || typeof item !== 'object') return false;
      const trip = item as Record<string, unknown>;
      if (typeof trip.id !== 'string' || typeof trip.name !== 'string') return false;
    }
  }
  if (p.shareRatios !== undefined) {
    if (typeof p.shareRatios !== 'object' || p.shareRatios === null) return false;
    for (const key of Object.keys(p.shareRatios)) {
      const val = (p.shareRatios as Record<string, unknown>)[key];
      if (val !== undefined && typeof val !== 'number') return false;
    }
  }
  return true;
}

export function sanitizeImportedReceipts(input: unknown, fallbackDate: string, allowedTripIds: Set<string>, fallbackTripId?: string): Receipt[] {
  if (!Array.isArray(input)) return [];
  return input
    .filter((receipt): receipt is Partial<Receipt> => !!receipt && typeof receipt === 'object')
    .filter((receipt) => typeof receipt.id === 'string' && typeof receipt.store === 'string')
    .map((receipt) => {
      const originalTripId = typeof receipt.tripId === 'string' ? receipt.tripId : '';
      const tripIdIsAllowed = !!originalTripId && allowedTripIds.has(originalTripId);
      const nextTripId = tripIdIsAllowed ? originalTripId : fallbackTripId;
      const {
        supabaseId: _supabaseId,
        notionPageId: _notionPageId,
        notionDb: _notionDb,
        notionFileUploadId: _notionFileUploadId,
        sourceId: _sourceId,
        syncStatus: _syncStatus,
        tripId: _tripId,
        tripVersion: _tripVersion,
        tripDayId: _tripDayId,
        // Crafted backups must not inject large base64 thumbs or remote photo URLs.
        photoThumb: _photoThumb,
        photoUrl: _photoUrl,
        _photoSyncedToNotion,
        _photoBodyBlockAdded,
        // Cloud photo identity/sync flags must never arrive from a file: a crafted backup
        // with `_photoSyncedToSupabase: true` or a foreign `supabasePhotoPath` would either
        // suppress the local re-upload or point sync at another account's storage object.
        supabasePhotoPath: _supabasePhotoPath,
        _photoSyncedToSupabase: _photoSyncedToSupabase,
        _photoSyncAttempts: _photoSyncAttempts,
        // Ownership markers would freeze restored receipts into read-only foreign rows.
        ownerId: _ownerId,
        createdByLabel: _createdByLabel,
        ...localReceipt
      } = receipt as Partial<Receipt> & { notionDb?: unknown };
      const totalNum = Number(receipt.total);
      const total = Number.isFinite(totalNum) && totalNum >= 0 ? Math.min(MAX_SAFE_AMOUNT, totalNum) : 0;

      const origNum = receipt.originalAmount !== undefined ? Number(receipt.originalAmount) : total;
      const originalAmount = Number.isFinite(origNum) && origNum >= 0 ? Math.min(MAX_SAFE_AMOUNT, origNum) : total;

      return {
        ...localReceipt,
        id: String(receipt.id),
        store: String(receipt.store),
        total,
        originalAmount,
        tripId: nextTripId,
        tripVersion: tripIdIsAllowed ? receipt.tripVersion : undefined,
        tripDayId: tripIdIsAllowed ? receipt.tripDayId : undefined,
        date: typeof receipt.date === 'string' && receipt.date ? receipt.date : fallbackDate,
        createdAt: Number.isFinite(Number(receipt.createdAt)) ? Number(receipt.createdAt) : Date.now(),
        updatedAt: Number.isFinite(Number(receipt.updatedAt)) ? Number(receipt.updatedAt) : undefined,
      } as Receipt;
    });
}

export function sanitizeImportedTrips(input: unknown): TripProfile[] | undefined {
  if (!Array.isArray(input)) return undefined;
  const trips = input
    .filter((trip): trip is Partial<TripProfile> => !!trip && typeof trip === 'object')
    .filter((trip) => typeof trip.id === 'string' && typeof trip.name === 'string')
    .map((trip) => {
      const {
        supabaseId: _supabaseId,
        notionPageId: _notionPageId,
        sourceId: _sourceId,
        notionDb: _notionDb,
        ...localTrip
      } = trip;
      return localTrip as TripProfile;
    });
  return trips.length ? trips : undefined;
}

export type BackupImportPreview = {
  fileName: string;
  safePayload: Partial<AppState>;
  importedTrips?: TripProfile[];
  receipts: Receipt[];
  /** True when the backup file itself carried a receipts key (even if empty). */
  receiptsProvided: boolean;
  tripCount: number;
  receiptCount: number;
  targetTripName: string;
  nextActiveTripId?: string;
  warnings: string[];
};

export function buildBackupImportPreview(fileName: string, payload: Partial<AppState>, state: AppState, currentTrip: TripProfile): BackupImportPreview {
  const {
    credentialBrokerUrl: _credentialBrokerUrl,
    notionDb: _notionDb,
    syncQueue: _syncQueue,
    notionDeletedIds: _notionDeletedIds,
    notionDeletedSourceIds: _notionDeletedSourceIds,
    deletedTripIds: _deletedTripIds,
    // Tombstones carry supabaseId + delete markers; importing them would suppress
    // legitimate local receipts after the next merge. Never accept them from a file.
    receiptTombstones: _receiptTombstones,
    lastSyncedAt: _lastSyncedAt,
    globalSyncStatus: _globalSyncStatus,
    syncError: _syncError,
    settingsPulledAt: _settingsPulledAt,
    receipts: _receipts,
    trips: _trips,
    ...safePayload
  } = stripSensitiveState(payload) as Partial<AppState> & { credentialBrokerUrl?: unknown };
  const importedTrips = sanitizeImportedTrips(payload.trips);
  const nextTrips = importedTrips || state.trips || [];
  const allowedTripIds = new Set(nextTrips.map((trip) => trip.id).filter(Boolean));
  const requestedActiveTripId = typeof payload.activeTripId === 'string' && allowedTripIds.has(payload.activeTripId)
    ? payload.activeTripId
    : undefined;
  const fallbackTripId = requestedActiveTripId || currentTrip.id || nextTrips.find((trip) => !trip.archived)?.id || nextTrips[0]?.id;
  const receipts = sanitizeImportedReceipts(payload.receipts, currentTrip.startDate || state.tripDateRange.start, allowedTripIds, fallbackTripId);
  const targetTrip = nextTrips.find((trip) => trip.id === fallbackTripId) || currentTrip;
  // Per-trip maps from another device/account must not reference trips this restore doesn't
  // know about — keep only keys for trips that will exist after the import.
  if (safePayload.peopleByTripId) {
    safePayload.peopleByTripId = Object.fromEntries(
      Object.entries(safePayload.peopleByTripId).filter(([tripId]) => allowedTripIds.has(tripId)),
    );
  }
  if (safePayload.shareRatiosByTripId) {
    safePayload.shareRatiosByTripId = Object.fromEntries(
      Object.entries(safePayload.shareRatiosByTripId).filter(([tripId]) => allowedTripIds.has(tripId)),
    );
  }
  const warnings = [
    'Secrets stripped',
    'Cloud IDs removed',
    'Sync queue ignored',
  ];
  if (!importedTrips?.length) warnings.push('Receipts mapped to current trip');
  return {
    fileName,
    safePayload,
    importedTrips,
    receipts,
    receiptsProvided: Array.isArray(payload.receipts),
    tripCount: importedTrips?.length || 0,
    receiptCount: receipts.length,
    targetTripName: targetTrip.name || currentTrip.name || 'Current trip',
    nextActiveTripId: fallbackTripId,
    warnings,
  };
}
