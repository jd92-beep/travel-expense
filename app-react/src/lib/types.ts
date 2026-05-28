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
export type TripPhase = 'prep' | 'trip' | 'post';
export type SyncStatus = 'local' | 'queued' | 'syncing' | 'synced' | 'error' | 'failed';
export type GlobalSyncStatus = 'idle' | 'queued' | 'pushing' | 'pulling' | 'synced' | 'error' | 'offline';

export interface Person {
  id: string;
  name: string;
  emoji: string;
  color: string;
}

export interface Receipt {
  id: string;
  supabaseId?: string;
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
  photoThumb?: string;
  photoUrl?: string;
  notionFileUploadId?: string;
  _photoSyncedToNotion?: boolean;
  _photoBodyBlockAdded?: boolean;
  personId?: string;
  splitMode?: SplitMode;
  beneficiaryId?: string;
  phase?: TripPhase;
  createdAt?: number;
  notionPageId?: string;
  source?: string;
  sourceId?: string;
  tripId?: string;
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
  name: string;
  type: CategoryId | 'sightseeing';
  note?: string;
  address?: string;
  mapUrl?: string;
  lat?: number;
  lon?: number;
  timezone?: string;
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
  lodging?: {
    id?: string;
    name: string;
    address?: string;
    mapUrl?: string;
    checkIn?: string;
    checkOut?: string;
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
  itinerary: ItineraryDay[];
  notionPageId?: string;
  sourceId?: string;
  notionDb?: string;
  createdAt: number;
  updatedAt: number;
}

export interface TripDraft {
  trip: TripProfile;
  summary: string;
  warnings: string[];
  changes: string[];
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
  error?: string;
}

export interface AppState {
  schemaVersion: number;
  receipts: Receipt[];
  budget: number;
  rate: number;
  rateTable?: Record<string, ExchangeRateEntry>;
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
