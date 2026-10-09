import { Camera, Check, ImageIcon, LoaderCircle, Mail, Mic, PenLine, RefreshCw, Repeat2, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type CSSProperties } from 'react';
import { StatefulActionButton, Toast } from '../components/ui';
import { heuristicReceiptFromText, parseTextWithAi, scanReceiptImage } from '../lib/ai';
import { convertAmount, currencyPrefix, fetchLiveCurrencySnapshot, loadCurrencySnapshot, perHkdForCurrency, SUPPORTED_CURRENCIES, type CurrencySnapshot } from '../lib/currency';
import { categoryById, compressPhoto, displayStore, getReceiptTripAmount, getResolvedTripCurrency, isPendingReceipt, todayForReceipts } from '../lib/domain';
import { redactedError } from '../lib/credentialBroker';
import type { AppState, Receipt } from '../lib/types';
import { useModalOpenClass } from '../lib/useModalOpenClass';
import { activeTrip, scopedReceiptsForTrip } from '../domain/trip/normalize';
import { resolveTripContext } from '../domain/trip/context';
import '../styles/scan.css';

type ScanMode = 'scan' | 'voice' | 'email';
type BatchReceipt = Receipt & { selected?: boolean };
type ReadingPhase = 'prepare' | 'read';

const CAMERA_INPUT_ID = 'scan-camera-input';
const GALLERY_INPUT_ID = 'scan-gallery-input';
const EMAIL_IMAGE_INPUT_ID = 'scan-email-image-input';
const DAY_MS = 86_400_000;
const STAMP_LIMIT = 9;
const VOICE_EXAMPLES = ['Lawson 買三文治 420 yen', '名古屋城門票 1000 yen', '鰻魚飯三吃 4800 yen', '地鐵 Suica 增值 2000 yen'];

function tripCurrencyFor(state: AppState): string {
  const trip = activeTrip(state);
  const resolved = String(getResolvedTripCurrency(state, trip) || state.tripCurrency || 'JPY').toUpperCase();
  const context = resolveTripContext(trip.destinationSummary || trip.name || '', resolved, trip.intelligence?.countryCode || '');
  return String(context.primaryCurrency || resolved).toUpperCase();
}

function ymdMs(ymd: string | undefined): number {
  return ymd && /^\d{4}-\d{2}-\d{2}$/.test(ymd) ? Date.parse(`${ymd}T00:00:00Z`) : Number.NaN;
}

// Where today sits in the trip: "第 3 日 / 6", "出發前 4 日" or "旅程已完".
function tripDayLabel(today: string, start?: string, end?: string): string {
  const t = ymdMs(today);
  const s = ymdMs(start);
  const e = ymdMs(end);
  if (!Number.isFinite(t) || !Number.isFinite(s)) return '';
  if (t < s) return `出發前 ${Math.round((s - t) / DAY_MS)} 日`;
  if (Number.isFinite(e) && t > e) return '旅程已完';
  const day = Math.round((t - s) / DAY_MS) + 1;
  return Number.isFinite(e) ? `第 ${day} 日 / ${Math.round((e - s) / DAY_MS) + 1}` : `第 ${day} 日`;
}

// Passport machine-readable line: decorative, built only from the trip's own code and dates.
function mrzLine(countryCode: string, currency: string, start?: string, end?: string): string {
  const compact = (ymd?: string) => (ymd || '').replace(/-/g, '').slice(2) || '<<<<<<';
  return `P<HKG${(countryCode || 'XX').toUpperCase()}<<ENTRY<${compact(start)}<${compact(end)}<<${currency}<HKD`.padEnd(44, '<').slice(0, 44);
}

// Stamp shape + ink follow the spend type: round for eating/shopping, ticket-square for getting
// around, oval for stays and admissions — so the page reads at a glance.
function stampKind(category?: string): 'round' | 'ticket' | 'oval' {
  if (category === 'transport' || category === 'flight') return 'ticket';
  if (category === 'lodging' || category === 'ticket' || category === 'localtour') return 'oval';
  return 'round';
}

// A stable small tilt per receipt so stamps look hand-pressed but never jump between renders.
function stampTilt(id: string): number {
  let hash = 0;
  for (let i = 0; i < id.length; i += 1) hash = (hash * 31 + id.charCodeAt(i)) | 0;
  return (Math.abs(hash) % 13) - 6;
}

