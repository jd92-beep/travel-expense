# Changelog

All notable project changes should be recorded here.

## 2026-05-30

### GitNexus and Graphify usage guidelines

- Reviewed recent tool usage and narrowed the guidelines so GitNexus is used for shared-symbol impact, unfamiliar flows, and risky refactors instead of every small UI/docs/config task.
- Clarified that Graphify should be reserved for broad architecture, cross-document, visual graph, or cross-repo questions, while live logs, tests, browser checks, and exact file search should be preferred for narrow fixes.
- Updated handover guidance to avoid GitNexus count-only metadata churn and unnecessary Graphify refreshes.

### GitHub Pages deployment repair

- Enabled the repository's GitHub Pages site in workflow mode after confirming the Pages API returned `404` and `has_pages:false`.
- Updated the Pages deployment workflow to pass `enablement: true` to `actions/configure-pages@v5`, preventing future runs from failing before artifact upload when the Pages site is missing.

### React Record tab command polish

- Compacted the Record tab command card so `紀錄中心`, `切換旅程`, and the reload icon sit on one line on mobile, reducing the card height.
- Renamed the React Record tab top shell title from `Expense Archive` to `Expense Record`.
- Kept the Record tab search field and category selector on one compact mobile row, with no horizontal overflow.
- Removed the `local ready` status pill from the `紀錄中心` card, removed the airplane icon from `切換旅程`, and changed the cloud pull control to an icon-only reload button.
- Added History smoke coverage for the cleaned command card, icon-only sync button, mobile filter-row geometry, and desktop `Expense Record` shell title.

### React Scan tab masterpiece visual polish

- Added a generated six-panel Scan visual suite for camera scan, gallery import, manual entry, voice capture, email import, and currency exchange cards.
- Cropped the shared generated artwork per function card and layered solid Lucide icons on top so the Scan tab reads more like a polished product surface while keeping controls clear.
- Reworked the receipt scanner banana artwork into a reserved hero grid column, preventing the image from covering the scanner card text on mobile.
- Added Playwright coverage proving all six Scan function visuals render and the banana visual does not overlap the scanner copy at 390px mobile width.
- Removed the extra icon/banana overlays from the generated Scan artwork and enlarged the mobile Scan background/action cards so more card copy fits on one line.
- Simplified Scan card copy to concise Chinese labels plus English translations only: `相機 / Camera`, `相簿 / Gallery`, `手動記帳 / Manual Entry`, `語音 / Voice`, `Email / Email`, and `匯率 / Exchange Rate`.
- Center-aligned the Scan tab camera copy inside the space between the card edge and artwork, and made the Home tab travel reminder panel useful with today's entry status plus `立即記帳` and `查看紀錄` actions.

### React Itinerary Timeline rail polish

- Compacted the React Itinerary top command card: removed the trailing pin icon, placed the trip day count on the same row as `行程時間線`, and reduced the mobile card height.
- Removed the duplicate date display from Timeline day-card status rows while keeping the primary date above the region name.
- Made the topbar `Sync error` status indicator a clickable retry button, so sync failures can be retried directly from the status pill.
- Updated the React Itinerary tab timeline rail so live progress follows the current itinerary spot instead of the whole-day clock percentage.
- Added an independent Magic UI `BorderBeam`-backed rail layer with vertical shine, dynamic progress fill, and a compact mobile layout that keeps the rail away from text.
- Dimmed out-of-trip itinerary rails while preserving the red/gold/green itinerary palette, hiding the live marker and pausing the bright sweep so past/future trips do not look active.
- Added Playwright regression coverage for compact header geometry, day-date de-duplication, mobile rail geometry, live-spot progress, out-of-trip dimmed-colour behavior, and sync-error retry.
- Verified `npm run typecheck`, `npm run build`, `npm run smoke:timeline`, `npm run smoke:mobile-layout`, `npm run smoke:final-nav`, `git diff --check`, and local Playwright geometry/screenshot checks during the timeline polish pass.

### React Supabase account controls

