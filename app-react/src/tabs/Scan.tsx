import { Camera, CheckCircle2, FileImage, FileText, Mail, Mic, RefreshCw, Repeat2 } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import { ActionRippleButton, GlassCard, Reveal, StatefulActionButton, StatusPill, Toast } from '../components/ui';
import { ShimmerButton } from '../components/ui/shimmer-button';
import { heuristicReceiptFromText, parseTextWithAi, scanReceiptImage } from '../lib/ai';
import { convertAmount, fetchLiveCurrencySnapshot, loadCurrencySnapshot, SUPPORTED_CURRENCIES, type CurrencySnapshot } from '../lib/currency';
import { compressPhoto } from '../lib/domain';
import type { AppState, Receipt } from '../lib/types';
import nanoBanana2Image from '../assets/nano_banana_2.png';
import scanMasterpieceSuite from '../assets/scan/scan-masterpiece-suite.png';

type ScanMode = 'scan' | 'voice' | 'email' | 'currency';
const CAMERA_INPUT_ID = 'scan-camera-input';
const GALLERY_INPUT_ID = 'scan-gallery-input';
const EMAIL_IMAGE_INPUT_ID = 'scan-email-image-input';
const scanSuiteStyle = { backgroundImage: `url(${scanMasterpieceSuite})` };

