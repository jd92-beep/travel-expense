# Dashboard Tab

DOM section: `#tab-dashboard` (line 397). Render fn: `renderDashboard()` (line 2630).

## 1. Introduction

The default landing tab, optimized for the in-trip moment when Boss (Tony) opens the app between meals. It answers four questions at a glance: *how much have I spent today, how much total, what's my daily average, and where am I supposed to be right now?* Companion is "欣欣" — when split-bill is configured, per-person cards appear under the headline numbers.

It is also the routing surface for off-trip phases: a 🧳 prep card surfaces flight/hotel/local-tour spending booked before departure, and a 🏠 post card surfaces post-trip spillover. A pending email-import banner re-routes to the History tab when there are entries waiting to be confirmed.

## 2. How to Use

- **Glance at today's spend** — the big red card up top shows today's JPY total, HKD equivalent, and receipt count. The pill above (`#todayLocation`) shows the current city based on JST date matched against `ITINERARY`.
- **Tap the pending banner** (yellow, only visible if email-import has stalled receipts) — jumps to History to review/confirm.
- **Tap "+ 手動記一筆" inside the prep card** — opens the manual-entry modal pre-filled to the prep phase.
- **Tap an itinerary day** — its spots are tappable. Each spot opens `showSpotPopup` for name/address/Maps/edit. The 💰 row at the bottom of a day card opens `openDayReceiptsModal(date)` for the uncovered receipts of that day.
- **Today's list at the bottom** — most recent receipt first; tap to edit.

No special gestures. The tab auto-fits via `autoFitTab` (line 8856).

## 3. UI Anatomy

| Element | ID | Purpose |
|---|---|---|
| Today's spend card (red gradient) | — | Hero card for today (line 399) |
| Today JPY value | `#todaySpend` | Numeric (line 408) |
| HKD equivalent | `#todaySpendHKD` | (line 411) |
| Today's count badge | `#todayCount` | (line 412) |
| Today's location chip | `#todayLocation` | Region from `ITINERARY` (line 403) |
| "Includes/excludes 機票/住宿" footnote | `#todaySpendNote` | Switches with stats toggle (line 414) |
| Daily-budget alert | `#dailyAlert` | Hidden unless `todayTotal > dailyBudget` (line 418) |
| Per-day cap | `#dailyBudgetAmt` | (line 423) |
| Today's overshoot | `#dailyOverAmt` | (line 423) |
| Total card (navy) | — | Sum across all receipts (line 430) |
| Total JPY | `#totalSpend` | (line 432) |
| Total HKD | `#totalSpendHKD` | (line 433) |
| Total receipt count | `#totalCount` | (line 434) |
| Total footnote | `#totalSpendNote` | (line 435) |
| Daily-average card (gold) | — | Avg per active spend day (line 437) |
| Avg JPY | `#avgSpend` | (line 439) |
| Avg HKD | `#avgSpendHKD` | (line 440) |
| Days elapsed | `#daysElapsed` | Count of distinct dates with receipts (line 441) |
| Person breakdown wrap | `#personBreakdownWrap` | Hidden when solo; populated by `renderPersonBreakdown` |
| Person grid | `#personBreakdown` | (line 449) |
| Pending-email banner | `#pendingBanner` | Only visible when `pendingReceipts.length > 0` (line 453); `onclick` switches to History |
| Pending count | `#pendingCount` | (line 457) |
| Prep summary card | `#prepSummary` | Hidden unless prep receipts exist (line 464) |
| Prep manual-add | `#prepQuickAddBtn` | Opens manual-entry pre-set to prep (line 467) |
| Prep totals | `#prepSpend` / `#prepSpendHKD` / `#prepCount` | (line 470–473) |
| Itinerary header | `#itineraryHeader` | "6日行程" — auto-rewritten to actual length (line 478) |
| Itinerary list | `#itineraryList` | Day cards built inline by `renderDashboard` (line 479) |
| Today list | `#todayList` | Reverse-chrono receipt cards for `today` (line 485) |

Itinerary day cards use `getEffectiveSpots(it)` for the planned schedule; each `<div>` is wired with `onclick="showSpotPopup({...})"`. Hotels (with `receiptId` or `address`) and override entries get a stronger highlight. Uncovered receipts collapse into a single 💰 chip with `onclick="openDayReceiptsModal(date)"`.

## 4. Functions & Logic

