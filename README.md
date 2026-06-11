# Travel Expense App

這是一個旅行記帳網站。你可以用它記低每一筆旅行開支，例如食飯、交通、酒店、門票和購物。

## 小朋友都明白的版本

最簡單的想法是：

1. 你去旅行。
2. 你花了錢。
3. 你把收據、金額或文字放入這個 app。
4. App 幫你整理成清楚的記錄。
5. 你可以在不同旅程之間切換，不會把資料混在一起。

請記住一件事：每個人要用自己的登入 email。這樣你的旅行開支就不會和其他人的開支混在一起。

## 打開 App

- 主要公開 app: https://travel-expense-react.vercel.app
- Compact app: https://travel-expense-compact.vercel.app
- GitHub Pages React app: https://jd92-beep.github.io/travel-expense/react/
- 舊版備用 app: https://jd92-beep.github.io/travel-expense/

請優先使用主要公開 app。Compact app 是獨立的手機優化版本，改動不會影響主要 React app 或舊版備用 app。GitHub Pages 版有時會因為 GitHub Actions 下載問題而比 Vercel 慢更新。Netlify project 也存在，但 `https://travel-expense-react.netlify.app` 目前顯示 `usage_exceeded`，暫時不是平常使用的入口。

## 第一次使用

1. 打開主要公開 app。
2. 輸入自己的 email 登入 Supabase。
3. 去 email inbox 按登入連結。
4. 回到 app 後，第一次使用指引會帶你建立第一個旅程。
5. 預設會先建立一位旅伴 `User 1`。如果有同行者，再加入每位旅伴名字和分帳比例，例如 `Tony 2`, `May 1`, `Sam 0.5`。
6. 新增第一筆開支。
7. 去 Records tab 看看記錄有沒有出現。

記住：每個人要用自己的 email。不要全班、全家或公開用戶共用同一個帳號。

## 每次旅行怎樣用

1. 先選對旅程。
2. 花錢後新增一筆開支。
3. 儲存前檢查日期、店名和金額。
4. 去 Records tab 看是否儲存成功。
5. 有需要就去 Stats tab 看總數。
6. 如果你有連接 Notion，可以同步多一份筆記簿副本。

## 天氣資料

Compact app 的 Weather 頁會根據行程城市、國家和景點座標抓天氣。日本、新加坡、美國和加拿大旅程會優先使用當地官方氣象資料，例如 JMA、NEA/data.gov.sg、NWS 和 MSC GeoMet，再用 WeatherAPI 或 Open-Meteo 補回官方資料沒有的欄位，例如體感、UV 或雲量。其他國家的官方氣象源會按是否可安全直連、是否需要 API key、是否需要代理伺服器逐步加入；API key 不會放入公開前端。

## 誰可以用

每位公開用戶都應該用自己的 Supabase email 登入。

不同人用不同帳號時：

- A 同學只會看到 A 同學自己的旅程和收據。
- B 同學只會看到 B 同學自己的旅程和收據。
- 資料庫規則會阻止一個人偷看另一個人的私人記錄。

如果你用共用手機或共用電腦，登出前可以按 Supabase 登出按鈕旁邊的垃圾桶圖示。它會清走這部機內屬於這個帳號的暫存資料。

## 可以做甚麼

### 1. 建立旅程

在主頁或 Settings 頁：

1. 從旅程下拉選單選一個旅程，或建立新旅程。
2. 幫旅程改名，例如 `Japan 2026`。
3. 填旅行日期。
4. 填你打算花多少錢。
5. 建議貼上完整行程、酒店、餐廳、交通或 booking 文字，讓 AI 幫你整理每日景點。

App 會把每個旅程分開保存。

如果你有多個旅程，例如 `Japan 2026` 和 `Taiwan 2026`，請先在首頁下拉選單選對旅程，再新增開支。這樣 app 才知道那筆錢屬於哪一個旅行。

Trip Update AI 會先顯示確認視窗，逐日列出 AI 抽到的日期、酒店、景點、餐廳、時間、城市、國家和缺漏欄位。你確認後，Itinerary 和 Weather 才會更新。行程日期支援 `2026-06-13`、`2026/6/13`、`6/13`、`6月13日` 這類格式；沒有年份時，app 會用同一旅程的年份或旅程 ID 推斷，避免因瀏覽器時區把日期變成前一日。

### 2. 新增開支

你可以用幾種方法新增開支：

- 掃描收據相片。
- 從相簿選收據。
- 貼上 email 文字。
- 自己打字輸入。
- 用聲音輸入。

每筆開支都要看清楚：

- 店名
- 日期
- 時間
- 金額
- 貨幣
- 類別
- 支付方法
- 旅程

看清楚後按儲存。

### 3. 查看記錄

去 Records tab 可以看到目前旅程的所有開支。

你可以：

- 用店名或備註搜尋。
- 按類別篩選。
- 打開一筆記錄來修改。
- 確認等待處理的 email 記錄。

如果你在手機 Chrome 見到卡片太闊或畫面怪怪的，先刷新頁面一次，再確認你正在用主要公開 app。如果問題仍在，請把 tab 名稱和手機型號記下來交給開發者。

### 4. 查看行程

Itinerary tab 會顯示目前旅程的行程。

它可以顯示：

- 第幾天
- 去哪些地方
- 酒店和交通
- 每一天相關的開支
- 目前時間去到哪一個景點

Timeline 左邊的行程線會跟住景點走，不是單純用 24 小時比例。當今日剛好在旅程日期內，深色動畫會停在目前時間所屬的景點附近；如果今日不在這個旅程日期內，行程線會保留原本紅、金、綠顏色，但會變暗，表示這只是過去或未來的參考行程。

