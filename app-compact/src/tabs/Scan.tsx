import { Camera, CheckCircle2, Mail, Mic, RefreshCw, Repeat2, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type CSSProperties } from 'react';
import { ActionRippleButton, GlassCard, NumberTextInput, Reveal, StatefulActionButton, StatusPill, Toast } from '../components/ui';
import { ShimmerButton } from '../components/ui/shimmer-button';
import { heuristicReceiptFromText, parseTextWithAi, scanReceiptImage } from '../lib/ai';
import { convertAmount, fetchLiveCurrencySnapshot, loadCurrencySnapshot, SUPPORTED_CURRENCIES, type CurrencySnapshot } from '../lib/currency';
import { compressPhoto, getResolvedTripCurrency } from '../lib/domain';
import { redactedError } from '../lib/credentialBroker';
import type { AppState, Receipt } from '../lib/types';
import { useModalOpenClass } from '../lib/useModalOpenClass';
import { activeTrip } from '../domain/trip/normalize';
import { resolveTripContext } from '../domain/trip/context';
import scanMasterpieceSuite from '../assets/scan/scan-masterpiece-suite.webp';
import travelAiAtlas from '../assets/atmosphere/travel-ai-atlas.webp';

type ScanMode = 'scan' | 'voice' | 'email';
type BatchReceipt = Receipt & { selected?: boolean };
type NativePhotoSource = 'camera' | 'gallery';
type MockReceiptProfile = {
  currency: string;
  country: string;
  locale: string;
  title: string;
  store: string;
  address: string;
  dateLine: string;
  totalLabel: string;
  total: string;
  taxLine: string;
  paymentLine: string;
};

