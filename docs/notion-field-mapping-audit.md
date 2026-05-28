# Travel Expense ↔ Notion Field Mapping Audit

更新日期：2026-05-17 HKT

## Scope

今次 audit 只做調查同 review，無修改任何 app code 或 Notion data。

覆蓋：

- `index.html` legacy app
- `app-react/src/lib/notion.ts` React app
- `email-to-notion.gs` Gmail / Apps Script 匯入
- live Notion database `旅行記帳`

## Executive Summary

目前 `旅行記帳` database 已經唔係單一 schema，而係同時存在：

- legacy plain property family：`店名` / `金額` / `日期` / `類別` / `支付` / `地區` / `品項` / `備註` / `SourceID` / `HKD`
- emoji property family：`💴 金額 ¥` / `📅 日期` / `🗂 類別` / `💳 支付` / `📍 地區` / `🧾 品項` / `📝 備註` / `🔑 SourceID` / `💵 HKD`
- React extended property family：`Object Type` / `Currency` / `Original Amount` / `Exchange Rate` / `🗺️ 地址` / `🎫 Booking Ref` / `🔒 類型` / `TripID` / `Trip Version` / `Map URL`

三條寫入管線而家冇用同一套 canonical properties：

1. legacy app 主要寫 plain family
2. Apps Script 會寫 `店名`，但其餘大多寫 emoji family
3. React app 主要寫 plain family + extended family

結果：

- 同一頁會同時有 plain 同 emoji 欄位，而且值唔一致
- legacy 同 React 對同一頁會抽到唔同欄位
- 有啲資料根本冇結構化落 Notion，只係塞咗入 `備註` meta line
- `🗓 行程更新` rows 喺 legacy 係 itinerary override，但喺 React 會被當成正常 receipt

## Evidence Snapshot

### Live Notion schema

live schema 同時有以下重覆欄位：

- `金額` 同 `💴 金額 ¥`
- `日期` 同 `📅 日期`
- `類別` 同 `🗂 類別`
- `支付` 同 `💳 支付`
- `地區` 同 `📍 地區`
- `品項` 同 `🧾 品項`
- `備註` 同 `📝 備註`
- `SourceID` 同 `🔑 SourceID`
- `HKD` 同 `💵 HKD`

亦有 React/extended 欄位：

- `Object Type`
- `Currency`
- `Original Amount`
- `Exchange Rate`
- `🗺️ 地址`
- `🎫 Booking Ref`
- `🔒 類型`
- `TripID`
- `Trip Version`
- `Map URL`

### Sample pages checked

- App settings row：
  `https://www.notion.so/35c8d94d5f7c81f2a22cec2d97fcf784`
- legacy/manual-ish receipt：
  `https://www.notion.so/34d8d94d5f7c81b7bb75db42e1503362`
- legacy receipt with tax/subtotal：
  `https://www.notion.so/3488d94d5f7c8155acb2faa82536a3de`
- email-import flight receipt：
  `https://www.notion.so/3478d94d5f7c81beb183ca556bf1232e`
- email-import itinerary update：
  `https://www.notion.so/3468d94d5f7c811aac09d7f198151cc8`

## Mapping Matrix