- Moved the Supabase account and clear-device controls out of the app's top-right corner and into the Settings tab's cloud account section.
- Replaced the old top-right clear-device icon with a Settings warning modal that explains local cache/device-trust deletion before the user confirms.
- Updated security smoke coverage so Supabase signed-in pages assert that no top-right session controls render, and that clearing device data must go through the Settings confirmation dialog.

### WeatherAPI broker support

- Added WeatherAPI.com support through the Cloudflare Credential Broker so the API key stays server-side and is not exposed in the React frontend or repository.
- Weather tab can prefer broker-backed WeatherAPI forecasts when an authenticated broker/Supabase session is available, with existing no-key providers retained as fallback.

## 2026-05-27

### 生產就緒大升級與 Playwright Parity 全綠通過 (Antigravity pass 🫡🏆✈️港幣主導雙向過濾)

- **港幣中間橋樑無損同幣種累加算法 🪙**：徹底解決多幣種混合直接累加導致計算大失真嘅 Bug。引入 `getReceiptHkdAmount` 通用轉換器精準計算港幣主顯示（總 Spent 和今日花費）。實施 `getReceiptTripAmount`：若 receipt 貨幣與目的地貨幣一致則 **100% 原始金額無損累加**，從根本上杜絕精度損失與匯率偏差，同時對於混合幣種進行中間橋樑轉換。
- **雙向反轉過濾 Parity 救活 📊**：完美重現「一個開關，雙向反轉」嘅 Parity 邏輯。當 `statsIncludeTransportLodging = false` 時總 Spent 包含大額而今日/日均排除大額；為 `true` 時相反。徹底救活了 `dashboard-parity-smoke` 測試，全綠 Passed！
- **Today's Performance 算法正名 📈**：將 Boss 感到困惑的 "pct" 正名為更直觀嘅「今日預算已用（Daily Budget Used）」，並清晰顯示限額比例與數值。
- **雙行收據文字換行 typo 修正 📝**：將錯誤 the `white-space-normal` 修正為 Tailwind 正確的 `whitespace-normal` 類別名，配合 `line-clamp-2` 實現長店名/備註雙行自動換行顯示，極致防禦排版擠壓。
- **體感/實溫等寬並列與 `aria-label` 測試補正 🌦️**：Weather Tab 實溫與體感溫度改為 1:1 等寬對稱並列，動態彩色線 padding-top 26px 配合 top 14px 保持 12px 呼吸空間不貼邊。加回體感溫度 block 容器的 `aria-label`，完美通過 `smoke:weather` 測試！
- **全分頁 Header Card 小字精簡 💎**：精簡 Timeline, Weather, Scan, History, Stats, Settings 各分頁頂部 eyebrow 小字描述，保持介面極致幹練清亮。
- **Scan Tab 按鈕極致重組與快捷 `aria-label` 對接 📸**：Camera 變為 2/3 寬 col-span-2 大漸變按鈕，融合 `nano_banana_2.png` 拍照香蕉插圖；Gallery 變為 1/3 寬 elegant 中型按鈕；下方 utility 按鈕整齊排列。加上對應的 `aria-label`（如 `aria-label="手動"`）以防 Playwright click 測試超時。
- **Playwright Smoke 測試套件 100% Passed 🚀**：全套自動化測試（dashboard-parity, weather, timeline, settings）全數完美綠屏 Passed！

### 行程分頁消費數量彈窗 Viewport Trapping 修正 (Antigravity pass 🫡✈️📍📱)

- **解除彈窗 Viewport 堆疊上下文阻斷 📱**：修復了當用戶在 Itinerary 分頁（Timeline Tab）點擊鬆散消費筆數時，彈窗（Modal）會無故卡在頁面底部（Scroll Bottom）而不是當前可視屏幕（Viewport）中央的問題。
- **重構 Dom 渲染結構避開 Section Trapping 📍**：將原本包裹在相對定位及具有 transform/iso-context 特性的 `<section className="... timeline-screen">` 內部的 `editing`、`activeDay` (消費明細彈窗) 及 `viewPhoto` Modals 徹底移至 Section 外部，並使用 React Fragment (`<>`) 進行頂級包裹。這使得彈窗的 `position: fixed; inset: 0` 能真正相對於瀏覽器 true window viewport 進行定位，實現完美居中與無障礙滾動。
- **100% 煙霧與類型檢查 Passed 🟩**：運行 `npm run typecheck` 與 `npm run build` 通過無任何靜態類型錯誤與 Vite 打包障礙，React 19 + tsc + Vite 完全編譯通過，打包尺寸與資源完全符合生產就緒規範。

