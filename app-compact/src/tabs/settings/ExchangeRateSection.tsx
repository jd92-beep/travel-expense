import { ArrowRightLeft, CheckCircle2, LoaderCircle } from 'lucide-react';
import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { AccordionCard } from '../../components/AccordionCard';
import { SegmentedControl } from '../../components/ui';
import { perHkdForCurrency } from '../../lib/currency';
import { confirmLiveRate, fixedRatePatch, isValidFixedRate, rateCurrency } from '../../lib/rateMode';
import { TripRateInput } from './TripRateInput';
import type { SettingsContext } from './shared';

export function ExchangeRateSection({ ctx }: { ctx: SettingsContext }) {
  const { state, updateState, busy } = ctx;
  const code = rateCurrency(state);
  const confirmedMode = state.rateMode === 'fixed' ? 'fixed' : 'live';
  const committedRate = perHkdForCurrency(state, code);
  const liveSource = state.rateTable?.[code]?.source !== 'manual' ? state.rateTable?.[code]?.source : '';
  const [draftMode, setDraftMode] = useState<'fixed' | 'live'>(confirmedMode);
  const [draftRate, setDraftRate] = useState(String(committedRate));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const dirtyRef = useRef(false);
  const mountedRef = useRef(true);
  const stateRef = useRef(state);
  const errorId = useId();
  stateRef.current = state;

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  // Background rates may update the confirmed value, but must not erase a manual draft.
  useEffect(() => {
    if (dirtyRef.current) return;
    setDraftMode(confirmedMode);
    setDraftRate(String(committedRate));
  }, [confirmedMode, committedRate]);

  useEffect(() => {
    dirtyRef.current = false;
    setDraftMode(confirmedMode);
    setDraftRate(String(committedRate));
    setError('');
    setMessage('');
  }, [state.activeTripId, code]);

  function cancelDraft() {
    dirtyRef.current = false;
    setDraftMode(confirmedMode);
    setDraftRate(String(committedRate));
    setError('');
    setMessage('');
  }

  async function confirmRate(event: FormEvent) {
    event.preventDefault();
    if (saving || busy) return;
    setError('');
    setMessage('');
    const rate = Number(draftRate);
    if (draftMode === 'fixed' && !isValidFixedRate(rate)) {
      setError('固定匯率必須係 0.01 至 1,000,000 之間嘅數值。');
      return;
    }
    const tripId = state.activeTripId;
    setSaving(true);
    try {
      if (draftMode === 'fixed') {
        updateState(fixedRatePatch(stateRef.current, code, rate));
        dirtyRef.current = false;
        setMessage(`已確認：新記錄採用固定匯率，1 HKD = ${rate} ${code}。`);
      } else {
        // Obtain a valid live rate before changing the confirmed mode. Offline failure keeps
        // the prior fixed mode/rate, and a trip switch cannot receive this pending response.
        let live: Awaited<ReturnType<typeof confirmLiveRate>>;
        try {
          live = await confirmLiveRate(code);
        } catch (liveError) {
          if (!mountedRef.current) return;
          if (/有效/.test(String((liveError as Error)?.message))) {
            setError(`未取得有效嘅 ${code} 即時匯率，原設定已保留。`);
            return;
          }
          throw liveError;
        }
        if (!mountedRef.current) return;
        if (stateRef.current.activeTripId !== tripId || rateCurrency(stateRef.current) !== code) {
          setError('旅程或貨幣已變更，請重新確認匯率。');
          return;
        }
        const liveRate = live.rate;
        updateState(live.patch);
        dirtyRef.current = false;
        setMessage(`已確認：新記錄採用即時匯率，1 HKD = ${liveRate} ${code}。`);
      }
    } catch {
      if (mountedRef.current) setError('未能取得即時匯率，原設定已保留。請檢查網絡後再確認。');
    } finally {
      if (mountedRef.current) setSaving(false);
    }
  }

  const modeLabel = draftMode === 'fixed' ? '固定匯率' : '即時匯率';
  const changed = draftMode !== confirmedMode || (draftMode === 'fixed' && draftRate !== String(committedRate));
  return (
    <AccordionCard id="settings-exchange-rates" title="匯率設定" eyebrow="記帳" icon={<ArrowRightLeft />} defaultOpen={false}
      meta={<span>記錄用{confirmedMode === 'fixed' ? '固定匯率' : '即時匯率'}</span>}>
      <form className="settings-exchange-form" onSubmit={confirmRate} noValidate>
        <p className="muted">目前已確認：{confirmedMode === 'fixed' ? '固定匯率' : '即時匯率'} · 1 HKD = {committedRate} {code}</p>
        {confirmedMode === 'live' && liveSource && <p className="muted settings-exchange-source">來源：{liveSource}</p>}
        <fieldset disabled={saving || !!busy}>
          <SegmentedControl ariaLabel="匯率模式" value={draftMode}
            options={[{ value: 'live', label: '即時匯率' }, { value: 'fixed', label: '固定匯率' }]}
            onChange={(mode) => { dirtyRef.current = true; setDraftMode(mode); setError(''); setMessage(''); }} />
          <label>{modeLabel}（1 HKD = {code}）
            <TripRateInput value={draftMode === 'fixed' ? draftRate : confirmedMode === 'live' ? String(committedRate) : ''}
              readOnly={draftMode === 'live'} invalid={!!error && draftMode === 'fixed'} describedBy={error ? errorId : undefined}
              onChange={(value) => { dirtyRef.current = true; setDraftRate(value); setError(''); setMessage(''); }} />
          </label>
          <div className="settings-exchange-actions">
            <button className="primary" type="submit">{saving ? <LoaderCircle size={18} className="spin" /> : <CheckCircle2 size={18} />}
              {saving ? '確認中…' : `確認採用${modeLabel}`}</button>
            {changed && <button className="secondary" type="button" onClick={cancelDraft}>取消修改</button>}
          </div>
        </fieldset>
        {error && <p id={errorId} role="alert">{error}</p>}
        {message && <p role="status">{message}</p>}
      </form>
    </AccordionCard>
  );
}
