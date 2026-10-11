# Travel Expense App

**English** · [繁體中文（廣東話）](README.zh-HK.md)

Track travel expenses, organize receipts and itineraries, and calculate shared costs. Each trip has its own records. **Compact** is the main public app; the parallel React client uses compatible data contracts.

## Open the app

- [Compact — main app](https://travel-expense-compact.vercel.app)
- [Compact on GitHub Pages](https://jd92-beep.github.io/travel-expense/compact/)
- [Parallel React app](https://travel-expense-react.vercel.app)
- [React on GitHub Pages](https://jd92-beep.github.io/travel-expense/react/)
- [Admin Console — administrators only](https://travel-expense-admin-kanban.vercel.app)

The [GitHub Pages root](https://jd92-beep.github.io/travel-expense/) redirects to Compact. Check the version shown in Settings when reporting an issue. Source versions and deployed versions can differ; this README is not a deployment receipt.

## First-time setup

1. Open Compact and sign in with your own email or **使用 Google 帳號登入** (Sign in with Google). If using an email sign-in link, open the link from your inbox.
2. Follow the welcome guide to create a trip: enter its name, destination and dates.
3. Set your budget and trip currency. Add travel companions and their sharing weights if needed. The initial companion is `User 1`.
4. Add an expense, review the extracted or entered details, then save it.
5. Open **紀錄** (Records) to confirm it appears under the correct trip.

Use a separate account for each person. Expense-splitting companions are calculation participants; adding one does not grant another app user access to the trip.

## Everyday use

| Screen / Chinese label | What to do |
| --- | --- |
| Home / 首頁 | Select the active trip; check your budget, today's spending and itinerary. |
| Scan / 記帳 | Take a receipt photo, choose an image, paste email text, enter an expense manually or use voice input. |
| Records / 紀錄 | Search and filter expenses; open a record to review or edit it. |
| Itinerary / 行程 | View the trip's daily places, times and related expenses. |
| Weather / 天氣 | Choose a day and location; inspect hourly forecasts, source and freshness. |
| Stats / 統計 | Review totals, spending categories and shared costs. |
| Settings / 設定 | Manage trips, exchange rates, AI models, sync, themes and backups. |

Always select the correct trip before adding or syncing records. Before saving a receipt, check its merchant, date, time, currency, amount, payment method, payer and sharing mode. AI output is a draft and may need correction.

### Exchange rates and calculator

Rates are displayed as **1 HKD = N units of the trip currency**.

- In **設定 → 匯率設定** (Settings → Exchange rates), choose live or fixed mode, then confirm. Typing a fixed rate alone does not apply it. Failed live-rate confirmation preserves the previous setting.
- Scan's top-right **匯率** button also lets you switch modes or enter and apply a fixed rate. Rate-source information is shown in Settings.
- **貨幣計數機** (Currency calculator), below the Scan input buttons, converts amounts in either direction using live or fixed rates. Calculator-only rate edits do not change the trip's confirmed settings.
- The receipt editor shows the current rate. Choose **鎖定匯率** (Lock rate) to enter a rate for that receipt or use an available preset. Date/time, category/payment and payer/sharing fields sit side by side on phones.
- Saved receipts retain their recorded rates and HKD amounts when the app's exchange-rate setting changes.

### Itinerary and weather

Paste itinerary, hotel, restaurant, transport or booking text into Trip Update AI. Review the proposed dates, places and missing details before applying changes.

Weather uses the selected trip date and location. Its hourly rail opens at the corresponding local clock hour where available, and you can select another hour. Forecasts distinguish observations, daily bulletins and hourly models, including their sources and freshness. Official services are preferred where supported; missing fields can use labelled fallback providers. Unavailable dates or fields are shown explicitly. Device location requires your action and browser permission.

### AI models

In **設定 → AI 模型選擇**, expand a task category, then a provider, to choose a model. The category header shows the current model without expanding it.

- **Automatic photo routing:** Muse Spark Contributor, then MiMo-V2.6-Flash.
- **Automatic text routing:** free Nemotron 3 Super, North Mini Code, Apodex Mini, then paid Qwen3.7 Flash.
- An explicit selection makes one model attempt and shows failures. HTTP `429`, quota and daily-limit errors stop automatic retries to other models.
- Availability tests use the exact selected model, no fallback, and an eight-output-token budget; Muse Contributor requires 16 tokens. Normal task budgets are separate.

All credentialed AI calls go through the server-side Credential Broker. Never paste a provider API key into public frontend code or a backup. Manual expense entry remains available when AI is unavailable.

### Themes

Use **外觀主題** (Appearance) in Settings. **自動（依旅程）** follows the active trip's recommendation; a manual choice stays selected across trips. The current catalog includes regional and style themes, with light and dark options. Selection saves immediately. Compact's theme UI is independent of the parallel React client.

### Sync and trip sharing

Supabase is the shared primary store. Notion is an optional mirror.

- Personal Notion sync requires your own connected database and the resolved active trip. If it is not connected, Supabase-only sync is normal.
- Shared trips distinguish app members from expense-splitting companions. Owners/admins manage membership; editors can contribute according to permissions; viewers have read-only access.
- Shared receipt writes use Supabase RPCs; server-side jobs handle the Notion mirror. Ordinary members do not need a shared Notion token.
- Check visible sync errors before assuming a record has reached the cloud. Version conflicts and exhausted retries require attention.

See [HANDOVER.md](HANDOVER.md) for outstanding integration checks. A local test does not establish that a production sync completed.

## Export and restore

In **設定 → 資料管理 → 下載旅程資料** (Settings → Data management → Download trip data):

1. Leave **連同收據圖片下載** unchecked for a data-only ZIP, or select it to include receipt images.
2. Download and extract the entire ZIP.
3. Open `summary.html` for an offline, printable report. Open the CSV files in Excel or Numbers.

The archive contains the current trip's expense, item, allocation, companion, itinerary and photo tables, plus a portable JSON backup. Missing images, failed downloads and thumbnail substitutes are labelled; the text data is still available. Standalone CSV and JSON downloads are also available.

JSON restore previews the imported data and removes credentials, cloud IDs and stale or foreign trip links. It restores text data, not the ZIP's receipt images. Downloads can contain private records: keep them in a private location. See the [export format](docs/compact-export-format.md).

## Troubleshooting

- **Missing records:** check the sign-in email and active trip first.
- **AI unavailable:** read the displayed error; use manual entry while resolving availability or quota limits.
- **Live exchange-rate update failed:** the confirmed setting is retained. Check the network and retry deliberately.
- **Notion not syncing:** check your personal connection and active trip in Settings.
- **Layout or stale build:** reload once; report the app URL, version, screen and device size if it persists.
- **Shared device:** use the app's clear-device-data option when removing this account's cached data, then sign out.

## Developer quick start

Use Node.js **22.x**, as declared by Compact's package. Start from your clone:

```bash
git clone https://github.com/jd92-beep/travel-expense.git
cd travel-expense/app-compact
npm ci
npm run dev
```

Open [local Compact](http://localhost:8903/travel-expense/compact/). Live sign-in and provider features require their configured backend services; local startup alone does not provision them. Keep private credentials in the approved server-side broker/vault.

Required checks for Compact changes:

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

The browser smoke wrapper starts an isolated local server with safe environment loading. Playwright blocks unmocked external hosts. Install its Chromium browser with `npx playwright install chromium` if it is missing. Run the smoke suites relevant to your change; see [Compact's scripts and notes](app-compact/README.md) and [architecture](app-compact/ARCHITECTURE.md).

For the parallel client, run `npm ci` and `npm run dev` from `app-react/`, then open [local React](http://localhost:8902/travel-expense/react/). Compact and React version independently. Changes to shared storage or trip/receipt contracts need cross-client checks.

## Repository map

| Path | Purpose |
| --- | --- |
| `app-compact/` | Active public React/Vite client |
| `app-react/` | Parallel public client |
| `app-admin-kanban/` | Admin frontend and same-origin BFF |
| `workers/credential-broker/` | Credentialed provider access |
| `supabase/` | Database migrations and Edge Functions |
| `index.html` | Stateless redirect to Compact |
| `docs/` | Contracts, runbooks and technical notes |
| `AGENTS.md` | Repository working rules |
| `HANDOVER.md` / `CHANGELOG.md` | Continuation notes and change history |

## Releases and maintenance

GitHub Pages builds from `main`: Compact under `/compact/`, React under `/react/`, and a redirect at the root. Vercel has separate app targets. Admin production uses a protected, explicitly dispatched workflow. Legacy Netlify configuration remains in the repository; it is not the recommended public entry point.

A push to `main` can trigger deployment. Obtain the repository owner's explicit authorization before pushing, merging or deploying, and verify the intended source SHA and live app afterwards. Bump the touched app's visible `APP_VERSION`, package version and lockfile version together. Database migrations, Admin writes and credential changes require separate authorization for their target.

Read [AGENTS.md](AGENTS.md), the relevant app architecture and [HANDOVER.md](HANDOVER.md) before maintenance. Never commit secrets, `.env` files, personal exports, generated deployment output or local graph indexes.
