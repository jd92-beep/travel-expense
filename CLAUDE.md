# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

# travel-expense

旅行記帳 web app，專為 Boss (Tony) 嘅 2026 年 4 月 名古屋旅行度身訂造。原由 Cowork 起手，之後喺 Claude Code 持續 iterate。

---

## Project Context

- **User:** Boss (Tony) — 香港入境處主任、期貨交易員，HKT 時區
- **Travel companion:** 欣欣 (p_xinxin) — 用於分帳邏輯
- **Trip:** 名古屋 + 中部阿爾卑斯山，2026-04-20 → 2026-04-25（6 日 5 夜）
- **Purpose:** 掃描收據自動入帳 + 行程即時追蹤花費 + 跨 device sync
- **Inspiration:** @chaseyhan 喺 Threads 分享嘅日本收據 tracker

## Tech Stack

- **單一 HTML 檔** (`index.html`, ~10,200 行) — 無 build step、無 dependencies install
- Tailwind CSS via CDN (`cdn.tailwindcss.com`)
- Chart.js 4.4.0 via CDN — 統計圖表
- Vanilla JavaScript — 冇 framework
- localStorage（key: `boss-japan-tracker`）— 本地持久化
- 多 AI provider（Google Gemini · 智譜 GLM · MiniMax）— 收據 OCR / 語音解析 / Email 解析
- Notion API — 雲端同步，經自家 Cloudflare Worker proxy（`notion-proxy.ftjdfr.workers.dev`）
- 密碼鎖 + AES-GCM encrypted vault — Gemini/Notion credentials 用 password 加密存 localStorage

## Commands

冇 dev server、冇 watch、冇 test runner。日常 workflow：

```bash
# Development — refresh browser to test
open index.html                        # 或者 double-click

# State debugging in browser DevTools console
localStorage.getItem('boss-japan-tracker')   # 查全部 state
localStorage.removeItem('boss-japan-tracker') # 清晒重來

# Quick code navigation
grep -n "function someName" index.html       # 揾 function 行號
wc -l index.html                              # 確認大小

# Mobile testing
# AirDrop index.html → iPhone Files → Safari → Share → Add to Home Screen
```

呢個 repo 冇 `npm test` / `npm run lint` 之類嘅 command — 改完 refresh 個 browser 就係 test。

## File Structure

```
travel-expense/
├── CLAUDE.md             # 你而家讀緊呢個
├── index.html            # 整個 app（HTML + CSS + JS 全部喺度）
├── docs/                 # 每個 tab 嘅 technical introduction
│   ├── README.md
│   └── dashboard.md / scan.md / history.md / weather.md / stats.md / timeline.md / settings.md
├── email-to-notion.gs    # Apps Script for email → Notion (optional helper)
└── .claude/              # worktrees, settings
```

刻意 single-file — 方便 double-click 開、AirDrop 去 iPhone、加 Home Screen 變 PWA-like。

## Architecture Overview

### Tabs（7 個）

| Tab | `<section id>` | 用途 |
|---|---|---|
| Dashboard | `tab-dashboard` | 今日花費 / 總 / 日均 / 預算進度 / 6 日行程簡覽 |
| Scan | `tab-scan` | 影相 / 揀相 / 語音 / Email → AI 解析 → 確認 modal → 儲存 |
| Timeline | `tab-timeline` | 垂直時間軸（計劃 + 實際消費） |
| History | `tab-history` | 按日期 grouped 收據，category filter，撳入去編輯 |
| Weather | `tab-weather` | 行程日嘅天氣預報 |
| Stats | `tab-stats` | Chart.js 類別/支付/趨勢圖 + TOP 10（含/不含機票酒店 toggle） |
| Settings | `tab-settings` | 預算/匯率/旅伴/分帳比例/AI 模型/Notion config/CSV/reset |

每個 tab 嘅 deep-dive 喺 `docs/<tab>.md` — function、按鈕、state、edge case 都 list 晒。`switchTab` (line ~8730) 係 routing 中樞，切完即 call 對應 render。

### State model（精簡版）

完整定義喺 `index.html` line ~1747 (`let state = { ... }`)：

```js
state = {
  receipts: [],
  budget: 101800,                  // JPY total（HKD 係 anchor，UI 自動換算）
  rate: 20.36,                     // JPY per HKD（內部存法）
  apiKey, model, scanModel, voiceModel, emailModel,  // 多 AI provider keys
  notionToken, notionDb, proxy, autoSync,
  notionDeletedIds: [],            // 本地刪除嘅 Notion page IDs，pull 時 skip
  persons: [{id,name,emoji,color}, ...],
  shareRatios: { [personId]: weight },
  customItinerary, tripName, tripDateRange,
  statsIncludeTransportLodging,    // 總消費/日均嘅 toggle
  top10IncludeBigItems,            // TOP 10 list 嘅 toggle
  lastTab,
}
```