const MOCK_RECEIPT_LIBRARY: Record<string, MockReceiptProfile> = {
  HKD: { currency: 'HKD', country: 'Hong Kong', locale: 'zh-HK', title: '收 據', store: '海港茶餐廳', address: '香港中環德輔道中 88 號', dateLine: '2026年6月13日 12:45', totalLabel: '合計', total: 'HK$324.00', taxLine: '服務費　　　　　HK$29.45', paymentLine: '八達通　　　　　HK$324.00' },
  JPY: { currency: 'JPY', country: 'Japan', locale: 'ja-JP', title: '領 収 書', store: '桜町商店', address: '東京都千代田区丸の内1-1-1', dateLine: '2026年6月13日（土）12:45', totalLabel: '合計', total: '¥3,240', taxLine: '（内）消費税 10%　¥294', paymentLine: '現金　　　　　　　¥3,240' },
  KRW: { currency: 'KRW', country: 'South Korea', locale: 'ko-KR', title: '영 수 증', store: '동문시장 카페', address: '제주특별자치도 제주시 관덕로 14', dateLine: '2026년 6월 13일 12:45', totalLabel: '합계', total: '₩32,400', taxLine: '부가세 10%　　　₩2,945', paymentLine: '카드결제　　　　 ₩32,400' },
  USD: { currency: 'USD', country: 'United States', locale: 'en-US', title: 'RECEIPT', store: 'Harbor Market', address: '120 Main Street, Seattle WA', dateLine: 'Jun 13, 2026 12:45 PM', totalLabel: 'TOTAL', total: 'US$32.40', taxLine: 'Sales tax　　　　US$2.95', paymentLine: 'Card　　　　　　US$32.40' },
  CAD: { currency: 'CAD', country: 'Canada', locale: 'en-CA', title: 'RECEIPT', store: 'Maple Corner', address: '88 Queen Street, Toronto ON', dateLine: 'Jun 13, 2026 12:45 PM', totalLabel: 'TOTAL', total: 'CA$32.40', taxLine: 'HST　　　　　　CA$2.95', paymentLine: 'Debit　　　　　CA$32.40' },
  AUD: { currency: 'AUD', country: 'Australia', locale: 'en-AU', title: 'RECEIPT', store: 'Harbour Grocer', address: '55 George Street, Sydney NSW', dateLine: '13 Jun 2026 12:45 PM', totalLabel: 'TOTAL', total: 'A$32.40', taxLine: 'GST included　　A$2.95', paymentLine: 'Card　　　　　 A$32.40' },
  NZD: { currency: 'NZD', country: 'New Zealand', locale: 'en-NZ', title: 'RECEIPT', store: 'Koru Cafe', address: '12 Queen Street, Auckland', dateLine: '13 Jun 2026 12:45 PM', totalLabel: 'TOTAL', total: 'NZ$32.40', taxLine: 'GST included　 NZ$2.95', paymentLine: 'Card　　　　　NZ$32.40' },
  GBP: { currency: 'GBP', country: 'United Kingdom', locale: 'en-GB', title: 'RECEIPT', store: 'Garden Lane Deli', address: '42 King Street, London', dateLine: '13 Jun 2026 12:45', totalLabel: 'TOTAL', total: '£32.40', taxLine: 'VAT included　　£2.95', paymentLine: 'Card　　　　　 £32.40' },
  EUR: { currency: 'EUR', country: 'Euro Area', locale: 'fr-FR', title: 'REÇU', store: 'Café Lumière', address: '18 Rue Saint-Honoré, Paris', dateLine: '13 juin 2026 12:45', totalLabel: 'TOTAL', total: '€32,40', taxLine: 'TVA incluse　　 €2,95', paymentLine: 'Carte　　　　　€32,40' },
  CHF: { currency: 'CHF', country: 'Switzerland', locale: 'de-CH', title: 'QUITTUNG', store: 'Alpen Markt', address: 'Bahnhofstrasse 18, Zürich', dateLine: '13.06.2026 12:45', totalLabel: 'TOTAL', total: 'CHF 32.40', taxLine: 'MwSt inkl.　　 CHF 2.95', paymentLine: 'Karte　　　　 CHF 32.40' },
  SEK: { currency: 'SEK', country: 'Sweden', locale: 'sv-SE', title: 'KVITTO', store: 'Nord Café', address: 'Drottninggatan 12, Stockholm', dateLine: '2026-06-13 12:45', totalLabel: 'TOTALT', total: '32,40 kr', taxLine: 'Moms ingår　　 2,95 kr', paymentLine: 'Kort　　　　　32,40 kr' },
  NOK: { currency: 'NOK', country: 'Norway', locale: 'nb-NO', title: 'KVITTERING', store: 'Fjord Bakeri', address: 'Karl Johans gate 20, Oslo', dateLine: '13.06.2026 12:45', totalLabel: 'TOTALT', total: 'kr 32,40', taxLine: 'MVA inkl.　　　kr 2,95', paymentLine: 'Kort　　　　　kr 32,40' },
  DKK: { currency: 'DKK', country: 'Denmark', locale: 'da-DK', title: 'KVITTERING', store: 'Havn Bistro', address: 'Nyhavn 10, København', dateLine: '13.06.2026 12:45', totalLabel: 'TOTAL', total: '32,40 kr.', taxLine: 'Moms inkl.　　 2,95 kr.', paymentLine: 'Kort　　　　　32,40 kr.' },
  SGD: { currency: 'SGD', country: 'Singapore', locale: 'en-SG', title: 'RECEIPT', store: 'Marina Food Hall', address: '10 Bayfront Avenue, Singapore', dateLine: '13 Jun 2026 12:45 PM', totalLabel: 'TOTAL', total: 'S$32.40', taxLine: 'GST included　 S$2.95', paymentLine: 'PayNow　　　　S$32.40' },
  TWD: { currency: 'TWD', country: 'Taiwan', locale: 'zh-TW', title: '統 一 發 票', store: '島嶼咖啡館', address: '台北市中山區南京東路 88 號', dateLine: '2026年06月13日 12:45', totalLabel: '總計', total: 'NT$324', taxLine: '營業稅　　　　　NT$15', paymentLine: '悠遊卡　　　　　NT$324' },
  CNY: { currency: 'CNY', country: 'China', locale: 'zh-CN', title: '销 售 小 票', store: '江南便利店', address: '上海市黄浦区南京东路 88 号', dateLine: '2026年06月13日 12:45', totalLabel: '合计', total: '¥324.00', taxLine: '税额　　　　　　¥29.45', paymentLine: '移动支付　　　　¥324.00' },
  MOP: { currency: 'MOP', country: 'Macau', locale: 'zh-MO', title: '收 據', store: '澳門小食店', address: '澳門新馬路 28 號', dateLine: '2026年06月13日 12:45', totalLabel: '合計', total: 'MOP$324.00', taxLine: '服務費　　　　 MOP$29.45', paymentLine: '澳門通　　　　 MOP$324.00' },
  THB: { currency: 'THB', country: 'Thailand', locale: 'th-TH', title: 'ใบเสร็จรับเงิน', store: 'ตลาดริมคลอง', address: 'ถนนสุขุมวิท กรุงเทพฯ', dateLine: '13 มิ.ย. 2026 12:45', totalLabel: 'รวม', total: '฿324.00', taxLine: 'ภาษี　　　　　฿29.45', paymentLine: 'บัตร　　　　　฿324.00' },
  MYR: { currency: 'MYR', country: 'Malaysia', locale: 'ms-MY', title: 'RESIT', store: 'Kedai Kopi Sentral', address: 'Jalan Bukit Bintang, Kuala Lumpur', dateLine: '13 Jun 2026 12:45 PM', totalLabel: 'JUMLAH', total: 'RM32.40', taxLine: 'Cukai　　　　 RM2.95', paymentLine: 'Kad　　　　　 RM32.40' },
  PHP: { currency: 'PHP', country: 'Philippines', locale: 'en-PH', title: 'RESIBO', store: 'Island Cafe', address: 'Roxas Boulevard, Manila', dateLine: '13 Jun 2026 12:45 PM', totalLabel: 'KABUUAN', total: '₱324.00', taxLine: 'VAT included　 ₱29.45', paymentLine: 'GCash　　　　 ₱324.00' },
  IDR: { currency: 'IDR', country: 'Indonesia', locale: 'id-ID', title: 'STRUK', store: 'Warung Senja', address: 'Jl. Raya Ubud, Bali', dateLine: '13 Jun 2026 12:45', totalLabel: 'TOTAL', total: 'Rp324.000', taxLine: 'PPN termasuk　Rp29.455', paymentLine: 'Kartu　　　　Rp324.000' },
  VND: { currency: 'VND', country: 'Vietnam', locale: 'vi-VN', title: 'HÓA ĐƠN', store: 'Quán Cà Phê Sông', address: 'Quận 1, Thành phố Hồ Chí Minh', dateLine: '13/06/2026 12:45', totalLabel: 'TỔNG', total: '₫324.000', taxLine: 'Thuế　　　　 ₫29.455', paymentLine: 'Thẻ　　　　　₫324.000' },
  INR: { currency: 'INR', country: 'India', locale: 'en-IN', title: 'RECEIPT', store: 'Lotus Canteen', address: 'MG Road, Bengaluru', dateLine: '13 Jun 2026 12:45 PM', totalLabel: 'TOTAL', total: '₹324.00', taxLine: 'GST included　 ₹29.45', paymentLine: 'UPI　　　　　 ₹324.00' },
  AED: { currency: 'AED', country: 'United Arab Emirates', locale: 'ar-AE', title: 'إيصال', store: 'مقهى الميناء', address: 'شارع الشيخ زايد، دبي', dateLine: '13 يونيو 2026 12:45', totalLabel: 'الإجمالي', total: 'AED 32.40', taxLine: 'ضريبة　　　　 AED 2.95', paymentLine: 'بطاقة　　　　 AED 32.40' },
  TRY: { currency: 'TRY', country: 'Türkiye', locale: 'tr-TR', title: 'FİŞ', store: 'Sahil Lokantası', address: 'İstiklal Cd. 18, İstanbul', dateLine: '13.06.2026 12:45', totalLabel: 'TOPLAM', total: '₺324,00', taxLine: 'KDV dahil　　 ₺29,45', paymentLine: 'Kart　　　　　₺324,00' },
  MXN: { currency: 'MXN', country: 'Mexico', locale: 'es-MX', title: 'RECIBO', store: 'Mercado Azul', address: 'Av. Reforma 120, CDMX', dateLine: '13 jun 2026 12:45', totalLabel: 'TOTAL', total: '$324.00 MXN', taxLine: 'IVA incluido　 $29.45', paymentLine: 'Tarjeta　　　 $324.00' },
  BRL: { currency: 'BRL', country: 'Brazil', locale: 'pt-BR', title: 'RECIBO', store: 'Café do Porto', address: 'Rua das Flores 88, São Paulo', dateLine: '13 jun 2026 12:45', totalLabel: 'TOTAL', total: 'R$32,40', taxLine: 'Imposto　　　 R$2,95', paymentLine: 'Cartão　　　 R$32,40' },
  ZAR: { currency: 'ZAR', country: 'South Africa', locale: 'en-ZA', title: 'RECEIPT', store: 'Cape Pantry', address: 'Long Street, Cape Town', dateLine: '13 Jun 2026 12:45 PM', totalLabel: 'TOTAL', total: 'R32.40', taxLine: 'VAT included　 R2.95', paymentLine: 'Card　　　　　R32.40' },
};
const CAMERA_INPUT_ID = 'scan-camera-input';
const GALLERY_INPUT_ID = 'scan-gallery-input';
const EMAIL_IMAGE_INPUT_ID = 'scan-email-image-input';
const scanSuiteStyle = { backgroundImage: `url(${scanMasterpieceSuite})` };
const travelAtlasStyle = { '--travel-ai-atlas': `url(${travelAiAtlas})` } as CSSProperties;

