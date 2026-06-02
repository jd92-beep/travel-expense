import { useCallback, useEffect, useMemo, useState } from 'react';
import { createClient, type Session, type SupabaseClient, type User } from '@supabase/supabase-js';
import { activeTrip, normalizeItinerary, normalizeTripIntelligence, stampReceiptForTrip } from '../domain/trip/normalize';
import { tripIntelligenceColumns } from '../domain/trip/context';
import { DEFAULT_NOTION_DB, normalizeAiModelSettings } from './constants';
import type { AppState, CategoryId, ItineraryDay, PaymentId, Person, Receipt, TripProfile } from './types';

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
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
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

function publicOrigin(): string {
  if (typeof window === 'undefined') return '';
  const { origin, pathname } = window.location;
  if (pathname.startsWith('/travel-expense/compact')) return `${origin}/travel-expense/compact/`;
  return `${origin}/`;
}

function sourceIdForTrip(trip: TripProfile): string {
  return trip.id;
}

function sourceIdForReceipt(receipt: Receipt): string {
  return receipt.sourceId || receipt.id;
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

function rowToTrip(row: SupabaseTripRow, state: AppState): TripProfile {
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
    createdAt: msFromIso(row.created_at),
    updatedAt: msFromIso(row.updated_at),
  };
}

function rowToReceipt(row: SupabaseReceiptRow, state: AppState, tripBySupabaseId: Map<string, TripProfile>, localId?: string): Receipt {
  const trip = tripBySupabaseId.get(row.trip_id) || activeTrip(state);
  return rowToReceiptForTrip(row, state, trip, localId);
}

function rowToPulledReceipt(row: SupabaseReceiptRow, state: AppState, tripBySupabaseId: Map<string, TripProfile>): Receipt | null {
  const trip = tripBySupabaseId.get(row.trip_id) || activeTrip(state);
  return rowToReceiptForTrip(row, state, trip);
}

function rowToReceiptForTrip(row: SupabaseReceiptRow, state: AppState, trip: TripProfile, localId?: string): Receipt {
  return stampReceiptForTrip(state, {
    id: localId || row.id,
    supabaseId: row.id,
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
    syncStatus: 'synced',
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
    signOut,
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

export async function pushSupabaseSettings(session: Session, state: AppState): Promise<void> {
  const supabase = getSupabaseClient();
  if (!supabase) return;
  await ensureSupabaseProfile(session, state);
  const { error } = await supabase
    .from('profiles')
    .update({ app_settings: buildAppSettings(state) })
    .eq('id', session.user.id);
  if (error) throw error;
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
  let { data, error } = await supabase
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
    const fallback = await supabase
      .from('trips')
      .upsert(legacyRow, { onConflict: 'id' })
      .select('*')
      .single();
    data = fallback.data;
    error = fallback.error;
  }
  if (error) throw error;
  if (row.active) {
    const { error: deactivateError } = await supabase
      .from('trips')
      .update({ active: false, updated_at: row.updated_at })
      .eq('owner_id', userId)
      .neq('id', id)
      .eq('active', true);
    if (deactivateError) throw deactivateError;
  }
  return rowToTrip(data as SupabaseTripRow, state);
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
  const syncedTrip = await upsertSupabaseTrip(session, state, trip);
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
    deleted_at: null,
    created_at: isoFromMs(receipt.createdAt),
    updated_at: isoFromMs(receipt.updatedAt),
  };
  const { data, error } = await supabase
    .from('receipts')
    .upsert(row, { onConflict: 'id' })
    .select('*')
    .single();
  if (error) throw error;
  const tripBySupabaseId = new Map([[tripUuid, syncedTrip]]);
  return rowToReceipt(data as SupabaseReceiptRow, { ...state, trips: (state.trips || []).map((item) => item.id === syncedTrip.id ? syncedTrip : item) }, tripBySupabaseId, receipt.id);
}

export async function archiveSupabaseReceipt(session: Session, state: AppState, receipt: Receipt): Promise<void> {
  const supabase = getSupabaseClient();
  if (!supabase) return;
  let query = supabase.from('receipts').update({ deleted_at: new Date().toISOString(), status: 'deleted' });
  const id = cleanUuid(receipt.supabaseId);
  if (id) query = query.eq('id', id).eq('owner_id', session.user.id);
  else {
    const trip = receipt.tripId ? state.trips?.find((candidate) => candidate.id === receipt.tripId) : undefined;
    const tripUuid = await existingTripUuid(supabase, session.user.id, trip);
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
  const [profileResult, tripsResult, receiptsResult] = await Promise.all([
    supabase.from('profiles').select('app_settings').eq('id', session.user.id).maybeSingle(),
    supabase.from('trips').select('*').eq('owner_id', session.user.id).order('start_date', { ascending: true }),
    supabase.from('receipts').select('*').eq('owner_id', session.user.id).is('deleted_at', null).order('record_date', { ascending: false }),
  ]);
  if (profileResult.error) throw profileResult.error;
  if (tripsResult.error) throw tripsResult.error;
  if (receiptsResult.error) throw receiptsResult.error;
  const trips = (tripsResult.data || []).map((row) => rowToTrip(row as SupabaseTripRow, state));
  const tripBySupabaseId = new Map<string, TripProfile>();
  for (const trip of trips) {
    if (trip.supabaseId) tripBySupabaseId.set(trip.supabaseId, trip);
  }
  const receipts = (receiptsResult.data || [])
    .map((row) => rowToPulledReceipt(row as SupabaseReceiptRow, state, tripBySupabaseId))
    .filter((receipt): receipt is Receipt => !!receipt);
  return { trips, receipts, settings: rowToSettings(profileResult.data as SupabaseProfileRow | null) };
}