### Receipt object schema（重要！）

```js
{
  id: 'r_<timestamp>_<random>',
  store, total, date, category,    // category ∈ CATEGORIES (line 1567)
  payment,                         // payment ∈ PAYMENTS (line 1581)
  region, itemsText, note, createdAt,
  notionPageId,                    // 存在 = 已 sync 到 Notion
  personId,                        // 付款人 (state.persons[].id)
  splitMode: 'shared' | 'private', // 分帳模式 — 影響結算
  beneficiaryId,                   // 私人代付：受惠人 ID（全額還番）
}
```

**分帳語意：**
- `shared` → 按 `state.shareRatios` 攤分俾全部旅伴
- `private` （冇 beneficiary）→ 付款人自己 100% 承擔，唔入分帳
- `private` + `beneficiaryId` → 受惠人全額還俾付款人（🎁 代付）

詳細解釋見 Settings 頁嘅 ⚖️ 分帳比例 panel（line ~812）同 `docs/settings.md`。

### AI providers（多模型）

每種輸入用 **獨立** 模型，state 唔同 field：

| 用途 | State field | 預設 | 點配置 |
|---|---|---|---|
| 收據圖片 OCR | `state.scanModel` | `minimax` | Settings → AI 模型 → 收據掃描 |
| 語音輸入解析 | `state.voiceModel` | `minimax` | Settings → AI 模型 → 語音 |
| Email 匯入解析 | `state.emailModel` | `glm-5.1` | Settings → AI 模型 → Email |
| 行程 / 票券辨識 | `state.model` | `gemini-3.1-flash-lite-preview` | Settings → AI 模型 → Gemini |

模型清單寫死喺：
- `SCAN_MODELS` (line 1588) — Kimi K2.6、MiniMax、GLM-4.6V、Gemini 3.1/3/2.5 系列
- `VOICE_MODELS` (line 1598)
- `EMAIL_MODELS` (line 1616)

**Gemini endpoint：** `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}` — 直接 browser call，無 CORS 問題。GLM/MiniMax/Kimi 各自用其 provider endpoint/proxy。

收據 prompt 處理多國日期格式（Reiwa/Heisei/Showa、民國、Buddhist Era、年月日、DMY/MDY/YMD），`parseDateFallback` (line ~6087) 做 safety net。

### Kimi for Coding API

- Base URL: `https://api.kimi.com/coding/v1` — **CORS blocked**，需要 server-side proxy
- Model constant: `KIMI_MODEL = 'kimi-for-coding'`
- Required header: `User-Agent: claude-code/0.1.0` (由 proxy 注入)
- **Proxy deployed**: `https://rare-duck-29.jd92-beep.deno.net` (Deno Deploy, free tier, Apr 27 2026)
  - 點解唔用 CF Worker：Kimi 自身受 CF 保護，CF WAF 阻塞 CF Worker IP 段 (`2a06:98c0::/32`)。Deno Deploy 跑喺 GCP IP → 唔被阻
  - CF Worker backup: `kimi-proxy.js` → `kimi-proxy.ftjdfr.workers.dev`（blocked，留作 reference）
  - Deno source: `kimi-proxy-deno.ts`
- **Thinking mode 陷阱**：`thinking:false` 下 reasoning_content **仍然消耗** `max_tokens`（唔係淨 content）→ 低 token limit 會返空內容。用 default（thinking ON）+ `max_tokens: 2000`
- Vision: `callKimiVision()` — base64 圖片 → JSON
- Text: `callKimiText()` — 語音 / email 解析
- Key: `state.kimiKey` / `VAULT_KIMI_KEY` — Settings → 🔑 API Keys 或 gitignored `secrets.local.js`
- Proxy URL: `state.kimiProxy` — 預設指向上面 Deno Deploy URL
- **Security:** repo 同 GitHub Pages HTML 都係 public；Kimi key/token 不可 commit、不可寫入 docs、不可由 workflow inject 入 `_site/index.html`。`deploy.yml` 只處理 MiniMax/ZAI placeholders；Kimi 只可本機/裝置輸入。

### Notion sync

- Endpoint: `https://api.notion.com/v1/...` 經 `state.proxy`（預設自家 Cloudflare Worker，唔再用 corsproxy.io）
- Version header: `2022-06-28` (`NOTION_VERSION`, line 6843)
- 一條 receipt = 一個 Notion page；`notionPageId` 決定 update vs create
- **Settings sync trick：** 同一個 DB 入面用 `SourceID = '__meta_settings__'` 嘅特殊 row，將 budget / rate / persons / ratios / toggle state 等 non-sensitive config 序列化成 JSON 存喺 `備註` field（rich_text 限 2000 char，`customItinerary` 過大時會 drop）。Credentials（token / key）**永遠** 唔入 Notion。
- 主要 function：`notionPushReceipt`、`notionPushAll`、`notionPullAll`、`notionPushSettings`、`applySettingsPayload`

