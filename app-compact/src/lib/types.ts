export type CategoryId =
  | 'flight'
  | 'transport'
  | 'food'
  | 'shopping'
  | 'lodging'
  | 'ticket'
  | 'localtour'
  | 'medicine'
  | 'other';

export type PaymentId = 'cash' | 'credit' | 'paypay' | 'suica';
export type SplitMode = 'shared' | 'private';
export type ReceiptVisibility = 'trip' | 'private';
export type TripPhase = 'prep' | 'trip' | 'post';
export type SyncStatus = 'local' | 'queued' | 'syncing' | 'synced' | 'error' | 'failed';
export type GlobalSyncStatus = 'idle' | 'queued' | 'pushing' | 'pulling' | 'synced' | 'error' | 'offline';
export type TripMemberRole = 'owner' | 'admin' | 'editor' | 'viewer';
export type TripInviteStatus = 'pending' | 'accepted' | 'revoked' | 'expired';
export type TripBackendStatus = 'active' | 'pending' | 'error' | 'disabled';
export type TripThemeKey = 'japan_washi' | 'korea_editorial' | 'taiwan_nightmarket' | 'europe_rail' | 'global_journal';

export interface TripIntelligence {
  countryCode: string;
  countryName?: string;
  primaryCurrency: string;
  themeKey: TripThemeKey;
  locale?: string;
  timezone?: string;
  weatherRegion?: string;
  tripStyle?: 'balanced' | 'food' | 'shopping' | 'culture' | 'nature' | 'family' | 'business';
  homeCity?: string;
  weatherPreference?: 'balanced' | 'rain' | 'heat' | 'cold' | 'wind' | 'uv';
  confidence?: 'low' | 'medium' | 'high';
  source?: 'ai' | 'heuristic' | 'manual';
  updatedAt?: number;
}

export interface Person {
  id: string;
  name: string;
  emoji: string;
  color: string;
}

export interface ReceiptLineItem {
  id: string;
  desc: string;
  amount: number;
  qty?: number;
}

export interface Receipt {
  id: string;
  supabaseId?: string;
  ownerId?: string;
  createdByEmail?: string;
  createdByLabel?: string;
  version?: number;
  ledgerSyncStatus?: 'synced' | 'queued' | 'notion_pending' | 'notion_failed' | 'conflict';
  store: string;
  total: number;
  originalAmount?: number;
  originalCurrency?: string;
  currency?: string;
  hkdAmount?: number;
  exchangeRate?: number;
  rateSource?: string;
  date: string;
  time?: string;
  category: CategoryId;
  payment: PaymentId;
  region?: string;
  regionSnapshot?: string;
  address?: string;
  mapUrl?: string;
  bookingRef?: string;
  note?: string;
  itemsText?: string;
  lineItems?: ReceiptLineItem[];
  photoThumb?: string;
  photoUrl?: string;
  notionFileUploadId?: string;
  _photoSyncedToNotion?: boolean;
  _photoBodyBlockAdded?: boolean;
  _photoSyncedToSupabase?: boolean;
  _photoSyncAttempts?: number;
  supabasePhotoPath?: string;
  personId?: string;
  splitMode?: SplitMode;
  beneficiaryId?: string;
  // Per-record visibility in shared trips. 'private' = owner-only (enforced by Supabase RLS);
  // undefined/'trip' = all trip members. Only valid on splitMode 'private' records without a
  // cross-person beneficiary — hidden records must never affect another member's balance.
  visibility?: ReceiptVisibility;
  phase?: TripPhase;
  createdAt?: number;
  notionPageId?: string;
  source?: string;
  sourceId?: string;
  tripId?: string;
  tripLinkSource?: 'explicit' | 'date-auto' | 'prep-auto' | 'fallback-auto';
  tripVersion?: number;
  tripDayId?: string;
  spotId?: string;
  syncStatus?: SyncStatus;
  updatedAt?: number;
}

export interface AppCredentials {
  credentialBrokerUrl?: string;
  credentialSession?: string;
  credentialSessionExpiresAt?: number;
}

export interface ItinerarySpot {
  id?: string;
  spotId?: string;
  time: string;
  timeEnd?: string;
  name: string;
  type: CategoryId | 'sightseeing';
  note?: string;
  address?: string;
  mapUrl?: string;
  lat?: number;
  lon?: number;
  timezone?: string;
  bookingRef?: string;
  sourceText?: string;
  confidence?: 'low' | 'medium' | 'high';
}

export interface ItineraryDay {
  id?: string;
  dayId?: string;
  date: string;
  day: number;
  region: string;
  city?: string;
  country?: string;
  timezone?: string;
  currency?: string;
  highlight?: string;
  note?: string;
  lodging?: {
    id?: string;
    name: string;
    address?: string;
    mapUrl?: string;
    checkIn?: string;
    checkOut?: string;
    bookingRef?: string;
    lat?: number;
    lon?: number;
    sourceText?: string;
    confidence?: 'low' | 'medium' | 'high';
  };
  spots: ItinerarySpot[];
}

export interface TripProfile {
  id: string;
  supabaseId?: string;
  name: string;
  destinationSummary: string;
  startDate: string;
  endDate: string;
  homeCurrency: string;
  currencies: string[];
  timezones: string[];
  version: number;
  active: boolean;
  archived?: boolean;
  budget?: number;
  intelligence?: TripIntelligence;
  itinerary: ItineraryDay[];
  notionPageId?: string;
  sourceId?: string;
  notionDb?: string;
  sharing?: TripSharingState;
  createdAt: number;
  updatedAt: number;
}

