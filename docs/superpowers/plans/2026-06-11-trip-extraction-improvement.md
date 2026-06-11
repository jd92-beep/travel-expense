# Trip Update AI Extraction — Comprehensive Improvement Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make trip itinerary extraction robust enough that an 8-day Jeju itinerary in tab-separated format with Chinese/Cantonese text produces a usable draft even when ALL LLMs fail or timeout.

**Architecture:** Three-layer defense: (1) expand the local regex parser to handle tab-separated tables, duration columns, and advice blocks; (2) harden the LLM pipeline with schema enforcement, prompt deduplication, and adaptive timeouts; (3) add post-extraction validation and auto-repair. All changes are in `app-compact/src/` (the advanced pipeline). Porting to `app-react/src/` is a separate follow-up since it uses a simpler single-stage broker call.

**Tech Stack:** TypeScript, regex, existing `ItineraryDay`/`ItinerarySpot` types, existing broker + model ladder.

---

## Root Cause Analysis: Why the Jeju Itinerary Failed

### Failure Point 1: Local Parser Blind Spots (`app-compact/src/lib/ai.ts:338-366`)

The `extractLocalDaySpots()` function has exactly two parsing branches:

1. **Pipe tables** (line 352): `^\|` → splits on `|`, expects `| time | category | name |`
2. **Plain text** (line 360): `HH:MM name` pattern

The user's format uses **tab-separated columns**:
```
09:00	先食簡單早餐 / 咖啡，Natalie 肚餓就唔好硬頂	30–45分鐘
```
This matches neither branch. The line doesn't start with `|`, and while it starts with `HH:MM`, the regex `^([01]?\d|2[0-3]):([0-5]\d)\s*(AM|PM)?\s*[:：]?\s+(.+?)\s*$` captures the entire rest of the line (including the duration column) as the spot name, which is incorrect — `30–45分鐘` gets appended to the name.

### Failure Point 2: Duration Column Ignored

Even if the tab-separated format were parsed, the duration column (`30–45分鐘`, `約60–75分鐘車程`) has no extraction target. The `ItinerarySpot` type has `timeEnd` but the local parser never calculates it. The duration is valuable for Timeline tab's live tracking.

### Failure Point 3: Advice Blocks Filtered but Not Preserved

Line 422: `.filter((spot) => spot.name && !/建議[:：]/.test(spot.name))` — this correctly filters out `建議：...` lines from spots, but the advice content (e.g., "Day 1 唔好加正房瀑布。紅眼機到埗，容易攰") is lost entirely. It should become a day-level `note` or `highlight`.

### Failure Point 4: LLM Prompt Duplication

Three different prompt contracts exist for the same extraction task:
- **Worker broker** (`workers/credential-broker/src/index.js:1102-1125`): Single-stage, 14K char input, no organizedItinerary
- **Frontend compact** (`app-compact/src/lib/ai.ts:845-886`): Two-stage (organize + extract), 28K chars each
- **Frontend react** (`app-react/src/lib/ai.ts:471-482`): Single-stage, 14K chars, broker-first

