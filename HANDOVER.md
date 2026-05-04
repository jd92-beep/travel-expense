# 🗾 Travel Expense App — Session Handover

> **Purpose of this file:** Every Claude session (desktop app OR CLI) reads this first to resume work without re-reading the whole chat history. Updated at the end of each session.

**Last updated:** 2026-04-20 (HKT)
**Latest commits:** `e93b51d` Android Maps app handoff + last-tab restore ✅ · `1f0f122` ghost-click timestamp guard · `4c07b7b` sync-hide old tab + map open hardening

---

## 🎯 Project at a glance

| Thing | Value |
|---|---|
| Owner | Boss (Tony) — 香港入境處主任, futures trader, HK |
| Purpose | Track expenses during 2026-04-20 → 04-25 Nagoya trip (6-day, 5-night) |
| Live URL | https://jd92-beep.github.io/travel-expense/ (GitHub Pages, auto-deploys from `main`) |
| Repo | https://github.com/jd92-beep/travel-expense |
| Main repo path | `/Users/tommy/Documents/travel-expense` |
| Current worktree | `/Users/tommy/Documents/travel-expense/.claude/worktrees/vibrant-carson` (stale `claude/vibrant-carson` branch — ignore; all work goes directly to `main`) |
| Core files | `index.html` (~6000 lines · HTML+CSS+JS), `email-to-notion.gs` (Apps Script, ~1100 lines) |

## 🚀 Deploy workflow

All work goes **directly to `main`** via `git push origin main`. A Bash permission rule in `~/.claude/settings.json` allows this:
```json
"allow": ["Bash(git push origin main)"]
```
GitHub Pages rebuilds within 1–2 minutes.

**Apps Script deploy:** via clasp (`clasp --user ftjdfr push --force`) from `/tmp/travel-expense-script/`. That dir is **ephemeral** (wiped on restart) — recreate via the injection script in the "Clasp bootstrap" section below.

---

## 🧱 Architecture

### Client (index.html)
- Single HTML file, **no build step**, Tailwind CDN + Chart.js CDN
- State in `localStorage` (key: `boss-japan-tracker`)
- Encrypted vault (AES-256-GCM + PBKDF2) for Gemini/Notion/Zhipu/MiniMax credentials — unlocks with password at startup
- **Defaults:** scan=`minimax`, voice=`minimax`, email=`glm-5.1`
- **Tabs:** 主頁 (dashboard), 掃描 (scan), 行程 (timeline), 紀錄 (history), 統計 (stats), 設定 (settings)

### Apps Script (email-to-notion.gs)
- Runs every **2 hours** via time trigger (self-installing in `processExpenseEmails`)
- Reads Gmail labels: `travel-expense`, `travel-expense/retry`, `travel-expense/failed`
- Multi-provider AI fallback: **GLM-5.1 → GLM-5 → GLM-5-turbo → MiniMax-M2.7 → OpenRouter Elephant-Alpha → Gemini×5keys×5models → GLM-4-Flash**
- Writes to Notion DB (script ID `1W-bMNbhjSssQl4ju4Wr8YdG5HvSNKbBLLaVdFPi0XoEmSLYiKbsO5DTt`)
- Dedup by `SourceID = email_<threadId16>_<idx>` — **archive-aware** (archived page found → SKIP re-creation, prevents ghost entries)

### Notion DB
- **ID:** `3438d94d5f7c81878221fcda6d65d39d`
- **Properties (emoji variant preferred):** 🏪 店名 / 💴 金額 ¥ / 📅 日期 / 🗂 類別 / 💳 支付 / 📍 地區 / 🧾 品項 / 📝 備註 / 👥 旅伴 / 🔑 SourceID / 💵 HKD / 💸 稅金 ¥ / 🧮 小計 ¥ / **📷 收據相片** (Files, auto-created)
- Category Select: 交通 / 餐飲 / 購物 / 住宿 / 門票 / 藥品 / 其他 / **當地旅遊**

### Data flow
```
Forward email → Gmail label travel-expense
  → [2-hour] Apps Script parses with AI
  → Creates ⏳ pending entry in Notion (dedup by SourceID)
  → Client pulls from Notion when opening History tab
  → User taps ✅ to confirm (strips ⏳ prefix)
  → Auto-syncs back to Notion
```