| App-side field | legacy push -> Notion | React push -> Notion | Apps Script push -> Notion | legacy pull | React pull | Status | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `store` | `店名` preferred, fallback `🏪 店名` | plain-first alias, usually `店名` | `店名` only in current DB | reads schema-resolved title | content-aware title read | `duplicate/conflicting` | title family is less broken because current DB only has `店名` |
| `total` | `金額` / fallback `💴 金額 ¥` from `r.total` | `amount` alias from `Receipt.total` | `💴 金額 ¥` or `金額` from JPY-converted `b.total` | reads mapped amount only | reads first amount-like field with content | `duplicate/conflicting` | same logical field is written to different property families |
| `subtotal` | `小計` / `🧮 小計 ¥` | not written | not written | reads `subtotal` separately | amount fallback can accidentally match subtotal | `lossy` | React can misread subtotal as total if amount missing |
| `tax` | `稅金` / `💸 稅金 ¥` | not written | not written | reads tax separately | not mapped as receipt field | `lossy` | React receipt model has no dedicated tax field in Notion sync |
| `date` | `日期` / `📅 日期` | plain-first alias, usually `日期` | `📅 日期` or `日期` | mapped property only | content-aware date read | `duplicate/conflicting` | live itinerary-update page has different plain vs emoji dates |
| `time` | not stored as dedicated property | `⏰ 時間` / `時間` | not stored as property; packed into note meta line | extracted only from note meta line | reads `⏰ 時間` if present; otherwise not from note meta | `lossy` | legacy manual receipts lose time on push |
| `category` | `類別` / `🗂 類別` | plain-first alias, usually `類別` | mostly emoji `🗂 類別` | mapped property only | content-aware select read | `duplicate/conflicting` | live itinerary-update page has plain=`當地旅遊`, emoji=`其他` |
| `payment` | `支付` / `💳 支付` | plain-first alias, usually `支付` | mostly emoji `💳 支付` | mapped property only | content-aware select read | `duplicate/conflicting` | live itinerary-update page has plain=`信用卡`, emoji=`現金` |
| `region` | `地區` / `📍 地區` | plain-first alias, usually `地區` from `receiptRegion()` | mostly emoji `📍 地區` | mapped property only | content-aware rich text read | `duplicate/conflicting` | React may read emoji region when plain field is empty |
| `address` | not persisted as property | `🗺️ 地址` / `地址` | not persisted as property; packed into note meta line | can only recover from note meta line | reads dedicated property only | `lossy` | legacy and Apps Script do not write structured address |
| `bookingRef` | not persisted as property | `🎫 Booking Ref` / `Booking Ref` | not persisted as property; packed into note meta line | can only recover from note meta line | reads dedicated property only | `lossy` | React-only structured field |
| `itemsText` | `品項` / `🧾 品項` | plain-first alias, usually `品項` | mostly emoji `🧾 品項` | mapped property only | content-aware rich text read | `duplicate/conflicting` | itinerary-update markers and beneficiary prefix can live here |
| `note` | `備註` / `📝 備註` | plain-first alias, usually `備註` | mostly emoji `📝 備註` | mapped property only | content-aware rich text read | `duplicate/conflicting` | Apps Script stores structured meta in note first line |
| `personId` / traveler | `旅伴` / `👥 旅伴` as label text | plain-first alias, usually `旅伴` | not set consistently | mapped property only | content-aware text read | `duplicate/conflicting` | live pages often have plain populated, emoji blank |
| `sourceId` | `SourceID` / `🔑 SourceID` but uses `r.id` not `r.sourceId` | `SourceID` / `🔑 SourceID` from `receipt.sourceId || receipt.id` | mostly emoji `🔑 SourceID`, except store stays plain | mapped property only | content-aware rich text read | `duplicate/conflicting` | live settings row and itinerary-update row prove plain/emoji can disagree or one side be blank |
| `hkd` / `hkdAmount` | `HKD` / `💵 HKD` | `HKD` / `💵 HKD` | mostly emoji `💵 HKD` | mapped property only | content-aware number read | `duplicate/conflicting` | current values are generally recoverable but schema is split |
| `splitMode` | `🔒 類型` only | `🔒 類型` only | not written | reads select | reads select | `correct` | this field is comparatively clean |
| `beneficiaryId` | encoded as first line in `品項` | not dedicated field | not written | legacy strips `🎁 為 ...` prefix | React strips `🎁 為 ...` prefix | `derived-only` | works by convention, not schema |
| `currency` | not written | `Currency` | not written | not available | reads `Currency` | `not persisted` for legacy, `correct` for React | email-import rows lose original currency detail |
| `originalAmount` | not written | `Original Amount` | not written | not available | reads `Original Amount` | `not persisted` for legacy/email | foreign-currency source values are lost outside React-created rows |
| `exchangeRate` | not written | `Exchange Rate` | not written | not available | reads `Exchange Rate` | `not persisted` for legacy/email | React-only extended field |
| `mapUrl` | not written | `Map URL` | not written | not available | reads `Map URL` | `not persisted` for legacy/email | React-only extended field |
| `objectType` | not written | `Object Type=receipt` | not written | ignored | used to skip `trip`, not `itinerary update` | `lossy` | React uses it, legacy does not |

## Per-Pipeline Audit

### 1. legacy app

Code paths:

- write: `index.html` `buildNotionProps()` / `notionPushReceipt()`
- read: `index.html` `notionEnsureSchema()` / `nGet()` / `notionPullAll()`

Observed behavior:

- alias order is plain-first for core receipt fields
- `time` / `address` / `bookingRef` are not written as dedicated Notion properties
- `sourceId` is written from `r.id`, not `r.sourceId`
- `nGet()` does not do content-aware fallback once schema has resolved a property name

Consequence:

