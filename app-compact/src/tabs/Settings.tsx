import { AlertTriangle, ArrowDown, ArrowUp, CheckCircle2, ChevronDown, Cloud, Copy, Download, KeyRound, LogOut, Mail, MapPin, Plane, Plus, RotateCcw, Server, ShieldCheck, Sparkles, Trash2, Upload, UserMinus, Users, X } from 'lucide-react';
import type { Dispatch, SetStateAction } from 'react';
import { useEffect, useMemo, useRef, useState, version as reactVersion } from 'react';
import { AccordionCard } from '../components/AccordionCard';
import { AvatarBadge } from '../components/AvatarBadge';
import { parseTripParagraph, testGoogleBackupConnection, testKimiConnection } from '../lib/ai';
import { activeTrip, createTripProfile, migrateAppState, normalizeTripIntelligence, scopedReceiptsForTrip } from '../domain/trip/normalize';
import { AI_MODELS, APP_VERSION, DEFAULT_KIMI_PRIMARY_MODEL_ID, ITINERARY } from '../lib/constants';
import {
  brokerHealth,
  disconnectPersonalNotionIntegration,
  getPersonalNotionIntegration,
  getConnectionStatus,
  hasCredentialBrokerSession,
  isAllowedCredentialBrokerUrl,
  redactedError,
  registerPersonalNotionIntegration,
  rotateProviderCredential,
  testProviderConnection,
  unlockCredentialBroker,
  type CredentialProvider,
  type ConnectionStatus,
  type PersonalNotionStatus,
  type ProviderStatus,
} from '../lib/credentialBroker';
import { appRatePatchFromSnapshot, currencyPrefix, fetchLiveCurrencySnapshot, SUPPORTED_CURRENCIES } from '../lib/currency';
import { categoryById, computeSettlements, downloadJson, exportCsv, getItinerary, getPersons, getResolvedTripCurrency, isPendingReceipt, safePhotoUrl, validateItinerary } from '../lib/domain';
import { isReceiptPhotoExpected, receiptHasLargePhoto, receiptPhotoNeedsSync } from '../lib/receiptHealth';
import { saveReceiptRepairIntent } from '../lib/repairIntent';
import {
  diagnoseNotionSchema,
  diagnoseReactReceiptMapping,
  hasDirectNotionToken,
  migrateNotionSchema,
  pullAll,
  pushSettingsMeta,
  pushTripPage,
  testNotion,
  type ReactMappingDiagnostics,
  archiveReceipt,
  notionFetch,
} from '../lib/notion';
import { canUseNotionMirror, configuredNotionDatabaseId, hasUserScopedNotionDatabase, notionMirrorGuardMessage } from '../lib/notionAccess';
import type { AppState, ItineraryDay, ItinerarySpot, Person, Receipt, SyncEngineState, SyncQueueItem, TripDraft, TripInviteSummary, TripMemberRole, TripSharingInviteDraft, TripSharingState, TripProfile } from '../lib/types';
import { clearCredentialSession, getDirectNotionToken, saveDirectNotionToken, saveState, stripPortableBackupState, stripSensitiveState } from '../lib/storage';
import { createSupabaseTripInvite, inviteLinkForToken, removeSupabaseTripMember, revokeSupabaseTripInvite, updateSupabaseTripMemberRole, useSupabaseAuth } from '../lib/supabase';
import { clearDeviceTrust } from '../security/deviceTrust';
import { clearTrustedDevice } from '../security/trustedDevice';
import { GlassCard, SegmentedControl, StatefulActionButton, StatusPill, Toast } from '../components/ui';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../components/ui/tooltip';
import { generateMockReceipts, simulateTabSwitching } from '../lib/stressTest';
import { useModalOpenClass } from '../lib/useModalOpenClass';

const COLORS = ['#CC2929', '#FF91A4', '#2D5A8E', '#059669', '#D97706', '#7C3AED', '#0891B2', '#DB2777'];
const MAX_SAFE_AMOUNT = 1_000_000_000;