---

## 🗂 Feature inventory (as of latest commit)

### Dashboard (主頁)
- Today's spend card (JPY + HKD)
- Daily budget alert (triggers when today > ¥17,000)
- Quick stats (total / daily avg)
- Person breakdown (if multi-traveler)
- Pending email-import banner (yellow, tappable)
- Pre-trip prep summary card
- **Itinerary timeline** — scenery spots as main characters:
  - Lodging + transport receipts overlay onto matching spots (visible)
  - Other receipts (food/shopping/ticket/localtour/etc.) collapse into a single **"💰 N 筆消費 · ¥X"** amber chip per day → tap opens `#dayReceiptsModal` listing them sorted by time
  - Tap spot → `#hotelPopup` (generic) shows read-only details + "📖 去紀錄 tab 編輯" button (for receipt-backed) or "✏️ 編輯行程項目" (pure ITINERARY spots)
  - Pencil icon ✏️ visible for editable spots; indigo tint when user has override set
- Budget bar visible only on 主頁 + 紀錄 tabs

### Scan (掃描) — 3-section redesign
- **Blue gradient header IS the camera button** (tap → opens camera)
- 🖼️ 從相簿選取 (slim secondary row)
- **📧 Email 記帳** section (list-card style, 3 items):
  - ⚡ 即時同步最新 Email 記帳 → `notionPullAll()` with spinner, auto-jumps to History if pending
  - 📋 貼上 Email 文字解析 (paste modal)
  - 📮 複製收帳 Gmail 地址 (`ftjdfr+expense@gmail.com`)
- **⌨️ 其他記帳方式**: 🎤 語音輸入 · ✍️ 手動輸入

### Record / Confirm modal
- Fields: 店名 / 總金額 / 日期 / 時間 (defaults to current HH:mm) / 預訂編號 / 地址 / 類別 / 支付 / 品項 / 備註
- ~~地區~~ removed (duplicated 地址)
- Address cascade auto-fill: AI → store name contains ITINERARY place → ITINERARY region for date
- Sticky modal header has `z-10` (fixed overlap bug)

### Itinerary editing
- Each static ITINERARY spot editable via ✏️ icon → `#spotEditModal`
- Overrides stored in `state.itineraryOverrides[<date>_<spotIdx>]` (original ITINERARY const never mutated)
- 還原 button resets a spot to ITINERARY default
- Auto-apply from Notion `🗓 行程更新：...` entries (strips ⏳ prefix before matching)

### History (紀錄)
- Category filter + 🔍 search (店名/備註/品項/地區)
- Grouped by date, descending
- `⏳ 待確認` yellow cards for pending email-imported entries
- Tap to edit (opens confirmModal with ⏳ stripped from store field)

### Settings — 6 sections
1. 🗾 **旅程設定** (trip name/dates, budget, **Visa official exchange rate** with 12-currency selector)
2. 👥 **旅伴 & 分帳** (% split with 1-decimal precision — 3 persons defaults to 33.3/33.3/33.3)
3. 🤖 **AI 模型** (scan/voice/email, all collapsed)
4. ☁️ **自動化 & 同步** (Email auto-import with 2-hour trigger explainer + Notion backup; "AI 助手" + "開 Apps Script" buttons **REMOVED**)
5. 📖 **使用說明** (manual email import guide, PWA/Shortcut setup)
6. 🛠 **資料管理** (save settings, CSV export, reset, lock device)

### Hotel / Spot popup (`#hotelPopup`)
- Generic — supports all spot types (lodging/food/transport/ticket/localtour/shopping/other)
- Per-type icon, background colour, label
- **Read-only** — edit goes to records tab (for receipt-backed) or spotEditModal (for pure itinerary)
- Android address tap now uses a direct `intent://...com.google.android.apps.maps...` handoff with browser fallback, so tapping from the PWA opens **Google Maps app** instead of a web page / dead tap
- iOS still uses `maps.apple.com`; desktop uses Google Maps web in new tab

### Exchange rate
- **Visa official** rates via `www.visa.co.uk/cmsapi/fx/rates` through CORS proxy
- Auto-fallback to `open.er-api.com`
- `state.tripCurrency` selector (JPY/USD/KRW/TWD/CNY/EUR/GBP/AUD/SGD/THB/MYR/VND)
- Cached 1h; `refreshRateBtn` forces refresh

