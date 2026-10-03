import { Plane, RotateCcw, Sparkles } from 'lucide-react';
import { useState } from 'react';
import { AccordionCard } from '../../components/AccordionCard';
import { parseTripParagraph } from '../../lib/ai';
import { DEFAULT_TRIP_UPDATE_MODEL_ID } from '../../lib/constants';
import {
  redactedError,
} from '../../lib/credentialBroker';
import {
  pushTripPage,
} from '../../lib/notion';
import type { TripDraft, TripProfile } from '../../lib/types';
import { currenciesForTrip, type SettingsContext } from './shared';
import { tripDraftPreviewStats } from './tripReview';
import { aiModelLabel } from './aiModels';

export function TripUpdateSection({ ctx, tripDraft, setTripDraft, setTripDraftModalOpen, applyTripDraft, requireNotionMirror }: { ctx: SettingsContext; tripDraft: TripDraft | null; setTripDraft: (draft: TripDraft | null) => void; setTripDraftModalOpen: (open: boolean) => void; applyTripDraft: (draft: TripDraft) => void; requireNotionMirror: (label: string) => boolean }) {
  const { state, updateState, busy, setStatus, run, currentTrip } = ctx;
  const currenciesForTripLocal = (trip: Partial<TripProfile> | undefined) => currenciesForTrip(state, trip);
  const [tripParagraph, setTripParagraph] = useState('');
  const tripUpdateModelId = state.tripUpdateModel || DEFAULT_TRIP_UPDATE_MODEL_ID;
  const tripUpdateModelName = aiModelLabel(tripUpdateModelId);
  const tripPreviewStats = tripDraft ? tripDraftPreviewStats(tripDraft) : null;

  return (
    <>
    <AccordionCard id="settings-trip-update" eyebrow="AI" title="AI 行程更新" icon={<Sparkles />} defaultOpen={false}>
      <p className="muted">目前 primary：{tripUpdateModelName}。貼入長行程後，AI 會先分析日程、景點、酒店、餐廳同重要細節；確認後先會更新本機 trip，同步時會建立/更新 Notion trip note。</p>
      <textarea
        rows={10}
        value={tripParagraph}
        onChange={(e) => setTripParagraph(e.target.value)}
        placeholder={`例：下次 2026-07-10 至 2026-07-15 去首爾，第一晚住弘大...\n\n支援貼上整份行程表，包含航班、酒店、景點、餐廳等，AI 會自動更新時間線同天氣！\n\nDay 1: 仁川機場 → 弘大商圈 → 烤肉晚餐\nDay 2: 景福宮 → 北村韓屋 → 明洞購物`}
      />
      <div className="action-row wrap">
        <button
          className="primary"
          type="button"
          disabled={!tripParagraph.trim() || !!busy}
          onClick={() => run('分析行程', async () => {
            try {
              const draft = await parseTripParagraph(tripParagraph, state);
              const hasSpots = draft && draft.trip && Array.isArray(draft.trip.itinerary) &&
                draft.trip.itinerary.some((day) => Array.isArray(day.spots) && day.spots.length > 0);
              if (!hasSpots) {
                const warningMsg = (draft && draft.warnings && draft.warnings.join(' | ')) || '';
                throw new Error(warningMsg || 'AI 智能解析未成功提取任何日程景點，請檢查貼入嘅文字內容。');
              }
              const stats = tripDraftPreviewStats(draft);
              setTripDraft(draft);
              setTripDraftModalOpen(true);
              return `已分析：${draft.trip.name} · ${stats.dayCount} 日 · ${stats.spotCount} 景點 · ${stats.lodgingCount} 酒店 · ${stats.foodCount} 餐飲 · ${stats.transportCount} 交通 · ${stats.detailCount} 重要細節`;
            } catch (err) {
              // Keep the user's pasted paragraph intact — surface the error via run()'s
              // status handler instead of overwriting their input with a debug dump.
              console.error('[Settings] AI parse failed:', err);
              throw new Error(redactedError(err));
            }
          })}
        >
          {busy === '分析行程' ? <RotateCcw size={18} className="spin" /> : <Plane size={18} />} 用已選模型分析
        </button>
        {tripDraft && <button className="secondary" type="button" onClick={() => setTripDraftModalOpen(true)}>開啟確認視窗</button>}
        {tripDraft && <button className="secondary" type="button" onClick={() => { setTripDraft(null); setTripDraftModalOpen(false); }}>清除 preview</button>}
      </div>
      <div style={{ marginTop: '0.75rem', paddingTop: '0.75rem', borderTop: '1px dashed rgba(0,0,0,.12)' }}>
        <p className="muted" style={{ margin: '0 0 0.4rem' }}>不可逆操作</p>
        <div className="action-row wrap">
          <button
            className="danger"
            type="button"
            disabled={!!busy}
            onClick={() => {
              if (!window.confirm('確定清空目前旅程嘅 AI 行程？其他設定會保留。')) return;
            updateState({
              customItinerary: [],
              itineraryOverrides: {},
            });
            const tripsNext = (state.trips || []).map((trip) => trip.id === currentTrip.id
              ? { ...trip, itinerary: [], version: (trip.version || 1) + 1, updatedAt: Date.now() }
              : trip);
            updateState({ trips: tripsNext });
            setTripDraft(null);
            setTripDraftModalOpen(false);
            setStatus('已清空 AI 行程，可以重新貼入或手動編輯。');
            }}
          >
            <RotateCcw size={18} /> 清除 AI 行程
          </button>
        </div>
      </div>
      {tripDraft && tripPreviewStats && (
        <div className="trip-preview">
          <div className="trip-preview-head">
            <div>
              <h3>{tripDraft.trip.name}</h3>
              <p className="muted">{tripDraft.summary}</p>
            </div>
            <span className="pill">Primary · {tripUpdateModelName} · {tripPreviewStats.sourceQuality}</span>
          </div>
          <div className="trip-preview-stats">
            <span><b>{tripPreviewStats.dayCount}</b><small>日程</small></span>
            <span><b>{tripPreviewStats.spotCount}</b><small>景點</small></span>
            <span><b>{tripPreviewStats.lodgingCount}</b><small>酒店</small></span>
            <span><b>{tripPreviewStats.foodCount}</b><small>餐飲</small></span>
            <span><b>{tripPreviewStats.transportCount}</b><small>交通</small></span>
            <span><b>{tripPreviewStats.detailCount}</b><small>重要細節</small></span>
          </div>
          <div className="mini-list">
            <span>{tripDraft.trip.startDate} → {tripDraft.trip.endDate}</span>
            <span>{tripDraft.trip.destinationSummary}</span>
            <span>{tripDraft.trip.itinerary.length} 日 · {currenciesForTripLocal(tripDraft.trip).join(', ')}</span>
            {!!tripPreviewStats.lodgingNames.length && <span>酒店：{tripPreviewStats.lodgingNames.join('、')}</span>}
            {!!tripPreviewStats.foodNames.length && <span>餐飲：{tripPreviewStats.foodNames.join('、')}</span>}
            <span>請開確認視窗逐日檢查；未按確認前唔會更新行程。</span>
          </div>
          <div className="trip-preview-days">
            {tripPreviewStats.days.map((day) => (
              <article key={day.key}>
                <header>
                  <strong>{day.title}</strong>
                  <span>{day.region || '未命名地區'}</span>
                </header>
                {day.highlight && <p>{day.highlight}</p>}
                {day.note && <p style={{ fontSize: '0.82em', opacity: 0.8, marginTop: 4 }}>💡 {day.note}</p>}
                {day.lodging && <small>酒店 · {day.lodging}</small>}
                <div>
                  {day.spots.map((spot) => <span key={`${day.key}-${spot.time}-${spot.name}`}>{spot.time ? `${spot.time} ` : ''}{spot.name}</span>)}
                </div>
              </article>
            ))}
          </div>
          <div className="action-row wrap">
            <button className="primary" type="button" onClick={() => setTripDraftModalOpen(true)}>確認 / 編輯前檢查</button>
            <button className="secondary" type="button" disabled={!!busy} onClick={() => {
              if (!requireNotionMirror('建立 Notion Trip')) return;
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
    </>
  );
}
