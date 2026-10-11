import { ArrowUpDown, CheckCircle2, Delete, LoaderCircle, RefreshCw, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { SegmentedControl } from './ui';
import { currencyPrefix, fetchLiveCurrencySnapshot } from '../lib/currency';
import { confirmLiveRate, fixedRatePatch, formatRate, isValidFixedRate, knownLiveRate, rateCurrency, settingsFixedRate } from '../lib/rateMode';
import { redactedError } from '../lib/credentialBroker';
import type { AppState } from '../lib/types';
import { useModalOpenClass } from '../lib/useModalOpenClass';

type RateBasis = 'live' | 'fixed';

/**
 * Live / fixed switch for the Scan rate sheet. Choosing 即時 confirms a fresh market rate at
 * once; 固定 asks for the rate first, so a half-typed value never becomes the trip rate.
 */
export function RateModeSwitch({ state, updateState }: { state: AppState; updateState: (patch: Partial<AppState>) => void }) {
  const code = rateCurrency(state);
  const confirmedMode: RateBasis = state.rateMode === 'fixed' ? 'fixed' : 'live';
  const [draftMode, setDraftMode] = useState<RateBasis>(confirmedMode);
  const [draftRate, setDraftRate] = useState(() => rateInputValue(settingsFixedRate(state, code) ?? knownLiveRate(state, code)));
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);
  const mountedRef = useRef(true);
  const requestRef = useRef(0);
  const stateRef = useRef(state);
  stateRef.current = state;
  useEffect(() => { mountedRef.current = true; return () => { mountedRef.current = false; requestRef.current += 1; }; }, []);
  useEffect(() => {
    requestRef.current += 1;
    setBusy(false);
    setMessage(null);
    setDraftMode(confirmedMode);
    setDraftRate(rateInputValue(settingsFixedRate(stateRef.current, code) ?? knownLiveRate(stateRef.current, code)));
  }, [state.activeTripId, code]);
  useEffect(() => { setDraftMode(confirmedMode); }, [confirmedMode]);

  async function chooseLive() {
    const request = ++requestRef.current;
    const tripId = state.activeTripId;
    const isCurrent = () => mountedRef.current && request === requestRef.current
      && stateRef.current.activeTripId === tripId && rateCurrency(stateRef.current) === code;
    setDraftMode('live');
    setMessage(null);
    if (confirmedMode === 'live') return;
    setBusy(true);
    try {
      const live = await confirmLiveRate(code);
      if (!isCurrent()) return;
      updateState(live.patch);
      setMessage({ tone: 'ok', text: `已轉用即時匯率：1 HKD = ${formatRate(live.rate)} ${code}` });
    } catch (error) {
      if (!isCurrent()) return;
      setDraftMode('fixed');
      setMessage({ tone: 'error', text: `未能取得即時匯率，保留固定匯率。${redactedError(error)}` });
    } finally {
      if (isCurrent()) setBusy(false);
    }
  }

  function saveFixed() {
    const rate = Number(draftRate.replace(/,/g, ''));
    if (!isValidFixedRate(rate)) {
      setMessage({ tone: 'error', text: '固定匯率必須係 0.01 至 1,000,000 之間嘅數值。' });
      return;
    }
    requestRef.current += 1;
    setBusy(false);
    updateState(fixedRatePatch(stateRef.current, code, rate));
    setMessage({ tone: 'ok', text: `已採用固定匯率：1 HKD = ${formatRate(rate)} ${code}` });
  }

  return (
    <div className="rate-mode-switch">
      <SegmentedControl ariaLabel="匯率模式" value={draftMode}
        options={[{ value: 'live', label: '即時匯率' }, { value: 'fixed', label: '固定匯率' }]}
        onChange={(mode) => { if (mode === 'live') void chooseLive(); else { requestRef.current += 1; setBusy(false); setDraftMode('fixed'); setMessage(null); } }} />
      {draftMode === 'fixed' ? (
        <div className="rate-mode-fixed">
          <label>
            <span>1 HKD =</span>
            <input aria-label={`固定匯率（1 HKD = ${code}）`} type="text" inputMode="decimal" value={draftRate} onChange={(e) => { setDraftRate(e.target.value); setMessage(null); }} />
            <b>{code}</b>
          </label>
          <button className="primary" type="button" onClick={saveFixed}><CheckCircle2 size={16} aria-hidden="true" />{confirmedMode === 'fixed' ? '更新' : '採用'}</button>
        </div>
      ) : (
        <p className="rate-mode-live">{busy ? <><LoaderCircle size={14} className="spin" aria-hidden="true" /> 取得即時匯率…</> : <>1 HKD = <b>{formatRate(knownLiveRate(state, code))}</b> {code} · 自動更新</>}</p>
      )}
      {message && <p className={`rate-mode-message is-${message.tone}`} role={message.tone === 'error' ? 'alert' : 'status'}>{message.text}</p>}
    </div>
  );
}

