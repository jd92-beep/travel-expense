export type HealthState = 'healthy' | 'warning' | 'danger' | 'unknown';

export type AdminSession = {
  token: string;
  adminSubject: string;
  expiresAt: string;
};

export type SupabaseCountKey =
  | 'authUsers'
  | 'profiles'
  | 'trips'
  | 'receipts'
  | 'receiptItems'
  | 'receiptPhotos'
  | 'integrations'
  | 'receiptSyncJobs'
  | 'usageEvents'
  | 'auditEvents';

export type SupabaseRlsState = {
  table: string;
  enabled: boolean;
  force: boolean;
};

export type UsageSummary = {
  rangeDays: number;
  events: number;
  activeUsers: number;
  sessions: number;
  bySurface: Array<{ surface: string; events: number; users: number }>;
};

export type AdminUserCard = {
  id: string;
  email: string;
  displayName: string | null;
  avatarUrl: string | null;
  locale: string | null;
  homeCurrency: string | null;
  joinedAt: string | null;
  createdAt: string | null;
  lastSeenAt: string | null;
  lastSyncAt: string | null;
  sessionCount: number;
  eventCount: number;
  tripCount: number;
  receiptCount: number;
  imageCount: number;
  notionConnected: boolean;
  notionStatus: string;
  notionStatusLabel?: string;
  notionLastSyncedAt: string | null;
  supabaseConnected: boolean;
  syncJobCount: number;
  failedSyncJobs: number;
  aiRequestsToday: number;
  health: HealthState;
};

export type AdminTripCard = {
  id: string;
  ownerId: string;
  ownerEmail: string;
  name: string;
  destination: string;
  dateRange: string;
  countryCode: string;
  currency: string;
  active: boolean;
  archived: boolean;
  receiptCount: number;
  updatedAt: string | null;
  budgetAmount: number | null;
  budgetCurrency: string | null;
  memberCount: number;
  timezones: string[];
  itinerary: any[] | null;
};

export type AdminReceiptCard = {
  id: string;
  tripId: string;
  ownerId: string;
  store: string;
  status: string;
  amount: number;
  currency: string;
  recordDate: string;
  updatedAt: string | null;
  notionSynced: boolean;
  photoPath: string | null;
  category: string | null;
};

export type AdminNotionSummary = {
  connectedUsers: number;
  integrationRows: number;
  syncedReceipts: number;
  failedJobs: number;
  pendingJobs: number;
  lastSyncedAt: string | null;
};

export type AdminProviderHealth = {
  provider: string;
  label: string;
  status: HealthState;
  storedStatus: string;
  model?: string;
  modelName: string | null;
  lastTestedAt?: string | null;
  latencyMs?: number | null;
  errors24h?: number;
  message?: string;
};

export type AdminAuditEvent = {
  id: string;
  adminSubject: string;
  action: string;
  targetType: string;
  targetId: string | null;
  createdAt: string;
};

export type AdminKanbanSnapshot = {
  generatedAt: string;
  staleAfterSeconds: number;
  source: 'live' | 'live-edge' | 'fixture' | 'configuration_error';
  supabase: {
    projectRef: string;
    status: HealthState;
    counts: Record<SupabaseCountKey, number>;
    rls: SupabaseRlsState[];
  };
  usage: UsageSummary;
  users: AdminUserCard[];
  trips: AdminTripCard[];
  receipts: AdminReceiptCard[];
  notion: AdminNotionSummary;
  llm: AdminProviderHealth[];
  audit: AdminAuditEvent[];
  warnings: string[];
};

export type DeletePreview = {
  userId: string;
  emailMasked: string;
  counts: Record<string, number>;
  confirmPhrase: string;
  generatedAt: string;
};