export interface TripMemberSummary {
  userId: string;
  email?: string;
  displayName?: string;
  role: TripMemberRole;
  status: 'active' | 'invited' | 'removed';
  joinedAt?: string;
  lastActiveAt?: string;
  defaultPersonId?: string;
}

export interface TripInviteSummary {
  id: string;
  email: string;
  role: Exclude<TripMemberRole, 'owner' | 'admin'>;
  status: TripInviteStatus;
  expiresAt: string;
  createdAt: string;
  token?: string;
}

export interface TripBackendHealth {
  status: TripBackendStatus | 'missing';
  syncMode?: 'dual_write';
  lastHealthAt?: string;
  lastError?: string;
}

export interface TripSharingState {
  role: TripMemberRole;
  isShared: boolean;
  memberCount: number;
  pendingInviteCount: number;
  members?: TripMemberSummary[];
  invites?: TripInviteSummary[];
  backendHealth?: TripBackendHealth;
}

export interface TripSharingInviteDraft {
  email: string;
  role: Exclude<TripMemberRole, 'owner' | 'admin'>;
  displayName?: string;
  createAccountingPerson?: boolean;
}

export interface TripDraft {
  trip: TripProfile;
  summary: string;
  warnings: string[];
  changes: string[];
  organizedItinerary?: string;
  extractionReport?: TripExtractionReport;
}

export interface TripExtractionReport {
  daysExtracted: number;
  spotsExtracted: number;
  hotelsExtracted: number;
  restaurantsExtracted: number;
  transportsExtracted: number;
  importantDetailsExtracted: number;
  sourceQuality: 'low' | 'medium' | 'high';
  missingCriticalFields: string[];
  assumptions: string[];
  warnings: string[];
}

export interface ExchangeRateEntry {
  currency: string;
  perHkd: number;
  source: string;
  fetchedAt: number;
}

export interface SyncQueueItem {
  id: string;
  type: 'receipt' | 'trip' | 'settings' | 'delete-receipt';
  entityId: string;
  op: 'create' | 'update' | 'delete' | 'upsert';
  status: SyncStatus;
  attempts: number;
  error?: string;
  createdAt: number;
  updatedAt: number;
  payload?: {
    notionPageId?: string;
    supabaseId?: string;
    tripId?: string;
    sourceId?: string;
    tombstoneKey?: string;
    updatedAt?: number;
  };
}

export interface SyncEngineState {
  status: GlobalSyncStatus;
  lastSyncedAt: number;
  pendingCount: number;
  failedCount: number;
  error?: string;
}

export interface AppState {
  schemaVersion: number;
  receipts: Receipt[];
  budget: number;
  rate: number;
  rateTable?: Record<string, ExchangeRateEntry>;
  // Absent/'live' = today's behavior (auto-refresh from Visa/open.er-api on boot + manual refresh).
  // 'fixed' = the user pre-exchanged currency before the trip and locked in that rate; nothing
  // auto-overwrites `rate`/`rateTable[tripCurrency]` until they switch back to 'live'.
  rateMode?: 'live' | 'fixed';
  tripCurrency: string;
  autoSync: boolean;
  proxy: string;
  notionDb: string;
  personalNotionConnected?: boolean;
  credentialBrokerUrl?: string;
  credentialSession?: string;
  credentialSessionExpiresAt?: number;
  scanModel: string;
  voiceModel: string;
  emailModel: string;
  tripUpdateModel?: string;
  googleBackupModel?: string;
  persons: Person[];
  shareRatios: Record<string, number>;
  peopleByTripId?: Record<string, Person[]>;
  shareRatiosByTripId?: Record<string, Record<string, number>>;
  tripName: string;
  tripDateRange: { start: string; end: string };
  activeTripId?: string;
  trips?: TripProfile[];
  customItinerary: ItineraryDay[] | null;
  itineraryOverrides?: Record<string, Partial<ItinerarySpot> | null>;
  statsIncludeTransportLodging: boolean;
  top10IncludeBigItems: boolean;
  lastTab: TabId;
  notionDeletedIds?: string[];
  notionDeletedSourceIds?: string[];
  syncQueue?: SyncQueueItem[];
  settingsUpdatedAt?: number;
  lastSyncedAt?: number;
  globalSyncStatus?: GlobalSyncStatus;
  syncError?: string;
  settingsPulledAt?: number;
  displayCurrency?: string;
  // LOCAL-ONLY cache of AI-translated shop names for the Stats "TOP 10 支出" chart.
  // Keyed by the original (untranslated) store name; never synced to Supabase/Notion.
  storeTranslations?: Record<string, { t: string; at: number }>;
}

export type TabId = 'dashboard' | 'scan' | 'timeline' | 'history' | 'weather' | 'stats' | 'settings';

export interface SettlementTransfer {
  from: Person;
  to: Person;
  amount: number;
}

export interface SettlementSnapshot {
  transfers: SettlementTransfer[];
  balances: Array<Person & { balance: number; paidShared: number; shouldPayShared: number }>;
  sharedTotal: number;
  sharedByPayer: number[];
  privateByOwner: number[];
  crossPrivate: Array<{
    payerIdx: number;
    benIdx: number;
    amount: number;
    payer: Person;
    beneficiary: Person;
    store: string;
    date: string;
    id: string;
  }>;
}