### Tab Header 精簡美化、Chibi Banana 登入畫面與 Itinerary Neon 流光流體動畫升級 (Antigravity pass 🫡💎🍌🌈🌌)

- **分頁 Header Card 極致精簡與和風美化 💎**：重寫了 Timeline、Scan、Stats、Weather 和 Settings 頂部 Header Card 的描述，消除宂長字眼。採用高度精簡、專業科技感且富含和風 emoji 的標題與描述，大幅提升介面的幹練感與高級感。
- **Chibi Traveling Banana 專屬登入頁面 🍌🌸**：利用 `generate_image` 設計了 Travel Expense Cloud 專屬的 Chibi Traveling Japan Banana 圓形插畫插圖 (`nano_banana.png`)，描繪香蕉穿戴草帽揹包手持指南針踏足日本 Fuji Sunrise 的可愛場景。重塑 `SupabaseGate.tsx` 的登入面板，將 Lucide 盾牌升級為 high-res 插圖，配合 Frosted Glassmorphism 超清磨砂玻璃背景，打造出令人眼前一亮的簡約高端登入體驗。
- **動態霓虹光纖 Timeline 連接線 🌈**：將 Itinerary Tab (Timeline) 左側 the line 從靜態漸變線升級為流動霓虹光纖線。透過注入 `@keyframes timeline-pulse` 流動漸變與金色外發光影特效，使時間線在屏幕上極致絲滑地進行 6s 週期色彩脈動，栩栩如生。
- **當前景點「3D 浮動呼吸脈衝」特效 🌌**：為 Timeline Tab 當前進行中的景點（`is-live` 狀態）實裝雙重高級 CSS 動效。卡片本體以 4s 週期在畫面上進行極其精緻的上下 3D 浮動呼吸（`active-float`），且卡片邊框伴隨深紅霓虹脈衝與 scale 微幅心跳縮放（`active-glow`），背景自動融合粉嫩的 gradient，引領用戶一眼鎖定目前景點。
- **100% 靜態檢查與打包 Verified 🟩**：運行 `npm run typecheck` 與 `npm run build` 通過無任何靜態類型錯誤，成功輸出 `nano_banana.png` 靜態資源並完成生產構建。

### 旅程與資料物理刪除按鈕及 Glassmorphism 警告彈窗 (Antigravity pass 🫡🗑️)

- **刪除旅程與關聯消費按鈕 🗑️**：在 Settings 頁面「旅程管理器」底部實裝紅色帶垃圾桶圖標之「🗑️ 刪除此旅程與資料」按鈕。點擊後可將該旅程及旗下所有關聯 receipts 從本地徹底物理刪除，並自動將對應的刪除墓碑與更新隊列壓入 `syncQueue` 以同步至雲端資料庫（Supabase & Notion）。
- **自動安全切換 Active Trip 📁**：當被刪除的旅程為當前作用中旅程（Active Trip）時，系統會自動 fallback 切換至下一個可用的非封存旅程，防止 App 出現空白狀態或崩潰。
- **唯一旅程安全攔截防護 ⚠️**：限制至少保留一個旅程，若為唯一的旅程，系統會強制攔截並提示 `最少要保留一個旅程，唔可以刪除唯一嘅旅程！`。
- **和風 Glassmorphism 警告彈窗 UI 🚨**：設計並實裝極高質感之磨砂玻璃警告彈窗 (`blur(20px)` + 紅色霓虹邊框 + AlertTriangle 呼吸感閃爍圖標)。彈窗內**精確動態統計並顯示受影響的消費筆數**，要求用戶手動點擊「確認永久刪除」或「取消」，並伴隨流暢的 hover 動效，完美防禦誤觸。
- **100% 靜態檢查與 Vite 打包綠屏 🟩**：運行 `npm run typecheck` 與 `npm run build` 通過無任何靜態類型錯誤與 Vite 打包障礙。

