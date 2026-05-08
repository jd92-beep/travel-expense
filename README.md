# 🗾 Travel Expense Tracker

> A mobile-first PWA for tracking travel expenses in real time — built for Tony's 2026 Nagoya trip.

**Live app:** https://jd92-beep.github.io/travel-expense/

---

## What it does

- 📸 **Scan receipts** — AI reads Japanese receipts (kanji, tax rates, itemisation) and pre-fills the form
- 📧 **Email import** — Forward booking confirmations to a Gmail address; Apps Script parses with AI and pushes to Notion every 2 hours
- 🗺️ **Itinerary timeline** — 6-day trip hardcoded with scenery spots; hotel/flight receipts overlay automatically
- ☁️ **Notion sync** — Every confirmed expense lives in a Notion database as the source of truth
- 💱 **Currency calculator** — Live Visa exchange rate for JPY ↔ HKD (+ 15 other currencies)
- 🌤️ **Weather tab** — JMA official forecast via Open-Meteo, auto-matched to that day's itinerary location

---

## Tech stack

| Layer | Choice |
|---|---|
| Frontend | Single `index.html` — Tailwind CDN + Chart.js CDN + Vanilla JS |
| State | `localStorage` (key: `boss-japan-tracker`) |
| Secrets | AES-256-GCM encrypted vault, unlocked with password at startup |
| Receipt OCR | Kimi K2.6 → MiniMax VLM → GLM-4.6V → Gemini (vision fallback chain) |
| Email parsing | Kimi K2.6 → GLM-5.1 → GLM-5 → MiniMax M2.7 → OpenRouter → Gemini × 5 keys → GLM-4-Flash |
| Backend | Google Apps Script (2-hour cron) — no server required |
| Database | Notion API (via CORS proxy) |
| Weather | Open-Meteo `jma_seamless` model — official JMA data, free, no key |
| Deploy | GitHub Pages (auto from `main`) |

---

## File structure

```
travel-expense/
├── index.html          # Entire frontend (~10,000 lines)
├── app-react/          # Fresh React renovation, deployed under /react/
├── email-to-notion.gs  # Google Apps Script backend (~1,200 lines)
├── HANDOVER.md         # Session context for Claude (read this first)
├── docs/               # Per-tab technical docs
└── README.md           # This file
```

---

## How the email pipeline works

```
Forward email → Gmail label "travel-expense"
  → Apps Script (2-hour cron) parses with AI
  → Writes "⏳ 待確認" entry to Notion (dedup by SourceID)
  → App pulls from Notion when you open History tab
  → Tap ✅ to confirm → strips ⏳, syncs back to Notion
```

Forward address: `ftjdfr+expense@gmail.com`

---

## Tabs

| Tab | What's inside |
|---|---|
| 主頁 | Daily spend, budget bar, 6-day itinerary timeline |
| 掃描 | Camera / gallery / email sync / currency calculator / voice / manual |
| 行程 | Full itinerary with weather, spots, and receipt overlays |
| 紀錄 | All expenses grouped by date, with search and category filter |
| 統計 | Doughnut + bar charts, TOP 10 stores |
| 天氣 | 5-slot daily forecast (9/12/15/18/21h) from JMA |
| 設定 | Budget, exchange rate, AI models, Notion credentials, data export |

---

## Itinerary (2026-04-20 → 04-25, Nagoya / Central Alps)

| Day | Date | Region | Highlight |
|---|---|---|---|
| 1 | 04-20 | 名古屋 | ✈️ UO690 HKG 10:50→NGO 15:50 + 蓬萊軒鰻魚飯 |
| 2 | 04-21 | 飛驒高山 / 白川鄉 | KKday 三日團 Day 1 |
| 3 | 04-22 | 立山黑部 → 金澤 | 雪之大谷 ❄️ |
| 4 | 04-23 | 上高地 / 金澤 | 兼六園 + 鳥開總本家 |
| 5 | 04-24 | 名古屋 | 生日慶祝 🎂 |
| 6 | 04-25 | 常滑 → 機場 | ✈️ UO691 NGO 16:45→HKG 20:00 |

---

## AI providers

### Receipt scan (vision)
1. Kimi / `kimi-for-coding` through the server-side Credential Broker
2. Google Gemma backup through the same broker
3. Local heuristic parser when the broker or provider is unavailable