- if schema resolves to plain `SourceID` but the live value is stored in `🔑 SourceID`, legacy pull can miss it completely
- same risk applies to `備註`, `日期`, `金額`, `類別`, `支付`, `地區`, `品項`, `HKD`
- app settings row is especially risky because live row has:
  - plain `SourceID` empty
  - emoji `🔑 SourceID=__meta_settings__`
  - plain `備註` empty
  - emoji `📝 備註` contains JSON

Assessment:

- legacy write path is internally consistent for old plain-family rows
- legacy read path is **not robust** against mixed-family rows

### 2. React app

Code paths:

- write: `app-react/src/lib/notion.ts` `buildProps()` / `pushReceipt()`
- read: `app-react/src/lib/notion.ts` `ensureSchema()` / `receiptFromPage()` / `pullAll()`

Observed behavior:

- React writes much richer structured data than legacy:
  - `Object Type`
  - `Currency`
  - `Original Amount`
  - `Exchange Rate`
  - `🗺️ 地址`
  - `🎫 Booking Ref`
  - `🔒 類型`
  - `TripID`
  - `Trip Version`
  - `Map URL`
- React read path is content-aware:
  - if plain alias is empty, it can fall through to emoji alias
  - therefore one React receipt can become a blend of plain + emoji fields from the same page

Consequence:

- React handles mixed rows better than legacy
- but it also turns contradictory rows into plausible-looking receipts instead of surfacing the conflict

Assessment:

- React write path is structurally richer
- React read path is **too forgiving**, so mixed rows can silently become Franken-records

### 3. Apps Script email import

Code path:

- `email-to-notion.gs` `pushToNotion()`

Observed behavior:

- `b.total` is converted to JPY before writing Notion amount
- original currency and original amount are not written to dedicated fields
- address / booking ref / time are not written to dedicated properties
- those values are packed into the first line of `備註` as:
  - `📍 ...`
  - `🔖 ...`
  - `⏰ ...`
- current DB shape makes Apps Script write:
  - `店名` plain
  - most other receipt fields to emoji family

Assessment:

- email import preserves enough for legacy parser to partially reconstruct values
- but it is **lossy by schema**, because structured fields are embedded in note text

## Validation Results

### A. `金額` / `💴 金額 ¥` 是否等於 app `total`

結果：**基本上係 `total`，唔係 `subtotal` 或 `tax`** ✅

Evidence:

- `名鉄観光サービス` live row：
  - `金額=2860`
  - `小計=2600`
  - `稅金=260`
  - 所以 `金額` clearly maps to final total
- legacy editor label 本身都寫明 `金額（legacy total）`
- React `ReceiptEditor` 亦寫 `金額（legacy total）`

Risk:

- React read fallback can mistakenly grab `小計` if amount field is missing and subtotal is the first positive amount-like numeric field

Status：`correct` with fallback risk

### B. 外幣 email/import 記錄有冇流失 `original amount/currency`

結果：**有流失** ❌

Evidence:

- `HK Express UO690 HKG→NGO` live row：
  - `SourceID=email_19da3eb4e2628ae9_0`
  - `HKD=3250`
  - `金額=66170`
  - 無 `Currency`
  - 無 `Original Amount`
- Apps Script code 只做：
  - `_convertToJpy(b.total, b.original_currency)`
  - 再寫 `💴 金額 ¥` / `HKD`
  - 冇寫 React extended multi-currency fields

Status：`lossy`

### C. `address` / `bookingRef` / `time` 係 property 定 note meta line

結果：

- legacy manual/scan：**唔係 dedicated property，會流失**
- Apps Script email import：**主要塞喺 `備註` meta line**
- React receipt：**可以寫 dedicated property**

Meaning:

- 同一個 logical field 依來源不同，有時係結構化欄位，有時只係備註文本

Status：`lossy` + `duplicate/conflicting`

### D. `🗓 行程更新` rows 會唔會被當成 receipt

結果：

- legacy：**唔會**，會套用 itinerary override 後 skip receipt
- React：**會**，因為 `receiptFromPage()` 無特判 itinerary update

Live evidence:

- `🗓 行程更新：黑部立山三日遊`
  - plain `SourceID=email_19d9fc9a8f245317_iu_0`
  - emoji `🔑 SourceID=notion_3468...`
  - plain `日期=2026-04-21`
  - emoji `📅 日期=2026-04-20`
  - plain `類別=當地旅遊`
  - emoji `🗂 類別=其他`
  - plain `支付=信用卡`
  - emoji `💳 支付=現金`
  - plain `Object Type=receipt`

React 讀法會變成：

- `sourceId` 用 plain
- `date` 用 plain
- `category` 用 plain
- `payment` 用 plain
- `region` 可能用 emoji，因為 plain empty
- `note` 用 plain，因為 plain 有 email meta