### Prep / Trip / Post phases
- `getReceiptPhase(r)` — **ANY receipt with `createdAt < tripStart` = 'prep'** (regardless of category — user intent: "all records entered before trip start date are preparation")
- User can override via `r.phase` field

---

## 🔐 Credentials (where they live)

**Never in index.html or git.** All sourced from vault or `~/.clasprc.json`.

| Credential | Location |
|---|---|
| Zhipu (GLM-5/5.1/5-turbo/4-Flash/4.6V) | Encrypted vault → `VAULT_ZAI_KEY` |
| MiniMax OAuth (VLM + M2.7) | `DEFAULT_MINIMAX_KEY` (base64 in code) / `VAULT_MINIMAX_KEY` |
| OpenRouter | `DEFAULT_OPENROUTER_KEY` (base64) |
| Gemini × 5 keys | `DEFAULT_API_KEY` ... `DEFAULT_GEMINI_KEY5` (base64) |
| Notion token | `DEFAULT_NOTION_TOKEN` (base64) / `state.notionToken` |
| imgbb (receipt images) | `state.imgbbKey` (user-configurable; required for Notion image sync) |
| Gmail forward address | `ftjdfr+expense@gmail.com` |
| Google Apps Script (clasp) | `~/.clasprc.json`, user=`ftjdfr` |

---

## 🧭 Clasp bootstrap (when `/tmp` is wiped)

```bash
mkdir -p /tmp/travel-expense-script && cd /tmp/travel-expense-script

cat > .clasp.json <<'EOF'
{"scriptId":"1W-bMNbhjSssQl4ju4Wr8YdG5HvSNKbBLLaVdFPi0XoEmSLYiKbsO5DTt","rootDir":"","scriptExtensions":[".js",".gs"],"htmlExtensions":[".html"],"jsonExtensions":[".json"],"filePushOrder":[],"skipSubdirectories":false}
EOF

cat > appsscript.json <<'EOF'
{"timeZone":"Asia/Hong_Kong","dependencies":{},"exceptionLogging":"STACKDRIVER","runtimeVersion":"V8"}
EOF

cp /Users/tommy/Documents/travel-expense/email-to-notion.gs Code.gs
# Then inject credentials (see /HANDOVER.md in session log for sed commands)
# Then: clasp --user ftjdfr push --force
```

Credentials to inject (same `sed -i ''` pattern each time) are documented in session history — Zhipu / MiniMax / OpenRouter / 5× Gemini keys / Notion token + DB.

---

## ✅ Completed work (high level — by commit, newest first)

