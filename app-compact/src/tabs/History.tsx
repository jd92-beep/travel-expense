import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { AlertTriangle, CalendarDays, Camera, ChevronDown, ChevronRight, Mail, RefreshCw, Search, SlidersHorizontal } from 'lucide-react';
import { Reveal, Toast } from '../components/ui';
import { activeTrip, scopedReceiptsForTrip } from '../domain/trip/normalize';
import { hasCredentialBrokerSession } from '../lib/credentialBroker';
import { hasDirectNotionToken } from '../lib/notion';
import { CATEGORIES } from '../lib/constants';
import { takeReceiptRepairIntent } from '../lib/repairIntent';
import type { AppState, CategoryId, Receipt, SyncQueueItem, TripProfile } from '../lib/types';
import { ReceiptPhotoModal } from '../components/ReceiptPhotoModal';
import { VisualIcon } from '../components/VisualIcon';
import { categoryById, displayStore, fmt, getPersons, hkd, isPendingReceipt, safePhotoUrl, getReceiptHkdAmount, getReceiptTripAmount, getResolvedTripCurrency } from '../lib/domain';

type ReceiptHealthMarker = {
  key: string;
  label: string;
  tone: 'warning' | 'danger' | 'info' | 'ok' | 'neutral';
};

type ReceiptCleanupSuggestion = {
  key: 'pending' | 'duplicate' | 'photo-missing' | 'missing-payer';
  title: string;
  count: number;
  detail: string;
  actionLabel: string;
  receipt: Receipt;
  tone: 'warning' | 'danger';
};

type ReceiptAttachmentSuggestion = {
  key: 'photo-large' | 'photo-missing' | 'photo-unsynced';
  title: string;
  count: number;
  detail: string;
  actionLabel: string;
  receipt: Receipt;
  tone: 'warning' | 'danger' | 'info';
};

type ReceiptConflictItem = {
  receipt: Receipt;
  queueItem?: SyncQueueItem;
  status: string;
  detail: string;
};

const LARGE_PHOTO_BYTES = 600_000;

