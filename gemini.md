# GEMINI.md

> 呢個 file 係俾 Google Antigravity (即係我自己) 專用嘅 reference file，用嚟喺 `travel-expense` project 入面保持 context 同工作標準。

## 🎯 Project 總覽
- **Project 名**: Travel Expense (語音輸入可能會變咗 "Triple Expansion" 🤣，明晒！)
- **Repo 路徑**: `/Users/tommy/Documents/Codex/travel-expense`
- **Live URL**: `https://jd92-beep.github.io/travel-expense/` (GitHub Pages) / `https://travel-expense-react.vercel.app` (Public React Vercel)
- **目的**: 幫 Boss (Tony) 記 2026 年名古屋旅行嘅帳，支持 AI OCR、Email 解析同行程 tracking。
- **Tech Stack**: Vanilla JS + HTML (Legacy 主版) / React 18 + Vite (Fresh React 喺 `app-react/`) / Google Apps Script (Email-to-Notion) / Notion API 做 Database。

## 🤖 Antigravity 專屬工作守則

### 1. 溝通與風格
- 稱呼 user 做 **Boss** 🫡。
- 用 **廣東話 (繁體中文)** 回覆同思考，語氣要直接、有主見、不廢話、多啲 emoji 🚀😎。
- 英文只用喺 code、commands、file paths、API names 同 exact model names。
- 唔好做 yes-man！如果有更好嘅做法，或者覺得 requirement 有伏，會直接出聲 🧐。

### 2. 開工前必做
- 永遠先讀 `README.md`、`HANDOVER.md` 攞最新狀態。
- 睇踩 `graphify-out/GRAPH_REPORT.md` (架構總覽) 同埋用 `gitnexus` 查 codebase (code-level flow)。
- 對於 legacy `index.html` 嘅大改動要極度小心，唔好破壞現有嘅 PWA 結構同 `localStorage` (`boss-japan-tracker`)。

### 3. 改 Code 流程與 GitNexus
- **MUST run impact analysis**: 郁手改 function 或 method 前，一定要用 GitNexus MCP (`gitnexus_impact`) 檢查 blast radius，如果 risk level 係 HIGH 或者 CRITICAL 就要向 Boss 匯報。
- **MUST run changes detection**: Commit 前用 `gitnexus_detect_changes()` 確定改動範圍。
- 所有改動直接 commit 去 `main` (`git push origin main`)，Boss approve 咗一次就係永久。

### 4. 密碼與 Security 🔐
- **絕對唔好** 將 any API Keys (Zhipu, MiniMax, Gemini, Notion token) commit 上 GitHub！Repo 係 public 嘅！
- `index.html` 嘅 secrets 會靠 vault 處理，`app-react/` 會經 Credential Broker 處理，跟足現有架構。

---

## 🛠️ 核心架構與最新升級 (2026-06-11 HKT)

### 0. 📍 React Itinerary Timeline 最新狀態
- **Spot-index progress**：React `/react/` Itinerary rail 依家跟「目前時間所屬嘅景點位置」推進，而唔係用 24 小時比例硬拉條線。
- **Magic UI rail beam**：Timeline 左側 rail 用 `BorderBeam` 加獨立 beam layer、上下 shine、dynamic fill，同手機 compact card 排版，避免 rail 遮住文字。
- **Out-of-trip dimmed colour**：如果今日唔喺 trip 日期範圍內，rail 會保留紅/金/綠 itinerary palette，但變暗、隱藏 live marker、暫停 bright sweep，代表係過去/未來行程。
- **Smoke coverage**：`npm run smoke:timeline` 已覆蓋 live spot progress、mobile rail geometry、outside-trip dimmed palette。

### 1. 🧹 Zhipu (GLM-5) 徹底剔除，全面擁抱 Kimi (Moonshot)
- **Kimi 首選**：不論在前端 AI (React/Legacy) 還是 Apps Script 後端 (`email-to-notion.gs`)，Zhipu 已完全被清空，首選模型全部升級為 Kimi (`kimi-8k` / `kimi-32k` / `kimi-k2.6`)。
- **邊緣 Worker 加密儲存 (零密鑰暴露)**：Kimi API Key 安全地加密儲存於 Cloudflare Worker (`credential-broker`) 的 KV 空間。React 與 HTML 前端 **絕不保存與泄露** Kimi Key，直接 commit 到 public repo 100% safe！
- **Deno Proxy 繞過 WAF**：為避免 Cloudflare Worker 請求被 Kimi 的 WAF 攔截，Worker 環境變量 `KIMI_PROXY_URL` 必須指向 Deno Proxy `https://rare-duck-29.jd92-beep.deno.net` 進行轉發。
- **免手動輸入**：Boss 登入 App 時只需輸入 Unlock Password，即可直接與 Worker `/kimi/json` 握手，免去手動輸入 Kimi 密鑰的繁瑣步驟。

