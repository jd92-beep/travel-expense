import { useCallback, useEffect, useMemo, useState } from 'react';
import { createClient, type Session, type SupabaseClient, type User } from '@supabase/supabase-js';
import { activeTrip, normalizeItinerary, normalizeTripIntelligence, stampReceiptForTrip } from '../domain/trip/normalize';
import { tripIntelligenceColumns } from '../domain/trip/context';
import { DEFAULT_NOTION_DB, normalizeAiModelSettings } from './constants';
import type { AppState, CategoryId, ItineraryDay, PaymentId, Person, Receipt, TripInviteSummary, TripMemberRole, TripMemberSummary, TripProfile, TripSharingInviteDraft, TripSharingState } from './types';

type SupabaseTripRow = {
  id: string;
  owner_id: string;
  name: string;
  destination_summary: string | null;
  start_date: string | null;
  end_date: string | null;
  home_currency: string;
  trip_currency: string;
  timezones: string[];
  budget_amount: number | null;
  budget_currency: string;
  active: boolean;
  legacy_source_id: string | null;
  itinerary?: unknown;
  app_metadata?: unknown;
  version?: number | null;
  archived?: boolean | null;
  notion_page_id?: string | null;
  notion_database_id?: string | null;
  country_code?: string | null;
  theme_key?: string | null;
  locale?: string | null;
  weather_region?: string | null;
  trip_intelligence?: unknown;
  created_at: string;
  updated_at: string;
};

type SupabaseProfileRow = {
  app_settings?: unknown;
};

