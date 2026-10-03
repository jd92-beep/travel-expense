import { Plus, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { AccordionCard } from '../../components/AccordionCard';
import { AvatarBadge } from '../../components/AvatarBadge';
import { scopedReceiptsForTrip } from '../../domain/trip/normalize';
import { currencyPrefix } from '../../lib/currency';
import { computeSettlements, getResolvedTripCurrency, sharePercents } from '../../lib/domain';
import type { Person } from '../../lib/types';
import { COLORS, type SettingsContext } from './shared';
import { clampFinite } from './backup';

export function PeopleSection({ ctx }: { ctx: SettingsContext }) {
  const { state, setState, updateState, setStatus, persons, currentTrip } = ctx;
  const settlement = useMemo(
    () => computeSettlements({ ...state, receipts: scopedReceiptsForTrip(state, currentTrip) }),
    [state, currentTrip],
  );
  const tripPrefix = currencyPrefix(getResolvedTripCurrency(state, currentTrip));
  const shareRatios = useMemo(() => state.shareRatios || {}, [state.shareRatios]);
  const personSharePercents = useMemo(
    () => sharePercents(persons.map((person) => person.id), shareRatios),
    [persons, shareRatios],
  );
  const [newPersonName, setNewPersonName] = useState('');

  function updatePerson(id: string, patch: Partial<Person>) {
    updateState({ persons: persons.map((p) => (p.id === id ? { ...p, ...patch } : p)) });
  }

  function addPerson() {
    const name = newPersonName.trim();
    if (!name) {
      setStatus('請先輸入旅伴名字');
      return;
    }
    const next: Person = {
      id: `p_${Date.now().toString(36)}_${Math.random().toString(16).slice(2, 6)}`,
      name,
      emoji: '旅',
      color: COLORS[persons.length % COLORS.length],
    };
    // Match addInvitePersonToSplit: default the new person to the mean of the current ratios
    // so existing custom percentages keep their proportions (a flat 1 would normalize to ~1%
    // once the other entries are percentages).
    const ratios = state.shareRatios || {};
    const existing = persons.map((person) => Number(ratios[person.id]) || 0);
    const avg = existing.length ? existing.reduce((acc, value) => acc + value, 0) / existing.length : 1;
    const nextPersons = [...persons, next];
    const nextRatios = { ...ratios, [next.id]: Math.max(1, Math.round(avg)) };
    const tripId = currentTrip.id || state.activeTripId;
    updateState({
      persons: nextPersons,
      shareRatios: nextRatios,
      peopleByTripId: { ...(state.peopleByTripId || {}), ...(tripId ? { [tripId]: nextPersons } : {}) },
      shareRatiosByTripId: { ...(state.shareRatiosByTripId || {}), ...(tripId ? { [tripId]: nextRatios } : {}) },
    });
    setNewPersonName('');
    setStatus(`已新增旅伴：${next.name}`);
  }

  function removePerson(id: string) {
    if (persons.length <= 1) {
      setStatus('最少要保留一位旅伴');
      return;
    }
    const fallback = persons.find((p) => p.id !== id) || persons[0];
    const shareRatios = { ...state.shareRatios };
    delete shareRatios[id];
    const nextPersons = persons.filter((p) => p.id !== id);
    const tripId = currentTrip.id || state.activeTripId;
    setState((prev) => ({
      ...prev,
      persons: nextPersons,
      shareRatios,
      peopleByTripId: { ...(prev.peopleByTripId || {}), ...(tripId ? { [tripId]: nextPersons } : {}) },
      shareRatiosByTripId: { ...(prev.shareRatiosByTripId || {}), ...(tripId ? { [tripId]: shareRatios } : {}) },
      receipts: prev.receipts.map((r) => ({
        ...r,
        personId: r.personId === id ? fallback.id : r.personId,
        beneficiaryId: r.beneficiaryId === id ? undefined : r.beneficiaryId,
      })),
    }));
    setStatus('已移除旅伴，相關 receipt 已轉到第一位旅伴');
  }

  function resetShareRatios() {
    const ids = persons.map((person) => person.id);
    const equal = sharePercents(ids, {}); // {} → equal split summing to 100
    const nextRatios = Object.fromEntries(ids.map((id, idx) => [id, equal[idx]]));
    const tripId = currentTrip.id || state.activeTripId;
    updateState({
      shareRatios: nextRatios,
      shareRatiosByTripId: { ...(state.shareRatiosByTripId || {}), ...(tripId ? { [tripId]: nextRatios } : {}) },
    });
    setStatus('已重設為均分比例');
  }

  // Percentage sharing: the user edits each person's % except the LAST, whose share is auto-derived
  // as 100 − Σ(others). Always persists a complete N-person vector summing to 100, so the settlement
  // engine never sees a missing entry.
  function setPersonPercent(index: number, rawValue: number) {
    const ids = persons.map((person) => person.id);
    const lastIdx = ids.length - 1;
    if (index === lastIdx || lastIdx < 1) return;
    const next = sharePercents(ids, shareRatios);
    next[index] = Math.max(0, Math.min(100, Math.round(Number(rawValue) || 0)));
    let sumOthers = next.reduce((acc, v, idx) => (idx === lastIdx ? acc : acc + v), 0);
    if (sumOthers > 100) {
      next[index] = Math.max(0, next[index] - (sumOthers - 100));
      sumOthers = next.reduce((acc, v, idx) => (idx === lastIdx ? acc : acc + v), 0);
    }
    next[lastIdx] = Math.max(0, 100 - sumOthers);
    const nextRatios = Object.fromEntries(ids.map((id, idx) => [id, next[idx]]));
    const tripId = currentTrip.id || state.activeTripId;
    updateState({
      shareRatios: nextRatios,
      shareRatiosByTripId: { ...(state.shareRatiosByTripId || {}), ...(tripId ? { [tripId]: nextRatios } : {}) },
    });
  }

  return (
    <>
    <AccordionCard id="settings-people" title="旅伴 / 分帳比例" defaultOpen={false} meta={<span className="pill">{persons.length} 人</span>}>
      <p className="muted">分帳用百分比。填頭幾位嘅百分比，最後一位會自動計（100 − 其他總和）。預設全部均分。</p>
      {(() => {
        const pcts = personSharePercents;
        const lastIdx = persons.length - 1;
        return persons.map((p, idx) => (
          <div className="person-edit" key={p.id}>
            <AvatarBadge person={p} />
            <input value={p.name} onChange={(e) => updatePerson(p.id, { name: e.target.value })} aria-label={`${p.name} name`} />
            <input type="color" value={p.color} onChange={(e) => updatePerson(p.id, { color: e.target.value })} aria-label={`${p.name} color`} />
            <span className="person-share-field">
              <input
                type="number"
                min={0}
                max={100}
                value={pcts[idx] ?? 0}
                readOnly={idx === lastIdx}
                onChange={(e) => setPersonPercent(idx, clampFinite(e.target.value, 0, 0, 100))}
                aria-label={`${p.name} share percent`}
                title={idx === lastIdx ? (lastIdx >= 1 ? '最後一位自動計算' : '得一位旅伴，自動 100%') : undefined}
              />
              <small>%</small>
            </span>
            <button className="icon-btn" type="button" onClick={() => {
              if (!window.confirm(`確定刪除旅伴「${p.name}」？佢嘅帳單會轉去第一位旅伴。`)) return;
              removePerson(p.id);
            }} aria-label={`remove ${p.name}`}><Trash2 size={16} /></button>
          </div>
        ));
      })()}
      <div className="person-add">
        <input value={newPersonName} onChange={(e) => setNewPersonName(e.target.value)} placeholder="旅伴名字" />
        <button className="primary" type="button" onClick={addPerson}><Plus size={18} /> 新增</button>
      </div>
      <div className="mini-list">
        <span>比例總和：{personSharePercents.reduce((a, b) => a + b, 0)}% · Shared {tripPrefix}{Math.round(settlement.sharedTotal).toLocaleString()}</span>
        {settlement.transfers.map((t) => <span key={`${t.from.id}-${t.to.id}`}>{t.from.name} → {t.to.name} {tripPrefix}{Math.round(t.amount).toLocaleString()}</span>)}
        {!settlement.transfers.length && <span>暫時唔需要互相轉帳</span>}
        {settlement.balances.map((b) => <span key={b.id}>{b.name}: 已付 shared {tripPrefix}{Math.round(b.paidShared).toLocaleString()} · 應付 {tripPrefix}{Math.round(b.shouldPayShared).toLocaleString()}</span>)}
        {settlement.crossPrivate.map((item) => <span key={item.id}>私人代付：{item.payer.name} 幫 {item.beneficiary.name} 付 {tripPrefix}{Math.round(item.amount).toLocaleString()} · {item.store}</span>)}
      </div>
      <div className="action-row wrap">
        <button className="secondary" type="button" onClick={resetShareRatios}>重設為均分</button>
      </div>
    </AccordionCard>
    </>
  );
}
