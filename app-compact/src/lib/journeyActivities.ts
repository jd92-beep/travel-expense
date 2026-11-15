import type { ItineraryDay, PackingSuggestion, JourneyQuestion } from './types';

const clean = (value: unknown, limit: number) => typeof value === 'string' && value.trim().length <= limit ? value.trim() : '';
const record = (value: unknown): Record<string, unknown> => value && typeof value === 'object' ? value as Record<string, unknown> : {};

export function packingSuggestions(input: unknown, limit = 52): PackingSuggestion[] {
  if (!Array.isArray(input)) return [];
  const seen = new Set<string>();
  const items: PackingSuggestion[] = [];
  for (const raw of input) {
    const row = record(raw);
    const label = clean(row.label, 160);
    if (!label || seen.has(label.toLowerCase())) continue;
    seen.add(label.toLowerCase());
    items.push({ label, note: clean(row.note, 500), suggested: row.suggested === true });
    if (items.length === limit) break;
  }
  return items;
}

// Only facts visible in the confirmed itinerary can supply a correct answer.
// Booking references, contact details and prices do not belong in travel games.
export function dayQuestions(day: ItineraryDay): JourneyQuestion[] {
  if (!Array.isArray(day.quiz)) return [];
  const facts = [day.region, day.city, day.country, day.date, day.highlight, day.note, day.lodging?.name,
    ...day.spots.flatMap(spot => [spot.name, spot.time, spot.note])].filter((text): text is string => typeof text === 'string');
  const references = [day.lodging?.bookingRef, ...day.spots.map(spot => spot.bookingRef)].filter((ref): ref is string => !!ref);
  const seen = new Set<string>();
  return day.quiz.slice(0, 6).flatMap(raw => {
    const row = record(raw);
    const question = clean(row.question, 180);
    const answer = clean(row.answer, 120);
    const evidence = clean(row.evidence, 240);
    if (!question || !answer || !evidence || seen.has(question) || !Array.isArray(row.options)) return [];
    const options = row.options.map(value => clean(value, 120));
    if (options.length < 2 || options.length > 4 || options.some(option => !option)
      || new Set(options.map(option => option.toLowerCase())).size !== options.length || !options.includes(answer)) return [];
    if (!evidence.includes(answer) || !facts.some(text => text.includes(evidence))) return [];
    const content = [question, ...options, evidence].join(' ');
    if (references.some(ref => content.includes(ref))) return [];
    seen.add(question);
    return [{ question, answer, options, evidence }];
  });
}

export function itineraryQuestions(days: ItineraryDay[]): JourneyQuestion[] {
  const questions: JourneyQuestion[] = [];
  for (const day of days) {
    const authored = dayQuestions(day);
    if (authored.length) {
      questions.push(...authored);
    } else {
      // Old trips and providers that omit a quiz still have their confirmed times.
      const spot = day.spots.find(s => s.name && /^([01]\d|2[0-3]):[0-5]\d$/.test(s.time));
      if (!spot) continue;
      const [hour, minute] = spot.time.split(':').map(Number);
      const options = [-30, 0, 45].map(offset => {
        const m = (hour * 60 + minute + offset + 1440) % 1440;
        return String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0');
      });
      questions.push({ question: `${day.date} 的「${spot.name}」安排在幾點？`, answer: spot.time, options, evidence: `${day.date} · ${spot.time} · ${spot.name}` });
    }
  }
  return questions;
}

export function routeRounds(days: ItineraryDay[]) {
  return days.flatMap(day => {
    const timed = day.spots.filter(s => s.name && /^([01]\d|2[0-3]):[0-5]\d$/.test(s.time));
    // Simultaneous stops and different local clocks have no unambiguous order.
    const stops = timed.filter(s => (s.timezone || day.timezone) === day.timezone
      && timed.filter(t => t.time === s.time || t.name === s.name).length === 1)
      .sort((a, b) => a.time.localeCompare(b.time)).slice(0, 4);
    return stops.length > 1 ? [{ date: day.date, region: day.region, stops }] : [];
  });
}

export function tripPacking(days: ItineraryDay[]) {
  return packingSuggestions(days.flatMap(day => day.packing || []), 300);
}