| Function | Line | Role |
|---|---|---|
| `renderDashboard()` | 2630 | Main render; called on tab switch (8801), boot, post-mutation, and after `notionPullAll` |
| `todayForReceipts()` | search source | Returns JST-aligned `YYYY-MM-DD` so today rolls over with Japan, not HKT |
| `getCurrentDay()` | search source | Resolves current `ITINERARY` row (with `_synthetic = 'prep'\|'post'` for off-trip phases) |
| `getReceiptPhase(r)` | 2046 | Buckets receipt into `prep` / `trip` / `post` based on `tripDateRange` and `PRE_PAID_CATEGORIES` |
| `isPendingReceipt(r)` | 2864 | Treats receipts with store starting with `⏳ ` as awaiting confirm |
| `renderPersonBreakdown()` | search source | Per-person card grid (visible only when `state.persons.length ≥ 2`) |
| `getEffectiveSpots(it)` | search source | Itinerary spots with user overrides applied |
| `getDayReceiptsNotInSpots(date)` | search source | Receipts not represented as spots |
| `_getItineraryOverride(date, idx)` | 2873 | User-edited spot fields |
| `_staggerCards(container)` | search source | CSS staggered fade-in animation |
| `showSpotPopup(...)` | search source | Spot popup (Maps + Edit) |
| `openDayReceiptsModal(date)` | search source | Day-receipts modal |
| `_reInitAnimations()` | search source | Re-arms IntersectionObservers after innerHTML rewrite |

Adaptive daily-budget math (lines 2656–2679) deserves note: prep spending is subtracted from the budget *before* dividing by trip length, so flight/hotel pre-pay does not squeeze the per-day cap during the trip. After the start date, the cap is `(remainingTripBudget / daysLeft)`; before the trip it's `((budget − prep) / tripDays)`.

## 5. Button → Function Map

| Trigger | Selector | Handler | Effect |
|---|---|---|---|
| Pending banner | `#pendingBanner` | inline `onclick="switchTab('history')"` | Tab switch |
| Prep manual-add | `#prepQuickAddBtn` | inline init handler in `init()` | Opens manual-entry modal in prep phase |
| Itinerary spot tap | `<div ...onclick="showSpotPopup(...)">` | `showSpotPopup` | Spot detail popup |
| Day receipts chip | `<div onclick="openDayReceiptsModal(date)">` | `openDayReceiptsModal` | Modal listing all receipts for that date |
| Today list receipt card | `receiptCard(r)` inline | `openConfirmModal` (via card) | Edit receipt |

The dashboard has no submit form of its own — every mutation comes from another tab pushing `renderDashboard` after `saveState`.

## 6. LLM Models Used

**None — pure DOM rendering.** The tab consumes `state.receipts` and the `ITINERARY` constant. No HTTP calls, no AI inference. The `renderWeather` etc. routes are sibling tabs, not invoked here.

## 7. State Fields Touched

Read:

- `state.receipts[]` (filtered by `today`, `category`, `splitMode`)
- `state.budget`, `state.rate`
- `state.tripDateRange.start` / `.end`
- `state.statsIncludeTransportLodging` — controls flight/lodging inclusion
- `state.itineraryOverrides{}`
- `state.customItinerary` (via `getItinerary()`)
- `state.persons[]` (for the breakdown grid)

Written: nothing directly — but tap handlers (manual-add, edit, etc.) write through their own modal flow.

## 8. Sync Behavior

- No direct Notion push from this tab. Mutations come from the modals it opens (manual-entry, confirm-modal); those push via `notionPushReceipt(r)` if `state.autoSync` is on.
- On tab-switch the History tab pulls fresh data from Notion (line 8806–8825) — so coming back to Dashboard after visiting History gets fresh numbers automatically.
- Email-import receipts arrive as `⏳ `-prefixed items via `notionPullAll`; the pending banner reflects them.

## 9. Configuration & Customization

User-tunable in Settings (affects this tab):

- 🗾 Trip name + date range → `state.tripDateRange` (controls phase classification + adaptive budget)
- Trip itinerary import/export → swaps `ITINERARY` for `state.customItinerary`
- 旅程預算 → `state.budget` (HKD ⇄ JPY auto-sync)
- Live exchange rate → `state.rate` (HKD-equivalent text on the cards)
- 📊 首頁統計顯示 toggle → `state.statsIncludeTransportLodging` (flips include/exclude defaults for total vs daily numbers)

Internal constants:

