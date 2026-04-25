# travel-expense

旅行記帳 web app，專為 Boss (Tony) 嘅 2026年4月 名古屋旅行度身訂造。
由 Cowork 建立，之後喺 Claude Code 繼續 iterate。

---

## Project Context

**User:** Boss (Tony) — 香港入境處主任，期貨交易員，喺 HK 時區工作
**Trip:** 名古屋 + 中部阿爾卑斯山，2026年4月20–25日（6 日 5 夜）
**Purpose:** 掃描日本收據自動入帳，配合行程即時追蹤花費
**Reference:** 原始靈感嚟自 @chaseyhan 喺 Threads 分享嘅同類工具

## Tech Stack

- **單一 HTML 檔案** (`index.html`) — 無 build step、無 dependencies install
- **Tailwind CSS** via CDN（`cdn.tailwindcss.com`）
- **Chart.js 4.4.0** via CDN — 統計圖表
- **Vanilla JavaScript** — 冇 framework
- **localStorage** — 本地持久化（key: `boss-japan-tracker`）
- **Google Gemini API** — AI 收據辨識（vision + OCR + 繁中翻譯）
- **Notion API** — 雲端同步（經 CORS proxy）

## File Structure

```
travel-expense/
├── CLAUDE.md           # 你而家讀緊呢個
└── index.html          # 整個 app (~1000 行，包 HTML+CSS+JS)
```

單一檔案係刻意設計 — 方便直接 double-click 開用、可以 AirDrop 去 iPhone、可以加 Home Screen 變 native-like。

## Architecture Overview

### State model
```js
state = {
  receipts: [],           // 所有收據紀錄
  budget: 101800,         // JPY 總預算 (≈ HKD$5000)
  rate: 20.36,            // HKD → JPY 匯率
  apiKey: '...',          // Gemini API key
  model: 'gemini-3.1-pro-preview',
  notionToken: '',
  notionDb: '',
  proxy: 'https://corsproxy.io/?',
  autoSync: false,
}
```

### Receipt object schema
```js
{
  id: 'r_<timestamp>_<random>',
  store: '店名',
  total: 1800,           // JPY
  date: '2026-04-23',
  category: 'food',      // transport|food|shopping|lodging|ticket|medicine|other
  payment: 'cash',       // cash|credit|paypay|suica
  region: '金澤',
  itemsText: '品項 ¥金額\n...',
  note: '',
  createdAt: 1713072000000,
  notionPageId: 'uuid',  // 存在 = 已 synced 到 Notion
}
```

### Tabs (5)
1. **Dashboard** — 今日花費 / 總 / 日均 / 預算進度條 / 6 日行程
2. **Scan** — 影相 / 揀相 → Gemini API → 確認 modal → 儲存
3. **History** — 按日期分組，類別篩選，可 click 編輯
4. **Stats** — Chart.js 畫類別/支付/每日趨勢 doughnut + bar，TOP 10
5. **Settings** — 預算/匯率/API/模型/Notion setup + CSV export + reset

### Preloaded Itinerary
6 日行程寫死喺 `ITINERARY` constant，app 會根據今日 HKT 日期自動偵測你今日喺邊個城市，顯示喺 Dashboard 嘅「今日地區」。

| Day | Date | Region | Highlight |
|---|---|---|---|
| 1 | 2026-04-20 | 名古屋市區 | 蓬萊軒鰻魚飯 |
| 2 | 2026-04-21 | 飛驒高山 / 白川鄉 | KKday 三日團 Day 1 |
| 3 | 2026-04-22 | 立山黑部 | 雪之大谷 |
| 4 | 2026-04-23 | 上高地 / 金澤 | 兼六園 + 鳥開總本家 |
| 5 | 2026-04-24 | 名古屋 | 生日慶祝 🎂 |
| 6 | 2026-04-25 | 常滑 → 機場 | 回程 |

## API Integrations

### Gemini API (receipt OCR)
- Endpoint: `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`
- Default model: `gemini-3.1-pro-preview` (from openclaw.json backup)
- Sends: image base64 + structured prompt asking for JSON response
- Receives: `{ store, total, date, category, payment, items, tax, note }`
- Prompt enforces `responseMimeType: 'application/json'` + category rules
- No CORS issue — Google API allows browser direct

### Notion API (sync)
- Endpoint: `https://api.notion.com/v1/...`
- **CORS blocked** by Notion → proxied via `corsproxy.io` (default)
- Version header: `2022-06-28`
- Schema requires 9 properties (see Notion Database Schema below)
- Functions: `notionPushReceipt()` (single), `notionPushAll()`, `notionPullAll()`
- `notionPageId` stored on each receipt for update vs create

### Notion Database Schema
Name must match **exactly** (case-sensitive, including Chinese):

| Name | Type |
|---|---|
| 店名 | Title |
| 金額 | Number |
| 日期 | Date |
| 類別 | Select |
| 支付 | Select |
| 地區 | Text (Rich Text) |
| 品項 | Text (Rich Text) |
| 備註 | Text (Rich Text) |
| SourceID | Text (Rich Text) |

Select options (類別): 交通/餐飲/購物/住宿/門票/藥品/其他
Select options (支付): 現金/信用卡/PayPay/Suica

## Constants Reference

