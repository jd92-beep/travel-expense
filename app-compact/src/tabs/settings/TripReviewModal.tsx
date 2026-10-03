import { ArrowDown, ArrowUp, Plus, Trash2, X } from 'lucide-react';
import { useState } from 'react';
import { DEFAULT_TRIP_UPDATE_MODEL_ID } from '../../lib/constants';
import { categoryById } from '../../lib/domain';
import type { AppState, ItineraryDay, ItinerarySpot, TripDraft } from '../../lib/types';
import { tripDraftPreviewStats, TRIP_REVIEW_SPOT_TYPES, cloneTripDraft, tripReviewNotices, updateDraftDayAt, sortReviewSpots, defaultReviewSpot } from './tripReview';
import { aiModelLabel } from './aiModels';

/** Day-by-day editor for an AI/parsed trip draft; nothing is written until「確認並更新行程」. */
export function TripReviewModal({ state, tripDraft, setTripDraftModalOpen, applyTripDraft }: { state: AppState; tripDraft: TripDraft; setTripDraftModalOpen: (open: boolean) => void; applyTripDraft: (draft: TripDraft) => void }) {
  const tripUpdateModelName = aiModelLabel(state.tripUpdateModel || DEFAULT_TRIP_UPDATE_MODEL_ID);
  // Edits stay local to the open review; the source draft is only replaced on apply.
  const [editableTripDraft, setEditableTripDraft] = useState<TripDraft>(() => cloneTripDraft(tripDraft));
  const [tripReviewDayIndex, setTripReviewDayIndex] = useState(0);
  const tripReviewDraft = editableTripDraft;
  const tripReviewStats = tripReviewDraft ? tripDraftPreviewStats(tripReviewDraft) : null;
  const tripReviewDays = tripReviewDraft?.trip.itinerary || [];
  const tripReviewDay = tripReviewDays[Math.min(tripReviewDayIndex, Math.max(0, tripReviewDays.length - 1))];
  const tripReviewWarnings = tripReviewDraft ? tripReviewNotices(tripReviewDraft) : [];

  function updateTripReviewDay(dayIndex: number, updater: (day: ItineraryDay) => ItineraryDay) {
    setEditableTripDraft((draft) => updateDraftDayAt(draft, dayIndex, updater));
  }

  function updateTripReviewSpot(dayIndex: number, spotIndex: number, patch: Partial<ItinerarySpot>) {
    updateTripReviewDay(dayIndex, (day) => {
      const spots = [...(day.spots || [])];
      const current = spots[spotIndex] || defaultReviewSpot();
      spots[spotIndex] = { ...current, ...patch };
      return { ...day, spots };
    });
  }

  function addTripReviewSpot(dayIndex: number) {
    updateTripReviewDay(dayIndex, (day) => ({
      ...day,
      spots: [...(day.spots || []), defaultReviewSpot()],
    }));
  }

  function removeTripReviewSpot(dayIndex: number, spotIndex: number) {
    updateTripReviewDay(dayIndex, (day) => ({
      ...day,
      spots: (day.spots || []).filter((_, index) => index !== spotIndex),
    }));
  }

  function moveTripReviewSpot(dayIndex: number, spotIndex: number, direction: -1 | 1) {
    updateTripReviewDay(dayIndex, (day) => {
      const spots = [...(day.spots || [])];
      const nextIndex = spotIndex + direction;
      if (nextIndex < 0 || nextIndex >= spots.length) return day;
      [spots[spotIndex], spots[nextIndex]] = [spots[nextIndex], spots[spotIndex]];
      return { ...day, spots };
    });
  }

  function sortTripReviewDay(dayIndex: number) {
    updateTripReviewDay(dayIndex, (day) => ({ ...day, spots: sortReviewSpots(day.spots || []) }));
  }

  function updateTripReviewLodging(dayIndex: number, patch: Partial<NonNullable<ItineraryDay['lodging']>>) {
    updateTripReviewDay(dayIndex, (day) => ({
      ...day,
      lodging: {
        ...(day.lodging || { name: '', confidence: 'medium' as const }),
        ...patch,
      },
    }));
  }

  if (!tripReviewStats) return null;
  return (
      <div
        className="modal-backdrop trip-confirm-backdrop"
        role="presentation"
        onClick={() => setTripDraftModalOpen(false)}
      >
        <section
          className="modal trip-confirm-modal"
          role="dialog"
          aria-modal="true"
          aria-labelledby="trip-confirm-title"
          aria-describedby="trip-confirm-description"
          onClick={(event) => event.stopPropagation()}
        >
          <div className="modal-head trip-confirm-head">
            <div>
              <span className="pill">Primary · {tripUpdateModelName}</span>
              <h2 id="trip-confirm-title">確認 AI 行程更新</h2>
              <h3>{tripReviewDraft.trip.name}</h3>
              <p id="trip-confirm-description" className="muted">
                {tripReviewDraft.trip.startDate} → {tripReviewDraft.trip.endDate} · {tripReviewDraft.trip.destinationSummary}
              </p>
            </div>
            <button className="icon-button" type="button" aria-label="關閉行程確認" onClick={() => setTripDraftModalOpen(false)}>
              <X size={18} />
            </button>
          </div>

          <div className="trip-confirm-summary">
            <span><b>{tripReviewStats.dayCount}</b><small>日程</small></span>
            <span><b>{tripReviewStats.spotCount}</b><small>景點</small></span>
            <span><b>{tripReviewStats.lodgingCount}</b><small>酒店</small></span>
            <span><b>{tripReviewStats.foodCount}</b><small>餐飲</small></span>
            <span><b>{tripReviewStats.transportCount}</b><small>交通</small></span>
            <span><b>{tripReviewStats.detailCount}</b><small>細節</small></span>
          </div>

          <div className="trip-review-plain-summary">
            <strong>AI 已經整理好行程，請逐日望一望。</strong>
            <span>{tripReviewDraft.summary || '確認無誤後，行程、天氣和記帳預設會跟住呢份資料更新。'}</span>
          </div>

          {tripReviewWarnings.length > 0 && (
            <details className="trip-review-notices">
              <summary>需要留意 ({tripReviewWarnings.length})</summary>
              <div>
                {tripReviewWarnings.map((warning, index) => (
                  <span key={`${warning}-${index}`}>{warning}</span>
                ))}
              </div>
            </details>
          )}

          <div className="trip-review-day-tabs" role="tablist" aria-label="選擇行程日子">
            {tripReviewDays.map((day, index) => (
              <button
                key={`${day.date}-${day.day}`}
                type="button"
                role="tab"
                aria-selected={index === tripReviewDayIndex}
                className={index === tripReviewDayIndex ? 'is-active' : ''}
                onClick={() => setTripReviewDayIndex(index)}
              >
                <b>Day {day.day}</b>
                <span>{day.date}</span>
                <small>{day.region || day.city || '未命名'}</small>
              </button>
            ))}
          </div>

          {tripReviewDay && (
            <article className="trip-confirm-day trip-review-editor">
              <header>
                <div>
                  <strong>Day {tripReviewDay.day} · {tripReviewDay.date}</strong>
                  <span>{tripReviewDay.region || tripReviewDay.city || '未命名地區'}{tripReviewDay.city && tripReviewDay.city !== tripReviewDay.region ? ` · ${tripReviewDay.city}` : ''}{tripReviewDay.country ? ` · ${tripReviewDay.country}` : ''}</span>
                </div>
                <small>{tripReviewDay.currency || ''}{tripReviewDay.timezone ? ` · ${tripReviewDay.timezone}` : ''}</small>
              </header>

              <div className="trip-review-lodging-form">
                <strong>住宿</strong>
                <label>酒店名
                  <input
                    value={tripReviewDay.lodging?.name || ''}
                    onChange={(event) => updateTripReviewLodging(tripReviewDayIndex, { name: event.target.value })}
                    placeholder="例如 Hotel Fine Jeju"
                  />
                </label>
                <label>地址
                  <input
                    value={tripReviewDay.lodging?.address || ''}
                    onChange={(event) => updateTripReviewLodging(tripReviewDayIndex, { address: event.target.value })}
                    placeholder="可留空"
                  />
                </label>
                <label>入住
                  <input
                    type="time"
                    value={tripReviewDay.lodging?.checkIn || ''}
                    onChange={(event) => updateTripReviewLodging(tripReviewDayIndex, { checkIn: event.target.value })}
                  />
                </label>
                <label>退房
                  <input
                    type="time"
                    value={tripReviewDay.lodging?.checkOut || ''}
                    onChange={(event) => updateTripReviewLodging(tripReviewDayIndex, { checkOut: event.target.value })}
                  />
                </label>
              </div>

              <div className="trip-review-toolbar">
                <strong>{(tripReviewDay.spots || []).length} 個行程點</strong>
                <span>
                  <button className="secondary mini" type="button" onClick={() => sortTripReviewDay(tripReviewDayIndex)}>按時間排序</button>
                  <button className="secondary mini" type="button" onClick={() => addTripReviewSpot(tripReviewDayIndex)}><Plus size={14} /> 新增</button>
                </span>
              </div>

              <div className="trip-confirm-spots trip-review-spot-list">
                {(tripReviewDay.spots || []).map((spot, index) => (
                  <div key={`${tripReviewDay.date}-${index}-${spot.id || spot.spotId || spot.name}`} className="trip-confirm-spot trip-review-spot-editor">
                    <div className="trip-review-time-grid">
                      <label>開始
                        <input
                          type="time"
                          value={spot.time || ''}
                          onChange={(event) => updateTripReviewSpot(tripReviewDayIndex, index, { time: event.target.value })}
                        />
                      </label>
                      <label>結束
                        <input
                          type="time"
                          value={spot.timeEnd || ''}
                          onChange={(event) => updateTripReviewSpot(tripReviewDayIndex, index, { timeEnd: event.target.value })}
                        />
                      </label>
                    </div>
                    <div className="trip-review-spot-fields">
                      <label>地點 / 活動
                        <input
                          value={spot.name || ''}
                          onChange={(event) => updateTripReviewSpot(tripReviewDayIndex, index, { name: event.target.value })}
                          placeholder="地點名稱"
                        />
                      </label>
                      <label>類別
                        <select
                          value={spot.type || 'other'}
                          onChange={(event) => updateTripReviewSpot(tripReviewDayIndex, index, { type: event.target.value as ItinerarySpot['type'] })}
                        >
                          {TRIP_REVIEW_SPOT_TYPES.map((type) => (
                            <option key={type} value={type}>{categoryById(type).name}</option>
                          ))}
                        </select>
                      </label>
                      <label>地址
                        <input
                          value={spot.address || ''}
                          onChange={(event) => updateTripReviewSpot(tripReviewDayIndex, index, { address: event.target.value })}
                          placeholder="可留空"
                        />
                      </label>
                      <label>備註
                        <input
                          value={spot.note || ''}
                          onChange={(event) => updateTripReviewSpot(tripReviewDayIndex, index, { note: event.target.value })}
                          placeholder="例如 optional、已預約、注意事項"
                        />
                      </label>
                      <div className="trip-review-row-actions">
                        <button className="secondary mini" type="button" disabled={index === 0} onClick={() => moveTripReviewSpot(tripReviewDayIndex, index, -1)}><ArrowUp size={14} /> 上移</button>
                        <button className="secondary mini" type="button" disabled={index === (tripReviewDay.spots || []).length - 1} onClick={() => moveTripReviewSpot(tripReviewDayIndex, index, 1)}><ArrowDown size={14} /> 下移</button>
                        <button className="danger mini" type="button" onClick={() => removeTripReviewSpot(tripReviewDayIndex, index)}><Trash2 size={14} /> 刪除</button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </article>
          )}

          <div className="modal-actions trip-confirm-actions">
            <button className="secondary" type="button" onClick={() => setTripDraftModalOpen(false)}>返回修改文字</button>
            <button className="primary" type="button" onClick={() => applyTripDraft(tripReviewDraft)}>確認並更新行程</button>
          </div>
        </section>
      </div>
  );
}