- `ITINERARY` — line 1630
- `CATEGORIES` — line 1567
- `PRE_PAID_CATEGORIES` — line 1580
- `PERSON_EMOJIS` — line 1587

## 10. Edge Cases & Known Limitations

- **No receipts yet** — today list shows the encouragement string `今日仲未有消費紀錄 ✨`; itinerary still renders with all zeros.
- **`state.rate` invalid / zero** — guarded by `Math.max(0.1, Number(state.rate) || 20.36)` everywhere HKD is divided.
- **Off-trip date** — `getCurrentDay()` returns synthetic `prep` or `post` rows; daily-budget formula falls back to a flat per-day average.
- **Empty itinerary** — `getItinerary().length` is floored to `1` for division; the day list collapses but the today/total cards still work.
- **Pending banner stuck** — if Apps Script imports an `⏳ `-prefixed entry but Notion pull never runs (no token configured), the banner never appears. Pull happens on History tab open; the user discovers them there.
- **Race with Notion pull** — `notionPullAll` rewrites `state.receipts`; Dashboard renders idempotently from state, so no flash of stale numbers, but a render in flight can be overwritten.

## 11. Technical Notes

- **JST date for "today"** — `todayForReceipts()` runs receipts in destination timezone, not HKT. Without this, JST midnight (HKT 23:00) would prematurely roll over the user's day-counter.
- **Single toggle, two flips** — `state.statsIncludeTransportLodging` flips two *separate* defaults: total includes flight/lodging by default; daily/today excludes them by default. Toggling flips both. The `#todaySpendNote` / `#totalSpendNote` / `#avgSpendNote` strings track which side is currently "default" vs "flipped" (lines 2640–2737).
- **Adaptive daily budget** — trip-day prep receipts are subtracted from `state.budget` before dividing, so flight/hotel pre-pay don't compress the on-the-ground daily quota.
- **Auto-fit via CSS `zoom`** — `autoFitTab('dashboard')` (line 8856) measures section height after a double-RAF and sets `section.style.zoom` ∈ [0.80, 1.00]. Purely a scale hint — no layout changes.
- **Itinerary card emits inline JS** — `onclick="showSpotPopup({name:'...',address:'...',...})"` is built by string-escaping every field through `replace(/'/g,"\\'")`. Read `escapeHtml` (line 3695) for the user-facing display path.

## 12. Detailed Function Responsibilities

| Function / helper | What it calculates | Inputs | Outputs / side effects |
|---|---|---|---|
| `renderDashboard()` | All headline spend numbers, budget progress, prep card, itinerary day cards, today receipt list | `state.receipts`, `state.budget`, `state.rate`, `getItinerary()` | Writes DOM for the whole tab; calls `renderPersonBreakdown`; wires inline spot/day receipt actions |
| `todayForReceipts()` | Destination-aligned receipt day | `state.tripDateRange`, current clock | Returns `YYYY-MM-DD`; avoids HKT/JST midnight mismatch |
| `getCurrentDay()` | Current trip day or synthetic prep/post row | Current date, `state.tripDateRange`, itinerary | Feeds `#todayLocation`, day counter, dashboard phase copy |
| `getReceiptPhase(r)` | Prep/trip/post bucket | Receipt `date`, `createdAt`, categories, trip dates | Controls prep summary and budget math |
| `renderPersonBreakdown()` | Per-person paid/owed tiles | `state.persons`, `state.receipts`, split fields | Populates `#personBreakdown`; hides wrapper in solo mode |
| `getEffectiveSpots(day)` | Dashboard itinerary spots with receipt overlays | Static/custom itinerary, lodging/transport receipts, overrides | Returns spot objects used by cards and `showSpotPopup` |
| `getDayReceiptsNotInSpots(date)` | Receipts not represented by itinerary overlay | Receipts for date, effective spot receipt IDs | Feeds the amber `N 筆消費` day chip |
| `openDayReceiptsModal(date)` | Full list for a day's uncovered receipts | Date string | Opens modal; each row can jump to History/edit |
| `showSpotPopup(opts)` | Generic spot/hotel/transport detail popup | Spot name, address, type, receipt id, date/index | Fills `#hotelPopup`, prepares Maps/edit buttons |
| `jumpToReceipt(id)` | Navigate from dashboard modal to editable record | Receipt id | Closes modal, switches to History, highlights/edit target |

Dashboard is intentionally read-heavy. Direct writes only happen through shared modals opened from this tab: manual add, receipt edit, spot edit, and day receipt jumps.