type SupabaseReceiptRow = {
  id: string;
  trip_id: string;
  owner_id: string;
  store: string;
  record_date: string;
  record_time: string | null;
  category: string | null;
  payment_method: string | null;
  amount: number;
  currency: string;
  home_amount: number | null;
  home_currency: string;
  original_amount: number | null;
  original_currency: string | null;
  exchange_rate: number | null;
  items_text: string | null;
  note: string | null;
  address: string | null;
  booking_ref: string | null;
  source_id: string | null;
  status: string;
  confidence: string | null;
  map_url: string | null;
  notion_page_id: string | null;
  notion_database_id: string | null;
  notion_sync_status?: string | null;
  notion_sync_error?: string | null;
  notion_last_synced_at?: string | null;
  notion_last_queued_at?: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

type SupabaseTripMemberRow = {
  trip_id: string;
  user_id: string;
  role: string;
  status: string;
  created_at?: string | null;
  updated_at?: string | null;
};

type SupabaseTripInviteRow = {
  id: string;
  trip_id: string;
  email_normalized: string;
  role: string;
  status: string;
  expires_at: string;
  created_at: string;
};

type SupabaseTripBackendLinkRow = {
  trip_id: string;
  sync_mode: string;
  status: string;
  last_health_at: string | null;
  last_error: string | null;
};

type SupabaseAccountingPersonRow = {
  trip_id: string;
  person_id: string;
  name: string;
  emoji: string | null;
  color: string | null;
  share_ratio: number | null;
  archived: boolean | null;
};

export type SupabasePullResult = {
  trips: TripProfile[];
  receipts: Receipt[];
  settings?: Partial<AppState>;
};

const rawUrl = String(import.meta.env.VITE_SUPABASE_URL || '').trim();
const rawKey = String(import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY || '').trim();

let client: SupabaseClient | null = null;

function isoFromMs(value: unknown, fallback = Date.now()): string {
  const n = Number(value) || fallback;
  return new Date(n).toISOString();
}

function msFromIso(value: unknown): number {
  const n = Date.parse(String(value || ''));
  return Number.isFinite(n) ? n : Date.now();
}

function cleanDate(value: unknown, fallback: string): string {
  const text = String(value || '').slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : fallback;
}

function cleanTime(value: unknown): string | null {
  const text = String(value || '').trim();
  if (!text) return null;
  const match = text.match(/^(\d{1,2}):(\d{2})/);
  if (!match) return null;
  return `${match[1].padStart(2, '0')}:${match[2]}:00`;
}

function cleanUuid(value: unknown): string | null {
  const text = String(value || '').trim();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(text) ? text : null;
}

function isMissingSharingTableError(error: unknown): boolean {
  const item = error as { code?: string; message?: string } | null | undefined;
  return item?.code === '42P01'
    || item?.code === 'PGRST205'
    || /schema cache|does not exist|Could not find the table/i.test(item?.message || '');
}

function cleanInviteRole(value: unknown): Exclude<TripMemberRole, 'owner' | 'admin'> {
  return value === 'viewer' ? 'viewer' : 'editor';
}

function cleanMemberRole(value: unknown): TripMemberRole {
  return value === 'owner' || value === 'admin' || value === 'viewer' ? value : 'editor';
}

function canManageSharing(role?: TripMemberRole): boolean {
  return role === 'owner' || role === 'admin';
}

function publicOrigin(): string {
  if (typeof window === 'undefined') return '';
  const { origin, pathname } = window.location;
  if (pathname.includes('/react')) {
    const match = pathname.match(/(.*\/react)/);
    if (match) {
      return `${origin}${match[1]}/`;
    }
  }
  if (pathname.startsWith('/travel-expense')) return `${origin}/travel-expense/`;
  return `${origin}/`;
}

function sourceIdForTrip(trip: TripProfile): string {
  return trip.id;
}

function sourceIdForReceipt(receipt: Receipt): string {
  return receipt.sourceId || receipt.id;
}

function isSharedLedgerTrip(trip?: TripProfile): boolean {
  return !!trip?.sharing?.isShared;
}

function ledgerSyncStatusForRow(row: SupabaseReceiptRow): Receipt['ledgerSyncStatus'] {
  if (row.notion_sync_status === 'pending' || row.notion_sync_status === 'syncing') return 'notion_pending';
  if (row.notion_sync_status === 'failed') return 'notion_failed';
  if (row.notion_sync_status === 'conflict') return 'conflict';
  if (row.status === 'draft') return 'queued';
  return 'synced';
}

function receiptSyncStatusForLedger(ledgerSyncStatus: Receipt['ledgerSyncStatus']): Receipt['syncStatus'] {
  if (ledgerSyncStatus === 'notion_pending' || ledgerSyncStatus === 'queued') return 'queued';
  if (ledgerSyncStatus === 'notion_failed' || ledgerSyncStatus === 'conflict') return 'failed';
  return 'synced';
}

function jsonObject(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function userScopedNotionDatabaseId(value: unknown): string | null {
  const db = String(value || '').trim();
  return db && db !== DEFAULT_NOTION_DB ? db : null;
}

function profileNotionDatabaseId(state: AppState): string | null {
  return userScopedNotionDatabaseId(state.notionDb)
    || (state.personalNotionConnected === true ? userScopedNotionDatabaseId(activeTrip(state).notionDb) : null);
}

function safeItinerary(value: unknown, tripId: string, fallbackCurrency: string): ItineraryDay[] {
  return Array.isArray(value) ? normalizeItinerary(value as ItineraryDay[], tripId, fallbackCurrency) : [];
}

function safePersons(value: unknown): Person[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return value.filter((person): person is Person => !!(
    person &&
    typeof person === 'object' &&
    typeof (person as Person).id === 'string' &&
    typeof (person as Person).name === 'string'
  ));
}

function optionalRecord(value: unknown): Record<string, unknown> | undefined {
  const record = jsonObject(value);
  return Object.keys(record).length ? record : undefined;
}

function buildAppSettings(state: AppState) {
  return {
    budget: state.budget,
    rate: state.rate,
    tripCurrency: state.tripCurrency,
    notionDb: profileNotionDatabaseId(state),
    autoSync: state.autoSync,
    activeTripId: state.activeTripId,
    persons: state.persons,
    shareRatios: state.shareRatios,
    itineraryOverrides: state.itineraryOverrides || {},
    statsIncludeTransportLodging: state.statsIncludeTransportLodging,
    top10IncludeBigItems: state.top10IncludeBigItems,
    scanModel: state.scanModel,
    voiceModel: state.voiceModel,
    emailModel: state.emailModel,
    tripUpdateModel: state.tripUpdateModel,
    googleBackupModel: state.googleBackupModel,
    credentialBrokerUrl: state.credentialBrokerUrl,
    personalNotionConnected: state.personalNotionConnected === true,
    notionDeletedSourceIds: state.notionDeletedSourceIds || [],
    settingsUpdatedAt: state.settingsUpdatedAt || Date.now(),
  };
}

function rowToSettings(row?: SupabaseProfileRow | null): Partial<AppState> | undefined {
  const payload = jsonObject(row?.app_settings);
  if (!Object.keys(payload).length) return undefined;
  return normalizeAiModelSettings({
    budget: typeof payload.budget === 'number' ? payload.budget : undefined,
    rate: typeof payload.rate === 'number' ? payload.rate : undefined,
    tripCurrency: typeof payload.tripCurrency === 'string' ? payload.tripCurrency : undefined,
    notionDb: typeof payload.notionDb === 'string' ? userScopedNotionDatabaseId(payload.notionDb) || undefined : undefined,
    autoSync: typeof payload.autoSync === 'boolean' ? payload.autoSync : undefined,
    activeTripId: typeof payload.activeTripId === 'string' ? payload.activeTripId : undefined,
    persons: safePersons(payload.persons),
    shareRatios: optionalRecord(payload.shareRatios) as AppState['shareRatios'] | undefined,
    itineraryOverrides: optionalRecord(payload.itineraryOverrides) as AppState['itineraryOverrides'] | undefined,
    statsIncludeTransportLodging: typeof payload.statsIncludeTransportLodging === 'boolean' ? payload.statsIncludeTransportLodging : undefined,
    top10IncludeBigItems: typeof payload.top10IncludeBigItems === 'boolean' ? payload.top10IncludeBigItems : undefined,
    scanModel: typeof payload.scanModel === 'string' ? payload.scanModel : undefined,
    voiceModel: typeof payload.voiceModel === 'string' ? payload.voiceModel : undefined,
    emailModel: typeof payload.emailModel === 'string' ? payload.emailModel : undefined,
    tripUpdateModel: typeof payload.tripUpdateModel === 'string' ? payload.tripUpdateModel : undefined,
    googleBackupModel: typeof payload.googleBackupModel === 'string' ? payload.googleBackupModel : undefined,
    credentialBrokerUrl: typeof payload.credentialBrokerUrl === 'string' ? payload.credentialBrokerUrl : undefined,
    personalNotionConnected: typeof payload.personalNotionConnected === 'boolean' ? payload.personalNotionConnected : undefined,
    notionDeletedSourceIds: Array.isArray(payload.notionDeletedSourceIds) ? payload.notionDeletedSourceIds.filter((item): item is string => typeof item === 'string') : undefined,
    settingsUpdatedAt: Number(payload.settingsUpdatedAt) || undefined,
  });
}

function sharingForTrip(
  row: SupabaseTripRow,
  userId: string,
  memberRows: SupabaseTripMemberRow[] = [],
  inviteRows: SupabaseTripInviteRow[] = [],
  backendRows: SupabaseTripBackendLinkRow[] = [],
): TripSharingState {
  const activeMembers = memberRows.filter((member) => member.trip_id === row.id && member.status === 'active');
  const ownMember = activeMembers.find((member) => member.user_id === userId);
  const isOwner = row.owner_id === userId;
  const role = isOwner ? 'owner' : cleanMemberRole(ownMember?.role);
  const pendingInvites = inviteRows.filter((invite) => invite.trip_id === row.id && invite.status === 'pending');
  const backend = backendRows.find((item) => item.trip_id === row.id);
  const memberSummaries: TripMemberSummary[] = [
    {
      userId: row.owner_id,
      role: 'owner',
      status: 'active',
      displayName: row.owner_id === userId ? 'You' : 'Trip owner',
    },
    ...activeMembers
      .filter((member) => member.user_id !== row.owner_id)
      .map((member) => ({
        userId: member.user_id,
        role: cleanMemberRole(member.role),
        status: 'active' as const,
        displayName: member.user_id === userId ? 'You' : 'Trip member',
        joinedAt: member.created_at || undefined,
        lastActiveAt: member.updated_at || undefined,
      })),
  ];
  return {
    role,
    isShared: !isOwner || memberSummaries.length > 1 || pendingInvites.length > 0,
    memberCount: memberSummaries.length,
    pendingInviteCount: pendingInvites.length,
    members: canManageSharing(role) ? memberSummaries : memberSummaries.filter((member) => member.userId === userId || member.role === 'owner'),
    invites: canManageSharing(role)
      ? pendingInvites.map((invite) => ({
        id: invite.id,
        email: invite.email_normalized,
        role: cleanInviteRole(invite.role),
        status: invite.status as TripInviteSummary['status'],
        expiresAt: invite.expires_at,
        createdAt: invite.created_at,
      }))
      : undefined,
    backendHealth: backend
      ? {
        status: backend.status === 'active' || backend.status === 'pending' || backend.status === 'error' || backend.status === 'disabled' ? backend.status : 'error',
        syncMode: backend.sync_mode === 'dual_write' ? 'dual_write' : undefined,
        lastHealthAt: backend.last_health_at || undefined,
        lastError: backend.last_error || undefined,
      }
      : { status: 'missing' },
  };
}

function rowToTrip(row: SupabaseTripRow, state: AppState, sharing?: TripSharingState): TripProfile {
  const appId = row.legacy_source_id || `supabase_${row.id}`;
  const current = (state.trips || []).find((trip) => trip.id === appId || trip.supabaseId === row.id);
  const tripCurrency = row.trip_currency || current?.currencies?.find((currency) => currency !== row.home_currency) || state.tripCurrency || 'JPY';
  const metadata = jsonObject(row.app_metadata);
  const columnIntelligence = {
    countryCode: row.country_code || undefined,
    themeKey: row.theme_key || undefined,
    locale: row.locale || undefined,
    weatherRegion: row.weather_region || undefined,
  };
  const intelligenceInput = Object.keys(jsonObject(row.trip_intelligence)).length
    ? row.trip_intelligence
    : metadata.intelligence || columnIntelligence || current?.intelligence;
  const itinerary = safeItinerary(row.itinerary, appId, tripCurrency);
  return {
    ...(current || {}),
    id: appId,
    supabaseId: row.id,
    name: row.name,
    destinationSummary: row.destination_summary || current?.destinationSummary || '未設定目的地',
    startDate: row.start_date || current?.startDate || state.tripDateRange.start,
    endDate: row.end_date || current?.endDate || state.tripDateRange.end,
    homeCurrency: row.home_currency || 'HKD',
    currencies: Array.from(new Set([row.home_currency || 'HKD', tripCurrency])),
    timezones: Array.isArray(row.timezones) && row.timezones.length ? row.timezones : current?.timezones || ['Asia/Tokyo'],
    budget: Number(row.budget_amount || current?.budget || 0),
    active: row.active,
    archived: !!row.archived,
    itinerary: itinerary.length ? itinerary : current?.itinerary || [],
    intelligence: normalizeTripIntelligence(
      intelligenceInput,
      row.destination_summary || current?.destinationSummary || '未設定目的地',
      tripCurrency,
      Array.isArray(row.timezones) ? row.timezones[0] : current?.timezones?.[0],
    ),
    version: Number(row.version || current?.version || 1),
    sourceId: typeof metadata.sourceId === 'string' ? metadata.sourceId : current?.sourceId || `trip_${appId}`,
    notionDb: userScopedNotionDatabaseId(current?.notionDb) || undefined,
    notionPageId: row.notion_page_id || current?.notionPageId,
    sharing: sharing || current?.sharing,
    createdAt: msFromIso(row.created_at),
    updatedAt: msFromIso(row.updated_at),
  };
}

function rowToReceipt(row: SupabaseReceiptRow, state: AppState, tripBySupabaseId: Map<string, TripProfile>, localId?: string, currentUserId?: string): Receipt {
  const trip = tripBySupabaseId.get(row.trip_id) || activeTrip(state);
  return rowToReceiptForTrip(row, state, trip, localId, currentUserId);
}

function rowToPulledReceipt(row: SupabaseReceiptRow, state: AppState, tripBySupabaseId: Map<string, TripProfile>, currentUserId?: string): Receipt | null {
  const trip = tripBySupabaseId.get(row.trip_id) || activeTrip(state);
  return rowToReceiptForTrip(row, state, trip, undefined, currentUserId);
}

function rowToReceiptForTrip(row: SupabaseReceiptRow, state: AppState, trip: TripProfile, localId?: string, currentUserId?: string): Receipt {
  const ledgerSyncStatus = ledgerSyncStatusForRow(row);
  return stampReceiptForTrip(state, {
    id: localId || row.id,
    supabaseId: row.id,
    ownerId: row.owner_id,
    createdByLabel: row.owner_id === currentUserId ? 'You' : 'Trip member',
    ledgerSyncStatus,
    tripId: trip.id,
    store: row.store,
    total: Number(row.amount) || 0,
    originalAmount: Number(row.original_amount ?? row.amount) || 0,
    originalCurrency: row.original_currency || row.currency || state.tripCurrency,
    currency: row.currency || state.tripCurrency,
    hkdAmount: Number(row.home_amount || 0),
    exchangeRate: Number(row.exchange_rate || 0) || undefined,
    date: row.record_date,
    time: row.record_time ? String(row.record_time).slice(0, 5) : undefined,
    category: (row.category || 'other') as CategoryId,
    payment: (row.payment_method || 'cash') as PaymentId,
    address: row.address || undefined,
    mapUrl: row.map_url || undefined,
    bookingRef: row.booking_ref || undefined,
    note: row.note || undefined,
    itemsText: row.items_text || undefined,
    source: 'supabase',
    sourceId: row.source_id || row.id,
    syncStatus: receiptSyncStatusForLedger(ledgerSyncStatus),
    createdAt: msFromIso(row.created_at),
    updatedAt: msFromIso(row.updated_at),
  }, { preserveUpdatedAt: true });
}

export function isSupabaseConfigured(): boolean {
  if (typeof window !== 'undefined' && (window as any).__disable_supabase_configured === true) {
    return false;
  }
  return /^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(rawUrl) && rawKey.length > 20;
}

export function getSupabaseClient(): SupabaseClient | null {
  if (!isSupabaseConfigured()) return null;
  client ||= createClient(rawUrl, rawKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      storageKey: 'travel-expense:supabase-auth:v1',
    },
  });
  return client;
}

