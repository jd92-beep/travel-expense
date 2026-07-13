import type { Session } from '@supabase/supabase-js';
import { APP_SCHEMA_VERSION, APP_VERSION } from './constants';
import { getSupabaseClient } from './supabase';

export const CLIENT_CONTRACT_VERSION = 4;

const INSTALLATION_KEY = 'travel-expense:installation:v1';
const HEARTBEAT_INTERVAL_MS = 6 * 60 * 60 * 1000;

function appSurface(): 'android' | 'compact' {
  if (typeof window === 'undefined') return 'compact';
  const capacitor = (window as Window & {
    Capacitor?: { getPlatform?: () => string; isNativePlatform?: () => boolean };
  }).Capacitor;
  if (capacitor?.getPlatform?.() === 'android') return 'android';
  return capacitor?.isNativePlatform?.() && /android/i.test(navigator.userAgent || '')
    ? 'android'
    : 'compact';
}

function installationId(): string {
  try {
    const existing = localStorage.getItem(INSTALLATION_KEY);
    if (existing && /^[a-zA-Z0-9_-]{20,100}$/.test(existing)) return existing;
    const next = crypto.randomUUID().replace(/-/g, '');
    localStorage.setItem(INSTALLATION_KEY, next);
    return next;
  } catch {
    return crypto.randomUUID().replace(/-/g, '');
  }
}

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function recordClientHeartbeat(session: Session | null | undefined): Promise<void> {
  if (!session?.user?.id || typeof window === 'undefined' || !crypto?.subtle) return;
  const surface = appSurface();
  const sentKey = `travel-expense:heartbeat:${session.user.id}:${surface}:v${CLIENT_CONTRACT_VERSION}`;
  try {
    const lastSent = Number(localStorage.getItem(sentKey) || 0);
    if (Date.now() - lastSent < HEARTBEAT_INTERVAL_MS) return;

    const supabase = getSupabaseClient();
    if (!supabase) return;
    const sessionIdHash = await sha256(`${session.user.id}:${installationId()}`);
    const { error } = await supabase.from('app_usage_events').insert({
      user_id: session.user.id,
      session_id_hash: sessionIdHash,
      app_surface: surface,
      event_name: 'heartbeat',
      outcome: 'success',
      metadata: {
        contractVersion: CLIENT_CONTRACT_VERSION,
        schemaVersion: APP_SCHEMA_VERSION,
        capabilities: ['itinerary-v4'],
      },
      app_build: APP_VERSION,
      user_agent: navigator.userAgent.slice(0, 160),
    });
    if (!error) localStorage.setItem(sentKey, String(Date.now()));
  } catch {
    // Advisory telemetry must never block login, sync, or offline use.
  }
}