function safeFileStem(file: File): string {
  return file.name
    .replace(/\.[^.]+$/, '')
    .replace(/[<>&"'`]/g, '')
    .replace(/[\u0000-\u001F\u007F]/g, '')
    .trim()
    .slice(0, 120) || '掃描收據';
}

function receiptNeedsReview(receipt: Partial<Receipt>): boolean {
  const store = String(receipt.store || '');
  const note = String(receipt.note || '');
  return !store.trim()
    || store.includes('解析失敗')
    || !receipt.date
    || !(Number(receipt.total) > 0)
    || /OCR 未完成|Error:/i.test(note);
}

export function Scan({
  onManual,
  onDraft,
  onImport,
  onPull,
  cloudSyncAvailable = false,
  state,
  onBusyChange,
  batch,
  setBatch,
}: {
  onManual: () => void;
  onDraft: (receipt: Receipt) => void;
  onImport: (receipts: Receipt[]) => void;
  onPull?: () => Promise<void>;
  cloudSyncAvailable?: boolean;
  state: AppState;
  onBusyChange?: (busy: string) => void;
  batch: BatchReceipt[];
  setBatch: React.Dispatch<React.SetStateAction<BatchReceipt[]>>;
}) {
  const cameraRef = useRef<HTMLInputElement | null>(null);
  const galleryRef = useRef<HTMLInputElement | null>(null);
  const emailImageRef = useRef<HTMLInputElement | null>(null);
  const speechRef = useRef<any>(null);
  const [isListening, setIsListening] = useState(false);
  const mountedRef = useRef(true);
  const [busy, setBusy] = useState('');
  const setBusyWithGlobal = useCallback((val: string) => {
    setBusy(val);
    onBusyChange?.(val);
  }, [onBusyChange]);

  const [status, setStatus] = useState('');
  const [voiceText, setVoiceText] = useState('');
  const [emailText, setEmailText] = useState('');

  const [savingBatch, setSavingBatch] = useState(false);
  const [mode, setMode] = useState<ScanMode>('scan');
  const [fxOpen, setFxOpen] = useState(false);
  const [inputKey, setInputKey] = useState(0);
  const [lastScanFile, setLastScanFile] = useState<File | null>(null);
  const [lastDraft, setLastDraft] = useState<Receipt | null>(null);
  const trip = activeTrip(state);
  const tripCurrency = useMemo(() => tripCurrencyFor(state), [state]);
  const [from, setFrom] = useState(tripCurrency);
  const [to, setTo] = useState('HKD');
  const [amount, setAmount] = useState('1000');
  const [fx, setFx] = useState<CurrencySnapshot | null>(() => loadCurrencySnapshot());
  const fxAutoRefreshRef = useRef(false);
  const stateRef = useRef(state);
  stateRef.current = state;
  const [reading, setReading] = useState<{ preview: string; phase: ReadingPhase } | null>(null);
  const readingUrlRef = useRef('');
  useEffect(() => () => { if (readingUrlRef.current) URL.revokeObjectURL(readingUrlRef.current); }, []);
  const mountedAtRef = useRef(Date.now());

  const showReading = useCallback((file: File, phase: ReadingPhase) => {
    if (!mountedRef.current) return;
    setReading((current) => {
      if (current) URL.revokeObjectURL(current.preview);
      readingUrlRef.current = URL.createObjectURL(file);
      return { preview: readingUrlRef.current, phase };
    });
  }, []);
  const clearReading = useCallback(() => {
    if (!mountedRef.current) return;
    setReading((current) => {
      if (current) URL.revokeObjectURL(current.preview);
      readingUrlRef.current = '';
      return null;
    });
  }, []);

  useEffect(() => {
    setFrom((current) => current || tripCurrency);
  }, [tripCurrency]);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (speechRef.current) {
        try {
          speechRef.current.abort();
        } catch {}
      }
      speechRef.current = null;
    };
  }, []);

  useModalOpenClass(batch.length > 0 || fxOpen);

  const converted = useMemo(() => {
    const n = Number(amount) || 0;
    return convertAmount(n, from, to, state, fx);
  }, [amount, from, to, state, fx]);
  const fxFixed = state.rateMode === 'fixed';

  useEffect(() => {
    if (!fxOpen) {
      // Reset on close so reopening the modal after the 1-hour cache window can refresh again.
      fxAutoRefreshRef.current = false;
      return;
    }
    // 固定匯率模式：唔好自動 fetch — 用返用户鎖定咗嘅匯率。
    if (fxAutoRefreshRef.current || stateRef.current.rateMode === 'fixed') return;
    fxAutoRefreshRef.current = true;
    void handleFxRefresh();
  }, [fxOpen]);

  const batchQuality = useMemo(() => {
    const selected = batch.filter((row) => row.selected !== false).length;
    const review = batch.filter(receiptNeedsReview).length;
    return {
      total: batch.length,
      selected,
      complete: Math.max(0, batch.length - review),
      review,
    };
  }, [batch]);
  const openDraft = useCallback((receipt: Receipt) => {
    if (mountedRef.current) setLastDraft(receipt);
    onDraft(receipt);
  }, [onDraft]);
  const today = todayForReceipts(state);
  const ledgerCurrency = getResolvedTripCurrency(state, trip);
  const ledgerPrefix = currencyPrefix(ledgerCurrency);
  const todayStamps = useMemo(() => scopedReceiptsForTrip(state, trip)
    .filter((receipt) => receipt.date === today)
    .sort((a, b) => String(b.time || '').localeCompare(String(a.time || '')) || (b.createdAt || 0) - (a.createdAt || 0)),
  [state, trip, today]);
  const todayTotal = useMemo(
    () => todayStamps.reduce((sum, receipt) => sum + getReceiptTripAmount(receipt, state, ledgerCurrency), 0),
    [todayStamps, state, ledgerCurrency],
  );
  const dayLabel = tripDayLabel(today, trip.startDate, trip.endDate);
  const rate = perHkdForCurrency(state, tripCurrency);
  const countryCode = trip.intelligence?.countryCode || '';
  const toggleMode = (next: ScanMode) => setMode((current) => (current === next ? 'scan' : next));

  const handleImage = useCallback(async (file?: File, retry = false) => {
    if (!file) {
      setStatus('未收到圖片。相機無彈出時，請試相簿或手動記一筆。');
      return;
    }
    if (!retry) setLastScanFile(file);
    setBusyWithGlobal('ocr');
    setStatus('讀取收據圖片…');
    showReading(file, 'prepare');
    let localThumb: string | undefined = undefined;
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ''));
        reader.onerror = () => reject(reader.error || new Error('讀取相片失敗'));
        reader.readAsDataURL(file);
      });
      const [, mime = '', base64 = ''] = dataUrl.match(/^data:([^;]+);base64,(.*)$/) || [];
      const compressed = await compressPhoto(base64, mime, 480);
      if (compressed) localThumb = compressed;
    } catch (e) {
      console.warn('Pre-compressing thumbnail failed:', e);
    }

    if (mountedRef.current) setReading((current) => (current ? { ...current, phase: 'read' } : current));
    try {
      const receipt = await scanReceiptImage(file, stateRef.current);
      openDraft(receipt);
      if (mountedRef.current) setStatus('OCR 完成，請確認欄位。');
    } catch (error) {
      const draft = {
        ...heuristicReceiptFromText('', stateRef.current),
        store: '',
        date: '',
        payment: '' as const,
        note: `OCR 未完成：${redactedError(error)}`,
        source: 'react-ocr-manual',
        photoThumb: localThumb,
      };
      openDraft(draft);
      if (mountedRef.current) setStatus('未能自動 OCR，已開啟 React 確認表俾你手動補資料。');
    } finally {
      clearReading();
      if (mountedRef.current) setBusy('');
      onBusyChange?.('');
    }
  }, [openDraft, setBusyWithGlobal, onBusyChange, showReading, clearReading]);

  const handleCameraChange = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = '';
    if (file) void handleImage(file);
  }, [handleImage]);

  const handleGalleryChange = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = '';
    if (file) void handleImage(file);
  }, [handleImage]);

  const triggerCamera = useCallback(() => {
    setMode('scan');
    setInputKey((k) => k + 1);
    if (busy !== 'ocr') {
      Promise.resolve().then(() => cameraRef.current?.click());
    }
  }, [busy]);

  const triggerGallery = useCallback(() => {
    setMode('scan');
    setInputKey((k) => k + 1);
    if (busy !== 'ocr') {
      Promise.resolve().then(() => galleryRef.current?.click());
    }
  }, [busy]);

  async function handleVoiceParse() {
    if (!voiceText.trim()) return;
    setBusyWithGlobal('voice');
    try {
      const receipts = await parseTextWithAi(voiceText, state, 'react-voice');
      if (!receipts?.length) {
        if (mountedRef.current) setStatus('解析不到任何收據');
        return;
      }
      openDraft(receipts[0]);
      if (mountedRef.current) { setVoiceText(''); setStatus('語音文字已解析，請確認欄位。'); }
    } catch (error) {
      if (mountedRef.current) setStatus(`語音解析失敗：${redactedError(error)}`);
    } finally {
      if (mountedRef.current) setBusy('');
      onBusyChange?.('');
    }
  }

  async function startSpeech() {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setStatus('呢個瀏覽器唔支援 Web Speech API，可以直接貼語音文字。');
      return;
    }
    if (speechRef.current) {
      try {
        speechRef.current.abort();
      } catch {}
    }
    const rec = new SpeechRecognition();
    rec.lang = 'yue-Hant-HK';
    rec.continuous = false;
    rec.interimResults = false;
    rec.onresult = (event: any) => {
      if (!mountedRef.current) return;
      setVoiceText(event.results?.[0]?.[0]?.transcript || '');
    };
    rec.onerror = (event: any) => {
      if (!mountedRef.current) return;
      setIsListening(false);
      setStatus(`語音失敗：${event.error || 'unknown'}`);
    };
    rec.onend = () => {
      if (speechRef.current === rec) speechRef.current = null;
      if (mountedRef.current) setIsListening(false);
    };
    speechRef.current = rec;
    rec.start();
    setIsListening(true);
  }

  async function handleEmailParse() {
    if (!emailText.trim()) return;
    setBusyWithGlobal('email');
    try {
      const receipts = await parseTextWithAi(emailText, state, 'react-email');
      if (!receipts?.length) {
        if (mountedRef.current) setStatus('解析不到任何收據');
        return;
      }
      setBatch(receipts.map((r) => ({ ...r, store: r.store.startsWith('⏳ ') ? r.store : `⏳ ${r.store}`, selected: true })));
      if (mountedRef.current) { setEmailText(''); setStatus(`已解析 ${receipts.length} 筆，請喺 batch confirm 核對。`); }
    } catch (error) {
      if (mountedRef.current) setStatus(`Email 解析失敗：${redactedError(error)}`);
    } finally {
      if (mountedRef.current) setBusy('');
      onBusyChange?.('');
    }
  }

  const handleEmailImages = useCallback(async (files?: Iterable<File> | null) => {
    const list = Array.from(files || []);
    if (!list.length) return;
    setBusyWithGlobal('email-image');
    if (mountedRef.current) setStatus(`解析 ${list.length} 張 email 截圖…`);
    try {
      const receipts: Receipt[] = [];
      for (const file of list) {
        let localThumb: string | undefined = undefined;
        try {
          const dataUrl = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(String(reader.result || ''));
            reader.onerror = () => reject(reader.error || new Error('讀取相片失敗'));
            reader.readAsDataURL(file);
          });
          const [, mime = '', base64 = ''] = dataUrl.match(/^data:([^;]+);base64,(.*)$/) || [];
          const compressed = await compressPhoto(base64, mime, 480);
          if (compressed) localThumb = compressed;
        } catch (e) {
          console.warn('Pre-compressing email batch thumbnail failed:', e);
        }

        try {
          receipts.push(await scanReceiptImage(file, state));
        } catch (error) {
          receipts.push({
            id: `email_img_${Date.now()}_${Math.random().toString(16).slice(2)}`,
            store: `⏳ 截圖解析失敗: ${safeFileStem(file)}`,
            total: 0,
            date: '',
            category: 'other',
            payment: 'cash',
            personId: '',
            splitMode: 'shared',
            note: `Error: ${redactedError(error)}`,
            source: 'react-email-image',
            photoThumb: localThumb,
            createdAt: Date.now(),
          } as Receipt);
        }
      }
      setBatch(receipts.map((r) => ({ ...r, source: 'react-email-image', store: r.store.startsWith('⏳ ') ? r.store : `⏳ ${r.store}`, selected: true })));
      if (mountedRef.current) setStatus(`已解析 ${receipts.length} 筆截圖，請核對後保存。`);
    } catch (error) {
      if (mountedRef.current) setStatus(`截圖解析失敗：${redactedError(error)}`);
    } finally {
      if (mountedRef.current) {
        setBusy('');
        window.setTimeout(() => {
          if (mountedRef.current) setInputKey((key) => key + 1);
        }, 100);
      }
      onBusyChange?.('');
    }
  }, [state, setBatch, onBusyChange]);

  const handleEmailImagesChange = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    const files = event.currentTarget.files ? Array.from(event.currentTarget.files) : [];
    event.currentTarget.value = '';
    if (files.length) void handleEmailImages(files);
  }, [handleEmailImages]);

  const triggerEmailImages = useCallback(() => {
    setInputKey((k) => k + 1);
    if (busy !== 'email-image') {
      Promise.resolve().then(() => emailImageRef.current?.click());
    }
  }, [busy]);

  function updateBatch(id: string, patch: Partial<BatchReceipt>) {
    setBatch((rows) => rows.map((row) => (row.id === id ? { ...row, ...patch } : row)));
  }

  // Keystroke strings for batch 金額 — parsing every keystroke would turn "12." into 12 and
  // make decimals untypeable (same pattern as ReceiptEditor / Dashboard budget editor).
  const [batchTotalDrafts, setBatchTotalDrafts] = useState<Record<string, string>>({});
  useEffect(() => {
    if (batch.length === 0) setBatchTotalDrafts({});
  }, [batch.length]);
  const commitBatchTotal = (id: string, raw: string) => {
    const n = Number(raw);
    updateBatch(id, { total: Number.isFinite(n) && n >= 0 ? Math.min(n, 1_000_000_000) : 0 });
    setBatchTotalDrafts((drafts) => {
      const next = { ...drafts };
      delete next[id];
      return next;
    });
  };

  function selectCompleteBatchRows() {
    setBatch((rows) => rows.map((row) => ({ ...row, selected: !receiptNeedsReview(row) })));
  }

  function saveBatch() {
    if (savingBatch) return;
    // Commit any in-flight 金額 keystrokes — blur may not fire before the save click.
    const withDrafts = batch.map((row) => {
      const raw = batchTotalDrafts[row.id];
      if (raw == null) return row;
      const n = Number(raw);
      return { ...row, total: Number.isFinite(n) && n >= 0 ? Math.min(n, 1_000_000_000) : 0 };
    });
    setBatchTotalDrafts({});
    const selected = withDrafts.filter((row) => row.selected !== false).map(({ selected: _selected, ...receipt }) => receipt);
    // Block receipts missing store/date/amount even if manually re-selected; save the valid rest.
    const valid = selected.filter((receipt) => !receiptNeedsReview(receipt));
    const skipped = selected.length - valid.length;
    if (!valid.length) {
      setStatus(skipped ? `有 ${skipped} 筆缺少店名／日期／金額，未能儲存` : '未揀選任何紀錄');
      return;
    }
    setSavingBatch(true);
    onImport(valid);
    setBatch([]);
    setEmailText('');
    setStatus(skipped
      ? `已儲存 ${valid.length} 筆；略過 ${skipped} 筆缺資料紀錄`
      : `已儲存 ${valid.length} 筆 email 待確認紀錄。`);
    setSavingBatch(false);
  }

  async function handlePullPending() {
    if (!navigator.onLine) {
      setStatus('離線模式，無法拉取雲端資料。');
      return;
    }
    setBusy('cloud');
    setStatus('從雲端拉取最新資料…');
    try {
      await onPull?.();
      if (!mountedRef.current) return;
      setStatus('已透過 Sync Engine 拉取雲端資料。');
    } catch (error) {
      if (!mountedRef.current) return;
      setStatus(`雲端同步失敗：${redactedError(error)}`);
    } finally {
      if (mountedRef.current) setBusy('');
    }
  }

  async function handleCopyGmail() {
    const address = 'ftjdfr+expense@gmail.com';
    try {
      if (!navigator.clipboard?.writeText) throw new Error('clipboard unavailable');
      await Promise.race([
        navigator.clipboard.writeText(address),
        new Promise((_, reject) => setTimeout(() => reject(new Error('clipboard permission pending')), 800)),
      ]);
      if (!mountedRef.current) return;
      setStatus(`已複製：${address}`);
    } catch {
      if (!mountedRef.current) return;
      setStatus(`收帳 Gmail：${address}`);
    }
  }

  async function handleFxRefresh() {
    if (stateRef.current.rateMode === 'fixed') return;
    setBusy('fx');
    try {
      const snapshot = await fetchLiveCurrencySnapshot();
      if (!mountedRef.current) return;
      setFx(snapshot);
      const toastCode = Number.isFinite(snapshot.rates[from]) ? from : tripCurrency;
      const destinationRate = snapshot.rates[toastCode];
      setStatus(destinationRate ? `已更新匯率：1 HKD = ${destinationRate.toFixed(2)} ${toastCode}（${snapshot.source}）` : `已更新匯率（${snapshot.source}）`);
    } catch (error) {
      if (!mountedRef.current) return;
      setStatus(`匯率更新失敗：${redactedError(error)}`);
    } finally {
      if (mountedRef.current) setBusy('');
    }
  }

  const batchContainerRef = useRef<HTMLDivElement>(null);
  const fxContainerRef = useRef<HTMLDivElement>(null);
  const batchPrevFocusRef = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (batch.length === 0) return;
    batchPrevFocusRef.current = document.activeElement as HTMLElement;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); setBatch([]); }
      if (e.key === 'Tab' && batchContainerRef.current) {
        const focusable = batchContainerRef.current.querySelectorAll<HTMLElement>('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
        if (!focusable.length) return;
        const first = focusable[0]; const last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => { document.removeEventListener('keydown', handleKeyDown); batchPrevFocusRef.current?.focus?.(); };
  }, [batch.length, setBatch]);

  useEffect(() => {
    if (!fxOpen) return;
    batchPrevFocusRef.current = document.activeElement as HTMLElement;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); setFxOpen(false); }
      if (e.key === 'Tab' && fxContainerRef.current) {
        const focusable = fxContainerRef.current.querySelectorAll<HTMLElement>('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
        if (!focusable.length) return;
        const first = focusable[0]; const last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => { document.removeEventListener('keydown', handleKeyDown); batchPrevFocusRef.current?.focus?.(); };
  }, [fxOpen]);

  return (
    <section className="scan-page w-full min-h-screen px-4 pb-28 pt-5">
      <input key={`camera-${inputKey}`} id={CAMERA_INPUT_ID} ref={cameraRef} className="visually-hidden-file" type="file" accept="image/*" capture="environment" onChange={handleCameraChange} />
      <input key={`gallery-${inputKey}`} id={GALLERY_INPUT_ID} ref={galleryRef} className="visually-hidden-file" type="file" accept="image/*" onChange={handleGalleryChange} />
      <input key={`email-${inputKey}`} id={EMAIL_IMAGE_INPUT_ID} ref={emailImageRef} className="visually-hidden-file" type="file" accept="image/*" multiple onChange={handleEmailImagesChange} />

      <div className="scan-layout">
        <div className="scan-desk">
          <header className="scan-visa">
            <div className="scan-visa-row">
              <h2>{trip.name || state.tripName || '目前旅程'}</h2>
              <button type="button" className="scan-rate" aria-label="匯率 Exchange Rate" onClick={() => setFxOpen(true)}>
                <small>1 HKD</small>
                <strong>{tripCurrency === 'HKD' ? 'HKD' : `${rate >= 100 ? Math.round(rate).toLocaleString() : rate.toFixed(2)} ${tripCurrency}`}</strong>
                <span>匯率</span>
              </button>
            </div>
            <p className="scan-visa-trip">
              {trip.startDate && <span>{trip.startDate.slice(5).replace('-', '/')} – {(trip.endDate || '').slice(5).replace('-', '/')}</span>}
              {dayLabel && <b>{dayLabel}</b>}
            </p>
            <p className="scan-mrz" aria-hidden="true">{mrzLine(countryCode, tripCurrency, trip.startDate, trip.endDate)}</p>
          </header>

          <div className="scan-press" aria-live="polite">
            {reading ? (
              <div className="scan-reading" role="status">
                <span className="scan-reading-photo">
                  <img src={reading.preview} alt="" />
                </span>
                <ol className="scan-reading-steps">
                  <li className={reading.phase === 'prepare' ? 'is-active' : 'is-done'}>
                    {reading.phase === 'prepare' ? <LoaderCircle size={16} className="spin" aria-hidden="true" /> : <Check size={16} aria-hidden="true" />}
                    整理相片
                  </li>
                  <li className={reading.phase === 'read' ? 'is-active' : ''}>
                    {reading.phase === 'read' ? <LoaderCircle size={16} className="spin" aria-hidden="true" /> : <span className="scan-step-dot" aria-hidden="true" />}
                    AI 讀緊店名、金額、日期
                  </li>
                  <li>
                    <span className="scan-step-dot" aria-hidden="true" />
                    打開確認表
                  </li>
                </ol>
              </div>
            ) : (
              <button type="button" className="scan-stamp-shutter" aria-label="相機：掃描收據" disabled={busy === 'ocr'} onClick={triggerCamera}>
                <svg className="scan-stamp-ring" viewBox="0 0 200 200" aria-hidden="true">
                  <defs>
                    <path id="scan-stamp-arc" d="M100,100 m-78,0 a78,78 0 1,1 156,0 a78,78 0 1,1 -156,0" />
                  </defs>
                  <circle cx="100" cy="100" r="95" />
                  <circle cx="100" cy="100" r="88" />
                  <circle cx="100" cy="100" r="64" />
                  <text><textPath href="#scan-stamp-arc" startOffset="0" textLength={488} lengthAdjust="spacing">收據 · RECEIPT · 入帳 · ENTRY · 收據 · RECEIPT · 入帳 · ENTRY ·</textPath></text>
                </svg>
                <span className="scan-stamp-face">
                  <Camera size={30} aria-hidden="true" />
                  <strong>掃描收據</strong>
                  <small>{today.replace(/-/g, '·')}</small>
                </span>
              </button>
            )}
          </div>

          <nav className="scan-routes" aria-label="其他記帳方式">
            <button type="button" className="scan-route" disabled={busy === 'ocr'} onClick={triggerGallery}>
              <i className="scan-route-ring" aria-hidden="true"><ImageIcon size={22} /></i>
              <span>相簿</span>
            </button>
            <button type="button" className="scan-route" aria-pressed={mode === 'voice'} onClick={() => toggleMode('voice')}>
              <i className="scan-route-ring" aria-hidden="true"><Mic size={22} /></i>
              <span>語音</span>
            </button>
            <button type="button" className="scan-route" aria-pressed={mode === 'email'} onClick={() => toggleMode('email')}>
              <i className="scan-route-ring" aria-hidden="true"><Mail size={22} /></i>
              <span>Email</span>
            </button>
            <button type="button" className="scan-route" onClick={onManual}>
              <i className="scan-route-ring" aria-hidden="true"><PenLine size={22} /></i>
              <span>手動</span>
            </button>
          </nav>

          {mode === 'voice' && (
            <div className="scan-sheet">
              <div className="scan-sheet-actions">
                <button className="secondary" type="button" onClick={startSpeech} disabled={isListening}>
                  <Mic size={18} className={isListening ? 'scan-listening' : ''} aria-hidden="true" /> {isListening ? '聆聽中…' : '開始聽'}
                </button>
                <StatefulActionButton className="primary" type="button" disabled={!voiceText.trim() || busy === 'voice'} onClick={handleVoiceParse}>解析</StatefulActionButton>
              </div>
              <textarea value={voiceText} onChange={(e) => setVoiceText(e.target.value)} rows={3} aria-label="語音文字" placeholder="例：喺全家買飯糰同飲品 580 yen，用 Suica" />
              <div className="scan-examples">
                {VOICE_EXAMPLES.map((phrase) => (
                  <button key={phrase} type="button" onClick={() => setVoiceText(phrase)}>{phrase}</button>
                ))}
              </div>
            </div>
          )}

          {mode === 'email' && (
            <div className="scan-sheet">
              <div className="scan-sheet-actions">
                <button className="secondary" type="button" disabled={busy === 'notion' || busy === 'cloud'} onClick={handlePullPending}>
                  <RefreshCw size={18} className={busy === 'notion' || busy === 'cloud' ? 'spin' : ''} aria-hidden="true" /> 即時同步
                </button>
                {!cloudSyncAvailable && (
                  <button className="secondary" type="button" onClick={handleCopyGmail}>
                    <Mail size={18} aria-hidden="true" /> 複製 Gmail
                  </button>
                )}
              </div>
              {cloudSyncAvailable && (
                <p className="muted">雲端帳號唔使用共享 Gmail inbox；請貼上 email 文字或上載截圖，資料只會入你自己帳號。</p>
              )}
              <textarea value={emailText} onChange={(e) => setEmailText(e.target.value)} rows={4} aria-label="Email 文字" placeholder="貼 booking confirmation / email 文字" />
              <div className="scan-sheet-actions">
                <StatefulActionButton className="primary" type="button" disabled={!emailText.trim() || busy === 'email'} onClick={handleEmailParse}>
                  解析文字
                </StatefulActionButton>
                <button className="secondary" type="button" disabled={busy === 'email-image'} onClick={triggerEmailImages}>
                  揀 email 截圖
                </button>
              </div>
            </div>
          )}

          {(lastScanFile || lastDraft) && (
            <div className="scan-last">
              <span>上次掃描：{lastScanFile ? lastScanFile.name : '未有'} · 上次草稿：{lastDraft ? displayStore(lastDraft) || '未命名' : '未有'}</span>
              <button type="button" disabled={!lastScanFile || busy === 'ocr'} onClick={() => handleImage(lastScanFile || undefined, true)}>
                <RefreshCw size={14} aria-hidden="true" /> 重試上一張
              </button>
              <button type="button" disabled={!lastDraft} onClick={() => lastDraft && openDraft(lastDraft)}>
                <Repeat2 size={14} aria-hidden="true" /> 重開上次草稿
              </button>
            </div>
          )}
        </div>

        <section className="scan-ledger" aria-labelledby="scan-ledger-title">
          <header className="scan-ledger-head">
            <h3 id="scan-ledger-title">今日入帳</h3>
            <span>{todayStamps.length} 筆 · <b>{ledgerPrefix}{Math.round(todayTotal).toLocaleString()}</b></span>
          </header>
          {todayStamps.length ? (
            <ul className="scan-stamps">
              {todayStamps.slice(0, STAMP_LIMIT).map((receipt) => {
                const pending = isPendingReceipt(receipt);
                const fresh = (receipt.createdAt || 0) > mountedAtRef.current;
                return (
                  <li key={receipt.id}>
                    <button
                      type="button"
                      className={`scan-stamp scan-stamp--${stampKind(receipt.category)}${pending ? ' is-pending' : ''}${fresh ? ' is-fresh' : ''}`}
                      style={{ '--stamp-tilt': `${stampTilt(receipt.id)}deg` } as CSSProperties}
                      onClick={() => onDraft(receipt)}
                    >
                      <small>{categoryById(receipt.category).name}{receipt.time ? ` · ${receipt.time}` : ''}</small>
                      <strong>{ledgerPrefix}{Math.round(getReceiptTripAmount(receipt, state, ledgerCurrency)).toLocaleString()}</strong>
                      <span>{displayStore(receipt) || '未命名'}</span>
                      {pending && <em>待確認</em>}
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : (
            <div className="scan-stamps-empty">
              <span aria-hidden="true" />
              <p><strong>今日未有入帳</strong>影第一張收據，就會喺呢頁蓋印。</p>
            </div>
          )}
          {todayStamps.length > STAMP_LIMIT && <p className="scan-stamps-more">仲有 {todayStamps.length - STAMP_LIMIT} 筆，喺「紀錄」睇晒。</p>}
        </section>
      </div>

      {status && <Toast tone={/失敗|未能|error/i.test(status) ? 'warning' : 'info'}>{status}</Toast>}
      {fxOpen && (
        <div ref={fxContainerRef} className="modal-backdrop" role="dialog" aria-modal="true" aria-label={fxFixed ? '固定匯率' : '即時匯率'} onClick={() => setFxOpen(false)}>
          <div className="modal sheet scan-fx-modal" onClick={(event) => event.stopPropagation()}>
            <div className="modal-head">
              <div>
                <h2>{fxFixed ? '固定匯率' : '即時匯率'}</h2>
                <p className="muted">{fxFixed ? '用緊你喺設定鎖定嘅匯率，唔會自動更新。' : '呢程即時匯率。'}</p>
              </div>
              <button className="icon-btn" type="button" aria-label="關閉" onClick={() => setFxOpen(false)}><X size={18} /></button>
            </div>
            <div className="scan-fx-result" aria-live="polite">
              <span>{Number(amount) || 0} {from}</span>
              <strong>{(Number(amount) || 0) === 0 ? '輸入金額以計算' : `${converted.toLocaleString(undefined, { maximumFractionDigits: 2 })} ${to}`}</strong>
              <small>{fxFixed ? '固定匯率（設定頁可改）' : fx?.source ? `來源：${fx.source}` : '使用已儲存匯率'}</small>
            </div>
            <div className="scan-fx-panel">
              <label>
                <span>金額</span>
                <input type="text" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
              </label>
              <label>
                <span>From</span>
                <select value={from} onChange={(e) => setFrom(e.target.value)}>
                  {SUPPORTED_CURRENCIES.map((code) => <option key={code} value={code}>{code}</option>)}
                </select>
              </label>
              <button className="scan-fx-swap" type="button" aria-label="調轉貨幣" onClick={() => { setFrom(to); setTo(from); }}>
                <Repeat2 size={20} />
              </button>
              <label>
                <span>To</span>
                <select value={to} onChange={(e) => setTo(e.target.value)}>
                  {SUPPORTED_CURRENCIES.map((code) => <option key={code} value={code}>{code}</option>)}
                </select>
              </label>
            </div>
            <div className="scan-fx-actions">
              <button className="secondary" type="button" onClick={() => { setFrom(tripCurrency); setTo('HKD'); }}>使用旅程貨幣</button>
              {!fxFixed && (
                <button className="primary" type="button" disabled={busy === 'fx'} onClick={handleFxRefresh}>
                  <RefreshCw size={16} className={busy === 'fx' ? 'spin' : ''} /> 更新匯率
                </button>
              )}
            </div>
          </div>
        </div>
      )}
      {batch.length > 0 && (
        <div ref={batchContainerRef} className="modal-backdrop" role="dialog" aria-modal="true" onClick={() => setBatch([])}>
          <div className="modal sheet" onClick={(event) => event.stopPropagation()}>
            <div className="modal-head">
              <div>
                <h2>批次確認</h2>
                <p className="muted">核對 email / 截圖解析結果，未勾選嘅唔會保存。</p>
              </div>
              <button className="icon-btn" type="button" aria-label="關閉" onClick={() => setBatch([])}><X size={18} /></button>
            </div>
            <div className="batch-recovery-bar" aria-label="Batch recovery summary">
              <span><b>{batchQuality.selected}</b> 已選</span>
              <span><b>{batchQuality.complete}</b> 完成</span>
              <span><b>{batchQuality.review}</b> 需補資料</span>
              <button type="button" onClick={selectCompleteBatchRows}>只選完成</button>
              <button type="button" onClick={() => setBatch((rows) => rows.map((row) => ({ ...row, selected: true })))}>全選</button>
            </div>
            <div className="batch-list">
              {batch.map((row) => (
                <div className="batch-item" key={row.id}>
                  <label className="check-row">
                    <input type="checkbox" checked={row.selected !== false} onChange={(e) => updateBatch(row.id, { selected: e.target.checked })} />
                    保存
                  </label>
                  <div className="form-grid">
                    <label>店名<input value={row.store} onChange={(e) => updateBatch(row.id, { store: e.target.value })} /></label>
                    <label>金額<input type="text" inputMode="decimal" value={batchTotalDrafts[row.id] ?? (row.total != null ? String(row.total) : '')} onChange={(e) => setBatchTotalDrafts((drafts) => ({ ...drafts, [row.id]: e.target.value }))} onBlur={() => { const raw = batchTotalDrafts[row.id]; if (raw != null) commitBatchTotal(row.id, raw); }} /></label>
                    <label>日期<input type="date" value={row.date} onChange={(e) => updateBatch(row.id, { date: e.target.value })} /></label>
                    <label>訂單編號<input value={row.bookingRef || ''} onChange={(e) => updateBatch(row.id, { bookingRef: e.target.value })} /></label>
                  </div>
                  <label>備註<textarea rows={2} value={row.note || ''} onChange={(e) => updateBatch(row.id, { note: e.target.value })} /></label>
                </div>
              ))}
            </div>
            <div className="modal-actions">
              <button className="secondary" type="button" onClick={() => setBatch([])}>取消</button>
              <StatefulActionButton className="primary" type="button" disabled={savingBatch} onClick={saveBatch}>全部儲存 ({batch.filter((row) => row.selected !== false).length})</StatefulActionButton>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