export function hasSupabaseSession(session?: Session | null): session is Session {
  return !!session?.user?.id;
}

export async function currentSupabaseAccessToken(): Promise<string> {
  try {
    const raw = localStorage.getItem('travel-expense:supabase-auth:v1');
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed?.access_token) return String(parsed.access_token);
    }
  } catch {
    // Ignore
  }
  const supabase = getSupabaseClient();
  if (!supabase) return '';
  const { data, error } = await supabase.auth.getSession();
  if (!error && data.session?.access_token) {
    return data.session.access_token;
  }
  return '';
}

export async function currentSupabaseUserEmail(): Promise<string | null> {
  try {
    const raw = localStorage.getItem('travel-expense:supabase-auth:v1');
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed?.user?.email) return String(parsed.user.email);
    }
  } catch {
    // Ignore
  }
  const supabase = getSupabaseClient();
  if (!supabase) return null;
  const { data, error } = await supabase.auth.getSession();
  if (!error && data.session?.user?.email) {
    return data.session.user.email;
  }
  return null;
}

export function useSupabaseAuth() {
  const configured = isSupabaseConfigured();
  const supabase = useMemo(() => getSupabaseClient(), []);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(configured);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!supabase) {
      setLoading(false);
      return undefined;
    }
    let alive = true;
    supabase.auth.getSession().then(({ data, error: sessionError }) => {
      if (!alive) return;
      if (sessionError) setError(sessionError.message);
      setSession(data.session || null);
      setLoading(false);
    });
    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setLoading(false);
      setError('');
    });
    return () => {
      alive = false;
      data.subscription.unsubscribe();
    };
  }, [supabase]);

  const sendMagicLink = useCallback(async (email: string) => {
    if (!supabase) throw new Error('Supabase is not configured');
    const cleaned = email.trim().toLowerCase();
    const { error: signInError } = await supabase.auth.signInWithOtp({
      email: cleaned,
      options: {
        shouldCreateUser: true,
        emailRedirectTo: publicOrigin(),
      },
    });
    if (signInError) throw signInError;
  }, [supabase]);

  const signInWithPassword = useCallback(async (email: string, password: string) => {
    if (!supabase) throw new Error('Supabase is not configured');
    const cleaned = email.trim().toLowerCase();
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: cleaned,
      password,
    });
    if (signInError) throw signInError;
  }, [supabase]);

  const signUpWithPassword = useCallback(async (email: string, password: string) => {
    if (!supabase) throw new Error('Supabase is not configured');
    const cleaned = email.trim().toLowerCase();
    const { error: signUpError } = await supabase.auth.signUp({
      email: cleaned,
      password,
    });
    if (signUpError) throw signUpError;
  }, [supabase]);

  const updatePassword = useCallback(async (password: string) => {
    if (!supabase) throw new Error('Supabase is not configured');
    if (password.length < 6) throw new Error('密碼長度最少需要 6 個字元');
    const { error: updateError } = await supabase.auth.updateUser({
      password,
    });
    if (updateError) throw updateError;
  }, [supabase]);

  const signOut = useCallback(async () => {
    if (!supabase) return;
    const { error: signOutError } = await supabase.auth.signOut();
    if (signOutError) throw signOutError;
  }, [supabase]);

  const signInWithGoogle = useCallback(async () => {
    if (!supabase) throw new Error('Supabase is not configured');
    const { error: signInError } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: publicOrigin(),
      },
    });
    if (signInError) throw signInError;
  }, [supabase]);

  const deleteUserAccount = useCallback(async () => {
    if (!supabase) throw new Error('Supabase is not configured');
    const { error: rpcError } = await supabase.rpc('delete_own_user_account');
    if (rpcError) throw rpcError;
    await signOut();
  }, [supabase, signOut]);

  return {
    configured,
    loading,
    session,
    user: session?.user || null,
    error,
    sendMagicLink,
    signInWithPassword,
    signUpWithPassword,
    updatePassword,
    signInWithGoogle,
    signOut,
    deleteUserAccount,
  };
}