function mockReceiptForTrip(state: AppState): MockReceiptProfile {
  const trip = activeTrip(state);
  const tripCurrency = String(getResolvedTripCurrency(state, trip) || state.tripCurrency || 'JPY').toUpperCase();
  const context = resolveTripContext(trip.destinationSummary || trip.name || '', tripCurrency, trip.intelligence?.countryCode || '');
  const currency = String(context.primaryCurrency || tripCurrency).toUpperCase();
  return MOCK_RECEIPT_LIBRARY[currency] || MOCK_RECEIPT_LIBRARY[tripCurrency] || MOCK_RECEIPT_LIBRARY.JPY;
}

function safeFileStem(file: File): string {
  return file.name
    .replace(/\.[^.]+$/, '')
    .replace(/[<>&"'`]/g, '')
    .replace(/[\u0000-\u001F\u007F]/g, '')
    .trim()
    .slice(0, 120) || '掃描收據';
}

function isNativeAndroidApp(): boolean {
  if (typeof window === 'undefined') return false;
  const capacitor = (window as any).Capacitor;
  const platform = typeof capacitor?.getPlatform === 'function' ? capacitor.getPlatform() : '';
  const native = typeof capacitor?.isNativePlatform === 'function' ? capacitor.isNativePlatform() : false;
  return platform === 'android' && native === true;
}

function nativePhotoMime(format?: string, blobType?: string): string {
  if (blobType) return blobType;
  const normalized = String(format || '').toLowerCase();
  if (normalized === 'png') return 'image/png';
  if (normalized === 'webp') return 'image/webp';
  if (normalized === 'gif') return 'image/gif';
  return 'image/jpeg';
}

function nativePhotoExtension(format?: string, mime?: string): string {
  const normalizedFormat = String(format || '').toLowerCase();
  if (normalizedFormat === 'jpeg') return 'jpg';
  if (normalizedFormat) return normalizedFormat.replace(/[^a-z0-9]/g, '') || 'jpg';
  const normalizedMime = String(mime || '').toLowerCase();
  if (normalizedMime.includes('png')) return 'png';
  if (normalizedMime.includes('webp')) return 'webp';
  if (normalizedMime.includes('gif')) return 'gif';
  return 'jpg';
}

// Crash-recovery slot for a native capture in flight (cleared on completion/cancel). If Android kills
// the app during the fetch/OCR window — the multi-second network call where a low-RAM device is most
// likely to be reaped — the next Scan mount resumes from the on-disk cache file instead of silently
// dropping the receipt.
const PENDING_SCAN_KEY = 'travel-expense:pending-native-scan';

async function nativePhotoToFile(
  photo: { webPath?: string; format?: string },
  source: NativePhotoSource,
): Promise<File> {
  if (!photo.webPath) throw new Error('Native photo did not include a webPath');
  const response = await fetch(photo.webPath);
  if (!response.ok && response.status !== 0) throw new Error(`Native photo fetch failed (${response.status})`);
  const blob = await response.blob();
  const mime = nativePhotoMime(photo.format, blob.type);
  const ext = nativePhotoExtension(photo.format, mime);
  return new File([blob], `android-${source}-${Date.now()}.${ext}`, { type: mime });
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
  const mockReceipt = useMemo(() => mockReceiptForTrip(state), [state]);
  const [from, setFrom] = useState(mockReceipt.currency);
  const [to, setTo] = useState('HKD');
  const [amount, setAmount] = useState('1000');
  const [fx, setFx] = useState<CurrencySnapshot | null>(() => loadCurrencySnapshot());
  const fxAutoRefreshRef = useRef(false);
  const stateRef = useRef(state);
  stateRef.current = state;

  useEffect(() => {
    setFrom((current) => current || mockReceipt.currency);
  }, [mockReceipt.currency]);

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

  useEffect(() => {
    if (!fxOpen || fxAutoRefreshRef.current) return;
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

  const handleImage = useCallback(async (file?: File, retry = false) => {
    if (!file) {
      setStatus('未收到圖片。相機無彈出時，請試相簿或手動記一筆。');
      return;
    }
    // Guard oversized images: decoding a huge file can OOM a low-RAM phone's WebView.
    const MAX_IMAGE_BYTES = 25 * 1024 * 1024;
    if (file.size > MAX_IMAGE_BYTES) {
      setStatus(`圖片太大（${(file.size / 1024 / 1024).toFixed(1)}MB），請揀細過 25MB 嘅相。`);
      return;
    }
    if (!retry) setLastScanFile(file);
    setBusyWithGlobal('ocr');
    setStatus('讀取收據圖片…');
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

    try {
      const receipt = await scanReceiptImage(file, stateRef.current);
      openDraft(receipt);
      if (mountedRef.current) setStatus('OCR 完成，請確認欄位。');
    } catch (error) {
      const draft = {
        ...heuristicReceiptFromText(file.name, stateRef.current),
        store: safeFileStem(file),
        note: `OCR 未完成：${redactedError(error)}`,
        source: 'react-ocr-manual',
        photoThumb: localThumb,
      };
      openDraft(draft);
      if (mountedRef.current) setStatus('未能自動 OCR，已開啟 React 確認表俾你手動補資料。');
    } finally {
      if (mountedRef.current) setBusy('');
      onBusyChange?.('');
    }
  }, [openDraft, setBusyWithGlobal, onBusyChange]);

  const tryNativeAndroidPhoto = useCallback(async (source: NativePhotoSource): Promise<boolean> => {
    if (!isNativeAndroidApp()) return false;
    const sourceLabel = source === 'camera' ? '相機' : '相簿';
    const capacitor = (window as typeof window & { Capacitor?: { isLoggingEnabled?: boolean } }).Capacitor;
    const nativeLogging = capacitor?.isLoggingEnabled;
    try {
      const { Camera: CapacitorCamera, CameraResultType, CameraSource } = await import('@capacitor/camera');
      // ponytail: Capacitor logs plugin rejects before this catch; silence only the picker bridge call.
      if (capacitor && typeof nativeLogging === 'boolean') capacitor.isLoggingEnabled = false;
      setStatus(`開啟 Android ${sourceLabel}…`);
      const photo = await CapacitorCamera.getPhoto({
        quality: 88,
        // Downscale at the native layer so the WebView never decodes a full 12MP bitmap (~48MB RGBA)
        // into JS heap → avoids GC stalls / OOM-kill mid-scan on low-RAM devices. OCR upload is capped
        // at 2016px downstream (prepareForOCR), so 1600 here loses no recognition accuracy.
        width: 1600,
        allowEditing: false,
        correctOrientation: true,
        resultType: CameraResultType.Uri,
        source: source === 'camera' ? CameraSource.Camera : CameraSource.Photos,
        saveToGallery: false,
      });
      // Mark this capture pending before the fetch/OCR window so an app-kill mid-flight can recover it.
      try { localStorage.setItem(PENDING_SCAN_KEY, JSON.stringify({ webPath: photo.webPath, source, ts: Date.now() })); } catch { /* quota — recovery is best-effort */ }
      const file = await nativePhotoToFile(photo, source);
      await handleImage(file);
      try { localStorage.removeItem(PENDING_SCAN_KEY); } catch { /* ignore */ }
      return true;
    } catch (error) {
      // Cancel / fetch-fail are not process kills — drop the pending slot so we don't pointlessly resume.
      try { localStorage.removeItem(PENDING_SCAN_KEY); } catch { /* ignore */ }
      if (capacitor && typeof nativeLogging === 'boolean') capacitor.isLoggingEnabled = nativeLogging;
      const message = typeof error === 'object' && error && 'message' in error
        ? String((error as { message?: unknown }).message || '')
        : redactedError(error);
      if (/cancel|cancelled|canceled|dismiss|abort|user/i.test(message)) {
        if (mountedRef.current) setStatus('已取消選擇圖片。');
        return true;
      }
      console.warn('Native Android photo selection failed:', redactedError(error));
      if (mountedRef.current) setStatus(`Android ${sourceLabel}未能啟動，改用系統選擇器。`);
      return false;
    } finally {
      if (capacitor && typeof nativeLogging === 'boolean') capacitor.isLoggingEnabled = nativeLogging;
    }
  }, [handleImage]);

  // Resume a capture interrupted by an app-kill mid-OCR (see PENDING_SCAN_KEY). The Uri-result webPath
  // points at the on-disk cache file, which survives a restart, so we can re-fetch and re-run OCR.
  useEffect(() => {
    if (!isNativeAndroidApp()) return;
    let raw: string | null = null;
    try { raw = localStorage.getItem(PENDING_SCAN_KEY); } catch { return; }
    if (!raw) return;
    let pending: { webPath?: string; source?: NativePhotoSource; ts?: number };
    try { pending = JSON.parse(raw); } catch { try { localStorage.removeItem(PENDING_SCAN_KEY); } catch { /* ignore */ } return; }
    const stale = !pending?.webPath || (pending.ts ? Date.now() - pending.ts > 600_000 : false);
    if (stale) { try { localStorage.removeItem(PENDING_SCAN_KEY); } catch { /* ignore */ } return; }
    void (async () => {
      try {
        if (mountedRef.current) setStatus('正在恢復上次未完成嘅掃描…');
        const file = await nativePhotoToFile({ webPath: pending.webPath }, pending.source || 'camera');
        await handleImage(file);
      } catch {
        if (mountedRef.current) setStatus('上次掃描嘅相已失效，請重新影一次。');
      } finally {
        try { localStorage.removeItem(PENDING_SCAN_KEY); } catch { /* ignore */ }
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
    if (busy === 'ocr') return;
    void (async () => {
      const handled = await tryNativeAndroidPhoto('camera');
      if (!handled && mountedRef.current) cameraRef.current?.click();
    })();
  }, [busy, tryNativeAndroidPhoto]);

  const triggerGallery = useCallback(() => {
    setMode('scan');
    setInputKey((k) => k + 1);
    if (busy === 'ocr') return;
    void (async () => {
      const handled = await tryNativeAndroidPhoto('gallery');
      if (!handled && mountedRef.current) galleryRef.current?.click();
    })();
  }, [busy, tryNativeAndroidPhoto]);

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
      const nativeAndroid = /Android/i.test(navigator.userAgent)
        && !!(window as any).Capacitor?.isNativePlatform?.();
      setStatus(nativeAndroid
        ? 'Android App 內置 WebView 唔支援語音識別，請用鍵盤輸入或直接貼文字。'
        : '呢個瀏覽器唔支援 Web Speech API，可以直接貼語音文字。');
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

  function selectCompleteBatchRows() {
    setBatch((rows) => rows.map((row) => ({ ...row, selected: !receiptNeedsReview(row) })));
  }

  function saveBatch() {
    if (savingBatch) return;
    const selected = batch.filter((row) => row.selected !== false).map(({ selected: _selected, ...receipt }) => receipt);
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
    setBusy('fx');
    try {
      const snapshot = await fetchLiveCurrencySnapshot();
      if (!mountedRef.current) return;
      setFx(snapshot);
      const destinationRate = snapshot.rates[from] || snapshot.rates[mockReceipt.currency];
      setStatus(destinationRate ? `已更新匯率：1 HKD = ${destinationRate.toFixed(2)} ${from}（${snapshot.source}）` : `已更新匯率（${snapshot.source}）`);
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
    <section className="japanese-washi-bg w-full min-h-screen px-4 pb-28 pt-6 relative overflow-y-auto scan-screen" style={travelAtlasStyle}>
      <div className="japanese-sun-decor" />
      <div className="japanese-sakura-decor" />
      <div className="stack w-full relative z-10">
        <input key={`camera-${inputKey}`} id={CAMERA_INPUT_ID} ref={cameraRef} className="visually-hidden-file" type="file" accept="image/*" capture="environment" onChange={handleCameraChange} />
      <input key={`gallery-${inputKey}`} id={GALLERY_INPUT_ID} ref={galleryRef} className="visually-hidden-file" type="file" accept="image/*" onChange={handleGalleryChange} />
      <input key={`email-${inputKey}`} id={EMAIL_IMAGE_INPUT_ID} ref={emailImageRef} className="visually-hidden-file" type="file" accept="image/*" multiple onChange={handleEmailImagesChange} />

      <Reveal className="scan-reveal">
      <GlassCard className="scan-hero-card relative overflow-hidden p-6 sm:p-8 rounded-[40px] border-[2px] border-white shadow-[0_20px_60px_-15px_rgba(0,0,0,0.15),inset_0_0_40px_rgba(255,255,255,1)] bg-white/50 backdrop-blur-3xl mb-6">
        <div className="absolute inset-0 bg-gradient-to-br from-white/80 via-white/50 to-transparent backdrop-blur-lg" />
        <div className="absolute inset-0 bg-white/50 opacity-90 mix-blend-overlay rounded-[40px] shadow-[inset_0_0_30px_rgba(255,255,255,1)] pointer-events-none" />

        <div className="relative z-10 flex justify-between items-center mb-6">
          <h2 className="text-3xl font-black text-black tracking-tight flex items-center gap-3 drop-shadow-sm">
            <Camera size={32} className="text-blue-600" />
            掃描收據 📸
          </h2>
          <StatusPill tone={busy ? 'warning' : 'ok'} icon={busy ? <RefreshCw size={14} className="spin text-slate-800" /> : <CheckCircle2 size={14} className="text-slate-800" />}>
            {busy || 'ready'}
          </StatusPill>
        </div>

        <div className="preview-scan-ai-strip relative z-10">
          <span>AI 辨識中：自動擷取金額 · 店家 · 日期 · 類別</span>
          <b>支援 18 種語言 · 多幣別</b>
        </div>

        <div
          className="preview-scan-camera relative z-10 overflow-hidden cursor-pointer"
          aria-label="收據取景框"
          onClick={triggerCamera}
          style={{ cursor: 'pointer' }}
        >
          {/* Laser scanning line */}
          <div className="scan-laser-line" />
          
          {/* AI bounding boxes simulated indicators */}
          <div className="scan-bounding-box box-1" />
          <div className="scan-bounding-box box-2" />

          <div className="preview-crop-corner preview-crop-corner--tl" aria-hidden="true" />
          <div className="preview-crop-corner preview-crop-corner--tr" aria-hidden="true" />
          <div className="preview-crop-corner preview-crop-corner--bl" aria-hidden="true" />
          <div className="preview-crop-corner preview-crop-corner--br" aria-hidden="true" />
          <div className="preview-receipt-paper" data-locale={mockReceipt.locale} aria-label={`${mockReceipt.country} ${mockReceipt.currency} mock receipt`}>
            <b>{mockReceipt.title}</b>
            <span>{mockReceipt.store}</span>
            <small>{mockReceipt.address}</small>
            <small>{mockReceipt.dateLine}</small>
            <i />
            <strong><span>{mockReceipt.totalLabel}</span><span>{mockReceipt.total}</span></strong>
            <small>{mockReceipt.taxLine}</small>
            <small>{mockReceipt.paymentLine}</small>
          </div>
        </div>

        <div className="preview-scan-tip relative z-10">
          <span>將收據置於框內以獲得最佳辨識效果</span>
          <b>自動拍攝：開啟</b>
        </div>

        {/* MAIN SCAN MODES GRID */}
        <div className="relative z-10 grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
          {/* CAMERA HERO BUTTON - Large & Prominent */}
          <ShimmerButton
            type="button"
            disabled={busy === 'ocr'}
            className={`scan-hero-button col-span-1 sm:col-span-2 relative overflow-hidden p-5 min-h-[140px] rounded-[28px] bg-gradient-to-r from-blue-600 via-indigo-600 to-indigo-700 text-white shadow-xl hover:shadow-2xl hover:scale-[1.01] active:scale-98 transition-all cursor-pointer whitespace-normal ${busy === 'ocr' ? 'opacity-50 cursor-not-allowed' : ''}`}
            onClick={triggerCamera}
            background="linear-gradient(110deg,#2563eb,#4f46e5,#312e81)"
            borderRadius="28px"
            shimmerDuration="3.8s"
          >
            <div className="absolute inset-0 bg-white/10 opacity-30 pointer-events-none" />
            <div className="scan-hero-copy scan-card-copy flex flex-col gap-1 items-center text-center relative z-10 min-w-0">
              <strong className="text-xl sm:text-2xl font-black tracking-tight leading-tight mt-0.5">相機</strong>
              <span className="text-[10px] font-bold uppercase tracking-widest text-blue-200">Camera</span>
            </div>
            <div className="scan-banana-visual scan-function-art scan-function-art--camera" style={scanSuiteStyle} aria-hidden="true">
            </div>
          </ShimmerButton>

          {/* GALLERY SECONDARY BUTTON - Medium & Elegant */}
          <button
            type="button"
            disabled={busy === 'ocr'}
            className={`scan-secondary-button col-span-1 flex flex-col items-center justify-center gap-3 p-5 min-h-[140px] rounded-[28px] bg-white/70 backdrop-blur-xl border border-white/90 shadow-lg hover:bg-white/90 hover:scale-[1.01] active:scale-98 transition-all cursor-pointer ${busy === 'ocr' ? 'opacity-50 cursor-not-allowed' : ''}`}
            onClick={triggerGallery}
          >
            <span className="scan-function-art scan-function-art--gallery" style={scanSuiteStyle} aria-hidden="true" />
            <div className="scan-card-copy flex flex-col items-center">
              <strong className="text-base font-black text-slate-800">相簿</strong>
              <span className="text-[11px] text-slate-400 font-medium mt-0.5">Gallery</span>
            </div>
          </button>
        </div>

        <button
          type="button"
          className="scan-fx-wide-button relative z-10 mb-6"
          aria-label="匯率 Exchange Rate"
          onClick={() => setFxOpen(true)}
        >
          <span className="scan-function-art scan-function-art--currency" style={scanSuiteStyle} aria-hidden="true" />
          <span>
            <strong>匯率</strong>
            <small>Exchange Rate</small>
          </span>
          <b>{from} → {to}</b>
        </button>

        {/* OTHER UTILITY MODES GRID */}
        <div className="relative z-10 grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
          <button
            type="button"
            onClick={onManual}
            aria-label="手動"
            className="scan-utility-button flex flex-row items-center gap-3 p-3 rounded-2xl bg-white/60 backdrop-blur-xl border border-white/80 shadow-sm hover:bg-white/80 active:scale-95 transition-all cursor-pointer"
          >
            <span className="scan-function-art scan-function-art--manual" style={scanSuiteStyle} aria-hidden="true" />
            <div className="scan-card-copy scan-utility-copy flex flex-col items-start text-left">
              <strong className="text-xs font-black text-slate-800">手動記帳</strong>
              <span className="text-[9px] text-slate-400 font-bold uppercase mt-0.5">Manual Entry</span>
            </div>
          </button>

          <button
            type="button"
            onClick={() => setMode('voice')}
            aria-label="語音"
            className={`scan-utility-button flex flex-row items-center gap-3 p-3 rounded-2xl bg-white/60 backdrop-blur-xl border border-white/80 shadow-sm hover:bg-white/80 active:scale-95 transition-all cursor-pointer ${mode === 'voice' ? 'ring-2 ring-blue-500 bg-white/80' : ''}`}
          >
            <span className="scan-function-art scan-function-art--voice" style={scanSuiteStyle} aria-hidden="true" />
            <div className="scan-card-copy scan-utility-copy flex flex-col items-start text-left">
              <strong className="text-xs font-black text-slate-800">語音</strong>
              <span className="text-[9px] text-slate-400 font-bold uppercase mt-0.5">Voice</span>
            </div>
          </button>

          <button
            type="button"
            onClick={() => setMode('email')}
            aria-label="Email"
            className={`scan-utility-button flex flex-row items-center gap-3 p-3 rounded-2xl bg-white/60 backdrop-blur-xl border border-white/80 shadow-sm hover:bg-white/80 active:scale-95 transition-all cursor-pointer ${mode === 'email' ? 'ring-2 ring-blue-500 bg-white/80' : ''}`}
          >
            <span className="scan-function-art scan-function-art--email" style={scanSuiteStyle} aria-hidden="true" />
            <div className="scan-card-copy scan-utility-copy flex flex-col items-start text-left">
              <strong className="text-xs font-black text-slate-800">Email</strong>
              <span className="text-[9px] text-slate-400 font-bold uppercase mt-0.5">Email</span>
            </div>
          </button>

        </div>

        {/* Embedded Workspaces */}
        <div className="scan-workspace relative z-10 w-full overflow-hidden transition-all duration-300">
          {mode === 'scan' && (lastScanFile || lastDraft) && (
            <div className="scan-retry-panel p-4 bg-white/50 rounded-2xl border border-white/70 shadow-sm">
              <div className="flex gap-2 flex-wrap mb-2">
                <ActionRippleButton className="secondary bg-white text-black" type="button" disabled={!lastScanFile || busy === 'ocr'} onClick={() => handleImage(lastScanFile || undefined, true)}>
                  <RefreshCw size={16} /> 重試上一張
                </ActionRippleButton>
                <ActionRippleButton className="secondary bg-white text-black" type="button" disabled={!lastDraft} onClick={() => lastDraft && openDraft(lastDraft)}>
                  <Repeat2 size={16} /> 重開上次草稿
                </ActionRippleButton>
              </div>
              <div className="text-xs text-slate-600 flex flex-col gap-1">
                <span>Last scan: {lastScanFile ? lastScanFile.name : '未有'}</span>
                <span>Last draft: {lastDraft ? lastDraft.store || '未命名' : '未有'}</span>
              </div>
            </div>
          )}

          {mode === 'voice' && (
            <div className="p-4 bg-white/50 rounded-2xl border border-white/70 shadow-sm flex flex-col gap-3">
              <div className="flex gap-2">
                <button className="secondary bg-white text-black flex-1 font-bold" type="button" onClick={startSpeech} disabled={isListening}><Mic size={18} className={isListening ? 'animate-pulse' : ''} /> {isListening ? '聆聽中…' : '開始聽'}</button>
                <StatefulActionButton className="primary voice-sparkle-btn flex-1 font-bold shadow-md" type="button" disabled={!voiceText.trim() || busy === 'voice'} onClick={handleVoiceParse}>解析</StatefulActionButton>
              </div>
              <textarea className="bg-white/80 border-white/60 rounded-xl p-3 text-black font-medium" value={voiceText} onChange={(e) => setVoiceText(e.target.value)} rows={3} placeholder="例：喺全家買飯糰同飲品 580 yen，用 Suica" />
              <div className="flex flex-wrap gap-1.5 mt-1">
                {['Lawson 買三文治 420 yen', '名古屋城門票 1000 yen', '鰻魚飯三吃 4800 yen', '地鐵 Suica 增值 2000 yen'].map((phrase) => (
                  <span
                    key={phrase}
                    onClick={() => setVoiceText(phrase)}
                    className="text-[10px] font-semibold bg-white/60 hover:bg-white border border-white/85 rounded-full px-2.5 py-1 cursor-pointer text-slate-700 transition-all active:scale-95"
                  >
                    💬 {phrase}
                  </span>
                ))}
              </div>
            </div>
          )}

          {mode === 'email' && (
            <div className="p-4 bg-white/50 rounded-2xl border border-white/70 shadow-sm flex flex-col gap-3">
              <div className="flex gap-2">
                <button className="secondary bg-white text-black flex-1 font-bold" type="button" disabled={busy === 'notion'} onClick={handlePullPending}>
                  <RefreshCw size={18} className={busy === 'notion' ? 'spin' : ''} /> 即時同步
                </button>
                {!cloudSyncAvailable && (
                  <button className="secondary bg-white text-black flex-1 font-bold" type="button" onClick={handleCopyGmail}>
                    <Mail size={18} /> 複製 Gmail
                  </button>
                )}
              </div>
              {cloudSyncAvailable && (
                <p className="muted">Public Supabase mode 不使用共享 Gmail inbox；請貼上 email 文字或上載截圖，資料只會入你自己帳號。</p>
              )}
              <textarea className="bg-white/80 border-white/60 rounded-xl p-3 text-black font-medium" value={emailText} onChange={(e) => setEmailText(e.target.value)} rows={4} placeholder="貼 booking confirmation / email 文字" />
              <div className="flex gap-2">
                <StatefulActionButton className="primary flex-1 font-bold shadow-md" type="button" disabled={!emailText.trim() || busy === 'email'} onClick={handleEmailParse}>
                  解析文字
                </StatefulActionButton>
                <button className={`secondary bg-white text-black button-like scan-picker-label flex-1 text-center font-bold shadow-sm ${busy === 'email-image' ? 'opacity-50' : ''}`} type="button" disabled={busy === 'email-image'} onClick={triggerEmailImages}>
                  揀 email 截圖
                </button>
              </div>
            </div>
          )}
        </div>
      </GlassCard>
      </Reveal>

      {status && <Toast tone={/失敗|未能|error/i.test(status) ? 'warning' : 'info'}>{status}</Toast>}
      {fxOpen && (
        <div ref={fxContainerRef} className="modal-backdrop" role="dialog" aria-modal="true" aria-label="即時匯率" onClick={() => setFxOpen(false)}>
          <div className="modal sheet scan-fx-modal" onClick={(event) => event.stopPropagation()}>
            <div className="modal-head">
              <div>
                <h2>即時匯率</h2>
                <p className="muted">Live currency exchange for this trip.</p>
              </div>
              <button className="icon-btn" type="button" aria-label="關閉" onClick={() => setFxOpen(false)}><X size={18} /></button>
            </div>
            <div className="scan-fx-result" aria-live="polite">
              <span>{Number(amount) || 0} {from}</span>
              <strong>{converted == null ? '需要更新匯率' : (Number(amount) || 0) === 0 ? '輸入金額以計算' : `${converted.toLocaleString(undefined, { maximumFractionDigits: 2 })} ${to}`}</strong>
              <small>{fx?.source ? `Source: ${fx.source}` : 'Using saved or fallback app rates'}</small>
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
              <button className="secondary" type="button" onClick={() => { setFrom(mockReceipt.currency); setTo('HKD'); }}>使用旅程貨幣</button>
              <button className="primary" type="button" disabled={busy === 'fx'} onClick={handleFxRefresh}>
                <RefreshCw size={16} className={busy === 'fx' ? 'spin' : ''} /> 更新匯率
              </button>
            </div>
          </div>
        </div>
      )}
      {batch.length > 0 && (
        <div ref={batchContainerRef} className="modal-backdrop" role="dialog" aria-modal="true" onClick={() => setBatch([])}>
          <div className="modal sheet" onClick={(event) => event.stopPropagation()}>
            <div className="modal-head">
              <div>
                <h2>Batch Confirm</h2>
                <p className="muted">核對 email / 截圖解析結果，未勾選嘅唔會保存。</p>
              </div>
              <button className="icon-btn" type="button" aria-label="關閉" onClick={() => setBatch([])}>×</button>
            </div>
            <div className="batch-recovery-bar" aria-label="Batch recovery summary">
              <span><b>{batchQuality.selected}</b> selected</span>
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
                    <label>金額<NumberTextInput value={row.total} max={1_000_000_000} blankZero onValue={(n) => updateBatch(row.id, { total: n })} /></label>
                    <label>日期<input type="date" value={row.date} onChange={(e) => updateBatch(row.id, { date: e.target.value })} /></label>
                    <label>Booking Ref<input value={row.bookingRef || ''} onChange={(e) => updateBatch(row.id, { bookingRef: e.target.value })} /></label>
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
      </div>
    </section>
  );
}