function historyDateLabel(date: string): string {
  const parsed = new Date(`${date}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return date;
  const weekday = ['日', '一', '二', '三', '四', '五', '六'][parsed.getDay()];
  return `${parsed.getFullYear()}年${parsed.getMonth() + 1}月${parsed.getDate()}日（${weekday}）`;
}

function isReceiptPhotoExpected(receipt: Receipt): boolean {
  const source = String(receipt.source || '');
  return source === 'react-ocr'
    || source === 'react-ocr-manual'
    || source === 'react-email-image'
    || /OCR|截圖|掃描/i.test(String(receipt.note || ''));
}

function estimatePhotoBytes(value: unknown): number {
  const raw = String(value || '').trim().replace(/[\r\n\s]/g, '');
  if (!raw || /^https?:\/\//i.test(raw)) return 0;
  const base64 = raw.includes(',') ? raw.split(',').pop() || '' : raw;
  if (!/^[a-z0-9+/=]+$/i.test(base64)) return 0;
  const padding = (base64.match(/=+$/)?.[0].length || 0);
  return Math.max(0, Math.floor(base64.length * 3 / 4) - padding);
}

function receiptPhotoBytes(receipt: Receipt): number {
  return Math.max(estimatePhotoBytes(receipt.photoThumb), estimatePhotoBytes(receipt.photoUrl));
}

function receiptHasLargePhoto(receipt: Receipt): boolean {
  return receiptPhotoBytes(receipt) > LARGE_PHOTO_BYTES;
}

function receiptHasLocalPhoto(receipt: Receipt): boolean {
  return estimatePhotoBytes(receipt.photoThumb) > 0 || (!!receipt.photoUrl && !/^https?:\/\//i.test(String(receipt.photoUrl)));
}

function receiptPhotoNeedsSync(receipt: Receipt): boolean {
  if (!receiptHasLocalPhoto(receipt)) return false;
  if (receipt._photoSyncedToNotion || receipt.notionFileUploadId || /^https?:\/\//i.test(String(receipt.photoUrl || ''))) return false;
  return receipt.syncStatus !== 'synced' || !receipt.photoUrl;
}

function receiptHasSyncConflict(receipt: Receipt, state: AppState): boolean {
  if (receipt.syncStatus === 'error' || receipt.syncStatus === 'failed') return true;
  return (state.syncQueue || []).some((item) => isFailedQueueItem(item) && queueItemMatchesReceipt(item, receipt));
}

function isFailedQueueItem(item: SyncQueueItem): boolean {
  return item.status === 'error' || item.status === 'failed';
}

function queueItemMatchesReceipt(item: SyncQueueItem, receipt: Receipt): boolean {
  return item.entityId === receipt.id
    || (!!receipt.sourceId && item.payload?.sourceId === receipt.sourceId)
    || (!!receipt.supabaseId && item.payload?.supabaseId === receipt.supabaseId)
    || (!!receipt.notionPageId && item.payload?.notionPageId === receipt.notionPageId);
}

function findReceiptConflictQueueItem(receipt: Receipt, state: AppState): SyncQueueItem | undefined {
  return (state.syncQueue || []).find((item) => item.type === 'receipt' && isFailedQueueItem(item) && queueItemMatchesReceipt(item, receipt));
}

function buildSafeReceiptPayload(receipt: Receipt, updatedAt: number): SyncQueueItem['payload'] {
  return {
    tripId: receipt.tripId,
    sourceId: receipt.sourceId,
    supabaseId: receipt.supabaseId,
    notionPageId: receipt.notionPageId,
    updatedAt,
  };
}

function buildReceiptConflictItems(receipts: Receipt[], state: AppState): ReceiptConflictItem[] {
  const items: Array<ReceiptConflictItem | null> = receipts
    .map((receipt) => {
      const queueItem = findReceiptConflictQueueItem(receipt, state);
      if (!queueItem && receipt.syncStatus !== 'error' && receipt.syncStatus !== 'failed') return null;
      const status = String(queueItem?.status || receipt.syncStatus || 'failed');
      const operation = queueItem?.op ? `${queueItem.op} receipt` : 'receipt update';
      return {
        receipt,
        queueItem,
        status,
        detail: `${operation} needs review before the next push.`,
      };
    });
  return items.filter((item): item is ReceiptConflictItem => !!item);
}

function receiptHealthMarkers(
  receipt: Receipt,
  state: AppState,
  sourceIdCounts: Record<string, number>,
  photoSrc?: string,
): ReceiptHealthMarker[] {
  const markers: ReceiptHealthMarker[] = [];
  if (isPendingReceipt(receipt)) markers.push({ key: 'pending', label: 'pending', tone: 'warning' });
  if (receipt.sourceId && sourceIdCounts[receipt.sourceId] > 1) markers.push({ key: 'duplicate', label: 'duplicate', tone: 'danger' });
  if (isReceiptPhotoExpected(receipt) && !photoSrc) markers.push({ key: 'photo-missing', label: 'photo missing', tone: 'warning' });
  if (receiptHasLargePhoto(receipt)) markers.push({ key: 'photo-large', label: 'photo large', tone: 'warning' });
  if (receiptPhotoNeedsSync(receipt)) markers.push({ key: 'photo-unsynced', label: 'photo unsynced', tone: 'info' });
  if (receiptHasSyncConflict(receipt, state)) markers.push({ key: 'sync-conflict', label: 'sync conflict', tone: 'danger' });
  if ((receipt.supabaseId || receipt.notionPageId) && !receipt.sourceId) markers.push({ key: 'cloud-only', label: 'cloud-only', tone: 'info' });
  if (!receipt.supabaseId && !receipt.notionPageId) markers.push({ key: 'local-only', label: 'local-only', tone: 'neutral' });
  return markers;
}

function buildReceiptAttachmentSuggestions(receipts: Receipt[]): ReceiptAttachmentSuggestion[] {
  const largePhotos = receipts.filter(receiptHasLargePhoto);
  const missingPhotos = receipts.filter((receipt) => isReceiptPhotoExpected(receipt) && !safePhotoUrl(receipt.photoUrl, receipt.photoThumb));
  const unsyncedPhotos = receipts.filter(receiptPhotoNeedsSync);
  const suggestions: Array<ReceiptAttachmentSuggestion | null> = [
    largePhotos.length ? {
      key: 'photo-large',
      title: 'Large photo',
      count: largePhotos.length,
      detail: 'Replace this image to auto-compress before travel sync.',
      actionLabel: 'Compress guide',
      receipt: largePhotos[0],
      tone: 'warning' as const,
    } : null,
    missingPhotos.length ? {
      key: 'photo-missing',
      title: 'Missing photo',
      count: missingPhotos.length,
      detail: 'OCR/import expected an attachment but no image is stored.',
      actionLabel: 'Add photo',
      receipt: missingPhotos[0],
      tone: 'danger' as const,
    } : null,
    unsyncedPhotos.length ? {
      key: 'photo-unsynced',
      title: 'Unsynced photo',
      count: unsyncedPhotos.length,
      detail: 'Local image is not yet backed by a cloud-safe attachment.',
      actionLabel: 'Review sync',
      receipt: unsyncedPhotos[0],
      tone: 'info' as const,
    } : null,
  ];
  return suggestions.filter((item): item is ReceiptAttachmentSuggestion => !!item);
}

function buildReceiptCleanupSuggestions(
  receipts: Receipt[],
  state: AppState,
  sourceIdCounts: Record<string, number>,
  validPersonIds: Set<string>,
): ReceiptCleanupSuggestion[] {
  const pending = receipts.filter(isPendingReceipt);
  const duplicates = receipts.filter((receipt) => !!receipt.sourceId && sourceIdCounts[receipt.sourceId] > 1);
  const missingPhotos = receipts.filter((receipt) => isReceiptPhotoExpected(receipt) && !safePhotoUrl(receipt.photoUrl, receipt.photoThumb));
  const missingPayers = receipts.filter((receipt) => !receipt.personId || !validPersonIds.has(receipt.personId));
  const suggestions: Array<ReceiptCleanupSuggestion | null> = [
    pending.length ? {
      key: 'pending',
      title: 'Pending OCR',
      count: pending.length,
      detail: 'Confirm email/OCR draft before it becomes final spending.',
      actionLabel: 'Confirm pending OCR',
      receipt: pending[0],
      tone: 'warning' as const,
    } : null,
    duplicates.length ? {
      key: 'duplicate',
      title: 'Duplicate SourceID',
      count: duplicates.length,
      detail: 'Same import source appears more than once.',
      actionLabel: 'Open duplicate',
      receipt: duplicates[0],
      tone: 'danger' as const,
    } : null,
    missingPhotos.length ? {
      key: 'photo-missing',
      title: 'Missing photo',
      count: missingPhotos.length,
      detail: 'OCR/imported receipt expected a photo but none is stored.',
      actionLabel: 'Open missing photo',
      receipt: missingPhotos[0],
      tone: 'warning' as const,
    } : null,
    missingPayers.length ? {
      key: 'missing-payer',
      title: 'Missing payer',
      count: missingPayers.length,
      detail: 'Receipt needs a traveller before split totals are trustworthy.',
      actionLabel: 'Open missing payer',
      receipt: missingPayers[0],
      tone: 'danger' as const,
    } : null,
  ];
  return suggestions.filter((item): item is ReceiptCleanupSuggestion => !!item);
}

export function History({
  state,
  setState,
  onImport,
  onHydrate,
  onOpen,
  onConfirmPending,
  onPull,
  cloudSyncAvailable = false,
}: {
  state: AppState;
  setState?: React.Dispatch<React.SetStateAction<AppState>>;
  onImport: (receipts: Receipt[]) => void;
  onHydrate?: (receipts: Receipt[], trips: TripProfile[]) => void;
  onOpen: (receipt: Receipt) => void;
  onConfirmPending: (receipt: Receipt) => void;
  onPull?: () => Promise<void>;
  cloudSyncAvailable?: boolean;
}) {
  const [isMobile, setIsMobile] = useState(() => typeof window !== 'undefined' && window.innerWidth <= 768);
  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth <= 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<'all' | CategoryId>('all');
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const [viewPhoto, setViewPhoto] = useState<Receipt | null>(null);


  const trip = activeTrip(state);
  const resolvedTripCurrency = getResolvedTripCurrency(state, trip);
  const tripReceipts = useMemo(() => scopedReceiptsForTrip(state, trip), [state.receipts, trip.id]);
  const sourceIdCounts = useMemo(() => tripReceipts.reduce<Record<string, number>>((acc, receipt) => {
    if (receipt.sourceId) acc[receipt.sourceId] = (acc[receipt.sourceId] || 0) + 1;
    return acc;
  }, {}), [tripReceipts]);
  const receipts = useMemo(() => {
    const q = query.trim().toLowerCase();
    return tripReceipts
      .filter((r) => category === 'all' || r.category === category)
      .filter((r) => !q || [r.store, r.note, r.itemsText, r.region, r.bookingRef, r.address].some((v) => String(v || '').toLowerCase().includes(q)))
      .sort((a, b) => {
        const dateA = a.date || '0000-00-00';
        const dateB = b.date || '0000-00-00';
        const dateDiff = dateB.localeCompare(dateA);
        if (dateDiff !== 0) return dateDiff;

        const timeA = a.time || '00:00';
        const timeB = b.time || '00:00';
        return timeB.localeCompare(timeA);
      });
  }, [tripReceipts, query, category]);
  const groups = receipts.reduce<Record<string, Receipt[]>>((acc, r) => {
    (acc[r.date] ||= []).push(r);
    return acc;
  }, {});
  const pending = tripReceipts.filter((r) => r.store?.startsWith('⏳ '));
  const people = getPersons(state);
  const validPersonIds = useMemo(() => new Set(people.map((person) => person.id)), [people]);
  const cleanupSuggestions = useMemo(
    () => buildReceiptCleanupSuggestions(tripReceipts, state, sourceIdCounts, validPersonIds),
    [tripReceipts, state, sourceIdCounts, validPersonIds],
  );
  const attachmentSuggestions = useMemo(
    () => buildReceiptAttachmentSuggestions(tripReceipts),
    [tripReceipts],
  );
  const conflictItems = useMemo(
    () => buildReceiptConflictItems(tripReceipts, state),
    [tripReceipts, state],
  );
  useEffect(() => {
    const repairReceiptId = takeReceiptRepairIntent();
    if (!repairReceiptId) return;
    const receipt = tripReceipts.find((item) => item.id === repairReceiptId)
      || (state.receipts || []).find((item) => item.id === repairReceiptId);
    if (receipt) {
      setStatus(`已開啟需要修正嘅紀錄：${displayStore(receipt)}`);
      onOpen(receipt);
      return;
    }
    setStatus('找不到需要修正嘅紀錄，請檢查目前旅程。');
  }, [tripReceipts, state.receipts, onOpen]);
  const categoryChips = [
    { id: 'all' as const, name: '全部', color: '#cf2626' },
    ...CATEGORIES.filter((item) => ['flight', 'lodging', 'food', 'transport', 'shopping', 'ticket', 'other'].includes(item.id)),
  ];
  const filterBadge = (category !== 'all' ? 1 : 0) + pending.length;
  const activeTripName = trip.name || state.tripName || '東京出張之旅';
  const handleSwitchTrip = (tripId: string) => {
    if (!setState) return;
    const target = state.trips?.find((t) => t.id === tripId && !t.archived);
    if (!target) return;

    setState((prev) => ({
      ...prev,
      activeTripId: tripId,
      trips: (prev.trips || []).map((item) => ({ ...item, active: item.id === tripId && !item.archived })),
      tripName: target.name,
      budget: target.budget ?? prev.budget,
      tripCurrency: target.currencies?.find((c) => c !== 'HKD') || prev.tripCurrency,
      customItinerary: target.itinerary || [],
      tripDateRange: { start: target.startDate, end: target.endDate }
    }));
  };

  async function handlePull(mode: 'manual' | 'auto' = 'manual') {
    if (!cloudSyncAvailable && !hasCredentialBrokerSession(state) && !hasDirectNotionToken()) {
      if (mode === 'manual') setStatus('未連線：請登入 Supabase 或重新解鎖 Credential Broker。');
      return;
    }
    setBusy(true);
    try {
      if (onPull) {
        await onPull();
        setStatus(`${mode === 'auto' ? '已自動' : '已'}從雲端同步。`);
      }
    } catch (error) {
      setStatus(`雲端 pull 失敗：${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setBusy(false);
    }
  }

  function handleCleanupSuggestion(suggestion: ReceiptCleanupSuggestion) {
    if (!suggestion.receipt) return;
    if (suggestion.key === 'pending') {
      onConfirmPending(suggestion.receipt);
      return;
    }
    onOpen(suggestion.receipt);
  }

  function handleAttachmentSuggestion(suggestion: ReceiptAttachmentSuggestion) {
    setStatus(suggestion.key === 'photo-large'
      ? '更換相片時會自動壓縮，建議保留清晰文字但降低容量。'
      : suggestion.key === 'photo-unsynced'
        ? '請確認收據後重新同步，避免旅行途中只有本機相片。'
        : '請加入收據相片，讓 OCR / backup 更完整。');
    onOpen(suggestion.receipt);
  }

  function handleKeepLocal(conflict: ReceiptConflictItem) {
    if (!setState) return;
    const now = Date.now();
    setState((prev) => {
      const currentReceipt = prev.receipts.find((receipt) => receipt.id === conflict.receipt.id) || conflict.receipt;
      const updatedReceipt: Receipt = {
        ...currentReceipt,
        syncStatus: 'queued',
        updatedAt: now,
      };
      let matched = false;
      const nextQueue = (prev.syncQueue || []).map((item) => {
        const matches = item.id === conflict.queueItem?.id || queueItemMatchesReceipt(item, currentReceipt);
        if (!matches || item.type !== 'receipt') return item;
        matched = true;
        return {
          ...item,
          error: undefined,
          status: 'queued' as const,
          attempts: 0,
          updatedAt: now,
          payload: buildSafeReceiptPayload(updatedReceipt, now),
        };
      });
      if (!matched) {
        nextQueue.push({
          id: `receipt-conflict-${updatedReceipt.id}-${now}`,
          type: 'receipt',
          entityId: updatedReceipt.id,
          op: updatedReceipt.supabaseId || updatedReceipt.notionPageId ? 'update' : 'create',
          status: 'queued',
          attempts: 0,
          createdAt: now,
          updatedAt: now,
          payload: buildSafeReceiptPayload(updatedReceipt, now),
        });
      }
      const stillHasFailedQueue = nextQueue.some(isFailedQueueItem);
      return {
        ...prev,
        receipts: prev.receipts.map((receipt) => receipt.id === updatedReceipt.id ? updatedReceipt : receipt),
        syncQueue: nextQueue.slice(-500),
        globalSyncStatus: stillHasFailedQueue ? prev.globalSyncStatus : 'queued',
        syncError: stillHasFailedQueue ? prev.syncError : '',
      };
    });
    setStatus('已保留本機版本，稍後會重新同步。');
  }

  function handleKeepCloud(conflict: ReceiptConflictItem) {
    if (!setState) return;
    const now = Date.now();
    setState((prev) => {
      const currentReceipt = prev.receipts.find((receipt) => receipt.id === conflict.receipt.id) || conflict.receipt;
      const cloudStatus = currentReceipt.supabaseId || currentReceipt.notionPageId ? 'synced' : 'local';
      const nextQueue = (prev.syncQueue || []).filter((item) => (
        item.id !== conflict.queueItem?.id && !queueItemMatchesReceipt(item, currentReceipt)
      ));
      const stillHasFailedQueue = nextQueue.some(isFailedQueueItem);
      return {
        ...prev,
        receipts: prev.receipts.map((receipt) => receipt.id === currentReceipt.id ? {
          ...receipt,
          syncStatus: cloudStatus,
          updatedAt: now,
        } : receipt),
        syncQueue: nextQueue,
        globalSyncStatus: stillHasFailedQueue ? prev.globalSyncStatus : (nextQueue.length ? 'queued' : 'idle'),
        syncError: stillHasFailedQueue ? prev.syncError : '',
      };
    });
    setStatus('已信任雲端版本，停止重試本機衝突。');
  }

  return (
    <section className="japanese-washi-bg w-full min-h-screen px-4 pb-28 pt-6 relative overflow-y-auto history-screen">
      <div className="japanese-sun-decor" />
      <div className="japanese-sakura-decor" />
      <div className="stack w-full relative z-10">

      {status && <Toast tone={/失敗|未連線/i.test(status) ? 'warning' : 'success'}>{status}</Toast>}
      <div className="history-filter-deck history-filters">
        <label className="search-field">
          <Search size={16} />
          <input placeholder="搜尋店家、類別、標籤、金額..." value={query} onChange={(e) => setQuery(e.target.value)} />
        </label>
        <label className="history-filter-button">
          <SlidersHorizontal size={19} aria-hidden="true" />
          <span>篩選</span>
          {filterBadge > 0 && <b>{filterBadge}</b>}
          <select aria-label="篩選類別" value={category} onChange={(e) => setCategory(e.target.value as 'all' | CategoryId)}>
            <option value="all">全部類別</option>
            {CATEGORIES.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </label>
      </div>
      <div className="history-chip-rail" aria-label="類別篩選">
        <button
          type="button"
          className="history-chip history-chip-control"
          onClick={() => setCategory('all')}
          aria-pressed={category === 'all'}
        >
          <SlidersHorizontal size={17} aria-hidden="true" />
          類別
        </button>
        {categoryChips.map((chip) => (
          <button
            key={chip.id}
            type="button"
            className={`history-chip ${category === chip.id ? 'active' : ''}`}
            style={{ '--chip-color': chip.color } as CSSProperties}
            onClick={() => setCategory(chip.id)}
            aria-pressed={category === chip.id}
          >
            {chip.name}
          </button>
        ))}
      </div>
      {conflictItems.length > 0 && (
        <section className="history-conflict-resolver card" aria-label="Offline conflict resolver">
          <div className="history-conflict-head">
            <AlertTriangle size={18} aria-hidden="true" />
            <div>
              <h2>Offline Conflict Resolver</h2>
              <p>{conflictItems.length} conflicts need a safe choice</p>
            </div>
          </div>
          <div className="history-conflict-grid">
            {conflictItems.map((conflict) => {
              const cat = categoryById(conflict.receipt.category);
              return (
                <article key={conflict.receipt.id} className="history-conflict-item">
                  <span>
                    <strong>{displayStore(conflict.receipt)}</strong>
                    <b>{conflict.status}</b>
                  </span>
                  <small>{[cat.name, conflict.receipt.date, conflict.receipt.time].filter(Boolean).join(' · ')}</small>
                  <small>{conflict.detail}</small>
                  <div className="history-conflict-actions">
                    <button type="button" onClick={() => onOpen(conflict.receipt)}>Review conflict</button>
                    <button type="button" onClick={() => handleKeepLocal(conflict)}>Keep local</button>
                    <button type="button" onClick={() => handleKeepCloud(conflict)}>Keep cloud</button>
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      )}
      {attachmentSuggestions.length > 0 && (
        <section className="history-attachment-health card" aria-label="Receipt attachment health">
          <div className="history-attachment-head">
            <Camera size={18} aria-hidden="true" />
            <div>
              <h2>Attachment Health</h2>
              <p>{attachmentSuggestions.reduce((sum, item) => sum + item.count, 0)} photo checks need review</p>
            </div>
          </div>
          <div className="history-attachment-grid">
            {attachmentSuggestions.map((suggestion) => (
              <article key={suggestion.key} className={`history-attachment-item tone-${suggestion.tone}`}>
                <span>
                  <strong>{suggestion.title}</strong>
                  <b>{suggestion.count}</b>
                </span>
                <small>{suggestion.detail}</small>
                <button type="button" onClick={() => handleAttachmentSuggestion(suggestion)}>
                  {suggestion.actionLabel}
                </button>
              </article>
            ))}
          </div>
        </section>
      )}
      {cleanupSuggestions.length > 0 && (
        <section className="history-cleanup-coach card" aria-label="Receipt cleanup suggestions">
          <div className="history-cleanup-head">
            <AlertTriangle size={18} aria-hidden="true" />
            <div>
              <h2>Cleanup Coach</h2>
              <p>{cleanupSuggestions.reduce((sum, item) => sum + item.count, 0)} checks need review</p>
            </div>
          </div>
          <div className="history-cleanup-grid">
            {cleanupSuggestions.map((suggestion) => (
              <article key={suggestion.key} className={`history-cleanup-item tone-${suggestion.tone}`}>
                <span>
                  <strong>{suggestion.title}</strong>
                  <b>{suggestion.count}</b>
                </span>
                <small>{suggestion.detail}</small>
                <button type="button" onClick={() => handleCleanupSuggestion(suggestion)}>
                  {suggestion.actionLabel}
                </button>
              </article>
            ))}
          </div>
        </section>
      )}
      {pending.length > 0 && (
        <section className="history-pending-banner card" aria-label="Email 待確認">
          <Mail size={30} aria-hidden="true" />
          <div>
            <h2>Email 待確認</h2>
            <strong>待確認：{pending.length} 筆郵件收據</strong>
            <p>已匯入，等待確認以完成記帳</p>
          </div>
          <button className="history-confirm-button" type="button" onClick={() => onConfirmPending(pending[0])}>
            查看並確認
          </button>
        </section>
      )}
      {Object.keys(groups).length === 0 && <p className="empty card">未有紀錄</p>}
      {Object.entries(groups).sort((a, b) => b[0].localeCompare(a[0])).map(([date, items], groupIdx) => (
        <Reveal key={date} className="history-date-reveal" delay={Math.min(0.16, groupIdx * 0.018)}>
        <details className="card history-expandable-group" open>
          <summary className="section-head history-expandable-summary">
            <div className="history-date-title">
              <CalendarDays size={18} aria-hidden="true" />
              <h2>{historyDateLabel(date)}</h2>
              <span className="pill">{items.length} 筆</span>
            </div>
            <span className="history-date-total">{resolvedTripCurrency === 'JPY' ? '¥' : (resolvedTripCurrency + ' ')}{fmt(items.reduce((sum, item) => sum + getReceiptTripAmount(item, state, resolvedTripCurrency), 0))} · HKD ${fmt(items.reduce((sum, item) => sum + getReceiptHkdAmount(item, state), 0))}</span>
          </summary>
          <div className="history-record-stack">
            {items.map((r) => {
              const cat = categoryById(r.category);
              const person = people.find((p) => p.id === r.personId) || people[0];
              const photoSrc = safePhotoUrl(r.photoUrl, r.photoThumb);
              const healthMarkers = receiptHealthMarkers(r, state, sourceIdCounts, photoSrc);
              return (
                <div
                  key={r.id}
                  className="receipt-row history-ledger-row"
                  role="button"
                  tabIndex={0}
                  onClick={() => onOpen(r)}
                  onKeyDown={(e) => { if (e.key === 'Enter') onOpen(r); }}
                >
                  <VisualIcon id={r.category as CategoryId} size="md" className="history-ledger-icon washi-nippon-stamp" />
                  <span className="receipt-main history-ledger-main">
                    <strong>
                      {isPendingReceipt(r) && <span className="history-pending-mini">pending</span>}
                      {displayStore(r)}
                    </strong>
                    <small>{[cat.name, r.date.slice(5).replace('-', '/'), r.region || r.regionSnapshot, person?.name].filter(Boolean).join(' · ')}</small>
                    {healthMarkers.length > 0 && (
                      <span className="history-health-markers" aria-label={`Receipt health markers for ${displayStore(r)}`}>
                        {healthMarkers.map((marker) => (
                          <i key={marker.key} className={`history-health-marker tone-${marker.tone}`}>{marker.label}</i>
                        ))}
                      </span>
                    )}
                  </span>
                  <span className="history-photo-slot" aria-hidden={!photoSrc}>
                    {photoSrc ? (
                      <button
                        type="button"
                        className="history-photo-thumb"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setViewPhoto(r);
                        }}
                        aria-label={`查看 ${displayStore(r)} 收據相片`}
                      >
                        <img src={photoSrc} alt="" />
                      </button>
                    ) : (
                      <Camera size={24} />
                    )}
                  </span>
                  <span className="amount history-ledger-amount">
                    <strong>{r.currency === 'HKD' ? 'HK$' : (r.currency || '¥')}{fmt(r.total)}</strong>
                    <small>HKD ${fmt(getReceiptHkdAmount(r, state))}</small>
                  </span>
                  <ChevronRight className="history-row-chevron" size={21} aria-hidden="true" />
                </div>
              );
            })}
            <div className="history-day-subtotal">
              <span>當日小計</span>
              <strong>{resolvedTripCurrency === 'JPY' ? '¥' : (resolvedTripCurrency + ' ')}{fmt(items.reduce((sum, item) => sum + getReceiptTripAmount(item, state, resolvedTripCurrency), 0))} · HKD ${fmt(items.reduce((sum, item) => sum + getReceiptHkdAmount(item, state), 0))}</strong>
            </div>
          </div>
        </details>
        </Reveal>
      ))}
      </div>
      {viewPhoto && <ReceiptPhotoModal receipt={viewPhoto} onClose={() => setViewPhoto(null)} />}
    </section>
  );
}

// ReceiptPhotoModal removed - imported from shared components instead
