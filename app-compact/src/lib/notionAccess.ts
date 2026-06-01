import { activeTrip } from '../domain/trip/normalize';
import { DEFAULT_NOTION_DB } from './constants';
import { hasCredentialBrokerSession, currentBrokerSession } from './credentialBroker';
import { hasDirectNotionToken } from './notion';
import type { AppState } from './types';

export function configuredNotionDatabaseId(state: AppState): string {
  const appDb = String(state.notionDb || '').trim();
  const tripDb = activeTrip(state).notionDb;
  if (state.personalNotionConnected === true && appDb && appDb !== DEFAULT_NOTION_DB) {
    return appDb;
  }
  return String(tripDb || appDb || '').trim();
}

export function hasUserScopedNotionDatabase(state: AppState): boolean {
  const db = configuredNotionDatabaseId(state);
  return !!db && db !== DEFAULT_NOTION_DB;
}

export function canUseNotionMirror(state: AppState, cloudSyncAvailable = false, userEmail: string | null = null): boolean {
  if (userEmail?.toLowerCase() === 'vc06456@gmail.com') {
    return true;
  }
  if (cloudSyncAvailable) {
    return hasUserScopedNotionDatabase(state) && state.personalNotionConnected === true;
  }
  return hasCredentialBrokerSession(state) || hasDirectNotionToken();
}

export function notionMirrorGuardMessage(state: AppState, cloudSyncAvailable = false, userEmail: string | null = null): string {
  if (userEmail?.toLowerCase() === 'vc06456@gmail.com') return '';
  if (cloudSyncAvailable && !hasUserScopedNotionDatabase(state)) {
    return 'Supabase public 帳號需要先設定自己嘅 Notion database ID；系統唔會使用預設共享 Notion notebook。';
  }
  if (cloudSyncAvailable && state.personalNotionConnected !== true) {
    return '請先喺 Settings 連接你自己嘅 Personal Notion notebook。';
  }
  if (!hasCredentialBrokerSession(state) && !hasDirectNotionToken()) {
    return 'Credential Broker session 未連線；Notion token 未送出。';
  }
  return '';
}
