import { useCallback, useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import { flushSync } from 'react-dom';
import { activeTrip } from '../domain/trip/normalize';
import { archiveReceipt, pullAll, pullTrips, pullSettingsMeta, pushReceipt, pushSettingsMeta, pushTripPage } from './notion';
import { canUseNotionMirror } from './notionAccess';
import { recordClientHeartbeat } from './clientHeartbeat';
import { archiveSupabaseReceipt, drainSharedTripNotionOutbox, hasSupabaseSession, pullSupabaseData, pushSupabaseSettings, uploadReceiptPhoto, upsertSupabaseReceipt, upsertSupabaseTrip } from './supabase';
import { filterSupersededTripQueue, isReceiptTombstoned, mergePulledData, rawReceiptSourceId, receiptSourceTombstoneKey } from './syncMerge';
import { MAX_RETRY_ATTEMPTS, queueItemReady, releaseReconnectBackoff, syncBackoffMs } from './syncBackoff';
import { NATIVE_REACHABILITY_ONLINE_EVENT } from './constants';
import type { AppState, Receipt, SyncEngineState, SyncQueueItem, TripProfile } from './types';
import type { Session } from '@supabase/supabase-js';

const QUEUE_MAX_AGE_MS = 14 * 86_400_000; // drop long-stuck error items after 14 days
const DEBOUNCE_MS = 3000;
const BACKGROUND_INTERVAL_MS = 120_000;
const MIN_SYNC_INTERVAL_MS = 30_000;
const RECONNECT_DEBOUNCE_MS = 100;

function redactError(error: unknown) {
  let raw = 'Sync failed';
  if (error instanceof Error) {
    raw = error.message;
  } else if (error && typeof error === 'object') {
    raw = (error as any).message || (error as any).error_description || (error as any).error || JSON.stringify(error);
  } else {
    raw = String(error || 'Sync failed');
  }
  // A malformed/expired auth token surfaces a cryptic supabase-js parse error
  // ("Expected 3 parts in JWT; got 1") — show a friendly re-login hint instead.
  if (/expected\s+\d+\s+parts\s+in\s+jwt|jwt\s*(expired|malformed|invalid)|invalid\s*jwt|jws\b/i.test(raw)) {
    return '登入憑證已失效，請重新登入後再同步';
  }
  return raw
    .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, 'Bearer [redacted]')
    .replace(/ntn_[A-Za-z0-9._-]+/g, '[redacted-notion-token]')
    .replace(/sk-[A-Za-z0-9._-]+/g, '[redacted-key]')
    .slice(0, 220);
}

// A transient network hiccup (offline, radio waking on a cold open, DNS/first-request
// flakiness, request timeout) is NOT an actionable failure — the interval + reconnect listener
// heal it within seconds. Surfacing it as the persistent red "sync error" banner is a false
// alarm; that's the "open the app after a few hours and it always shows sync error" bug — the
// first request after the phone's radio has slept just flakes once. Reserve the banner for
// genuinely actionable errors (auth expired → re-login, permission denied, real data conflicts).
export function isTransientSyncError(error: unknown): boolean {
  if (typeof navigator !== 'undefined' && !navigator.onLine) return true;
  const raw = (error instanceof Error ? error.message : String((error as any)?.message || error || '')).toLowerCase();
  return /failed to fetch|networkerror|network error|load failed|fetch failed|request timeout|timed out|timeout|connection|econn|enotfound|dns|socket|aborted|err_network|err_internet|err_connection|internet connection appears to be offline|service unavailable|\b502\b|\b503\b|\b504\b/.test(raw);
}

function queueKey(item: SyncQueueItem) {
  return `${item.type}:${item.entityId}`;
}

function dedupeQueue(queue: SyncQueueItem[]) {
  const latest = new Map<string, SyncQueueItem>();
  for (const item of queue) {
    if (item.status === 'synced') continue;
    const prev = latest.get(queueKey(item));
    // Keep the newest op but preserve earlier payload metadata (notionPageId/supabaseId/sourceId)
    // so a fresh re-enqueue doesn't drop the link info an earlier item had captured.
    latest.set(queueKey(item), prev
      ? { ...item, payload: { ...prev.payload, ...item.payload } }
      : item);
  }
  return [...latest.values()].sort((a, b) => a.createdAt - b.createdAt);
}

function pendingCount(queue: SyncQueueItem[] = []) {
  return queue.filter((item) => item.status !== 'synced' && item.status !== 'failed' && item.status !== 'error').length;
}

function usesSharedLedger(state: AppState, receipt: Receipt): boolean {
  const trip = (state.trips || []).find((candidate) => candidate.id === receipt.tripId);
  return !!trip?.sharing?.isShared;
}

