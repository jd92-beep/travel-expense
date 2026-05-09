import { AlertTriangle, CheckCircle2, Cloud, Copy, Download, KeyRound, Plane, Plus, RotateCcw, Server, ShieldCheck, Sparkles, Trash2, Upload } from 'lucide-react';
import type { Dispatch, SetStateAction } from 'react';
import { useRef, useState, version as reactVersion } from 'react';
import { AccordionCard } from '../components/AccordionCard';
import { AvatarBadge } from '../components/AvatarBadge';
import { parseTripParagraph, testGoogleBackupConnection, testKimiConnection } from '../lib/ai';
import { activeTrip, migrateAppState } from '../domain/trip/normalize';
import { AI_MODELS, ITINERARY } from '../lib/constants';
import {
  brokerHealth,
  getConnectionStatus,
  hasCredentialBrokerSession,
  isAllowedCredentialBrokerUrl,
  redactedError,
  rotateProviderCredential,
  type CredentialProvider,
  type ConnectionStatus,
  type ProviderStatus,
} from '../lib/credentialBroker';
import { fetchLiveCurrencySnapshot, SUPPORTED_CURRENCIES } from '../lib/currency';
import { computeSettlements, downloadJson, exportCsv, getItinerary, getPersons, isPendingReceipt, validateItinerary } from '../lib/domain';
import { migrateNotionSchema, pullAll, pushSettingsMeta, pushTripPage, testNotion } from '../lib/notion';
import type { AppState, Person, SyncEngineState, TripDraft, TripProfile } from '../lib/types';
import { clearCredentialSession, saveState, stripSensitiveState } from '../lib/storage';
import { clearDeviceTrust } from '../security/deviceTrust';
import { GlassCard, StatefulActionButton, StatusPill, Toast } from '../components/ui';

const COLORS = ['#CC2929', '#FF91A4', '#2D5A8E', '#059669', '#D97706', '#7C3AED', '#0891B2', '#DB2777'];