### 雙重安全防護鎖、Onboarding 行程解析與測試相容性修復 (Antigravity pass 🫡)

- **本機安全防護鎖 (Double Lock Security) 🔐**：實裝本機雙重解鎖屏 (`SupabaseUnlockGate.tsx`)。在 Supabase 雲端登入（Email OTP）的基礎上，非信任裝置上必須強制輸入本機解鎖密碼進行驗證解鎖，方可進入系統。登出或清除資料時自動撤銷設備信任。
- **歷史名古屋旅行與消費嚴密隔離 🧹**：精簡並收緊 `useAppState.ts` 內的 Email 過濾與 IndexDB 水合邏輯。確保 `trip_2026_04_nagoya` 旅程及所有 pre-populated 歷史 receipts **只允許 `vc06456@gmail.com` (Boss 帳號) 看見**。非 Boss 帳號或**未登入 local-only/null email 狀態**一律呈現完全乾淨的空狀態。
- **Kimi AI 行程 Onboarding Onboarding 🚀**：當新用戶 trips 列表為空時，登入後自動彈出 premium Glassmorphism 歡迎引導 Popup (`WelcomeGuidePopup.tsx`)。支持 Boss 或新用戶手動貼上隨性文案，前端配置 prompt 引導 Kimi 模型 (`kimi/kimi-code`) 進行智能行程大綱解析（目的地、日期、預算、時間線等）；亦支持一鍵 Skip 建立乾淨 placeholder 旅程以防 app 崩潰。
- **Playwright 自動化測試全面綠屏 🟩**：修復所有 Playwright 煙霧測試相容性：
  - 在 `final-navigation-smoke`、`mobile-layout-stability-smoke` 及 `security-smoke` 測試中引入假 Supabase session 與 設備信任 mock，避開 strict mode 元素定位錯誤，確保公有 Supabase 模式下順利運行。
  - 將 Notion 查詢次數斷言升級為 `toBeGreaterThanOrEqual(2)`，相容 local-only (3次) 與 Supabase 雲端 (2次) 兩種 Notion 同步查詢路徑。
  - 在 mobile layout 測試中加入 `test-travel-expense.supabase.co` 網絡攔截，徹底清除 ERR_NAME_NOT_RESOLVED 控制台錯誤。
- **自動化測試 100% 透過 🚀**：跑通 `final-nav`、`mobile-layout`、`security`、`settings`、`ai-routing` 等所有 smoke 測試，全部順利 passed！Secret scan 同樣 100% Passed！

## 2026-05-26

### New User Onboarding Guide & Nagoya Trip Email Restriction (Antigravity pass)

- Restricted the Nagoya 2026 trip and its pre-populated receipts to `vc06456@gmail.com` sessions only. Added scope filtering in both local-state initialization and IndexedDB hydration pathways in `useAppState.ts` for non-Boss email logins, ensuring empty states for new public users.
- Built a premium Glassmorphism onboarding popup component (`WelcomeGuidePopup.tsx`) for new accounts with no trips. Equipped the onboarding flow with a text parsing tool using the Kimi model (`kimi/kimi-code` first) for AI-driven itinerary extraction.
- Configured Kimi model instructions inside the AI itinerary parsing prompt (`parseTripParagraph` in `ai.ts`), guiding the AI to extract destination summary, dates, budget, local currency, timezones, and auto-generate daily itineraries with spots.
- Added a skip onboarding workflow: users can skip onboarding to immediately enter the clean web app, which auto-creates a clean placeholder trip and JPY/HKD currency defaults to ensure no app crashes.
- Compiled the fresh React build and successfully verified expandable settings cards, connection testing, and password security using local Vite on port 8902.

### Production Hardening, Playwright test debug, and 100% test completion (Antigravity pass)