### 2. 🧟 「立山黑部」殭屍費用復活防範機制
- **漏洞原因**：Notion Database Query 默認不會返回已 archived (歸檔/刪除) 嘅頁面，導致 Apps Script 去重檢測失效，反覆 POST 創建重複數據。
- **超渡策略**：
  1. 使用 **PropertiesService** 緩存 `SourceID -> page_id` 的映射關係。
  2. 查重時，優先使用緩存 the page_id 發起直連 `GET /pages/{id}` 請求（直連請求能取得已 archived 頁面的 live 狀態）。
  3. 一旦檢測到 `archived: true` 或者是 `in_trash: true`，Apps Script **100% 主動 skip** 該筆費用，徹底解決殭屍復活 Bug！

### 3. 🔄 Settings ＆ Itinerary Overrides 大容量雙向同步
- **Itinerary Overrides 切割**：由於 Notion 屬性限制 2000 字符，用戶的手動調整 (`itineraryOverrides`) 被 JSON 化後，使用 `richTextChunks` 將其切割為多個 1800-char block 儲存在 Notion Rich Text (`__meta_settings__` row) 中，最大支持 **144 KB** 超大容量同步！
- **合併機制**：同步拉取時，將遠端 settings 與本地 settings 進行 shallow merge，避免覆蓋 Boss 在手機端最新做的 Tweaks。

### 4. 🗑️ 刪除紀錄雙重確認與版面美化
- **雙重確認 Dialog**：喺 React 同 Compact 嘅 `ReceiptEditor.tsx` 入面新增咗刪除確認 Modal，防止 Boss 唔小心揈走重要嘅消費紀錄。
- **Footer 佈局重組**：重構咗 `.receipt-editor-actions` 嘅 CSS Flex 佈局。將「刪除」擺左邊，而「儲存」同「取消」擺右邊，確保喺 390px 手機寬度下絕對唔會發生按鈕重疊或溢出，排版超級 Professional！
- **Playwright Test 覆蓋**：`history-smoke.spec.cjs` 已經加咗對應嘅測試用例，確認雙重確認框嘅顯示、取消同確認刪除邏輯 100% 通過！

### 5. 💰 Dashboard ＆ Stats 總消費額修正
- **總消費額解耦**：修正咗 React Dashboard 嘅 `totalIncludeFL` 同 Stats 嘅 `trueTotalHkd`。以前如果熄咗「包括交通/住宿於統計圖表」，總消費額會縮水到日常開支嘅 HK$11,898，令預算環顯示有 HK$6,107 餘額。
- **現時狀態**：總消費額 (Total Spent) 永遠包含所有項目（包括機票同住宿），以確保與總預算比較時顯示正確嘅超量狀態（>$20,000），而 Toggle 依家只會用嚟過濾圓餅圖、Top 10 同日均開支！

### 6. 📱 Compact App & 氣象/AI/精靈 升級 (2026-06-10 新增)
另一位 AI Agent 完成咗超大規模嘅優化同修復：
- **AI 行程更新確認彈窗 (Settings AI Confirmation)**：喺 Compact 貼入長篇行程並按「用已選模型分析」時，依家會即刻彈出一個 `確認 AI 行程更新` Modal。Modal 會清楚列出分析模型、行程天數、酒店/餐廳數量、缺漏欄位、假設與警告等，等 Boss 看清晒先至按 `確認並更新行程`，體驗超順暢！
- **Mimo / Gemma 路由同 JSON 抽取硬化**：
  1. Google Gemma 模型 ID 正式對齊官方 API 規格，改用 `google/gemma-4-31b-it`，並全自動將舊有嘅備用設定進行熱遷移。
  2. Worker 抽取 JSON 邏輯重構，就算 Gemma 喺 JSON 後面吱吱喳喳多加咗廢話，都可以 100% 準確提取物件。
  3. Mimo 請求路由改用 `api-key` header，並喺 Token 方案失效時自動 fallback 至 pay-as-you-go 基本路徑。