function clampFinite(value: unknown, fallback: number, min = 0, max = MAX_SAFE_AMOUNT): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function validateBackupSchema(payload: unknown): boolean {
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

function sanitizeImportedReceipts(input: unknown, fallbackDate: string, allowedTripIds: Set<string>, fallbackTripId?: string): Receipt[] {
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
        _photoSyncedToNotion,
        _photoBodyBlockAdded,
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

function sanitizeImportedTrips(input: unknown): TripProfile[] | undefined {
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

function dateMs(ymd: string | undefined): number | null {
  if (!ymd || !/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return null;
  const value = new Date(`${ymd}T00:00:00`).getTime();
  return Number.isFinite(value) ? value : null;
}

function inclusiveTripDayCount(trip: TripProfile): number {
  const start = dateMs(trip.startDate);
  const end = dateMs(trip.endDate);
  if (start === null || end === null || end < start) return Math.max(1, trip.itinerary?.length || 1);
  return Math.max(1, Math.round((end - start) / 86_400_000) + 1);
}

function syncQueueSummary(queue: SyncQueueItem[] = []) {
  const active = queue.filter((item) => item.status !== 'synced');
  const failed = active.filter((item) => item.status === 'error' || item.status === 'failed');
  return {
    active,
    failed,
    pending: active.filter((item) => item.status !== 'error' && item.status !== 'failed'),
  };
}

function compactTripDoctor(
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

function aiModelLabel(modelId: string | undefined): string {
  const id = modelId || DEFAULT_KIMI_PRIMARY_MODEL_ID;
  return AI_MODELS.find((model) => model.id === id)?.name || id;
}

function tripDraftPreviewStats(draft: TripDraft) {
  const days = draft.trip.itinerary || [];
  const spots = days.flatMap((day) => day.spots || []);
  const report = draft.extractionReport;
  const lodgingNames = new Set<string>();
  const foodNames = new Set<string>();
  const detailNames = new Set<string>();
  for (const day of days) {
    if (day.lodging?.name) lodgingNames.add(day.lodging.name);
    if (day.highlight) detailNames.add(day.highlight);
    for (const spot of day.spots || []) {
      const name = String(spot.name || '').trim();
      if (!name) continue;
      if (spot.type === 'lodging' || /hotel|酒店|住宿|旅館/i.test(name)) lodgingNames.add(name);
      if (spot.type === 'food' || /restaurant|cafe|餐|飯|食|咖啡|壽司|拉麵|bbq/i.test(name)) foodNames.add(name);
      if (spot.note || spot.address || spot.mapUrl || spot.time || spot.bookingRef || spot.sourceText) detailNames.add(name);
    }
  }
  return {
    dayCount: report?.daysExtracted ?? days.length,
    spotCount: report?.spotsExtracted ?? spots.filter((spot) => String(spot.name || '').trim()).length,
    lodgingCount: report?.hotelsExtracted ?? lodgingNames.size,
    foodCount: report?.restaurantsExtracted ?? foodNames.size,
    transportCount: report?.transportsExtracted ?? 0,
    detailCount: report?.importantDetailsExtracted ?? detailNames.size,
    sourceQuality: report?.sourceQuality || 'medium',
    missingCriticalFields: report?.missingCriticalFields || [],
    assumptions: report?.assumptions || [],
    organizedItinerary: draft.organizedItinerary || '',
    lodgingNames: Array.from(lodgingNames).slice(0, 4),
    foodNames: Array.from(foodNames).slice(0, 4),
    detailNames: Array.from(detailNames).slice(0, 5),
    days: days.slice(0, 8).map((day) => ({
      key: `${day.date}-${day.day}-${day.region}`,
      title: `Day ${day.day} · ${day.date}`,
      region: [day.region, day.city, day.country].filter(Boolean).join(' · '),
      highlight: day.highlight || '',
      note: day.note || '',
      lodging: day.lodging?.name || '',
      spots: (day.spots || []).filter((spot) => String(spot.name || '').trim()).slice(0, 4),
    })),
  };
}

const TRIP_REVIEW_SPOT_TYPES: ItinerarySpot['type'][] = ['flight', 'transport', 'food', 'shopping', 'lodging', 'ticket', 'localtour', 'medicine', 'sightseeing', 'other'];

function cloneTripDraft(draft: TripDraft): TripDraft {
  if (typeof structuredClone === 'function') return structuredClone(draft);
  return JSON.parse(JSON.stringify(draft)) as TripDraft;
}

function cleanTripReviewText(value: unknown): string {
  return String(value || '').trim();
}

function reviewNoticeText(value: string): string {
  const text = cleanTripReviewText(value).replace(/^Warning:\s*/i, '');
  if (!text) return '';
  if (/address|地址/i.test(text)) return `有啲地址未確認：${text}`;
  if (/assum|interpreted|估|理解/i.test(text)) return `AI 有一個理解假設：${text}`;
  if (/time|時間/i.test(text)) return `有啲時間要望一眼：${text}`;
  return text;
}

function tripReviewNotices(draft: TripDraft): string[] {
  const report = draft.extractionReport;
  const notices = [
    ...(report?.missingCriticalFields || []),
    ...(report?.assumptions || []),
    ...(report?.warnings || []),
    ...(draft.warnings || []),
  ]
    .map(reviewNoticeText)
    .filter(Boolean);
  return Array.from(new Set(notices)).slice(0, 12);
}

function updateDraftDayAt(draft: TripDraft, dayIndex: number, updater: (day: ItineraryDay) => ItineraryDay): TripDraft {
  const next = cloneTripDraft(draft);
  const days = next.trip.itinerary || [];
  if (!days[dayIndex]) return next;
  days[dayIndex] = updater({ ...days[dayIndex], spots: [...(days[dayIndex].spots || [])] });
  next.trip.itinerary = days;
  next.trip.updatedAt = Date.now();
  return next;
}

function sortReviewSpots(spots: ItinerarySpot[]): ItinerarySpot[] {
  return [...spots].sort((a, b) => {
    const left = cleanTripReviewText(a.time) || '99:99';
    const right = cleanTripReviewText(b.time) || '99:99';
    return left.localeCompare(right);
  });
}

function defaultReviewSpot(): ItinerarySpot {
  return {
    time: '09:00',
    timeEnd: '',
    name: '新地點',
    type: 'other',
    note: '',
    address: '',
  };
}

type BackupImportPreview = {
  fileName: string;
  safePayload: Partial<AppState>;
  importedTrips?: TripProfile[];
  receipts: Receipt[];
  tripCount: number;
  receiptCount: number;
  targetTripName: string;
  warnings: string[];
};

type TripSharePreview = {
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

type DiagnosticsPreview = {
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

function formatMoney(value: number): string {
  return `HK$ ${Math.round(value).toLocaleString('en-US')}`;
}

function safeShareFilename(name: string): string {
  return `${(name || 'travel-expense').replace(/[^\w\u4e00-\u9fff-]+/g, '-')}-private-share.json`;
}

function safeDiagnosticsFilename(): string {
  return `travel-expense-compact-diagnostics-${todayLocalDate()}.json`;
}

function buildTripSharePreview(state: AppState, trip: TripProfile, persons: Person[]): TripSharePreview {
  const tripReceipts = scopedReceiptsForTrip(state, trip);
  const itinerary = (trip.itinerary?.length ? trip.itinerary : getItinerary(state)).filter((day) => {
    if (!day.date) return true;
    return day.date >= trip.startDate && day.date <= trip.endDate;
  });
  const personNameById = new Map(persons.map((person) => [person.id, person.name]));
  const spentHkd = tripReceipts.reduce((sum, receipt) => sum + (Number(receipt.hkdAmount ?? receipt.total) || 0), 0);
  const budgetHkd = Number(trip.budget || state.budget || 0) / Math.max(1, Number(state.rate || 1));
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
      ],
    },
    trip: {
      name: trip.name || state.tripName || 'Trip',
      destination: trip.destinationSummary || '',
      startDate: trip.startDate || state.tripDateRange.start,
      endDate: trip.endDate || state.tripDateRange.end,
      currency: trip.currencies?.[1] || state.tripCurrency || 'JPY',
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
  const nextStop = payload.itinerary.flatMap((day) => day.spots.map((spot) => `${day.date} ${spot.time} ${spot.name}`)).find(Boolean) || 'No itinerary spot';
  const receiptLine = payload.receipts.length
    ? payload.receipts.slice(0, 3).map((receipt) => `${receipt.store} ${receipt.currency} ${Math.round(receipt.amount).toLocaleString('en-US')}`).join(' · ')
    : 'No receipts yet';
  const copiedText = [
    `${payload.trip.name} · Private trip share`,
    `${payload.trip.startDate} to ${payload.trip.endDate} · ${payload.trip.destination || 'Destination pending'}`,
    `Spend: ${formatMoney(spentHkd)} · Remaining: ${formatMoney(remainingHkd)} · Receipts: ${tripReceipts.length}`,
    `Next: ${nextStop}`,
    `Receipts: ${receiptLine}`,
    'Safe export: current trip only; no API keys, broker sessions, Notion/Supabase IDs, sync queue, or other trips.',
  ].join('\n');
  return {
    filename: safeShareFilename(payload.trip.name),
    copiedText,
    payload,
  };
}

function buildDiagnosticsPreview(
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

function buildBackupImportPreview(fileName: string, payload: Partial<AppState>, state: AppState, currentTrip: TripProfile): BackupImportPreview {
  const {
    credentialBrokerUrl: _credentialBrokerUrl,
    notionDb: _notionDb,
    syncQueue: _syncQueue,
    notionDeletedIds: _notionDeletedIds,
    notionDeletedSourceIds: _notionDeletedSourceIds,
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
    tripCount: importedTrips?.length || 0,
    receiptCount: receipts.length,
    targetTripName: targetTrip.name || currentTrip.name || 'Current trip',
    warnings,
  };
}

function todayLocalDate(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
}

function formatSyncAge(timestamp: number): string {
  if (!timestamp || !Number.isFinite(timestamp)) return 'never';
  const ageMs = Math.max(0, Date.now() - timestamp);
  const minutes = Math.floor(ageMs / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m old`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours}h old`;
  return `${Math.floor(hours / 24)}d old`;
}

function formatSessionExpiry(expiresAt: number): string {
  if (!expiresAt || !Number.isFinite(expiresAt)) return 'none';
  const leftMs = expiresAt - Date.now();
  if (leftMs <= 0) return 'expired';
  const minutes = Math.ceil(leftMs / 60_000);
  if (minutes < 60) return `${minutes}m left`;
  return `${Math.ceil(minutes / 60)}h left`;
}

function shortId(value: string): string {
  return value && value.length > 14 ? `${value.slice(0, 8)}...${value.slice(-4)}` : value || 'none';
}

function buildSyncReadinessDryRun(
  state: AppState,
  trip: TripProfile,
  syncState: SyncEngineState | undefined,
  cloudSyncAvailable: boolean,
  notionMirrorReady: boolean,
  brokerReady: boolean,
  storageScope: string,
) {
  const tripReceipts = scopedReceiptsForTrip(state, trip);
  const tripReceiptIds = new Set(tripReceipts.map((receipt) => receipt.id));
  const queue = syncQueueSummary(state.syncQueue).active;
  const relevantQueue = queue.filter((item) => (
    item.type === 'settings'
    || item.entityId === trip.id
    || item.payload?.tripId === trip.id
    || tripReceiptIds.has(item.entityId)
  ));
  const failedQueue = relevantQueue.filter((item) => item.status === 'error' || item.status === 'failed');
  const pendingQueue = relevantQueue.filter((item) => item.status !== 'error' && item.status !== 'failed');
  const destructiveQueue = relevantQueue.filter((item) => item.op === 'delete' || item.type === 'delete-receipt');
  const receiptQueue = relevantQueue.filter((item) => item.type === 'receipt' || item.type === 'delete-receipt');
  const tripQueue = relevantQueue.filter((item) => item.type === 'trip');
  const settingsQueue = relevantQueue.filter((item) => item.type === 'settings');
  const queueKeyCounts = new Map<string, number>();
  relevantQueue.forEach((item) => {
    const key = `${item.type}:${item.entityId}`;
    queueKeyCounts.set(key, (queueKeyCounts.get(key) || 0) + 1);
  });
  const duplicateQueueKeys = Array.from(queueKeyCounts.values()).filter((count) => count > 1).length;
  const failedQueueKeys = new Set(failedQueue.map((item) => `${item.type}:${item.entityId}`));
  const receiptConflictCount = tripReceipts.filter((receipt) => (
    (receipt.syncStatus === 'error' || receipt.syncStatus === 'failed') && !failedQueueKeys.has(`receipt:${receipt.id}`)
  )).length;
  const conflictSignals = failedQueue.length + duplicateQueueKeys + receiptConflictCount;
  const oldestQueuedAt = relevantQueue.reduce((oldest, item) => {
    const stamp = Number(item.createdAt || item.updatedAt || 0);
    if (!stamp) return oldest;
    return oldest ? Math.min(oldest, stamp) : stamp;
  }, 0);
  const target = cloudSyncAvailable
    ? notionMirrorReady ? 'Supabase + Notion' : 'Supabase only'
    : brokerReady ? 'Broker / Notion' : storageScope;
  const statusLabel = conflictSignals
    ? 'Review first'
    : relevantQueue.length
      ? 'Ready dry run'
      : 'Queue clear';
  return {
    tone: conflictSignals ? 'warning' : relevantQueue.length ? 'info' : 'ok',
    statusLabel,
    helper: 'Local dry run only; no provider, broker, Supabase, or Notion calls are made here.',
    items: [
      {
        key: 'pending',
        title: 'Queued changes',
        value: failedQueue.length ? `${failedQueue.length} failed` : pendingQueue.length ? `${pendingQueue.length} pending` : 'None',
        detail: `${receiptQueue.length} receipt · ${tripQueue.length} trip · ${settingsQueue.length} settings`,
      },
      {
        key: 'conflicts',
        title: 'Conflict signals',
        value: conflictSignals ? `${conflictSignals} signal${conflictSignals === 1 ? '' : 's'}` : 'Clear',
        detail: failedQueue.length ? `${failedQueue.length} failed queue item${failedQueue.length === 1 ? '' : 's'}` : 'No failed queue',
      },
      {
        key: 'age',
        title: 'Offline age',
        value: oldestQueuedAt ? formatSyncAge(oldestQueuedAt) : 'No queue',
        detail: `Last sync ${formatSyncAge(syncState?.lastSyncedAt || state.lastSyncedAt || 0)}`,
      },
      {
        key: 'target',
        title: 'Push target',
        value: target,
        detail: syncState?.status ? `Engine ${syncState.status}` : 'Local queue snapshot',
      },
    ],
    warnings: [
      'Dry run only',
      'No provider calls',
      ...(destructiveQueue.length ? [`${destructiveQueue.length} delete queued`] : []),
      ...(conflictSignals ? ['Review conflicts before Push All'] : relevantQueue.length ? ['Backup before long offline push'] : ['Nothing pending to push']),
    ],
  };
}

function buildTripScopeAudit(state: AppState, trip: TripProfile) {
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

export function Settings({
  state,
  setState,
  updateState,
  onReset,
  syncState,
  onPull,
  onPush,
  onPushSettings,
  cloudSyncAvailable = false,
  storageScope = 'local',
  supabaseAccountId = '',
  supabaseSessionExpiresAt = 0,
  changeTab,
  updatePassword,
  userEmail = null,
  onSignOut,
  onClearDeviceData,
}: {
  state: AppState;
  setState: Dispatch<SetStateAction<AppState>>;
  updateState: (patch: Partial<AppState>) => void;
  onReset: () => void;
  syncState?: SyncEngineState;
  onPull?: () => Promise<void>;
  onPush?: () => Promise<void>;
  onPushSettings?: () => Promise<void>;
  cloudSyncAvailable?: boolean;
  storageScope?: string;
  supabaseAccountId?: string;
  supabaseSessionExpiresAt?: number;
  changeTab?: (tabId: any) => void;
  updatePassword?: (password: string) => Promise<void>;
  userEmail?: string | null;
  onSignOut?: () => Promise<void> | void;
  onClearDeviceData?: () => Promise<void> | void;
}) {
  const supabaseAuth = useSupabaseAuth();
  const persons = getPersons(state);
  const currentTrip = activeTrip(state);
  const trips = state.trips?.length ? state.trips : [currentTrip];
  const currenciesForTrip = (trip: Partial<TripProfile> | undefined) => {
    const tripCurrencies = Array.isArray(trip?.currencies) && trip.currencies.length ? trip.currencies : [];
    return Array.from(new Set(['HKD', state.tripCurrency || 'JPY', ...tripCurrencies]));
  };
  const nonHomeCurrencyForTrip = (trip: Partial<TripProfile> | undefined, fallback = 'JPY') => (
    currenciesForTrip(trip).find((code) => code !== (trip?.homeCurrency || 'HKD')) || fallback
  );
  const activeTripSettlementState = {
    ...state,
    receipts: scopedReceiptsForTrip(state, currentTrip),
  };
  const settlement = computeSettlements(activeTripSettlementState);
  const tripPrefix = currencyPrefix(getResolvedTripCurrency(state, currentTrip));
  const shareRatios = state.shareRatios || {};
  const ratioTotal = persons.reduce((sum, person) => sum + Math.max(0, Number(shareRatios[person.id]) || 0), 0);
  const [isMobile, setIsMobile] = useState(() => typeof window !== 'undefined' && window.innerWidth <= 768);
  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth <= 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState('');
  const [newPersonName, setNewPersonName] = useState('');
  const [tripParagraph, setTripParagraph] = useState('');
  const [tripDraft, setTripDraft] = useState<TripDraft | null>(null);
  const [editableTripDraft, setEditableTripDraft] = useState<TripDraft | null>(null);
  const [tripReviewDayIndex, setTripReviewDayIndex] = useState(0);
  const [tripDraftModalOpen, setTripDraftModalOpen] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus | null>(null);
  const [rotationProvider, setRotationProvider] = useState<CredentialProvider>('notion');
  const [rotationSecret, setRotationSecret] = useState('');
  const [rotationAdmin, setRotationAdmin] = useState('');
  const [rotationDb, setRotationDb] = useState(state.notionDb || '');
  const [apiKeyModalOpen, setApiKeyModalOpen] = useState(false);
  const [apiKeyProvider, setApiKeyProvider] = useState<CredentialProvider>('kimi');
  const [apiKeySecret, setApiKeySecret] = useState('');
  const [apiKeyAdmin, setApiKeyAdmin] = useState('');
  const [apiKeyStatus, setApiKeyStatus] = useState<'idle' | 'testing' | 'success' | 'error'>('idle');
  const [apiKeyMessage, setApiKeyMessage] = useState('');
  const [brokerPassword, setBrokerPassword] = useState('');
  const [directNotionToken, setDirectNotionToken] = useState(getDirectNotionToken);
  const [personalNotionToken, setPersonalNotionToken] = useState('');
  const [personalNotionDb, setPersonalNotionDb] = useState(state.notionDb || '');
  const [personalNotionStatus, setPersonalNotionStatus] = useState<PersonalNotionStatus | null>(null);
  const [schemaDiag, setSchemaDiag] = useState<Array<{ name: string; type: string; mapped: string | null }> | null>(null);
  const [mappingDiag, setMappingDiag] = useState<ReactMappingDiagnostics | null>(null);
  const [newPasswordInput, setNewPasswordInput] = useState('');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showClearDeviceConfirm, setShowClearDeviceConfirm] = useState(false);
  const [showClearLocalPreview, setShowClearLocalPreview] = useState(false);
  const [deleteConfirmEmailInput, setDeleteConfirmEmailInput] = useState('');
  const [showDeleteAccountConfirm, setShowDeleteAccountConfirm] = useState(false);
  const [deleteAccountError, setDeleteAccountError] = useState('');
  const [backupPreview, setBackupPreview] = useState<BackupImportPreview | null>(null);
  const [tripSharePreview, setTripSharePreview] = useState<TripSharePreview | null>(null);
  const [diagnosticsPreview, setDiagnosticsPreview] = useState<DiagnosticsPreview | null>(null);
  const [sharingInviteEmail, setSharingInviteEmail] = useState('');
  const [sharingInviteName, setSharingInviteName] = useState('');
  const [sharingInviteRole, setSharingInviteRole] = useState<TripSharingInviteDraft['role']>('editor');
  const [sharingInvitePerson, setSharingInvitePerson] = useState(true);
  const [createdInviteLinks, setCreatedInviteLinks] = useState<Array<{ email: string; link: string }>>([]);
  const tripUpdateModelId = state.tripUpdateModel || DEFAULT_KIMI_PRIMARY_MODEL_ID;
  const tripUpdateModelName = aiModelLabel(tripUpdateModelId);
  const tripPreviewStats = tripDraft ? tripDraftPreviewStats(tripDraft) : null;
  const tripReviewDraft = editableTripDraft || tripDraft;
  const tripReviewStats = tripReviewDraft ? tripDraftPreviewStats(tripReviewDraft) : null;
  const tripReviewDays = tripReviewDraft?.trip.itinerary || [];
  const tripReviewDay = tripReviewDays[Math.min(tripReviewDayIndex, Math.max(0, tripReviewDays.length - 1))];
  const tripReviewWarnings = tripReviewDraft ? tripReviewNotices(tripReviewDraft) : [];
  const tripSharing: TripSharingState = currentTrip.sharing || {
    role: 'owner',
    isShared: false,
    memberCount: 1,
    pendingInviteCount: 0,
    members: [{ userId: 'owner', role: 'owner', status: 'active', displayName: userEmail || 'You' }],
    invites: [],
    backendHealth: { status: 'missing' },
  };
  const canManageTripSharing = tripSharing.role === 'owner' || tripSharing.role === 'admin';
  const sharingMembers = tripSharing.members || [];
  const sharingInvites = tripSharing.invites || [];
  const sharingSession = supabaseAuth.session;

  useModalOpenClass(tripDraftModalOpen);

  useEffect(() => {
    if (!tripDraftModalOpen || !tripDraft) return;
    setEditableTripDraft(cloneTripDraft(tripDraft));
    setTripReviewDayIndex(0);
  }, [tripDraft, tripDraftModalOpen]);

  const handleUpdatePassword = async () => {
    if (!updatePassword || newPasswordInput.length < 6) return;
    setBusy('設定密碼');
    setStatus('');
    try {
      await updatePassword(newPasswordInput);
      setStatus('成功喺雲端為你嘅帳號設定密碼！以後喺新裝置可以直接用呢個密碼登入 🔑');
      setNewPasswordInput('');
    } catch (err) {
      setStatus(`設定密碼失敗：${redactedError(err)}`);
    } finally {
      setBusy('');
    }
  };

  const handleSupabaseSignOut = async () => {
    if (!onSignOut) return;
    setBusy('登出 Supabase');
    setStatus('');
    try {
      await onSignOut();
    } catch (err) {
      setStatus(`登出失敗：${redactedError(err)}`);
    } finally {
      setBusy('');
    }
  };

  const handleClearDeviceAndSignOut = async () => {
    if (!onClearDeviceData || !onSignOut) return;
    setBusy('清除裝置資料');
    setStatus('');
    try {
      await onClearDeviceData();
      await onSignOut();
      setShowClearDeviceConfirm(false);
      // In-memory state still holds the wiped data and the persistence effect would write it
      // straight back — reload so the wipe actually sticks (same pattern as delete-account).
      setTimeout(() => { window.location.reload(); }, 300);
    } catch (err) {
      setStatus(`清除裝置資料失敗：${redactedError(err)}`);
    } finally {
      setBusy('');
    }
  };

  const handleDeleteAccount = async () => {
    if (!onClearDeviceData || !onReset) {
      setDeleteAccountError('缺少必要參數，無法刪除帳戶。');
      return;
    }
    setBusy('永久刪除帳戶');
    setStatus('');
    setDeleteAccountError('');
    try {
      // 1. Notion best-effort 歸檔（只處理私有旅程）
      const privateTrips = (state.trips || []).filter(
        t => t.supabaseId && t.sharing?.role === 'owner' && !t.sharing?.isShared
      );
      for (const trip of privateTrips) {
        if (trip.notionPageId) {
          const notionState = { ...state, activeTripId: trip.id };
          await notionFetch(notionState, `/pages/${trip.notionPageId}`, {
            method: 'PATCH',
            body: JSON.stringify({ archived: true })
          }).catch((e: any) => console.warn('[Notion] archive trip failed:', e));
          const receipts = state.receipts.filter(r => r.tripId === trip.id && r.notionPageId);
          for (const receipt of receipts) {
            await archiveReceipt(state, receipt).catch((e: any) => console.warn('[Notion] archive receipt failed:', e));
          }
        }
      }

      // 2. 呼叫 Supabase 註銷 RPC（會刪除 auth.users，共享旅程自動轉移擁有權）
      await supabaseAuth.deleteUserAccount();

      // 3. 清理本地所有資料 + 重設 app 狀態
      await onClearDeviceData();
      await onReset();

      // 4. 關閉 modal 並強制重新載入（確保 auth gate 重新評估）
      setShowDeleteAccountConfirm(false);
      setDeleteConfirmEmailInput('');
      setStatus('帳戶及私有資料已永久刪除 💨');

      // 強制重新載入確保 auth 狀態同步
      setTimeout(() => { window.location.reload(); }, 300);
    } catch (err) {
      console.error('[DeleteAccount]', err);
      const msg = err instanceof Error ? err.message : '刪除帳戶失敗，請重試';
      setDeleteAccountError(msg);
      setStatus(msg);
    } finally {
      setBusy('');
    }
  };

  const handleClearLocalData = async () => {
    setBusy('清除資料');
    setStatus('');
    try {
      await onReset();
      setShowClearLocalPreview(false);
      setStatus('已清除 React 本地紀錄、broker session、裝置信任同快取。');
    } catch (error) {
      setStatus(`清除失敗：${redactedError(error)}`);
    } finally {
      setBusy('');
    }
  };

  const itineraryInput = useRef<HTMLInputElement | null>(null);
  const backupInput = useRef<HTMLInputElement | null>(null);
  const brokerReady = hasCredentialBrokerSession(state);
  const notionMirrorReady = canUseNotionMirror(state, cloudSyncAvailable, userEmail);
  const userScopedNotionDb = hasUserScopedNotionDatabase(state);
  const publicSupabaseOnly = cloudSyncAvailable && !notionMirrorReady;
  const resolvedNotionDb = configuredNotionDatabaseId(state);
  const notionMirrorDbLabel = notionMirrorReady ? resolvedNotionDb : 'Personal Notion 未連接';
  const notionActionDisabled = !!busy || publicSupabaseOnly;
  const directTokenEnabled = true;
  const buildLabel = `v${APP_VERSION}`;
  const tripDoctor = useMemo(() => compactTripDoctor(state, currentTrip, persons, syncState, cloudSyncAvailable, notionMirrorReady, storageScope), [state, currentTrip, persons, syncState, cloudSyncAvailable, notionMirrorReady, storageScope]);
  const syncReadiness = useMemo(() => buildSyncReadinessDryRun(state, currentTrip, syncState, cloudSyncAvailable, notionMirrorReady, brokerReady, storageScope), [state, currentTrip, syncState, cloudSyncAvailable, notionMirrorReady, brokerReady, storageScope]);
  const tripScopeAudit = useMemo(() => buildTripScopeAudit(state, currentTrip), [state, currentTrip]);
  const failedSyncCount = syncState?.failedCount || 0;
  const pendingSyncCount = syncState?.pendingCount || 0;
  const syncPillTone = syncState?.status === 'error' || failedSyncCount ? 'danger' : pendingSyncCount ? 'warning' : 'ok';
  const syncPillDetail = failedSyncCount
    ? ` · ${failedSyncCount} failed${pendingSyncCount ? ` · ${pendingSyncCount} pending` : ''}`
    : pendingSyncCount
      ? ` · ${pendingSyncCount}`
      : '';
  const queueSummary = syncQueueSummary(state.syncQueue);
  const queuePendingCount = Math.max(pendingSyncCount, queueSummary.pending.length);
  const queueFailedCount = Math.max(failedSyncCount, queueSummary.failed.length);
  const syncTarget = cloudSyncAvailable ? (notionMirrorReady ? 'Supabase + Notion' : 'Supabase only') : (brokerReady ? 'Broker / Notion' : storageScope);
  const storageAccountId = storageScope.startsWith('supabase:') ? storageScope.slice('supabase:'.length) : '';
  const accountSyncHealth = [
    { key: 'account', title: 'Account', value: userEmail ? 'Signed in' : 'Local device', detail: userEmail || shortId(supabaseAccountId || storageAccountId) },
    { key: 'session', title: 'Session', value: cloudSyncAvailable ? formatSessionExpiry(supabaseSessionExpiresAt) : 'Local', detail: brokerReady ? 'Broker active' : 'Broker missing' },
    { key: 'storage', title: 'Storage scope', value: storageAccountId ? 'Supabase scoped' : 'Local', detail: storageAccountId ? shortId(storageAccountId) : storageScope },
    { key: 'backend', title: 'Backend target', value: syncTarget, detail: syncState?.status || state.globalSyncStatus || 'local' },
    { key: 'trip', title: 'Active trip', value: currentTrip.name || 'Current trip', detail: shortId(currentTrip.id || state.activeTripId || '') },
    { key: 'push', title: 'Last push', value: formatSyncAge(syncState?.lastSyncedAt || state.lastSyncedAt || 0), detail: `${queuePendingCount} pending · ${queueFailedCount} failed` },
    { key: 'pull', title: 'Last pull', value: formatSyncAge(state.settingsPulledAt || 0), detail: `Auto sync ${state.autoSync ? 'on' : 'off'}` },
  ];
  const activeQueue = queueSummary.active;
  const queueReportText = JSON.stringify({
    generatedAt: new Date().toISOString(),
    storageScope,
    account: userEmail || shortId(supabaseAccountId || storageAccountId),
    syncStatus: syncState?.status || state.globalSyncStatus || 'local',
    pending: queuePendingCount,
    failed: queueFailedCount,
    queue: activeQueue.map((item) => ({
      type: item.type,
      op: item.op,
      status: item.status,
      attempts: item.attempts,
      age: formatSyncAge(item.updatedAt || item.createdAt),
      entity: shortId(item.entityId),
      error: item.error || '',
    })),
  }, null, 2);

  // Local state for Trip Manager
  const [managerTripId, setManagerTripId] = useState(currentTrip.id);
  const managedTrip = trips.find(t => t.id === managerTripId) || currentTrip;
  // Only the owner/admin of a shared trip may delete it (RLS enforces this server-side too).
  const canDeleteManagedTrip = !managedTrip.sharing || managedTrip.sharing.role === 'owner' || managedTrip.sharing.role === 'admin';

  const [mgrName, setMgrName] = useState(managedTrip.name);
  const [mgrDest, setMgrDest] = useState(managedTrip.destinationSummary || '');
  const [mgrStart, setMgrStart] = useState(managedTrip.startDate || '');
  const [mgrEnd, setMgrEnd] = useState(managedTrip.endDate || '');
  const [mgrBudget, setMgrBudget] = useState(String(managedTrip.budget || 0));
  const [mgrCurrency, setMgrCurrency] = useState(nonHomeCurrencyForTrip(managedTrip));
  const [mgrArchived, setMgrArchived] = useState(!!managedTrip.archived);
  const [mgrTripStyle, setMgrTripStyle] = useState(managedTrip.intelligence?.tripStyle || 'balanced');
  const [mgrHomeCity, setMgrHomeCity] = useState(managedTrip.intelligence?.homeCity || 'Hong Kong');
  const [mgrWeatherPreference, setMgrWeatherPreference] = useState(managedTrip.intelligence?.weatherPreference || 'balanced');
  const managedTripVersionKey = `${managedTrip.id}:${managedTrip.updatedAt || 0}:${managedTrip.version || 0}`;
  const [newManagedTripName, setNewManagedTripName] = useState('');
  const [newManagedTripDest, setNewManagedTripDest] = useState('');
  const [newManagedTripStart, setNewManagedTripStart] = useState('');
  const [newManagedTripEnd, setNewManagedTripEnd] = useState('');
  const [newManagedTripBudget, setNewManagedTripBudget] = useState('');
  const [newManagedTripCurrency, setNewManagedTripCurrency] = useState('JPY');
  const [newTripPanelOpen, setNewTripPanelOpen] = useState(false);
  const [editTripPanelOpen, setEditTripPanelOpen] = useState(false);

  // Sync state values when managed trip changes
  const handleSelectManagedTrip = (tripId: string) => {
    const target = trips.find(t => t.id === tripId);
    if (!target) return;
    setManagerTripId(tripId);
    setMgrName(target.name);
    setMgrDest(target.destinationSummary || '');
    setMgrStart(target.startDate || '');
    setMgrEnd(target.endDate || '');
    setMgrBudget(String(target.budget || 0));
    setMgrCurrency(nonHomeCurrencyForTrip(target));
    setMgrArchived(!!target.archived);
    setMgrTripStyle(target.intelligence?.tripStyle || 'balanced');
    setMgrHomeCity(target.intelligence?.homeCity || 'Hong Kong');
    setMgrWeatherPreference(target.intelligence?.weatherPreference || 'balanced');
  };

  // Keep managed trip in sync when active trip changes
  useEffect(() => {
    handleSelectManagedTrip(currentTrip.id);
  }, [currentTrip.id]);

  // Keep form fields updated if the underlying trip in the list is updated
  useEffect(() => {
    const target = trips.find(t => t.id === managerTripId);
    if (target) {
      setMgrName(target.name);
      setMgrDest(target.destinationSummary || '');
      setMgrStart(target.startDate || '');
      setMgrEnd(target.endDate || '');
      setMgrBudget(String(target.budget || 0));
      setMgrCurrency(nonHomeCurrencyForTrip(target));
      setMgrArchived(!!target.archived);
      setMgrTripStyle(target.intelligence?.tripStyle || 'balanced');
      setMgrHomeCity(target.intelligence?.homeCity || 'Hong Kong');
      setMgrWeatherPreference(target.intelligence?.weatherPreference || 'balanced');
    }
  }, [managerTripId, managedTripVersionKey]);

  useEffect(() => {
    setPersonalNotionDb(state.notionDb || '');
  }, [state.notionDb]);

  const [clickCount, setClickCount] = useState(0);
  const [showStressPanel, setShowStressPanel] = useState(() => localStorage.getItem('__stress_panel_unlocked') === 'true');
  const [stressLatency, setStressLatency] = useState(() => localStorage.getItem('__stress_latency') === 'true');
  const [stressFault, setStressFault] = useState(() => localStorage.getItem('__stress_fault') === 'true');

  const handleVersionClick = () => {
    setClickCount((prev) => {
      const next = prev + 1;
      if (next >= 5) {
        setShowStressPanel(true);
        localStorage.setItem('__stress_panel_unlocked', 'true');
        setStatus('🔓 已成功解鎖「開發者極限壓力與故障測試面板」！🚀✨');
        return 0;
      }
      return next;
    });
  };

  const toggleStressLatency = (val: boolean) => {
    localStorage.setItem('__stress_latency', String(val));
    setStressLatency(val);
    setStatus(val ? '⏳ 已開啟 5 秒同步網絡延遲模擬' : '⚡ 已關閉同步網絡延遲模擬');
  };

  const toggleStressFault = (val: boolean) => {
    localStorage.setItem('__stress_fault', String(val));
    setStressFault(val);
    setStatus(val ? '⚠️ 已開啟 Notion 同步 500 伺服器故障模擬' : '✅ 已關閉 Notion 同步故障模擬');
  };

  const handleMassInject = () => {
    void run('瞬間導入 1000 筆名古屋消費', async () => {
      const mockReceipts = generateMockReceipts(1000);
      setState((prev) => migrateAppState({
        ...prev,
        receipts: [...prev.receipts, ...mockReceipts],
      }));
      return '🎉 成功瞬間導入 1,000 筆 Nagoya 消費數據！請去 History 或 Dashboard 滾動驗收！';
    });
  };

  const handleTabSwitchTest = () => {
    if (!changeTab) {
      setStatus('⚠️ changeTab prop 缺失，無法啟動切換壓力測試');
      return new Promise<string>((resolve) => resolve('changeTab is missing'));
    }
    return run('自動高頻 Tab 切換壓力測試', async () => {
      return new Promise((resolve) => {
        simulateTabSwitching(changeTab, () => {
          resolve('🎉 自動 Tab 極速切換壓力測試完成！WebGL 內存已強制回收，React 狀態穩定！');
        });
      });
    });
  };

  async function run(label: string, fn: () => Promise<string>) {
    setBusy(label);
    setStatus(`${label}…`);
    try {
      setStatus(await fn());
    } catch (error) {
      setStatus(`${label}失敗：${redactedError(error)}`);
    } finally {
      setBusy('');
    }
  }

  function statusFor(provider: CredentialProvider): ProviderStatus {
    return connectionStatus?.providers.find((item) => item.provider === provider) || { provider, status: 'unknown' };
  }

  function statusPill(provider: CredentialProvider) {
    const item = statusFor(provider);
    const ok = item.status === 'connected';
    return <span className={`pill ${ok ? 'ok' : item.status === 'missing' ? '' : 'hot'}`}>{ok ? <CheckCircle2 size={14} /> : <AlertTriangle size={14} />} {provider}: {item.status}</span>;
  }

  function openSettingsPanel(id: string) {
    const trigger = document.querySelector<HTMLButtonElement>(`[aria-controls="${id}-panel"]`);
    if (trigger && trigger.getAttribute('aria-expanded') !== 'true') trigger.click();
    window.setTimeout(() => trigger?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 40);
  }

  async function refreshCredentialStatus() {
    await run('Credential status', async () => {
      const [health, statusResult] = await Promise.all([
        brokerHealth(state),
        getConnectionStatus(state),
      ]);
      setConnectionStatus(statusResult);
      return `${health} · ${statusResult.providers.map((item) => `${item.provider}:${item.status}`).join(' · ')}`;
    });
  }

  async function connectCredentialBroker() {
    const password = brokerPassword.trim();
    if (!password) {
      setStatus('請輸入 Credential Broker password');
      return;
    }
    try {
      await run('Connect broker', async () => {
        const session = await unlockCredentialBroker(
          password,
          { credentialBrokerUrl: state.credentialBrokerUrl },
          undefined,
          { persist: !cloudSyncAvailable },
        );
        updateState({
          credentialSession: session.credentialSession,
          credentialSessionExpiresAt: session.credentialSessionExpiresAt,
        });
        if (cloudSyncAvailable) clearCredentialSession();
        return cloudSyncAvailable
          ? 'Broker session 已連上；今次 Supabase session 可使用 AI，並可同步 mirror 到 Notion。'
          : 'Broker session 已連上。';
      });
    } finally {
      setBrokerPassword('');
    }
  }

  async function rotateCredential() {
    try {
      if (!requireBroker('Rotate credential')) return;
      if (!rotationSecret.trim() || !rotationAdmin.trim()) {
        setStatus('請輸入新 credential 同 admin maintenance passphrase');
        return;
      }
      await run(`Rotate ${rotationProvider}`, async () => {
        const statusResult = await rotateProviderCredential(
          state,
          rotationProvider,
          rotationSecret,
          rotationAdmin,
          rotationProvider === 'notion' ? { databaseId: rotationDb.trim() || state.notionDb } : {},
        );
        setConnectionStatus((prev) => ({
          broker: prev?.broker || 'online',
          providers: [
            ...(prev?.providers || []).filter((item) => item.provider !== rotationProvider),
            statusResult,
          ],
        }));
        return `${rotationProvider} 已安全更新：${statusResult.status}`;
      });
    } finally {
      setRotationSecret('');
      setRotationAdmin('');
    }
  }

  function applyPersonalNotionConnection(databaseId: string, connected: boolean) {
    const cleanDb = databaseId.trim();
    setState((prev) => {
      const now = Date.now();
      const trips = (prev.trips || []).map((trip) => {
        const { notionDb: _notionDb, ...localTrip } = trip;
        return { ...localTrip, updatedAt: trip.updatedAt };
      });
      const latest = new Map<string, SyncQueueItem>();
      const settingsItem: SyncQueueItem = {
        id: `sync_${now}_${Math.random().toString(16).slice(2)}`,
        type: 'settings',
        entityId: 'app-settings',
        op: 'upsert',
        status: 'queued',
        attempts: 0,
        createdAt: now,
        updatedAt: now,
        payload: { updatedAt: now },
      };
      for (const item of [...(prev.syncQueue || []), settingsItem]) {
        if (item.status === 'synced') continue;
        latest.set(`${item.type}:${item.entityId}`, item);
      }
      return migrateAppState({
        ...prev,
        notionDb: cleanDb || prev.notionDb,
        personalNotionConnected: connected,
        trips,
        settingsUpdatedAt: now,
        syncQueue: [...latest.values()].slice(-500),
      });
    });
  }

  async function refreshPersonalNotion() {
    if (!cloudSyncAvailable) {
      setStatus('Personal Notion 需要先登入 Supabase。');
      return;
    }
    await run('Personal Notion status', async () => {
      const result = await getPersonalNotionIntegration(state);
      setPersonalNotionStatus(result);
      if (result.databaseId) {
        setPersonalNotionDb(result.databaseId);
        applyPersonalNotionConnection(result.databaseId, result.status === 'connected');
      } else {
        applyPersonalNotionConnection('', result.status === 'connected');
      }
      return result.status === 'connected'
        ? `Personal Notion 已連接：${result.databaseId || 'database ready'}`
        : `Personal Notion 狀態：${result.status}`;
    });
  }

  async function connectPersonalNotion() {
    if (!cloudSyncAvailable) {
      setStatus('請先登入 Supabase，先可以綁定你自己嘅 Notion notebook。');
      return;
    }
    const secret = personalNotionToken.trim();
    const databaseId = personalNotionDb.trim();
    if (!secret || !databaseId) {
      setStatus('請輸入你自己嘅 Notion connector secret 同 database ID。');
      return;
    }
    try {
      await run('Connect Personal Notion', async () => {
        const result = await registerPersonalNotionIntegration(state, secret, databaseId);
        setPersonalNotionStatus(result);
        applyPersonalNotionConnection(result.databaseId || databaseId, result.status === 'connected');
        return `Personal Notion 已安全連接：${result.databaseId || databaseId}`;
      });
    } finally {
      setPersonalNotionToken('');
    }
  }

  async function disconnectPersonalNotion() {
    if (!cloudSyncAvailable) {
      setStatus('請先登入 Supabase。');
      return;
    }
    await run('Disconnect Personal Notion', async () => {
      const result = await disconnectPersonalNotionIntegration(state);
      setPersonalNotionStatus(result);
      applyPersonalNotionConnection('', false);
      return '已斷開 Personal Notion mirror；Supabase 資料仍會保留。';
    });
  }

  async function refreshRate() {
    await run('更新匯率', async () => {
      const snapshot = await fetchLiveCurrencySnapshot();
      // Re-check rateMode at apply time via the functional updater, not the closed-over `state` from
      // when this async function started — the user could have switched to Fixed (and typed a manual
      // rate) while this fetch was in flight; a stale live response must not silently overwrite that.
      setState((current) => current.rateMode === 'fixed' ? current : { ...current, ...appRatePatchFromSnapshot(snapshot) });
      return `已更新：1 HKD = ${snapshot.rates.JPY.toFixed(2)} JPY（${snapshot.source}）`;
    });
  }

  function requireBroker(label: string, allowCloudSync = false) {
    if (brokerReady || hasDirectNotionToken() || (allowCloudSync && cloudSyncAvailable)) return true;
    setStatus(`${label} 已安全暫停：Credential Broker session 未連線；未送出任何 provider key/token。`);
    return false;
  }

  function requireNotionMirror(label: string) {
    if (notionMirrorReady) return true;
    const message = notionMirrorGuardMessage(state, cloudSyncAvailable, userEmail);
    setStatus(`${label} 已安全暫停：${message || 'Notion mirror 未設定。'}`);
    return false;
  }

  function updatePerson(id: string, patch: Partial<Person>) {
    updateState({ persons: persons.map((p) => (p.id === id ? { ...p, ...patch } : p)) });
  }

  function addPerson() {
    const name = newPersonName.trim();
    if (!name) {
      setStatus('請先輸入旅伴名字');
      return;
    }
    const next: Person = {
      id: `p_${Date.now().toString(36)}_${Math.random().toString(16).slice(2, 6)}`,
      name,
      emoji: '旅',
      color: COLORS[persons.length % COLORS.length],
    };
    updateState({ persons: [...persons, next], shareRatios: { ...state.shareRatios, [next.id]: 1 } });
    setNewPersonName('');
    setStatus(`已新增旅伴：${next.name}`);
  }

  function removePerson(id: string) {
    if (persons.length <= 1) {
      setStatus('最少要保留一位旅伴');
      return;
    }
    const fallback = persons.find((p) => p.id !== id) || persons[0];
    const shareRatios = { ...state.shareRatios };
    delete shareRatios[id];
    setState((prev) => ({
      ...prev,
      persons: persons.filter((p) => p.id !== id),
      shareRatios,
      receipts: prev.receipts.map((r) => ({
        ...r,
        personId: r.personId === id ? fallback.id : r.personId,
        beneficiaryId: r.beneficiaryId === id ? undefined : r.beneficiaryId,
      })),
    }));
    setStatus('已移除旅伴，相關 receipt 已轉到第一位旅伴');
  }

  function resetShareRatios() {
    updateState({ shareRatios: Object.fromEntries(persons.map((person) => [person.id, 1])) });
    setStatus('已重設為均分比例');
  }

  function patchCurrentTripSharing(updater: (sharing: TripSharingState) => TripSharingState) {
    setState((prev) => {
      const now = Date.now();
      const prevTrips = prev.trips?.length ? prev.trips : [activeTrip(prev)];
      return migrateAppState({
        ...prev,
        trips: prevTrips.map((trip) => {
          if (trip.id !== currentTrip.id) return trip;
          const baseSharing: TripSharingState = trip.sharing || tripSharing;
          return { ...trip, sharing: updater(baseSharing), updatedAt: now };
        }),
        settingsUpdatedAt: now,
      });
    });
  }

  async function createSharingInvite() {
    const email = sharingInviteEmail.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setStatus('請輸入有效 email。');
      return;
    }
    if (!cloudSyncAvailable || !sharingSession) {
      setStatus('旅程共享需要先登入 Supabase。');
      return;
    }
    if (!canManageTripSharing) {
      setStatus('只有 owner/admin 可以邀請新成員。');
      return;
    }
    const draft: TripSharingInviteDraft = {
      email,
      role: sharingInviteRole,
      displayName: sharingInviteName.trim() || undefined,
      createAccountingPerson: sharingInvitePerson,
    };
    await run('建立旅程邀請', async () => {
      const invite = await createSupabaseTripInvite(sharingSession, state, currentTrip, draft);
      const link = invite.token ? inviteLinkForToken(invite.token) : '';
      patchCurrentTripSharing((sharing) => {
        const nextInvites = [
          ...(sharing.invites || []).filter((item) => item.email.toLowerCase() !== invite.email.toLowerCase()),
          invite,
        ];
        return {
          ...sharing,
          role: sharing.role || 'owner',
          isShared: true,
          invites: nextInvites,
          pendingInviteCount: nextInvites.filter((item) => item.status === 'pending').length,
        };
      });
      if (link) setCreatedInviteLinks((current) => [{ email: invite.email, link }, ...current.filter((item) => item.email !== invite.email)].slice(0, 6));
      setSharingInviteEmail('');
      setSharingInviteName('');
      setSharingInviteRole('editor');
      setSharingInvitePerson(true);
      return link ? `已建立 ${invite.email} 邀請；可複製 invite link。` : `已建立 ${invite.email} 邀請。`;
    });
  }

  async function revokeSharingInvite(invite: TripInviteSummary) {
    if (!sharingSession) {
      setStatus('請先登入 Supabase。');
      return;
    }
    await run('撤回旅程邀請', async () => {
      await revokeSupabaseTripInvite(sharingSession, invite.id);
      patchCurrentTripSharing((sharing) => {
        const nextInvites = (sharing.invites || []).filter((item) => item.id !== invite.id);
        return {
          ...sharing,
          invites: nextInvites,
          pendingInviteCount: nextInvites.filter((item) => item.status === 'pending').length,
        };
      });
      setCreatedInviteLinks((current) => current.filter((item) => item.email !== invite.email));
      return `已撤回 ${invite.email} 嘅邀請。`;
    });
  }

  async function updateSharingMemberRole(userId: string, role: Exclude<TripMemberRole, 'owner'>) {
    if (!sharingSession) {
      setStatus('請先登入 Supabase。');
      return;
    }
    await run('更新成員角色', async () => {
      await updateSupabaseTripMemberRole(sharingSession, currentTrip, userId, role);
      patchCurrentTripSharing((sharing) => ({
        ...sharing,
        members: (sharing.members || []).map((member) => member.userId === userId ? { ...member, role } : member),
      }));
      return '已更新成員角色。';
    });
  }

  async function removeSharingMember(userId: string, label: string) {
    if (!sharingSession) {
      setStatus('請先登入 Supabase。');
      return;
    }
    if (!window.confirm(`確定移除 ${label || 'this member'}？對方會即時失去此旅程存取權，但歷史記帳仍會保留。`)) return;
    await run('移除旅程成員', async () => {
      await removeSupabaseTripMember(sharingSession, currentTrip, userId);
      patchCurrentTripSharing((sharing) => {
        const nextMembers = (sharing.members || []).filter((member) => member.userId !== userId);
        return {
          ...sharing,
          members: nextMembers,
          memberCount: Math.max(1, nextMembers.length),
          isShared: nextMembers.length > 1 || (sharing.invites || []).length > 0,
        };
      });
      return `已移除 ${label || 'member'}。`;
    });
  }

  function saveLocalSettingsNow() {
    saveState(migrateAppState(state), storageScope);
    setStatus('本機設定已保存；provider credentials/session 已自動排除。');
  }

  async function pullPendingEmail() {
    if (!requireNotionMirror('Pull pending email')) return;
    await run('Pull pending email', async () => {
      const pulled = await pullAll(state);
      const pending = pulled.filter(isPendingReceipt);
      if (pending.length) {
        setState((prev) => {
          const map = new Map(prev.receipts.map((receipt) => [receipt.id, receipt]));
          for (const receipt of pending) map.set(receipt.id, { ...map.get(receipt.id), ...receipt });
          return migrateAppState({ ...prev, receipts: [...map.values()] });
        });
      }
      return pending.length ? `已拉取 ${pending.length} 筆待確認 email 紀錄` : `已同步檢查 ${pulled.length} 筆，暫時無待確認 email`;
    });
  }

  function selectTrip(tripId: string) {
    const trip = trips.find((item) => item.id === tripId);
    if (!trip) return;
    if (trip.archived) {
      setStatus('呢個旅程已封存；請先改回「進行中」並儲存，然後再切換為 active。');
      return;
    }
    const selectedTrip = { ...trip, archived: false, active: true, updatedAt: Date.now() };
    updateState({
      activeTripId: selectedTrip.id,
      trips: trips.map((item) => item.id === selectedTrip.id ? selectedTrip : { ...item, active: false }),
      tripName: selectedTrip.name,
      tripDateRange: { start: selectedTrip.startDate, end: selectedTrip.endDate },
      tripCurrency: nonHomeCurrencyForTrip(selectedTrip, state.tripCurrency),
      budget: selectedTrip.budget ?? state.budget,
      customItinerary: selectedTrip.itinerary,
    });
  }

  function applyTripDraft(draft: TripDraft) {
    setState((prev) => {
      const now = Date.now();
      const prevTrips = prev.trips?.length ? prev.trips : [activeTrip(prev)];
      const exists = prevTrips.some((trip) => trip.id === draft.trip.id);
      const tripsNext = exists
        ? prevTrips.map((trip) => trip.id === draft.trip.id ? { ...draft.trip, active: true, archived: false } : { ...trip, active: false })
        : [...prevTrips.map((trip) => ({ ...trip, active: false })), { ...draft.trip, active: true, archived: false }];
      const tripSyncItem: SyncQueueItem = {
        id: `sync_${now}_${Math.random().toString(16).slice(2)}`,
        type: 'trip',
        entityId: draft.trip.id,
        op: exists ? 'update' : 'create',
        status: 'queued',
        attempts: 0,
        createdAt: now,
        updatedAt: now,
        payload: {
          sourceId: draft.trip.sourceId || `trip_${draft.trip.id}`,
          updatedAt: draft.trip.updatedAt,
        },
      };
      const settingsSyncItem: SyncQueueItem = {
        id: `sync_${now}_${Math.random().toString(16).slice(2)}`,
        type: 'settings',
        entityId: 'app-settings',
        op: 'upsert',
        status: 'queued',
        attempts: 0,
        createdAt: now,
        updatedAt: now,
        payload: { updatedAt: now },
      };
      return migrateAppState({
        ...prev,
        activeTripId: draft.trip.id,
        trips: tripsNext,
        tripName: draft.trip.name,
        tripDateRange: { start: draft.trip.startDate, end: draft.trip.endDate },
        tripCurrency: nonHomeCurrencyForTrip(draft.trip, prev.tripCurrency),
        budget: draft.trip.budget,
        customItinerary: draft.trip.itinerary,
        settingsUpdatedAt: now,
        syncQueue: [
          ...(prev.syncQueue || []).filter((item) => (
            item.status !== 'synced' &&
            !(item.type === 'trip' && item.entityId === draft.trip.id) &&
            !(item.type === 'settings' && item.entityId === 'app-settings')
          )),
          tripSyncItem,
          settingsSyncItem,
        ].slice(-500),
      });
    });
    setTripDraft(null);
    setEditableTripDraft(null);
    setTripDraftModalOpen(false);
    setStatus(`已套用旅程：${draft.trip.name}`);
  }

  function updateTripReviewDay(dayIndex: number, updater: (day: ItineraryDay) => ItineraryDay) {
    setEditableTripDraft((draft) => draft ? updateDraftDayAt(draft, dayIndex, updater) : draft);
  }

  function updateTripReviewSpot(dayIndex: number, spotIndex: number, patch: Partial<ItinerarySpot>) {
    updateTripReviewDay(dayIndex, (day) => {
      const spots = [...(day.spots || [])];
      const current = spots[spotIndex] || defaultReviewSpot();
      spots[spotIndex] = { ...current, ...patch };
      return { ...day, spots };
    });
  }

  function addTripReviewSpot(dayIndex: number) {
    updateTripReviewDay(dayIndex, (day) => ({
      ...day,
      spots: [...(day.spots || []), defaultReviewSpot()],
    }));
  }

  function removeTripReviewSpot(dayIndex: number, spotIndex: number) {
    updateTripReviewDay(dayIndex, (day) => ({
      ...day,
      spots: (day.spots || []).filter((_, index) => index !== spotIndex),
    }));
  }

  function moveTripReviewSpot(dayIndex: number, spotIndex: number, direction: -1 | 1) {
    updateTripReviewDay(dayIndex, (day) => {
      const spots = [...(day.spots || [])];
      const nextIndex = spotIndex + direction;
      if (nextIndex < 0 || nextIndex >= spots.length) return day;
      [spots[spotIndex], spots[nextIndex]] = [spots[nextIndex], spots[spotIndex]];
      return { ...day, spots };
    });
  }

  function sortTripReviewDay(dayIndex: number) {
    updateTripReviewDay(dayIndex, (day) => ({ ...day, spots: sortReviewSpots(day.spots || []) }));
  }

  function updateTripReviewLodging(dayIndex: number, patch: Partial<NonNullable<ItineraryDay['lodging']>>) {
    updateTripReviewDay(dayIndex, (day) => ({
      ...day,
      lodging: {
        ...(day.lodging || { name: '', confidence: 'medium' as const }),
        ...patch,
      },
    }));
  }

  function updateCurrentTrip(patch: Partial<TripProfile>) {
    const nextTrip = { ...currentTrip, ...patch, version: currentTrip.version + 1, updatedAt: Date.now() };
    updateState({
      trips: trips.map((trip) => trip.id === currentTrip.id ? nextTrip : trip),
      tripName: nextTrip.name,
      tripDateRange: { start: nextTrip.startDate, end: nextTrip.endDate },
      tripCurrency: nonHomeCurrencyForTrip(nextTrip, state.tripCurrency),
      customItinerary: nextTrip.itinerary,
    });
  }

  function handleSaveManagedTrip() {
    const target = trips.find(t => t.id === managerTripId);
    if (!target) return;

    if (mgrStart && mgrEnd && mgrEnd < mgrStart) {
      setStatus('結束日期唔可以早過開始日期');
      return;
    }

    if (mgrArchived) {
      const activeTripsLeft = trips.filter(t => !t.archived && t.id !== managerTripId);
      if (activeTripsLeft.length === 0) {
        setStatus('⚠️ 最少要保留一個未封存旅程，唔可以封存呢個唯一嘅 active 旅程！');
        return;
      }
    }

    const nextBudget = clampFinite(mgrBudget, 0);
    const nextIntelligence = normalizeTripIntelligence(
      {
        ...target.intelligence,
        primaryCurrency: mgrCurrency,
        tripStyle: mgrTripStyle,
        homeCity: mgrHomeCity.trim() || 'Hong Kong',
        weatherPreference: mgrWeatherPreference,
        source: 'manual',
        updatedAt: Date.now(),
      },
      mgrDest.trim() || target.destinationSummary || '',
      mgrCurrency,
      target.intelligence?.timezone || target.timezones?.[0],
    );
    const nextTrip: TripProfile = {
      ...target,
      name: mgrName.trim() || target.name,
      destinationSummary: mgrDest.trim() || target.destinationSummary || '',
      startDate: mgrStart || target.startDate,
      endDate: mgrEnd || target.endDate,
      budget: nextBudget,
      currencies: Array.from(new Set(['HKD', mgrCurrency])),
      intelligence: nextIntelligence,
      archived: mgrArchived,
      version: target.version + 1,
      updatedAt: Date.now(),
    };

    setState((prev) => {
      const prevTrips = prev.trips?.length ? prev.trips : [activeTrip(prev)];
      const updatedTrips = prevTrips.map((t) => t.id === managerTripId ? nextTrip : t);

      const isActive = managerTripId === prev.activeTripId;
      const patch: Partial<AppState> = {
        trips: updatedTrips,
      };

      if (isActive) {
        patch.tripName = nextTrip.name;
        patch.tripDateRange = { start: nextTrip.startDate, end: nextTrip.endDate };
        patch.tripCurrency = mgrCurrency;
        patch.budget = nextBudget;
      }

      // 如果封存了當前的 active trip，且還有其他非封存 trip，就切換過去
      if (isActive && mgrArchived) {
        const nextActive = updatedTrips.find((t) => !t.archived && t.id !== managerTripId) || updatedTrips.find((t) => !t.archived);
        if (nextActive) {
          patch.activeTripId = nextActive.id;
          patch.tripName = nextActive.name;
          patch.tripDateRange = { start: nextActive.startDate, end: nextActive.endDate };
          patch.tripCurrency = nonHomeCurrencyForTrip(nextActive, prev.tripCurrency);
          patch.budget = nextActive.budget || 0;
          patch.customItinerary = nextActive.itinerary;
          patch.trips = updatedTrips.map((t) => ({ ...t, active: t.id === nextActive.id }));
        }
      }

      const nextSyncQueue = [
        ...(prev.syncQueue || []),
        {
          id: `sync_${Date.now()}_${Math.random().toString(16).slice(2)}`,
          type: 'trip' as const,
          entityId: managerTripId,
          op: 'update' as const,
          status: 'queued' as const,
          attempts: 0,
          createdAt: Date.now(),
          updatedAt: Date.now(),
          payload: {
            sourceId: nextTrip.sourceId || `trip_${nextTrip.id}`,
            updatedAt: nextTrip.updatedAt,
          },
        }
      ].slice(-500);

      patch.syncQueue = nextSyncQueue;

      return migrateAppState({
        ...prev,
        ...patch,
      });
    });

    setStatus(`🎉 成功儲存旅程「${nextTrip.name}」嘅修改，並已加入 Notion 同步隊列！`);
  }

  function handleDeleteManagedTrip() {
    const target = trips.find(t => t.id === managerTripId);
    if (!target) return;
    if (!canDeleteManagedTrip) {
      setShowDeleteConfirm(false);
      setStatus('只有旅程擁有者或管理員先可以刪除呢個共享旅程。');
      return;
    }

    const remainingTrips = trips.filter(t => t.id !== managerTripId);
    if (remainingTrips.length === 0) {
      setStatus('⚠️ 最少要保留一個旅程，唔可以刪除唯一嘅旅程！');
      setShowDeleteConfirm(false);
      return;
    }

    setState((prev) => {
      const updatedTrips = (prev.trips || []).filter((t) => t.id !== managerTripId);
      const deletedReceipts = (prev.receipts || []).filter((r) => r.tripId === managerTripId);
      const remainingReceipts = (prev.receipts || []).filter((r) => r.tripId !== managerTripId);

      const isActive = managerTripId === prev.activeTripId;
      const patch: Partial<AppState> = {
        trips: updatedTrips,
        receipts: remainingReceipts,
      };

      if (isActive) {
        const nextActive = updatedTrips.find((t) => !t.archived) || updatedTrips[0];
        if (nextActive) {
          patch.activeTripId = nextActive.id;
          patch.tripName = nextActive.name;
          patch.tripDateRange = { start: nextActive.startDate, end: nextActive.endDate };
          patch.tripCurrency = nonHomeCurrencyForTrip(nextActive, prev.tripCurrency);
          patch.budget = nextActive.budget || 0;
          patch.customItinerary = nextActive.itinerary;
          patch.trips = updatedTrips.map((t) => ({ ...t, active: t.id === nextActive.id }));
        }
      }

      const currentQueue = prev.syncQueue || [];
      const deleteQueueItems = deletedReceipts.map((r) => ({
        id: `sync_${Date.now()}_${Math.random().toString(16).slice(2)}`,
        type: 'delete-receipt' as const,
        entityId: r.id,
        op: 'delete' as const,
        status: 'queued' as const,
        attempts: 0,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        payload: {
          notionPageId: r.notionPageId,
          supabaseId: r.supabaseId,
          tripId: r.tripId,
          sourceId: r.sourceId || r.id,
        },
      }));

      const deleteTripQueueItem = {
        id: `sync_${Date.now()}_${Math.random().toString(16).slice(2)}`,
        type: 'trip' as const,
        entityId: managerTripId,
        op: 'update' as const,
        status: 'queued' as const,
        attempts: 0,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        payload: {
          sourceId: target.sourceId || `trip_${target.id}`,
          updatedAt: Date.now(),
        },
      };

      patch.syncQueue = [...currentQueue, ...deleteQueueItems, deleteTripQueueItem].slice(-500);

      return migrateAppState({
        ...prev,
        ...patch,
      });
    });

    const nextSelectable = remainingTrips.find((t) => !t.archived) || remainingTrips[0];
    if (nextSelectable) {
      handleSelectManagedTrip(nextSelectable.id);
    }

    setShowDeleteConfirm(false);
    setStatus(`🎉 成功刪除旅程「${target.name}」同佢關聯嘅所有消費紀錄，同步已排隊！`);
  }

  function createManagedTrip() {
    const name = newManagedTripName.trim();
    if (!name) {
      setStatus('請先輸入新旅程名稱');
      return;
    }
    if (newManagedTripStart && newManagedTripEnd && newManagedTripEnd < newManagedTripStart) {
      setStatus('結束日期唔可以早過開始日期');
      return;
    }
    const now = Date.now();
    const newTrip = createTripProfile({
      name,
      destinationSummary: newManagedTripDest || 'Japan',
      startDate: newManagedTripStart,
      endDate: newManagedTripEnd,
      budget: newManagedTripBudget.trim() ? Number(newManagedTripBudget) : 150000,
      currency: newManagedTripCurrency,
      now,
    });
    const queueItem: SyncQueueItem = {
      id: `sync_${now}_${Math.random().toString(16).slice(2)}`,
      type: 'trip',
      entityId: newTrip.id,
      op: 'create',
      status: 'queued',
      attempts: 0,
      createdAt: now,
      updatedAt: now,
      payload: {
        sourceId: newTrip.sourceId,
        updatedAt: newTrip.updatedAt,
      },
    };
    setState((prev) => {
      const prevTrips = prev.trips?.length ? prev.trips : [activeTrip(prev)];
      const latest = new Map<string, SyncQueueItem>();
      for (const item of [...(prev.syncQueue || []), queueItem]) {
        if (item.status === 'synced') continue;
        latest.set(`${item.type}:${item.entityId}`, item);
      }
      return migrateAppState({
        ...prev,
        trips: [...prevTrips.map((trip) => ({ ...trip, active: false })), newTrip],
        activeTripId: newTrip.id,
        tripName: newTrip.name,
        tripDateRange: { start: newTrip.startDate, end: newTrip.endDate },
        tripCurrency: nonHomeCurrencyForTrip(newTrip, prev.tripCurrency),
        budget: newTrip.budget || 0,
        customItinerary: newTrip.itinerary,
        syncQueue: [...latest.values()].slice(-500),
      });
    });
    setManagerTripId(newTrip.id);
    setMgrName(newTrip.name);
    setMgrDest(newTrip.destinationSummary || '');
    setMgrStart(newTrip.startDate || '');
    setMgrEnd(newTrip.endDate || '');
    setMgrBudget(String(newTrip.budget || 0));
    setMgrCurrency(nonHomeCurrencyForTrip(newTrip));
    setMgrArchived(false);
    setNewManagedTripName('');
    setNewManagedTripDest('');
    setNewManagedTripStart('');
    setNewManagedTripEnd('');
    setNewManagedTripBudget('');
    setNewManagedTripCurrency('JPY');
    setStatus(`已建立並切換到新旅程：${newTrip.name}`);
  }

  function safeBackupState() {
    return stripPortableBackupState({
      ...state,
      activeTripId: currentTrip.id,
      trips: [currentTrip],
      receipts: scopedReceiptsForTrip(state, currentTrip),
    });
  }

  function previewTripShareExport() {
    const preview = buildTripSharePreview(state, currentTrip, persons);
    setTripSharePreview(preview);
    setStatus(`Trip-share preview ready：${preview.payload.summary.receipts} receipts，安全預覽後可 copy/download`);
  }

  function previewDiagnosticsExport() {
    const preview = buildDiagnosticsPreview(state, currentTrip, persons, syncState, cloudSyncAvailable, notionMirrorReady, brokerReady, storageScope);
    setDiagnosticsPreview(preview);
    setStatus(`Diagnostics preview ready：${preview.payload.receipts.currentTrip} current-trip receipts，public-safe copy/download only`);
  }

  function openScopeRepairShortcut() {
    if (!tripScopeAudit.repairReceiptId) {
      changeTab?.('history');
      return;
    }
    saveReceiptRepairIntent(tripScopeAudit.repairReceiptId);
    setStatus(`Opening repair: ${tripScopeAudit.repairReceiptLabel || 'receipt'}`);
    changeTab?.('history');
  }

  async function copyTripSharePreview() {
    if (!tripSharePreview) return;
    await copyText(tripSharePreview.copiedText, '已複製 private trip-share summary');
  }

  function downloadTripSharePreview() {
    if (!tripSharePreview) return;
    downloadJson(tripSharePreview.filename, tripSharePreview.payload);
    setStatus('已下載 private trip-share JSON');
  }

  async function copyDiagnosticsPreview() {
    if (!diagnosticsPreview) return;
    await copyText(diagnosticsPreview.copiedText, '已複製 public-safe diagnostics summary');
  }

  function downloadDiagnosticsPreview() {
    if (!diagnosticsPreview) return;
    downloadJson(diagnosticsPreview.filename, diagnosticsPreview.payload);
    setStatus('已下載 public-safe diagnostics JSON');
  }

  async function importItinerary(file?: File) {
    if (!file) return;
    try {
      const parsed = JSON.parse(await file.text());
      const result = validateItinerary(parsed);
      if (!result.ok) throw new Error(result.error);
      if (!result.itinerary.length) throw new Error('行程為空');
      const nextTrip = {
        ...currentTrip,
        itinerary: result.itinerary,
        startDate: result.itinerary[0].date,
        endDate: result.itinerary[result.itinerary.length - 1].date,
        version: currentTrip.version + 1,
        updatedAt: Date.now(),
      };
      updateState({
        trips: trips.map((trip) => trip.id === currentTrip.id ? nextTrip : trip),
        customItinerary: result.itinerary,
        itineraryOverrides: {},
        tripDateRange: { start: nextTrip.startDate, end: nextTrip.endDate },
      });
      setStatus(`已匯入 ${result.itinerary.length} 日行程`);
    } catch (error) {
      setStatus(`行程匯入失敗：${redactedError(error)}`);
    } finally {
      if (itineraryInput.current) itineraryInput.current.value = '';
    }
  }

  async function copyText(text: string, ok: string) {
    try {
      if (!navigator.clipboard?.writeText) throw new Error('clipboard unavailable');
      await navigator.clipboard.writeText(text);
      setStatus(ok);
    } catch {
      setStatus(text);
    }
  }

  async function copyQueueReport() {
    await copyText(queueReportText, '已複製 sync queue report');
  }

  async function importBackup(file?: File) {
    if (!file) return;
    try {
      const payload = JSON.parse(await file.text()) as Partial<AppState>;
      if (!validateBackupSchema(payload)) throw new Error('Backup JSON 格式無效或結構損壞');
      const preview = buildBackupImportPreview(file.name, payload, state, currentTrip);
      setBackupPreview(preview);
      setStatus(`Backup preview ready：${preview.receiptCount || state.receipts.length} 筆，確認後先匯入`);
    } catch (error) {
      setBackupPreview(null);
      setStatus(`Backup 匯入失敗：${redactedError(error)}`);
    } finally {
      if (backupInput.current) backupInput.current.value = '';
    }
  }

  function applyBackupPreview() {
    if (!backupPreview) return;
    const preview = backupPreview;
    setState((prev) => migrateAppState({
      ...prev,
      ...preview.safePayload,
      trips: preview.importedTrips || prev.trips,
      receipts: preview.receipts.length ? preview.receipts : prev.receipts,
    }));
    setBackupPreview(null);
    setStatus(`已匯入 backup：${preview.receiptCount || state.receipts.length} 筆`);
  }

  function cancelBackupPreview() {
    setBackupPreview(null);
    if (backupInput.current) backupInput.current.value = '';
    setStatus('已取消 backup 匯入，未有改動本地資料');
  }

  return (
    <section className="japanese-washi-bg w-full min-h-screen px-4 pb-28 pt-6 relative overflow-y-auto settings-tab settings-screen">
      <div className="japanese-sun-decor" />
      <div className="japanese-sakura-decor" />
      <div className="stack w-full relative z-10">
      <GlassCard className="settings-command">
        <div>
          <h2>{isMobile ? '安全設定主控台' : '設定控制中心'} ⚙️</h2>
          <TooltipProvider>
            <div className="stats-status-row settings-status-tooltips">
              <Tooltip>
                <TooltipTrigger asChild>
                  <span><StatusPill tone="info"><Plane size={14} /> {trips.length} 個旅程</StatusPill></span>
                </TooltipTrigger>
                <TooltipContent>目前保存在此帳號/裝置嘅旅程數量</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span><StatusPill tone={brokerReady ? 'ok' : 'warning'}><Server size={14} /> Broker {brokerReady ? 'session active' : 'session missing'}</StatusPill></span>
                </TooltipTrigger>
                <TooltipContent>Credential Broker unlock/session 狀態</TooltipContent>
              </Tooltip>
              {syncState && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span><StatusPill tone={syncPillTone}><Cloud size={14} /> Sync {syncState.status}{syncPillDetail}</StatusPill></span>
                  </TooltipTrigger>
                  <TooltipContent>雲端同步狀態、等待上傳隊列與失敗重試數</TooltipContent>
                </Tooltip>
              )}
              <Tooltip>
                <TooltipTrigger asChild>
                  <span><StatusPill tone="neutral"><ShieldCheck size={14} /> {buildLabel}</StatusPill></span>
                </TooltipTrigger>
                <TooltipContent>目前前端 build / security marker</TooltipContent>
              </Tooltip>
            </div>
          </TooltipProvider>
          <div className="settings-preview-controls" aria-label="設定快速操作">
            <button type="button" onClick={() => openSettingsPanel('settings-trip')}>
              <Plane size={17} />
              <span>旅程</span>
              <small>{trips.length} 個</small>
            </button>
            <button type="button" onClick={() => openSettingsPanel('settings-trip-update')}>
              <Sparkles size={17} />
              <span>行程 AI</span>
              <small>更新</small>
            </button>
            <button type="button" onClick={() => openSettingsPanel('settings-data')}>
              <ShieldCheck size={17} />
              <span>備份</span>
              <small>資料管理</small>
            </button>
          </div>
        </div>
      </GlassCard>

      {showStressPanel && (<GlassCard className={`settings-trip-doctor settings-trip-doctor--${tripDoctor.tone}`}>
        <section role="region" aria-label="Compact Trip Doctor">
          <div className="settings-trip-doctor-head">
            <span><ShieldCheck size={16} /> Compact Trip Doctor</span>
            <strong>{tripDoctor.statusLabel}</strong>
          </div>
          <div className="settings-trip-doctor-grid">
            {tripDoctor.items.map((item) => (
              <div className="settings-trip-doctor-item" key={item.key}>
                <span>{item.title}</span>
                <strong>{item.value}</strong>
                <small>{item.detail}</small>
              </div>
            ))}
          </div>
          <div className="settings-trip-doctor-actions">
            <button type="button" onClick={() => changeTab?.('history')}>
              <Copy size={14} />
              <span>Review records</span>
            </button>
            <button type="button" onClick={() => openSettingsPanel('settings-data')}>
              <ShieldCheck size={14} />
              <span>Data safety</span>
            </button>
            <button type="button" onClick={() => openSettingsPanel('settings-notion')}>
              <Cloud size={14} />
              <span>Sync settings</span>
            </button>
          </div>
        </section>
	      </GlassCard>)}

	      {showStressPanel && (<GlassCard className={`settings-trip-doctor settings-trip-scope-audit settings-trip-scope-audit--${queueFailedCount ? 'warning' : 'ok'}`}>
	        <section role="region" aria-label="Account Sync Health">
	          <div className="settings-trip-doctor-head">
	            <span><Server size={16} /> Account Sync Health</span>
	            <strong>{queueFailedCount ? `${queueFailedCount} failed` : syncState?.status || 'local'}</strong>
	          </div>
	          <div className="settings-trip-doctor-grid">
	            {accountSyncHealth.map((item) => (
	              <div className="settings-trip-doctor-item" key={item.key}>
	                <span>{item.title}</span>
	                <strong>{item.value}</strong>
	                <small>{item.detail}</small>
	              </div>
	            ))}
	          </div>
	        </section>
	      </GlassCard>)}

	      {showStressPanel && (<GlassCard className={`settings-trip-doctor settings-trip-scope-audit settings-trip-scope-audit--${queueFailedCount ? 'warning' : 'ok'}`}>
	        <section role="region" aria-label="Sync Queue Inspector">
	          <div className="settings-trip-doctor-head">
	            <span><Cloud size={16} /> Sync Queue Inspector</span>
	            <strong>{activeQueue.length ? `${activeQueue.length} active` : 'clear'}</strong>
	          </div>
	          <div className="settings-trip-doctor-grid">
	            <div className="settings-trip-doctor-item">
	              <span>Pending</span>
	              <strong>{queuePendingCount}</strong>
	              <small>Ready for retry</small>
	            </div>
	            <div className="settings-trip-doctor-item">
	              <span>Failed</span>
	              <strong>{queueFailedCount}</strong>
	              <small>{syncState?.error || 'No engine error'}</small>
	            </div>
	            <div className="settings-trip-doctor-item">
	              <span>Oldest</span>
	              <strong>{activeQueue[0] ? formatSyncAge(activeQueue[0].createdAt) : 'none'}</strong>
	              <small>{activeQueue[0]?.type || 'Queue clear'}</small>
	            </div>
	          </div>
	          <div className="mini-list" aria-label="Sync Queue Inspector Items">
	            {activeQueue.slice(0, 6).map((item) => (
	              <span key={item.id}>{item.type} · {item.op} · {item.status} · {item.attempts} tries · {shortId(item.entityId)}</span>
	            ))}
	            {!activeQueue.length && <span>Queue clear</span>}
	          </div>
	          <div className="settings-trip-doctor-actions">
	            <button type="button" disabled={!onPush || !activeQueue.length} onClick={() => void onPush?.()}>
	              <RotateCcw size={14} />
	              <span>Retry queue</span>
	            </button>
	            <button type="button" onClick={() => void copyQueueReport()}>
	              <Copy size={14} />
	              <span>Copy report</span>
	            </button>
	            <button type="button" disabled={!onPull} onClick={() => void onPull?.()}>
	              <Cloud size={14} />
	              <span>Pull now</span>
	            </button>
	          </div>
	        </section>
	      </GlassCard>)}

	      {showStressPanel && (<GlassCard className={`settings-trip-doctor settings-trip-scope-audit settings-trip-scope-audit--${tripScopeAudit.tone}`}>
	        <section role="region" aria-label="Trip scope audit">
          <div className="settings-trip-doctor-head">
            <span><ShieldCheck size={16} /> Trip Scope Audit</span>
            <strong>{tripScopeAudit.statusLabel}</strong>
          </div>
          <p className="settings-post-trip-helper">{tripScopeAudit.helper}</p>
          <div className="settings-trip-doctor-grid">
            {tripScopeAudit.items.map((item) => (
              <div className="settings-trip-doctor-item" key={item.key}>
                <span>{item.title}</span>
                <strong>{item.value}</strong>
                <small>{item.detail}</small>
              </div>
            ))}
          </div>
          <div className="settings-trip-doctor-actions">
            {tripScopeAudit.repairReceiptId && (
              <button type="button" onClick={openScopeRepairShortcut}>
                <AlertTriangle size={14} />
                <span>Repair first issue</span>
              </button>
            )}
            <button type="button" onClick={() => changeTab?.('history')}>
              <Copy size={14} />
              <span>Review records</span>
            </button>
            <button type="button" onClick={() => openSettingsPanel('settings-data')}>
              <ShieldCheck size={14} />
              <span>Data safety</span>
            </button>
          </div>
        </section>
      </GlassCard>)}

      <AccordionCard id="settings-people" title="旅伴 / 分帳比例" meta={<span className="pill">{persons.length} 人</span>}>
        {persons.map((p) => (
          <div className="person-edit" key={p.id}>
            <AvatarBadge person={p} />
            <input value={p.name} onChange={(e) => updatePerson(p.id, { name: e.target.value })} aria-label={`${p.name} name`} />
            <input type="color" value={p.color} onChange={(e) => updatePerson(p.id, { color: e.target.value })} aria-label={`${p.name} color`} />
            <input type="number" min={0} value={shareRatios[p.id] ?? 1} onChange={(e) => updateState({ shareRatios: { ...shareRatios, [p.id]: clampFinite(e.target.value, 1, 0, 1000) } })} aria-label={`${p.name} ratio`} />
            <button className="icon-btn" type="button" onClick={() => removePerson(p.id)} aria-label={`remove ${p.name}`}><Trash2 size={16} /></button>
          </div>
        ))}
        <div className="person-add">
          <input value={newPersonName} onChange={(e) => setNewPersonName(e.target.value)} placeholder="旅伴名字" />
          <button className="primary" type="button" onClick={addPerson}><Plus size={18} /> 新增</button>
        </div>
        <div className="mini-list">
          <span>比例總和：{ratioTotal || 0} · Shared {tripPrefix}{Math.round(settlement.sharedTotal).toLocaleString()}</span>
          {settlement.transfers.map((t) => <span key={`${t.from.id}-${t.to.id}`}>{t.from.name} → {t.to.name} {tripPrefix}{Math.round(t.amount).toLocaleString()}</span>)}
          {!settlement.transfers.length && <span>暫時唔需要互相轉帳</span>}
          {settlement.balances.map((b) => <span key={b.id}>{b.name}: 已付 shared {tripPrefix}{Math.round(b.paidShared).toLocaleString()} · 應付 {tripPrefix}{Math.round(b.shouldPayShared).toLocaleString()}</span>)}
          {settlement.crossPrivate.map((item) => <span key={item.id}>私人代付：{item.payer.name} 幫 {item.beneficiary.name} 付 {tripPrefix}{Math.round(item.amount).toLocaleString()} · {item.store}</span>)}
        </div>
        <div className="action-row wrap">
          <button className="secondary" type="button" onClick={resetShareRatios}>重設為均分</button>
        </div>
      </AccordionCard>

      <AccordionCard id="settings-ai-models" eyebrow="Model routing" title="AI 模型選擇" icon={<Sparkles />}>
        <p className="muted">你選擇嘅 model 會直接做每個功能嘅 primary。如果失敗，會自動 fallback 到 contract default（Scan/Voice → Gemma 4 31B，Email/Trip → Kimi kimi-code），然後再 fallback 到其他備用模型。Provider keys 不會進入 React state。</p>
        <div className="form-grid">
          <label>Scan model
            <select value={state.scanModel} onChange={(e) => updateState({ scanModel: e.target.value })}>
              {AI_MODELS.map((model) => <option key={model.id} value={model.id}>{model.name}</option>)}
            </select>
          </label>
          <label>Voice model
            <select value={state.voiceModel} onChange={(e) => updateState({ voiceModel: e.target.value })}>
              {AI_MODELS.map((model) => <option key={model.id} value={model.id}>{model.name}</option>)}
            </select>
          </label>
        </div>
        <label>Email model
          <select value={state.emailModel} onChange={(e) => updateState({ emailModel: e.target.value })}>
            {AI_MODELS.map((model) => <option key={model.id} value={model.id}>{model.name}</option>)}
          </select>
        </label>
        <label>Trip update model
          <select value={state.tripUpdateModel || DEFAULT_KIMI_PRIMARY_MODEL_ID} onChange={(e) => updateState({ tripUpdateModel: e.target.value })}>
            {AI_MODELS.map((model) => <option key={model.id} value={model.id}>{model.name}</option>)}
          </select>
        </label>
        <label>Google backup model
          <input value={state.googleBackupModel || ''} onChange={(e) => updateState({ googleBackupModel: e.target.value })} />
        </label>
        <div style={{ marginTop: '0.75rem' }}>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => setApiKeyModalOpen(true)}
          >
            <KeyRound size={14} /> Change API Key
          </button>
        </div>
      </AccordionCard>

      {cloudSyncAvailable && updatePassword && (
        <AccordionCard id="settings-supabase-account" eyebrow="Supabase Auth" title="雲端帳號與密碼設定 🔐" icon={<KeyRound />}>
          <div className="settings-auth-layout">
            <GlassCard className="settings-account-card">
              <div className="settings-account-copy">
                <span className="eyebrow">目前帳號</span>
                <strong>{userEmail || 'Supabase 帳號'}</strong>
                <small>帳號、密碼同本機資料操作集中管理。</small>
              </div>
              <div className="settings-account-actions">
                {onSignOut && (
                  <button className="secondary" type="button" disabled={!!busy} onClick={() => void handleSupabaseSignOut()} aria-label="登出 Supabase">
                    <LogOut size={18} /> 登出
                  </button>
                )}
                {onClearDeviceData && onSignOut && (
                  <button className="danger" type="button" disabled={!!busy} onClick={() => setShowClearDeviceConfirm(true)} aria-label="清除此裝置資料並登出 Supabase">
                    <Trash2 size={18} /> 清除此裝置資料
                  </button>
                )}
                {onClearDeviceData && onSignOut && (
                  <button className="danger settings-danger-solid" type="button" disabled={!!busy} onClick={() => setShowDeleteAccountConfirm(true)} aria-label="永久刪除帳戶">
                    <UserMinus size={18} /> 永久刪除帳戶
                  </button>
                )}
              </div>
            </GlassCard>
            <div className="settings-password-panel">
              <label>
                <span>設定新密碼</span>
                <input
                  type="password"
                  value={newPasswordInput}
                  onChange={(e) => setNewPasswordInput(e.target.value)}
                  placeholder="最少 6 位"
                />
              </label>
              <button
                className="primary"
                type="button"
                disabled={!!busy || newPasswordInput.length < 6}
                onClick={() => void handleUpdatePassword()}
              >
                <KeyRound size={17} /> 儲存雲端登入密碼
              </button>
            </div>
          </div>
        </AccordionCard>
      )}

      <AccordionCard id="settings-trip" eyebrow="Trip Manager" title="旅程管理器 🏯🌸" meta={<span className="pill">v{managedTrip.version}</span>}>
        <div className="settings-trip-manager">
        <div className="settings-trip-panel settings-trip-panel--active">
          <div className="settings-trip-panel-head">
            <div>
              <span className="eyebrow">Active trip</span>
              <h3>{managedTrip.name}</h3>
            </div>
            <span className="pill">{mgrCurrency}</span>
          </div>
          <label>選擇旅程
          <select
            value={managerTripId}
            onChange={(e) => handleSelectManagedTrip(e.target.value)}
          >
            {trips.map((trip) => (
              <option key={trip.id} value={trip.id}>
                {trip.id === currentTrip.id ? '[Active] ' : ''}
                {trip.archived ? '[Archived] ' : ''}
                {trip.name} ({trip.startDate || '未設定日期'})
              </option>
            ))}
          </select>
          </label>
          {managerTripId !== currentTrip.id && (
            <button
              className="secondary"
              type="button"
              onClick={() => selectTrip(managerTripId)}
            >
              <Sparkles size={16} /> 切換為當前 Active 記帳旅程
            </button>
          )}
        </div>

        <div className={`settings-trip-panel settings-trip-panel--collapsible ${newTripPanelOpen ? 'open' : ''}`}>
          <button
            className="settings-trip-panel-toggle"
            type="button"
            aria-expanded={newTripPanelOpen}
            aria-controls="settings-trip-new-panel"
            onClick={() => setNewTripPanelOpen((value) => !value)}
          >
          <div className="settings-trip-panel-head">
            <div>
              <span className="eyebrow">New trip</span>
              <h3>建立新旅程</h3>
            </div>
            <span className="pill">Multi-trip <ChevronDown size={15} className="settings-trip-panel-chevron" /></span>
          </div>
          </button>
          {newTripPanelOpen && <div id="settings-trip-new-panel" className="settings-trip-panel-body">
          <div className="form-grid">
            <label>新旅程名
              <input value={newManagedTripName} onChange={(e) => setNewManagedTripName(e.target.value)} placeholder="例如：首爾 2026" />
            </label>
            <label>目的地摘要
              <input value={newManagedTripDest} onChange={(e) => setNewManagedTripDest(e.target.value)} placeholder="例如：首爾、釜山" />
            </label>
          </div>
          <div className="form-grid">
            <label>開始日期
              <input type="date" value={newManagedTripStart} onChange={(e) => setNewManagedTripStart(e.target.value)} />
            </label>
            <label>結束日期
              <input type="date" value={newManagedTripEnd} onChange={(e) => setNewManagedTripEnd(e.target.value)} />
            </label>
          </div>
          <div className="form-grid">
            <label>預算
              <input type="number" min="0" step="1" value={newManagedTripBudget} onChange={(e) => setNewManagedTripBudget(e.target.value)} placeholder="例如：150000" />
            </label>
            <label>目的地貨幣
              <select value={newManagedTripCurrency} onChange={(e) => setNewManagedTripCurrency(e.target.value)}>
                {SUPPORTED_CURRENCIES.map((code) => <option key={code} value={code}>{code}</option>)}
              </select>
            </label>
          </div>
          <div className="action-row wrap">
            <button className="primary" type="button" onClick={createManagedTrip}>
              <Plus size={18} /> 建立並切換
            </button>
          </div>
          </div>}
        </div>

        <div className={`settings-trip-panel settings-trip-panel--edit settings-trip-panel--collapsible ${editTripPanelOpen ? 'open' : ''}`}>
        <button
          className="settings-trip-panel-toggle"
          type="button"
          aria-expanded={editTripPanelOpen}
          aria-controls="settings-trip-edit-panel"
          onClick={() => setEditTripPanelOpen((value) => !value)}
        >
        <div className="settings-trip-panel-head">
          <div>
            <span className="eyebrow">Edit selected trip</span>
            <h3>旅程資料</h3>
          </div>
          <span className="pill">{mgrArchived ? 'Archived' : 'Active'} <ChevronDown size={15} className="settings-trip-panel-chevron" /></span>
        </div>
        </button>
        {editTripPanelOpen && <div id="settings-trip-edit-panel" className="settings-trip-panel-body">
        <div className="form-grid">
          <label>旅程名
            <input value={mgrName} onChange={(e) => setMgrName(e.target.value)} placeholder="例如：名古屋 2026" />
          </label>
          <label>目的地摘要
            <input value={mgrDest} onChange={(e) => setMgrDest(e.target.value)} placeholder="例如：名古屋、白川鄉" />
          </label>
        </div>
        <div className="form-grid">
          <label>開始日期
            <input type="date" value={mgrStart} onChange={(e) => setMgrStart(e.target.value)} />
          </label>
          <label>結束日期
            <input type="date" value={mgrEnd} onChange={(e) => setMgrEnd(e.target.value)} />
          </label>
        </div>
        <div className="form-grid">
          <label>預算 (目的地貨幣)
            <input
              type="number"
              min="0"
              step="1"
              value={mgrBudget}
              onChange={(e) => {
                setMgrBudget(e.target.value);
              }}
              placeholder="例如：200000"
            />
          </label>
          <label>預算 (HKD)
            <input
              type="number"
              min="0"
              step="1"
              value={Math.round((Number(mgrBudget) || 0) / Math.max(0.1, Number(state.rate) || 20.36))}
              onChange={(e) => {
                const val = parseFloat(e.target.value);
                const safe = Number.isFinite(val) && val >= 0 ? val : 0;
                setMgrBudget(String(Math.round(safe * Math.max(0.1, Number(state.rate) || 20.36))));
              }}
            />
          </label>
        </div>
        <div className="form-grid">
          <label>目的地貨幣
            <select value={mgrCurrency} onChange={(e) => setMgrCurrency(e.target.value)}>
              {SUPPORTED_CURRENCIES.map((code) => <option key={code} value={code}>{code}</option>)}
            </select>
          </label>
          <label>旅程狀態
            <select value={mgrArchived ? 'archived' : 'active'} onChange={(e) => setMgrArchived(e.target.value === 'archived')}>
              <option value="active">🟢 進行中 (Active)</option>
              <option value="archived">📁 已封存 (Archived)</option>
            </select>
          </label>
        </div>

        {/* Quick Itinerary View / Edit - opens confirmation modal with current trip data */}
        {getItinerary(state).length > 0 && (
          <div className="settings-trip-itinerary-quick">
            <div className="settings-trip-panel-head">
              <div>
                <span className="eyebrow">Itinerary</span>
                <h3>當前行程</h3>
              </div>
              <span className="pill">{getItinerary(state).length} 日 · {getItinerary(state).reduce((sum, day) => sum + (day.spots?.length || 0), 0)} 景點</span>
            </div>
            <p className="muted">查看或編輯目前旅程嘅每日行程安排、景點同住宿資料。</p>
            <button
              className="secondary"
              type="button"
              style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', marginTop: '0.5rem' }}
              onClick={() => {
                const itinerary = getItinerary(state);
                const draft: TripDraft = {
                  trip: { ...managedTrip, itinerary },
                  summary: `目前行程：${managedTrip.name}，共 ${itinerary.length} 日`,
                  warnings: [],
                  changes: [],
                };
                setTripDraft(draft);
                setTripDraftModalOpen(true);
              }}
            >
              <MapPin size={16} /> 查看 / 編輯行程詳情
            </button>
          </div>
        )}

        <div className="settings-trip-actions">
          <button
            className="primary"
            type="button"
            onClick={handleSaveManagedTrip}
          >
            <CheckCircle2 size={18} /> 儲存旅程修改
          </button>
          <button
            className="settings-trip-delete"
            type="button"
            disabled={!canDeleteManagedTrip}
            title={canDeleteManagedTrip ? undefined : '只有擁有者或管理員先可以刪除共享旅程'}
            onClick={() => setShowDeleteConfirm(true)}
          >
            <Trash2 size={18} /> 刪除此旅程與資料
          </button>
        </div>
        </div>}
        </div>

        <div className="settings-trip-panel settings-trip-panel--compact">
          <div className="settings-trip-panel-head">
            <div>
              <span className="eyebrow">Currency</span>
              <h3>匯率與統計口徑</h3>
            </div>
          </div>
          <SegmentedControl
            ariaLabel="匯率模式"
            value={state.rateMode === 'fixed' ? 'fixed' : 'live'}
            options={[
              { value: 'live', label: '即時 (Visa)' },
              { value: 'fixed', label: '固定匯率' },
            ]}
            onChange={(mode) => {
              updateState({ rateMode: mode });
              if (mode === 'live') void refreshRate();
            }}
          />
          <div className="form-grid">
            <label>{state.rateMode === 'fixed' ? '固定' : '即時'}匯率（1 HKD = {mgrCurrency || '目的地貨幣'}）
              <input type="number" min="0.01" step="0.01" value={state.rateTable?.[String(state.tripCurrency || 'JPY').toUpperCase()]?.perHkd || state.rate} onChange={(e) => {
                const val = parseFloat(e.target.value);
                const safe = Number.isFinite(val) && val > 0 ? Math.min(1_000_000, val) : 20.36;
                // Also stamp rateTable[code] so perHkdForCurrency (used by Dashboard/Stats/ReceiptEditor)
                // picks up the same value — it checks rateTable before falling back to state.rate, so
                // without this a stale live-fetched table entry would silently override a manual edit.
                // Keyed on state.tripCurrency (what perHkdForCurrency actually reads), not mgrCurrency
                // (a Trip Manager form-local variable that can diverge while editing a different trip).
                const code = String(state.tripCurrency || 'JPY').toUpperCase();
                updateState({
                  rate: safe,
                  rateTable: { ...state.rateTable, [code]: { currency: code, perHkd: safe, source: 'manual', fetchedAt: Date.now() } },
                });
              }} />
            </label>
            {state.rateMode !== 'fixed' && (
              <label>
                <span>更新 live rate</span>
                <button className="secondary" type="button" disabled={!!busy} onClick={refreshRate}>
                  {busy === '更新匯率' ? <RotateCcw size={18} className="spin" /> : <RotateCcw size={18} />} 更新匯率
                </button>
              </label>
            )}
          </div>
          {state.rateMode === 'fixed' && (
            <p className="muted">已鎖定手動匯率 — 出發前兌換嘅價錢唔會被即時匯率覆蓋。想返去自動更新，撳返「即時 (Visa)」。</p>
          )}
          {state.rateMode === 'fixed' && !state.rateTable?.[String(state.tripCurrency || 'JPY').toUpperCase()] && (
            <p className="muted">⚠️ 未為 {String(state.tripCurrency || 'JPY').toUpperCase()} 設定固定匯率 — 而家用緊內置近似值，請喺上面輸入你實際兌換到嘅匯率。</p>
          )}

          <label className="check-row">
            <input type="checkbox" checked={state.statsIncludeTransportLodging} onChange={(e) => updateState({ statsIncludeTransportLodging: e.target.checked })} />
            反轉首頁統計：總消費排除機票/住宿，今日/日均包括全部
          </label>
          <label className="check-row">
            <input type="checkbox" checked={state.top10IncludeBigItems} onChange={(e) => updateState({ top10IncludeBigItems: e.target.checked })} />
            TOP 10 包括機票/住宿/大型交通
          </label>
        </div>
        </div>
      </AccordionCard>

      <AccordionCard
        id="settings-trip-sharing"
        eyebrow="Trip sharing"
        title="旅程共享 👥"
        icon={<Users />}
        meta={<span className="pill">{tripSharing.isShared ? `${tripSharing.memberCount} members` : '只限自己'}{tripSharing.pendingInviteCount ? ` · ${tripSharing.pendingInviteCount} pending` : ''}</span>}
      >
        <div className="mini-list">
          <span>目前角色：{tripSharing.role}</span>
          <span>Backend：Supabase {cloudSyncAvailable ? 'connected' : 'not signed in'} · Notion {tripSharing.backendHealth?.status || 'missing'}</span>
          <span>{canManageTripSharing ? '你可以邀請、撤回邀請、管理成員角色。' : '你可以查看共享狀態；只有 owner/admin 可以管理成員。'}</span>
        </div>

        <GlassCard className="settings-account-card">
          <div className="settings-account-copy">
            <span className="eyebrow">Invite people</span>
            <strong>新增共享成員</strong>
            <small>Editor 可以新增自己嘅 expense；Viewer 只可查看共享帳簿。</small>
          </div>
          <div className="form-grid">
            <label>Email
              <input value={sharingInviteEmail} onChange={(e) => setSharingInviteEmail(e.target.value)} placeholder="friend@example.com" type="email" />
            </label>
            <label>顯示名稱
              <input value={sharingInviteName} onChange={(e) => setSharingInviteName(e.target.value)} placeholder="例如 Natalie" />
            </label>
          </div>
          <div className="form-grid">
            <label>Role
              <select value={sharingInviteRole} onChange={(e) => setSharingInviteRole(e.target.value as TripSharingInviteDraft['role'])}>
                <option value="editor">Editor · 可記帳</option>
                <option value="viewer">Viewer · 只讀</option>
              </select>
            </label>
            <label className="check-row" style={{ alignSelf: 'end' }}>
              <input type="checkbox" checked={sharingInvitePerson} onChange={(e) => setSharingInvitePerson(e.target.checked)} />
              同時加入分帳名單
            </label>
          </div>
          <div className="action-row wrap">
            <button className="primary" type="button" disabled={!!busy || !canManageTripSharing || !cloudSyncAvailable || !sharingInviteEmail.trim()} onClick={() => void createSharingInvite()}>
              <Mail size={18} /> 建立邀請
            </button>
            {onPull && (
              <button className="secondary" type="button" disabled={!!busy || !cloudSyncAvailable} onClick={() => void onPull()}>
                <RotateCcw size={18} /> Refresh sharing
              </button>
            )}
          </div>
        </GlassCard>

        {!!createdInviteLinks.length && (
          <div className="mini-list">
            {createdInviteLinks.map((item) => (
              <span key={item.email} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.email}</span>
                <button className="secondary" type="button" onClick={() => copyText(item.link, `已複製 ${item.email} invite link`)}>
                  <Copy size={14} /> Copy link
                </button>
              </span>
            ))}
          </div>
        )}

        <div className="section-head">
          <h2>Pending invites</h2>
          <span className="pill">{sharingInvites.length} pending</span>
        </div>
        <div className="mini-list">
          {sharingInvites.map((invite) => {
            const generated = createdInviteLinks.find((item) => item.email === invite.email);
            const inviteLink = invite.token ? inviteLinkForToken(invite.token) : generated?.link;
            return (
              <span key={invite.id} style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) auto auto', alignItems: 'center', gap: '8px' }}>
                <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{invite.email} · {invite.role}</span>
                {inviteLink && (
                  <button className="secondary" type="button" onClick={() => copyText(inviteLink, `已複製 ${invite.email} invite link`)}>
                    <Copy size={14} /> Link
                  </button>
                )}
                <button className="danger" type="button" disabled={!!busy || !canManageTripSharing} onClick={() => void revokeSharingInvite(invite)}>
                  <Trash2 size={14} /> Revoke
                </button>
              </span>
            );
          })}
          {!sharingInvites.length && <span>暫時沒有待接受邀請。</span>}
        </div>

        <div className="section-head">
          <h2>Members</h2>
          <span className="pill">{sharingMembers.length || 1} active</span>
        </div>
        <div className="mini-list">
          {sharingMembers.map((member) => {
            const label = member.email || member.displayName || (member.role === 'owner' ? 'Trip owner' : 'Trip member');
            return (
              <span key={`${member.userId}-${member.role}`} style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 128px auto', alignItems: 'center', gap: '8px' }}>
                <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
                {member.role === 'owner' ? (
                  <span className="pill ok">owner</span>
                ) : (
                  <select
                    value={member.role}
                    disabled={!!busy || !canManageTripSharing}
                    onChange={(e) => void updateSharingMemberRole(member.userId, e.target.value as Exclude<TripMemberRole, 'owner'>)}
                  >
                    <option value="admin">admin</option>
                    <option value="editor">editor</option>
                    <option value="viewer">viewer</option>
                  </select>
                )}
                {member.role !== 'owner' && (
                  <button className="danger" type="button" disabled={!!busy || !canManageTripSharing} onClick={() => void removeSharingMember(member.userId, label)}>
                    <UserMinus size={14} /> Remove
                  </button>
                )}
              </span>
            );
          })}
          {!sharingMembers.length && <span>登入並 pull cloud 後會顯示成員列表。</span>}
        </div>
      </AccordionCard>

      <AccordionCard id="settings-trip-update" eyebrow="Trip Update AI" title="AI 行程更新" icon={<Sparkles />}>
        <p className="muted">目前 primary：{tripUpdateModelName}。貼入長行程後，AI 會先分析日程、景點、酒店、餐廳同重要細節；確認後先會更新本機 trip，同步時會建立/更新 Notion trip note。</p>
        <textarea
          rows={10}
          value={tripParagraph}
          onChange={(e) => setTripParagraph(e.target.value)}
          placeholder={`例：下次 2026-07-10 至 2026-07-15 去首爾，第一晚住弘大...\n\n支援貼上整份行程表，包含航班、酒店、景點、餐廳等，AI 會自動更新時間線同天氣！\n\nDay 1: 仁川機場 → 弘大商圈 → 烤肉晚餐\nDay 2: 景福宮 → 北村韓屋 → 明洞購物`}
        />
        <div className="action-row wrap">
          <button
            className="primary"
            type="button"
            disabled={!tripParagraph.trim() || !!busy}
            onClick={() => run('分析行程', async () => {
              try {
                const draft = await parseTripParagraph(tripParagraph, state);
                const hasSpots = draft && draft.trip && Array.isArray(draft.trip.itinerary) &&
                  draft.trip.itinerary.some((day) => Array.isArray(day.spots) && day.spots.length > 0);
                if (!hasSpots) {
                  const warningMsg = (draft && draft.warnings && draft.warnings.join(' | ')) || '';
                  throw new Error(warningMsg || 'AI 智能解析未成功提取任何日程景點，請檢查貼入嘅文字內容。');
                }
                const stats = tripDraftPreviewStats(draft);
                setTripDraft(draft);
                setTripDraftModalOpen(true);
                return `已分析：${draft.trip.name} · ${stats.dayCount} 日 · ${stats.spotCount} 景點 · ${stats.lodgingCount} 酒店 · ${stats.foodCount} 餐飲 · ${stats.transportCount} 交通 · ${stats.detailCount} 重要細節`;
              } catch (err) {
                // Keep the user's pasted paragraph intact — surface the error via run()'s
                // status handler instead of overwriting their input with a debug dump.
                console.error('[Settings] AI parse failed:', err);
                throw new Error(redactedError(err));
              }
            })}
          >
            {busy === '分析行程' ? <RotateCcw size={18} className="spin" /> : <Plane size={18} />} 用已選模型分析
          </button>
          {tripDraft && <button className="secondary" type="button" onClick={() => setTripDraftModalOpen(true)}>開啟確認視窗</button>}
          {tripDraft && <button className="secondary" type="button" onClick={() => { setTripDraft(null); setTripDraftModalOpen(false); }}>清除 preview</button>}
        </div>
        {tripDraft && tripPreviewStats && (
          <div className="trip-preview">
            <div className="trip-preview-head">
              <div>
                <h3>{tripDraft.trip.name}</h3>
                <p className="muted">{tripDraft.summary}</p>
              </div>
              <span className="pill">Primary · {tripUpdateModelName} · {tripPreviewStats.sourceQuality}</span>
            </div>
            <div className="trip-preview-stats">
              <span><b>{tripPreviewStats.dayCount}</b><small>日程</small></span>
              <span><b>{tripPreviewStats.spotCount}</b><small>景點</small></span>
              <span><b>{tripPreviewStats.lodgingCount}</b><small>酒店</small></span>
              <span><b>{tripPreviewStats.foodCount}</b><small>餐飲</small></span>
              <span><b>{tripPreviewStats.transportCount}</b><small>交通</small></span>
              <span><b>{tripPreviewStats.detailCount}</b><small>重要細節</small></span>
            </div>
            <div className="mini-list">
              <span>{tripDraft.trip.startDate} → {tripDraft.trip.endDate}</span>
              <span>{tripDraft.trip.destinationSummary}</span>
              <span>{tripDraft.trip.itinerary.length} 日 · {currenciesForTrip(tripDraft.trip).join(', ')}</span>
              {!!tripPreviewStats.lodgingNames.length && <span>酒店：{tripPreviewStats.lodgingNames.join('、')}</span>}
              {!!tripPreviewStats.foodNames.length && <span>餐飲：{tripPreviewStats.foodNames.join('、')}</span>}
              <span>請開確認視窗逐日檢查；未按確認前唔會更新行程。</span>
            </div>
            <div className="trip-preview-days">
              {tripPreviewStats.days.map((day) => (
                <article key={day.key}>
                  <header>
                    <strong>{day.title}</strong>
                    <span>{day.region || '未命名地區'}</span>
                  </header>
                  {day.highlight && <p>{day.highlight}</p>}
                  {day.note && <p style={{ fontSize: '0.82em', opacity: 0.8, marginTop: 4 }}>💡 {day.note}</p>}
                  {day.lodging && <small>酒店 · {day.lodging}</small>}
                  <div>
                    {day.spots.map((spot) => <span key={`${day.key}-${spot.time}-${spot.name}`}>{spot.time ? `${spot.time} ` : ''}{spot.name}</span>)}
                  </div>
                </article>
              ))}
            </div>
            <div className="action-row wrap">
              <button className="primary" type="button" onClick={() => setTripDraftModalOpen(true)}>確認 / 編輯前檢查</button>
              <button className="secondary" type="button" disabled={!!busy} onClick={() => {
                if (!requireNotionMirror('建立 Notion Trip')) return;
                void run('建立 Notion Trip', async () => {
                const synced = await pushTripPage(state, tripDraft.trip);
                applyTripDraft({ ...tripDraft, trip: synced });
                return `Notion trip note 已更新：${synced.name}`;
                });
              }}>套用並同步 Notion</button>
            </div>
          </div>
        )}
      </AccordionCard>

      <AccordionCard id="settings-credentials" eyebrow="Server-side vault" title="Credentials & Connection" icon={<KeyRound />}>
        <p className="muted">Notion、Kimi、Google、WeatherAPI keys 只喺 Credential Broker vault 入面。React 只保存短期 session；rotation input 唔會寫入 localStorage、IndexedDB、backup 或 Notion。</p>
        <label>Credential Broker URL
          <input value={isAllowedCredentialBrokerUrl(state.credentialBrokerUrl) ? state.credentialBrokerUrl || '' : ''} readOnly aria-readonly="true" />
        </label>
        <div className="credential-status-grid">
          <span className={`pill ${brokerReady || cloudSyncAvailable ? 'ok' : 'hot'}`}>
            <Server size={14} /> Session: {brokerReady ? 'active' : cloudSyncAvailable ? 'active (Supabase)' : 'missing'}
          </span>
          {directTokenEnabled && <span className={`pill ${hasDirectNotionToken() ? 'ok' : 'hot'}`}><KeyRound size={14} /> Local dev Notion: {hasDirectNotionToken() ? 'active' : 'missing'}</span>}
          <span className={`pill ${notionMirrorReady ? 'ok' : 'hot'}`}>
            <Cloud size={14} /> Notion mirror: {notionMirrorReady ? 'scoped' : userScopedNotionDb ? 'needs connect' : 'needs own DB'}
          </span>
          {statusPill('notion')}
          {statusPill('kimi')}
          {statusPill('google')}
          {statusPill('weatherapi')}
        </div>
        {!brokerReady && !cloudSyncAvailable && (
          <div className="form-grid">
            <label>Broker password
              <input
                type="password"
                value={brokerPassword}
                onChange={(e) => setBrokerPassword(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') void connectCredentialBroker(); }}
                autoComplete="current-password"
                placeholder="Enable AI / Notion mirror"
              />
            </label>
            <button className="primary" type="button" disabled={!!busy || !brokerPassword.trim()} onClick={() => void connectCredentialBroker()}>
              <ShieldCheck size={18} /> Connect Broker
            </button>
          </div>
        )}
        {!brokerReady && cloudSyncAvailable && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '12px 16px', background: 'rgba(52, 211, 153, 0.08)', border: '1px solid rgba(52, 211, 153, 0.25)', borderRadius: '12px', color: '#047857', fontSize: '13px', fontWeight: 700, marginTop: '16px', width: '100%' }}>
            <Sparkles size={16} className="spin-once" style={{ color: '#059669', flexShrink: 0 }} />
            <span>已登入 Supabase 帳號，AI 智能記帳已自動激活，免輸入解鎖密碼！🔓🤖</span>
          </div>
        )}
        {showStressPanel && (<div className="action-row wrap">
          <button className="secondary" type="button" disabled={!!busy} onClick={refreshCredentialStatus}>
            Test all connections
          </button>
          <button className="secondary" type="button" disabled={!!busy} onClick={() => run('測試 Kimi', async () => testKimiConnection(state))}>
            Test Kimi
          </button>
          <button className="secondary" type="button" disabled={!!busy} onClick={() => run('測試 Google backup', async () => testGoogleBackupConnection(state))}>
            Test Google
          </button>
        </div>)}
        {showStressPanel && (<div className="rotation-box">
          <div className="form-grid">
            <label>Provider
              <select value={rotationProvider} onChange={(e) => setRotationProvider(e.target.value as CredentialProvider)}>
                <option value="notion">Notion token</option>
                <option value="kimi">Kimi key</option>
                <option value="google">Google backup key</option>
                <option value="weatherapi">WeatherAPI.com key</option>
              </select>
            </label>
            <label>Admin maintenance passphrase
              <input type="password" value={rotationAdmin} onChange={(e) => setRotationAdmin(e.target.value)} autoComplete="off" />
            </label>
          </div>
          <label>New credential
            <input type="password" value={rotationSecret} onChange={(e) => setRotationSecret(e.target.value)} autoComplete="off" placeholder="Only sent once to Credential Broker" />
          </label>
          {rotationProvider === 'notion' && (
            <label>Notion database ID（可選）
              <input value={rotationDb} onChange={(e) => setRotationDb(e.target.value)} />
            </label>
          )}
          <button className="primary" type="button" disabled={!!busy} onClick={rotateCredential}>
            <ShieldCheck size={18} /> Rotate safely
          </button>
        </div>)}
      </AccordionCard>

      <AccordionCard id="settings-data" title="資料管理" icon={<ShieldCheck />}>
        <input ref={backupInput} hidden type="file" accept="application/json,.json" onChange={(e) => importBackup(e.target.files?.[0])} />
        <div className="action-row wrap">
          <button className="secondary" type="button" onClick={() => exportCsv(state)}><Download size={18} /> 匯出 CSV</button>
          <button className="secondary" type="button" onClick={() => downloadJson(`${currentTrip.name || 'travel-expense'}-backup.json`, safeBackupState())}><Download size={18} /> 匯出 Backup</button>
          <button className="secondary" type="button" onClick={() => backupInput.current?.click()}><Upload size={18} /> 匯入 Backup</button>
          <button className="danger" type="button" disabled={!!busy} onClick={() => setShowClearLocalPreview(true)}><RotateCcw size={18} /> 清除本地資料</button>
        </div>
        {showStressPanel && (<div className="action-row wrap" style={{ marginTop: '0.5rem' }}>
          <button className="secondary" type="button" onClick={previewTripShareExport}><Copy size={18} /> Preview trip share</button>
          <button className="secondary" type="button" onClick={previewDiagnosticsExport}><ShieldCheck size={18} /> Preview diagnostics</button>
          <button className="danger" type="button" onClick={() => { clearCredentialSession(); updateState({ credentialSession: '', credentialSessionExpiresAt: 0 }); }}><KeyRound size={18} /> 清除 broker session</button>
          <button className="danger" type="button" onClick={() => { clearDeviceTrust(); void clearTrustedDevice(); clearCredentialSession(); updateState({ credentialSession: '', credentialSessionExpiresAt: 0 }); setStatus('已清除此裝置信任，下次開 app 會重新鎖定。'); }}><ShieldCheck size={18} /> 清除裝置信任</button>
        </div>)}
        {showStressPanel && tripSharePreview && (
          <div className="settings-trip-share-preview" role="region" aria-label="Private trip-share preview">
            <div className="settings-restore-preview-head">
              <span><ShieldCheck size={15} /> Private trip-share preview</span>
              <strong>{tripSharePreview.payload.summary.receipts} receipt{tripSharePreview.payload.summary.receipts === 1 ? '' : 's'}</strong>
            </div>
            <div className="settings-restore-preview-grid">
              <span>
                <small>Trip</small>
                <strong>{tripSharePreview.payload.trip.name}</strong>
              </span>
              <span>
                <small>Spend</small>
                <strong>{formatMoney(tripSharePreview.payload.summary.spentHkd)}</strong>
              </span>
              <span>
                <small>Days</small>
                <strong>{tripSharePreview.payload.trip.days}</strong>
              </span>
            </div>
            <pre className="settings-trip-share-copy">{tripSharePreview.copiedText}</pre>
            <div className="settings-restore-preview-warnings">
              {tripSharePreview.payload.safety.stripped.map((warning) => (
                <span key={warning}><ShieldCheck size={13} /> {warning}</span>
              ))}
            </div>
            <div className="action-row wrap">
              <button className="primary" type="button" onClick={() => void copyTripSharePreview()}><Copy size={16} /> Copy summary</button>
              <button className="secondary" type="button" onClick={downloadTripSharePreview}><Download size={16} /> Download safe JSON</button>
              <button className="secondary" type="button" onClick={() => { setTripSharePreview(null); setStatus('已關閉 trip-share preview'); }}>Close preview</button>
            </div>
          </div>
        )}
        {showStressPanel && diagnosticsPreview && (
          <div className="settings-trip-share-preview" role="region" aria-label="Public diagnostics preview">
            <div className="settings-restore-preview-head">
              <span><ShieldCheck size={15} /> Public diagnostics preview</span>
              <strong>{diagnosticsPreview.payload.receipts.currentTrip} receipt{diagnosticsPreview.payload.receipts.currentTrip === 1 ? '' : 's'}</strong>
            </div>
            <div className="settings-restore-preview-grid">
              <span>
                <small>Surface</small>
                <strong>{diagnosticsPreview.payload.app.surface}</strong>
              </span>
              <span>
                <small>Sync</small>
                <strong>{diagnosticsPreview.payload.sync.queuePending} pending</strong>
              </span>
              <span>
                <small>Quality</small>
                <strong>{diagnosticsPreview.payload.receipts.pendingOcr + diagnosticsPreview.payload.receipts.missingPayer + diagnosticsPreview.payload.receipts.syncErrors} checks</strong>
              </span>
            </div>
            <pre className="settings-trip-share-copy">{diagnosticsPreview.copiedText}</pre>
            <div className="settings-restore-preview-warnings">
              {diagnosticsPreview.payload.safety.stripped.map((warning) => (
                <span key={warning}><ShieldCheck size={13} /> {warning}</span>
              ))}
            </div>
            <div className="action-row wrap">
              <button className="primary" type="button" onClick={() => void copyDiagnosticsPreview()}><Copy size={16} /> Copy diagnostics</button>
              <button className="secondary" type="button" onClick={downloadDiagnosticsPreview}><Download size={16} /> Download diagnostics JSON</button>
              <button className="secondary" type="button" onClick={() => { setDiagnosticsPreview(null); setStatus('已關閉 diagnostics preview'); }}>Close preview</button>
            </div>
          </div>
        )}
        {backupPreview && (
          <div className="settings-restore-preview" role="region" aria-label="Backup restore preview">
            <div className="settings-restore-preview-head">
              <span><Upload size={15} /> Restore preview</span>
              <strong>{backupPreview.receiptCount} receipt{backupPreview.receiptCount === 1 ? '' : 's'}</strong>
            </div>
            <div className="settings-restore-preview-grid">
              <span>
                <small>File</small>
                <strong>{backupPreview.fileName}</strong>
              </span>
              <span>
                <small>Trips</small>
                <strong>{backupPreview.tripCount || 'Current trip'}</strong>
              </span>
              <span>
                <small>Target</small>
                <strong>{backupPreview.targetTripName}</strong>
              </span>
            </div>
            <div className="settings-restore-preview-warnings">
              {backupPreview.warnings.map((warning) => (
                <span key={warning}><ShieldCheck size={13} /> {warning}</span>
              ))}
            </div>
            <div className="action-row wrap">
              <button className="primary" type="button" onClick={applyBackupPreview}><Upload size={16} /> Apply backup</button>
              <button className="secondary" type="button" onClick={cancelBackupPreview}>Cancel import</button>
            </div>
          </div>
        )}
        {showStressPanel && (<details className="settings-maintainer-release-note" aria-label="Maintainer deploy recovery note">
          <summary>
            <span><Server size={15} /> Maintainer deploy recovery</span>
            <strong>Quota-safe</strong>
          </summary>
          <div className="settings-maintainer-release-grid">
            <span>
              <small>Source of truth</small>
              <strong>Compact production</strong>
            </span>
            <span>
              <small>Live proof</small>
              <strong>smoke:deploy-live</strong>
            </span>
            <span>
              <small>Deploy path</small>
              <strong>Vercel + Netlify</strong>
            </span>
          </div>
          <p>For maintainers only: Compact production is deployed to both Vercel and Netlify from GitHub `main`. Treat local release gates as latest code, but do not call it live until both Compact production URLs pass live proof.</p>
          <div className="settings-restore-preview-warnings">
            <span><Cloud size={13} /> Retry Netlify: gh workflow run "Deploy Compact to Netlify" --ref main</span>
            <span><Cloud size={13} /> Vercel: GitHub-connected project travel-expense-compact auto-deploys main</span>
            <span><ShieldCheck size={13} /> Verify: npm run smoke:deploy-live</span>
            <span><AlertTriangle size={13} /> Never paste API keys, tokens, sessions, or account secrets into deploy notes.</span>
          </div>
        </details>)}
        <div className="settings-backup-safety" aria-label="Backup safety scope">
          <span><ShieldCheck size={15} /> CSV / Backup JSON 只包含目前旅程，不會匯出其他旅程紀錄。</span>
          <span><KeyRound size={15} /> Backup 不包含 API key、Notion token、broker session 或解鎖 secret。</span>
          <span><AlertTriangle size={15} /> 匯入 Backup 時會丟棄外部 cloud IDs、sync queue、舊 Trip links 同 credential 欄位。</span>
        </div>
      </AccordionCard>

      {showStressPanel && (<AccordionCard id="settings-itinerary-json" title="行程 JSON" meta={<span className="pill">{getItinerary(state).length} 日</span>}>
        <input ref={itineraryInput} hidden type="file" accept="application/json,.json" onChange={(e) => importItinerary(e.target.files?.[0])} />
        <div className="action-row wrap">
          <button className="secondary" type="button" onClick={() => downloadJson(`${state.tripName || 'trip'}-itinerary.json`, getItinerary(state))}><Download size={18} /> 匯出行程</button>
          <button className="secondary" type="button" onClick={() => itineraryInput.current?.click()}><Upload size={18} /> 匯入行程</button>
          <button className="danger" type="button" onClick={() => updateState({ customItinerary: null, itineraryOverrides: {}, tripDateRange: { start: ITINERARY[0].date, end: ITINERARY[ITINERARY.length - 1].date } })}><RotateCcw size={18} /> 還原預設</button>
        </div>
      </AccordionCard>)}

      {showStressPanel && (
        <AccordionCard id="settings-stress-test" eyebrow="Stress Test Portal" title="極限壓力與故障測試面板 🚀" icon={<Sparkles />}>
          <p className="muted">呢度係專為 Boss 設計嘅 Premium 測試中心！你可以一鍵模擬高達 1,000 筆數據、網絡延遲、API 斷網故障以及 Tab 內存洩漏測試！</p>

          <div className="action-row wrap" style={{ marginBottom: '1rem' }}>
            <button className="primary" type="button" disabled={!!busy} onClick={handleMassInject}>
              瞬間導入 1,000 筆名古屋消費 📊
            </button>
            <button className="secondary" type="button" disabled={!!busy} onClick={handleTabSwitchTest}>
              高頻 Tab 切換洩漏監測 🔄
            </button>
            <button className="danger" type="button" onClick={() => {
              if (window.confirm('確定清除所有壓力測試導入的模擬數據？')) {
                setState(prev => ({
                  ...prev,
                  receipts: prev.receipts.filter(r => r.source !== 'mock_stress_test')
                }));
                setStatus('🧹 已成功清空所有壓力測試數據！');
              }
            }}>
              清空壓力測試數據 🧹
            </button>
          </div>

          <div className="stack" style={{ gap: '0.8rem', padding: '10px 0' }}>
            <label className="check-row" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
              <input type="checkbox" checked={stressLatency} onChange={(e) => toggleStressLatency(e.target.checked)} />
              <span>模擬 Notion 同步 5 秒網絡延遲 ⏳</span>
            </label>
            <label className="check-row" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
              <input type="checkbox" checked={stressFault} onChange={(e) => toggleStressFault(e.target.checked)} />
              <span style={{ color: stressFault ? '#CC2929' : 'inherit' }}>
                模擬 Notion 同步 500 伺服器故障 (Sync 容災測試) ⚠️
              </span>
            </label>
          </div>

          <div className="mini-list" style={{ marginTop: '0.5rem' }}>
            <span>數據規模：當前 receipts 共 {state.receipts.length} 筆 (其中 mock 數據 {state.receipts.filter(r => r.source === 'mock_stress_test').length} 筆)。</span>
            <span>網絡狀態代理：{stressLatency ? '延遲 (5s) ⏳' : '正常 ⚡'} · {stressFault ? '伺服器故障模擬中 (500) ⚠️' : '連線正常 ✅'}</span>
          </div>
        </AccordionCard>
      )}

      {showClearDeviceConfirm && (
        <div
          className="modal-backdrop"
          role="dialog"
          aria-modal="true"
          aria-label="清除此裝置資料"
          onClick={() => setShowClearDeviceConfirm(false)}
          style={{ placeItems: 'center', zIndex: 9999, padding: '20px 20px max(110px, env(safe-area-inset-bottom))' }}
        >
          <div className="modal settings-clear-device-modal" onClick={(event) => event.stopPropagation()}>
            <div className="settings-warning-icon">
              <AlertTriangle size={30} />
            </div>
            <h2>清除此裝置資料？</h2>
            <p>
              會清除此帳號喺本機嘅快取資料、裝置信任同 IndexedDB snapshot，然後登出 Supabase。
            </p>
            <p className="muted">
              雲端 Supabase / Notion 資料不會刪除；下次登入會重新由雲端同步。
            </p>
            <div className="modal-actions">
              <button className="secondary" type="button" disabled={!!busy} onClick={() => setShowClearDeviceConfirm(false)}>
                取消
              </button>
              <button className="danger" type="button" disabled={!!busy} onClick={() => void handleClearDeviceAndSignOut()}>
                <Trash2 size={18} /> 確認清除並登出
              </button>
            </div>
          </div>
        </div>
      )}

      {showClearLocalPreview && (
        <div
          className="modal-backdrop"
          role="dialog"
          aria-modal="true"
          aria-label="Clear local data preview"
          onClick={() => setShowClearLocalPreview(false)}
          style={{ placeItems: 'center', zIndex: 9999, padding: '20px 20px max(110px, env(safe-area-inset-bottom))' }}
        >
          <div className="modal settings-clear-device-modal" onClick={(event) => event.stopPropagation()}>
            <div className="settings-warning-icon">
              <AlertTriangle size={30} />
            </div>
            <h2>清除本地資料前預覽</h2>
            <p>
              將會清除此裝置嘅 React 本地紀錄、broker session、裝置信任同快取。
            </p>
            <div className="settings-restore-preview-grid">
              <span>
                <small>Current trip</small>
                <strong>{currentTrip.name || state.tripName || 'Current trip'}</strong>
              </span>
              <span>
                <small>Local receipts</small>
                <strong>{scopedReceiptsForTrip(state, currentTrip).length}</strong>
              </span>
              <span>
                <small>Cloud data</small>
                <strong>Not deleted</strong>
              </span>
            </div>
            <p className="muted">
              Supabase / Notion 雲端資料不會刪除；重新登入或 pull cloud 後可以再同步。建議先匯出 Backup JSON 或 private trip-share。
            </p>
            <div className="modal-actions">
              <button className="secondary" type="button" disabled={!!busy} onClick={() => setShowClearLocalPreview(false)}>
                Cancel clear
              </button>
              <button className="danger" type="button" disabled={!!busy} onClick={() => void handleClearLocalData()}>
                <Trash2 size={18} /> Confirm local clear
              </button>
            </div>
          </div>
        </div>
      )}

      {showDeleteAccountConfirm && (
        <div
          className="modal-backdrop"
          role="dialog"
          aria-modal="true"
          aria-label="永久刪除帳戶"
          onClick={() => {
            setShowDeleteAccountConfirm(false);
            setDeleteConfirmEmailInput('');
          }}
          style={{ placeItems: 'center', zIndex: 9999, padding: '20px 20px max(110px, env(safe-area-inset-bottom))' }}
        >
          <div className="modal settings-clear-device-modal" onClick={(event) => event.stopPropagation()}>
            <div className="settings-warning-icon" style={{ color: '#dc2626' }}>
              <AlertTriangle size={30} />
            </div>
            <h2>⚠️ 永久刪除帳戶及資料？</h2>
            <p style={{ color: '#dc2626', fontWeight: 600 }}>
              呢個操作係絕對無得撤銷嘅！
            </p>
            <p>
              如果確認，你嘅 Supabase 帳號、所有個人設定、未共享嘅私有旅程以及相關消費紀錄都會被徹底刪除。
            </p>
            <p className="muted" style={{ fontSize: '12px' }}>
              💡 對於同其他人共享緊嘅旅程，相關嘅 Supabase 同 Notion 數據將會被保留，等其他成員仲可以繼續存取 shared trip 資訊。
            </p>
            {deleteAccountError && (
              <p style={{ color: '#dc2626', fontWeight: 600, fontSize: '13px', background: 'rgba(220,38,38,0.08)', padding: '8px 12px', borderRadius: '8px', marginTop: '8px' }}>
                ❌ {deleteAccountError}
              </p>
            )}
            <div style={{ marginTop: '12px', width: '100%' }}>
              <label style={{ display: 'grid', gap: '4px', fontSize: '12px', fontWeight: 800, color: '#374151', textAlign: 'left' }}>
                請輸入你嘅 Email 帳號以確認刪除:
                <input
                  type="text"
                  value={deleteConfirmEmailInput}
                  onChange={(e) => setDeleteConfirmEmailInput(e.target.value)}
                  placeholder={userEmail || ''}
                  style={{ width: '100%', padding: '9px 12px', border: '1px solid rgba(220, 38, 38, 0.3)', borderRadius: '8px', fontSize: '13px', outline: 'none', background: 'white' }}
                />
              </label>
            </div>
            <div className="modal-actions">
              <button className="secondary" type="button" disabled={!!busy} onClick={() => {
                setShowDeleteAccountConfirm(false);
                setDeleteConfirmEmailInput('');
              }}>
                取消
              </button>
              <button
                className="danger"
                type="button"
                disabled={!!busy || deleteConfirmEmailInput.trim().toLowerCase() !== (userEmail || '').trim().toLowerCase()}
                onClick={() => void handleDeleteAccount()}
              >
                <Trash2 size={18} /> 確認永久刪除帳戶
              </button>
            </div>
          </div>
        </div>
      )}

      {tripReviewDraft && tripReviewStats && tripDraftModalOpen && (
        <div
          className="modal-backdrop trip-confirm-backdrop"
          role="presentation"
          onClick={() => setTripDraftModalOpen(false)}
        >
          <section
            className="modal trip-confirm-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="trip-confirm-title"
            aria-describedby="trip-confirm-description"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="modal-head trip-confirm-head">
              <div>
                <span className="pill">Primary · {tripUpdateModelName}</span>
                <h2 id="trip-confirm-title">確認 AI 行程更新</h2>
                <h3>{tripReviewDraft.trip.name}</h3>
                <p id="trip-confirm-description" className="muted">
                  {tripReviewDraft.trip.startDate} → {tripReviewDraft.trip.endDate} · {tripReviewDraft.trip.destinationSummary}
                </p>
              </div>
              <button className="icon-button" type="button" aria-label="關閉行程確認" onClick={() => setTripDraftModalOpen(false)}>
                <X size={18} />
              </button>
            </div>

            <div className="trip-confirm-summary">
              <span><b>{tripReviewStats.dayCount}</b><small>日程</small></span>
              <span><b>{tripReviewStats.spotCount}</b><small>景點</small></span>
              <span><b>{tripReviewStats.lodgingCount}</b><small>酒店</small></span>
              <span><b>{tripReviewStats.foodCount}</b><small>餐飲</small></span>
              <span><b>{tripReviewStats.transportCount}</b><small>交通</small></span>
              <span><b>{tripReviewStats.detailCount}</b><small>細節</small></span>
            </div>

            <div className="trip-review-plain-summary">
              <strong>AI 已經整理好行程，請逐日望一望。</strong>
              <span>{tripReviewDraft.summary || '確認無誤後，行程、天氣和記帳預設會跟住呢份資料更新。'}</span>
            </div>

            {tripReviewWarnings.length > 0 && (
              <details className="trip-review-notices">
                <summary>需要留意 ({tripReviewWarnings.length})</summary>
                <div>
                  {tripReviewWarnings.map((warning, index) => (
                    <span key={`${warning}-${index}`}>{warning}</span>
                  ))}
                </div>
              </details>
            )}

            <div className="trip-review-day-tabs" role="tablist" aria-label="選擇行程日子">
              {tripReviewDays.map((day, index) => (
                <button
                  key={`${day.date}-${day.day}`}
                  type="button"
                  role="tab"
                  aria-selected={index === tripReviewDayIndex}
                  className={index === tripReviewDayIndex ? 'is-active' : ''}
                  onClick={() => setTripReviewDayIndex(index)}
                >
                  <b>Day {day.day}</b>
                  <span>{day.date}</span>
                  <small>{day.region || day.city || '未命名'}</small>
                </button>
              ))}
            </div>

            {tripReviewDay && (
              <article className="trip-confirm-day trip-review-editor">
                <header>
                  <div>
                    <strong>Day {tripReviewDay.day} · {tripReviewDay.date}</strong>
                    <span>{tripReviewDay.region || tripReviewDay.city || '未命名地區'}{tripReviewDay.city && tripReviewDay.city !== tripReviewDay.region ? ` · ${tripReviewDay.city}` : ''}{tripReviewDay.country ? ` · ${tripReviewDay.country}` : ''}</span>
                  </div>
                  <small>{tripReviewDay.currency || ''}{tripReviewDay.timezone ? ` · ${tripReviewDay.timezone}` : ''}</small>
                </header>

                <div className="trip-review-lodging-form">
                  <strong>住宿</strong>
                  <label>酒店名
                    <input
                      value={tripReviewDay.lodging?.name || ''}
                      onChange={(event) => updateTripReviewLodging(tripReviewDayIndex, { name: event.target.value })}
                      placeholder="例如 Hotel Fine Jeju"
                    />
                  </label>
                  <label>地址
                    <input
                      value={tripReviewDay.lodging?.address || ''}
                      onChange={(event) => updateTripReviewLodging(tripReviewDayIndex, { address: event.target.value })}
                      placeholder="可留空"
                    />
                  </label>
                  <label>入住
                    <input
                      type="time"
                      value={tripReviewDay.lodging?.checkIn || ''}
                      onChange={(event) => updateTripReviewLodging(tripReviewDayIndex, { checkIn: event.target.value })}
                    />
                  </label>
                  <label>退房
                    <input
                      type="time"
                      value={tripReviewDay.lodging?.checkOut || ''}
                      onChange={(event) => updateTripReviewLodging(tripReviewDayIndex, { checkOut: event.target.value })}
                    />
                  </label>
                </div>

                <div className="trip-review-toolbar">
                  <strong>{(tripReviewDay.spots || []).length} 個行程點</strong>
                  <span>
                    <button className="secondary mini" type="button" onClick={() => sortTripReviewDay(tripReviewDayIndex)}>按時間排序</button>
                    <button className="secondary mini" type="button" onClick={() => addTripReviewSpot(tripReviewDayIndex)}><Plus size={14} /> 新增</button>
                  </span>
                </div>

                <div className="trip-confirm-spots trip-review-spot-list">
                  {(tripReviewDay.spots || []).map((spot, index) => (
                    <div key={`${tripReviewDay.date}-${index}-${spot.id || spot.spotId || spot.name}`} className="trip-confirm-spot trip-review-spot-editor">
                      <div className="trip-review-time-grid">
                        <label>開始
                          <input
                            type="time"
                            value={spot.time || ''}
                            onChange={(event) => updateTripReviewSpot(tripReviewDayIndex, index, { time: event.target.value })}
                          />
                        </label>
                        <label>結束
                          <input
                            type="time"
                            value={spot.timeEnd || ''}
                            onChange={(event) => updateTripReviewSpot(tripReviewDayIndex, index, { timeEnd: event.target.value })}
                          />
                        </label>
                      </div>
                      <div className="trip-review-spot-fields">
                        <label>地點 / 活動
                          <input
                            value={spot.name || ''}
                            onChange={(event) => updateTripReviewSpot(tripReviewDayIndex, index, { name: event.target.value })}
                            placeholder="地點名稱"
                          />
                        </label>
                        <label>類別
                          <select
                            value={spot.type || 'other'}
                            onChange={(event) => updateTripReviewSpot(tripReviewDayIndex, index, { type: event.target.value as ItinerarySpot['type'] })}
                          >
                            {TRIP_REVIEW_SPOT_TYPES.map((type) => (
                              <option key={type} value={type}>{categoryById(type).name}</option>
                            ))}
                          </select>
                        </label>
                        <label>地址
                          <input
                            value={spot.address || ''}
                            onChange={(event) => updateTripReviewSpot(tripReviewDayIndex, index, { address: event.target.value })}
                            placeholder="可留空"
                          />
                        </label>
                        <label>備註
                          <input
                            value={spot.note || ''}
                            onChange={(event) => updateTripReviewSpot(tripReviewDayIndex, index, { note: event.target.value })}
                            placeholder="例如 optional、已預約、注意事項"
                          />
                        </label>
                        <div className="trip-review-row-actions">
                          <button className="secondary mini" type="button" disabled={index === 0} onClick={() => moveTripReviewSpot(tripReviewDayIndex, index, -1)}><ArrowUp size={14} /> 上移</button>
                          <button className="secondary mini" type="button" disabled={index === (tripReviewDay.spots || []).length - 1} onClick={() => moveTripReviewSpot(tripReviewDayIndex, index, 1)}><ArrowDown size={14} /> 下移</button>
                          <button className="danger mini" type="button" onClick={() => removeTripReviewSpot(tripReviewDayIndex, index)}><Trash2 size={14} /> 刪除</button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </article>
            )}

            <div className="modal-actions trip-confirm-actions">
              <button className="secondary" type="button" onClick={() => setTripDraftModalOpen(false)}>返回修改文字</button>
              <button className="primary" type="button" onClick={() => applyTripDraft(tripReviewDraft)}>確認並更新行程</button>
            </div>
          </section>
        </div>
      )}

      {apiKeyModalOpen && (
        <div
          className="modal-backdrop"
          role="presentation"
          onClick={() => { setApiKeyModalOpen(false); setApiKeyStatus('idle'); setApiKeyMessage(''); }}
        >
          <section
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="api-key-modal-title"
            onClick={(event) => event.stopPropagation()}
            style={{ maxWidth: '420px' }}
          >
            <div className="modal-head">
              <div>
                <h2 id="api-key-modal-title">Change API Key</h2>
                <p className="muted">更新 LLM provider 嘅 API key。Key 會安全儲存喺 Credential Broker。</p>
              </div>
              <button className="icon-button" type="button" aria-label="Close" onClick={() => { setApiKeyModalOpen(false); setApiKeyStatus('idle'); setApiKeyMessage(''); }}>
                <X size={18} />
              </button>
            </div>

            <div className="form-grid" style={{ gap: '0.75rem' }}>
              <label>Provider
                <select value={apiKeyProvider} onChange={(e) => { setApiKeyProvider(e.target.value as CredentialProvider); setApiKeyStatus('idle'); setApiKeyMessage(''); }}>
                  <option value="kimi">Kimi (kimi-code, kimi-8k, kimi-32k, kimi-k2.6, kimi-for-coding)</option>
                  <option value="google">Google (Gemini, Gemma — all Google models)</option>
                  <option value="mimo">Mimo (Mimo v2.5, Mimo v2.5 Pro)</option>
                  <option value="weatherapi">WeatherAPI (weather forecasts)</option>
                </select>
              </label>

              <label>New API Key
                <input
                  type="password"
                  value={apiKeySecret}
                  onChange={(e) => setApiKeySecret(e.target.value)}
                  placeholder="Enter new API key"
                  autoComplete="off"
                />
              </label>

              <label>Admin Passphrase
                <input
                  type="password"
                  value={apiKeyAdmin}
                  onChange={(e) => setApiKeyAdmin(e.target.value)}
                  placeholder="Admin maintenance passphrase"
                  autoComplete="off"
                />
              </label>
            </div>

            {apiKeyStatus !== 'idle' && (
              <div style={{
                margin: '0.75rem 0',
                padding: '0.5rem 0.75rem',
                borderRadius: '8px',
                fontSize: '0.85rem',
                background: apiKeyStatus === 'success' ? 'rgba(34,197,94,0.15)' : apiKeyStatus === 'error' ? 'rgba(239,68,68,0.15)' : 'rgba(59,130,246,0.15)',
                color: apiKeyStatus === 'success' ? '#22c55e' : apiKeyStatus === 'error' ? '#ef4444' : '#3b82f6',
              }}>
                {apiKeyStatus === 'testing' && '🔄 Testing API key...'}
                {apiKeyStatus === 'success' && `✅ ${apiKeyMessage}`}
                {apiKeyStatus === 'error' && `❌ ${apiKeyMessage}`}
              </div>
            )}

            <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', marginTop: '0.75rem' }}>
              <button
                type="button"
                className="secondary"
                onClick={() => { setApiKeyModalOpen(false); setApiKeyStatus('idle'); setApiKeyMessage(''); }}
              >
                Cancel
              </button>
              <button
                type="button"
                className="primary"
                disabled={!apiKeySecret.trim() || !apiKeyAdmin.trim() || apiKeyStatus === 'testing'}
                onClick={async () => {
                  setApiKeyStatus('testing');
                  setApiKeyMessage('Testing API key...');
                  try {
                    const testResult = await testProviderConnection(state, apiKeyProvider);
                    if (testResult.includes('connected')) {
                      setApiKeyMessage('Existing key still works. Rotating to new key...');
                    }
                  } catch {
                    // Test with new key will happen during rotation
                  }
                  try {
                    const result = await rotateProviderCredential(state, apiKeyProvider, apiKeySecret.trim(), apiKeyAdmin.trim(), {});
                    if (result.status === 'connected') {
                      setApiKeyStatus('success');
                      setApiKeyMessage(`API key updated for ${apiKeyProvider}. All related models now use the new key.`);
                      setApiKeySecret('');
                      setApiKeyAdmin('');
                    } else {
                      setApiKeyStatus('error');
                      setApiKeyMessage(`API key rotation returned status: ${result.status}. Key was not updated.`);
                    }
                  } catch (err) {
                    setApiKeyStatus('error');
                    setApiKeyMessage(`Failed to update API key: ${err instanceof Error ? err.message : 'Unknown error'}. The new key may not be working.`);
                  }
                }}
              >
                {apiKeyStatus === 'testing' ? 'Testing...' : 'Test & Save'}
              </button>
            </div>
          </section>
        </div>
      )}

      {showDeleteConfirm && (() => {
        const targetTrip = trips.find(t => t.id === managerTripId);
        if (!targetTrip) return null;
        const deleteCount = state.receipts.filter(r => r.tripId === managerTripId).length;
        return (
          <div
            className="modal-backdrop"
            onClick={() => setShowDeleteConfirm(false)}
            style={{
              display: 'grid',
              placeItems: 'center',
              background: 'rgba(10, 8, 8, 0.7)',
              backdropFilter: 'blur(12px)',
              WebkitBackdropFilter: 'blur(12px)',
              zIndex: 9999,
            }}
          >
            <div
              className="modal"
              onClick={(event) => event.stopPropagation()}
              style={{
                width: 'min(480px, 95vw)',
                background: 'rgba(30, 20, 20, 0.85)',
                border: '1px solid rgba(239, 68, 68, 0.3)',
                borderRadius: '20px',
                padding: '24px',
                boxShadow: '0 25px 60px rgba(239, 68, 68, 0.15), 0 0 0 1px rgba(239, 68, 68, 0.1)',
                backdropFilter: 'blur(20px)',
                WebkitBackdropFilter: 'blur(20px)',
                color: '#fff',
                textAlign: 'center',
                animation: 'page-rise 0.3s cubic-bezier(0.16, 1, 0.3, 1)'
              }}
            >
              {/* Alert Icon */}
              <div style={{ display: 'inline-grid', placeItems: 'center', width: '64px', height: '64px', borderRadius: '50%', background: 'rgba(239, 68, 68, 0.15)', color: '#EF4444', marginBottom: '16px', border: '1px solid rgba(239, 68, 68, 0.3)' }}>
                <AlertTriangle size={32} style={{ animation: 'pulse 2s infinite' }} />
              </div>

              {/* Title */}
              <h2 style={{ margin: '0 0 12px 0', fontSize: '20px', fontWeight: 800, color: '#EF4444' }}>
                ⚠️ 永久刪除旅程警告
              </h2>

              {/* Warning Content */}
              <p style={{ margin: '0 0 20px 0', fontSize: '15px', color: 'rgba(255, 255, 255, 0.9)', lineHeight: 1.6, textAlign: 'left' }}>
                Boss 🫡，你確定要永久刪除旅程<strong>「{targetTrip.name}」</strong>嗎？
                <br />
                <span style={{ color: '#EF4444', fontWeight: 'bold', display: 'block', marginTop: '8px' }}>
                  ❌ 此操作將會連帶刪除該旅程下所有關聯嘅 {deleteCount} 筆消費紀錄！
                </span>
                <span style={{ color: 'rgba(255, 255, 255, 0.7)', fontSize: '13px', display: 'block', marginTop: '4px' }}>
                  * 此物理級連鎖刪除一旦執行就無法撤銷，並會同步推送至雲端資料庫（Supabase & Notion）！
                </span>
              </p>

              {/* Buttons */}
              <div style={{ display: 'flex', gap: '12px', marginTop: '24px' }}>
                <button
                  type="button"
                  onClick={() => setShowDeleteConfirm(false)}
                  style={{
                    flex: 1,
                    padding: '10px 16px',
                    borderRadius: '10px',
                    border: '1px solid rgba(255, 255, 255, 0.15)',
                    background: 'rgba(255, 255, 255, 0.05)',
                    color: '#fff',
                    fontSize: '14px',
                    fontWeight: 600,
                    cursor: 'pointer',
                    transition: 'all 0.2s'
                  }}
                  onMouseOver={(e) => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)'}
                  onMouseOut={(e) => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)'}
                >
                  取消
                </button>
                <button
                  type="button"
                  onClick={handleDeleteManagedTrip}
                  style={{
                    flex: 1,
                    padding: '10px 16px',
                    borderRadius: '10px',
                    border: 'none',
                    background: '#EF4444',
                    color: '#fff',
                    fontSize: '14px',
                    fontWeight: 700,
                    cursor: 'pointer',
                    boxShadow: '0 4px 12px rgba(239, 68, 68, 0.3)',
                    transition: 'all 0.2s'
                  }}
                  onMouseOver={(e) => e.currentTarget.style.background = '#DC2626'}
                  onMouseOut={(e) => e.currentTarget.style.background = '#EF4444'}
                >
                  確認永久刪除 🗑️
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {status && <Toast tone={/失敗|未連線|暫停|請輸入/.test(status) ? 'warning' : 'success'}>{status}</Toast>}

      <div style={{ display: 'flex', justifyContent: 'center', marginTop: '2rem', paddingBottom: '2rem' }}>
        <span onClick={handleVersionClick} style={{ cursor: 'pointer', userSelect: 'none', color: '#000000', fontSize: '12px', letterSpacing: '0.05em' }}>
          Build: {buildLabel} {clickCount > 0 ? `(${clickCount}/5)` : ''} {showStressPanel ? '🔓' : '🔒'}
        </span>
      </div>

      </div>
    </section>
  );
}