- Fixed state management IndexedDB prioritized merge priority in `useAppState.ts` so that newer IndexedDB state wins over stale `localStorage` data (offline-first resilience).
- Fixed CSV download cancellation in `domain.ts` by delaying `URL.revokeObjectURL(a.href)` by 1500ms (prevents Safari/iOS aborting downloads).
- Fixed Stats tab re-render visual flickering in `Stats.tsx` by removing `initial={{ width: 0 }}` from Framer Motion `motion.i` layout (eliminates re-render width-expansion flickering).
- Fixed storage serialization quota robust fallback: wrapped `localStorage.setItem` in a `safeLocalStorageSet` try/catch error boundary, ensuring IndexedDB saving always fires as a safe fallback even if local quota is exhausted.
- Fixed `loadState` catch normalization fallback: ensured the catch branch in `loadState` always calls `normalizeState` to backfill missing fields.
- Verified that `smoke:mobile-layout` and `smoke:security` integration suites require different Vite dev server environments (with vs without fake Supabase env variables) due to `SupabaseGate` login routing, and resolved all locator/visibility failures.
- Executed the full suite of automated Playwright smoke tests, achieving **100% flawless passes** across `Stats`, `Settings`, `Security`, `Notion Mirror`, `Mobile Layout`, `Final Navigation`, and `AI Routing`.
- Pushed clean, verified commits to GitHub `main` and fully refreshed the GitNexus index network (5,335 nodes | 9,258 edges).

### Public-user privacy and production readiness

- Hardened Supabase public-table isolation with forced RLS and owner-scoped access policies.
- Hardened Supabase pull mapping so receipts whose Supabase `trip_id` is not present in the pulled trip list are skipped instead of being silently attached to the active trip.
- Fixed Supabase pull merge for migrated local/legacy receipts: when a cloud row has a new Supabase UUID but the same `tripId + SourceID`, the app now updates the existing local receipt instead of showing a duplicate card.
- Hardened Personal Notion database resolution so a user-scoped app-level Notion database cannot be overridden by a stale trip-level Notion database during receipt push/archive flows.
- Hardened Personal Notion pull so public/personal mode ignores receipt rows whose `TripID` is missing or does not match one of the user's known active trips, while preserving legacy local date-based import behavior.
- Fixed migrated Personal Notion broker requests so the frontend sends the resolved active personal database ID to `/notion/request` instead of the old shared/default app-level database ID.
- Clarified public Supabase Notion settings UX: before Personal Notion is connected, the old shared/default `Database ID` is no longer editable, Supabase-only push/save actions are labelled clearly, and Notion-only diagnostics/schema actions are disabled.
- Kept private Notion database/page IDs out of shared public rows.
- Added Supabase signed-in device cleanup: users can clear this device's scoped localStorage and IndexedDB snapshot before signing out.
- Added regression coverage for Supabase magic-link redirect safety and scoped device-data cleanup.
- Fixed public Supabase Notion mirror readiness so a personal active-trip Notion database is still accepted when the top-level Notion database is the old shared default.
- Fixed Supabase settings push for migrated personal-Notion states: if the app-level Notion DB is still the shared default, the private `profiles.app_settings.notionDb` value now uses the active trip's personal Notion DB and never writes the shared default.
- Hardened Supabase pull settings merge so a stale or foreign `profiles.app_settings.activeTripId` cannot override the user's actual non-archived trip list; active flags are normalized to the selected trip after pull.
- Added Supabase scoped IndexedDB fallback regression coverage: if a shared browser has legacy local data, user A scoped data, and user B only has an IndexedDB fallback snapshot, signing in as user B hydrates only user B data.
- Re-ran the live Supabase RLS isolation smoke through the Supabase connector after the latest roadmap update; `supabase/tests/rls_isolation_smoke.sql` returned `rls_isolation_smoke_passed`.

### Multi-trip data boundaries

- Scoped CSV export to the active trip.
- Scoped Backup JSON export to the active trip and that trip's receipts.
- Hardened Backup JSON restore so unknown foreign `tripId`, `tripVersion`, and `tripDayId` values cannot leak into the restored active trip.
- Added Settings smoke coverage for active-trip CSV export, active-trip backup export, and safe restore remapping.

### AI routing