export async function ensureSupabaseProfile(session: Session, state: AppState): Promise<void> {
  const supabase = getSupabaseClient();
  if (!supabase) return;
  const user = session.user as User;
  const displayName = user.user_metadata?.full_name || user.user_metadata?.name || user.email?.split('@')[0] || 'Travel user';
  const { error } = await supabase.from('profiles').upsert({
    id: user.id,
    display_name: displayName,
    home_currency: 'HKD',
    locale: navigator.language || 'zh-HK',
  }, { onConflict: 'id' });
  if (error) throw error;
}

// Persist party/split data into the trip-scoped table so shared-trip members
// (who cannot read the owner's private profiles.app_settings blob) can see the
// participants and ratios. RLS restricts writes to owners/admins; we mirror
// that guard client-side and tolerate DBs that predate the table.
async function upsertSupabaseAccountingPeople(
  supabase: SupabaseClient,
  state: AppState,
  trip: TripProfile,
): Promise<void> {
  const tripUuid = cleanUuid(trip.supabaseId);
  if (!tripUuid) return;
  const role = trip.sharing?.role;
  if (role && role !== 'owner' && role !== 'admin') return;
  const persons = (state.persons || []).filter((person) => person.id);
  if (!persons.length) return;
  const nowIso = new Date().toISOString();
  const rows = persons.map((person) => ({
    trip_id: tripUuid,
    person_id: person.id,
    name: person.name || person.id,
    emoji: person.emoji || null,
    color: person.color || null,
    share_ratio: Number(state.shareRatios?.[person.id] ?? 1),
    archived: false,
    updated_at: nowIso,
  }));
  const { error } = await supabase
    .from('trip_accounting_people')
    .upsert(rows, { onConflict: 'trip_id,person_id' });
  if (error) {
    if (isMissingSharingTableError(error)) return;
    throw error;
  }
  const activeIds = persons.map((person) => JSON.stringify(person.id)).join(',');
  const { error: archiveError } = await supabase
    .from('trip_accounting_people')
    .update({ archived: true, updated_at: nowIso })
    .eq('trip_id', tripUuid)
    .eq('archived', false)
    .not('person_id', 'in', `(${activeIds})`);
  if (archiveError && !isMissingSharingTableError(archiveError)) throw archiveError;
}

