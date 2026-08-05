export type AdminSourceState = "live" | "stale" | "unavailable";

export type AdminMeta = {
  requestId: string;
  generatedAt: string;
  warnings: string[];
  staleAfterSeconds?: number;
  scope?: "shared-cloud" | "compact-web" | "android";
  sources?: Record<string, AdminSourceState>;
  nextCursor?: string;
  total?: number;
};

export type AdminEnvelope<T> = {
  ok: true;
  data: T;
  error: null;
  meta: AdminMeta;
};

export type PagedData<T> = { items: T[] };

export type OverviewData = {
  counts: {
    activeAccounts: number;
    openTrips: number;
    recentReceipts: number;
    failedJobs: number;
    integrityIssues: number;
  };
  incidents: Array<{
    id: string;
    severity: string;
    kind: string;
    status: string;
    title: string;
    created_at: string;
  }>;
  statusStrip: Array<{
    id: string;
    status: string;
    lastSeenAt: string | null;
  }>;
  clientVersions: Array<{
    app_surface: string;
    app_build: string;
    contract_version: number;
    installations: number;
    last_seen_at: string | null;
  }>;
  recentOperations: Array<{
    id: string;
    action: string;
    target_type: string;
    target_id_hash: string | null;
    request_id: string | null;
    result: unknown;
    created_at: string;
  }>;
};

export type AccountRow = {
  id: string;
  masked_email: string;
  display_name: string | null;
  status: string;
  last_seen_at: string | null;
  compact_last_seen_at: string | null;
  android_last_seen_at: string | null;
  compact_version: string | null;
  android_version: string | null;
  trip_count: number;
  receipt_count: number;
  last_sync_at: string | null;
  failed_sync_jobs: number;
  notion_status: string;
  shared_mirror_status: string;
  open_risk: number;
  updated_at: string;
};

export type TripRow = {
  id: string;
  owner_id: string;
  owner_masked_email: string;
  name: string;
  destination_summary: string | null;
  start_date: string | null;
  end_date: string | null;
  trip_currency: string;
  home_currency: string;
  budget_amount: number | null;
  budget_currency: string;
  version: number;
  archived: boolean;
  member_count: number;
  receipt_count: number;
  expected_days: number;
  actual_days: number;
  out_of_range_days: number;
  duplicate_days: number;
  integrity_status: string;
  itinerary_coverage: number;
  notion_binding_status: string;
  updated_at: string;
};

export type ReceiptRow = {
  id: string;
  trip_id: string;
  trip_name: string;
  owner_id: string;
  owner_masked_email: string;
  store: string;
  record_date: string;
  record_time: string | null;
  amount: number;
  currency: string;
  record_kind: string;
  visibility: string;
  category: string | null;
  payment_method: string | null;
  status: string;
  notion_sync_status: string;
  version: number;
  deleted_at: string | null;
  has_photo: boolean;
  integrity_status: string;
  updated_at: string;
};

export type IncidentRow = {
  id: string;
  severity: string;
  kind: string;
  status: string;
  title: string;
  created_at: string;
  resolved_at: string | null;
};

export type SyncJobRow = {
  id: string;
  receipt_id: string;
  trip_id: string;
  owner_id: string;
  owner_masked_email: string;
  provider: string;
  operation: string;
  status: string;
  attempts: number;
  next_attempt_at: string | null;
  last_error: string | null;
  created_at: string;
  updated_at: string;
};

export type IntegrityRow = {
  id: string;
  run_id: string;
  severity: string;
  finding_type: string;
  entity_type: string;
  entity_id: string | null;
  detail: Record<string, unknown>;
  created_at: string;
};

export type IntegrityData = PagedData<IntegrityRow> & {
  run?: {
    id: string;
    source: string;
    status: string;
    summary: {
      checkVersion?: string;
      recordsChecked?: number;
      findings?: number;
      high?: number;
      medium?: number;
      low?: number;
      errorCode?: string;
    };
    startedAt?: string | null;
    completedAt?: string | null;
    started_at?: string | null;
    completed_at?: string | null;
  } | null;
  state?: string;
};

export type AuditRow = {
  id: string;
  sequence?: number;
  previous_event_hash?: string;
  event_hash?: string;
  admin_subject_hash: string;
  session_hash?: string;
  authentication_method?: string;
  risk?: string;
  action: string;
  target_type: string;
  target_id_hash: string | null;
  request_id: string | null;
  preview_counts: Record<string, unknown> | null;
  preview_hash?: string | null;
  before_state?: Record<string, unknown> | null;
  after_state?: Record<string, unknown> | null;
  result: Record<string, unknown> | null;
  error_code?: string | null;
  operation_id?: string | null;
  incident_id?: string | null;
  frontend_version?: string | null;
  edge_version?: string | null;
  schema_version?: string | null;
  created_at: string;
};

export type ItinerarySpot = {
  id: string;
  name: string;
  time?: string;
  address?: string;
  order: number;
};

export type ItineraryDay = {
  date: string;
  title: string;
  location?: string;
  notes?: string;
  spots: ItinerarySpot[];
};

export type ItineraryData = {
  tripId: string;
  startDate: string;
  endDate: string;
  version: number;
  days: ItineraryDay[];
  integrityIssues: Array<{
    code: string;
    date?: string;
    count?: number;
    spotCount?: number;
  }>;
};

export type ItineraryVersionRow = {
  version: number;
  start_date: string;
  end_date: string;
  itinerary: unknown[];
  actor_id: string | null;
  source: string;
  created_at: string;
};

export type ItineraryVersionsData = PagedData<ItineraryVersionRow>;

export type AdminOperationStatus =
  | "previewed"
  | "authorized"
  | "queued"
  | "executing"
  | "compensating"
  | "completed"
  | "partially_failed"
  | "failed"
  | "failed_manual"
  | "outcome_unknown"
  | "cancelled"
  | "expired";

export type AdminOperation = {
  id: string;
  idempotencyKey: string;
  action: string;
  risk: "R1" | "R2" | "R3";
  targetType: string;
  targetHash: string;
  targetVersion: string | null;
  previewHash: string;
  status: AdminOperationStatus;
  preview: {
    title?: string;
    consequence?: string;
    affectedCount?: number;
    rollbackBoundary?: string;
    [key: string]: unknown;
  };
  result: Record<string, unknown> | null;
  error: { code: string; message: string } | null;
  requestId: string;
  previewExpiresAt: string;
  createdAt: string;
  updatedAt: string;
  startedAt: string | null;
  completedAt: string | null;
};

export type OperationListData = PagedData<AdminOperation>;

export type OperationCommitData = {
  operation: AdminOperation;
  reused: boolean;
  bundle?: Record<string, unknown>;
  probe?: Record<string, unknown>;
  invite?: {
    link: string;
    expiresAt: string | null;
  };
};