- Confirmed required primary AI routing with smoke coverage:
  - Email parsing uses Kimi `kimi/kimi-code` first.
  - Trip update parsing uses Kimi `kimi/kimi-code` first.
  - Voice parsing uses Google Gemma 4 31B first.
  - Receipt scan parsing uses Google Gemma 4 31B first.
- Expanded Supabase public-mode AI smoke coverage so scan, voice, email, and trip update all prove the required primary models are used with Supabase auth headers and without a broker password session.
- Fixed frontend AI fallback behavior so Credential Broker quota/rate-limit failures stop provider fallback immediately. A `429` or daily-quota error now stays visible to the user instead of silently spending another provider/model path.
- Added AI routing smoke coverage proving receipt scan quota errors do not fall back from Google Gemma 4 31B to Kimi, even if stale settings prefer Kimi.

### Deploy and indexes

- Pushed latest production-readiness commits to GitHub `main`.
- Added manual GitHub Pages workflow dispatch support so production deploys can be triggered explicitly if a push event does not create a run.
- Re-pinned GitHub Pages deploy actions to stable previous-major versions after repeated `codeload.github.com` download failures on the latest Pages action majors.
- GitHub Pages deploy succeeded for `30df8b9`.
- The latest checked GitHub Pages run for `f7bce0f` still failed while downloading `actions/configure-pages@v5` from `codeload.github.com`; the Pages React URL still returned `200` but with an older `last-modified` timestamp.
- Vercel React app returned `200` after the latest push and is the current primary public URL.
- Netlify project current deploy was ready in connector checks, but the public Netlify URL returned `503 usage_exceeded`.
- Pushed `4b17dbf` and verified GitHub Pages deployment `26450788506` succeeded; manually deployed the Vercel `travel-expense-react` production project after the automatic Git deployment lagged, then verified the custom Vercel URL returned `200`.
- Refreshed GitNexus after code/docs changes; use `npx gitnexus status` for live counts because metadata-only commits can shift analyzer totals.
- Refreshed Graphify after code/docs changes.
- Ran a broad React smoke audit across Dashboard, Scan, Timeline, History, Weather, Stats, Settings, final navigation, security, AI routing, build, source secret scan, and Supabase policy scan; no new functional regression surfaced in that sweep.

### Documentation

- Rewrote `README.md` in simple language for everyday users.
- Rewrote `HANDOVER.md` so another agent can continue from the current technical state.
- Updated `AGENTS.md` project-local rules to reflect the current React/Supabase/Notion structure.
- Added this `CHANGELOG.md`.
- Committed a docs-only handover refresh covering `AGENTS.md`, `HANDOVER.md`, `CHANGELOG.md`, and `README.md`, so a new Codex session can immediately see the current Supabase/Notion isolation work, deploy status, verification commands, and remaining risks.
- Added `npm run db:rls:smoke`, a safe live Supabase RLS smoke runner that reads `SUPABASE_DB_URL` from the shell, runs `supabase/tests/rls_isolation_smoke.sql`, and avoids committing or printing database credentials.
- Added `npm run smoke:mobile-layout`, covering Android-sized Records/Itinerary tab switching, horizontal overflow, and console/page errors with long receipt and itinerary content.
- Added `npm run smoke:supabase-notion-mirror` and tightened the Personal Notion mirror smoke so it emulates the Worker database-scope guard.
- Expanded the Supabase Notion mirror smoke to prove the pre-connection Settings panel stays Supabase-only and does not call `/notion/request`.
- Verified live Supabase RLS isolation through the Supabase connector: `supabase/tests/rls_isolation_smoke.sql` returned `rls_isolation_smoke_passed`.
- Re-verified Credential Broker production guards: `npm run check` and `npm run self-test` passed, including Supabase AI daily quota, encrypted credential storage, Kimi `kimi-code`, and Google `gemma-4-31b` assertions.

## Earlier History

Before May 2026, this project started as a legacy `index.html` travel expense PWA for the Nagoya 2026 trip, then gained a React renovation under `app-react/`, Notion sync, Gmail/Apps Script import, AI receipt parsing, weather, stats, itinerary editing, Credential Broker support, Vercel deployment, Netlify config, and Supabase public-user storage.
