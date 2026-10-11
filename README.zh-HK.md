# Travel Expense App

[English](README.md) · **繁體中文（廣東話）**

旅行記帳網站，幫你整理收據、行程、預算同分帳。每個旅程分開保存。**Compact** 係主要公開 app；React 係使用相容資料格式嘅平行版本。

## 打開 App

- [Compact（主要 app）](https://travel-expense-compact.vercel.app)
- [GitHub Pages Compact](https://jd92-beep.github.io/travel-expense/compact/)
- [React app](https://travel-expense-react.vercel.app)
- [GitHub Pages React](https://jd92-beep.github.io/travel-expense/react/)
- [Admin Console（只供管理員）](https://travel-expense-admin-kanban.vercel.app)

[GitHub Pages 首頁](https://jd92-beep.github.io/travel-expense/) 會轉去 Compact。回報問題時，請提供 Settings 顯示嘅版本。原始碼版本同線上版本可能唔同；README 唔係部署成功證明。

## 第一次使用

1. 用自己嘅 email 登入，或者按 **使用 Google 帳號登入**。使用 email link 嘅話，請去 inbox 開啟登入連結。
2. 跟首次使用指引建立旅程，填名稱、目的地同日期。
3. 設定預算同貨幣。有同行者就加入旅伴姓名同分帳比例；最初會有 `User 1`。
4. 新增開支，檢查內容後儲存。
5. 去 **紀錄**，確認開支出現喺正確旅程。

每個人用自己嘅登入帳號。分帳旅伴只用嚟計數，加入旅伴唔等於授權另一個 app 用戶存取旅程。

## 每日使用

| 分頁 | 用途 |
| --- | --- |
| 首頁 | 揀目前旅程，睇預算、今日支出同行程。 |
| 記帳 | 拍收據、揀相、貼 email、手動或語音輸入。 |
| 紀錄 | 搜尋、篩選、檢查同修改開支。 |
| 行程 | 睇每日地點、時間同相關開支。 |
| 天氣 | 揀日期同地點，睇逐時預報、來源同更新時間。 |
| 統計 | 睇總額、分類支出同分帳。 |
| 設定 | 管理旅程、匯率、AI、同步、主題同備份。 |

新增或同步前先揀啱旅程。儲存收據前檢查店名、日期、時間、幣種、金額、付款方式、付款人同分帳；AI 結果係草稿，可以需要修正。

### 匯率同計數機

匯率方向係 **1 HKD = N 單位目的地貨幣**。

- **設定 → 匯率設定** 可以揀即時或固定模式，再按確認。只輸入數值唔會套用；即時更新失敗會保留原設定。
- 記帳右上角 **匯率** 視窗亦可以轉模式、輸入同採用固定匯率。來源資料放喺 Settings。
- 輸入方式下方嘅 **貨幣計數機** 可以用即時或固定匯率雙向換算。計數機內嘅臨時匯率唔會修改已確認設定。
- 收據編輯器會顯示使用中嘅匯率。揀 **鎖定匯率** 就可以輸入該張單嘅匯率，或使用可用嘅預設值。手機上日期／時間、類別／支付、付款人／分帳會並排。
- 更改 app 匯率設定唔會重寫已儲存收據嘅入帳匯率同港幣金額。

### 行程同天氣

可以貼上行程、酒店、餐廳、交通或 booking 文字俾 Trip Update AI。確認預覽嘅日期、地點同缺漏欄位後先套用。

天氣按所選旅程日期同地點顯示；有對應資料時，逐時欄會自動揀當地相同鐘數，亦可以手動轉時段。實測、每日預報、逐時模型各自標示來源同新鮮程度；支援地區優先用官方資料，缺漏欄位可以用已標示嘅後備來源。冇資料嘅日期或欄位會清楚顯示。使用裝置位置需要你主動按掣同授權。

### AI 模型

喺 **設定 → AI 模型選擇**，先打開工作類別，再打開 provider 揀模型。類別標題直接顯示目前模型。

- 自動圖片：Muse Spark Contributor → MiMo-V2.6-Flash。
- 自動文字：免費 Nemotron 3 Super → North Mini Code → Apodex Mini → 付費 Qwen3.7 Flash。
- 指定模型只嘗試該模型；錯誤會顯示。`429`、quota、daily-limit 會停止轉用其他模型。
- 連線測試用指定模型、冇 fallback，最多八個 output tokens；Muse Contributor 必須用 16 個。正常工作使用獨立輸出預算。

需要憑證嘅 AI 呼叫經 server-side Credential Broker。唔好將 API key 放喺公開前端或備份。AI 暫時唔可用時仍然可以手動記帳。

### 外觀主題

Settings 嘅 **外觀主題** 可以揀 **自動（依旅程）**，或者固定用某個地區／風格主題。現有選擇包括 light 同 dark；選擇即時保存，手動主題切換旅程後仍保留。Compact 主題 UI 同 React 獨立。

### 同步同旅程共享

Supabase 係主要共享資料庫；Notion 係可選副本。

- Personal Notion 要連自己嘅 database，並按目前旅程同步。未連接時只顯示 Supabase 同步係正常。
- App members 同分帳旅伴係兩回事。Owner/Admin 管成員；editor 按權限編輯；viewer 只讀。
- 共享收據先經 Supabase RPC 儲存，再由 server-side job 寫 Notion。一般同行者唔需要共用 Notion token。
- 留意同步錯誤；version conflict 或用盡重試次數嘅工作需要處理。

未完成嘅整合驗證見 [HANDOVER.md](HANDOVER.md)。本機測試通過唔等於 production 同步完成。

## 匯出同還原

喺 **設定 → 資料管理 → 下載旅程資料**：

1. 預設下載純資料 ZIP；想包括圖片就勾 **連同收據圖片下載**。
2. 下載後解壓整個 ZIP。
3. 開 `summary.html` 睇離線／列印報告，或用 Excel／Numbers 開 CSV。

ZIP 包括目前旅程嘅開支、品項、付款分帳、旅伴、行程、圖片清單同 JSON 備份。圖片遺失、下載失敗或改用縮圖都會標示，文字仍可下載。亦可獨立下載 CSV 同 JSON。

JSON 還原先有預覽，會移除憑證、雲端 ID、過期或外來旅程連結。還原只處理文字，唔會自動附回 ZIP 圖片。下載可以包括私人紀錄，請私下保存。詳見 [匯出格式](docs/compact-export-format.md)。

## 常見問題

- 睇唔到記錄：先檢查登入 email 同目前旅程。
- AI 唔可用：睇錯誤提示，處理限額／供應商問題前可先手動輸入。
- 即時匯率失敗：原設定會保留；檢查網絡後再試。
- Notion 冇同步：檢查自己嘅連接同目前旅程。
- 畫面或版本異常：重新載入一次；仍有問題就提供 URL、版本、分頁同裝置大小。
- 共用裝置：需要移除帳號暫存時用 app 嘅清除此裝置資料功能，再登出。

## 開發者快速開始

Compact 嘅 package 指定 Node.js **22.x**：

```bash
git clone https://github.com/jd92-beep/travel-expense.git
cd travel-expense/app-compact
npm ci
npm run dev
```

打開 [本機 Compact](http://localhost:8903/travel-expense/compact/)。本機啟動唔會自動建立登入或 provider 後端；憑證留喺批准使用嘅 server-side broker/vault。

```bash
npm run typecheck
npm run build
npm run security:scan
npm run smoke:scan
npm run smoke:settings
npm run smoke:weather
npm run smoke:dashboard
npm run smoke:ai-routing
npm run smoke:mobile-layout
```

Smoke wrapper 會開隔離本機 server，Playwright 阻擋冇 mock 嘅外部 host。未裝 Chromium 就先跑 `npx playwright install chromium`。揀同改動相關嘅 smoke；更多指令見 [Compact README](app-compact/README.md) 同 [架構](app-compact/ARCHITECTURE.md)。

React 版本喺 `app-react/` 跑 `npm ci` 同 `npm run dev`，用 [本機 React](http://localhost:8902/travel-expense/react/)。兩個 app 獨立版本管理，共享資料格式改動需要跨端檢查。

## 發佈同維護

完整目錄說明見 [英文版 Repository map](README.md#repository-map)。GitHub Pages 由 `main` 建置：Compact 喺 `/compact/`、React 喺 `/react/`，首頁轉去 Compact。Vercel 有獨立目標；Admin production 用受保護、明確手動觸發嘅 workflow。舊 Netlify 設定仍留喺 repo，唔係建議公開入口。

Push 去 `main` 可能觸發部署。Push、merge、deploy 前要有 repo 擁有人明確授權；之後驗證 source SHA 同線上 app。改 app 要同步更新 `APP_VERSION`、package 同 lockfile 版本。資料庫 migration、Admin writes 同憑證改動需要另外授權目標。

維護前睇 [AGENTS.md](AGENTS.md)、相關 app 架構同 [HANDOVER.md](HANDOVER.md)。唔好 commit secrets、`.env`、私人匯出資料、部署產物或本機 graph index。