即係同一筆資料被 React 混合咗兩代欄位後當 receipt 用。

Status：`duplicate/conflicting`

### E. plain / emoji duplicate columns 有冇同頁矛盾

結果：**有，已經 live 發生** ❌

已確認實例：

- app settings row：
  - plain `SourceID` empty
  - emoji `🔑 SourceID=__meta_settings__`
- itinerary update row：
  - plain / emoji `SourceID` 不同
  - plain / emoji `日期` 不同
  - plain / emoji `類別` 不同
  - plain / emoji `支付` 不同

Status：`duplicate/conflicting`

### F. legacy 同 React 對同一 row 會唔會讀出唔同 receipt

結果：**會** ❌

最清楚兩類例子：

1. `__meta_settings__` row
   - React 會靠 content-aware alias fallback 正確識別同 skip
   - legacy 有高風險因為 schema resolved plain-first 而讀唔到 emoji `SourceID` / `備註`

2. `🗓 行程更新` row
   - legacy：轉成 itinerary override，唔入 receipt list
   - React：當成普通 receipt

Status：`duplicate/conflicting`

## Findings

### [P1] Notion database 冇單一 canonical property family

Severity：High

因為目前 live DB 同時容許 plain、emoji、React-extended 三族欄位，三條 writer 又各自偏好不同族群，所以資料正確性唔再單靠「欄位存在」可以保證。

### [P1] React 會將 `🗓 行程更新` row 當成 receipt

Severity：High

legacy 明確知道呢類 row 唔係消費記錄；React 無同等邏輯。呢個會直接污染 History / Stats / totals。

### [P1] legacy pull 對 mixed-family rows 缺乏 content-aware fallback

Severity：High

如果 schema resolve 到 plain 欄位，但 live 值其實喺 emoji 欄位，legacy 可以完全讀漏。`__meta_settings__` row 已經符合呢種模式。

### [P1] email import 會永久流失原幣別同原金額結構化資訊

Severity：High

Apps Script 只寫 JPY total 同 HKD，冇寫 `Currency` / `Original Amount`，之後唔可以準確重建原始外幣記錄。

### [P2] `address` / `bookingRef` / `time` 目前唔係一致結構化欄位

Severity：Medium

legacy 同 Apps Script 主要靠 note meta line；React 先有 dedicated properties。查數或 cross-client round-trip 時會出現欄位有時有、有時冇。

### [P2] React fallback 太寬鬆，會將矛盾資料混合成單一 receipt

Severity：Medium

佢可以提升容錯，但同時掩蓋 schema 腐化。對 audit 同 correctness 反而危險。

## Recommended Fix Direction

### 1. 強制收斂到單一 canonical family

建議定一套唯一 receipt schema，之後所有 writer 只寫嗰一套。最實際係：

- 保留 `店名` 作 title
- 其餘 receipt fields 統一用 React/extended + emoji or plain 一套固定命名
- 廢棄另一套 duplicate family

### 2. 所有 writer 都要寫同一批 structured fields

最少應統一寫：

- `amount`
- `date`
- `time`
- `category`
- `payment`
- `region`
- `address`
- `bookingRef`
- `items`
- `note`
- `sourceId`
- `hkd`
- `currency`
- `originalAmount`
- `exchangeRate`
- `split`
- `objectType`

### 3. `🗓 行程更新` 唔應再用 receipt row 偽裝

兩個可選方向：

- 用 `Object Type=itinerary_update`
- 或者獨立 database / data source

但無論點，React pull 要同 legacy 一樣 special-case skip receipt creation。

### 4. Apps Script 要升級到寫 structured properties

唔好再只靠 note meta line。至少應直接寫：

- `🎫 Booking Ref`
- `🗺️ 地址`
- `⏰ 時間`
- `Currency`
- `Original Amount`

### 5. legacy pull 如果未完全退役，就要做 content-aware fallback

最少要令 legacy `nGet()` 喺 schema-resolved prop 空白時，繼續試 alias candidates，而唔係停喺第一個 resolved name。

### 6. 加一個 schema-integrity audit

每次 sync 前後檢查：

- 同一 row 是否同時有 plain + emoji duplicate values
- duplicate values 是否互相矛盾
- `SourceID` 是否唯一
- `Object Type` 是否合法

## Bottom Line

而家最核心唔係單一欄位 map 錯，而係：

**同一個 Notion database 被三條不同年代、不同假設嘅 writer 同 reader 同時操作，結果變成 schema drift。**

所以 record correctness 問題係 systemic，唔係只修一兩個欄位名就會乾淨。
