# 旅費 · React 2.0

Beautiful React + Vite + Tailwind + Framer Motion renovation of the travel expense tracker.

## Quick start

```bash
cd app
npm install
npm run dev
# → http://localhost:8901
```

Data storage is shared with the legacy app (`localStorage` key `boss-japan-tracker`), so all existing receipts auto-populate the new UI.

## Tech

- **Vite 5** — dev server + build
- **React 18** + **TypeScript**
- **Tailwind CSS 3** — proper compile, no CDN
- **Framer Motion 11** — every transition, every blob, every ring
- **Chart.js 4** + **react-chartjs-2**
- **Lucide React** — icons

## Design system

| Token      | Value                                          |
| ---------- | ---------------------------------------------- |
| Arsenal    | `#ef4135` (primary red)                        |
| Ember      | `#f5a524` (amber/gold)                         |
| Sakura     | `#f28996` (Japanese pink accent)               |
| Jade       | `#4ade80`                                      |
| Ink (bg)   | `#0a0908` → `#14110f` → `#2a2420`              |
| Mono num   | JetBrains Mono, tabular-nums                   |
| Display    | Noto Serif JP                                  |
| Body       | Inter                                          |

## What's implemented (v2.0.0)

- 🎨 Full design system (colors, typography, shadows, glass surfaces)
- ✨ Ambient background — morphing gradient blobs + Seigaiha wave pattern + grain
- 🧭 Animated bottom tab bar with spring pill indicator
- 🏠 Dashboard — hero budget ring, day tile, 6-day itinerary carousel, today's receipts
- 📚 History — grouped-by-date with sticky headers, search, category filter pills
- 📊 Stats — doughnut + bar (gradient fills), payment breakdown, TOP 10 stores
- 🗾 Itinerary — full schedule with timeline rails and TODAY glow
- 🌤️ Weather — layout with placeholder forecast (real Open-Meteo wire-in pending)
- 🛠️ Settings — budget + rate editing, link to legacy app
- 💾 localStorage read/write fully compatible with legacy app

## What's pending (ports from legacy)

- 📸 Receipt OCR (Gemini / GLM / MiniMax multi-provider chain)
- 📧 Email parsing + Notion sync
- 🔐 AES-256-GCM vault unlock
- 🎙️ Voice input
- 💱 Live currency calculator (16+ currencies)
- 🌤️ Open-Meteo JMA weather fetch
- 📤 CSV export

All these still work in the legacy app at `./legacy.html` after deploy.

## Build for production

```bash
npm run build
# outputs to dist/
```

The GitHub Actions workflow (`.github/workflows/deploy.yml`) handles this — it builds the React app and copies the legacy `index.html` to `legacy.html` in the Pages deployment.
