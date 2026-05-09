import { Camera, CheckCircle2, FileImage, FileText, Mail, Mic, PlusCircle, RefreshCw, Repeat2 } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import { ActionSheet, GlassCard, SegmentedControl, StatusPill, Toast } from '../components/ui';
import { heuristicReceiptFromText, parseTextWithAi, scanReceiptImage } from '../lib/ai';
import { convertAmount, fetchLiveCurrencySnapshot, loadCurrencySnapshot, SUPPORTED_CURRENCIES, type CurrencySnapshot } from '../lib/currency';
import { pullAll } from '../lib/notion';
import type { AppState, Receipt } from '../lib/types';

type ScanMode = 'scan' | 'voice' | 'email' | 'currency';
const CAMERA_INPUT_ID = 'scan-camera-input';
const GALLERY_INPUT_ID = 'scan-gallery-input';
const EMAIL_IMAGE_INPUT_ID = 'scan-email-image-input';

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
  const [busy, setBusy] = useState('');
  const [status, setStatus] = useState('');
  const [voiceText, setVoiceText] = useState('');
  const [emailText, setEmailText] = useState('');
  const [batch, setBatch] = useState<Array<Receipt & { selected?: boolean }>>([]);
  const [mode, setMode] = useState<ScanMode>('scan');
  const [lastScanFile, setLastScanFile] = useState<File | null>(null);
  const [lastDraft, setLastDraft] = useState<Receipt | null>(null);
  const [from, setFrom] = useState('JPY');
  const [to, setTo] = useState('HKD');
  const [amount, setAmount] = useState('1000');
  const [fx, setFx] = useState<CurrencySnapshot | null>(() => loadCurrencySnapshot());
  const rate = Math.max(0.1, Number(state.rate) || 20.36);

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
        store: file.name.replace(/\.[^.]+$/, '') || '掃描收據',
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
    const rec = new SpeechRecognition();
    rec.lang = 'yue-Hant-HK';
    rec.continuous = false;
    rec.interimResults = false;
    rec.onresult = (event: any) => setVoiceText(event.results?.[0]?.[0]?.transcript || '');
    rec.onerror = (event: any) => setStatus(`語音失敗：${event.error || 'unknown'}`);
    rec.start();
  }

  async function handleEmailParse() {
    if (!emailText.trim()) return;
    setBusy('email');
    try {
      const receipts = await parseTextWithAi(emailText, state, 'react-email');
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
      for (const file of list) receipts.push(await scanReceiptImage(file, { ...state, scanModel: state.emailModel || state.scanModel }));
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
    const selected = batch.filter((row) => row.selected !== false).map(({ selected: _selected, ...receipt }) => receipt);
    onImport(selected);
    setBatch([]);
    setEmailText('');
    setStatus(`已儲存 ${selected.length} 筆 email 待確認紀錄。`);
  }

  async function handlePullPending() {
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

      <GlassCard className="scan-hero">
        <div className="section-head">
          <div>
            <p className="eyebrow">Scan Command</p>
            <h2>快速記帳</h2>
            <p className="muted">相機優先；AI 或權限失敗時會即刻落返手動確認表。</p>
          </div>
          <StatusPill tone={busy ? 'warning' : 'ok'} icon={busy ? <RefreshCw size={14} className="spin" /> : <CheckCircle2 size={14} />}>{busy || 'ready'}</StatusPill>
        </div>
        <ActionSheet>
          <label className={`primary button-like scan-picker-label ${busy === 'ocr' ? 'is-disabled' : ''}`} htmlFor={busy === 'ocr' ? undefined : CAMERA_INPUT_ID} role="button" tabIndex={busy === 'ocr' ? -1 : 0} aria-disabled={busy === 'ocr'}>
            {busy === 'ocr' ? <RefreshCw size={18} className="spin" /> : <Camera size={18} />} 相機
          </label>
          <label className={`secondary button-like scan-picker-label ${busy === 'ocr' ? 'is-disabled' : ''}`} htmlFor={busy === 'ocr' ? undefined : GALLERY_INPUT_ID} role="button" tabIndex={busy === 'ocr' ? -1 : 0} aria-disabled={busy === 'ocr'}>
            <FileImage size={18} /> 相簿
          </label>
          <button className="secondary" type="button" onClick={onManual}>
            <PlusCircle size={18} /> 手動記一筆
          </button>
        </ActionSheet>
        <SegmentedControl
          value={mode}
          ariaLabel="記帳模式"
          onChange={setMode}
          options={[
            { value: 'scan', label: '掃描', icon: <Camera size={16} /> },
            { value: 'voice', label: '語音', icon: <Mic size={16} /> },
            { value: 'email', label: 'Email', icon: <Mail size={16} /> },
            { value: 'currency', label: '匯率', icon: <Repeat2 size={16} /> },
          ]}
        />
      </GlassCard>

      {mode === 'scan' && <div className="card">
        <div className="section-head">
          <h2>掃描收據</h2>
          <Camera />
        </div>
        <p className="muted">可直接喺 React 用相機或相簿。Kimi 係 primary OCR；broker 未連線或 AI 失敗時會開確認表手動補資料，Google backup 只經 broker 使用。</p>
        <div className="action-row wrap">
          <label className={`primary button-like scan-picker-label ${busy === 'ocr' ? 'is-disabled' : ''}`} htmlFor={busy === 'ocr' ? undefined : CAMERA_INPUT_ID} role="button" tabIndex={busy === 'ocr' ? -1 : 0} aria-disabled={busy === 'ocr'}>
            {busy === 'ocr' ? <RefreshCw size={18} className="spin" /> : <Camera size={18} />} 相機
          </label>
          <label className={`secondary button-like scan-picker-label ${busy === 'ocr' ? 'is-disabled' : ''}`} htmlFor={busy === 'ocr' ? undefined : GALLERY_INPUT_ID} role="button" tabIndex={busy === 'ocr' ? -1 : 0} aria-disabled={busy === 'ocr'}>
            <FileText size={18} /> 相簿
          </label>
        </div>
        <p className="scan-diagnostic">相機 picker 用 native label 開啟；如手機權限或 in-app browser 阻擋，請用相簿或手動記一筆。Secure context: {window.isSecureContext ? 'yes' : 'local/dev'}</p>
        <div className="action-row wrap">
          <button className="secondary" type="button" disabled={!lastScanFile || busy === 'ocr'} onClick={() => handleImage(lastScanFile || undefined, true)}>
            <RefreshCw size={18} /> 重試上一張
          </button>
          <button className="secondary" type="button" disabled={!lastDraft} onClick={() => lastDraft && openDraft(lastDraft)}>
            <Repeat2 size={18} /> 重開上次草稿
          </button>
        </div>
        <div className="mini-list">
          <span>Last scan: {lastScanFile ? lastScanFile.name : '未有'}</span>
          <span>Last draft: {lastDraft ? lastDraft.store || '未命名' : '未有'}</span>
        </div>
      </div>}

      {mode === 'voice' && <div className="card">
        <div className="section-head">
          <h2>語音記帳</h2>
          <Mic />
        </div>
        <div className="action-row wrap">
          <button className="secondary" type="button" onClick={startSpeech}><Mic size={18} /> 開始聽</button>
          <button className="primary" type="button" disabled={!voiceText.trim() || busy === 'voice'} onClick={handleVoiceParse}>解析</button>
        </div>
        <textarea value={voiceText} onChange={(e) => setVoiceText(e.target.value)} rows={3} placeholder="例：喺全家買飯糰同飲品 580 yen，用 Suica" />
      </div>}

      {mode === 'email' && <div className="card">
        <div className="section-head">
          <h2>Email 匯入</h2>
          <Mail />
        </div>
        <div className="action-row wrap">
          <button className="secondary" type="button" disabled={busy === 'notion'} onClick={handlePullPending}>
            {busy === 'notion' ? <RefreshCw size={18} className="spin" /> : <RefreshCw size={18} />} 即時同步
          </button>
          <button className="secondary" type="button" onClick={handleCopyGmail}>
            <Mail size={18} /> 複製 Gmail
          </button>
        </div>
        <textarea value={emailText} onChange={(e) => setEmailText(e.target.value)} rows={5} placeholder="貼 booking confirmation / email 文字" />
        <div className="action-row wrap">
          <button className="primary" type="button" disabled={!emailText.trim() || busy === 'email'} onClick={handleEmailParse}>
            <Mail size={18} /> 解析成待確認紀錄
          </button>
          <label className={`secondary button-like scan-picker-label ${busy === 'email-image' ? 'is-disabled' : ''}`} htmlFor={busy === 'email-image' ? undefined : EMAIL_IMAGE_INPUT_ID} role="button" tabIndex={busy === 'email-image' ? -1 : 0} aria-disabled={busy === 'email-image'}>
            <FileImage size={18} /> 揀 email 截圖
          </label>
        </div>
      </div>}

      {mode === 'currency' && <div className="card">
        <div className="section-head">
          <h2>匯率工具</h2>
          <FileText />
        </div>
        <div className="currency-tool">
          <select value={from} onChange={(e) => setFrom(e.target.value)}>
            {SUPPORTED_CURRENCIES.map((code) => <option key={code} value={code}>{code}</option>)}
          </select>
          <input type="text" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
          <button className="icon-btn" type="button" onClick={() => { setFrom(to); setTo(from); }}><Repeat2 size={18} /></button>
          <select value={to} onChange={(e) => setTo(e.target.value)}>
            {SUPPORTED_CURRENCIES.map((code) => <option key={code} value={code}>{code}</option>)}
          </select>
        </div>
        <p className="result-line">{Number(amount) || 0} {from} = {converted == null ? '需要更新匯率' : converted.toLocaleString(undefined, { maximumFractionDigits: 2 })} {to}</p>
        <div className="action-row wrap">
          <button className="secondary" type="button" disabled={busy === 'fx'} onClick={handleFxRefresh}>
            {busy === 'fx' ? <RefreshCw size={18} className="spin" /> : <RefreshCw size={18} />} 更新匯率
          </button>
          <span className="muted">1 HKD = {rate.toFixed(2)} JPY{fx ? ` · ${new Date(fx.fetchedAt).toLocaleTimeString()}` : ''}</span>
        </div>
      </div>}

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
              <button className="primary" type="button" onClick={saveBatch}>全部儲存 ({batch.filter((row) => row.selected !== false).length})</button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