| Commit | Date | Summary |
|---|---|---|
| `e93b51d` | 2026-04-20 | Fix homepage location flow: Android popup map link now uses direct Google Maps app intent, active tab is persisted/restored after reload, build bumped to v27 |
| `4bfdf29` | 2026-04-19 | Budget quick-save pill + email LLM dual-array (bookings+itinerary_updates) + applyItineraryUpdates() · **clasp deployed** |
| `528aab9` | 2026-04-19 | Fix nav bar: grid-cols-6 → grid-cols-7 (7 tabs, 1 row) |
| `359e757` | 2026-04-19 | Scan block swap (gallery↔email) + Weather tab (JMA via Open-Meteo, 5 slots, LIVE badge) |
| `f1b32ae` | 2026-04-19 | Scan tab: restore coloured hero blocks (blue camera / green gallery / 3-up row) |
| `22b94e8` | 2026-04-19 | Receipt scan: smoke-test bug fixes (warnings banner, old-date heuristic, phone-number booking refs) |
| `87b0968` | 2026-04-19 | Deep receipt OCR rewrite (GEMINI_PROMPT 11 rules 7 examples, prepareForOCR 2016px, normalizeScanResult) |
| `cdf8aa7` | 2026-04-19 | Deep smoke test — 17 bugs fixed (category fallback, localtour AI prompts, ITINERARY refs, autoSync, CSS, sort) |
| `5e40f54` | 2026-04-19 | Settings: remove AI agent + Apps Script buttons; 5min→2hr trigger; rename email sync btn |
| `fcb4fb0` | 2026-04-19 | Scan tab 3-section redesign + ⚡ instant email sync button |
| `784eb26` | 2026-04-19 | docs: add HANDOVER.md for cross-session continuity |
| `5504464` | 2026-04-19 | Itinerary Day 2/3 hotels updated: 長野松代美居 + MYSTAYS 金澤 |
| `f848e1d` | 2026-04-19 | Fix: strip ⏳ prefix before 🗓 行程更新 detection |
| `198a8ee` | 2026-04-19 | Manual entry UX: default time, address cascade, remove 地區, Notion photo property auto-created |
| `4348d12` | 2026-04-19 | Itinerary restructure: flight+hotel overlay, receipts chip, read-only popup + records-tab jump |
| `dca228b` | 2026-04-19 | Email AI prompt comprehensive rewrite (7 examples, refund detection, self-check) |
| `bebfc81` | 2026-04-19 | Delete resurrection root fix, Visa rate, scan UX, Settings 6-section redesign |
| `bac798a` | 2026-04-18 | Unified spot popup, % share ratios, model defaults (MiniMax/GLM-5.1), email prompt |
| `6295cff` | 2026-04-18 | Voice MiniMax, visible pencil, smart prep phase, AI itinerary split, 當地旅遊 category |
| `db38653` | 2026-04-18 | Delete tracking by SourceID, editable itinerary, time input, GLM-5.1 added |
| `c4c9b88` | 2026-04-18 | Doughnut chart centre text overlap fix |
| `93d3221` | 2026-04-18 | AI Script Agent, budget on dashboard, history search |
| `bd545fc` | 2026-04-18 | Collapsible model sections, budget sticky toggle |
| `1d7142b` | 2026-04-18 | Hotel-in-itinerary with map popup |
| `338f4ef` | 2026-04-18 | Email-to-notion: forwarded split, HTML extraction, failed reprocess |

---

## 🐛 Known issues / follow-ups (none blocking)

- [ ] `state.region` field retained on legacy receipts for back-compat; new receipts store `''`. Could purge eventually.
- [ ] Gemini 3.1 Pro removed from all lists — if user wants it back, re-add to SCAN_MODELS / VOICE_MODELS / EMAIL_MODELS arrays.
- [ ] Itinerary overrides stored in localStorage only. If user clears browser cache, overrides lost. (Could sync to Notion itinerary DB but that's complex.)
- [ ] `lastTab` restore is local-only. If Boss opens the app from a brand-new device / fresh install, the default tab is still scan unless we intentionally change product default.
- [ ] Apps Script API Executable not deployed — can't run `clasp run processExpenseEmails` directly. User triggers via Scan tab "⚡ 即時同步" button or waits 2 hr.
- [ ] Receipt image sync to Notion requires `state.imgbbKey`. Without it, image stays local-only (callout message shown in Notion).

---

## 🔄 How to resume (next session)

**From any Claude instance (desktop / CLI / web):**

1. `cd /Users/tommy/Documents/travel-expense`
2. `cat HANDOVER.md` ← you are here
3. `git log --oneline -10` ← see recent commits
4. `git status` ← verify clean
5. Ask user what they want next, or continue with any items in **Known issues / follow-ups**

**Essential context for editing:**
- `index.html` lines ~1000 = state schema, ~1180 = `ITINERARY` const, ~1730+ = render logic, ~4640 = Notion integration, ~5480+ = event wiring
- `email-to-notion.gs` lines ~40 = credentials, ~490 = `pushToNotion`, ~785 = `MULTI_BOOKING_PROMPT`, ~1000+ = 7 worked examples

**After finishing work in a session:**
1. Commit + `git push origin main`
2. Update this file:
   - Bump "Last updated" date
   - Update "Latest commit" to new SHA
   - Add your commit to the table
   - Document any new feature / fix in the Feature inventory section
   - Add new known issues to the follow-ups list
3. Commit `HANDOVER.md` and push again

**If Apps Script changed:** also re-run clasp push (see Clasp bootstrap section).

---

## 📞 Communication style Boss prefers

- 直接、有主見、零廢話
- 憎 AI-speak ("我理解你嘅感受")
- 繁中 + 廣東話風味 · 加 emoji · 有幽默
- HK timezone (UTC+8)
- Arsenal fan — 橙紅色系 UI 係刻意 nod 🔴

---

*This file is part of the project. Keep it short, dense, and up to date.*