#### Notion DB schema（properties 名要完全對應，case-sensitive）

| 名 | Type |
|---|---|
| 店名 | Title |
| 金額 | Number |
| 日期 | Date |
| 類別 | Select（交通/餐飲/購物/住宿/門票/藥品/其他）|
| 支付 | Select（現金/信用卡/PayPay/Suica）|
| 地區 / 品項 / 備註 / SourceID | Rich Text |

### Password gate / encrypted vault

App 啟動 → 鎖屏 → 輸入密碼解 AES-GCM vault → 取出 Gemini / Notion credentials 入 `state`。詳見 `gateAndInit` 同相關 vault function。**清 localStorage 會連同 vault 一齊冇**。

### Currency / FX convention

- HKD 係 **anchor**（input 主導），JPY 從 HKD × rate 衍生儲存
- Settings UI 顯示係「100 JPY = X HKD」，內部 `state.rate` 反過嚟存（JPY per HKD）— `setRate` field 有 reciprocal 換算邏輯（line ~4047 之後）
- FX rate 每小時自動由 Visa 拉新（`fetchLiveRate`），fallback 預設 4.91 HKD per 100 JPY

### Constants 速查

```
CATEGORIES   line 1567  — 7 個 (transport/food/shopping/lodging/ticket/medicine/other)
PAYMENTS     line 1581  — 4 個 (cash/credit/paypay/suica)
SCAN_MODELS  line 1588  — 收據視覺模型清單
VOICE_MODELS line 1598
EMAIL_MODELS line 1616
ITINERARY    line 1630  — 寫死嘅 6 日預設行程（user 可經 customItinerary override）
NOTION_VERSION line 6843
APP_BUILD    line 1774  — bump 一下會觸發更新提示
```

### Render functions（每個 tab 有自己一個）

| Tab | Function | 約莫行號 |
|---|---|---|
| Dashboard | `renderDashboard` | ~2630 |
| Scan | `scanReceipt` | ~4384 |
| History | `renderHistory` | ~3699 |
| Timeline | `renderTimeline` | ~3741 |
| Stats | `renderStats` | ~4093 |
| Weather | `renderWeather` | ~8647 |

## Known Limitations / Tech Debt

1. **localStorage only**（除非 sync Notion）— 清 cache 會冇本地資料；Notion 係 insurance
2. **Cloudflare Worker proxy single point** — 自家 worker down 嘅話 sync 死火（有 corsproxy.io 做 fallback chain）
3. **No offline queue** — 冇網時寫入只係 local，要事後手動 push
4. **Last-write-wins** — 多 device 同時改有機會 overwrite，冇 conflict resolution
5. **冇收據相留底** — Scan 完即 discard，唔上傳
6. **Hardcoded ITINERARY** — 改寫死行程要直接編 constant；user override 經 `customItinerary` JSON
7. **2000-char Notion meta limit** — 大 `customItinerary` push 唔晒，會標 `customItineraryTooLarge: true`

## Git Workflow (MANDATORY)

每次完成任何 task 之後，**必須立即** commit + push 到 GitHub：

```bash
git add <changed files>           # 唔好 git add . — 避免意外 commit secrets / 大檔
git commit -m "type: description" # conventional commits (feat/fix/refactor/docs)
```

- 唔使等 Boss 問，做完自動 push
- Push / hook 失敗要 report，唔好食晒

### Always merge to main (sticky standing order, confirmed Apr 25 2026)

如果係喺 feature branch / worktree 改嘢：commit 之後 **自動** merge 入 main + push origin main，唔使再問。Boss 一次 confirm = 永久。

```bash
# Feature branch flow
git commit ...                       # on feature branch
git checkout main
git merge --no-ff <feature-branch>
git push origin main
git checkout <feature-branch>
git reset --hard main                # keep feature branch in sync
```

如果兩條 branch histories 唔相關（unrelated histories）→ fall back 直接喺 main 重 apply diff，唔好強行合 — vibrant-carson orphan branch 出過呢類事故。

## Boss's Preferences

- 直接、有主見、零廢話
- 憎 AI-speak（「我理解你嘅感受」呢類唔好用）
- 回覆要 emoji + 幽默
- 繁體中文 + 廣東話風味
- HKT (UTC+8)
- Arsenal fan（紅色系 UI 元素係刻意嘅 nod 🔴）

## Getting Started in a Fresh Session

```bash
cd ~/Documents/travel-expense
claude
```

第一句通常：
> Read CLAUDE.md and tell me 邊個 tab 出問題 / 要做啲咩。

要 deep-dive 某個 tab 之前先 `cat docs/<tab>.md`。