- **多國官方氣象 Router (Weather JMA/NEA/NWS/MSC)**：
  1. 氣象系統會依據國家 code/座標定位直接連去日本 JMA、新加坡 NEA、美國 NWS、加拿大 MSC 嘅官方 API。
  2. 當官方資料缺乏體感/UV/雲量時，先用 WeatherAPI fallback 填補，唔會隨便暴露 key。
  3. 氣象指標晶片卡片重構為 2x2 grid，徹底解決手機 390px 寬度下 UV/風速/雨量被 `...` 截斷嘅慘劇，UV 排第一位！
- **新旅程建立精靈 (New Trip Wizard)**： Step 2 新增 +/- 天數調整器，解決時區 off-by-one 扣天數 bug；Step 1 輸入韓國會自動設定 KRW 做主結算貨幣；Step 4 串接 Wikivoyage 免密鑰 API 動態拉取景點建議。
- **Dashboard ＆ Stats 大瘦身**：
  1. Dashboard/Home 頁面移除了「打包清單」、「出發倒數」、「AI 教練」等贅餘 widget，大幅提升頁面載入速度與視覺清爽度。
  2. Stats 頁面預算指南卡片精簡為 used %、每日餘額與 Top 10 支出，清走多餘嘅分帳/代付卡。

### 7. 🧭 Shared Trip Contract 最新修正 (2026-06-11)
- **React + Compact 日期 normalization 同步**：`app-react/src/domain/trip/normalize.ts` 同 `app-compact/src/domain/trip/normalize.ts` 都已經修正 itinerary date parser。`2026/6/13`、`2026.6.13`、`2026年6月13日` 會直接變成 `2026-06-13`；`6/13`、`6月13日` 會用同一 itinerary 或 trip id 入面嘅年份推斷，唔再畀 `new Date()` 因 timezone 變前一日或者變 2001 年。
- **Blast radius 好大**：GitNexus impact 顯示 `normalizeItinerary()` 喺 Compact 係 CRITICAL，React 亦係 CRITICAL，因為 Timeline、Weather、Stats、Settings、receipt stamping、Supabase/Notion sync 都靠佢。做任何後續日期/schema 改動，一定要跑 `typecheck`，再補 `smoke:timeline`、`smoke:weather`、`smoke:settings`、`smoke:shared-contract` 或相關 build。
- **Settings 普通用戶清理**：Compact Settings 已經將 dev-only diagnostics、stress tools、deploy recovery、Notion schema/debug 工具收埋喺 developer panel，保留 AI Models、Trip Manager、Trip Update AI、sync、backup 同 data management 俾日常使用。Trip Manager 亦有 `View / Edit Itinerary` 可以開現有行程確認視窗。

### 8. ✈️ Compact Trip Update Sync、兩階段 AI 流程、Mimo Pro 與性能優化 (2026-06-11 新增)
另一位 AI Agent 完成咗針對行程更新同模型載入嘅深度修復同優化：
- **Jeju 行程更新同步修正 (Sync Queue Fix)**：修復咗 Settings 中 AI 行程確認時，`applyTripDraft()` 淨係 queue 咗 `trip:<tripId>` 但漏咗 `settings:app-settings` 嘅問題。依家會同步寫入 settings 並 queue 兩者，確保本地同 Supabase/Notion 雲端同步時 activeTripId 唔會錯配。
- **兩階段 AI 行程重整與提取 (Two-stage Trip Update)**：重構咗 Trip Update 嘅 AI 流程。依家會分兩步行：
  1. 第一步先叫 LLM 整理 raw input，產出一個 day-by-day 嘅 `organizedItinerary`；
  2. 第二步再將重整後嘅 itinerary 丟俾 LLM 提取 `trip.itinerary` 結構化欄位。
  - 界面新增咗 `AI 重整行程` 預覽，等 Boss 確認重整版無錯先 apply。
  - 前端唔再依賴舊嘅單次一體化 `/trip/intelligence` 路由，完全走 provider JSON 路由，保留 fallback 機制。
- **行程 Parser 硬化與 Markdown 表格支援 (Markdown Table Extraction)**：優化咗 parser 對各種花里胡哨排版（例如 Markdown 標題、Pipe 表格、`<br>` 分隔符、中英文日期、純時間表等）嘅提取能力，即使 LLM 失敗或回傳為空，local parser fallback 依然能完美抽取出 8 日行程同景點/酒店。
- **Mimo v2.5 Pro 支援同速度優化**：
  1. 前端 AI Model Selector 加入 `Mimo v2.5 Pro` (`mimo/mimo-v2.5-pro`)，共用 Mimo API 密鑰同路由。
  2. 針對 Credential Broker 中 Mimo (/mimo/json) 的載入效能進行優化，預設停用思維思考路徑 (`thinking: { type: "disabled" }`)，關閉 `stream` 並限制 `max_tokens`。
  3. 優化後 Mimo 8日行程提取時間由 40s+ 縮短至 22s 左右（不過 Google Gemini 依然以 6s 保持最快速度）。

