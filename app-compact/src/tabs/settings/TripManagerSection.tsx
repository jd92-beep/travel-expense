import { AlertTriangle, CheckCircle2, ChevronDown, MapPin, Plus, Sparkles, Trash2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { AccordionCard } from '../../components/AccordionCard';
import { activeTrip, createTripProfile, migrateAppState, normalizeTripIntelligence, switchTrip } from '../../domain/trip/normalize';
import { perHkdForCurrency, SUPPORTED_CURRENCIES } from '../../lib/currency';
import { getItinerary } from '../../lib/domain';
import { receiptSourceTombstoneKey } from '../../lib/syncMerge';
import { enqueueChange } from '../../lib/changeJournal';
import type { AppState, Person, TripDraft, TripProfile } from '../../lib/types';
import { useTripTheme } from '../../theme/tripTheme';
import { nonHomeCurrency, type SettingsContext } from './shared';
import { clampFinite } from './backup';

export function TripManagerSection({ ctx, openTripDraft }: { ctx: SettingsContext; openTripDraft: (draft: TripDraft) => void }) {
  const { state, setState, updateState, setStatus, currentTrip, trips } = ctx;
  const nonHomeCurrencyForTrip = (trip: Partial<TripProfile> | undefined, fallback = 'JPY') => nonHomeCurrency(state, trip, fallback);
  const { theme } = useTripTheme();
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  // Local state for Trip Manager
  const [managerTripId, setManagerTripId] = useState(currentTrip.id);
  const managedTrip = trips.find(t => t.id === managerTripId) || currentTrip;
  // Only the owner/admin of a shared trip may delete it (RLS enforces this server-side too).
  const canDeleteManagedTrip = !managedTrip.sharing || managedTrip.sharing.role === 'owner' || managedTrip.sharing.role === 'admin';

  const [mgrName, setMgrName] = useState(managedTrip.name);
  const [mgrDest, setMgrDest] = useState(managedTrip.destinationSummary || '');
  const [mgrStart, setMgrStart] = useState(managedTrip.startDate || '');
  const [mgrEnd, setMgrEnd] = useState(managedTrip.endDate || '');
  const [mgrBudget, setMgrBudget] = useState(String(managedTrip.budget || 0));
  const [mgrCurrency, setMgrCurrency] = useState(nonHomeCurrencyForTrip(managedTrip));
  const [mgrArchived, setMgrArchived] = useState(!!managedTrip.archived);
  const [mgrTripStyle, setMgrTripStyle] = useState(managedTrip.intelligence?.tripStyle || 'balanced');
  const [mgrHomeCity, setMgrHomeCity] = useState(managedTrip.intelligence?.homeCity || 'Hong Kong');
  const [mgrWeatherPreference, setMgrWeatherPreference] = useState(managedTrip.intelligence?.weatherPreference || 'balanced');
  const managedTripVersionKey = `${managedTrip.id}:${managedTrip.updatedAt || 0}:${managedTrip.version || 0}`;
  // Set when the user has unsaved Trip Manager edits; background merges/invites bump the trip's
  // updatedAt/version and must not wipe the form while it's dirty.
  const mgrDirtyRef = useRef(false);
  const [newManagedTripName, setNewManagedTripName] = useState('');
  const [newManagedTripDest, setNewManagedTripDest] = useState('');
  const [newManagedTripStart, setNewManagedTripStart] = useState('');
  const [newManagedTripEnd, setNewManagedTripEnd] = useState('');
  const [newManagedTripBudget, setNewManagedTripBudget] = useState('');
  const [newManagedTripCurrency, setNewManagedTripCurrency] = useState('JPY');
  const [newTripPanelOpen, setNewTripPanelOpen] = useState(false);
  const [editTripPanelOpen, setEditTripPanelOpen] = useState(false);

  // Sync state values when managed trip changes
  const handleSelectManagedTrip = (tripId: string) => {
    const target = trips.find(t => t.id === tripId);
    if (!target) return;
    mgrDirtyRef.current = false;
    setManagerTripId(tripId);
    setMgrName(target.name);
    setMgrDest(target.destinationSummary || '');
    setMgrStart(target.startDate || '');
    setMgrEnd(target.endDate || '');
    setMgrBudget(String(target.budget || 0));
    setMgrCurrency(nonHomeCurrencyForTrip(target));
    setMgrArchived(!!target.archived);
    setMgrTripStyle(target.intelligence?.tripStyle || 'balanced');
    setMgrHomeCity(target.intelligence?.homeCity || 'Hong Kong');
    setMgrWeatherPreference(target.intelligence?.weatherPreference || 'balanced');
  };

  // Keep managed trip in sync when active trip changes — but never while dirty.
  useEffect(() => {
    if (mgrDirtyRef.current) return;
    handleSelectManagedTrip(currentTrip.id);
  }, [currentTrip.id]);

  // Keep form fields updated if the underlying trip in the list is updated —
  // but never while the user has unsaved edits in the form.
  useEffect(() => {
    if (mgrDirtyRef.current) return;
    const target = trips.find(t => t.id === managerTripId);
    if (target) {
      setMgrName(target.name);
      setMgrDest(target.destinationSummary || '');
      setMgrStart(target.startDate || '');
      setMgrEnd(target.endDate || '');
      setMgrBudget(String(target.budget || 0));
      setMgrCurrency(nonHomeCurrencyForTrip(target));
      setMgrArchived(!!target.archived);
      setMgrTripStyle(target.intelligence?.tripStyle || 'balanced');
      setMgrHomeCity(target.intelligence?.homeCity || 'Hong Kong');
      setMgrWeatherPreference(target.intelligence?.weatherPreference || 'balanced');
    }
  }, [managerTripId, managedTripVersionKey]);

  // Mirror switchTrip when the active trip is archived/deleted: snapshot the outgoing trip's
  // people and restore the destination trip's — otherwise its companions leak onto the next trip.
  function activateTripPatch(prev: AppState, updatedTrips: TripProfile[], nextActive: TripProfile): Partial<AppState> {
    const peopleByTripId = { ...(prev.peopleByTripId || {}) };
    const shareRatiosByTripId = { ...(prev.shareRatiosByTripId || {}) };
    if (prev.persons?.length) {
      peopleByTripId[managerTripId] = prev.persons;
      if (prev.shareRatios) shareRatiosByTripId[managerTripId] = prev.shareRatios;
    }
    const targetPeople = peopleByTripId[nextActive.id];
    const targetShares = shareRatiosByTripId[nextActive.id];
    return {
      activeTripId: nextActive.id,
      tripName: nextActive.name,
      tripDateRange: { start: nextActive.startDate, end: nextActive.endDate },
      tripCurrency: nonHomeCurrencyForTrip(nextActive, prev.tripCurrency),
      budget: nextActive.budget || 0,
      customItinerary: nextActive.itinerary,
      persons: targetPeople?.length ? targetPeople : prev.persons,
      shareRatios: targetShares || prev.shareRatios,
      peopleByTripId,
      shareRatiosByTripId,
      trips: updatedTrips.map((t) => ({ ...t, active: t.id === nextActive.id })),
    };
  }

  function selectTrip(tripId: string) {
    const trip = trips.find((item) => item.id === tripId);
    if (!trip) return;
    if (trip.archived) {
      setStatus('呢個旅程已封存；請先改回「進行中」並儲存，然後再切換為 active。');
      return;
    }
    const patch = switchTrip(state, tripId);
    if (!patch) {
      setStatus('切換旅程失敗；請再試一次。');
      return;
    }
    updateState({
      ...patch,
      trips: (patch.trips || trips).map((item) => item.id === tripId
        ? { ...item, archived: false, active: true, updatedAt: Date.now() }
        : { ...item, active: false }),
    });
  }

  function handleSaveManagedTrip() {
    const target = trips.find(t => t.id === managerTripId);
    if (!target) return;

    if (mgrStart && mgrEnd && mgrEnd < mgrStart) {
      setStatus('結束日期唔可以早過開始日期');
      return;
    }

    if (mgrArchived) {
      const activeTripsLeft = trips.filter(t => !t.archived && t.id !== managerTripId);
      if (activeTripsLeft.length === 0) {
        setStatus('⚠️ 最少要保留一個未封存旅程，唔可以封存呢個唯一嘅 active 旅程！');
        return;
      }
    }

    const nextBudget = clampFinite(mgrBudget, 0);
    const nextIntelligence = normalizeTripIntelligence(
      {
        ...target.intelligence,
        primaryCurrency: mgrCurrency,
        tripStyle: mgrTripStyle,
        homeCity: mgrHomeCity.trim() || 'Hong Kong',
        weatherPreference: mgrWeatherPreference,
        source: 'manual',
        updatedAt: Date.now(),
      },
      mgrDest.trim() || target.destinationSummary || '',
      mgrCurrency,
      target.intelligence?.timezone || target.timezones?.[0],
    );
    const nextTrip: TripProfile = {
      ...target,
      name: mgrName.trim() || target.name,
      destinationSummary: mgrDest.trim() || target.destinationSummary || '',
      startDate: mgrStart || target.startDate,
      endDate: mgrEnd || target.endDate,
      budget: nextBudget,
      // Keep currencies already in use (receipts may be in USD etc.); only add the edited one.
      currencies: Array.from(new Set(['HKD', mgrCurrency, ...(target.currencies || [])])),
      intelligence: nextIntelligence,
      archived: mgrArchived,
      version: target.version + 1,
      updatedAt: Date.now(),
    };

    setState((prev) => {
      const prevTrips = prev.trips?.length ? prev.trips : [activeTrip(prev)];
      const updatedTrips = prevTrips.map((t) => t.id === managerTripId ? nextTrip : t);

      const isActive = managerTripId === prev.activeTripId;
      const patch: Partial<AppState> = {
        trips: updatedTrips,
      };

      if (isActive) {
        patch.tripName = nextTrip.name;
        patch.tripDateRange = { start: nextTrip.startDate, end: nextTrip.endDate };
        patch.tripCurrency = mgrCurrency;
        patch.budget = nextBudget;
      }

      // 如果封存了當前的 active trip，且還有其他非封存 trip，就切換過去
      if (isActive && mgrArchived) {
        const nextActive = updatedTrips.find((t) => !t.archived && t.id !== managerTripId) || updatedTrips.find((t) => !t.archived);
        if (nextActive) Object.assign(patch, activateTripPatch(prev, updatedTrips, nextActive));
      }

      const nextSyncQueue = enqueueChange(prev.syncQueue, {
        type: 'trip',
        entityId: managerTripId,
        op: 'update',
        payload: {
          sourceId: nextTrip.sourceId || `trip_${nextTrip.id}`,
          updatedAt: nextTrip.updatedAt,
        },
      });

      patch.syncQueue = nextSyncQueue;

      return migrateAppState({
        ...prev,
        ...patch,
      });
    });

    mgrDirtyRef.current = false;
    setStatus(`🎉 成功儲存旅程「${nextTrip.name}」嘅修改，並已加入 Notion 同步隊列！`);
  }

  function handleDeleteManagedTrip() {
    const target = trips.find(t => t.id === managerTripId);
    if (!target) return;
    if (!canDeleteManagedTrip) {
      setShowDeleteConfirm(false);
      setStatus('只有旅程擁有者或管理員先可以刪除呢個共享旅程。');
      return;
    }

    const remainingTrips = trips.filter(t => t.id !== managerTripId);
    if (remainingTrips.length === 0) {
      setStatus('⚠️ 最少要保留一個旅程，唔可以刪除唯一嘅旅程！');
      setShowDeleteConfirm(false);
      return;
    }
    const deletedCount = (state.receipts || []).filter((r) => r.tripId === managerTripId).length;

    setState((prev) => {
      const updatedTrips = (prev.trips || []).filter((t) => t.id !== managerTripId);
      const deletedReceipts = (prev.receipts || []).filter((r) => r.tripId === managerTripId);
      const remainingReceipts = (prev.receipts || []).filter((r) => r.tripId !== managerTripId);

      const isActive = managerTripId === prev.activeTripId;
      const patch: Partial<AppState> = {
        trips: updatedTrips,
        receipts: remainingReceipts,
        // Local trip tombstone: there is no delete_trip RPC, so remember the deletion and let
        // mergePulledTrips filter the server copy out of future pulls. True remote deletion
        // needs a delete_trip RPC + migration (Boss approval required).
        deletedTripIds: Array.from(new Set([...(prev.deletedTripIds || []), managerTripId])),
      };

      if (isActive) {
        const nextActive = updatedTrips.find((t) => !t.archived) || updatedTrips[0];
        if (nextActive) Object.assign(patch, activateTripPatch(prev, updatedTrips, nextActive));
      }

      // Drop the deleted trip's per-trip people/share snapshots so they can't resurface
      // if a later restore or pull re-introduces a trip with the same id.
      delete (patch.peopleByTripId || (patch.peopleByTripId = { ...(prev.peopleByTripId || {}) }))[managerTripId];
      delete (patch.shareRatiosByTripId || (patch.shareRatiosByTripId = { ...(prev.shareRatiosByTripId || {}) }))[managerTripId];

      const currentQueue = prev.syncQueue || [];
      patch.receiptTombstones = {
        ...(prev.receiptTombstones || {}),
        ...Object.fromEntries(deletedReceipts.map((receipt) => {
          const sourceId = receipt.sourceId || receipt.id;
          const key = receiptSourceTombstoneKey(receipt);
          return [key, {
            supabaseId: receipt.supabaseId || receipt.id,
            sourceId,
            tripId: receipt.tripId || managerTripId,
            version: Math.max(1, Number(receipt.version) || 1),
            syncRevision: Math.max(0, Number(receipt.syncRevision) || 0),
            deletedAt: Date.now(),
            pending: true,
          }];
        })),
      };
      // Only the receipts get delete ops. No trip op is queued: the old {type:'trip',op:'update'}
      // could not find the deleted trip in state and would upsert the WRONG (active) trip.
      patch.syncQueue = deletedReceipts.reduce((queue, receipt) => enqueueChange(queue, {
        type: 'delete-receipt',
        entityId: receipt.id,
        op: 'delete',
        payload: {
          notionPageId: receipt.notionPageId,
          supabaseId: receipt.supabaseId,
          tripId: receipt.tripId,
          tripSupabaseId: target.supabaseId,
          sourceId: receipt.sourceId || receipt.id,
          tombstoneKey: receiptSourceTombstoneKey(receipt),
          version: receipt.version,
          syncRevision: receipt.syncRevision,
          updatedAt: receipt.updatedAt,
        },
      }), currentQueue);

      return migrateAppState({
        ...prev,
        ...patch,
      });
    });

    const nextSelectable = remainingTrips.find((t) => !t.archived) || remainingTrips[0];
    if (nextSelectable) {
      handleSelectManagedTrip(nextSelectable.id);
    }

    setShowDeleteConfirm(false);
    setStatus(`🎉 已刪除旅程「${target.name}」同佢 ${deletedCount} 筆消費紀錄；消費紀錄刪除已排隊同步，旅程本身暫時只喺呢部裝置移除（雲端真正刪除需要 delete_trip RPC，暫未支援）。`);
  }

  function createManagedTrip() {
    const name = newManagedTripName.trim();
    if (!name) {
      setStatus('請先輸入新旅程名稱');
      return;
    }
    if (newManagedTripStart && newManagedTripEnd && newManagedTripEnd < newManagedTripStart) {
      setStatus('結束日期唔可以早過開始日期');
      return;
    }
    const now = Date.now();
    const newTrip = createTripProfile({
      name,
      destinationSummary: newManagedTripDest || 'Japan',
      startDate: newManagedTripStart,
      endDate: newManagedTripEnd,
      // Number('') is 0 and Number('abc') is NaN — clamp both to a safe budget.
      budget: clampFinite(newManagedTripBudget.trim() === '' ? 150000 : newManagedTripBudget, 150000),
      currency: newManagedTripCurrency,
      now,
    });
    setState((prev) => {
      const prevTrips = prev.trips?.length ? prev.trips : [activeTrip(prev)];
      // Mirror switchTrip: snapshot the outgoing trip's people so switching back restores
      // them, and give the brand-new trip a clean companion list instead of inheriting.
      const peopleByTripId = { ...(prev.peopleByTripId || {}) };
      const shareRatiosByTripId = { ...(prev.shareRatiosByTripId || {}) };
      const prevTripId = prev.activeTripId;
      if (prevTripId && prevTripId !== newTrip.id && prev.persons?.length) {
        peopleByTripId[prevTripId] = prev.persons;
        if (prev.shareRatios) shareRatiosByTripId[prevTripId] = prev.shareRatios;
      }
      const freshPersons: Person[] = [{ id: 'p_boss', name: 'User 1', emoji: '👦', color: '#CC2929' }];
      return migrateAppState({
        ...prev,
        peopleByTripId,
        shareRatiosByTripId,
        persons: freshPersons,
        shareRatios: {},
        trips: [...prevTrips.map((trip) => ({ ...trip, active: false })), newTrip],
        activeTripId: newTrip.id,
        tripName: newTrip.name,
        tripDateRange: { start: newTrip.startDate, end: newTrip.endDate },
        tripCurrency: nonHomeCurrencyForTrip(newTrip, prev.tripCurrency),
        budget: newTrip.budget || 0,
        customItinerary: newTrip.itinerary,
        syncQueue: enqueueChange(prev.syncQueue, {
          type: 'trip',
          entityId: newTrip.id,
          op: 'create',
          payload: {
            sourceId: newTrip.sourceId,
            updatedAt: newTrip.updatedAt,
          },
        }),
      });
    });
    setManagerTripId(newTrip.id);
    setMgrName(newTrip.name);
    setMgrDest(newTrip.destinationSummary || '');
    setMgrStart(newTrip.startDate || '');
    setMgrEnd(newTrip.endDate || '');
    setMgrBudget(String(newTrip.budget || 0));
    setMgrCurrency(nonHomeCurrencyForTrip(newTrip));
    setMgrArchived(false);
    mgrDirtyRef.current = false;
    setNewManagedTripName('');
    setNewManagedTripDest('');
    setNewManagedTripStart('');
    setNewManagedTripEnd('');
    setNewManagedTripBudget('');
    setNewManagedTripCurrency('JPY');
    setNewTripPanelOpen(false);
    setStatus(`已建立並切換到新旅程：${newTrip.name}`);
  }

  return (
    <>
    <AccordionCard id="settings-trip" eyebrow="旅程" title={theme.id === 'japan_washi' ? '旅程管理器 🏯🌸' : '旅程管理器'} defaultOpen={false} meta={<span className="pill">v{managedTrip.version}</span>}>
      <div className="settings-trip-manager">
      <div className="settings-trip-panel settings-trip-panel--active">
        <div className="settings-trip-panel-head">
          <div>
            <span className="eyebrow">而家用緊</span>
            <h3>{managedTrip.name}</h3>
          </div>
          <span className="pill">{mgrCurrency}</span>
        </div>
        <label>選擇旅程
        <select
          value={managerTripId}
          onChange={(e) => handleSelectManagedTrip(e.target.value)}
        >
          {trips.map((trip) => (
            <option key={trip.id} value={trip.id}>
              {trip.id === currentTrip.id ? '[Active] ' : ''}
              {trip.archived ? '[Archived] ' : ''}
              {trip.name} ({trip.startDate || '未設定日期'})
            </option>
          ))}
        </select>
        </label>
        {managerTripId !== currentTrip.id && (
          <button
            className="secondary"
            type="button"
            onClick={() => selectTrip(managerTripId)}
          >
            <Sparkles size={16} /> 切換為當前 Active 記帳旅程
          </button>
        )}
      </div>

      <div className={`settings-trip-panel settings-trip-panel--collapsible ${newTripPanelOpen ? 'open' : ''}`}>
        <button
          className="settings-trip-panel-toggle"
          type="button"
          aria-expanded={newTripPanelOpen}
          aria-controls="settings-trip-new-panel"
          onClick={() => setNewTripPanelOpen((value) => !value)}
        >
        <div className="settings-trip-panel-head">
          <div>
            <span className="eyebrow">New trip</span>
            <h3>建立新旅程</h3>
          </div>
          <span className="pill">Multi-trip <ChevronDown size={15} className="settings-trip-panel-chevron" /></span>
        </div>
        </button>
        {newTripPanelOpen && <div id="settings-trip-new-panel" className="settings-trip-panel-body">
        <div className="form-grid">
          <label>新旅程名
            <input value={newManagedTripName} onChange={(e) => setNewManagedTripName(e.target.value)} placeholder="例如：首爾 2026" />
          </label>
          <label>目的地摘要
            <input value={newManagedTripDest} onChange={(e) => setNewManagedTripDest(e.target.value)} placeholder="例如：首爾、釜山" />
          </label>
        </div>
        <div className="form-grid">
          <label>開始日期
            <input type="date" value={newManagedTripStart} onChange={(e) => setNewManagedTripStart(e.target.value)} />
          </label>
          <label>結束日期
            <input type="date" value={newManagedTripEnd} onChange={(e) => setNewManagedTripEnd(e.target.value)} />
          </label>
        </div>
        <div className="form-grid">
          <label>預算
            <input type="number" min="0" step="1" value={newManagedTripBudget} onChange={(e) => setNewManagedTripBudget(e.target.value)} placeholder="例如：150000" />
          </label>
          <label>目的地貨幣
            <select value={newManagedTripCurrency} onChange={(e) => setNewManagedTripCurrency(e.target.value)}>
              {SUPPORTED_CURRENCIES.map((code) => <option key={code} value={code}>{code}</option>)}
            </select>
          </label>
        </div>
        <div className="action-row wrap">
          <button className="primary" type="button" onClick={createManagedTrip}>
            <Plus size={18} /> 建立並切換
          </button>
        </div>
        </div>}
      </div>

      <div className={`settings-trip-panel settings-trip-panel--edit settings-trip-panel--collapsible ${editTripPanelOpen ? 'open' : ''}`}>
      <button
        className="settings-trip-panel-toggle"
        type="button"
        aria-expanded={editTripPanelOpen}
        aria-controls="settings-trip-edit-panel"
        onClick={() => setEditTripPanelOpen((value) => !value)}
      >
      <div className="settings-trip-panel-head">
        <div>
          <span className="eyebrow">Edit selected trip</span>
          <h3>旅程資料</h3>
        </div>
        <span className="pill">{mgrArchived ? 'Archived' : 'Active'} <ChevronDown size={15} className="settings-trip-panel-chevron" /></span>
      </div>
      </button>
      {editTripPanelOpen && <div id="settings-trip-edit-panel" className="settings-trip-panel-body">
      <div className="form-grid">
        <label>旅程名
          <input value={mgrName} onChange={(e) => { mgrDirtyRef.current = true; setMgrName(e.target.value); }} placeholder="例如：名古屋 2026" />
        </label>
        <label>目的地摘要
          <input value={mgrDest} onChange={(e) => { mgrDirtyRef.current = true; setMgrDest(e.target.value); }} placeholder="例如：名古屋、白川鄉" />
        </label>
      </div>
      <div className="form-grid">
        <label>開始日期
          <input type="date" value={mgrStart} onChange={(e) => { mgrDirtyRef.current = true; setMgrStart(e.target.value); }} />
        </label>
        <label>結束日期
          <input type="date" value={mgrEnd} onChange={(e) => { mgrDirtyRef.current = true; setMgrEnd(e.target.value); }} />
        </label>
      </div>
      <div className="form-grid">
        <label>預算 (目的地貨幣)
          <input
            type="number"
            min="0"
            step="1"
            value={mgrBudget}
            onChange={(e) => {
              mgrDirtyRef.current = true;
              setMgrBudget(e.target.value);
            }}
            placeholder="例如：200000"
          />
        </label>
        <label>預算 (HKD)
          <input
            type="number"
            min="0"
            step="1"
            value={Math.round((Number(mgrBudget) || 0) / Math.max(0.1, perHkdForCurrency(state, mgrCurrency)))}
            onChange={(e) => {
              mgrDirtyRef.current = true;
              const val = parseFloat(e.target.value);
              const safe = Number.isFinite(val) && val >= 0 ? val : 0;
              setMgrBudget(String(Math.round(safe * Math.max(0.1, perHkdForCurrency(state, mgrCurrency)))));
            }}
          />
        </label>
      </div>
      <div className="form-grid">
        <label>目的地貨幣
          <select value={mgrCurrency} onChange={(e) => { mgrDirtyRef.current = true; setMgrCurrency(e.target.value); }}>
            {SUPPORTED_CURRENCIES.map((code) => <option key={code} value={code}>{code}</option>)}
          </select>
        </label>
        <label>旅程狀態
          <select value={mgrArchived ? 'archived' : 'active'} onChange={(e) => { mgrDirtyRef.current = true; setMgrArchived(e.target.value === 'archived'); }}>
            <option value="active">🟢 進行中 (Active)</option>
            <option value="archived">📁 已封存 (Archived)</option>
          </select>
        </label>
      </div>

      {/* Quick Itinerary View / Edit - opens confirmation modal with current trip data.
          getItinerary(state) always resolves the ACTIVE trip's itinerary, so only offer this
          when the managed trip IS the active trip — never mix it into another trip. */}
      {managerTripId === currentTrip.id && getItinerary(state).length > 0 && (
        <div className="settings-trip-itinerary-quick">
          <div className="settings-trip-panel-head">
            <div>
              <span className="eyebrow">Itinerary</span>
              <h3>當前行程</h3>
            </div>
            <span className="pill">{getItinerary(state).length} 日 · {getItinerary(state).reduce((sum, day) => sum + (day.spots?.length || 0), 0)} 景點</span>
          </div>
          <p className="muted">查看或編輯目前旅程嘅每日行程安排、景點同住宿資料。</p>
          <button
            className="secondary"
            type="button"
            style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', marginTop: '0.5rem' }}
            onClick={() => {
              const itinerary = getItinerary(state);
              const draft: TripDraft = {
                trip: { ...managedTrip, itinerary },
                summary: `目前行程：${managedTrip.name}，共 ${itinerary.length} 日`,
                warnings: [],
                changes: [],
              };
              openTripDraft(draft);
            }}
          >
            <MapPin size={16} /> 查看 / 編輯行程詳情
          </button>
        </div>
      )}

      <div className="settings-trip-actions">
        <button
          className="primary"
          type="button"
          onClick={handleSaveManagedTrip}
        >
          <CheckCircle2 size={18} /> 儲存旅程修改
        </button>
      </div>
      <div style={{ marginTop: '0.75rem', paddingTop: '0.75rem', borderTop: '1px dashed rgba(0,0,0,.12)' }}>
        <p className="muted" style={{ margin: '0 0 0.4rem' }}>不可逆操作</p>
        <button
          className="settings-trip-delete"
          type="button"
          disabled={!canDeleteManagedTrip}
          title={canDeleteManagedTrip ? undefined : '只有擁有者或管理員先可以刪除共享旅程'}
          onClick={() => setShowDeleteConfirm(true)}
        >
          <Trash2 size={18} /> 刪除此旅程與資料
        </button>
      </div>
      </div>}
      </div>

      <details className="settings-stats-panel" style={{ marginTop: '0.75rem' }}>
        <summary style={{ cursor: 'pointer', fontWeight: 700, fontSize: '0.95rem' }}>統計口徑</summary>
        <div className="settings-trip-panel settings-trip-panel--compact" style={{ marginTop: '0.5rem' }}>
        <label className="check-row">
          <input type="checkbox" checked={state.statsIncludeTransportLodging} onChange={(e) => updateState({ statsIncludeTransportLodging: e.target.checked })} />
          反轉首頁統計：總消費排除機票/住宿，今日/日均包括全部
        </label>
        <label className="check-row">
          <input type="checkbox" checked={state.top10IncludeBigItems} onChange={(e) => updateState({ top10IncludeBigItems: e.target.checked })} />
          TOP 10 包括機票/住宿/大型交通
        </label>
        </div>
      </details>
      </div>
    </AccordionCard>

    {showDeleteConfirm && (() => {
      const targetTrip = trips.find(t => t.id === managerTripId);
      if (!targetTrip) return null;
      const deleteCount = state.receipts.filter(r => r.tripId === managerTripId).length;
      return (
        <div
          className="modal-backdrop"
          onClick={() => setShowDeleteConfirm(false)}
          style={{
            display: 'grid',
            placeItems: 'center',
            background: 'rgba(10, 8, 8, 0.7)',
            backdropFilter: 'blur(12px)',
            WebkitBackdropFilter: 'blur(12px)',
            zIndex: 9999,
          }}
        >
          <div
            className="modal"
            onClick={(event) => event.stopPropagation()}
            style={{
              width: 'min(480px, 95vw)',
              background: 'rgba(30, 20, 20, 0.85)',
              border: '1px solid rgba(239, 68, 68, 0.3)',
              borderRadius: '20px',
              padding: '24px',
              boxShadow: '0 25px 60px rgba(239, 68, 68, 0.15), 0 0 0 1px rgba(239, 68, 68, 0.1)',
              backdropFilter: 'blur(20px)',
              WebkitBackdropFilter: 'blur(20px)',
              color: '#fff',
              textAlign: 'center',
              animation: 'page-rise 0.3s cubic-bezier(0.16, 1, 0.3, 1)'
            }}
          >
            {/* Alert Icon */}
            <div style={{ display: 'inline-grid', placeItems: 'center', width: '64px', height: '64px', borderRadius: '50%', background: 'rgba(239, 68, 68, 0.15)', color: '#EF4444', marginBottom: '16px', border: '1px solid rgba(239, 68, 68, 0.3)' }}>
              <AlertTriangle size={32} style={{ animation: 'pulse 2s infinite' }} />
            </div>

            {/* Title */}
            <h2 style={{ margin: '0 0 12px 0', fontSize: '20px', fontWeight: 800, color: '#EF4444' }}>
              ⚠️ 永久刪除旅程警告
            </h2>

            {/* Warning Content */}
            <p style={{ margin: '0 0 20px 0', fontSize: '15px', color: 'rgba(255, 255, 255, 0.9)', lineHeight: 1.6, textAlign: 'left' }}>
              Boss 🫡，你確定要永久刪除旅程<strong>「{targetTrip.name}」</strong>嗎？
              <br />
              <span style={{ color: '#EF4444', fontWeight: 'bold', display: 'block', marginTop: '8px' }}>
                ❌ 此操作將會連帶刪除該旅程下所有關聯嘅 {deleteCount} 筆消費紀錄！
              </span>
              <span style={{ color: 'rgba(255, 255, 255, 0.7)', fontSize: '13px', display: 'block', marginTop: '4px' }}>
                * 消費紀錄嘅刪除會同步推送至雲端（Supabase & Notion）；旅程本身會即時喺呢部裝置移除，雲端旅程副本要等有 delete_trip RPC 先可以真正刪除。
              </span>
            </p>

            {/* Buttons */}
            <div style={{ display: 'flex', gap: '12px', marginTop: '24px' }}>
              <button
                type="button"
                onClick={() => setShowDeleteConfirm(false)}
                style={{
                  flex: 1,
                  padding: '10px 16px',
                  borderRadius: '10px',
                  border: '1px solid rgba(255, 255, 255, 0.15)',
                  background: 'rgba(255, 255, 255, 0.05)',
                  color: '#fff',
                  fontSize: '14px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  transition: 'all 0.2s'
                }}
                onMouseOver={(e) => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)'}
                onMouseOut={(e) => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)'}
              >
                取消
              </button>
              <button
                type="button"
                onClick={handleDeleteManagedTrip}
                style={{
                  flex: 1,
                  padding: '10px 16px',
                  borderRadius: '10px',
                  border: 'none',
                  background: '#EF4444',
                  color: '#fff',
                  fontSize: '14px',
                  fontWeight: 700,
                  cursor: 'pointer',
                  boxShadow: '0 4px 12px rgba(239, 68, 68, 0.3)',
                  transition: 'all 0.2s'
                }}
                onMouseOver={(e) => e.currentTarget.style.background = '#DC2626'}
                onMouseOut={(e) => e.currentTarget.style.background = '#EF4444'}
              >
                確認永久刪除 🗑️
              </button>
            </div>
          </div>
        </div>
      );
    })()}
    </>
  );
}