export async function pushSupabaseSettings(session: Session, state: AppState): Promise<void> {
  const supabase = getSupabaseClient();
  if (!supabase) return;
  await ensureSupabaseProfile(session, state);
  const { error } = await supabase
    .from('profiles')
    .update({ app_settings: buildAppSettings(state) })
    .eq('id', session.user.id);
  if (error) throw error;
  // Mirror party/split data to the trip-scoped table for shared-trip members.
  await upsertSupabaseAccountingPeople(supabase, state, activeTrip(state)).catch((err) => {
    console.warn('[supabase] accounting people sync failed:', err instanceof Error ? err.message : String(err));
  });
}

async function findTripUuid(supabase: SupabaseClient, userId: string, trip: TripProfile): Promise<string> {
  const explicit = cleanUuid(trip.supabaseId);
  if (explicit) return explicit;
  const source = sourceIdForTrip(trip);
  const { data, error } = await supabase
    .from('trips')
    .select('id')
    .eq('owner_id', userId)
    .eq('legacy_source_id', source)
    .maybeSingle();
  if (error) throw error;
  return cleanUuid(data?.id) || crypto.randomUUID();
}

async function existingTripUuid(supabase: SupabaseClient, userId: string, trip?: TripProfile): Promise<string | null> {
  const explicit = cleanUuid(trip?.supabaseId);
  if (explicit) return explicit;
  if (!trip) return null;
  const { data, error } = await supabase
    .from('trips')
    .select('id')
    .eq('owner_id', userId)
    .eq('legacy_source_id', sourceIdForTrip(trip))
    .maybeSingle();
  if (error) throw error;
  return cleanUuid(data?.id);
}