在手機上，用底部的 tab 轉頁。Itinerary 卡片已經為手機縮細排版，地圖和編輯按鈕會放在右側，讓一屏可以看到更多行程點。

### 5. 查看統計

Stats tab 幫你回答簡單問題：

- 我用了多少錢？
- 哪一類用了最多錢？
- 哪些店最貴？
- 幾個旅伴應該怎樣分帳？

### 6. 使用 Notion

Notion 可以像一本同步筆記簿，保存開支記錄。

簡單來說：

- Supabase 是公開多人使用的主要資料庫。
- Notion 可以多保存一份筆記簿副本。
- 連接 Notion 後，app 可以推送和拉取記錄。

公開使用時，每個人如果想用 Notion sync，應該連接自己的 Notion database。不要讓所有人共用同一個 Notion database 和密碼。

Notion 同步之前，請先確認目前選中的旅程是正確的。每筆 Notion 記錄都應該有 `TripID`，app 會用它來避免不同旅程的記錄混在一起。

如果你還未連接自己的 Personal Notion，Settings 會只顯示 Supabase 同步。這是正常的，代表 app 不會用舊的共享 Notion notebook。

### 7. 使用 AI

App 只會經 server-side Credential Broker 使用 AI。瀏覽器不應該存放真正的 AI API key。

目前主要模型規則：

- Email parsing: Kimi `kimi/kimi-code` first.
- Trip update parsing: Kimi `kimi/kimi-code` first.
- Receipt scan: Google Gemma 4 31B first.
- Voice parsing: Google Gemma 4 31B first.

如果 AI 暫時不能用，你仍然可以自己打字記帳。

如果 app 說今日 AI 用量已滿，代表系統保護大家的公開用量。這時 app 不會偷偷改用另一個 AI 供應商；你可以先手動輸入，或等明天再用 AI。

在 Settings 的 Model routing 選好 trip update model 後，Trip Update AI 會用該模型作主要分析來源。進階診斷、Notion schema、stress test、deploy recovery 等維護工具已收在開發者面板內，普通使用時 Settings 只保留旅程、AI、同步、備份和資料管理等日常控制。

### 8. 匯出和備份

在 Settings：

- Export CSV 會匯出目前旅程的開支表。
- Export Backup JSON 只會匯出目前旅程和這個旅程的收據。
- Import Backup JSON 可以還原安全的本機資料，但會移除秘密資料和雲端 ID。

不要把真正 API key 或 token 放進 backup 檔。

## 安全規則

- 不要把真正 API key 放入 GitHub、Vercel、Netlify 或瀏覽器程式碼。
- 不要讓所有公開用戶共用同一個登入帳號。
- 公開用戶要用 Supabase auth。
- Notion 應該是每個人自己的同步筆記簿，不是一個大家共用的公開筆記簿。
- 如果用共用裝置，登出前清除這部裝置的資料。

## 如果出現問題

- 看不到自己的資料：先確認是否用同一個 email 登入。
- 記錄去了錯的旅程：回到首頁選正確旅程，再檢查 Records tab。
- Notion 沒有同步：去 Settings 檢查 Notion database 是否是自己的。
- AI 不能用：可以先用手動輸入，記帳功能仍然可以用。
- 共用手機用完：登出前按清除裝置資料，避免下一個人看到你的暫存資料。

## Developer Quick Start

```bash
cd /Users/tommy/Documents/Codex/travel-expense

# React public app
cd app-react
npm install
npm run dev
npm run typecheck
npm run build
```

Local React URL:

```text
http://localhost:8902/travel-expense/react/
```

Useful checks:

```bash
cd app-react
npm run security:scan
npm run db:policy:scan
npm run db:rls:smoke
npm run smoke:settings
npm run smoke:security
npm run smoke:ai-routing
npm run smoke:mobile-layout
```

`npm run db:rls:smoke` is a live Supabase database check. It needs `SUPABASE_DB_URL` in your shell. Do not write that URL into any file.

Supabase public-mode checks:

```bash
cd app-react
SUPABASE_REDIRECT_SMOKE=1 npm run smoke:security
SUPABASE_AI_SMOKE=1 npm run smoke:ai-routing
SUPABASE_MIRROR_SMOKE=1 npm run smoke:supabase-notion-mirror
SUPABASE_TRIP_ACTIVE_SMOKE=1 npx playwright test tests/supabase-trip-active-smoke.spec.cjs --workers=1 --browser=chromium --reporter=line
```

## Project Shape

```text
travel-expense/
  app-react/                 React 19 + Vite public app
  index.html                 Legacy root app kept as backup
  legacy-notion.js           Legacy Notion sync helper
  email-to-notion.gs         Google Apps Script email importer
  workers/credential-broker/ Cloudflare Worker for secrets and AI provider access
  supabase/migrations/       Supabase schema and RLS hardening
  docs/                      Legacy tab notes
  AGENTS.md                  Agent rules for this folder
  HANDOVER.md                Latest technical handover
  CHANGELOG.md               Human-readable change history
```

## Deploy

Normal deploy is:

```bash
git push origin main
```

GitHub Actions builds `app-react/`, publishes the legacy app at the root, and publishes the React app under `/react/`.

Vercel is connected to the same GitHub repo and serves the React app at `/`.

Netlify config is present, but the current public Netlify URL is blocked by account usage limits.

## For The Next Agent

Read these first:

1. `AGENTS.md`
2. `HANDOVER.md`
3. `CHANGELOG.md`

Do not commit real secrets. Do not stage `CLAUDE.md` unless Boss explicitly asks.
