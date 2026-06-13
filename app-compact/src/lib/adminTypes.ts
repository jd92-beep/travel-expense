export interface AdminUser {
  id: string;
  email: string;
  joinedAt: string;
  lastSeenAt: string;
  sessionCount: number;
  eventCount: number;
  tripCount: number;
  receiptCount: number;
  imageCount: number;
  notionConnected: boolean;
  aiRequestsToday: number;
  health: string;
}

export interface AdminTrip {
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
  updatedAt: string;
}

export interface AdminReceipt {
  id: string;
  tripId: string;
  ownerId: string;
  store: string;
  status: string;
  amount: number;
  currency: string;
  recordDate: string;
  updatedAt: string;
  notionSynced: boolean;
  photoPath: string;
}

export interface AdminNotion {
  connectedUsers: number;
  integrationRows: number;
  syncedReceipts: number;
  failedJobs: number;
  pendingJobs: number;
  lastSyncedAt: string;
}

export interface AdminLlm {
  provider: string;
  label: string;
  status: string;
  storedStatus: string;
  model: string;
  lastTestedAt: string;
  errors24h: number;
}

export interface AdminAudit {
  id: string;
  adminSubject: string;
  action: string;
  targetType: string;
  targetId: string;
  createdAt: string;
}

export interface AdminSnapshot {
  supabase: { projectRef: string; status: string; counts: Record<string, number>; rls: Array<{ table: string; rls_enabled: boolean; force_rls: boolean }> };
  usage: { rangeDays: number; events: number; activeUsers: number; sessions: number; bySurface: Array<{ surface: string; count: number }> };
  users: AdminUser[];
  trips: AdminTrip[];
  receipts: AdminReceipt[];
  notion: AdminNotion;
  llm: AdminLlm[];
  audit: AdminAudit[];
  warnings: string[];
}
