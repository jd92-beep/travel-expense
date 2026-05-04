# Stats Tab

DOM section: `#tab-stats` (line 607). Render fn: `renderStats()` (line 4093).

## 1. Introduction

The analytics surface. Five visual blocks: per-person spend bar + settlement card, category doughnut, payment doughnut, daily-trend bar, TOP 10 list. Built for end-of-trip reckoning ("who owes whom what") and mid-trip pattern checks ("am I overspending on shopping again"). Companion 欣欣 is first-class: every chart respects `state.persons[]` and `state.shareRatios{}`.

The settlement card is the killer feature — a greedy minimal-transfer ledger combining shared splits and 🎁 cross-private debts (when one person paid for another's personal item).

## 2. How to Use

- **Read the charts** — all auto-build from `state.receipts`. No filters.
- **Toggle "含機票/酒店"** on TOP 10 (right of the section header) — flips `state.top10IncludeBigItems`. Off (default = on for big items per state init line 1771) hides flight + hotel so day-to-day shopping/food rises to the surface. Wait — the *initial* state has it on; toggling OFF excludes them.
- **Read settlement card** — under the person bar chart. Lists "X → Y ¥N" transfers + a per-person ledger.
- **Tap a doughnut slice / bar** — Chart.js native tooltip shows ¥, HK$, percent.

## 3. UI Anatomy

| Element | ID | Purpose |
|---|---|---|
| Heading | — | "統計分析 📊" (line 608) |
| Person stats wrap | `#personStatsWrap` | Hidden when solo (line 611) |
| Person bar canvas | `#personChart` | Horizontal bar, paid-by per person (line 613) |
| Settlement card | `#settlementCard` | Built by `renderSettlementHtml` (line 614) |
| Category card | — | (line 618) |
| Category canvas | `#catChart` | Doughnut (line 621) |
| Category center label | `#catChartCenter` | Total in the doughnut hole (line 622) |
| Category legend | `#catLegend` | Sorted by amount desc (line 624) |
| Payment card | — | (line 628) |
| Payment canvas | `#payChart` | Doughnut (line 631) |
| Payment center label | `#payChartCenter` | (line 632) |
| Payment legend | `#payLegend` | (line 634) |
| Daily-trend card | — | (line 638) |
| Trend canvas | `#trendChart` | Bar — labels include `Day N`, `🧳 prep`, `🏠 post` (line 640) |
| TOP 10 card | — | (line 644) |
| TOP 10 toggle wrap | `<label>` | Wraps both checkbox + visual track (line 647) |
| TOP 10 toggle input | `#top10IncludeBigItems` | `sr-only` checkbox (line 649) |
| TOP 10 visual track | `#top10ToggleTrack` | (line 650) |
| TOP 10 thumb | `#top10ToggleThumb` | (line 651) |
| TOP 10 list | `#topList` | Top-10 receipt rows (line 655) |

## 4. Functions & Logic

| Function | Line | Role |
|---|---|---|
| `renderStats()` | 4093 | Main render; builds 5 sections + 4 Chart.js charts |
| `computeSettlements(persons, receipts, shareRatios)` | 3849 | N-person settlement ledger; returns `{transfers, balances, sharedTotal, sharedByPayer, privateByOwner, crossPrivate}` |
| `renderSettlementHtml(persons, snap, ...)` | 3943 | DOM template for the settlement card; back-compat with positional legacy args |
| `getPersons()` | search source | Defaults to a single `[Tony]` if empty |
| `getTripPhase(date)` | search source | `'prep' \| 'trip' \| 'post'` for trend-bar coloring |
| Chart.js destroy-and-recreate | 4126/4166/4229/4309 | Each `if (charts.X) charts.X.destroy()` before `new Chart(...)` — see Technical Notes |
| TOP 10 toggle handler | 8965 | `change` listener — single, not a track-click + label combo (see fix commit `a4c5a6f`) |
| TOP 10 toggle UI sync | 4344–4351 | Mirrors `state.top10IncludeBigItems` to track + thumb |

Settlement math:
- Receipts with `splitMode === 'private'` and a different `beneficiaryId` from payer → cross-private direct debt entry; the payer's "shouldPay" doesn't change but the beneficiary owes the full amount.
- Receipts with `splitMode === 'shared'` (or legacy without `splitMode`) → bucketed into `sharedTotal` and `sharedByPayer[i]`; settled via `state.shareRatios[id]`.
- Greedy match (line 3915): biggest debtor pays biggest creditor until all balances are within ¥0.5.

## 5. Button → Function Map

| Trigger | Selector | Handler | Effect |
|---|---|---|---|
| TOP 10 toggle | `#top10IncludeBigItems` (wrapped in `<label>`) | `change` listener (line 8965) | Updates `state.top10IncludeBigItems`, saves, pushes settings, re-renders |
| Chart slice/bar tap | Chart.js native | Tooltip callbacks (lines 4192, 4255, 4324) | Shows ¥ + HK$ + percent |

No other buttons. The card is read-only.

## 6. LLM Models Used

**None — pure Chart.js + DOM rendering.** All data is computed client-side from `state.receipts`.

## 7. State Fields Touched

Read:

- `state.receipts[]` (filtered for `splitMode`, `category`)
- `state.persons[]`, `state.shareRatios{}`
- `state.rate` (HKD-equivalent labels)
- `state.budget` (per-day budget threshold for trend coloring at `state.budget / iti.length`)
- `state.top10IncludeBigItems` (toggle)
- `state.customItinerary` (via `getItinerary()`)

Written:

- `state.top10IncludeBigItems` (toggle handler)
- Chart.js instances stored in module-scope `charts = {}` (line 3827) — released before each render via `chart.destroy()`

## 8. Sync Behavior

- TOP 10 toggle handler calls `notionPushSettingsIfReady()` after `saveState()` (line 8968) — debounced settings push (line 7492) writes the toggle to the Notion meta-row. So tapping TOP 10 toggle on phone → laptop sees it on next pull.
- No per-receipt sync from this tab (read-only data path).

## 9. Configuration & Customization

User-tunable affecting this tab:

- 旅伴 list (Settings § B) → `state.persons[]` — controls bar chart labels and settlement
- 分帳比例 (Settings § B) → `state.shareRatios{}` — controls settlement math
- TOP 10 toggle → `state.top10IncludeBigItems`
- 旅程預算 (Settings § A) → trend-bar red-overrun threshold

Internal constants:

- `CATEGORIES` — line 1567 (doughnut colors + icons)
- `PAYMENTS` — line 1581
- `ITINERARY` — line 1630 (trend bar labels for Day N rows)

## 10. Edge Cases & Known Limitations

- **No receipts** — every chart shows 未有紀錄 placeholders; doughnut center labels show "未有紀錄"; charts are not constructed (avoids Chart.js NaN warnings).
- **Solo (1 person)** — `#personStatsWrap` is hidden via `getPersons()`-conditional rendering elsewhere; settlement is N/A.
- **All-private receipts** — `sharedTotal = 0`; settlement falls through to cross-private only.
- **Ratio sums to 0** — `sumRatio === 0` → everyone's `shouldPayShared = 0` (graceful no-op).
- **Tab not yet rendered** — `renderStats()` only runs on tab switch (line 8803). State changes elsewhere don't update charts until next visit. The Settings settlement panel (`renderSettlePanel`) is the live counterpart.
- **Chart.js memory** — old chart instances must be `.destroy()`-ed before recreation, otherwise canvas listeners leak. See lines 4126/4166/4229/4309.
- **Trend bar overrun threshold** — uses `state.budget / iti.length`, ignoring prep-pay subtraction. So a flat per-day cap, not the adaptive one Dashboard uses. (Acceptable: Stats is retrospective, not budget-management.)

## 11. Technical Notes

- **TOP 10 toggle double-fire fix** (commit `a4c5a6f`, Apr 25 2026) — earlier code had both a `change` handler on the `<input>` AND a `click` handler on `#top10ToggleTrack`. Because the `<input>` is wrapped in a `<label>`, the browser's native label-bubble already toggles the checkbox, so the explicit track-click handler caused a *double* flip → net no change → toggle "looked broken." Fix: remove the redundant track-click listener, rely on native label semantics. See lines 8960–8970 for the comment block.
- **Chart.js destroy-recreate pattern** — every `renderStats()` call destroys old chart instances stored in `charts = {}` (line 3827) before constructing new ones. This is the correct way to update Chart.js with new data; mutating `chart.data` then `.update()` would also work but the destroy-recreate path is simpler and covers cases where dataset shape changes.
- **Greedy settlement** (line 3915–3933) — caps at 100 iterations as a safety; each iteration moves the biggest debtor's debt against the biggest creditor's surplus. Final transfer count is at most `n−1` for `n` people.
- **Cross-private semantics** (line 3873–3890) — `splitMode='private'` with a different `beneficiaryId` adds a `crossPrivate[]` entry. The beneficiary's `privateByOwner` increments (it's their item even though they didn't pay) and the ledger gains a direct debt edge.
- **Doughnut-center overlay** — `.doughnut-center` is a CSS-positioned absolute overlay, not a Chart.js plugin. Its content is set by `innerHTML` (lines 4203, 4265).
- **Trend-bar colors** — amber `#F59E0B` for prep, slate `#64748B` for post, navy `#2D5A8E` for normal trip, red `#E04040` when over per-day cap. Phase resolved by `getTripPhase(date)`.

## 12. Detailed Function Responsibilities

| Function / helper | What it owns | Inputs | Outputs / side effects |
|---|---|---|---|
| `renderStats()` | Full analytics render | Receipts, persons, ratios, rate, budget, toggles | Builds/destroys Chart.js charts, legends, settlement and TOP 10 list |
| `computeSettlements(persons, receipts, ratios)` | Split-bill truth source | Payers, beneficiaries, shared/private receipts | Returns balances, transfers, shared totals, cross-private edges |
| `renderSettlementHtml(...)` | Settlement UI | Settlement snapshot | Returns transfer list + per-person ledger HTML |
| `getPersons()` | Person fallback | `state.persons` | Ensures at least Tony exists for charts and settlement |
| `getTripPhase(date)` | Trend phase | Date and trip range | Colors trend rows as prep/trip/post |
| Chart destroy/recreate blocks | Canvas lifecycle | `charts` module object | Prevents duplicate listeners and stale datasets |
| TOP 10 toggle handler | Big-item visibility | `#top10IncludeBigItems` | Updates `state.top10IncludeBigItems`, saves, pushes settings meta row |
| Tooltip callbacks | Chart detail UX | Chart dataset values | Shows JPY/HKD/percent without mutating state |

### Settlement semantics

- `shared`: amount is split according to `state.shareRatios`.
- `private` with no different `beneficiaryId`: payer owns the item; it does not create a debt.
- `private` with another `beneficiaryId`: full amount is direct payer → beneficiary debt, independent of share ratio.
- Greedy matching reduces final transfers to a minimal practical set while tolerating rounding under ¥0.5.