export async function upsertSupabaseTrip(session: Session, state: AppState, trip: TripProfile): Promise<TripProfile> {
  const supabase = getSupabaseClient();
  if (!supabase) return trip;
  await ensureSupabaseProfile(session, state);
  const userId = session.user.id;
  const id = await findTripUuid(supabase, userId, trip);
  const explicitSharedTrip = !!cleanUuid(trip.supabaseId) && !!trip.sharing && trip.sharing.role !== 'owner';
  const normalizedIntelligence = normalizeTripIntelligence(
    trip.intelligence,
    trip.destinationSummary,
    trip.currencies?.find((currency) => currency !== (trip.homeCurrency || 'HKD')) || state.tripCurrency || 'JPY',
    trip.timezones?.[0],
  );
  const row = {
    id,
    owner_id: userId,
    name: trip.name || '新旅程',
    destination_summary: trip.destinationSummary || null,
    start_date: cleanDate(trip.startDate, state.tripDateRange.start),
    end_date: cleanDate(trip.endDate, state.tripDateRange.end),
    home_currency: trip.homeCurrency || 'HKD',
    trip_currency: trip.currencies?.find((currency) => currency !== (trip.homeCurrency || 'HKD')) || state.tripCurrency || 'JPY',
    timezones: trip.timezones?.length ? trip.timezones : ['Asia/Tokyo'],
    budget_amount: Number(trip.budget || 0),
    budget_currency: trip.homeCurrency || 'HKD',
    active: !!trip.active && !trip.archived,
    legacy_source_id: sourceIdForTrip(trip),
    itinerary: trip.itinerary || [],
    app_metadata: {
      sourceId: trip.sourceId || `trip_${trip.id}`,
      localTripId: trip.id,
      intelligence: normalizedIntelligence,
    },
    ...tripIntelligenceColumns(normalizedIntelligence),
    version: Math.max(1, Number(trip.version) || 1),
    archived: !!trip.archived,
    notion_page_id: null,
    notion_database_id: null,
    created_at: isoFromMs(trip.createdAt),
    updated_at: isoFromMs(trip.updatedAt),
  };
  const { owner_id: _ownerId, id: _rowId, created_at: _createdAt, ...sharedTripUpdate } = row;
  let { data, error } = explicitSharedTrip
    ? await supabase
      .from('trips')
      .update(sharedTripUpdate)
      .eq('id', id)
      .select('*')
      .single()
    : await supabase
      .from('trips')
      .upsert(row, { onConflict: 'id' })
      .select('*')
      .single();
  if (error && /country_code|theme_key|weather_region|trip_intelligence|schema cache|column/i.test(error.message || '')) {
    const {
      country_code: _countryCode,
      theme_key: _themeKey,
      locale: _locale,
      weather_region: _weatherRegion,
      trip_intelligence: _tripIntelligence,
      ...legacyRow
    } = row;
    const {
      owner_id: _legacyOwnerId,
      id: _legacyRowId,
      created_at: _legacyCreatedAt,
      ...legacySharedUpdate
    } = legacyRow;
    const fallback = explicitSharedTrip
      ? await supabase
        .from('trips')
        .update(legacySharedUpdate)
        .eq('id', id)
        .select('*')
        .single()
      : await supabase
        .from('trips')
        .upsert(legacyRow, { onConflict: 'id' })
        .select('*')
        .single();
    data = fallback.data;
    error = fallback.error;
  }
  if (error) throw error;
  if (row.active && !explicitSharedTrip) {
    const { error: deactivateError } = await supabase
      .from('trips')
      .update({ active: false, updated_at: row.updated_at })
      .eq('owner_id', userId)
      .neq('id', id)
      .eq('active', true);
    if (deactivateError) throw deactivateError;
  }
  return rowToTrip(data as SupabaseTripRow, state, trip.sharing);
}

async function findReceiptUuid(supabase: SupabaseClient, tripUuid: string, userId: string, receipt: Receipt): Promise<string> {
  const explicit = cleanUuid(receipt.supabaseId);
  if (explicit) return explicit;
  const { data, error } = await supabase
    .from('receipts')
    .select('id')
    .eq('trip_id', tripUuid)
    .eq('owner_id', userId)
    .eq('source_id', sourceIdForReceipt(receipt))
    .maybeSingle();
  if (error) throw error;
  return cleanUuid(data?.id) || crypto.randomUUID();
}

