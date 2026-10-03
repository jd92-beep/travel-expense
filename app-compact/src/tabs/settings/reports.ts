import { version as reactVersion } from 'react';
import { scopedReceiptsForTrip } from '../../domain/trip/normalize';
import { perHkdForCurrency } from '../../lib/currency';
import { categoryById, getItinerary, getReceiptHkdAmount, getResolvedTripCurrency, isPendingReceipt, safePhotoUrl } from '../../lib/domain';
import { isReceiptPhotoExpected, receiptHasLargePhoto, receiptPhotoNeedsSync } from '../../lib/receiptHealth';
import type { AppState, Person, Receipt, SyncEngineState, SyncQueueItem, TripProfile } from '../../lib/types';

export function dateMs(ymd: string | undefined): number | null {
  if (!ymd || !/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return null;
  const value = new Date(`${ymd}T00:00:00`).getTime();
  return Number.isFinite(value) ? value : null;
}

export function inclusiveTripDayCount(trip: TripProfile): number {
  const start = dateMs(trip.startDate);
  const end = dateMs(trip.endDate);
  if (start === null || end === null || end < start) return Math.max(1, trip.itinerary?.length || 1);
  return Math.max(1, Math.round((end - start) / 86_400_000) + 1);
}

export function syncQueueSummary(queue: SyncQueueItem[] = []) {
  const active = queue.filter((item) => item.status !== 'synced');
  const failed = active.filter((item) => item.status === 'error' || item.status === 'failed');
  return {
    active,
    failed,
    pending: active.filter((item) => item.status !== 'error' && item.status !== 'failed'),
  };
}

export function compactTripDoctor(
  state: AppState,
  trip: TripProfile,
  persons: Person[],
  syncState: SyncEngineState | undefined,
  cloudSyncAvailable: boolean,
  notionMirrorReady: boolean,
  storageScope: string,
) {
  const tripReceipts = scopedReceiptsForTrip(state, trip);
  const validPersonIds = new Set(persons.map((person) => person.id));
  const pendingOcr = tripReceipts.filter(isPendingReceipt).length;
  const missingPayer = tripReceipts.filter((receipt) => !receipt.personId || !validPersonIds.has(receipt.personId)).length;
  const largePhotos = tripReceipts.filter(receiptHasLargePhoto).length;
  const missingPhotos = tripReceipts.filter((receipt) => isReceiptPhotoExpected(receipt) && !safePhotoUrl(receipt.photoUrl, receipt.photoThumb)).length;
  const unsyncedPhotos = tripReceipts.filter(receiptPhotoNeedsSync).length;
  const attachmentIssues = largePhotos + missingPhotos + unsyncedPhotos;
  const dataIssues = pendingOcr + missingPayer;
  const queue = syncQueueSummary(state.syncQueue);
  const pendingQueue = Math.max(syncState?.pendingCount || 0, queue.pending.length);
  const failedQueueCount = Math.max(syncState?.failedCount || 0, queue.failed.length);
  const failedQueue = failedQueueCount + (syncState?.status === 'error' && !failedQueueCount ? 1 : 0);
  const expectedDays = inclusiveTripDayCount(trip);
  const plannedDates = new Set((trip.itinerary || []).map((day) => day.date).filter(Boolean));
  const plannedDays = Math.min(expectedDays, Math.max(0, plannedDates.size || (trip.itinerary?.length || 0)));
  const tripGaps = Math.max(0, expectedDays - plannedDays);
  const storageLabel = cloudSyncAvailable ? (notionMirrorReady ? 'Supabase + Notion' : 'Supabase only') : storageScope;
  const issueTotal = dataIssues + attachmentIssues + pendingQueue + failedQueue + tripGaps;
  return {
    tone: issueTotal > 0 ? 'warning' : 'ok',
    statusLabel: issueTotal > 0 ? `${issueTotal} checks` : 'Ready',
    items: [
      {
        key: 'data',
        title: 'Data quality',
        value: dataIssues ? `${dataIssues} issues` : 'Clean',
        detail: dataIssues
          ? [`${pendingOcr} Pending OCR`, `${missingPayer} Missing payer`].filter((line) => !line.startsWith('0 ')).join(' · ')
          : `${tripReceipts.length} receipts checked`,
      },
      {
        key: 'sync',
        title: 'Sync queue',
        value: failedQueue ? `${failedQueue} failed` : pendingQueue ? `${pendingQueue} pending` : 'Clear',
        detail: [pendingQueue ? `${pendingQueue} pending` : '', storageLabel].filter(Boolean).join(' · '),
      },
      {
        key: 'attachments',
        title: 'Attachments',
        value: attachmentIssues ? `${attachmentIssues} issues` : 'Clean',
        detail: attachmentIssues
          ? [`${largePhotos} large`, `${missingPhotos} missing`, `${unsyncedPhotos} unsynced`].filter((line) => !line.startsWith('0 ')).join(' · ')
          : 'Photos ready',
      },
      {
        key: 'trip',
        title: 'Trip completeness',
        value: `${plannedDays}/${expectedDays} days`,
        detail: tripGaps ? `${tripGaps} day plans missing` : 'Itinerary days ready',
      },
      {
        key: 'backup',
        title: 'Backup safety',
        value: 'Current-trip only',
        detail: 'Secrets, cloud IDs, sync queues stripped',
      },
    ],
  };
}

export type TripSharePreview = {
  filename: string;
  copiedText: string;
  payload: {
    exportType: 'private-trip-share';
    generatedAt: string;
    safety: {
      tripScoped: true;
      stripped: string[];
    };
    trip: {
      name: string;
      destination: string;
      startDate: string;
      endDate: string;
      currency: string;
      budget: number;
      days: number;
    };
    summary: {
      receipts: number;
      spentHkd: number;
      remainingHkd: number;
      companions: string[];
    };
    itinerary: Array<{
      day: number;
      date: string;
      region: string;
      spots: Array<{ time: string; name: string; type: string }>;
    }>;
    receipts: Array<{
      date: string;
      store: string;
      category: string;
      amount: number;
      currency: string;
      payer: string;
    }>;
  };
};

export type DiagnosticsPreview = {
  filename: string;
  copiedText: string;
  payload: {
    exportType: 'public-safe-diagnostics';
    generatedAt: string;
    safety: {
      publicSafe: true;
      stripped: string[];
      excludesRawData: string[];
    };
    app: {
      surface: 'compact';
      reactVersion: string;
      storageScope: string;
      cloudSyncAvailable: boolean;
      notionMirrorReady: boolean;
      brokerSessionPresent: boolean;
      lastTab: string;
    };
    trip: {
      hasActiveTrip: boolean;
      startDate: string;
      endDate: string;
      dayCount: number;
      itineraryDays: number;
      archived: boolean;
      currency: string;
    };
    receipts: {
      currentTrip: number;
      allTrips: number;
      pendingOcr: number;
      missingPayer: number;
      syncErrors: number;
      localPhotoSignals: number;
      categories: Record<string, number>;
    };
    sync: {
      queuePending: number;
      queueFailed: number;
      deleteQueued: number;
      status: string;
      lastSyncAge: string;
    };
    checks: Array<{ label: string; status: string; detail: string }>;
  };
};

export function formatMoney(value: number): string {
  return `HK$ ${Math.round(value).toLocaleString('en-US')}`;
}

export function safeShareFilename(name: string): string {
  return `${(name || 'travel-expense').replace(/[^\w\u4e00-\u9fff-]+/g, '-')}-private-share.json`;
}

export function safeDiagnosticsFilename(): string {
  return `travel-expense-compact-diagnostics-${todayLocalDate()}.json`;
}

export function buildTripSharePreview(state: AppState, trip: TripProfile, persons: Person[]): TripSharePreview {
  // Owner-private rows stay out of share exports unless explicitly opted in later.
  const tripReceipts = scopedReceiptsForTrip(state, trip).filter((receipt) => receipt.visibility !== 'private');
  const privateExcluded = scopedReceiptsForTrip(state, trip).filter((receipt) => receipt.visibility === 'private').length;
  const itinerary = (trip.itinerary?.length ? trip.itinerary : getItinerary(state)).filter((day) => {
    if (!day.date) return true;
    return day.date >= trip.startDate && day.date <= trip.endDate;
  });
  const personNameById = new Map(persons.map((person) => [person.id, person.name]));
  const shareTripCurrency = getResolvedTripCurrency(state, trip);
  const spentHkd = tripReceipts.reduce((sum, receipt) => sum + (getReceiptHkdAmount(receipt, state) || 0), 0);
  const budgetHkd = Number(trip.budget || state.budget || 0) / Math.max(0.1, perHkdForCurrency(state, shareTripCurrency));
  const remainingHkd = Math.max(0, budgetHkd - spentHkd);
  const payload: TripSharePreview['payload'] = {
    exportType: 'private-trip-share',
    generatedAt: new Date().toISOString(),
    safety: {
      tripScoped: true,
      stripped: [
        'API keys',
        'broker sessions',
        'Notion/Supabase IDs',
        'sync queue',
        'deleted cloud markers',
        'other trips',
        ...(privateExcluded ? [`${privateExcluded} owner-private receipt(s)`] : []),
      ],
    },
    trip: {
      name: trip.name || state.tripName || 'Trip',
      destination: trip.destinationSummary || '',
      startDate: trip.startDate || state.tripDateRange.start,
      endDate: trip.endDate || state.tripDateRange.end,
      currency: trip.currencies?.find((c) => c !== 'HKD') || state.tripCurrency || 'JPY',
      budget: Number(trip.budget || state.budget || 0),
      days: inclusiveTripDayCount(trip),
    },
    summary: {
      receipts: tripReceipts.length,
      spentHkd,
      remainingHkd,
      companions: persons.map((person) => person.name),
    },
    itinerary: itinerary.map((day) => ({
      day: Number(day.day) || 1,
      date: day.date,
      region: day.region || '',
      spots: (day.spots || []).slice(0, 8).map((spot) => ({
        time: spot.time || '',
        name: spot.name || '',
        type: spot.type || 'other',
      })),
    })),
    receipts: tripReceipts.map((receipt) => ({
      date: receipt.date,
      store: receipt.store,
      category: categoryById(receipt.category).name,
      amount: Number(receipt.originalAmount ?? receipt.total) || 0,
      currency: receipt.originalCurrency || receipt.currency || state.tripCurrency,
      payer: personNameById.get(receipt.personId || '') || 'Unassigned',
    })),
  };
  const spotEntries = payload.itinerary.flatMap((day) => day.spots.map((spot) => ({
    date: day.date,
    line: `${day.date} ${spot.time} ${spot.name}`,
  })));
  const today = todayLocalDate();
  const upcoming = spotEntries.find((entry) => entry.date >= today);
  const nextStop = (upcoming || spotEntries[spotEntries.length - 1])?.line || 'No itinerary spot';
  const receiptLine = payload.receipts.length
    ? payload.receipts.slice(0, 3).map((receipt) => `${receipt.store} ${receipt.currency} ${Math.round(receipt.amount).toLocaleString('en-US')}`).join(' · ')
    : 'No receipts yet';
  const copiedText = [
    `${payload.trip.name} · Private trip share`,
    `${payload.trip.startDate} to ${payload.trip.endDate} · ${payload.trip.destination || 'Destination pending'}`,
    `Spend: ${formatMoney(spentHkd)} · Remaining: ${formatMoney(remainingHkd)} · Receipts: ${tripReceipts.length}${privateExcluded ? ` (${privateExcluded} private excluded)` : ''}`,
    `Next: ${nextStop}`,
    `Receipts: ${receiptLine}`,
    'Safe export: current trip only; no API keys, broker sessions, Notion/Supabase IDs, sync queue, other trips, or owner-private receipts.',
  ].join('\n');
  return {
    filename: safeShareFilename(payload.trip.name),
    copiedText,
    payload,
  };
}

export function buildDiagnosticsPreview(
  state: AppState,
  trip: TripProfile,
  persons: Person[],
  syncState: SyncEngineState | undefined,
  cloudSyncAvailable: boolean,
  notionMirrorReady: boolean,
  brokerReady: boolean,
  storageScope: string,
): DiagnosticsPreview {
  const tripReceipts = scopedReceiptsForTrip(state, trip);
  const queue = syncQueueSummary(state.syncQueue);
  const failedQueue = queue.failed;
  const pendingQueue = queue.pending;
  const deleteQueue = queue.active.filter((item) => item.op === 'delete' || item.type === 'delete-receipt');
  const validPersonIds = new Set(persons.map((person) => person.id));
  const categories = tripReceipts.reduce<Record<string, number>>((counts, receipt) => {
    const label = categoryById(receipt.category).name || 'Other';
    counts[label] = (counts[label] || 0) + 1;
    return counts;
  }, {});
  const localPhotoSignals = tripReceipts.filter((receipt) => (
    !!receipt.photoThumb
    || (!!receipt.photoUrl && !/^https?:\/\//i.test(String(receipt.photoUrl)))
    || !!receipt.notionFileUploadId
  )).length;
  const pendingOcr = tripReceipts.filter(isPendingReceipt).length;
  const missingPayer = tripReceipts.filter((receipt) => !receipt.personId || !validPersonIds.has(receipt.personId)).length;
  const syncErrors = tripReceipts.filter((receipt) => receipt.syncStatus === 'error' || receipt.syncStatus === 'failed').length + failedQueue.length;
  const payload: DiagnosticsPreview['payload'] = {
    exportType: 'public-safe-diagnostics',
    generatedAt: new Date().toISOString(),
    safety: {
      publicSafe: true,
      stripped: [
        'API keys and provider tokens',
        'broker sessions',
        'Notion/Supabase IDs',
        'receipt IDs and SourceID',
        'sync queue payloads and error text',
        'receipt photos and photo URLs',
        'traveller names and receipt/store names',
      ],
      excludesRawData: ['raw receipts', 'raw trips', 'raw persons', 'raw sync queue', 'photos'],
    },
    app: {
      surface: 'compact',
      reactVersion,
      storageScope,
      cloudSyncAvailable,
      notionMirrorReady,
      brokerSessionPresent: brokerReady,
      lastTab: state.lastTab || 'unknown',
    },
    trip: {
      hasActiveTrip: !!trip.id,
      startDate: trip.startDate || '',
      endDate: trip.endDate || '',
      dayCount: inclusiveTripDayCount(trip),
      itineraryDays: (trip.itinerary?.length ? trip.itinerary : getItinerary(state)).length,
      archived: !!trip.archived,
      currency: trip.currencies?.find((currency) => currency !== 'HKD') || state.tripCurrency || 'JPY',
    },
    receipts: {
      currentTrip: tripReceipts.length,
      allTrips: Array.isArray(state.receipts) ? state.receipts.length : 0,
      pendingOcr,
      missingPayer,
      syncErrors,
      localPhotoSignals,
      categories,
    },
    sync: {
      queuePending: pendingQueue.length,
      queueFailed: failedQueue.length,
      deleteQueued: deleteQueue.length,
      status: syncState?.status || state.globalSyncStatus || 'local',
      lastSyncAge: formatSyncAge(syncState?.lastSyncedAt || state.lastSyncedAt || 0),
    },
    checks: [
      { label: 'Trip scope', status: tripReceipts.length === (state.receipts || []).length ? 'single-trip' : 'multi-trip', detail: `${tripReceipts.length} current-trip receipts` },
      { label: 'Sync queue', status: failedQueue.length ? 'failed' : pendingQueue.length ? 'pending' : 'clear', detail: `${pendingQueue.length} pending · ${failedQueue.length} failed · ${deleteQueue.length} delete queued` },
      { label: 'Data quality', status: pendingOcr + missingPayer + syncErrors ? 'review' : 'clean', detail: `${pendingOcr} pending OCR · ${missingPayer} missing payer · ${syncErrors} sync errors` },
      { label: 'Backup safety', status: 'safe-preview', detail: 'No raw IDs, tokens, photos, or queue payloads included' },
    ],
  };
  const copiedText = [
    'Travel Expense Compact · public diagnostics',
    `Surface: compact · React ${reactVersion} · Storage ${storageScope}`,
    `Trip: ${payload.trip.dayCount} days · ${payload.trip.itineraryDays} itinerary days · ${payload.trip.currency}`,
    `Receipts: ${payload.receipts.currentTrip} current-trip / ${payload.receipts.allTrips} total`,
    `Data quality: ${pendingOcr} pending OCR · ${missingPayer} missing payer · ${syncErrors} sync errors`,
    `Sync: ${payload.sync.queuePending} pending · ${payload.sync.queueFailed} failed · last sync ${payload.sync.lastSyncAge}`,
    'Safe export: no API keys, broker sessions, Notion/Supabase IDs, receipt IDs, SourceID, sync payloads, error text, traveller names, store names, photos, or photo URLs.',
  ].join('\n');
  return {
    filename: safeDiagnosticsFilename(),
    copiedText,
    payload,
  };
}

export function todayLocalDate(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
}

export function formatSyncAge(timestamp: number): string {
  if (!timestamp || !Number.isFinite(timestamp)) return 'never';
  const ageMs = Math.max(0, Date.now() - timestamp);
  const minutes = Math.floor(ageMs / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m old`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours}h old`;
  return `${Math.floor(hours / 24)}d old`;
}

export function formatSessionExpiry(expiresAt: number): string {
  if (!expiresAt || !Number.isFinite(expiresAt)) return 'none';
  const leftMs = expiresAt - Date.now();
  if (leftMs <= 0) return 'expired';
  const minutes = Math.ceil(leftMs / 60_000);
  if (minutes < 60) return `${minutes}m left`;
  return `${Math.ceil(minutes / 60)}h left`;
}

export function shortId(value: string): string {
  return value && value.length > 14 ? `${value.slice(0, 8)}...${value.slice(-4)}` : value || 'none';
}

export function buildTripScopeAudit(state: AppState, trip: TripProfile) {
  const receipts = Array.isArray(state.receipts) ? state.receipts : [];
  const scopedReceipts = scopedReceiptsForTrip(state, trip);
  const hasMultipleTrips = (state.trips || []).length > 1;
  const hasTripDates = !!trip.startDate && !!trip.endDate && trip.endDate >= trip.startDate;
  const inDateWindow = (receipt: Receipt) => (
    !receipt.date || !hasTripDates || (receipt.date >= trip.startDate && receipt.date <= trip.endDate)
  );
  const outOfRange = scopedReceipts.filter((receipt) => !inDateWindow(receipt));
  const autoLinked = scopedReceipts.filter((receipt) => receipt.tripLinkSource && receipt.tripLinkSource !== 'explicit');
  const otherTrip = receipts.filter((receipt) => receipt.tripId && receipt.tripId !== trip.id);
  const issueCount = outOfRange.length + (hasMultipleTrips ? autoLinked.length : 0);
  const repairReceipt = outOfRange[0] || (hasMultipleTrips ? autoLinked[0] : undefined);
  return {
    tone: issueCount ? 'warning' : 'ok',
    statusLabel: issueCount ? `${issueCount} scope checks` : 'Scope ready',
    repairReceiptId: repairReceipt?.id || '',
    repairReceiptLabel: repairReceipt?.store || repairReceipt?.id || '',
    helper: hasTripDates
      ? `${trip.startDate} to ${trip.endDate} · current-trip export/sync only`
      : 'Trip dates are incomplete; export still stays current-trip scoped.',
    items: [
      {
        key: 'included',
        title: 'Included',
        value: `${scopedReceipts.length} receipt${scopedReceipts.length === 1 ? '' : 's'}`,
        detail: 'Backup/share/sync scope',
      },
      {
        key: 'date',
        title: 'Date window',
        value: outOfRange.length ? `${outOfRange.length} outside` : 'Clean',
        detail: hasTripDates ? `${trip.startDate} to ${trip.endDate}` : 'Trip dates missing',
      },
      {
        key: 'unlinked',
        title: 'Unlinked',
        value: autoLinked.length ? `${autoLinked.length} auto-linked` : 'None',
        detail: hasMultipleTrips ? (autoLinked.length ? 'Review trip link' : 'No auto links') : 'Single-trip fallback',
      },
      {
        key: 'other',
        title: 'Other trips',
        value: otherTrip.length ? `${otherTrip.length} excluded` : 'None',
        detail: 'Not exported here',
      },
    ],
  };
}