### 9. 🤖 移除 Dashboard Broker AI Assistant (2026-06-11 新增)
- **Home 頁面極致簡化**：遵循 Boss 簡化首屏嘅要求，將原本位於 Dashboard / Home 頁面嘅 `Broker AI Assistant` 面板（問答 card）徹底移除，包括對應嘅 input、狀態變數同 handle 邏輯，減少首頁複雜度。
- **清理相關樣式同測試**：
  1. 刪除咗 `compact.css` 裡面所有關於 `.dashboard-broker-assistant` 嘅 layout 同裝飾 CSS，保持樣式表乾淨。
  2. 同步清空 `dashboard-parity-smoke.spec.cjs` 裡面針對 `Broker AI assistant` 嘅 Playwright 測試案例，避免 CI 門檻報錯。
### 10. ⏱️ Trip Update AI 深度硬化 — Duration/TimeEnd、建議捕獲、Geo 擴展 (2026-06-11 新增)
Antigravity 同 Codex 協作完成咗 Trip Update AI 嘅深度強化：
- **Duration 解析同 TimeEnd 計算**：新增 `parseDuration()` 同 `computeTimeEnd()` helper。Tab 表格嘅 `建議停留` 欄位（例如 `30–45分鐘`）會自動取平均值計算 `timeEnd`，Timeline tab 依家會顯示 `09:00 – 09:38` 時間範圍。
- **建議捕獲**：`建議：` 開頭嘅行會儲存做 `ItineraryDay.note`，Settings AI 確認 Modal 會顯示 `💡` 建議提示。
- **GEO_DICTIONARY 大擴展**：由 9 個位置擴展到 32 個濟州島位置，涵蓋交通（城山浦港）、酒店、濟州市區（東門市場、七星路、道頭洞）、西歸浦（山茶花、正房瀑布、天地淵、偶來市場）、城山/東部（涉地可支）、涯月/西北，同特定 cafe/餐廳。
- **LLM Timeout 提升**：8s→15s、9s→12s、14s→25s、25s→30s，減少慢 model（如 Mimo）timeout 失敗。
- **Organized Itinerary 截斷提升**：5K→12K chars，避免長行程被截斷。
- **Google 單階段捷徑**：Google model 跳過 organize stage 直接做 extraction，省一次 LLM call。
- **mergeTripDrafts**：LLM 同 local parser 結果合併——如果 LLM 返回嘅日數少過 local parser，會從 local draft 補返缺失嘅日數同景點。
- **48 個 Unit Tests**：`app-compact/scripts/test-local-parser.mjs` 覆蓋 tab 解析、pipe 表格、純文字、`computeTimeEnd` 邊界（午夜 wrap、零 duration、空 input）同 `parseDuration` 邊界。

---

## 🗂 重點檔案地圖
- `index.html`: Legacy 主程式 (~10,000 行，已全面剔除 Zhipu，升級為 Kimi-first connections/voice/OCR fallback)。
- `legacy-notion.js`: 由 index.html 抽離 the legacy Notion sync module，要 keep 住 compatible。
- `app-react/`: 新版 React 18 + Vite + TS 專案，已 100% 編譯通過。核心 AI 調用在 `src/lib/ai.ts` 與 `src/lib/credentialBroker.ts`。
- `email-to-notion.gs`: 後端 Apps Script。已全面更換為 Kimi 接口與 OpenAI 格式 retry，並實現 PropertiesService 查重防重複機制。
- `workers/credential-broker`: Cloudflare Worker 項目。`wrangler.jsonc` 包含 `KIMI_PROXY_URL` 配置，`src/index.js` 將設備 TTL 縮短至 90 天以硬化安全。
- `HANDOVER.md`: 最 update 嘅狀態同 next steps，每次完 session 都要 update。
- `CLAUDE.md` / `AGENTS.md`: 其他 agent 嘅指引 (Antigravity 亦需要互通參考)。

## 💡 Antigravity 執行細則
我係 Google Deepmind team 訓練嘅最強 Agentic Coding Assistant。我會確保每次行動都用最 specific 嘅 tool，並且確保 code 品質與 security 符合 Boss 嘅高標準！💪🚀✨