export function useSyncEngine(
  state: AppState,
  setState: Dispatch<SetStateAction<AppState>>,
  supabaseSession?: Session | null,
) {
  const stateRef = useRef(state);
  const processingRef = useRef(false);
  const debounceRef = useRef<number | null>(null);
  const tripPullDebounceRef = useRef<number | null>(null);
  const hydratedTripPullRef = useRef(false);
  const lastPulledTripIdRef = useRef('');
  const lastPushSucceededRef = useRef(true);
  const syncingRef = useRef(false);
  const pullingRef = useRef(false);
  const reconnectSyncTimerRef = useRef<number | null>(null);
  const aliveRef = useRef(true);
  // Trips whose push failed with an access/RLS denial. Persisted across push/pull cycles so the
  // backfill sweep in pull() doesn't eternally re-queue receipts that will always fail.
  // Cleared for a trip when a push for that trip succeeds (e.g. after a re-invite).
  const accessDeniedTripsRef = useRef(new Set<string>());
  // Receipt IDs that have exhausted MAX_RETRY_ATTEMPTS at least once this session.
  // The backfill sweep skips these so it doesn't reset attempts to 0 and create an
  // infinite loop. Cleared for a receipt when its push eventually succeeds.
  const backfillSuspendedRef = useRef(new Set<string>());

  stateRef.current = state;
  const supabaseSessionRef = useRef<Session | null | undefined>(supabaseSession);
  supabaseSessionRef.current = supabaseSession;

  useEffect(() => {
    void recordClientHeartbeat(supabaseSession);
  }, [supabaseSession?.user?.id]);

  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
      processingRef.current = false;
      syncingRef.current = false;
      pullingRef.current = false;
      if (reconnectSyncTimerRef.current) window.clearTimeout(reconnectSyncTimerRef.current);
      if (tripPullDebounceRef.current) window.clearTimeout(tripPullDebounceRef.current);
    };
  }, []);

  const engineState = useMemo<SyncEngineState>(() => ({
    status: state.globalSyncStatus || 'idle',
    lastSyncedAt: state.lastSyncedAt || 0,
    pendingCount: pendingCount(state.syncQueue),
    error: state.syncError || undefined,
  }), [state.globalSyncStatus, state.lastSyncedAt, state.syncQueue, state.syncError]);

  const updateSyncState = useCallback((patch: {
    status: SyncEngineState['status'];
    lastSyncedAt?: number;
    error?: string;
  }) => {
    if (!aliveRef.current) return;
    setState((current) => ({
      ...current,
      globalSyncStatus: patch.status,
      lastSyncedAt: patch.lastSyncedAt !== undefined ? patch.lastSyncedAt : current.lastSyncedAt,
      syncError: patch.error !== undefined ? patch.error : current.syncError,
    }));
  }, [setState]);

  const markQueueItem = useCallback((item: SyncQueueItem, patch: Partial<SyncQueueItem>) => {
    if (!aliveRef.current) return;
    setState((current) => ({
      ...current,
      syncQueue: (current.syncQueue || []).map((queued) => queued.id === item.id ? { ...queued, ...patch, updatedAt: Date.now() } : queued),
    }));
  }, [setState]);

  const removeQueueItem = useCallback((item: SyncQueueItem) => {
    if (!aliveRef.current) return;
    setState((current) => ({
      ...current,
      syncQueue: (current.syncQueue || []).filter((queued) => queued.id !== item.id),
    }));
  }, [setState]);

  const applyReceiptSyncResult = useCallback((item: SyncQueueItem, receipt: Receipt) => {
    if (!aliveRef.current) return;
    const capturedSession = supabaseSessionRef.current;
    setState((current) => ({
      ...current,
      receipts: current.receipts.map((candidate) => {
        if (candidate.id !== receipt.id) return candidate;
        const queueUpdatedAt = Number(item.payload?.updatedAt || receipt.updatedAt || receipt.createdAt || 0);
        const currentUpdatedAt = Number(candidate.updatedAt || candidate.createdAt || Date.now());
        if (queueUpdatedAt && currentUpdatedAt > queueUpdatedAt) {
          return {
            ...candidate,
            notionPageId: receipt.notionPageId || candidate.notionPageId,
            sourceId: receipt.sourceId || candidate.sourceId,
            _photoSyncedToSupabase: candidate._photoSyncedToSupabase || receipt._photoSyncedToSupabase,
            _photoSyncAttempts: receipt._photoSyncAttempts ?? candidate._photoSyncAttempts,
            photoUrl: receipt.photoUrl || candidate.photoUrl,
            supabasePhotoPath: receipt.supabasePhotoPath || candidate.supabasePhotoPath,
            syncStatus: hasSupabaseSession(capturedSession) || canUseNotionMirror(current, false, (capturedSession as any)?.user?.email || null) ? 'queued' : 'local',
          };
        }
        const nextSyncStatus = receipt.ledgerSyncStatus === 'notion_pending' || receipt.ledgerSyncStatus === 'queued'
          ? 'queued'
          : receipt.ledgerSyncStatus === 'notion_failed' || receipt.ledgerSyncStatus === 'conflict'
            ? 'failed'
            : 'synced';
        return { ...candidate, ...receipt, _photoSyncedToSupabase: candidate._photoSyncedToSupabase || receipt._photoSyncedToSupabase, supabasePhotoPath: receipt.supabasePhotoPath || candidate.supabasePhotoPath, syncStatus: nextSyncStatus };
      }),
    }));
  }, [setState]);

  const applyTripSyncResult = useCallback((item: SyncQueueItem, trip: TripProfile) => {
    if (!aliveRef.current) return;
    setState((current) => ({
      ...current,
      trips: (current.trips || []).map((candidate) => {
        if (candidate.id !== trip.id) return candidate;
        const queueUpdatedAt = Number(item.payload?.updatedAt || trip.updatedAt || trip.createdAt || 0);
        const currentUpdatedAt = Number(candidate.updatedAt || candidate.createdAt || Date.now());
        if (queueUpdatedAt && currentUpdatedAt > queueUpdatedAt) {
          return {
            ...candidate,
            notionPageId: trip.notionPageId || candidate.notionPageId,
            sourceId: trip.sourceId || candidate.sourceId,
          };
        }
        return { ...candidate, ...trip };
      }),
    }));
  }, [setState]);

  const settlePushStatus = useCallback((failures: number, lastError?: string) => {
    if (!aliveRef.current) return;
    lastPushSucceededRef.current = failures === 0;
    updateSyncState({
      status: failures ? 'error' : (pendingCount(stateRef.current.syncQueue) ? 'queued' : 'synced'),
      lastSyncedAt: failures ? stateRef.current.lastSyncedAt || 0 : Date.now(),
      error: failures ? lastError : '',
    });
  }, [updateSyncState]);

  const yieldToStateFlush = useCallback(() => new Promise<void>((resolve) => {
    if (!aliveRef.current) {
      resolve();
      return;
    }
    const timer = window.setTimeout(() => {
      resolve();
    }, 0);
    return () => window.clearTimeout(timer);
  }), []);

  const processItem = useCallback(async (item: SyncQueueItem) => {
    const current = stateRef.current;
    const session = supabaseSessionRef.current;
    const supabaseSession = hasSupabaseSession(session) ? session : null;
    const hasNotionSync = canUseNotionMirror(current, !!supabaseSession, session?.user?.email || null);
    if (item.type === 'receipt') {
      const receipt = current.receipts.find((candidate) => candidate.id === item.entityId);
      if (!receipt) return;
      const sharedLedger = usesSharedLedger(current, receipt);
      let synced = supabaseSession
        ? await upsertSupabaseReceipt(supabaseSession, current, { ...receipt, syncStatus: 'syncing' })
        : { ...receipt, syncStatus: 'syncing' as const };
      let photoRetryNeeded = false;
      if (receipt.photoThumb && !receipt._photoSyncedToSupabase && supabaseSession) {
        try {
          const receiptUuid = synced.supabaseId || synced.id;
          const { publicUrl, storagePath } = await uploadReceiptPhoto(supabaseSession, receiptUuid, receipt.photoThumb, 'image/jpeg', receipt.supabasePhotoPath);
          synced = { ...synced, photoUrl: publicUrl, supabasePhotoPath: storagePath, _photoSyncedToSupabase: true, _photoSyncAttempts: 0 };
        } catch (photoErr) {
          // Don't swallow: track attempts and schedule a bounded retry so the photo
          // eventually uploads, without making the (already-synced) receipt look failed.
          const attempts = Number(receipt._photoSyncAttempts || 0) + 1;
          synced = { ...synced, _photoSyncedToSupabase: false, _photoSyncAttempts: attempts };
          photoRetryNeeded = attempts < MAX_RETRY_ATTEMPTS;
          console.warn(`[SyncEngine] Supabase photo upload failed (attempt ${attempts}/${MAX_RETRY_ATTEMPTS}):`, photoErr);
        }
      }
      if (hasNotionSync && !sharedLedger) {
        if (receipt.visibility === 'private') {
          if (receipt.notionPageId) await archiveReceipt(current, receipt);
          synced = { ...synced, notionPageId: undefined };
        } else {
          synced = await pushReceipt(current, { ...synced, notionPageId: receipt.notionPageId });
        }
      }
      applyReceiptSyncResult(item, synced);
      if (photoRetryNeeded && aliveRef.current) {
        // Re-enqueue a photo-only retry (dedupeQueue collapses by type:entityId, so this
        // never accumulates). Bounded by _photoSyncAttempts < MAX_RETRY_ATTEMPTS above.
        const retryReceipt = synced;
        setState((current) => ({
          ...current,
          syncQueue: [
            ...(current.syncQueue || []),
            {
              id: `sync_photo_${Date.now()}_${Math.random().toString(16).slice(2)}`,
              type: 'receipt',
              entityId: retryReceipt.id,
              op: 'update',
              status: 'queued',
              attempts: 0,
              createdAt: Date.now(),
              updatedAt: Date.now(),
              payload: {
                supabaseId: retryReceipt.supabaseId,
                sourceId: retryReceipt.sourceId,
                tripId: retryReceipt.tripId,
                version: retryReceipt.version,
                syncRevision: retryReceipt.syncRevision,
                updatedAt: retryReceipt.updatedAt,
              },
            },
          ],
        }));
      }
      return;
    }
    if (item.type === 'delete-receipt') {
      const tombstone = {
        id: item.entityId,
        store: '',
        total: 0,
        date: current.tripDateRange.start,
        category: 'other',
        payment: 'cash',
        notionPageId: item.payload?.notionPageId,
        supabaseId: item.payload?.supabaseId,
        tripId: item.payload?.tripId,
        sourceId: rawReceiptSourceId(item.payload?.sourceId || item.entityId, item.payload?.tripId),
        version: item.payload?.version,
        syncRevision: item.payload?.syncRevision,
        updatedAt: item.payload?.updatedAt || item.updatedAt || item.createdAt,
      } as Receipt;
      if (hasSupabaseSession(session)) await archiveSupabaseReceipt(session, current, tombstone);
      if (hasNotionSync && !usesSharedLedger(current, tombstone)) await archiveReceipt(current, tombstone);
      return;
    }
    if (item.type === 'trip') {
      const trip = current.trips?.find((candidate) => candidate.id === item.entityId) || activeTrip(current);
      let synced = hasSupabaseSession(session) ? await upsertSupabaseTrip(session, current, trip) : trip;
      if (hasNotionSync) synced = await pushTripPage(current, synced);
      applyTripSyncResult(item, synced);
      return;
    }
    if (item.type === 'settings') {
      if (hasSupabaseSession(session)) await pushSupabaseSettings(session, current);
      if (hasNotionSync) await pushSettingsMeta(current);
      return;
    }
    if (hasNotionSync) await pushSettingsMeta(current);
  }, [applyReceiptSyncResult, applyTripSyncResult]);

  const push = useCallback(async () => {
    console.log('[SyncEngine] push() started');
    if (processingRef.current) {
      lastPushSucceededRef.current = false;
      console.log('[SyncEngine] push() skipped — already processing');
      return;
    }
    if (!navigator.onLine) {
      lastPushSucceededRef.current = false;
      updateSyncState({ status: 'offline', error: '' });
      console.log('[SyncEngine] push() skipped — offline');
      return;
    }
    if (!hasSupabaseSession(supabaseSessionRef.current) && !canUseNotionMirror(stateRef.current, false, (supabaseSessionRef.current as any)?.user?.email || null)) {
      lastPushSucceededRef.current = false;
      updateSyncState({ status: pendingCount(stateRef.current.syncQueue) ? 'queued' : 'idle', error: '' });
      console.log('[SyncEngine] push() skipped — no broker session');
      return;
    }
    processingRef.current = true;
    updateSyncState({ status: 'pushing', error: '' });
    try {
      let failures = 0;
      let lastError = '';
      const pushStartedAt = Date.now();
      const accessDeniedTrips = accessDeniedTripsRef.current;
      const tripKeyForItem = (item: SyncQueueItem): string => String(
        (item.payload as { tripId?: string } | undefined)?.tripId
        || (item.type === 'receipt' ? stateRef.current.receipts.find((r) => r.id === item.entityId)?.tripId : '')
        || (item.type === 'trip' ? item.entityId : '')
        || '',
      );
      for (const item of dedupeQueue(stateRef.current.syncQueue || [])) {
        if (!queueItemReady(item, pushStartedAt, MAX_RETRY_ATTEMPTS)) continue;
        const tripKey = tripKeyForItem(item);
        if (tripKey && accessDeniedTrips.has(tripKey)) {
          failures += 1;
          lastError = lastError || '旅程存取權失效：請旅程擁有者重新邀請。';
          markQueueItem(item, { status: 'error', attempts: item.attempts + 1, error: lastError });
          continue;
        }
        markQueueItem(item, { status: 'syncing' });
        try {
          await processItem(item);
          removeQueueItem(item);
          // Recovery: if a trip push succeeds now (e.g. after re-invite or rehome),
          // clear the denied flag so future receipts for this trip can sync.
          const successTripKey = tripKeyForItem(item);
          if (successTripKey) accessDeniedTrips.delete(successTripKey);
          // Also clear the generic backfill suspension for this receipt.
          if (item.type === 'receipt') backfillSuspendedRef.current.delete(item.entityId);
        } catch (error) {
          lastError = redactError(error);
          const nextAttempts = item.attempts + 1;
          // Match auth failures specifically — bare "session"/"expired" substrings misclassified
          // transient network/Notion errors as auth and parked them without backoff retry.
          const lowerError = lastError.toLowerCase();
          const isAuthError = lowerError.includes('401') ||
                              lowerError.includes('unauthorized') ||
                              lowerError.includes('jwt') ||
                              lowerError.includes('invalid token') ||
                              lowerError.includes('token expired') ||
                              lastError.includes('登入憑證'); // redactError's friendly auth message
          // A concurrent editor bumped the server version (RPC raises 40001). Retrying with our now-stale
          // version is futile AND dangerous: it silently parks then gets overwritten on the next pull,
          // losing this edit without a word. Park it immediately with a VISIBLE, accurate message so the
          // user knows to re-apply after the next pull brings the other person's version.
          const isVersionConflict = lowerError.includes('40001') ||
                                    lowerError.includes('version conflict') ||
                                    lastError.includes('版本衝突');
          // Access/RLS denial (revoked shared-trip membership, upsert colliding with someone
          // else's row). Permanent for this session — retrying cannot fix it, only a fresh
          // invite can. Matches both raw Postgres wording and upsertSupabaseTrip's translation.
          // Must bypass the backoff-requeue branch below: a doomed access error has no business
          // being retried with exponential backoff, it needs to park immediately.
          const isAccessError = /row-level security|42501|permission denied|存取權/i.test(lastError);
          if (isAccessError && tripKey) accessDeniedTrips.add(tripKey);

          if (isVersionConflict) {
            failures += 1;
            markQueueItem(item, {
              status: 'error',
              attempts: nextAttempts,
              error: '有人啱啱改咗呢筆單，你嘅修改未有套用。請下拉同步後再改一次。',
            });
          } else if (isAccessError) {
            failures += 1;
            markQueueItem(item, { status: 'error', attempts: nextAttempts, error: lastError });
          } else if (isAuthError || nextAttempts >= MAX_RETRY_ATTEMPTS) {
            // Auth failures need re-login; exhausted retries park for manual "重試" (kept, not dropped).
            failures += 1;
            markQueueItem(item, { status: 'error', attempts: nextAttempts, error: lastError });
            if (isAuthError) console.log('[SyncEngine] Auth error detected mid-push, skipping item');
          } else {
            // Transient failure (flaky network / server hiccup): stay retriable with exponential
            // backoff so the receipt self-heals instead of stranding as local-only.
            markQueueItem(item, {
              status: 'queued',
              attempts: nextAttempts,
              error: lastError,
              nextRetryAt: Date.now() + syncBackoffMs(nextAttempts),
            });
          }
        }
      }
      if (aliveRef.current) {
        setState((current) => {
          const before = dedupeQueue(current.syncQueue || []);
          // Track receipt IDs that are about to be evicted for exhausting MAX_RETRY_ATTEMPTS.
          // This prevents the backfill sweep from re-queueing them with attempts=0.
          for (const item of before) {
            if (item.type === 'receipt' && item.attempts >= MAX_RETRY_ATTEMPTS) {
              backfillSuspendedRef.current.add(item.entityId);
            }
          }
          return {
            ...current,
            syncQueue: before
              // Keep parked 'error'/'failed' items so manual retry works; only age-out truly stale ones.
              .filter((item) => !((item.status === 'error' || item.status === 'failed') && (item.updatedAt || item.createdAt || 0) < Date.now() - QUEUE_MAX_AGE_MS))
              .slice(-500),
          };
        });
      }
      await yieldToStateFlush();
      console.log(`[SyncEngine] push() complete — failures: ${failures}, pending: ${pendingCount(stateRef.current.syncQueue)}`);
      settlePushStatus(failures, lastError || undefined);
    } finally {
      processingRef.current = false;
    }
  }, [markQueueItem, updateSyncState, processItem, removeQueueItem, settlePushStatus, setState, yieldToStateFlush]);

  const pull = useCallback(async () => {
    console.log('[SyncEngine] pull() started');
    // pull() is exposed to 4+ independent UI triggers plus the internal call inside sync() — without
    // this guard, e.g. the 120s background sync's pull overlapping a manual refresh tap fires two full
    // concurrent network round-trips, each computing its own overwrittenIds snapshot against a different
    // intermediate state before merging (mirrors push()'s existing processingRef guard).
    if (pullingRef.current) {
      console.log('[SyncEngine] pull() skipped — already pulling');
      return;
    }
    if (!navigator.onLine) {
      updateSyncState({ status: 'offline', error: '' });
      console.log('[SyncEngine] pull() skipped — offline');
      return;
    }
    if (!hasSupabaseSession(supabaseSessionRef.current) && !canUseNotionMirror(stateRef.current, false, (supabaseSessionRef.current as any)?.user?.email || null)) {
      updateSyncState({ status: pendingCount(stateRef.current.syncQueue) ? 'queued' : 'idle', error: '' });
      console.log('[SyncEngine] pull() skipped — no broker session');
      return;
    }
    pullingRef.current = true;
    updateSyncState({ status: 'pulling', error: '' });
    try {
      const cloudSession = hasSupabaseSession(supabaseSessionRef.current) ? supabaseSessionRef.current : null;
      const hasCloudSync = !!cloudSession;
      const hasNotionSync = canUseNotionMirror(stateRef.current, hasCloudSync, cloudSession?.user?.email || null);
      const [supabaseResult, tripsResult, receiptsResult, settingsResult] = await Promise.allSettled([
        cloudSession ? pullSupabaseData(cloudSession, stateRef.current) : Promise.resolve({ trips: [], receipts: [], tombstones: [], settings: undefined }),
        hasNotionSync ? pullTrips(stateRef.current) : Promise.resolve([]),
        hasNotionSync ? pullAll(stateRef.current) : Promise.resolve([]),
        hasNotionSync && !hasCloudSync ? pullSettingsMeta(stateRef.current) : Promise.resolve(null),
      ]);
      const supabaseData = supabaseResult.status === 'fulfilled' ? supabaseResult.value : { trips: [], receipts: [], tombstones: [] };
      const trips = [...supabaseData.trips, ...(tripsResult.status === 'fulfilled' ? tripsResult.value : [])];
      const receipts = [...supabaseData.receipts, ...(receiptsResult.status === 'fulfilled' ? receiptsResult.value : [])];
      const settingsCandidates = [
        supabaseData.settings,
        settingsResult.status === 'fulfilled' ? settingsResult.value : null,
      ].filter((candidate): candidate is Partial<AppState> => !!candidate);
      settingsCandidates.sort((a, b) => Number(a.settingsUpdatedAt || 0) - Number(b.settingsUpdatedAt || 0));
      const settings = settingsCandidates.length ? settingsCandidates[settingsCandidates.length - 1] : null;
      const pullRejections = [supabaseResult, tripsResult, receiptsResult, settingsResult]
        .filter((result): result is PromiseRejectedResult => result.status === 'rejected')
        .map((result) => result.reason);
      const pullErrors = pullRejections.map(redactError);
      // Only a non-transient rejection should paint the red banner; a network blip stays quiet
      // and self-heals on the next interval/reconnect tick.
      const hardPullError = pullRejections.some((reason) => !isTransientSyncError(reason));
      const mergedAt = Date.now();
      const overwrittenIds = new Set<string>();
      for (const remote of receipts) {
        const local = stateRef.current.receipts.find((r) => r.id === remote.id);
        if (!local) continue;
        const localUpdated = Number(local.updatedAt || local.createdAt || Date.now());
        const remoteUpdated = Number(remote.updatedAt || remote.createdAt || 0);
        const remoteHasMissingLink = (!local.notionPageId && !!remote.notionPageId) || (!local.sourceId && !!remote.sourceId);
        if (remoteUpdated > localUpdated || (remoteUpdated === localUpdated && remoteHasMissingLink)) {
          overwrittenIds.add(remote.id);
        }
      }
      const nextSyncedAt = pullErrors.length ? stateRef.current.lastSyncedAt || 0 : mergedAt;
      // Removed-member / deleted-trip purge: only when the Supabase pull SUCCEEDED, treat its
      // trip list as authoritative. A locally cached cloud-backed trip (has supabaseId) that is
      // absent from the authorized result means access was revoked or the trip was deleted — drop
      // it (and its receipts) so a removed member doesn't keep stale shared data. Never purge on a
      // failed pull or in Notion-only mode (guarded by cloudPullOk).
      const cloudPullOk = !!cloudSession && supabaseResult.status === 'fulfilled';
      const authorizedSupabaseIds = new Set(
        supabaseData.trips.map((trip) => trip.supabaseId).filter((id): id is string => !!id),
      );
      let computedPending = 0;
      if (aliveRef.current) {
        setState((current) => {
          const mergedBase = mergePulledData(current, receipts, trips, supabaseData.tombstones);
          let finalState = mergedBase;
          if (settings) {
            const remoteTs = Number(settings.settingsUpdatedAt || 0);
            const localTs = Number(current.settingsUpdatedAt || 0);
            if (remoteTs > localTs) {
              const settingsTrips = Array.isArray(settings.trips) ? settings.trips : [];
              const tripsById = new Map((finalState.trips || []).map((trip) => [trip.id, trip]));
              for (const trip of settingsTrips) {
                if (trip?.id) tripsById.set(trip.id, { ...tripsById.get(trip.id), ...trip });
              }
              const mergedTrips = (settingsTrips.length ? [...tripsById.values()] : finalState.trips) || [];
              const settingsActiveTripId = typeof settings.activeTripId === 'string' &&
                mergedTrips.some((trip) => trip.id === settings.activeTripId && !trip.archived)
                ? settings.activeTripId
                : undefined;
              const activeTripId = settingsActiveTripId ?? finalState.activeTripId;
              finalState = {
                ...finalState,
                budget: settings.budget ?? finalState.budget,
                rate: settings.rate ?? finalState.rate,
                rateMode: settings.rateMode ?? finalState.rateMode,
                // rateTable must travel with rate/rateMode: perHkdForCurrency checks rateTable[code]
                // BEFORE falling back to `rate`, so pulling a newer rate/rateMode without also pulling
                // rateTable would leave this device's stale local table entry silently winning.
                rateTable: settings.rateTable ?? finalState.rateTable,
                tripCurrency: settings.tripCurrency ?? finalState.tripCurrency,
                notionDb: settings.notionDb ?? finalState.notionDb,
                personalNotionConnected: settings.personalNotionConnected ?? finalState.personalNotionConnected,
                autoSync: settings.autoSync ?? finalState.autoSync,
                activeTripId,
                trips: mergedTrips.map((trip) => ({
                  ...trip,
                  active: trip.id === activeTripId && !trip.archived,
                  budget: trip.id === activeTripId && !trip.archived && settings.budget !== undefined ? settings.budget : trip.budget
                })),
                persons: settings.persons ?? finalState.persons,
                shareRatios: settings.shareRatios ?? finalState.shareRatios,
                itineraryOverrides: {
                  ...(finalState.itineraryOverrides || {}),
                  ...(settings.itineraryOverrides || {}),
                },
                statsIncludeTransportLodging: settings.statsIncludeTransportLodging ?? finalState.statsIncludeTransportLodging,
                top10IncludeBigItems: settings.top10IncludeBigItems ?? finalState.top10IncludeBigItems,
                scanModel: settings.scanModel ?? finalState.scanModel,
                voiceModel: settings.voiceModel ?? finalState.voiceModel,
                emailModel: settings.emailModel ?? finalState.emailModel,
                tripUpdateModel: settings.tripUpdateModel ?? finalState.tripUpdateModel,
                googleBackupModel: settings.googleBackupModel ?? finalState.googleBackupModel,
                credentialBrokerUrl: settings.credentialBrokerUrl ?? finalState.credentialBrokerUrl,
                notionDeletedSourceIds: settings.notionDeletedSourceIds ?? finalState.notionDeletedSourceIds,
                settingsUpdatedAt: remoteTs,
                settingsPulledAt: mergedAt,
              };
            }
          }
          if (cloudPullOk) {
            const purgedTripIds = new Set(
              (finalState.trips || [])
                .filter((trip) => trip.supabaseId && !authorizedSupabaseIds.has(trip.supabaseId))
                .map((trip) => trip.id),
            );
            if (purgedTripIds.size) {
              const remainingTrips = (finalState.trips || []).filter((trip) => !purgedTripIds.has(trip.id));
              const removedReceiptIds = new Set(
                (finalState.receipts || []).filter((receipt) => receipt.tripId && purgedTripIds.has(receipt.tripId)).map((receipt) => receipt.id),
              );
              const remainingReceipts = (finalState.receipts || []).filter((receipt) => !receipt.tripId || !purgedTripIds.has(receipt.tripId));
              const activeStillValid = remainingTrips.some((trip) => trip.id === finalState.activeTripId && !trip.archived);
              const nextActiveTripId = activeStillValid
                ? finalState.activeTripId
                : (remainingTrips.find((trip) => !trip.archived)?.id || remainingTrips[0]?.id || finalState.activeTripId);
              const peopleByTripId = Object.fromEntries(
                Object.entries(finalState.peopleByTripId || {}).filter(([tripId]) => !purgedTripIds.has(tripId)),
              );
              const shareRatiosByTripId = Object.fromEntries(
                Object.entries(finalState.shareRatiosByTripId || {}).filter(([tripId]) => !purgedTripIds.has(tripId)),
              );
              finalState = {
                ...finalState,
                trips: remainingTrips,
                receipts: remainingReceipts,
                activeTripId: nextActiveTripId,
                peopleByTripId,
                shareRatiosByTripId,
                persons: nextActiveTripId && peopleByTripId[nextActiveTripId] || finalState.persons,
                shareRatios: nextActiveTripId && shareRatiosByTripId[nextActiveTripId] || finalState.shareRatios,
                receiptTombstones: Object.fromEntries(
                  Object.entries(finalState.receiptTombstones || {}).filter(([, tombstone]) => !purgedTripIds.has(tombstone.tripId)),
                ),
                notionDeletedSourceIds: (finalState.notionDeletedSourceIds || []).filter(
                  (key) => ![...purgedTripIds].some((tripId) => key.startsWith(`${tripId}::`)),
                ),
                syncQueue: (finalState.syncQueue || []).filter((item) =>
                  !removedReceiptIds.has(item.entityId)
                  && !(item.type === 'trip' && purgedTripIds.has(item.entityId))
                  && !(item.payload?.tripId && purgedTripIds.has(item.payload.tripId))),
              };
              console.warn('[SyncEngine] purged revoked/deleted trips from local cache:', [...purgedTripIds]);
            }
          }
          // Server truth beats the local flag: if this pull shows no storage photo for a
          // receipt we thought was uploaded, the object was deleted server-side (storage wipe,
          // account migration). Clear the flag so the sweep re-uploads from photoThumb.
          if (cloudPullOk) {
            const serverPhotoSupabaseIds = new Set(
              supabaseData.receipts
                .filter((receipt) => receipt.supabasePhotoPath && receipt.supabaseId)
                .map((receipt) => receipt.supabaseId as string),
            );
            finalState = {
              ...finalState,
              receipts: (finalState.receipts || []).map((receipt) =>
                receipt.photoThumb && receipt._photoSyncedToSupabase && receipt.supabaseId && !serverPhotoSupabaseIds.has(receipt.supabaseId)
                  ? { ...receipt, _photoSyncedToSupabase: false, _photoSyncAttempts: 0 }
                  : receipt),
            };
          }
          const serverTombstoneKeys = new Set(supabaseData.tombstones.map((tombstone) =>
            receiptSourceTombstoneKey({ id: tombstone.supabaseId, sourceId: tombstone.sourceId, tripId: tombstone.tripId })));
          let freshQueue = filterSupersededTripQueue(
            finalState.syncQueue || [],
            current.trips || [],
            trips,
          )
            .filter((item) => !overwrittenIds.has(item.entityId))
            .filter((item) => {
              if (item.type !== 'receipt' && item.type !== 'delete-receipt') return true;
              const key = item.payload?.tombstoneKey || receiptSourceTombstoneKey({
                id: item.payload?.sourceId || item.entityId,
                sourceId: item.payload?.sourceId,
                tripId: item.payload?.tripId,
              });
              return !serverTombstoneKeys.has(key);
            });
          if (cloudPullOk && finalState.autoSync) {
            const queuedTripIds = new Set(freshQueue.filter((item) => item.type === 'trip').map((item) => item.entityId));
            const itineraryRepairs = (finalState.trips || []).filter((trip) => trip._itineraryNeedsRepair && !queuedTripIds.has(trip.id));
            if (itineraryRepairs.length) {
              const now = Date.now();
              freshQueue = [
                ...freshQueue,
                ...itineraryRepairs.map((trip, index) => ({
                  id: `sync_itinerary_repair_${now}_${index}`,
                  type: 'trip' as const,
                  entityId: trip.id,
                  op: 'update' as const,
                  status: 'queued' as const,
                  attempts: 0,
                  createdAt: now,
                  updatedAt: now,
                  payload: {
                    sourceId: trip.sourceId || `trip_${trip.id}`,
                    updatedAt: trip.updatedAt,
                    itineraryRepair: true,
                  },
                })),
              ];
            }
          }
          // Backfill sweep (ported from main v0.8.6): heal receipts that never reached
          // Supabase — created before cloud login, marked synced in the Notion-only era,
          // or whose queue item was dropped after MAX_RETRY_ATTEMPTS. After merge, anything
          // still missing supabaseId (or with an un-uploaded photo) is provably absent
          // server-side, so re-queue it. Push is idempotent (findReceiptUuid matches by
          // trip+source_id), so this never duplicates.
          // ponytail: unbounded photo re-tries are rate-limited to one attempt per pull cycle.
          if (cloudPullOk && finalState.autoSync) {
            const queuedIds = new Set(freshQueue.filter((item) => item.type === 'receipt').map((item) => item.entityId));
            // Break the backfill infinite loop: skip receipts whose trip is permanently
            // access-denied or that have exhausted MAX_RETRY_ATTEMPTS this session.
            const deniedTrips = accessDeniedTripsRef.current;
            const suspended = backfillSuspendedRef.current;
            const needsBackfill = (finalState.receipts || []).filter((receipt) =>
              !queuedIds.has(receipt.id)
              && !isReceiptTombstoned(finalState, receipt)
              && (!receipt.supabaseId || (!!receipt.photoThumb && !receipt._photoSyncedToSupabase))
              && !(receipt.tripId && deniedTrips.has(receipt.tripId))
              && !suspended.has(receipt.id));
            if (needsBackfill.length) {
              console.log(`[SyncEngine] backfill sweep: ${needsBackfill.length} receipt(s) missing from Supabase — re-queueing`);
              const now = Date.now();
              freshQueue = [
                ...freshQueue,
                ...needsBackfill.slice(0, 200).map((receipt, idx) => ({
                  id: `sync_backfill_${now}_${idx}_${Math.random().toString(16).slice(2)}`,
                  type: 'receipt' as const,
                  entityId: receipt.id,
                  op: 'update' as const,
                  status: 'queued' as const,
                  attempts: 0,
                  createdAt: now,
                  updatedAt: now,
                  payload: {
                    supabaseId: receipt.supabaseId,
                    notionPageId: receipt.notionPageId,
                    sourceId: receipt.sourceId || receipt.id,
                    tripId: receipt.tripId,
                    version: receipt.version,
                    syncRevision: receipt.syncRevision,
                    updatedAt: receipt.updatedAt,
                  },
                })),
              ];
            }
          }
          computedPending = pendingCount(freshQueue);
          return {
            ...finalState,
            syncQueue: freshQueue,
            // Transient-only pull failures don't earn the red banner: stay 'queued'/'idle' and let
            // the retry loop heal it. lastSyncedAt already isn't advanced on any error (nextSyncedAt).
            globalSyncStatus: hardPullError ? 'error' : (computedPending ? 'queued' : (pullErrors.length ? 'idle' : 'synced')),
            lastSyncedAt: nextSyncedAt,
            syncError: hardPullError ? pullErrors.join(' | ') : '',
          };
        });
      }
      console.log(`[SyncEngine] pull() complete — trips: ${trips.length}, receipts: ${receipts.length}, settings: ${settings ? 'yes' : 'no'}, errors: ${pullErrors.length}`);
    } catch (error) {
      const message = redactError(error);
      console.log('[SyncEngine] pull() error:', message);
      // Same rule as the partial-failure path: a transient network error must not paint the
      // persistent red banner on a cold boot — keep it soft and let the retry loop heal it.
      if (isTransientSyncError(error)) {
        updateSyncState({ status: pendingCount(stateRef.current.syncQueue) ? 'queued' : 'idle', error: '' });
      } else {
        updateSyncState({ status: 'error', error: message });
      }
    } finally {
      pullingRef.current = false;
    }
  }, [updateSyncState, setState]);

  const pushSettings = useCallback(async () => {
    const current = stateRef.current;
    const session = supabaseSessionRef.current;
    const hasNotionSync = canUseNotionMirror(current, hasSupabaseSession(session), session?.user?.email || null);
    if (!navigator.onLine) {
      updateSyncState({ status: 'offline', error: '' });
      return;
    }
    if (!hasSupabaseSession(session) && !hasNotionSync) {
      updateSyncState({ status: pendingCount(current.syncQueue) ? 'queued' : 'idle', error: '' });
      return;
    }
    updateSyncState({ status: 'pushing', error: '' });
    try {
      if (hasSupabaseSession(session)) await pushSupabaseSettings(session, current);
      if (hasNotionSync) await pushSettingsMeta(current);
      updateSyncState({ status: pendingCount(stateRef.current.syncQueue) ? 'queued' : 'synced', lastSyncedAt: Date.now(), error: '' });
    } catch (error) {
      updateSyncState({ status: 'error', error: redactError(error) });
      throw error;
    }
  }, [updateSyncState]);

  const sync = useCallback(async () => {
    if (syncingRef.current) {
      console.log('[SyncEngine] sync() skipped — already syncing');
      return;
    }
    syncingRef.current = true;
    console.log('[SyncEngine] sync() started');
    try {
      await push();
      await yieldToStateFlush();
      if (!navigator.onLine) {
        console.log('[SyncEngine] Offline — skipping pull');
        return;
      }
      if (!hasSupabaseSession(supabaseSessionRef.current) && !canUseNotionMirror(stateRef.current, false, (supabaseSessionRef.current as any)?.user?.email || null)) {
        console.log('[SyncEngine] No cloud session — skipping pull');
        return;
      }
      console.log('[SyncEngine] Running pull()...');
      await pull();
      // Owner/admin drains the shared-trip Notion outbox (receipt_sync_jobs) when online with
      // Notion connected. Fire-and-forget + never throws, so it can't block or fail the sync.
      const cloudSession = hasSupabaseSession(supabaseSessionRef.current) ? supabaseSessionRef.current : null;
      if (cloudSession && canUseNotionMirror(stateRef.current, true, cloudSession.user?.email || null)) {
        await yieldToStateFlush();
        const outbox = await drainSharedTripNotionOutbox(cloudSession, stateRef.current, pushReceipt, archiveReceipt).catch(() => null);
        if (outbox && (outbox.processed || outbox.failed)) {
          console.log(`[SyncEngine] Notion outbox drained: ${outbox.processed} ok, ${outbox.failed} failed`);
        }
      }
    } finally {
      syncingRef.current = false;
    }
  }, [pull, push, yieldToStateFlush]);

  const retryFailedItems = useCallback(() => {
    if (!aliveRef.current) return;
    setState((current) => ({
      ...current,
      syncQueue: (current.syncQueue || []).map((item) =>
        item.status === 'failed' || item.status === 'error'
          ? { ...item, status: 'queued', attempts: 0, error: undefined, nextRetryAt: undefined }
          : item
      ),
    }));
    setTimeout(() => {
      void push();
    }, 100);
  }, [setState, push]);

  useEffect(() => {
    if (!aliveRef.current || !state.activeTripId) return;
    if (!hydratedTripPullRef.current) {
      hydratedTripPullRef.current = true;
      lastPulledTripIdRef.current = state.activeTripId;
      return;
    }
    if (lastPulledTripIdRef.current === state.activeTripId) return;
    lastPulledTripIdRef.current = state.activeTripId;
    if (!navigator.onLine || (!hasSupabaseSession(supabaseSessionRef.current) && !canUseNotionMirror(state, false, (supabaseSessionRef.current as any)?.user?.email || null))) return;
    if (tripPullDebounceRef.current) window.clearTimeout(tripPullDebounceRef.current);
    tripPullDebounceRef.current = window.setTimeout(() => {
      tripPullDebounceRef.current = null;
      if (!aliveRef.current) return;
      console.log('[SyncEngine] activeTripId changed, triggering debounced pull sync...');
      void pull();
    }, 700);
    return () => {
      if (tripPullDebounceRef.current) window.clearTimeout(tripPullDebounceRef.current);
    };
  }, [state.activeTripId, state.credentialSession, state.credentialSessionExpiresAt, pull, supabaseSession]);

  useEffect(() => {
    if (!state.autoSync || !pendingCount(state.syncQueue) || (!hasSupabaseSession(supabaseSession) && !canUseNotionMirror(state, false, (supabaseSession as any)?.user?.email || null))) return;
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(() => void push(), DEBOUNCE_MS);
    return () => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
    };
  }, [push, state.autoSync, state.credentialSession, state.credentialSessionExpiresAt, state.syncQueue, supabaseSession]);

  // Backoff wake-up: when an item is waiting on its backoff window, schedule a push at the soonest
  // nextRetryAt so a 30s/2m retry self-heals promptly instead of waiting for the 120s interval.
  useEffect(() => {
    if (!state.autoSync) return;
    const now = Date.now();
    const soonest = (state.syncQueue || []).reduce((min, item) => (
      item.nextRetryAt && item.nextRetryAt > now && item.attempts < MAX_RETRY_ATTEMPTS
        && item.status !== 'error' && item.status !== 'failed'
        ? Math.min(min, item.nextRetryAt)
        : min
    ), Infinity);
    if (!Number.isFinite(soonest)) return;
    const delay = Math.min(Math.max(soonest - now, 0), BACKGROUND_INTERVAL_MS);
    const timer = window.setTimeout(() => { void push(); }, delay);
    return () => window.clearTimeout(timer);
  }, [push, state.autoSync, state.syncQueue]);

  useEffect(() => {
    const scheduleReconnectSync = () => {
      if (reconnectSyncTimerRef.current) window.clearTimeout(reconnectSyncTimerRef.current);
      reconnectSyncTimerRef.current = window.setTimeout(() => {
        reconnectSyncTimerRef.current = null;
        if (stateRef.current.autoSync) void sync();
      }, RECONNECT_DEBOUNCE_MS);
    };
    const onReconnect = () => {
      if (!stateRef.current.autoSync) return;
      flushSync(() => {
        setState((current) => {
          const currentQueue = current.syncQueue || [];
          const nextQueue = releaseReconnectBackoff(currentQueue);
          if (nextQueue === currentQueue) return current;
          const nextPendingCount = pendingCount(nextQueue);
          return {
            ...current,
            syncQueue: nextQueue,
            globalSyncStatus: nextPendingCount ? 'queued' : current.globalSyncStatus,
            syncError: nextPendingCount ? '' : current.syncError,
          };
        });
      });
      scheduleReconnectSync();
    };
    const onVisibility = () => {
      if (!document.hidden && stateRef.current.autoSync && Date.now() - (stateRef.current.lastSyncedAt || 0) >= MIN_SYNC_INTERVAL_MS) void sync();
    };
    const timer = window.setInterval(() => {
      if (stateRef.current.autoSync && Date.now() - (stateRef.current.lastSyncedAt || 0) >= MIN_SYNC_INTERVAL_MS) void sync();
    }, BACKGROUND_INTERVAL_MS);
    window.addEventListener('online', onReconnect);
    window.addEventListener(NATIVE_REACHABILITY_ONLINE_EVENT, onReconnect);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.clearInterval(timer);
      if (reconnectSyncTimerRef.current) window.clearTimeout(reconnectSyncTimerRef.current);
      window.removeEventListener('online', onReconnect);
      window.removeEventListener(NATIVE_REACHABILITY_ONLINE_EVENT, onReconnect);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [sync]);

  return useMemo(() => ({ engineState, pull, push, pushSettings, sync, retryFailedItems }), [engineState, pull, push, pushSettings, sync, retryFailedItems]);
}
