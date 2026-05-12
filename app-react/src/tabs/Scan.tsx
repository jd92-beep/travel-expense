import { Camera, CheckCircle2, FileImage, FileText, Mail, Mic, PlusCircle, RefreshCw, Repeat2 } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ActionRippleButton, ActionSheet, GlassCard, SegmentedControl, StatusPill, Toast } from '../components/ui';
import { heuristicReceiptFromText, parseTextWithAi, scanReceiptImage } from '../lib/ai';
import { convertAmount, fetchLiveCurrencySnapshot, loadCurrencySnapshot, SUPPORTED_CURRENCIES, type CurrencySnapshot } from '../lib/currency';
import { pullAll } from '../lib/notion';
import type { AppState, Receipt } from '../lib/types';

type ScanMode = 'scan' | 'voice' | 'email' | 'currency';
const CAMERA_INPUT_ID = 'scan-camera-input';
const GALLERY_INPUT_ID = 'scan-gallery-input';
const EMAIL_IMAGE_INPUT_ID = 'scan-email-image-input';

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
  state,
}: {
  onManual: () => void;
  onDraft: (receipt: Receipt) => void;
  onImport: (receipts: Receipt[]) => void;
  state: AppState;
}) {
  const cameraRef = useRef<HTMLInputElement | null>(null);
  const galleryRef = useRef<HTMLInputElement | null>(null);
  const emailImageRef = useRef<HTMLInputElement | null>(null);
  const speechRef = useRef<any>(null);
  const [busy, setBusy] = useState('');
  const [status, setStatus] = useState('');
  const [voiceText, setVoiceText] = useState('');
  const [emailText, setEmailText] = useState('');
  const [batch, setBatch] = useState<Array<Receipt & { selected?: boolean }>>([]);
  const [savingBatch, setSavingBatch] = useState(false);
  const [mode, setMode] = useState<ScanMode>('scan');
  const [lastScanFile, setLastScanFile] = useState<File | null>(null);
  const [lastDraft, setLastDraft] = useState<Receipt | null>(null);
  const [from, setFrom] = useState('JPY');
  const [to, setTo] = useState('HKD');
  const [amount, setAmount] = useState('1000');
  const [fx, setFx] = useState<CurrencySnapshot | null>(() => loadCurrencySnapshot());
  const rate = Math.max(0.1, Number(state.rate) || 20.36);

  useEffect(() => () => {
    speechRef.current?.abort();
    speechRef.current = null;
  }, []);

  const converted = useMemo(() => {
    const n = Number(amount) || 0;
    return convertAmount(n, from, to, state, fx);
  }, [amount, from, to, state, fx]);

  function openDraft(receipt: Receipt) {
    setLastDraft(receipt);
    onDraft(receipt);
  }

  async function handleImage(file?: File, retry = false) {
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
    try {
      const receipt = await scanReceiptImage(file, state);
      openDraft(receipt);
      setStatus('OCR 完成，請確認欄位。');
    } catch (error) {
      const draft = {
        ...heuristicReceiptFromText(file.name, state),
        store: safeFileStem(file),
        note: `OCR 未完成：${error instanceof Error ? error.message : String(error)}`,
        source: 'react-ocr-manual',
      };
      openDraft(draft);
      setStatus('未能自動 OCR，已開啟 React 確認表俾你手動補資料。');
    } finally {
      setBusy('');
      if (cameraRef.current) cameraRef.current.value = '';
      if (galleryRef.current) galleryRef.current.value = '';
    }
  }

  async function handleVoiceParse() {
    if (!voiceText.trim()) return;
    setBusy('voice');
    try {
      const receipts = await parseTextWithAi(voiceText, state, 'react-voice');
      if (!receipts?.length) {
        setStatus('解析不到任何收據');
        return;
      }
      openDraft(receipts[0]);
      setStatus('語音文字已解析，請確認欄位。');
    } catch (error) {
      setStatus(`語音解析失敗：${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setBusy('');
    }
  }

  async function startSpeech() {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setStatus('呢個瀏覽器唔支援 Web Speech API，可以直接貼語音文字。');
      return;
    }
    speechRef.current?.abort();
    const rec = new SpeechRecognition();
    rec.lang = 'yue-Hant-HK';
    rec.continuous = false;
    rec.interimResults = false;
    rec.onresult = (event: any) => setVoiceText(event.results?.[0]?.[0]?.transcript || '');
    rec.onerror = (event: any) => setStatus(`語音失敗：${event.error || 'unknown'}`);
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
      if (!receipts?.length) {
        setStatus('解析不到任何收據');
        return;
      }
      setBatch(receipts.map((r) => ({ ...r, store: r.store.startsWith('⏳ ') ? r.store : `⏳ ${r.store}`, selected: true })));
      setStatus(`已解析 ${receipts.length} 筆，請喺 batch confirm 核對。`);
    } catch (error) {
      setStatus(`Email 解析失敗：${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setBusy('');
    }
  }

  async function handleEmailImages(files?: FileList | null) {
    const list = [...(files || [])];
    if (!list.length) return;
    setBusy('email-image');
    setStatus(`解析 ${list.length} 張 email 截圖…`);
    try {
      const receipts: Receipt[] = [];
      for (const file of list) {
        if (file.size > 5_000_000) {
          setStatus('圖片太大（超過 5MB），請先壓縮。');
          continue;
        }
        try {
          receipts.push(await scanReceiptImage(file, { ...state, scanModel: state.emailModel || state.scanModel }));
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
            createdAt: Date.now(),
          } as Receipt);
        }
      }
      setBatch(receipts.map((r) => ({ ...r, source: 'react-email-image', store: r.store.startsWith('⏳ ') ? r.store : `⏳ ${r.store}`, selected: true })));
      setStatus(`已解析 ${receipts.length} 筆截圖，請核對後保存。`);
    } catch (error) {
      setStatus(`截圖解析失敗：${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setBusy('');
      if (emailImageRef.current) emailImageRef.current.value = '';
    }
  }

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
      setStatus('離線模式，無法拉取 Notion。');
      return;
    }
    setBusy('notion');
    setStatus('從 Notion 拉取 email 待確認紀錄…');
    try {
      const pulled = await pullAll(state);
      const pending = pulled.filter((r) => r.store?.startsWith('⏳ '));
      onImport(pending.length ? pending : pulled);
      setStatus(pending.length ? `已拉取 ${pending.length} 筆待確認 email 紀錄。` : `已同步 ${pulled.length} 筆 Notion 紀錄，暫時無待確認 email。`);
    } catch (error) {
      setStatus(`Notion 同步失敗：${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setBusy('');
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
      setStatus(`已複製：${address}`);
    } catch {
      setStatus(`收帳 Gmail：${address}`);
    }
  }

  async function handleFxRefresh() {
    setBusy('fx');
    try {
      const snapshot = await fetchLiveCurrencySnapshot();
      setFx(snapshot);
      setStatus(`已更新匯率：1 HKD = ${snapshot.rates.JPY.toFixed(2)} JPY（${snapshot.source}）`);
    } catch (error) {
      setStatus(`匯率更新失敗：${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setBusy('');
    }
  }

  return (
    <section className="stack">
      <input id={CAMERA_INPUT_ID} ref={cameraRef} className="visually-hidden-file" type="file" accept="image/*" capture="environment" onChange={(e) => handleImage(e.target.files?.[0])} />
      <input id={GALLERY_INPUT_ID} ref={galleryRef} className="visually-hidden-file" type="file" accept="image/*" onChange={(e) => handleImage(e.target.files?.[0])} />
      <input id={EMAIL_IMAGE_INPUT_ID} ref={emailImageRef} className="visually-hidden-file" type="file" accept="image/*" multiple onChange={(e) => handleEmailImages(e.target.files)} />

      <GlassCard className="relative overflow-hidden p-6 sm:p-8 rounded-[40px] border-[2px] border-white shadow-[0_20px_60px_-15px_rgba(0,0,0,0.15),inset_0_0_40px_rgba(255,255,255,1)] bg-white/50 backdrop-blur-3xl mb-6">
        <div className="absolute inset-0 bg-gradient-to-br from-white/80 via-white/50 to-transparent backdrop-blur-lg" />
        <div className="absolute inset-0 bg-white/50 opacity-90 mix-blend-overlay rounded-[40px] shadow-[inset_0_0_30px_rgba(255,255,255,1)] pointer-events-none" />
        
        <div className="relative z-10 flex justify-between items-center mb-6">
          <h2 className="text-3xl font-black text-black tracking-tight flex items-center gap-3 drop-shadow-sm">
            <Camera size={32} className="text-blue-600" />
            掃描收據
          </h2>
          <StatusPill tone={busy ? 'warning' : 'ok'} icon={busy ? <RefreshCw size={14} className="spin text-slate-800" /> : <CheckCircle2 size={14} className="text-slate-800" />}>
            {busy || 'ready'}
          </StatusPill>
        </div>
        
        <p className="relative z-10 text-slate-900 font-bold mb-8 leading-relaxed">
          請選擇記帳方式。系統優先使用相機與 AI 辨識，如辨識失敗會開啟手動確認表供您修改。
        </p>

        <div className="relative z-10 grid grid-cols-3 gap-3 sm:gap-4 mb-6">
          <label 
            htmlFor={busy === 'ocr' ? undefined : CAMERA_INPUT_ID} 
            className={`flex flex-col items-center justify-center gap-2 p-4 rounded-3xl bg-white/60 backdrop-blur-xl border border-white/90 shadow-sm hover:bg-white/90 transition-all cursor-pointer hover:shadow-md hover:scale-[1.02] active:scale-95 ${busy === 'ocr' ? 'opacity-50 cursor-not-allowed' : ''}`}
            onClick={() => setMode('scan')}
          >
            {busy === 'ocr' ? <RefreshCw size={26} className="spin text-blue-600" /> : <Camera size={26} className="text-blue-600" />}
            <span className="text-black font-bold text-sm">相機</span>
          </label>
          
          <label 
            htmlFor={busy === 'ocr' ? undefined : GALLERY_INPUT_ID} 
            className={`flex flex-col items-center justify-center gap-2 p-4 rounded-3xl bg-white/60 backdrop-blur-xl border border-white/90 shadow-sm hover:bg-white/90 transition-all cursor-pointer hover:shadow-md hover:scale-[1.02] active:scale-95 ${busy === 'ocr' ? 'opacity-50 cursor-not-allowed' : ''}`}
            onClick={() => setMode('scan')}
          >
            <FileImage size={26} className="text-purple-600" />
            <span className="text-black font-bold text-sm">相簿</span>
          </label>

          <button 
            type="button"
            onClick={onManual}
            className="flex flex-col items-center justify-center gap-2 p-4 rounded-3xl bg-white/60 backdrop-blur-xl border border-white/90 shadow-sm hover:bg-white/90 transition-all cursor-pointer hover:shadow-md hover:scale-[1.02] active:scale-95"
          >
            <PlusCircle size={26} className="text-green-600" />
            <span className="text-black font-bold text-sm">手動</span>
          </button>

          <button 
            type="button"
            onClick={() => setMode('voice')}
            className={`flex flex-col items-center justify-center gap-2 p-4 rounded-3xl bg-white/60 backdrop-blur-xl border border-white/90 shadow-sm hover:bg-white/90 transition-all cursor-pointer hover:shadow-md hover:scale-[1.02] active:scale-95 ${mode === 'voice' ? 'ring-2 ring-blue-500 bg-white/90 shadow-md' : ''}`}
          >
            <Mic size={26} className="text-amber-600" />
            <span className="text-black font-bold text-sm">語音</span>
          </button>

          <button 
            type="button"
            onClick={() => setMode('email')}
            className={`flex flex-col items-center justify-center gap-2 p-4 rounded-3xl bg-white/60 backdrop-blur-xl border border-white/90 shadow-sm hover:bg-white/90 transition-all cursor-pointer hover:shadow-md hover:scale-[1.02] active:scale-95 ${mode === 'email' ? 'ring-2 ring-blue-500 bg-white/90 shadow-md' : ''}`}
          >
            <Mail size={26} className="text-rose-600" />
            <span className="text-black font-bold text-sm">Email</span>
          </button>

          <button 
            type="button"
            onClick={() => setMode('currency')}
            className={`flex flex-col items-center justify-center gap-2 p-4 rounded-3xl bg-white/60 backdrop-blur-xl border border-white/90 shadow-sm hover:bg-white/90 transition-all cursor-pointer hover:shadow-md hover:scale-[1.02] active:scale-95 ${mode === 'currency' ? 'ring-2 ring-blue-500 bg-white/90 shadow-md' : ''}`}
          >
            <Repeat2 size={26} className="text-teal-600" />
            <span className="text-black font-bold text-sm">匯率</span>
          </button>
        </div>

        {/* Embedded Workspaces */}
        <div className="relative z-10 w-full overflow-hidden transition-all duration-300">
          {mode === 'scan' && (lastScanFile || lastDraft) && (
            <div className="p-4 bg-white/50 rounded-2xl border border-white/70 shadow-sm">
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
                <button className="primary flex-1 font-bold shadow-md" type="button" disabled={!voiceText.trim() || busy === 'voice'} onClick={handleVoiceParse}>解析</button>
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
                <button className="secondary bg-white text-black flex-1 font-bold" type="button" onClick={handleCopyGmail}>
                  <Mail size={18} /> 複製 Gmail
                </button>
              </div>
              <textarea className="bg-white/80 border-white/60 rounded-xl p-3 text-black font-medium" value={emailText} onChange={(e) => setEmailText(e.target.value)} rows={4} placeholder="貼 booking confirmation / email 文字" />
              <div className="flex gap-2">
                <button className="primary flex-1 font-bold shadow-md" type="button" disabled={!emailText.trim() || busy === 'email'} onClick={handleEmailParse}>
                  解析文字
                </button>
                <label className={`secondary bg-white text-black button-like scan-picker-label flex-1 text-center font-bold shadow-sm ${busy === 'email-image' ? 'opacity-50' : ''}`} htmlFor={busy === 'email-image' ? undefined : EMAIL_IMAGE_INPUT_ID}>
                  揀 email 截圖
                </label>
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
              <button className="primary" type="button" disabled={savingBatch} onClick={saveBatch}>全部儲存 ({batch.filter((row) => row.selected !== false).length})</button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