export function Settings({
  state,
  setState,
  updateState,
  onReset,
  syncState,
  onPull,
  onPush,
}: {
  state: AppState;
  setState: Dispatch<SetStateAction<AppState>>;
  updateState: (patch: Partial<AppState>) => void;
  onReset: () => void;
  syncState?: SyncEngineState;
  onPull?: () => Promise<void>;
  onPush?: () => Promise<void>;
}) {
  const persons = getPersons(state);
  const currentTrip = activeTrip(state);
  const trips = state.trips?.length ? state.trips : [currentTrip];
  const activeTripSettlementState = {
    ...state,
    receipts: state.receipts.filter((receipt) => !receipt.tripId || receipt.tripId === currentTrip.id),
  };
  const settlement = computeSettlements(activeTripSettlementState);
  const ratioTotal = persons.reduce((sum, person) => sum + Math.max(0, Number(state.shareRatios[person.id]) || 0), 0);
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState('');
  const [newPersonName, setNewPersonName] = useState('');
  const [tripParagraph, setTripParagraph] = useState('');
  const [tripDraft, setTripDraft] = useState<TripDraft | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus | null>(null);
  const [rotationProvider, setRotationProvider] = useState<CredentialProvider>('notion');
  const [rotationSecret, setRotationSecret] = useState('');
  const [rotationAdmin, setRotationAdmin] = useState('');
  const [rotationDb, setRotationDb] = useState(state.notionDb || '');
  const itineraryInput = useRef<HTMLInputElement | null>(null);
  const backupInput = useRef<HTMLInputElement | null>(null);
  const brokerReady = hasCredentialBrokerSession(state);
  const buildLabel = `${import.meta.env.MODE} · React ${reactVersion}`;

  async function run(label: string, fn: () => Promise<string>) {
    setBusy(label);
    setStatus(`${label}…`);
    try {
      setStatus(await fn());
    } catch (error) {
      setStatus(`${label}失敗：${redactedError(error)}`);
    } finally {
      setBusy('');
    }
  }

  function statusFor(provider: CredentialProvider): ProviderStatus {
    return connectionStatus?.providers.find((item) => item.provider === provider) || { provider, status: 'unknown' };
  }

  function statusPill(provider: CredentialProvider) {
    const item = statusFor(provider);
    const ok = item.status === 'connected';
    return <span className={`pill ${ok ? 'ok' : item.status === 'missing' ? '' : 'hot'}`}>{ok ? <CheckCircle2 size={14} /> : <AlertTriangle size={14} />} {provider}: {item.status}</span>;
  }

  async function refreshCredentialStatus() {
    await run('Credential status', async () => {
      const [health, statusResult] = await Promise.all([
        brokerHealth(state),
        getConnectionStatus(state),
      ]);
      setConnectionStatus(statusResult);
      return `${health} · ${statusResult.providers.map((item) => `${item.provider}:${item.status}`).join(' · ')}`;
    });
  }

  async function rotateCredential() {
    if (!requireBroker('Rotate credential')) return;
    if (!rotationSecret.trim() || !rotationAdmin.trim()) {
      setStatus('請輸入新 credential 同 admin maintenance passphrase');
      return;
    }
    await run(`Rotate ${rotationProvider}`, async () => {
      const statusResult = await rotateProviderCredential(
        state,
        rotationProvider,
        rotationSecret,
        rotationAdmin,
        rotationProvider === 'notion' ? { databaseId: rotationDb.trim() || state.notionDb } : {},
      );
      setRotationSecret('');
      setRotationAdmin('');
      setConnectionStatus((prev) => ({
        broker: prev?.broker || 'online',
        providers: [
          ...(prev?.providers || []).filter((item) => item.provider !== rotationProvider),
          statusResult,
        ],
      }));
      return `${rotationProvider} 已安全更新：${statusResult.status}`;
    });
  }

  async function refreshRate() {
    await run('更新匯率', async () => {
      const snapshot = await fetchLiveCurrencySnapshot();
      updateState({ rate: Number(snapshot.rates.JPY.toFixed(4)) });
      return `已更新：1 HKD = ${snapshot.rates.JPY.toFixed(2)} JPY（${snapshot.source}）`;
    });
  }

  function requireBroker(label: string) {
    if (brokerReady) return true;
    setStatus(`${label} 已安全暫停：Credential Broker session 未連線；未送出任何 provider key/token。`);
    return false;
  }

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
    updateState({ persons: [...persons, next], shareRatios: { ...state.shareRatios, [next.id]: 1 } });
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
    setState((prev) => ({
      ...prev,
      persons: persons.filter((p) => p.id !== id),
      shareRatios,
      receipts: prev.receipts.map((r) => ({
        ...r,
        personId: r.personId === id ? fallback.id : r.personId,
        beneficiaryId: r.beneficiaryId === id ? undefined : r.beneficiaryId,
      })),
    }));
    setStatus('已移除旅伴，相關 receipt 已轉到第一位旅伴');
  }

  function resetShareRatios() {
    updateState({ shareRatios: Object.fromEntries(persons.map((person) => [person.id, 1])) });
    setStatus('已重設為均分比例');
  }

  function saveLocalSettingsNow() {
    saveState(migrateAppState(state));
    setStatus('本機設定已保存；provider credentials/session 已自動排除。');
  }

  async function pullPendingEmail() {
    if (!requireBroker('Pull pending email')) return;
    await run('Pull pending email', async () => {
      const pulled = await pullAll(state);
      const pending = pulled.filter(isPendingReceipt);
      if (pending.length) {
        setState((prev) => {
          const map = new Map(prev.receipts.map((receipt) => [receipt.id, receipt]));
          for (const receipt of pending) map.set(receipt.id, { ...map.get(receipt.id), ...receipt });
          return migrateAppState({ ...prev, receipts: [...map.values()] });
        });
      }
      return pending.length ? `已拉取 ${pending.length} 筆待確認 email 紀錄` : `已同步檢查 ${pulled.length} 筆，暫時無待確認 email`;
    });
  }

  function selectTrip(tripId: string) {
    const trip = trips.find((item) => item.id === tripId);
    if (!trip) return;
    const selectedTrip = { ...trip, archived: false, active: true, updatedAt: Date.now() };
    updateState({
      activeTripId: selectedTrip.id,
      trips: trips.map((item) => item.id === selectedTrip.id ? selectedTrip : { ...item, active: false }),
      tripName: selectedTrip.name,
      tripDateRange: { start: selectedTrip.startDate, end: selectedTrip.endDate },
      tripCurrency: selectedTrip.currencies.find((code) => code !== 'HKD') || state.tripCurrency,
      customItinerary: selectedTrip.itinerary,
    });
  }

  function applyTripDraft(draft: TripDraft) {
    setState((prev) => {
      const prevTrips = prev.trips?.length ? prev.trips : [activeTrip(prev)];
      const exists = prevTrips.some((trip) => trip.id === draft.trip.id);
      const tripsNext = exists
        ? prevTrips.map((trip) => trip.id === draft.trip.id ? { ...draft.trip, active: true, archived: false } : { ...trip, active: false })
        : [...prevTrips.map((trip) => ({ ...trip, active: false })), { ...draft.trip, active: true, archived: false }];
      return migrateAppState({
        ...prev,
        activeTripId: draft.trip.id,
        trips: tripsNext,
        tripName: draft.trip.name,
        tripDateRange: { start: draft.trip.startDate, end: draft.trip.endDate },
        tripCurrency: draft.trip.currencies.find((code) => code !== 'HKD') || prev.tripCurrency,
        customItinerary: draft.trip.itinerary,
        syncQueue: [...(prev.syncQueue || []), {
          id: `sync_${Date.now()}_${Math.random().toString(16).slice(2)}`,
          type: 'trip',
          entityId: draft.trip.id,
          op: exists ? 'update' : 'create',
          status: 'queued',
          attempts: 0,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        }].slice(-500),
      });
    });
    setTripDraft(null);
    setStatus(`已套用旅程：${draft.trip.name}`);
  }

  function toggleArchiveTrip(trip: TripProfile) {
    setState((prev) => {
      const prevTrips = prev.trips?.length ? prev.trips : [activeTrip(prev)];
      const willArchive = !trip.archived;
      if (willArchive && prevTrips.filter((item) => item.id !== trip.id && !item.archived).length === 0) {
        setStatus('最少要保留一個未封存旅程');
        return prev;
      }
      const updated = prevTrips.map((item) => item.id === trip.id ? { ...item, archived: willArchive, active: false, updatedAt: Date.now() } : item);
      const nextActive = willArchive
        ? updated.find((item) => !item.archived && item.id !== trip.id) || updated.find((item) => !item.archived)
        : updated.find((item) => item.id === trip.id);
      const tripsNext = updated.map((item) => ({ ...item, active: item.id === nextActive?.id }));
      if (!nextActive) return { ...prev, trips: tripsNext };
      return {
        ...prev,
        trips: tripsNext,
        activeTripId: nextActive.id,
        tripName: nextActive.name,
        tripDateRange: { start: nextActive.startDate, end: nextActive.endDate },
        tripCurrency: nextActive.currencies.find((code) => code !== 'HKD') || prev.tripCurrency,
        customItinerary: nextActive.itinerary,
      };
    });
  }

  function updateCurrentTrip(patch: Partial<TripProfile>) {
    const nextTrip = { ...currentTrip, ...patch, version: currentTrip.version + 1, updatedAt: Date.now() };
    updateState({
      trips: trips.map((trip) => trip.id === currentTrip.id ? nextTrip : trip),
      tripName: nextTrip.name,
      tripDateRange: { start: nextTrip.startDate, end: nextTrip.endDate },
      tripCurrency: nextTrip.currencies.find((code) => code !== 'HKD') || state.tripCurrency,
      customItinerary: nextTrip.itinerary,
    });
  }

  function safeBackupState() {
    return stripSensitiveState(state);
  }

  async function importItinerary(file?: File) {
    if (!file) return;
    try {
      const parsed = JSON.parse(await file.text());
      const result = validateItinerary(parsed);
      if (!result.ok) throw new Error(result.error);
      const nextTrip = {
        ...currentTrip,
        itinerary: result.itinerary,
        startDate: result.itinerary[0].date,
        endDate: result.itinerary[result.itinerary.length - 1].date,
        version: currentTrip.version + 1,
        updatedAt: Date.now(),
      };
      updateState({
        trips: trips.map((trip) => trip.id === currentTrip.id ? nextTrip : trip),
        customItinerary: result.itinerary,
        itineraryOverrides: {},
        tripDateRange: { start: nextTrip.startDate, end: nextTrip.endDate },
      });
      setStatus(`已匯入 ${result.itinerary.length} 日行程`);
    } catch (error) {
      setStatus(`行程匯入失敗：${error instanceof Error ? error.message : String(error)}`);
    } finally {
      if (itineraryInput.current) itineraryInput.current.value = '';
    }
  }

  async function copyShortcutUrl() {
    const url = `shortcuts://run-shortcut?name=${encodeURIComponent('Travel Expense Email')}&input=${encodeURIComponent('ftjdfr+expense@gmail.com')}`;
    await copyText(url, '已複製 Shortcut URL 範本');
  }

  async function copyText(text: string, ok: string) {
    try {
      if (!navigator.clipboard?.writeText) throw new Error('clipboard unavailable');
      await navigator.clipboard.writeText(text);
      setStatus(ok);
    } catch {
      setStatus(text);
    }
  }

  async function importBackup(file?: File) {
    if (!file) return;
    try {
      const payload = JSON.parse(await file.text()) as Partial<AppState>;
      const { credentialBrokerUrl: _credentialBrokerUrl, ...safePayload } = stripSensitiveState(payload) as Partial<AppState> & { credentialBrokerUrl?: unknown };
      setState((prev) => migrateAppState({ ...prev, ...safePayload, receipts: Array.isArray(safePayload.receipts) ? safePayload.receipts : prev.receipts }));
      setStatus(`已匯入 backup：${Array.isArray(safePayload.receipts) ? safePayload.receipts.length : state.receipts.length} 筆`);
    } catch (error) {
      setStatus(`Backup 匯入失敗：${error instanceof Error ? error.message : String(error)}`);
    } finally {
      if (backupInput.current) backupInput.current.value = '';
    }
  }

  return (
    <section className="stack settings-tab">
      <GlassCard className="settings-command">
        <div>
          <small className="eyebrow">CONTROL CENTER</small>
          <h2>設定控制中心</h2>
          <p>旅程、Kimi/Google、Notion、分帳、backup 同安全控制集中喺呢度；所有設定卡片都可以展開/收合。</p>
          <div className="stats-status-row">
            <StatusPill tone="info"><Plane size={14} /> {trips.length} 個旅程</StatusPill>
            <StatusPill tone={brokerReady ? 'ok' : 'warning'}><Server size={14} /> Broker {brokerReady ? 'session active' : 'session missing'}</StatusPill>
            {syncState && <StatusPill tone={syncState.status === 'error' ? 'danger' : syncState.pendingCount ? 'warning' : 'ok'}><Cloud size={14} /> Sync {syncState.status}{syncState.pendingCount ? ` · ${syncState.pendingCount}` : ''}</StatusPill>}
            <StatusPill tone="neutral"><ShieldCheck size={14} /> {buildLabel}</StatusPill>
          </div>
        </div>
      </GlassCard>

      <AccordionCard id="settings-trip" eyebrow="Active Trip" title="旅程設定" meta={<span className="pill">v{currentTrip.version}</span>} defaultOpen>
        <label>切換旅程
          <select value={currentTrip.id} onChange={(e) => selectTrip(e.target.value)}>
            {trips.map((trip) => <option key={trip.id} value={trip.id}>{trip.archived ? '封存 · ' : ''}{trip.name} · {trip.startDate}</option>)}
          </select>
        </label>
        <div className="form-grid">
          <label>旅程名
            <input value={currentTrip.name} onChange={(e) => updateCurrentTrip({ name: e.target.value })} />
          </label>
          <label>目的地摘要
            <input value={currentTrip.destinationSummary} onChange={(e) => updateCurrentTrip({ destinationSummary: e.target.value })} />
          </label>
        </div>
        <div className="form-grid">
          <label>開始
            <input type="date" value={currentTrip.startDate} onChange={(e) => updateCurrentTrip({ startDate: e.target.value })} />
          </label>
          <label>結束
            <input type="date" value={currentTrip.endDate} onChange={(e) => updateCurrentTrip({ endDate: e.target.value })} />
          </label>
        </div>
        <div className="form-grid">
          <label>匯率（1 HKD = JPY）
            <input type="number" value={state.rate} onChange={(e) => updateState({ rate: Number(e.target.value) || 20.36 })} />
          </label>
          <label>目的地貨幣
            <select value={state.tripCurrency} onChange={(e) => updateCurrentTrip({ currencies: Array.from(new Set(['HKD', e.target.value])) })}>
              {SUPPORTED_CURRENCIES.map((code) => <option key={code} value={code}>{code}</option>)}
            </select>
          </label>
        </div>
        <div className="form-grid">
          <label>Live rate
            <button className="secondary" type="button" disabled={!!busy} onClick={refreshRate}>
              {busy === '更新匯率' ? <RotateCcw size={18} className="spin" /> : <RotateCcw size={18} />} 更新即時匯率
            </button>
          </label>
          <label>旅程狀態
            <button className="secondary" type="button" onClick={() => toggleArchiveTrip(currentTrip)}>
              {currentTrip.archived ? '恢復旅程' : '封存旅程'}
            </button>
          </label>
        </div>
        <label>預算 JPY
          <input type="number" value={state.budget} onChange={(e) => updateState({ budget: Number(e.target.value) || 0 })} />
        </label>
        <label>預算 HKD
          <input type="number" value={Math.round((Number(state.budget) || 0) / Math.max(0.1, Number(state.rate) || 20.36))} onChange={(e) => updateState({ budget: Math.round((Number(e.target.value) || 0) * Math.max(0.1, Number(state.rate) || 20.36)) })} />
        </label>
        <label className="check-row">
          <input type="checkbox" checked={state.statsIncludeTransportLodging} onChange={(e) => updateState({ statsIncludeTransportLodging: e.target.checked })} />
          反轉首頁統計：總消費排除機票/住宿，今日/日均包括全部
        </label>
        <label className="check-row">
          <input type="checkbox" checked={state.top10IncludeBigItems} onChange={(e) => updateState({ top10IncludeBigItems: e.target.checked })} />
          TOP 10 包括機票/住宿/大型交通
        </label>
      </AccordionCard>

      <AccordionCard id="settings-trip-update" eyebrow="Kimi Trip Update" title="行程更新卡片" icon={<Sparkles />} defaultOpen>
        <p className="muted">貼入新旅程或補充行程 paragraph，AI 會先產生 preview；確認後先會更新本機 trip，同步時會建立/更新 Notion trip note。</p>
        <textarea
          rows={6}
          value={tripParagraph}
          onChange={(e) => setTripParagraph(e.target.value)}
          placeholder="例：下次 2026-07-10 至 2026-07-15 去首爾，第一晚住弘大..."
        />
        <div className="action-row wrap">
          <button
            className="primary"
            type="button"
            disabled={!tripParagraph.trim() || !!busy}
            onClick={() => run('分析行程', async () => {
              const draft = await parseTripParagraph(tripParagraph, state);
              setTripDraft(draft);
              return `已產生 preview：${draft.trip.name}`;
            })}
          >
            <Plane size={18} /> 用 Kimi 分析
          </button>
          {tripDraft && <button className="secondary" type="button" onClick={() => setTripDraft(null)}>清除 preview</button>}
        </div>
        {tripDraft && (
          <div className="trip-preview">
            <h3>{tripDraft.trip.name}</h3>
            <p className="muted">{tripDraft.summary}</p>
            <div className="mini-list">
              <span>{tripDraft.trip.startDate} → {tripDraft.trip.endDate}</span>
              <span>{tripDraft.trip.destinationSummary}</span>
              <span>{tripDraft.trip.itinerary.length} 日 · {tripDraft.trip.currencies.join(', ')}</span>
              {tripDraft.changes.map((change) => <span key={change}>{change}</span>)}
              {tripDraft.warnings.map((warning) => <span key={warning}>Warning: {warning}</span>)}
            </div>
            <div className="action-row wrap">
              <button className="primary" type="button" onClick={() => applyTripDraft(tripDraft)}>套用到 React</button>
              <button className="secondary" type="button" disabled={!!busy} onClick={() => {
                if (!requireBroker('建立 Notion Trip')) return;
                void run('建立 Notion Trip', async () => {
                const synced = await pushTripPage(state, tripDraft.trip);
                applyTripDraft({ ...tripDraft, trip: synced });
                return `Notion trip note 已更新：${synced.name}`;
                });
              }}>套用並同步 Notion</button>
            </div>
          </div>
        )}
      </AccordionCard>

      <AccordionCard id="settings-itinerary-json" title="行程 JSON" meta={<span className="pill">{getItinerary(state).length} 日</span>}>
        <input ref={itineraryInput} hidden type="file" accept="application/json,.json" onChange={(e) => importItinerary(e.target.files?.[0])} />
        <div className="action-row wrap">
          <button className="secondary" type="button" onClick={() => downloadJson(`${state.tripName || 'trip'}-itinerary.json`, getItinerary(state))}><Download size={18} /> 匯出行程</button>
          <button className="secondary" type="button" onClick={() => itineraryInput.current?.click()}><Upload size={18} /> 匯入行程</button>
          <button className="danger" type="button" onClick={() => updateState({ customItinerary: null, itineraryOverrides: {}, tripDateRange: { start: ITINERARY[0].date, end: ITINERARY[ITINERARY.length - 1].date } })}><RotateCcw size={18} /> 還原預設</button>
        </div>
      </AccordionCard>

      <AccordionCard id="settings-people" title="旅伴 / 分帳比例" meta={<span className="pill">{persons.length} 人</span>}>
        {persons.map((p) => (
          <div className="person-edit" key={p.id}>
            <AvatarBadge person={p} />
            <input value={p.name} onChange={(e) => updatePerson(p.id, { name: e.target.value })} aria-label={`${p.name} name`} />
            <input type="color" value={p.color} onChange={(e) => updatePerson(p.id, { color: e.target.value })} aria-label={`${p.name} color`} />
            <input type="number" min={0} value={state.shareRatios[p.id] ?? 1} onChange={(e) => updateState({ shareRatios: { ...state.shareRatios, [p.id]: Number(e.target.value) } })} aria-label={`${p.name} ratio`} />
            <button className="icon-btn" type="button" onClick={() => removePerson(p.id)} aria-label={`remove ${p.name}`}><Trash2 size={16} /></button>
          </div>
        ))}
        <div className="person-add">
          <input value={newPersonName} onChange={(e) => setNewPersonName(e.target.value)} placeholder="旅伴名字" />
          <button className="primary" type="button" onClick={addPerson}><Plus size={18} /> 新增</button>
        </div>
        <div className="mini-list">
          <span>比例總和：{ratioTotal || 0} · Shared ¥{Math.round(settlement.sharedTotal).toLocaleString()}</span>
          {settlement.transfers.map((t) => <span key={`${t.from.id}-${t.to.id}`}>{t.from.name} → {t.to.name} ¥{Math.round(t.amount).toLocaleString()}</span>)}
          {!settlement.transfers.length && <span>暫時唔需要互相轉帳</span>}
          {settlement.balances.map((b) => <span key={b.id}>{b.name}: 已付 shared ¥{Math.round(b.paidShared).toLocaleString()} · 應付 ¥{Math.round(b.shouldPayShared).toLocaleString()}</span>)}
          {settlement.crossPrivate.map((item) => <span key={item.id}>私人代付：{item.payer.name} 幫 {item.beneficiary.name} 付 ¥{Math.round(item.amount).toLocaleString()} · {item.store}</span>)}
        </div>
        <div className="action-row wrap">
          <button className="secondary" type="button" onClick={resetShareRatios}>重設為均分</button>
        </div>
      </AccordionCard>

      <AccordionCard id="settings-credentials" eyebrow="Server-side vault" title="Credentials & Connection" icon={<KeyRound />} defaultOpen>
        <p className="muted">Notion、Kimi、Google keys 只喺 Credential Broker vault 入面。React 只保存短期 session；rotation input 唔會寫入 localStorage、IndexedDB、backup 或 Notion。</p>
        <label>Credential Broker URL
          <input value={isAllowedCredentialBrokerUrl(state.credentialBrokerUrl) ? state.credentialBrokerUrl || '' : ''} readOnly aria-readonly="true" />
        </label>
        <div className="credential-status-grid">
          <span className={`pill ${brokerReady ? 'ok' : 'hot'}`}><Server size={14} /> Session: {brokerReady ? 'active' : 'missing'}</span>
          {statusPill('notion')}
          {statusPill('kimi')}
          {statusPill('google')}
        </div>
        <div className="action-row wrap">
          <button className="secondary" type="button" disabled={!!busy} onClick={refreshCredentialStatus}>
            Test all connections
          </button>
          <button className="secondary" type="button" disabled={!!busy} onClick={() => run('測試 Kimi', async () => testKimiConnection(state))}>
            Test Kimi
          </button>
          <button className="secondary" type="button" disabled={!!busy} onClick={() => run('測試 Google backup', async () => testGoogleBackupConnection(state))}>
            Test Google
          </button>
        </div>
        <div className="rotation-box">
          <div className="form-grid">
            <label>Provider
              <select value={rotationProvider} onChange={(e) => setRotationProvider(e.target.value as CredentialProvider)}>
                <option value="notion">Notion token</option>
                <option value="kimi">Kimi key</option>
                <option value="google">Google backup key</option>
              </select>
            </label>
            <label>Admin maintenance passphrase
              <input type="password" value={rotationAdmin} onChange={(e) => setRotationAdmin(e.target.value)} autoComplete="off" />
            </label>
          </div>
          <label>New credential
            <input type="password" value={rotationSecret} onChange={(e) => setRotationSecret(e.target.value)} autoComplete="off" placeholder="Only sent once to Credential Broker" />
          </label>
          {rotationProvider === 'notion' && (
            <label>Notion database ID（可選）
              <input value={rotationDb} onChange={(e) => setRotationDb(e.target.value)} />
            </label>
          )}
          <button className="primary" type="button" disabled={!!busy} onClick={rotateCredential}>
            <ShieldCheck size={18} /> Rotate safely
          </button>
        </div>
      </AccordionCard>

      <AccordionCard id="settings-ai-models" eyebrow="Model routing" title="AI 模型選擇" icon={<Sparkles />}>
        <p className="muted">Kimi / kimi-code 係 primary；Google backup 經 Credential Broker fallback。Provider keys 不會進入 React state。</p>
        <div className="form-grid">
          <label>Scan model
            <select value={state.scanModel} onChange={(e) => updateState({ scanModel: e.target.value })}>
              {AI_MODELS.map((model) => <option key={model.id} value={model.id}>{model.name}</option>)}
            </select>
          </label>
          <label>Voice model
            <select value={state.voiceModel} onChange={(e) => updateState({ voiceModel: e.target.value })}>
              {AI_MODELS.map((model) => <option key={model.id} value={model.id}>{model.name}</option>)}
            </select>
          </label>
        </div>
        <label>Email model
          <select value={state.emailModel} onChange={(e) => updateState({ emailModel: e.target.value })}>
            {AI_MODELS.map((model) => <option key={model.id} value={model.id}>{model.name}</option>)}
          </select>
        </label>
        <label>Trip update model
          <select value={state.tripUpdateModel || state.scanModel} onChange={(e) => updateState({ tripUpdateModel: e.target.value })}>
            {AI_MODELS.map((model) => <option key={model.id} value={model.id}>{model.name}</option>)}
          </select>
        </label>
        <label>Google backup model
          <input value={state.googleBackupModel || ''} onChange={(e) => updateState({ googleBackupModel: e.target.value })} />
        </label>
      </AccordionCard>

      <AccordionCard id="settings-notion" title="Notion Sync" icon={<Cloud />} defaultOpen>
        <label>Database ID
          <input value={state.notionDb} onChange={(e) => updateState({ notionDb: e.target.value })} />
        </label>
        <label className="check-row">
          <input type="checkbox" checked={state.autoSync} onChange={(e) => updateState({ autoSync: e.target.checked })} />
          儲存 receipt 後自動同步
        </label>
        <div className="action-row wrap">
          <button className="secondary" type="button" disabled={!!busy} onClick={saveLocalSettingsNow}>Save Local Settings</button>
          <button className="secondary" type="button" disabled={!!busy} onClick={() => {
            if (!requireBroker('測試 Notion')) return;
            void run('測試 Notion', async () => `連線正常：${await testNotion(state)}`);
          }}>測試</button>
          <StatefulActionButton className="secondary" type="button" disabled={!!busy} onClick={() => {
            if (!requireBroker('Pull')) return;
            void run('Pull', async () => {
            await onPull?.();
            return '已透過 Sync Engine 拉取 Notion 資料';
            });
          }}><Download size={18} /> Pull</StatefulActionButton>
          <StatefulActionButton className="primary" type="button" disabled={!!busy} onClick={() => {
            if (!requireBroker('Push')) return;
            void run('Push', async () => {
              await onPush?.();
              return '已透過 Sync Engine 推送 pending queue';
            });
          }}>
            <Upload size={18} /> Push All
          </StatefulActionButton>
          <button className="secondary" type="button" disabled={!!busy} onClick={() => {
            saveLocalSettingsNow();
            if (!requireBroker('Save & Push Settings')) return;
            void run('Save & Push Settings', async () => {
            await pushSettingsMeta(state);
            return '已推送 non-secret settings meta row';
            });
          }}>Save & Push Settings</button>
          <button className="secondary" type="button" disabled={!!busy} onClick={() => {
            if (!requireBroker('Schema migrate')) return;
            void run('Schema', async () => migrateNotionSchema(state));
          }}>美化 Schema</button>
        </div>
      </AccordionCard>

      <AccordionCard id="settings-email" title="Email / Shortcut" icon={<Copy />}>
        <p className="muted">Forward email 去 ftjdfr+expense@gmail.com；或者用 Shortcut URL 將文字送入同一流程。</p>
        <div className="action-row wrap">
          <button className="secondary" type="button" disabled={!!busy} onClick={() => void pullPendingEmail()}><Download size={18} /> Pull pending email</button>
          <button className="secondary" type="button" onClick={copyShortcutUrl}><Copy size={18} /> 複製 Shortcut URL</button>
          <button className="secondary" type="button" onClick={() => copyText('ftjdfr+expense@gmail.com', '已複製 Gmail 地址')}><Copy size={18} /> 複製 Gmail</button>
        </div>
      </AccordionCard>

      <AccordionCard id="settings-data" title="資料管理 / Security" icon={<ShieldCheck />}>
        <input ref={backupInput} hidden type="file" accept="application/json,.json" onChange={(e) => importBackup(e.target.files?.[0])} />
        <div className="action-row wrap">
          <button className="secondary" type="button" onClick={() => exportCsv(state)}><Download size={18} /> 匯出 CSV</button>
          <button className="secondary" type="button" onClick={() => downloadJson(`${currentTrip.name || 'travel-expense'}-backup.json`, safeBackupState())}><Download size={18} /> 匯出 Backup JSON</button>
          <button className="secondary" type="button" onClick={() => backupInput.current?.click()}><Upload size={18} /> 匯入 Backup JSON</button>
          <button className="danger" type="button" onClick={() => { clearCredentialSession(); updateState({ credentialSession: '', credentialSessionExpiresAt: 0 }); }}><KeyRound size={18} /> 清除 broker session</button>
          <button className="danger" type="button" onClick={() => { clearDeviceTrust(); setStatus('已清除此裝置信任，下次開 app 會重新鎖定。'); }}><ShieldCheck size={18} /> 清除裝置信任</button>
          <button className="danger" type="button" onClick={() => window.confirm('確定清除 React 本地紀錄？') && onReset()}><RotateCcw size={18} /> 清除本地資料</button>
        </div>
        <div className="mini-list">
          <span>Build: {buildLabel}</span>
          <span>Backup / CSV 不包含 provider API key、Notion token、broker session 或解鎖 secret。</span>
        </div>
      </AccordionCard>

      {status && <Toast tone={/失敗|未連線|暫停|請輸入/.test(status) ? 'warning' : 'success'}>{status}</Toast>}
    </section>
  );
}