```js
CATEGORIES = [transport, food, shopping, lodging, ticket, medicine, other]
PAYMENTS = [cash, credit, paypay, suica]
NOTION_VERSION = '2022-06-28'
DEFAULT_API_KEY = 'AIzaSy...' (Boss's Gemini key, hardcoded)
```

⚠️ **Security note:** Gemini API key is hardcoded in the HTML file. Do NOT commit this file to public git or share. If leaked, revoke at `aistudio.google.com`.

## Known Limitations / Tech Debt

1. **localStorage only (unless Notion synced)** — 清 browser cache 會失去本地資料。Notion sync 係 insurance。
2. **CORS proxy dependency** — `corsproxy.io` 係 third-party，Boss 嘅 Notion token 會經過佢哋。理想做法係部署 Cloudflare Worker 做 owned proxy。
3. **No offline queue** — 冇網時寫入係 local-only，要手動之後 push。
4. **No conflict resolution** — 多端編輯有機會 overwrite。目前邏輯係 last-write-wins。
5. **No image storage** — 收據相只喺 scan 當下用嚟 API call，之後 discard（唔會存喺本地或 Notion）。
6. **Single user** — 冇 multi-user 支援（刻意，Boss 一個人用）。
7. **Hardcoded itinerary** — 改行程要直接編 `ITINERARY` constant。
8. **Error handling 簡單** — 錯誤通常只 toast 顯示，冇 retry logic。

## TODO / Future Ideas

### Priority (before trip 4/20)
- [ ] 測試 Notion sync end-to-end（最重要）
- [ ] 用真實日本收據測 Gemini OCR 準確度
- [ ] 加 PWA manifest 令可以 install 到 iPhone home screen
- [ ] 部署 Cloudflare Worker 做 owned Notion proxy（替 corsproxy.io）
- [ ] 加「每日預算 alert」— 當日超過 ¥17,000 (budget/6) 時警告

### Nice to have
- [ ] Offline queue + background sync
- [ ] Apple Shortcuts 整合：Siri「記一筆 ¥1200 餐飲」
- [ ] Export PDF report（旅程結束後）
- [ ] 多幣種支援（例如途中去其他國家）
- [ ] 將收據相片上傳到 Notion page（目前只存 metadata）
- [ ] iCloud Drive sync（兩台 device 共用同一份 localStorage）
- [ ] 用 Gemini 做 expense anomaly detection（「呢筆比平時餐飲貴 3 倍」）

### Refactor ideas
- [ ] 拆 HTML 成多個 file + bundler（但會失去「打開即用」優勢）
- [ ] 加 TypeScript + build step
- [ ] 用 IndexedDB 取代 localStorage（容量上限高）

## Git Workflow (MANDATORY)

**每次完成任何 task 之後，必須立即 commit + push 到 GitHub。**

```bash
git add index.html email-to-notion.gs CLAUDE.md   # 或相關改動嘅 file
git commit -m "type: description"
git push origin main
```

- 唔需要等 Boss 問，做完就自動 push
- Commit message 用 conventional commits（feat/fix/refactor/docs）
- Push 失敗要 report，唔好靜靜雞唔出聲

### Always merge to main (sticky rule, confirmed Apr 25, 2026)

如果係喺 feature branch / worktree 改嘢：commit 之後**自動** merge 入 main + push origin main，唔使再問。
Boss 一次 confirm = 永久 standing order。

```bash
# Feature branch flow
git commit ...                       # on feature branch
git checkout main
git merge --no-ff <feature-branch>   # if histories diverged unrelated → fall back to applying diff to main directly
git push origin main
git checkout <feature-branch>        # back to working branch
git reset --hard main                # keep feature branch in sync (avoids future unrelated-history pain)
```

---

## Development Notes

### 測試方法
直接 double-click `index.html` → browser 開 → 測試各 tab。冇 dev server、冇 watch mode。
修改後 refresh 個 browser 就得。

### Debug tips
- `localStorage.getItem('boss-japan-tracker')` 喺 DevTools Console 可以見到全部 state
- Gemini API call 出錯 → 睇 Network tab（`generativelanguage.googleapis.com`）
- Notion sync 出錯 → 睇 proxy response（`corsproxy.io/?https://api.notion.com/...`）
- Reset state: `localStorage.removeItem('boss-japan-tracker')` 然後 refresh

### Mobile testing
- AirDrop `index.html` 去 iPhone → Files → 開 Safari
- 或者放入 iCloud Drive → iPhone Files app 開
- Safari 開咗後 Share → "Add to Home Screen" → 變 PWA

## Related Context

- **Boss 嘅其他 dream projects**:
  - Audiobook app
  - Automated futures trading system
- **Oscar-agent framework** (`~/Documents/Oscar-agent/`) — WAT 架構，適合做 trading agent backend
- **Original inspiration**: @chaseyhan 喺 Threads 分享嘅日本收據 tracker（screenshots 見 post DWOEou6EUNe）

## Boss's Preferences (important)

- 鍾意直接、有主見嘅建議，零廢話
- 憎 AI-speak (例如「我理解你嘅感受」)
- 回覆要用 emoji 同幽默
- 繁體中文 + 廣東話風味
- 香港時區 (HKT, UTC+8)
- Arsenal fan（橙色系 UI 係刻意嘅 nod 🔴）

## Getting Started in Claude Code

```bash
cd ~/Documents/travel-expense
claude
```

然後第一句：
> Read CLAUDE.md and give me a 3-bullet summary of what needs to be done before 4/20.