export async function upsertSupabaseReceipt(session: Session, state: AppState, receipt: Receipt): Promise<Receipt> {
  const supabase = getSupabaseClient();
  if (!supabase) return receipt;
  const trip = state.trips?.find((candidate) => candidate.id === receipt.tripId) || activeTrip(state);
  await ensureSupabaseProfile(session, state);
  const syncedTrip = cleanUuid(trip.supabaseId) && trip.sharing?.role && trip.sharing.role !== 'owner'
    ? trip
    : await upsertSupabaseTrip(session, state, trip);
  const tripUuid = cleanUuid(syncedTrip.supabaseId);
  if (!tripUuid) throw new Error('Supabase trip id missing');
  const userId = session.user.id;
  const id = await findReceiptUuid(supabase, tripUuid, userId, receipt);
  const row = {
    id,
    trip_id: tripUuid,
    owner_id: userId,
    store: receipt.store || '未命名',
    record_date: cleanDate(receipt.date, syncedTrip.startDate),
    record_time: cleanTime(receipt.time),
    category: receipt.category || 'other',
    payment_method: receipt.payment || 'cash',
    amount: Number(receipt.total || 0),
    currency: receipt.currency || receipt.originalCurrency || state.tripCurrency || 'JPY',
    home_amount: Number(receipt.hkdAmount || 0) || null,
    home_currency: 'HKD',
    original_amount: Number(receipt.originalAmount ?? receipt.total) || null,
    original_currency: receipt.originalCurrency || receipt.currency || state.tripCurrency || 'JPY',
    exchange_rate: Number(receipt.exchangeRate || 0) || null,
    items_text: receipt.itemsText || null,
    note: receipt.note || null,
    address: receipt.address || null,
    booking_ref: receipt.bookingRef || null,
    source_id: sourceIdForReceipt(receipt),
    status: receipt.syncStatus === 'failed' || receipt.syncStatus === 'error' ? 'draft' : 'confirmed',
    confidence: null,
    map_url: receipt.mapUrl || null,
    notion_page_id: null,
    notion_database_id: null,
    version: Math.max(1, Number(receipt.version) || 1),
    deleted_at: null,
    created_at: isoFromMs(receipt.createdAt),
    updated_at: isoFromMs(receipt.updatedAt),
  };
  if (isSharedLedgerTrip(syncedTrip)) {
    const { data, error } = await supabase
      .rpc('upsert_shared_trip_receipt', {
        p_trip_id: tripUuid,
        p_receipt: row,
        p_receipt_id: cleanUuid(receipt.supabaseId),
        p_source_id: row.source_id,
        p_idempotency_key: `${tripUuid}:${row.source_id}:upsert:${receipt.updatedAt || Date.now()}`,
      })
      .single();
    if (error) throw error;
    const tripBySupabaseId = new Map([[tripUuid, syncedTrip]]);
    return rowToReceipt(data as SupabaseReceiptRow, { ...state, trips: (state.trips || []).map((item) => item.id === syncedTrip.id ? syncedTrip : item) }, tripBySupabaseId, receipt.id, userId);
  }
  const { data, error } = await supabase
    .from('receipts')
    .upsert(row, { onConflict: 'id' })
    .select('*')
    .single();
  if (error) throw error;
  const tripBySupabaseId = new Map([[tripUuid, syncedTrip]]);
  return rowToReceipt(data as SupabaseReceiptRow, { ...state, trips: (state.trips || []).map((item) => item.id === syncedTrip.id ? syncedTrip : item) }, tripBySupabaseId, receipt.id, userId);
}

export async function archiveSupabaseReceipt(session: Session, state: AppState, receipt: Receipt): Promise<void> {
  const supabase = getSupabaseClient();
  if (!supabase) return;
  const trip = receipt.tripId ? state.trips?.find((candidate) => candidate.id === receipt.tripId) : undefined;
  const tripUuid = cleanUuid(trip?.supabaseId) || await existingTripUuid(supabase, session.user.id, trip);
  if (tripUuid && isSharedLedgerTrip(trip)) {
    const { error } = await supabase.rpc('delete_shared_trip_receipt', {
      p_trip_id: tripUuid,
      p_receipt_id: cleanUuid(receipt.supabaseId),
      p_source_id: sourceIdForReceipt(receipt),
      p_idempotency_key: `${tripUuid}:${sourceIdForReceipt(receipt)}:delete:${receipt.updatedAt || Date.now()}`,
    });
    if (error) throw error;
    return;
  }
  let query = supabase.from('receipts').update({ deleted_at: new Date().toISOString(), status: 'deleted' });
  const id = cleanUuid(receipt.supabaseId);
  if (id) query = query.eq('id', id).eq('owner_id', session.user.id);
  else {
    if (!tripUuid) throw new Error('Supabase trip id missing for receipt delete');
    query = query.eq('owner_id', session.user.id).eq('source_id', sourceIdForReceipt(receipt));
    query = query.eq('trip_id', tripUuid);
  }
  const { error } = await query;
  if (error) throw error;
}

