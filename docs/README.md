# travel-expense — Per-Tab Technical Documentation

This folder contains a technical reference for each of the 7 tabs in `index.html`. The app is a single-file HTML PWA (~10,200 lines, vanilla JS + Tailwind CDN + Chart.js) — there is no build step, no bundler, no framework, and no separate JS modules. Everything lives in one file.

> Note: this project is **not** part of the WAT (Workflows / Agents / Tools) framework that appears in the global `~/CLAUDE.md`. WAT applies to Oscar-agent-style multi-tool agents. This is a vanilla browser PWA — keep that mental model.

## Per-tab files

| Tab | File | DOM section | Line in `index.html` |
|---|---|---|---|
| Dashboard | [dashboard.md](./dashboard.md) | `#tab-dashboard` | 397 |
| Scan | [scan.md](./scan.md) | `#tab-scan` | 492 |
| History | [history.md](./history.md) | `#tab-history` | 573 |
| Weather | [weather.md](./weather.md) | `#tab-weather` | 593 |
| Stats | [stats.md](./stats.md) | `#tab-stats` | 607 |
| Timeline | [timeline.md](./timeline.md) | `#tab-timeline` | 660 |
| Settings | [settings.md](./settings.md) | `#tab-settings` | 675 |

The bottom navigation tab bar is at lines 1098–1130.

## Shared concepts referenced from tab docs

### State model
Single global `state` object (line 1747) persisted to `localStorage` under key `boss-japan-tracker`. Hydrated by `loadState()` (line 1796) at boot, written by `saveState()` (line 1896) on every mutation. Notable fields:

- `state.receipts[]` — all receipts (schema documented in CLAUDE.md)
- `state.budget` (JPY), `state.rate` (HKD per 100 JPY), `state.tripCurrency`
- `state.persons[]`, `state.shareRatios{}` — split-bill setup
- `state.scanModel` / `state.voiceModel` / `state.emailModel` — selected LLM per use-case
- `state.apiKey` (Gemini), `state.zaiKey` (GLM/智譜), `state.minimaxKey`, `state.openrouterKey`
- `state.notionToken`, `state.notionDb`, `state.proxy` (Cloudflare Worker URL), `state.autoSync`
- `state.top10IncludeBigItems`, `state.statsIncludeTransportLodging` — UI toggles (Stats tab)
- `state.customItinerary` — overrides the built-in `ITINERARY` constant when non-null
- `state.lastTab` — restored on next load

### Constants worth knowing
- `CATEGORIES` — line 1567 (9 entries: flight / transport / food / shopping / lodging / ticket / localtour / medicine / other)
- `PRE_PAID_CATEGORIES` — line 1580 (set used by `getReceiptPhase` to classify "prep" vs in-trip spending)
- `PAYMENTS` — line 1581 (cash / credit / paypay / suica)
- `PERSON_EMOJIS` — line 1587
- `SCAN_MODELS` — line 1588 (vision-capable LLMs for receipts)
- `VOICE_MODELS` — line 1598 (text models for Cantonese voice parsing)
- `EMAIL_MODELS` — line 1616 (text models for email-import parsing)
- `ITINERARY` — line 1630 (built-in 6-day Nagoya itinerary)
- `OPENROUTER_URL`, `OPENROUTER_MODEL` — line 1716 (`openrouter/elephant-alpha`; active fallback in voice + email parse chains; requires `state.openrouterKey`)
- `APPS_SCRIPT_URL` — line 1712 (Gmail-side email parser)

### Global helpers (used by every tab)

| Helper | Line | Purpose |
|---|---|---|
| `$(id)` | 1960 | `document.getElementById` shortcut |
| `fmt(n)` | 1961 | thousands-separator number format |
| `escapeHtml(s)` | 3695 | XSS-safe text → HTML |
| `toast(msg, type)` | 2077 | bottom-of-screen status toast |
| `loadState()` | 1796 | hydrate `state` from localStorage |
| `saveState()` | 1896 | persist `state` to localStorage |
| `switchTab(name, opts)` | 8730 | tab nav controller (animations + per-tab render dispatch + autosync trigger) |
| `autoFitTab(name)` | ~8845 | CSS `zoom` auto-shrink so tab content fits viewport |
| `notionFetch(path, opts)` | 7085 | proxied Notion API call |
| `notionPushReceipt(r)` | 7139 | upsert one receipt to Notion |
| `notionPushAll()` | 7309 | bulk push |
| `notionPullAll(silent)` | 7531 | bulk pull |
| `notionPushSettingsIfReady()` | 7492 | debounced settings sync |
| `unlockVault(password)` | 1736 | AES-256-GCM decrypt of bundled API keys |

### LLM call routers
- `callGemini(base64, mime)` — hub for receipt scanning; routes to MiniMax / GLM-4.6V / Gemini family with automatic fallback chain (referenced from `scanReceipt` line 4384).
- `callMiniMax*`, `callGLM*` — per-provider helpers near line 5500–6200.
- Gemini key rotation: `getGeminiKeys(userKey)` line 1707 — tries vault key, then up to 5 hardcoded backup keys.

### Sync architecture
- Notion REST API is CORS-blocked, so all calls go through `state.proxy` (default: `notion-proxy.ftjdfr.workers.dev`, a Cloudflare Worker). The legacy fallback was `corsproxy.io`.
- Notion DB schema is enforced by `notionEnsureSchema()` (line 6876); `buildNotionProps(r, schemaMap)` (line 6938) maps a receipt onto Notion property payloads.
- `state.autoSync` toggles per-mutation push.
- Email-import path is async via Gmail label + Apps Script (`email-to-notion.gs`) → Notion → app pulls on Settings's "📬 即時同步" or History tab open.

### Tab order
Defined by `TAB_ORDER` (search for it in source — used by `switchTab` to compute slide direction). Bottom nav order is: dashboard, scan, timeline, history, weather, stats, settings.

### Build version
The visible string `APP BUILD v47` near line 1093 is the cache-bust marker. Bump it whenever you ship a deploy that needs to override a stale PWA install.
