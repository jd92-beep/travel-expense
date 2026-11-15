import { useLayoutEffect, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { Check, Download, Pencil, Plus, Trash2, Upload, Undo2, Luggage } from 'lucide-react';
import { CHECKLIST_GROUPS, CHECKLIST_LIMIT, checklistStorageKey, reconcileChecklist, downloadJourneyFile, mergeChecklist, parseChecklist, type ChecklistGroup, type ChecklistItem } from '../../lib/journeyTools';

import type { PackingSuggestion } from '../../lib/types';

function readChecklist(key: string, pocket: boolean, packing: PackingSuggestion[]) {
  try {
    const saved = localStorage.getItem(key);
    const result = reconcileChecklist(saved ? JSON.parse(saved) : null, pocket, packing);
    return { ...result, error: result.omitted ? `清單已滿，尚有 ${result.omitted} 項建議未加入。` : '', unreadable: false };
  } catch {
    return { items: [] as ChecklistItem[], seen: [] as string[], unreadable: true, error: '未能讀取此裝置的清單。請重新載入並檢查已備份的清單。原有資料未被覆蓋。' };
  }
}

export function JourneyChecklist({ scope, tripId, tripName, pocket, packing }: { scope: string; tripId: string; tripName: string; pocket: boolean; packing: PackingSuggestion[] }) {
  const storageKey = checklistStorageKey(scope, tripId);
  const [initial] = useState(() => readChecklist(storageKey, pocket, packing));
  const [items, setItems] = useState(initial.items);
  const currentItems = useRef(items);
  const mounted = useRef(false);
  useLayoutEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);
  const [error, setError] = useState(initial.error);
  const [notice, setNotice] = useState('');
  const [editing, setEditing] = useState<ChecklistItem | null>(null);
  const [removed, setRemoved] = useState<{ item: ChecklistItem; index: number } | null>(null);
  const [query, setQuery] = useState('');
  const [onlyPending, setOnlyPending] = useState(false);
  const [label, setLabel] = useState('');
  const [group, setGroup] = useState<ChecklistGroup>(pocket ? '證件與預訂' : '行前準備');
  const fileRef = useRef<HTMLInputElement>(null);
  const done = items.filter(item => item.done).length;

  const search = query.trim().toLocaleLowerCase();
  const visibleItems = items.filter(item => (!onlyPending || !item.done) &&
    `${item.group} ${item.label} ${item.note}`.toLocaleLowerCase().includes(search));

  function save(next: ChecklistItem[]) {
    if (initial.unreadable) return false;
    if (next.length > CHECKLIST_LIMIT) { setError(`清單最多 ${CHECKLIST_LIMIT} 項。`); return false; }
    try {
      localStorage.setItem(storageKey, JSON.stringify({ version: 1, items: next, seen: initial.seen }));
      currentItems.current = next;
      setItems(next);
      setError('');
      return true;
    } catch {
      setError('裝置儲存空間不足，剛才的修改未有儲存。請先匯出清單，再騰出空間。');
      return false;
    }
  }

  function addItem(event: FormEvent) {
    event.preventDefault();
    if (!label.trim()) return;
    if (items.length >= CHECKLIST_LIMIT) { setError(`清單最多 ${CHECKLIST_LIMIT} 項。`); return; }
    if (save([...items, { id: crypto.randomUUID(), label: label.trim(), group, note: '', done: false }])) setLabel('');
  }

  async function importItems(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (file.size > 256_000) { setError('清單檔案太大。請選擇少於 256 KB 的 JSON。'); return; }
    try {
      const imported = parseChecklist(JSON.parse(await file.text()));
      if (!mounted.current) return;
      const latest = currentItems.current;
      const next = mergeChecklist(latest, imported);
      if (save(next)) setNotice(`已加入 ${next.length - latest.length} 項；原有勾選狀態保持不變。`);
    } catch (error) { setError(error instanceof Error ? error.message : '未能匯入清單。'); }
  }

  return <section className="journey-checklist" aria-label="旅程清單">
    <header className="journey-section-heading"><div><h2>出發前，逐樣準備好</h2><p>{pocket ? '家庭冬遊清單 · 數量以兩位成人、一位幼兒、八日七夜為例，可按需要修改。' : '清單勾選及個人修改儲存在此裝置，按帳號及旅程分開。'}</p></div><Luggage size={32} strokeWidth={1.4} /></header>
    <div className="journey-check-progress"><span>已完成 <strong>{done} / {items.length}</strong></span><progress max={Math.max(1, items.length)} value={done} aria-label="清單完成進度" /></div>
    <div className="planner-check-filters"><label>搜尋用品<input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="名稱、分類或備註" /></label><label><input type="checkbox" checked={onlyPending} onChange={event => setOnlyPending(event.target.checked)} />只看未完成</label></div>
    {CHECKLIST_GROUPS.map((category, categoryIndex) => {
      const rows = items.filter(item => item.group === category);
      const visible = visibleItems.filter(item => item.group === category);
      if (!visible.length) return null;
      return <section key={category} data-group={categoryIndex} className="journey-check-group"><h3>{category}<span>{rows.filter(row => row.done).length} / {rows.length}</span></h3>
        {visible.map(item => <div className={`journey-check-row${item.done ? ' is-done' : ''}`} key={item.id}>
          <label><input type="checkbox" aria-label={item.label} checked={item.done} onChange={() => save(items.map(row => row.id === item.id ? { ...row, done: !row.done } : row))} /><span><strong>{item.label}</strong>{item.note && <small>{item.note}</small>}</span></label>
          <button type="button" className="journey-icon-button" aria-label={`編輯 ${item.label}`} onClick={() => setEditing(item)}><Pencil size={16} /></button>
          <button type="button" className="journey-icon-button" aria-label={`刪除 ${item.label}`} onClick={() => { const index = items.indexOf(item); if (save(items.filter(row => row.id !== item.id))) setRemoved({ item, index }); }}><Trash2 size={16} /></button>
        </div>)}
      </section>;
    })}
    {!visibleItems.length && <div className="journey-empty-inline" role="status">
      <p>{!items.length ? '清單未有用品，可在下面加入。' : onlyPending && !search ? '所有用品都已準備好。' : '沒有符合篩選的用品。'}</p>
      {(search || onlyPending) && <button type="button" className="secondary" onClick={() => { setQuery(''); setOnlyPending(false); }}>顯示全部用品</button>}
    </div>}
    {editing && <form className="journey-inline-form" aria-label="編輯清單項目" onSubmit={event => { event.preventDefault(); if (editing.label.trim() && save(items.map(row => row.id === editing.id ? { ...editing, done: row.done, label: editing.label.trim() } : row))) setEditing(null); }}>
      <label>項目名稱<input autoFocus required maxLength={160} value={editing.label} onChange={e => setEditing({ ...editing, label: e.target.value })} /></label>
      <label>備註<input maxLength={500} value={editing.note} onChange={e => setEditing({ ...editing, note: e.target.value })} placeholder="數量、放在哪裡…" /></label>
      <label>分類<select value={editing.group} onChange={e => setEditing({ ...editing, group: e.target.value as ChecklistGroup })}>{CHECKLIST_GROUPS.map(g => <option key={g}>{g}</option>)}</select></label>
      <div className="action-row"><button type="button" className="secondary" onClick={() => setEditing(null)}>取消</button><button type="submit" className="primary"><Check size={16} /> 儲存項目</button></div>
    </form>}
    <form className="journey-check-add" onSubmit={addItem}>
      <label>新增項目<input aria-label="新增清單項目" maxLength={160} value={label} onChange={e => setLabel(e.target.value)} placeholder="例如：行動電源" required /></label>
      <label>分類<select value={group} onChange={e => setGroup(e.target.value as ChecklistGroup)}>{CHECKLIST_GROUPS.map(g => <option key={g}>{g}</option>)}</select></label>
      <button type="submit" className="primary" disabled={!label.trim()}><Plus size={17} /> 加入清單</button>
    </form>
    {removed && <div className="journey-feedback" role="status"><span>已移除「{removed.item.label}」</span><button type="button" className="journey-text-action" onClick={() => { const next = [...items]; next.splice(removed.index, 0, removed.item); if (save(next)) setRemoved(null); }}><Undo2 size={16} /> 復原</button></div>}
    {error && <p className="journey-feedback is-error" role="alert">{error}</p>}
    {notice && <p className="journey-feedback" role="status">{notice}</p>}
    <footer className="journey-tool-footer"><button type="button" className="secondary" onClick={() => downloadJourneyFile(JSON.stringify({ version: 1, items }, null, 2), `${tripName}-清單.json`, 'application/json')}><Download size={16} /> 匯出清單</button><button type="button" className="secondary" onClick={() => fileRef.current?.click()}><Upload size={16} /> 匯入清單</button><input type="file" accept=".json,application/json" ref={fileRef} onChange={importItems} className="visually-hidden-file" aria-label="匯入清單檔案" /></footer>
  </section>;
}