When the compact frontend calls the broker (`brokerTripIntelligence`), the broker uses its OWN prompt (not the frontend's two-stage prompt). The frontend then falls back to its own two-stage pipeline only if the broker fails. This means the most sophisticated prompt (two-stage) is only used in the fallback path.

### Failure Point 5: Weak Model Timeout Pressure

For 8 complex days of Cantonese/Chinese/Korean content:
- Primary attempt: 8s (kimi-code) — tight for 28K chars of structured extraction
- Fallback attempts: 9s each — same problem
- Total deadline with local draft: 14s — only enough for ~1.5 model attempts
- Each attempt makes 2 API calls (organize + extract) — effectively 4s per call

Weak models (gemini-3.1-flash-lite, mimo-v2.5) consistently fail under this pressure.

### Failure Point 6: `stringifyOrganizedItinerary` Truncation

Line 369: `.slice(0, 5000)` — for 8 days with 5-8 spots each, the organized itinerary easily exceeds 5000 chars. Stage 2 extraction then receives a truncated input, losing Day 5-8 data.

---

## Phase 1: Local Parser — Tab-Separated Table Support

**Goal:** Make `localTripDraftFromParagraph()` produce a complete 8-day draft from the user's exact format without any LLM.

**Files:**
- Modify: `app-compact/src/lib/ai.ts:259-366` (normalize + extract functions)
- Create: `app-compact/src/lib/__tests__/trip-local-parser.test.ts`

### Task 1.1: Add Tab-Separated Row Detection to `extractLocalDaySpots()`

**File:** `app-compact/src/lib/ai.ts:338-366`

The function currently has two branches (pipe table, plain text). Add a third branch for tab-separated rows, placed BEFORE the plain text branch so tabs are detected first.

- [ ] **Step 1: Write failing test**

Create `app-compact/src/lib/__tests__/trip-local-parser.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';

// We'll need to export these for testing, or test via the full localTripDraftFromParagraph
// For now, test the core extraction logic inline

describe('extractLocalDaySpots — tab-separated tables', () => {
  // Helper to simulate what extractLocalDaySpots does
  function parseTabRow(line: string): { time: string; name: string; duration: string } | null {
    // This is the logic we'll implement
    const tabMatch = line.match(/^([01]?\d|2[0-3]):([0-5]\d)\t(.+?)(?:\t(.+?))?$/);
    if (!tabMatch) return null;
    const time = `${tabMatch[1].padStart(2, '0')}:${tabMatch[2]}`;
    const name = tabMatch[3].trim();
    const duration = (tabMatch[4] || '').trim();
    return { time, name, duration };
  }

  it('parses HH:MM\\tname\\tduration format', () => {
    const result = parseTabRow('09:00\t先食簡單早餐 / 咖啡，Natalie 肚餓就唔好硬頂\t30–45分鐘');
    expect(result).toEqual({
      time: '09:00',
      name: '先食簡單早餐 / 咖啡，Natalie 肚餓就唔好硬頂',
      duration: '30–45分鐘',
    });
  });

  it('parses HH:MM\\tname without duration', () => {
    const result = parseTabRow('06:30\t抵達濟州機場\t—');
    expect(result).toEqual({
      time: '06:30',
      name: '抵達濟州機場',
      duration: '—',
    });
  });

  it('parses duration with range and unit', () => {
    const result = parseTabRow('11:15\t午餐：李春玉元祖鯖魚包飯\t60–75分鐘');
    expect(result).toEqual({
      time: '11:15',
      name: '午餐：李春玉元祖鯖魚包飯',
      duration: '60–75分鐘',
    });
  });

  it('ignores header rows like 時間\\t地點', () => {
    const result = parseTabRow('時間\t地點 / 活動\t建議停留');
    expect(result).toBeNull();
  });

  it('handles em-dash, en-dash, and hyphen in duration', () => {
    expect(parseTabRow('10:00\t景點\t30-45分鐘')).toBeTruthy();
    expect(parseTabRow('10:00\t景點\t30–45分鐘')).toBeTruthy();
    expect(parseTabRow('10:00\t景點\t30—45分鐘')).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd app-compact && npx vitest run src/lib/__tests__/trip-local-parser.test.ts`
Expected: FAIL (test file doesn't import from actual module yet)

- [ ] **Step 3: Add tab-separated branch to `extractLocalDaySpots()`**

In `app-compact/src/lib/ai.ts`, after the pipe table branch (line 358 `continue;`) and before the plain text branch (line 360), insert:

```typescript
    // Tab-separated table: HH:MM\tname\tduration
    const tabCells = line.split('\t');
    if (tabCells.length >= 2) {
      const timeMatch = tabCells[0].match(/^([01]?\d|2[0-3]):([0-5]\d)$/);
      if (timeMatch) {
        const time = `${timeMatch[1].padStart(2, '0')}:${timeMatch[2]}`;
        const name = cleanLocalSpotName(tabCells[1]);
        const durationRaw = tabCells.length >= 3 ? tabCells[2].trim() : '';
        // Skip header rows and separator-only cells
        if (!name || /^(時間|地點|活動|建議停留|類別)$/i.test(name)) continue;
        const duration = parseDuration(durationRaw);
        const spot = localSpotFromParts(time, name, rawLine);
        if (spot) {
          if (duration.end) spot.timeEnd = duration.end;
          if (duration.note) spot.note = spot.note ? `${spot.note} (${duration.note})` : duration.note;
          add(spot);
        }
        continue;
      }
    }
```

- [ ] **Step 4: Implement `parseDuration()` helper**

Add above `extractLocalDaySpots()`:

```typescript
function parseDuration(raw: string): { minutes: number; end: string; note: string } {
  const clean = String(raw || '').replace(/[—–\-]/g, '–').trim();
  if (!clean || clean === '—' || clean === '-') return { minutes: 0, end: '', note: '' };
  // Range: "30–45分鐘" or "約60–75分鐘車程"
  const range = clean.match(/(?:約)?(\d+)\s*–\s*(\d+)\s*分鐘(?:車程|步程|停留)?/);
  if (range) {
    const avg = Math.round((Number(range[1]) + Number(range[2])) / 2);
    return { minutes: avg, end: '', note: `${range[1]}–${range[2]}分鐘` };
  }
  // Single: "60分鐘"
  const single = clean.match(/(\d+)\s*分鐘/);
  if (single) return { minutes: Number(single[1]), end: '', note: `${single[1]}分鐘` };
  return { minutes: 0, end: '', note: clean !== '—' ? clean : '' };
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd app-compact && npx vitest run src/lib/__tests__/trip-local-parser.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add app-compact/src/lib/ai.ts app-compact/src/lib/__tests__/trip-local-parser.test.ts
git commit -m "feat(trip): add tab-separated table parsing to local itinerary extractor"
```

### Task 1.2: Compute `timeEnd` from Duration Column

**File:** `app-compact/src/lib/ai.ts:338-366`

The `parseDuration()` helper extracts the note but doesn't compute `timeEnd`. Add time arithmetic.

- [ ] **Step 1: Write failing test**

Add to `trip-local-parser.test.ts`:

```typescript
describe('parseDuration → timeEnd computation', () => {
  function computeTimeEnd(time: string, durationMinutes: number): string {
    if (!durationMinutes || !time) return '';
    const [h, m] = time.split(':').map(Number);
    const totalMin = h * 60 + m + durationMinutes;
    const endH = Math.floor(totalMin / 60) % 24;
    const endM = totalMin % 60;
    return `${String(endH).padStart(2, '0')}:${String(endM).padStart(2, '0')}`;
  }

  it('computes timeEnd from 09:00 + 30min = 09:30', () => {
    expect(computeTimeEnd('09:00', 30)).toBe('09:30');
  });

  it('computes timeEnd from 09:00 + 45min = 09:45', () => {
    expect(computeTimeEnd('09:00', 45)).toBe('09:45');
  });

  it('computes timeEnd from 11:15 + 75min = 12:30', () => {
    expect(computeTimeEnd('11:15', 75)).toBe('12:30');
  });

  it('wraps midnight correctly', () => {
    expect(computeTimeEnd('23:30', 45)).toBe('00:15');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd app-compact && npx vitest run src/lib/__tests__/trip-local-parser.test.ts`
Expected: FAIL on new tests

- [ ] **Step 3: Add `computeTimeEnd()` and wire it into `parseDuration()`**

```typescript
function computeTimeEnd(time: string, durationMinutes: number): string {
  if (!durationMinutes || !time) return '';
  const [h, m] = time.split(':').map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return '';
  const totalMin = h * 60 + m + durationMinutes;
  const endH = Math.floor(((totalMin % 1440) + 1440) % 1440 / 60);
  const endM = ((totalMin % 60) + 60) % 60;
  return `${String(endH).padStart(2, '0')}:${String(endM).padStart(2, '0')}`;
}
```

Update `parseDuration()` to accept `time` and compute `end`:

```typescript
function parseDuration(raw: string, time = ''): { minutes: number; end: string; note: string } {
  const clean = String(raw || '').replace(/[—–\-]/g, '–').trim();
  if (!clean || clean === '—' || clean === '-') return { minutes: 0, end: '', note: '' };
  const range = clean.match(/(?:約)?(\d+)\s*–\s*(\d+)\s*分鐘(?:車程|步程|停留)?/);
  if (range) {
    const avg = Math.round((Number(range[1]) + Number(range[2])) / 2);
    return { minutes: avg, end: computeTimeEnd(time, avg), note: `${range[1]}–${range[2]}分鐘` };
  }
  const single = clean.match(/(\d+)\s*分鐘/);
  if (single) {
    const mins = Number(single[1]);
    return { minutes: mins, end: computeTimeEnd(time, mins), note: `${single[1]}分鐘` };
  }
  return { minutes: 0, end: '', note: clean !== '—' ? clean : '' };
}
```

Update the tab-separated branch to pass `time` to `parseDuration()`:
```typescript
const duration = parseDuration(durationRaw, time);
```

And set `timeEnd`:
```typescript
if (duration.end) spot.timeEnd = duration.end;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd app-compact && npx vitest run src/lib/__tests__/trip-local-parser.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add app-compact/src/lib/ai.ts app-compact/src/lib/__tests__/trip-local-parser.test.ts
git commit -m "feat(trip): compute timeEnd from duration column in local parser"
```

### Task 1.3: Preserve Advice/Tips as Day-Level Notes

**File:** `app-compact/src/lib/ai.ts:400-482`

Currently `建議：...` lines are filtered out (line 422). Extract them as day-level notes.

- [ ] **Step 1: Write failing test**

```typescript
describe('advice block extraction', () => {
  it('extracts 建議 lines as day notes', () => {
    const block = `09:00\t景點A\t30分鐘
11:00\t景點B\t60分鐘
建議：Day 1 唔好加正房瀑布。紅眼機到埗，容易攰`;
    // After our changes, the day should have a note field
    // containing the advice text
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

- [ ] **Step 3: Add advice extraction to `localTripDraftFromParagraph()`**

In `app-compact/src/lib/ai.ts`, inside the day loop (around line 420-437), add before the `itinerary.push()`:

```typescript
    // Extract advice/tips blocks as day-level notes
    const adviceLines: string[] = [];
    for (const rawLine of block.split('\n')) {
      const line = rawLine.trim();
      const adviceMatch = line.match(/^建議[：:]\s*(.+)/);
      if (adviceMatch) adviceLines.push(adviceMatch[1].trim());
    }
```

Then add `note` to the itinerary day object:

```typescript
    itinerary.push({
      // ... existing fields ...
      note: adviceLines.join('；') || undefined,
      // ... rest of fields ...
    });
```

- [ ] **Step 4: Run test to verify it passes**

- [ ] **Step 5: Commit**

```bash
git add app-compact/src/lib/ai.ts app-compact/src/lib/__tests__/trip-local-parser.test.ts
git commit -m "feat(trip): preserve advice/tips blocks as day-level notes in local parser"
```

### Task 1.4: Improve `cleanLocalSpotName()` for Complex Chinese Names

**File:** `app-compact/src/lib/ai.ts:312-321`

The current cleaner doesn't handle the user's complex spot names well. Names like `先食簡單早餐 / 咖啡，Natalie 肚餓就唔好硬頂` should be cleaned but not destroyed.

- [ ] **Step 1: Write failing test**

```typescript
describe('cleanLocalSpotName', () => {
  function cleanLocalSpotName(value: string): string {
    return String(value || '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\*\s*([^*]+?)\s*\*/g, '$1')
      .replace(/^\s*(?:地點\s*\/\s*活動|建議停留|時間|類別)\s*$/i, '')
      .replace(/\s*[—-]\s*$/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 120);
  }

  it('preserves complex Chinese names with slashes and commas', () => {
    expect(cleanLocalSpotName('先食簡單早餐 / 咖啡，Natalie 肚餓就唔好硬頂'))
      .toBe('先食簡單早餐 / 咖啡，Natalie 肚餓就唔好硬頂');
  });

  it('strips header row text', () => {
    expect(cleanLocalSpotName('地點 / 活動')).toBe('');
  });

  it('preserves colon in spot name (午餐：xxx)', () => {
    expect(cleanLocalSpotName('午餐：李春玉元祖鯖魚包飯'))
      .toBe('午餐：李春玉元祖鯖魚包飯');
  });
});
```

- [ ] **Step 2: Run test** — current implementation should PASS for these (verify no regression)

- [ ] **Step 3: Add tab-stripping to `cleanLocalSpotName()`**

Update the function to also strip duration remnants that may leak through:

```typescript
function cleanLocalSpotName(value: string): string {
  return String(value || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\*\s*([^*]+?)\s*\*/g, '$1')
    .replace(/^\s*(?:地點\s*\/\s*活動|建議停留|時間|類別)\s*$/i, '')
    .replace(/\s*[—-]\s*$/g, '')
    .replace(/\t/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120);
}
```

- [ ] **Step 4: Run test to verify it passes**

- [ ] **Step 5: Commit**

```bash
git add app-compact/src/lib/ai.ts app-compact/src/lib/__tests__/trip-local-parser.test.ts
git commit -m "fix(trip): improve spot name cleaning for complex Chinese names with tabs"
```

### Task 1.5: End-to-End Local Parser Test with Jeju Itinerary

**File:** Create `app-compact/src/lib/__tests__/trip-local-e2e.test.ts`

- [ ] **Step 1: Write comprehensive E2E test**

```typescript
import { describe, it, expect } from 'vitest';

const JEJU_ITINERARY = `Day 1｜6月13日｜到步＋西線入住｜住 Hotel Fine Jeju

時間	地點 / 活動	建議停留

06:30	抵達濟州機場	—
08:30	機場租車完成	—
09:00	先食簡單早餐 / 咖啡，Natalie 肚餓就唔好硬頂	30–45分鐘
09:45	道頭洞彩虹海岸道路＋石頭爺爺麥當勞	30–45分鐘
11:15	午餐：李春玉元祖鯖魚包飯	60–75分鐘

建議：Day 1 唔好加正房瀑布。紅眼機到埗，容易攰，Osulloc 之後直接返酒店比較舒服。

Day 2｜6月14日｜東線一日｜住 Hotel Fine Jeju

時間	地點 / 活動	建議停留

08:00	早餐：酒店附近	30分鐘
09:00	城山日出峰	90–120分鐘
11:30	牛島渡輪	約30分鐘車程
12:00	牛島環島	2–3小時
15:30	涉地可支	45–60分鐘`;

describe('Jeju itinerary E2E local parsing', () => {
  // This test validates the full local parser pipeline
  // We'll import localTripDraftFromParagraph once exported for testing

  it('extracts 2 days from sample itinerary', () => {
    // After implementation, this should produce 2 days with correct spots
  });

  it('extracts lodging from header line', () => {
    // Day 1 header: "住 Hotel Fine Jeju"
  });

  it('extracts advice as day note', () => {
    // Day 1 should have note about not adding waterfall
  });

  it('extracts timeEnd from duration', () => {
    // 09:00 + 30-45min → timeEnd ~09:37
  });

  it('skips header rows (時間, 地點 / 活動)', () => {
    // Header row should not appear as a spot
  });
});
```

- [ ] **Step 2: Run test** — will fail until implementation is complete

- [ ] **Step 3: Export `localTripDraftFromParagraph` for testing** (or test via a thin wrapper)

Add at the end of `ai.ts`:
```typescript
export { localTripDraftFromParagraph as _testLocalTripDraft };
```

Or create a test helper that imports the function.

- [ ] **Step 4: Implement and verify all E2E assertions pass**

- [ ] **Step 5: Commit**

```bash
git add app-compact/src/lib/__tests__/trip-local-e2e.test.ts app-compact/src/lib/ai.ts
git commit -m "test(trip): add E2E test for Jeju itinerary local parsing"
```

---

## Phase 2: LLM Pipeline Hardening

**Goal:** When the local parser produces a usable draft, use it as a safety net. When LLMs are called, make them more reliable with better prompts and adaptive timeouts.

### Task 2.1: Increase `stringifyOrganizedItinerary` Truncation Limit

**File:** `app-compact/src/lib/ai.ts:368-388`

**Problem:** Line 369 truncates at 5000 chars. For 8 days, this loses later days.

- [ ] **Step 1: Change truncation limit**

```typescript
// Line 369: change 5000 → 12000
function stringifyOrganizedItinerary(value: unknown, fallbackTrip?: Pick<TripProfile, 'name' | 'itinerary'>): string {
  if (typeof value === 'string') return value.replace(/\s+\n/g, '\n').trim().slice(0, 12000);
  // ... rest unchanged but also update the two 5000 → 12000 references below
```

Also update the two other `.slice(0, 5000)` references in the same function (lines 373, 387).

- [ ] **Step 2: Verify no regression** — the LLM prompts already accept up to 28K chars, so 12K for organized output is safe.

- [ ] **Step 3: Commit**

```bash
git add app-compact/src/lib/ai.ts
git commit -m "fix(trip): increase organized itinerary truncation from 5K to 12K chars"
```

### Task 2.2: Unify Prompt Contracts — Broker Uses Same Prompt as Frontend

**Files:**
- Modify: `workers/credential-broker/src/index.js:1102-1125`
- Modify: `app-compact/src/lib/ai.ts:888-898`

**Problem:** The broker uses a different, simpler prompt than the frontend's two-stage pipeline. When the broker handles the request, the frontend's sophisticated prompts are never used.

**Strategy:** The broker should use the same `tripIntelligencePromptContract()` as the frontend. Since the broker is a separate Worker, the simplest approach is to embed the contract text in the broker or have the frontend pass the prompt contract in the request body.

- [ ] **Step 1: Update broker to accept optional prompt override**

In `workers/credential-broker/src/index.js`, modify `tripAnalysisPrompt()`:

```javascript
function tripAnalysisPrompt(body) {
  const paragraph = String(body.paragraph || '').slice(0, 14000);
  const currentTrip = body.currentTrip && typeof body.currentTrip === 'object' ? body.currentTrip : {};
  const promptContract = String(body.promptContract || '');
  
  const contract = promptContract || [
    'Return strict JSON only.',
    'Trip intelligence must include countryCode, countryName, primaryCurrency, themeKey, locale, timezone, weatherRegion, confidence.',
    `themeKey must be one of: ${TRIP_THEME_KEYS.join(', ')}.`,
    'Use country/day itinerary context to set default currency, itinerary country/city/timezone, and weather location. Do not invent secrets or API keys.',
    'Accept messy travel text: Markdown headings, pipe tables, tab-separated tables, pasted HTML, Chinese dates, English dates, and plain timetable rows.',
    'For tables (pipe or tab-separated), treat columns such as time/place/duration as itinerary rows; extract each row as a spot.',
    'For each Day section, extract day number, date, lodging, every timed activity, transport, flight, restaurant, shop, attraction, and notes.',
    'Never copy the current itinerary as a successful extraction unless the user text explicitly contains those same days/spots.',
    'For every extracted place, include city, country, timezone when present, and lat/lon only when reasonably inferable.',
    'Mark uncertain fields with confidence low and list assumptions in extractionReport.',
  ].join(' ');

  return `Analyze the user's travel plan and return strict JSON only.
${contract}

Current trip JSON:
${JSON.stringify({
    id: currentTrip.id,
    name: currentTrip.name,
    startDate: currentTrip.startDate,
    endDate: currentTrip.endDate,
    destinationSummary: currentTrip.destinationSummary,
    itinerary: currentTrip.itinerary,
  }).slice(0, 12000)}

Return:
{"trip":{"name":string,"destinationSummary":string,"startDate":"YYYY-MM-DD","endDate":"YYYY-MM-DD","homeCurrency":"HKD","currencies":string[],"intelligence":{"countryCode":string,"countryName":string,"primaryCurrency":string,"themeKey":"japan_washi|korea_editorial|taiwan_nightmarket|europe_rail|global_journal","locale":string,"timezone":string,"weatherRegion":string,"confidence":"low|medium|high"},"itinerary":[{"date":"YYYY-MM-DD","day":number,"region":string,"city":string,"country":string,"timezone":string,"currency":string,"highlight":string,"lodging":{"name":string,"address":string,"mapUrl":string,"checkIn":string,"checkOut":string},"spots":[{"time":"HH:MM","timeEnd":"HH:MM","name":string,"type":"flight|transport|food|shopping|lodging|ticket|localtour|medicine|other|sightseeing","address":string,"mapUrl":string,"note":string,"timezone":string,"lat":number,"lon":number}]}]},"summary":string,"warnings":string[],"changes":string[]}

USER PARAGRAPH:
${paragraph}`;
}
```

- [ ] **Step 2: Pass the prompt contract from frontend to broker**

In `app-compact/src/lib/ai.ts`, update the `brokerTripIntelligence` call (around line 886-898) to pass the contract:

```typescript
const brokerResult = await brokerTripIntelligence(state, {
  paragraph: paragraph.slice(0, 14000),
  currentTrip,
  model: KIMI_API_MODEL,
  promptContract: tripIntelligencePromptContract(),
});
```

- [ ] **Step 3: Verify broker still returns valid JSON** — test with a short itinerary

- [ ] **Step 4: Commit**

```bash
git add workers/credential-broker/src/index.js app-compact/src/lib/ai.ts
git commit -m "fix(trip): unify prompt contract between broker and frontend"
```

### Task 2.3: Adaptive Timeout — Scale with Input Length

**File:** `app-compact/src/lib/ai.ts:186-192`

**Problem:** Fixed 8s/9s timeouts don't account for input complexity. An 8-day itinerary needs more processing time than a 2-day one.

- [ ] **Step 1: Implement input-length-aware timeout**

```typescript
function tripAttemptTimeoutMs(attempt: ModelAttempt, index: number, hasLocalDraft: boolean, inputLength = 0): number {
  const override = configuredTripAttemptTimeoutMs();
  if (override) return override;
  if (!hasLocalDraft) return TRIP_NO_LOCAL_TIMEOUT_MS;
  
  // Scale timeout by input complexity
  // Short (<2K chars): base timeout
  // Medium (2K-8K chars): +3s
  // Long (8K+ chars): +6s
  const lengthBonus = inputLength > 8000 ? 6_000 : inputLength > 2000 ? 3_000 : 0;
  
  if (index === 0) {
    const base = attempt.provider === 'mimo' ? 7_000 : TRIP_PRIMARY_TIMEOUT_MS;
    return base + lengthBonus;
  }
  return TRIP_FALLBACK_TIMEOUT_MS + lengthBonus;
}
```

- [ ] **Step 2: Pass `paragraph.length` to `tripAttemptTimeoutMs()`**

In `parseTripParagraph()`, update the call at line 927:

```typescript
const timeoutMs = tripAttemptTimeoutMs(attempt, index, hasFastLocalDraft, paragraph.length);
```

- [ ] **Step 3: Commit**

```bash
git add app-compact/src/lib/ai.ts
git commit -m "feat(trip): scale LLM timeout by input length for complex itineraries"
```

### Task 2.4: Skip Stage 1 (Organize) When Local Parser Already Produced Good Data

**File:** `app-compact/src/lib/ai.ts:888-970`

**Problem:** When the local parser already extracted a complete draft (8 days, 40+ spots), Stage 1 (organize) is redundant. The LLM should focus on enriching (adding addresses, coordinates, better classification) rather than re-organizing.

- [ ] **Step 1: Add enrichment prompt as alternative to organize+extract**

```typescript
function buildTripEnrichmentPrompt(localDraft: TripProfile, paragraph: string): string {
  return `The following itinerary was extracted by a local parser. Enrich it with missing details.
${tripIntelligencePromptContract()}

LOCAL PARSED ITINERARY:
${JSON.stringify(localDraft.itinerary, null, 2).slice(0, 12000)}

USER RAW TEXT (for reference):
${paragraph.slice(0, 14000)}

Task: Return the same itinerary structure but with:
- Better spot type classification (fix any 'other' types)
- city/country filled in for each day
- timezone set correctly
- lodging details (address, mapUrl) when inferable
- Any spots the local parser missed

Return the enriched trip JSON in the same format as the extraction prompt.
Do NOT remove spots the local parser found. Only add/modify if you have high confidence.`;
}
```

- [ ] **Step 2: Use enrichment path when local draft is strong**

In `parseTripParagraph()`, after the local draft check (line 900-901), add:

```typescript
const localDraftQuality = hasFastLocalDraft ? assessLocalDraftQuality(fastLocalDraft!) : 'none';
```

Add helper:
```typescript
function assessLocalDraftQuality(draft: TripDraft): 'high' | 'medium' | 'none' {
  const days = draft.trip.itinerary || [];
  const spots = days.flatMap(d => d.spots || []);
  if (days.length >= 4 && spots.length >= 10) return 'high';
  if (days.length >= 2 && spots.length >= 4) return 'medium';
  return 'none';
}
```

Then in the model attempt loop, if quality is 'high', use the enrichment prompt instead of organize+extract:

```typescript
if (localDraftQuality === 'high') {
  const enrichPrompt = buildTripEnrichmentPrompt(fastLocalDraft!.trip, paragraph);
  const enriched = await withTimeout(
    callModelAttemptJson(state, attempt, enrichPrompt, 'trip'),
    timeoutMs,
    `Trip enrich ${attempt.label}`,
  );
  if (enriched && typeof enriched === 'object') {
    const draft = normalizeTripDraft(enriched, state, paragraph);
    if (hasUsefulTripItinerary(draft)) return draft;
  }
  // Fall through to standard organize+extract if enrichment fails
}
```

- [ ] **Step 3: Commit**

```bash
git add app-compact/src/lib/ai.ts
git commit -m "feat(trip): skip organize stage when local parser has high-quality draft"
```

---

## Phase 3: Post-Extraction Validation & Auto-Repair

**Goal:** Catch common extraction errors before presenting to user.

### Task 3.1: Validate Extracted Itinerary Against Input Text

**File:** `app-compact/src/lib/ai.ts` (new function after `normalizeTripDraft`)

- [ ] **Step 1: Add validation function**

```typescript
function validateTripDraft(draft: TripDraft, paragraph: string): { warnings: string[]; repaired: TripDraft } {
  const warnings: string[] = [];
  const trip = { ...draft.trip };
  const itinerary = [...(trip.itinerary || [])];
  
  // Check 1: Date continuity — no gaps > 1 day
  for (let i = 1; i < itinerary.length; i++) {
    const prev = new Date(itinerary[i - 1].date + 'T00:00:00');
    const curr = new Date(itinerary[i].date + 'T00:00:00');
    const gap = (curr.getTime() - prev.getTime()) / 86_400_000;
    if (gap > 2) {
      warnings.push(`Day ${itinerary[i].day} has a ${gap}-day gap from previous day`);
    }
  }
  
  // Check 2: Spot time ordering within each day
  for (const day of itinerary) {
    const spots = day.spots || [];
    for (let i = 1; i < spots.length; i++) {
      if (spots[i].time && spots[i - 1].time && spots[i].time < spots[i - 1].time) {
        // Could be intentional (next day crossing midnight) — just warn
        if (!spots[i].note?.includes('夜')) {
          warnings.push(`Day ${day.day}: ${spots[i].name} (${spots[i].time}) is earlier than ${spots[i - 1].name} (${spots[i - 1].time})`);
        }
      }
    }
  }
  
  // Check 3: Empty days
  const emptyDays = itinerary.filter(d => !d.spots?.length);
  if (emptyDays.length) {
    warnings.push(`${emptyDays.length} day(s) have no spots extracted`);
  }
  
  // Check 4: All spots have type 'other' — likely classification failure
  const allSpots = itinerary.flatMap(d => d.spots || []);
  const otherRatio = allSpots.filter(s => s.type === 'other').length / Math.max(allSpots.length, 1);
  if (otherRatio > 0.8 && allSpots.length > 3) {
    warnings.push('Most spots have type "other" — classification may have failed');
  }
  
  return { warnings, repaired: { ...draft, trip, warnings: [...draft.warnings, ...warnings] } };
}
```

- [ ] **Step 2: Call validation in `parseTripParagraph()` before returning**

After each successful extraction (lines 954-958), add:

```typescript
const validated = validateTripDraft(draft, paragraph);
return {
  ...validated.repaired,
  warnings: [...warnings, ...validated.repaired.warnings].filter(Boolean),
};
```

- [ ] **Step 3: Commit**

```bash
git add app-compact/src/lib/ai.ts
git commit -m "feat(trip): add post-extraction validation with date/time/type checks"
```

### Task 3.2: Auto-merge Local + LLM Results

**File:** `app-compact/src/lib/ai.ts` (new function)

**Problem:** Sometimes LLM extracts 6/8 days well but misses 2. The local parser might catch all 8 but without enrichment. Merge the best of both.

- [ ] **Step 1: Add merge function**

```typescript
function mergeTripDrafts(local: TripDraft, llm: TripDraft): TripDraft {
  const localDays = new Map(local.trip.itinerary.map(d => [d.date, d]));
  const mergedItinerary = llm.trip.itinerary.map(llmDay => {
    const localDay = localDays.get(llmDay.date);
    if (!localDay) return llmDay;
    // Prefer LLM's enrichment but keep local's spots if LLM has fewer
    const llmSpotCount = llmDay.spots?.length || 0;
    const localSpotCount = localDay.spots?.length || 0;
    return {
      ...llmDay,
      spots: llmSpotCount >= localSpotCount ? llmDay.spots : localDay.spots,
      lodging: llmDay.lodging || localDay.lodging,
      note: llmDay.note || localDay.note,
    };
  });
  
  // Add any days LLM missed but local caught
  const llmDates = new Set(mergedItinerary.map(d => d.date));
  for (const localDay of localDays.values()) {
    if (!llmDates.has(localDay.date)) {
      mergedItinerary.push(localDay);
    }
  }
  
  mergedItinerary.sort((a, b) => a.date.localeCompare(b.date));
  
  return {
    ...llm,
    trip: { ...llm.trip, itinerary: mergedItinerary },
    warnings: [...llm.warnings, 'Merged local parser and LLM results for completeness.'],
  };
}
```

- [ ] **Step 2: Use merge when both local and LLM produce results**

In `parseTripParagraph()`, after a successful LLM extraction, check if the local draft has more days:

```typescript
if (hasFastLocalDraft && fastLocalDraft) {
  const localDayCount = fastLocalDraft.trip.itinerary.length;
  const llmDayCount = draft.trip.itinerary.length;
  if (localDayCount > llmDayCount) {
    const merged = mergeTripDrafts(fastLocalDraft, draft);
    return { ...merged, warnings: [...warnings, ...merged.warnings].filter(Boolean) };
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add app-compact/src/lib/ai.ts
git commit -m "feat(trip): auto-merge local parser and LLM results for completeness"
```

---

## Phase 4: Data Pipeline — Timeline & Weather Integration

**Goal:** Ensure extracted data flows correctly to downstream tabs.

### Task 4.1: Verify `timeEnd` Propagates to Timeline

**Files:**
- Check: `app-compact/src/components/Timeline*.tsx` or equivalent
- Check: `app-compact/src/domain/trip/normalize.ts:92-106`

- [ ] **Step 1: Verify `normalizeItinerary()` preserves `timeEnd`**

The current `normalizeItinerary()` (normalize.ts:92-106) spreads `...spot` which preserves `timeEnd`. Verify no downstream code strips it.

- [ ] **Step 2: If Timeline uses `timeEnd` for duration display, verify it works**

- [ ] **Step 3: If `timeEnd` is not used, add it to Timeline spot rendering**

- [ ] **Step 4: Commit if changes needed**

### Task 4.2: Verify `note` Propagates from Day-Level to UI

**Files:**
- Check: `app-compact/src/components/` for day note rendering

- [ ] **Step 1: Search for `day.note` or `day.highlight` usage in UI components**

- [ ] **Step 2: If day notes aren't displayed, add rendering in the itinerary view**

- [ ] **Step 3: Commit if changes needed**

---

## Phase 5: app-react Port (Follow-up)

**Goal:** Port the local parser improvements to `app-react/` which currently has NO local fallback.

**Files:**
- Modify: `app-react/src/lib/ai.ts`

This is a separate phase because app-react uses a simpler single-stage broker call. The port involves:

1. Copy `extractLocalDaySpots()`, `parseDuration()`, `computeTimeEnd()`, `localTripDraftFromParagraph()` from app-compact
2. Add local fallback to `parseTripParagraph()` in app-react
3. Test independently

- [ ] **Step 1: Copy local parser functions from app-compact to app-react**
- [ ] **Step 2: Add local fallback logic to app-react's `parseTripParagraph()`**
- [ ] **Step 3: Test with Jeju itinerary**
- [ ] **Step 4: Commit**

---

## Verification Strategy

### Per-Phase Verification

| Phase | Test Type | Command | Expected |
|-------|-----------|---------|----------|
| 1 | Unit tests | `cd app-compact && npx vitest run src/lib/__tests__/trip-local-parser.test.ts` | All PASS |
| 1 | E2E test | `cd app-compact && npx vitest run src/lib/__tests__/trip-local-e2e.test.ts` | 8 days, 40+ spots extracted |
| 1 | Smoke test | Paste Jeju itinerary into Trip Update UI | Shows 8-day draft without LLM |
| 2 | Unit test | Verify timeout scaling with different input lengths | Correct timeout values |
| 2 | Smoke test | Paste Jeju itinerary, check console for model attempts | Longer timeouts for long input |
| 3 | Unit test | Verify merge function with synthetic local + LLM data | Correctly merges days |
| 3 | Smoke test | Paste itinerary, verify warnings appear for missing days | Warnings shown |
| 4 | Manual check | Check Timeline tab shows duration, Weather tab has locations | Data flows correctly |

### Full Regression Test

After all phases, paste these formats and verify extraction:

1. **Tab-separated (Jeju)** — the original failing case
2. **Pipe table** — existing format, must still work
3. **Plain text** — `HH:MM name` format, must still work
4. **Mixed language** — Chinese + English + Korean names
5. **Short trip** (2 days) — verify no over-extraction
6. **No dates in text** — verify year inference still works

---

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Tab regex matches non-tab content | Low | Medium | Only match when line has `\t` AND starts with `HH:MM` |
| Duration parsing breaks existing pipe table parsing | Low | High | New branch is additive, doesn't modify existing branches |
| Increased timeout causes UI lag | Medium | Medium | Local draft still returns fast (14s deadline unchanged) |
| Broker prompt change breaks existing working extractions | Low | High | New prompt is superset of old; add `promptContract` as optional field |
| Merge function creates duplicate spots | Medium | Low | Dedup by spot name + time within merge |
| `timeEnd` not consumed by Timeline | Low | Low | It's additive data; Timeline can ignore it safely |

---

## Summary of Changes by File

| File | Phase | Changes |
|------|-------|---------|
| `app-compact/src/lib/ai.ts` | 1,2,3 | Add tab parser, duration, advice, enrichment prompt, validation, merge |
| `app-compact/src/lib/__tests__/trip-local-parser.test.ts` | 1 | New test file |
| `app-compact/src/lib/__tests__/trip-local-e2e.test.ts` | 1 | New test file |
| `workers/credential-broker/src/index.js` | 2 | Update `tripAnalysisPrompt()` to accept prompt contract |
| `app-react/src/lib/ai.ts` | 5 | Port local parser (follow-up) |

## Implementation Order

1. **Phase 1** (Tasks 1.1–1.5): Local parser — highest impact, zero LLM dependency
2. **Phase 2** (Tasks 2.1–2.4): LLM hardening — improves quality when LLMs work
3. **Phase 3** (Tasks 3.1–3.2): Validation + merge — safety net for edge cases
4. **Phase 4** (Tasks 4.1–4.2): Pipeline verification — ensure data flows downstream
5. **Phase 5** (app-react port) — extend improvements to the public React app

Phases 1-3 are independently deployable. Phase 4 is verification-only. Phase 5 is a separate PR.