export async function pullSupabaseData(session: Session, state: AppState): Promise<SupabasePullResult> {
  const supabase = getSupabaseClient();
  if (!supabase) return { trips: [], receipts: [] };
  await ensureSupabaseProfile(session, state);
  const [profileResult, tripsResult] = await Promise.all([
    supabase.from('profiles').select('app_settings').eq('id', session.user.id).maybeSingle(),
    supabase.from('trips').select('*').order('start_date', { ascending: true }),
  ]);
  if (profileResult.error) throw profileResult.error;
  if (tripsResult.error) throw tripsResult.error;
  const tripRows = (tripsResult.data || []) as SupabaseTripRow[];
  const tripIds = tripRows.map((row) => row.id).filter(Boolean);
  const emptyResult = { data: [], error: null };
  const [receiptsResult, membersResult, invitesResult, backendResult, peopleResult] = await Promise.all([
    tripIds.length
      ? supabase.from('receipts').select('*').in('trip_id', tripIds).is('deleted_at', null).order('record_date', { ascending: false })
      : Promise.resolve(emptyResult),
    tripIds.length
      ? supabase.from('trip_members').select('trip_id,user_id,role,status,created_at,updated_at').in('trip_id', tripIds)
      : Promise.resolve(emptyResult),
    tripIds.length
      ? supabase.from('trip_invites').select('id,trip_id,email_normalized,role,status,expires_at,created_at').in('trip_id', tripIds).eq('status', 'pending')
      : Promise.resolve(emptyResult),
    tripIds.length
      ? supabase.from('trip_backend_links').select('trip_id,sync_mode,status,last_health_at,last_error').in('trip_id', tripIds)
      : Promise.resolve(emptyResult),
    tripIds.length
      ? supabase.from('trip_accounting_people').select('trip_id,person_id,name,emoji,color,share_ratio,archived').in('trip_id', tripIds).eq('archived', false)
      : Promise.resolve(emptyResult),
  ]);
  if (receiptsResult.error) throw receiptsResult.error;
  if (membersResult.error && !isMissingSharingTableError(membersResult.error)) throw membersResult.error;
  if (invitesResult.error && !isMissingSharingTableError(invitesResult.error)) throw invitesResult.error;
  if (backendResult.error && !isMissingSharingTableError(backendResult.error)) throw backendResult.error;
  if (peopleResult.error && !isMissingSharingTableError(peopleResult.error)) throw peopleResult.error;
  const memberRows = (membersResult.error ? [] : membersResult.data || []) as SupabaseTripMemberRow[];
  const inviteRows = (invitesResult.error ? [] : invitesResult.data || []) as SupabaseTripInviteRow[];
  const backendRows = (backendResult.error ? [] : backendResult.data || []) as SupabaseTripBackendLinkRow[];
  const peopleRows = (peopleResult.error ? [] : peopleResult.data || []) as SupabaseAccountingPersonRow[];
  const trips = tripRows.map((row) => rowToTrip(row, state, sharingForTrip(row, session.user.id, memberRows, inviteRows, backendRows)));
  const tripBySupabaseId = new Map<string, TripProfile>();
  for (const trip of trips) {
    if (trip.supabaseId) tripBySupabaseId.set(trip.supabaseId, trip);
  }
  const receipts = (receiptsResult.data || [])
    .map((row) => rowToPulledReceipt(row as SupabaseReceiptRow, state, tripBySupabaseId, session.user.id))
    .filter((receipt): receipt is Receipt => !!receipt);
  let settings = rowToSettings(profileResult.data as SupabaseProfileRow | null);
  if (peopleRows.length) {
    const activeTripId = settings?.activeTripId || state.activeTripId;
    const activeTripUuid = trips.find((trip) => trip.id === activeTripId)?.supabaseId;
    const activePeople = activeTripUuid ? peopleRows.filter((person) => person.trip_id === activeTripUuid) : [];
    if (activePeople.length) {
      settings ||= {};
      settings.persons = activePeople.map((person) => ({
        id: person.person_id,
        name: person.name,
        emoji: person.emoji || '👤',
        color: person.color || '#1E4D6B',
      }));
      settings.shareRatios = Object.fromEntries(activePeople.map((person) => [person.person_id, Number(person.share_ratio ?? 1)]));
    }
  }
  return { trips, receipts, settings };
}

export function inviteLinkForToken(token: string): string {
  return `${publicOrigin()}#accept-invite?token=${encodeURIComponent(token)}`;
}

export async function createSupabaseTripInvite(
  session: Session,
  state: AppState,
  trip: TripProfile,
  invite: TripSharingInviteDraft,
): Promise<TripInviteSummary> {
  const supabase = getSupabaseClient();
  if (!supabase) throw new Error('Supabase is not configured');
  const syncedTrip = cleanUuid(trip.supabaseId) ? trip : await upsertSupabaseTrip(session, state, trip);
  const tripUuid = cleanUuid(syncedTrip.supabaseId);
  if (!tripUuid) throw new Error('Supabase trip id missing');
  const { data, error } = await supabase.rpc('create_trip_invite', {
    p_trip_id: tripUuid,
    p_email: invite.email,
    p_role: cleanInviteRole(invite.role),
    p_expires_days: 14,
  });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  if (!row?.invite_id || !row?.token) throw new Error('Invite token was not returned');
  return {
    id: String(row.invite_id),
    email: String(row.email_normalized || invite.email).trim().toLowerCase(),
    role: cleanInviteRole(row.role),
    status: 'pending',
    expiresAt: String(row.expires_at || ''),
    createdAt: new Date().toISOString(),
    token: String(row.token),
  };
}

export async function acceptSupabaseTripInvite(session: Session, token: string): Promise<{ tripId: string; role: TripMemberRole; status: string }> {
  const supabase = getSupabaseClient();
  if (!supabase) throw new Error('Supabase is not configured');
  if (!hasSupabaseSession(session)) throw new Error('Supabase session unavailable');
  const { data, error } = await supabase.rpc('accept_trip_invite', { p_token: token });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  if (String(row?.status || '') !== 'accepted') throw new Error(`Invite ${String(row?.status || 'not accepted')}`);
  return { tripId: String(row?.trip_id || ''), role: cleanMemberRole(row?.role), status: String(row?.status || 'accepted') };
}

export async function revokeSupabaseTripInvite(_session: Session, inviteId: string): Promise<void> {
  const supabase = getSupabaseClient();
  if (!supabase) throw new Error('Supabase is not configured');
  const { error } = await supabase.rpc('revoke_trip_invite', { p_invite_id: inviteId });
  if (error) throw error;
}

export async function updateSupabaseTripMemberRole(_session: Session, trip: TripProfile, userId: string, role: Exclude<TripMemberRole, 'owner'>): Promise<void> {
  const supabase = getSupabaseClient();
  const tripUuid = cleanUuid(trip.supabaseId);
  if (!supabase || !tripUuid) throw new Error('Supabase trip id missing');
  const { error } = await supabase.rpc('update_trip_member_role', { p_trip_id: tripUuid, p_user_id: userId, p_role: role });
  if (error) throw error;
}

export async function removeSupabaseTripMember(_session: Session, trip: TripProfile, userId: string): Promise<void> {
  const supabase = getSupabaseClient();
  const tripUuid = cleanUuid(trip.supabaseId);
  if (!supabase || !tripUuid) throw new Error('Supabase trip id missing');
  const { error } = await supabase.rpc('remove_trip_member', { p_trip_id: tripUuid, p_user_id: userId });
  if (error) throw error;
}