function safeFileStem(file: File): string {
  return file.name
    .replace(/\.[^.]+$/, '')
    .replace(/[<>&"'`]/g, '')
    .replace(/[\u0000-\u001F\u007F]/g, '')
    .trim()
    .slice(0, 120) || '掃描收據';
}

export function Scan({
  onManual,
  onDraft,
  onImport,
  onPull,
  cloudSyncAvailable = false,
  state,
}: {
  onManual: () => void;
  onDraft: (receipt: Receipt) => void;
  onImport: (receipts: Receipt[]) => void;
  onPull?: () => Promise<void>;
  cloudSyncAvailable?: boolean;
  state: AppState;
}) {
  const cameraRef = useRef<HTMLInputElement | null>(null);
  const galleryRef = useRef<HTMLInputElement | null>(null);
  const emailImageRef = useRef<HTMLInputElement | null>(null);
  const speechRef = useRef<any>(null);
  const mountedRef = useRef(true);
  const [busy, setBusy] = useState('');
  const [status, setStatus] = useState('');
  const [voiceText, setVoiceText] = useState('');
  const [emailText, setEmailText] = useState('');
  const [batch, setBatch] = useState<Array<Receipt & { selected?: boolean }>>([]);
  const [savingBatch, setSavingBatch] = useState(false);
  const [mode, setMode] = useState<ScanMode>('scan');
  const [inputKey, setInputKey] = useState(0);
  const [lastScanFile, setLastScanFile] = useState<File | null>(null);
  const [lastDraft, setLastDraft] = useState<Receipt | null>(null);
  const [from, setFrom] = useState('JPY');
  const [to, setTo] = useState('HKD');
  const [amount, setAmount] = useState('1000');
  const [fx, setFx] = useState<CurrencySnapshot | null>(() => loadCurrencySnapshot());
  const rate = Math.max(0.1, Number(state.rate) || 20.36);

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

  useEffect(() => {
    document.documentElement.classList.toggle('modal-open', batch.length > 0);
    return () => document.documentElement.classList.remove('modal-open');
  }, [batch.length]);

  const converted = useMemo(() => {
    const n = Number(amount) || 0;
    return convertAmount(n, from, to, state, fx);
  }, [amount, from, to, state, fx]);

  const openDraft = useCallback((receipt: Receipt) => {
    setLastDraft(receipt);
    onDraft(receipt);
  }, [onDraft]);

  const handleImage = useCallback(async (file?: File, retry = false) => {
    if (!file) {
      setStatus('未收到圖片。相機無彈出時，請試相簿或手動記一筆。');
      return;
    }
    if (file.size > 5_000_000) {
      setStatus('圖片太大（超過 5MB），請先壓縮。');
      return;
    }
    if (!retry) setLastScanFile(file);
    setBusy('ocr');
    setStatus('讀取收據圖片…');
    let localThumb: string | undefined = undefined;
    try {
      // Pre-compress photo to avoid losing it on OCR failure
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
      const receipt = await scanReceiptImage(file, state);
      if (!mountedRef.current) return;
      openDraft(receipt);
      setStatus('OCR 完成，請確認欄位。');
    } catch (error) {
      if (!mountedRef.current) return;
      const draft = {
        ...heuristicReceiptFromText(file.name, state),
        store: safeFileStem(file),
        note: `OCR 未完成：${error instanceof Error ? error.message : String(error)}`,
        source: 'react-ocr-manual',
        photoThumb: localThumb,
      };
      openDraft(draft);
      setStatus('未能自動 OCR，已開啟 React 確認表俾你手動補資料。');
    } finally {
      if (mountedRef.current) setBusy('');
    }
  }, [openDraft, state]);

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
    setBusy('voice');
    try {
      const receipts = await parseTextWithAi(voiceText, state, 'react-voice');
      if (!mountedRef.current) return;
      if (!receipts?.length) {
        setStatus('解析不到任何收據');
        return;
      }
      openDraft(receipts[0]);
      setStatus('語音文字已解析，請確認欄位。');
    } catch (error) {
      if (!mountedRef.current) return;
      setStatus(`語音解析失敗：${error instanceof Error ? error.message : String(error)}`);
    } finally {
      if (mountedRef.current) setBusy('');
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
      setStatus(`語音失敗：${event.error || 'unknown'}`);
    };
    rec.onend = () => {
      if (speechRef.current === rec) speechRef.current = null;
    };
    speechRef.current = rec;
    rec.start();
  }

  async function handleEmailParse() {
    if (!emailText.trim()) return;
    setBusy('email');
    try {
      const receipts = await parseTextWithAi(emailText, state, 'react-email');
      if (!mountedRef.current) return;
      if (!receipts?.length) {
        setStatus('解析不到任何收據');
        return;
      }
      setBatch(receipts.map((r) => ({ ...r, store: r.store.startsWith('⏳ ') ? r.store : `⏳ ${r.store}`, selected: true })));
      setStatus(`已解析 ${receipts.length} 筆，請喺 batch confirm 核對。`);
    } catch (error) {
      if (!mountedRef.current) return;
      setStatus(`Email 解析失敗：${error instanceof Error ? error.message : String(error)}`);
    } finally {
      if (mountedRef.current) setBusy('');
    }
  }

  const handleEmailImages = useCallback(async (files?: Iterable<File> | null) => {
    const list = Array.from(files || []);
    if (!list.length) return;
    setBusy('email-image');
    setStatus(`解析 ${list.length} 張 email 截圖…`);
    try {
      const receipts: Receipt[] = [];
      for (const file of list) {
        if (file.size > 5_000_000) {
          if (mountedRef.current) setStatus('圖片太大（超過 5MB），請先壓縮。');
          continue;
        }
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
            note: `Error: ${error instanceof Error ? error.message : String(error)}`,
            source: 'react-email-image',
            photoThumb: localThumb,
            createdAt: Date.now(),
          } as Receipt);
        }
      }
      if (!mountedRef.current) return;
      setBatch(receipts.map((r) => ({ ...r, source: 'react-email-image', store: r.store.startsWith('⏳ ') ? r.store : `⏳ ${r.store}`, selected: true })));
      setStatus(`已解析 ${receipts.length} 筆截圖，請核對後保存。`);
    } catch (error) {
      if (!mountedRef.current) return;
      setStatus(`截圖解析失敗：${error instanceof Error ? error.message : String(error)}`);
    } finally {
      if (mountedRef.current) {
        setBusy('');
        window.setTimeout(() => {
          if (mountedRef.current) setInputKey((key) => key + 1);
        }, 100);
      }
    }
  }, [state]);

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

  function updateBatch(id: string, patch: Partial<Receipt & { selected?: boolean }>) {
    setBatch((rows) => rows.map((row) => (row.id === id ? { ...row, ...patch } : row)));
  }

  function saveBatch() {
    if (savingBatch) return;
    setSavingBatch(true);
    const selected = batch.filter((row) => row.selected !== false).map(({ selected: _selected, ...receipt }) => receipt);
    onImport(selected);
    setBatch([]);
    setEmailText('');
    setStatus(`已儲存 ${selected.length} 筆 email 待確認紀錄。`);
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
      setStatus(`雲端同步失敗：${error instanceof Error ? error.message : String(error)}`);
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
      setStatus(`已更新匯率：1 HKD = ${snapshot.rates.JPY.toFixed(2)} JPY（${snapshot.source}）`);
    } catch (error) {
      if (!mountedRef.current) return;
      setStatus(`匯率更新失敗：${error instanceof Error ? error.message : String(error)}`);
    } finally {
      if (mountedRef.current) setBusy('');
    }
  }

  return (
    <section className="japanese-washi-bg w-full min-h-screen px-4 pb-28 pt-6 relative overflow-y-auto scan-screen">
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
            <div className="scan-hero-copy flex flex-col gap-1 items-start text-left relative z-10 min-w-0">
              <span className="text-[10px] font-bold uppercase tracking-widest text-blue-200">Receipt Scanner</span>
              <strong className="text-xl sm:text-2xl font-black tracking-tight leading-tight mt-0.5">相機智能辨識收據 📸</strong>
              <p className="text-[11px] text-blue-100/90 mt-1 font-medium leading-snug">打開相機直接拍攝收據，AI 自動為你讀取金額、店名與明細。</p>
            </div>
            <div className="scan-banana-visual scan-function-art scan-function-art--camera" style={scanSuiteStyle} aria-hidden="true">
              <span className="scan-banana-orbit">
                <img src={nanoBanana2Image} alt="" className="w-full h-full object-contain p-1" />
              </span>
            </div>
          </ShimmerButton>

          {/* GALLERY SECONDARY BUTTON - Medium & Elegant */}
          <button
            type="button"
            disabled={busy === 'ocr'}
            className={`scan-secondary-button col-span-1 flex flex-col items-center justify-center gap-3 p-5 min-h-[140px] rounded-[28px] bg-white/70 backdrop-blur-xl border border-white/90 shadow-lg hover:bg-white/90 hover:scale-[1.01] active:scale-98 transition-all cursor-pointer ${busy === 'ocr' ? 'opacity-50 cursor-not-allowed' : ''}`}
            onClick={triggerGallery}
          >
            <span className="scan-function-art scan-function-art--gallery" style={scanSuiteStyle} aria-hidden="true">
              <FileImage size={24} />
            </span>
            <div className="flex flex-col items-center">
              <strong className="text-base font-black text-slate-800">相簿匯入 🖼️</strong>
              <span className="text-[11px] text-slate-400 font-medium mt-0.5">從手機相簿選取收據圖片</span>
            </div>
          </button>
        </div>

        {/* OTHER UTILITY MODES GRID */}
        <div className="relative z-10 grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
          <button 
            type="button"
            onClick={onManual}
            aria-label="手動"
            className="scan-utility-button flex flex-row items-center gap-3 p-3 rounded-2xl bg-white/60 backdrop-blur-xl border border-white/80 shadow-sm hover:bg-white/80 active:scale-95 transition-all cursor-pointer"
          >
            <span className="scan-function-art scan-function-art--manual" style={scanSuiteStyle} aria-hidden="true">
              <FileText size={18} />
            </span>
            <div className="scan-utility-copy flex flex-col items-start text-left">
              <strong className="text-xs font-black text-slate-800">手動記帳</strong>
              <span className="text-[9px] text-slate-400 font-bold uppercase mt-0.5">Manual</span>
            </div>
          </button>

          <button 
            type="button"
            onClick={() => setMode('voice')}
            aria-label="語音"
            className={`scan-utility-button flex flex-row items-center gap-3 p-3 rounded-2xl bg-white/60 backdrop-blur-xl border border-white/80 shadow-sm hover:bg-white/80 active:scale-95 transition-all cursor-pointer ${mode === 'voice' ? 'ring-2 ring-blue-500 bg-white/80' : ''}`}
          >
            <span className="scan-function-art scan-function-art--voice" style={scanSuiteStyle} aria-hidden="true">
              <Mic size={18} />
            </span>
            <div className="scan-utility-copy flex flex-col items-start text-left">
              <strong className="text-xs font-black text-slate-800">語音記帳</strong>
              <span className="text-[9px] text-slate-400 font-bold uppercase mt-0.5">Voice</span>
            </div>
          </button>

          <button 
            type="button"
            onClick={() => setMode('email')}
            aria-label="Email"
            className={`scan-utility-button flex flex-row items-center gap-3 p-3 rounded-2xl bg-white/60 backdrop-blur-xl border border-white/80 shadow-sm hover:bg-white/80 active:scale-95 transition-all cursor-pointer ${mode === 'email' ? 'ring-2 ring-blue-500 bg-white/80' : ''}`}
          >
            <span className="scan-function-art scan-function-art--email" style={scanSuiteStyle} aria-hidden="true">
              <Mail size={18} />
            </span>
            <div className="scan-utility-copy flex flex-col items-start text-left">
              <strong className="text-xs font-black text-slate-800">Email 匯入</strong>
              <span className="text-[9px] text-slate-400 font-bold uppercase mt-0.5">Email</span>
            </div>
          </button>

          <button 
            type="button"
            onClick={() => setMode('currency')}
            aria-label="匯率"
            className={`scan-utility-button flex flex-row items-center gap-3 p-3 rounded-2xl bg-white/60 backdrop-blur-xl border border-white/80 shadow-sm hover:bg-white/80 active:scale-95 transition-all cursor-pointer ${mode === 'currency' ? 'ring-2 ring-blue-500 bg-white/80' : ''}`}
          >
            <span className="scan-function-art scan-function-art--currency" style={scanSuiteStyle} aria-hidden="true">
              <Repeat2 size={18} />
            </span>
            <div className="scan-utility-copy flex flex-col items-start text-left">
              <strong className="text-xs font-black text-slate-800">匯率工具</strong>
              <span className="text-[9px] text-slate-400 font-bold uppercase mt-0.5">Fx Tool</span>
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
                <button className="secondary bg-white text-black flex-1 font-bold" type="button" onClick={startSpeech}><Mic size={18} /> 開始聽</button>
                <StatefulActionButton className="primary flex-1 font-bold shadow-md" type="button" disabled={!voiceText.trim() || busy === 'voice'} onClick={handleVoiceParse}>解析</StatefulActionButton>
              </div>
              <textarea className="bg-white/80 border-white/60 rounded-xl p-3 text-black font-medium" value={voiceText} onChange={(e) => setVoiceText(e.target.value)} rows={3} placeholder="例：喺全家買飯糰同飲品 580 yen，用 Suica" />
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

          {mode === 'currency' && (
            <div className="p-4 bg-white/50 rounded-2xl border border-white/70 shadow-sm flex flex-col gap-4">
              <div className="flex items-center gap-2">
                <select className="bg-white rounded-lg p-2 font-bold text-black border border-white/60" value={from} onChange={(e) => setFrom(e.target.value)}>
                  {SUPPORTED_CURRENCIES.map((code) => <option key={code} value={code}>{code}</option>)}
                </select>
                <input className="flex-1 bg-white rounded-lg p-2 font-bold text-black border border-white/60 text-right" type="text" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
                <button className="icon-btn bg-white hover:bg-slate-100 p-2 rounded-lg" type="button" onClick={() => { setFrom(to); setTo(from); }}><Repeat2 size={18} /></button>
                <select className="bg-white rounded-lg p-2 font-bold text-black border border-white/60" value={to} onChange={(e) => setTo(e.target.value)}>
                  {SUPPORTED_CURRENCIES.map((code) => <option key={code} value={code}>{code}</option>)}
                </select>
              </div>
              <div className="text-center font-black text-2xl text-slate-900 bg-white/40 p-3 rounded-xl border border-white/50">
                {Number(amount) || 0} {from} = <span className="text-blue-600">{converted == null ? '需要更新匯率' : converted.toLocaleString(undefined, { maximumFractionDigits: 2 })} {to}</span>
              </div>
              <div className="flex justify-between items-center gap-2">
                <span className="text-xs font-bold text-slate-600 bg-white/60 px-3 py-1.5 rounded-full">1 HKD = {rate.toFixed(2)} JPY</span>
                <button className="secondary bg-white text-black font-bold px-4 py-1.5 rounded-full" type="button" disabled={busy === 'fx'} onClick={handleFxRefresh}>
                  <RefreshCw size={14} className={busy === 'fx' ? 'spin' : ''} /> 更新
                </button>
              </div>
            </div>
          )}
        </div>
      </GlassCard>
      </Reveal>

      {status && <Toast tone={/失敗|未能|error/i.test(status) ? 'warning' : 'info'}>{status}</Toast>}
      {batch.length > 0 && (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <div className="modal sheet">
            <div className="modal-head">
              <div>
                <h2>Batch Confirm</h2>
                <p className="muted">核對 email / 截圖解析結果，未勾選嘅唔會保存。</p>
              </div>
              <button className="icon-btn" type="button" onClick={() => setBatch([])}>×</button>
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
                    <label>金額<input type="text" inputMode="decimal" value={row.total || ''} onChange={(e) => updateBatch(row.id, { total: Number(e.target.value) || 0 })} /></label>
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