const rateInputValue = (rate: number | undefined) => (rate && Number.isFinite(rate) ? String(Number(rate.toFixed(4))) : '');

const OPERATORS = ['+', '−', '×', '÷'] as const;
type Operator = typeof OPERATORS[number];
const isOperator = (token: string): token is Operator => (OPERATORS as readonly string[]).includes(token);

// Left-to-right evaluation with × ÷ before + −; a trailing operator is ignored while typing.
export function evaluateExpression(expression: string): number {
  const tokens = expression.match(/(\d+\.?\d*|\.\d+|[+−×÷])/g) || [];
  if (tokens.join('') !== expression) return Number.NaN;
  if (tokens[0] === '−') tokens.splice(0, 2, String(-Number(tokens[1])));
  while (tokens.length && isOperator(tokens[tokens.length - 1])) tokens.pop();
  if (!tokens.length) return 0;
  const terms: number[] = [];
  const signs: Operator[] = [];
  let current = Number(tokens[0]);
  for (let i = 1; i < tokens.length; i += 2) {
    const op = tokens[i] as Operator;
    const next = Number(tokens[i + 1]);
    if (op === '×') current *= next;
    else if (op === '÷') current = next === 0 ? Number.NaN : current / next;
    else { terms.push(current); signs.push(op); current = next; }
  }
  terms.push(current);
  return terms.slice(1).reduce((sum, term, index) => (signs[index] === '+' ? sum + term : sum - term), terms[0]);
}

const KEYS: Array<{ key: string; label?: string; className?: string }> = [
  { key: 'C', className: 'is-fn' }, { key: '⌫', className: 'is-fn' }, { key: '÷', className: 'is-op' }, { key: '×', className: 'is-op' },
  { key: '7' }, { key: '8' }, { key: '9' }, { key: '−', className: 'is-op' },
  { key: '4' }, { key: '5' }, { key: '6' }, { key: '+', className: 'is-op' },
  { key: '1' }, { key: '2' }, { key: '3' }, { key: '=', className: 'is-eq' },
  { key: '0', className: 'is-zero' }, { key: '.' },
];

