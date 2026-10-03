import type { ItineraryDay, ItinerarySpot, TripDraft } from '../../lib/types';

export function tripDraftPreviewStats(draft: TripDraft) {
  // Always count the LIVE editable itinerary so modal header tracks add/delete/reorder.
  const days = draft.trip.itinerary || [];
  const spots = days.flatMap((day) => day.spots || []).filter((spot) => String(spot.name || '').trim());
  const lodgingNames = new Set<string>();
  const foodNames = new Set<string>();
  const transportNames = new Set<string>();
  const detailNames = new Set<string>();
  for (const day of days) {
    if (day.lodging?.name) lodgingNames.add(day.lodging.name);
    if (day.highlight) detailNames.add(day.highlight);
    for (const spot of day.spots || []) {
      const name = String(spot.name || '').trim();
      if (!name) continue;
      if (spot.type === 'lodging' || /hotel|酒店|住宿|旅館/i.test(name)) lodgingNames.add(name);
      if (spot.type === 'food' || /restaurant|cafe|餐|飯|食|咖啡|壽司|拉麵|bbq/i.test(name)) foodNames.add(name);
      if (spot.type === 'flight' || spot.type === 'transport') transportNames.add(name);
      if (spot.note || spot.address || spot.mapUrl || spot.time || spot.bookingRef || spot.sourceText) detailNames.add(name);
    }
  }
  return {
    dayCount: days.length,
    spotCount: spots.length,
    lodgingCount: lodgingNames.size,
    foodCount: foodNames.size,
    transportCount: transportNames.size,
    detailCount: detailNames.size,
    sourceQuality: draft.extractionReport?.sourceQuality || 'medium',
    missingCriticalFields: draft.extractionReport?.missingCriticalFields || [],
    assumptions: draft.extractionReport?.assumptions || [],
    organizedItinerary: draft.organizedItinerary || '',
    lodgingNames: Array.from(lodgingNames).slice(0, 4),
    foodNames: Array.from(foodNames).slice(0, 4),
    detailNames: Array.from(detailNames).slice(0, 5),
    days: days.slice(0, 8).map((day) => ({
      key: `${day.date}-${day.day}-${day.region}`,
      title: `Day ${day.day} · ${day.date}`,
      region: [day.region, day.city, day.country].filter(Boolean).join(' · '),
      highlight: day.highlight || '',
      note: day.note || '',
      lodging: day.lodging?.name || '',
      spots: (day.spots || []).filter((spot) => String(spot.name || '').trim()).slice(0, 4),
    })),
  };
}

export const TRIP_REVIEW_SPOT_TYPES: ItinerarySpot['type'][] = ['flight', 'transport', 'food', 'shopping', 'lodging', 'ticket', 'localtour', 'medicine', 'sightseeing', 'other'];

export function cloneTripDraft(draft: TripDraft): TripDraft {
  if (typeof structuredClone === 'function') return structuredClone(draft);
  return JSON.parse(JSON.stringify(draft)) as TripDraft;
}

export function cleanTripReviewText(value: unknown): string {
  return String(value || '').trim();
}

export function reviewNoticeText(value: string): string {
  const text = cleanTripReviewText(value).replace(/^Warning:\s*/i, '');
  if (!text) return '';
  if (/address|地址/i.test(text)) return `有啲地址未確認：${text}`;
  if (/assum|interpreted|估|理解/i.test(text)) return `AI 有一個理解假設：${text}`;
  if (/time|時間/i.test(text)) return `有啲時間要望一眼：${text}`;
  return text;
}

export function tripReviewNotices(draft: TripDraft): string[] {
  const report = draft.extractionReport;
  const notices = [
    ...(report?.missingCriticalFields || []),
    ...(report?.assumptions || []),
    ...(report?.warnings || []),
    ...(draft.warnings || []),
  ]
    .map(reviewNoticeText)
    .filter(Boolean);
  return Array.from(new Set(notices)).slice(0, 12);
}

export function updateDraftDayAt(draft: TripDraft, dayIndex: number, updater: (day: ItineraryDay) => ItineraryDay): TripDraft {
  const next = cloneTripDraft(draft);
  const days = next.trip.itinerary || [];
  if (!days[dayIndex]) return next;
  days[dayIndex] = updater({ ...days[dayIndex], spots: [...(days[dayIndex].spots || [])] });
  next.trip.itinerary = days;
  next.trip.updatedAt = Date.now();
  return next;
}

export function sortReviewSpots(spots: ItinerarySpot[]): ItinerarySpot[] {
  return [...spots].sort((a, b) => {
    const left = cleanTripReviewText(a.time) || '99:99';
    const right = cleanTripReviewText(b.time) || '99:99';
    return left.localeCompare(right);
  });
}

export function defaultReviewSpot(): ItinerarySpot {
  return {
    time: '09:00',
    timeEnd: '',
    name: '新地點',
    type: 'other',
    note: '',
    address: '',
  };
}