### Email parsing (text)
1. Kimi / `kimi-for-coding` through the server-side Credential Broker
2. Google Gemma backup through the same broker
3. Local heuristic parser when AI JSON cannot be produced

## Security

- Repo is public; never commit real API keys, OAuth tokens, Notion tokens, or generated deploy artifacts with injected secrets.
- React `/react/` never receives Notion, Kimi, or Google provider credentials. It uses a short-lived Credential Broker session after app unlock.
- Expired provider credentials are rotated from Settings through the broker; the typed value is sent once over HTTPS and is not written to localStorage, IndexedDB, backup JSON, Notion, docs, or Pages output.
- `secrets.local.js.example` contains placeholders only; copy it to `secrets.local.js` for local testing.

---

## Notion database

**DB ID:** `3438d94d5f7c81878221fcda6d65d39d`

| Property | Type |
|---|---|
| 🏪 店名 | Title |
| 💴 金額 ¥ | Number (JPY) |
| 📅 日期 | Date |
| 🗂 類別 | Select |
| 💳 支付 | Select |
| 🧾 品項 | Rich Text |
| 📝 備註 | Rich Text |
| 🔑 SourceID | Rich Text (dedup key) |
| 💵 HKD | Number |
| 📷 收據相片 | Files |

---

## Local development

No build step. Open `index.html` directly in a browser.

```bash
# Or serve locally to avoid file:// issues with camera API
python3 -m http.server 8899
# → http://localhost:8899/index.html
```

**Debug tips:**
```js
// See full state in DevTools console
JSON.parse(localStorage.getItem('boss-japan-tracker'))

// Reset everything
localStorage.removeItem('boss-japan-tracker'); location.reload()
```

## Fresh React renovation

The stable legacy app stays at the GitHub Pages root. The fresh React app is a new implementation under `app-react/` and deploys to `/react/`. It does not reuse the older `app/` or `app3/` implementations.

```bash
cd app-react
npm install
npm run dev
npm run build
```

React Fresh shares the same `boss-japan-tracker` storage key and now has standalone React entry points for Dashboard, manual receipt add/edit/delete, receipt time/address/booking-ref/photo fields, receipt-to-itinerary save, separate camera/gallery OCR, voice/text parsing, email paste import with batch confirmation, email screenshot parsing, Scan-tab Notion pull for pending email records, Gmail address copy, History search/filter + pending confirm, editable Timeline spots with Maps links and per-day receipt modals, live Weather via Open-Meteo/JMA, Stats settlement/top-10/trend views, expandable Settings cards, broker-backed credential rotation, Notion sync/schema migration, Shortcut helper, multi-currency conversion, CSV export, full JSON backup/restore, offline notices, and update prompts. The React AI router uses `kimi/kimi-code` / `kimi-for-coding` through the Credential Broker first, then Google Gemma backup through the broker, then local fallback parsing. The legacy app remains available at the root as the stable baseline, but React controls no longer route feature buttons back to it.

## Credential Broker

The broker lives in `workers/credential-broker/` and is deployed separately from GitHub Pages. Its source is safe to commit because provider credentials are not stored in code or config.

Required secret setup happens in Cloudflare only:

```bash
cd workers/credential-broker
node --check src/index.js
npm run self-test
wrangler secret put APP_UNLOCK_HASH
wrangler secret put APP_SESSION_SECRET
wrangler secret put ADMIN_ROTATION_HASH
wrangler secret put CREDENTIALS_KEK
wrangler kv namespace create CREDENTIALS_VAULT
npm run seed:vault # optional admin-only encrypted provider credential seed
```

The React app stores only `credentialBrokerUrl`, `credentialSession`, and `credentialSessionExpiresAt`; provider keys are kept encrypted in Worker KV.

---

## Deploy Apps Script

```bash
mkdir -p /tmp/travel-expense-script && cd /tmp/travel-expense-script
cat > .clasp.json <<'EOF'
{"scriptId":"1W-bMNbhjSssQl4ju4Wr8YdG5HvSNKbBLLaVdFPi0XoEmSLYiKbsO5DTt","rootDir":""}
EOF
cp /path/to/email-to-notion.gs Code.gs
# inject credentials via sed (see HANDOVER.md)
clasp --user ftjdfr push --force
```

---

## Credits

- Inspired by [@chaseyhan](https://www.threads.net/@chaseyhan) on Threads
- Built with [Claude Code](https://claude.ai/claude-code) (Anthropic)
- Arsenal 🔴 orange UI theme — intentional