export function CurrencyCalculator({ state, onClose }: { state: AppState; onClose: () => void }) {
  const code = rateCurrency(state);
  const settingsFixed = settingsFixedRate(state, code);
  const [basis, setBasis] = useState<RateBasis>(state.rateMode === 'fixed' ? 'fixed' : 'live');
  const [liveRate, setLiveRate] = useState(() => knownLiveRate(state, code));
  const [customFixed, setCustomFixed] = useState(() => rateInputValue(settingsFixed ?? knownLiveRate(state, code)));
  const [expression, setExpression] = useState('');
  const [toHkd, setToHkd] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState('');
  const dialogRef = useRef<HTMLDivElement>(null);
  useModalOpenClass(true);

  const fixedRate = settingsFixed ?? Number(customFixed.replace(/,/g, ''));
  const rate = basis === 'live' ? liveRate : (isValidFixedRate(fixedRate) ? fixedRate : undefined);
  const input = useMemo(() => evaluateExpression(expression), [expression]);
  const result = rate && Number.isFinite(input) ? (toHkd ? input / rate : input * rate) : Number.NaN;
  const fromCode = toHkd ? code : 'HKD';
  const resultCode = toHkd ? 'HKD' : code;

  async function refreshLive() {
    setRefreshing(true);
    setRefreshError('');
    try {
      const snapshot = await fetchLiveCurrencySnapshot();
      const next = Number(snapshot.rates[code]);
      if (!Number.isFinite(next) || next <= 0) throw new Error(`未取得有效嘅 ${code} 即時匯率`);
      setLiveRate(next);
    } catch (error) {
      setRefreshError(`更新失敗：${redactedError(error)}`);
    } finally {
      setRefreshing(false);
    }
  }

  useEffect(() => {
    if (basis === 'live' && liveRate == null) void refreshLive();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [basis]);

  function press(key: string) {
    setExpression((current) => {
      if (key === 'C') return '';
      if (key === '⌫') return current.slice(0, -1);
      if (key === '=') {
        const value = evaluateExpression(current);
        return Number.isFinite(value)
          ? value.toLocaleString('en-US', { useGrouping: false, maximumFractionDigits: 4 }).replace('-', '−')
          : current;
      }
      const last = current.slice(-1);
      if (isOperator(key)) {
        if (!current) return key === '−' ? '' : current;
        return isOperator(last) ? current.slice(0, -1) + key : current + key;
      }
      const lastNumber = current.split(/[+−×÷]/).pop() || '';
      if (key === '.') return lastNumber.includes('.') ? current : current + (lastNumber ? '.' : '0.');
      if (lastNumber.replace('.', '').length >= 12) return current;
      return lastNumber === '0' ? current.slice(0, -1) + key : current + key;
    });
  }

  useEffect(() => {
    const map: Record<string, string> = { '*': '×', x: '×', '/': '÷', '-': '−', '+': '+', Enter: '=', '=': '=', Backspace: '⌫', Delete: 'C' };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); onClose(); return; }
      if (event.key === 'Tab') {
        const focusable = [...(dialogRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), [href], [tabindex="0"]') || [])]
          .filter((element) => element.getClientRects().length > 0);
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
        return;
      }
      const target = event.target as HTMLElement | null;
      if (target?.tagName === 'INPUT') return;
      const key = /^[0-9.]$/.test(event.key) ? event.key : map[event.key];
      if (key) { event.preventDefault(); press(key); }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    dialogRef.current?.querySelector<HTMLElement>('.calc-key')?.focus({ preventScroll: true });
    return () => previous?.focus?.();
  }, []);

  // Portal to <body>: the tab's animated wrapper would otherwise anchor position:fixed to itself.
  return createPortal(
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="calc-title" onClick={onClose}>
      <div ref={dialogRef} className="modal sheet calc-modal" onClick={(event) => event.stopPropagation()}>
        <div className="modal-head">
          <div>
            <h2 id="calc-title">貨幣計數機</h2>
            <p className="muted">輸入{fromCode === 'HKD' ? '港幣' : ` ${code} `}金額，即時換算。</p>
          </div>
          <button className="icon-btn" type="button" aria-label="關閉" onClick={onClose}><X size={18} /></button>
        </div>

        <SegmentedControl ariaLabel="計算用匯率" value={basis}
          options={[{ value: 'live', label: '即時匯率' }, { value: 'fixed', label: '固定匯率' }]}
          onChange={setBasis} />
        <div className="calc-rate">
          {basis === 'live' ? (
            <>
              <span>1 HKD = <b>{formatRate(liveRate)}</b> {code}</span>
              <button type="button" className="calc-rate-refresh" onClick={() => void refreshLive()} disabled={refreshing} aria-label="更新即時匯率">
                <RefreshCw size={15} className={refreshing ? 'spin' : ''} aria-hidden="true" />更新
              </button>
            </>
          ) : settingsFixed ? (
            <span>1 HKD = <b>{formatRate(settingsFixed)}</b> {code} · 設定固定匯率</span>
          ) : (
            <label className="calc-rate-input">
              <span>1 HKD =</span>
              <input aria-label={`計算用固定匯率（1 HKD = ${code}）`} type="text" inputMode="decimal" value={customFixed} onChange={(e) => setCustomFixed(e.target.value)} />
              <b>{code}</b>
            </label>
          )}
        </div>
        {refreshError && <p className="calc-error" role="alert">{refreshError}</p>}

        <div className="calc-display" aria-live="polite">
          <div className="calc-line">
            <span>{fromCode}</span>
            <output aria-label={`輸入金額 ${fromCode}`}>{expression || '0'}</output>
          </div>
          <button type="button" className="calc-swap" aria-label="調轉換算方向" onClick={() => setToHkd((value) => !value)}>
            <ArrowUpDown size={18} aria-hidden="true" />
          </button>
          <div className="calc-line is-result">
            <span>{resultCode}</span>
            <strong>{Number.isFinite(result) ? `${currencyPrefix(resultCode).trim()} ${result.toLocaleString('en-US', { maximumFractionDigits: 2 })}` : '—'}</strong>
          </div>
        </div>

        <div className="calc-keys" role="group" aria-label="計數機按鍵">
          {KEYS.map(({ key, className }) => (
            <button key={key} type="button" className={`calc-key ${className || ''}`} onClick={() => press(key)} aria-label={key === '⌫' ? '刪除一位' : key === 'C' ? '清除' : undefined}>
              {key === '⌫' ? <Delete size={20} aria-hidden="true" /> : key}
            </button>
          ))}
        </div>
      </div>
    </div>,
    document.body,
  );
}
