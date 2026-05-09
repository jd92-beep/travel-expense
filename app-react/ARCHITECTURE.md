# Travel Expense React Architecture

## Safety Contract

- Root `index.html` remains the legacy app.
- `/react/` is built from `app-react/` only.
- React does not import or depend on legacy `app/` or `app3/`.
- Provider credentials are server-only. React stores only the Credential Broker URL and a short-lived broker session; provider keys are stripped from local backup, IndexedDB snapshots, Notion settings meta rows, docs, and production build output.
- The unlock PIN is not stored as plaintext. The app unlocks by decrypting a WebCrypto payload, then stores a local device trust marker.

## Runtime Layers

```text
Mobile Chrome URL
  -> AuthGate
  -> Credential Broker session unlock
  -> Shell + tab ErrorBoundary
  -> Feature tabs
  -> domain selectors / migration
  -> localStorage compatibility + IndexedDB snapshot
  -> optional Notion sync through Credential Broker
  -> Kimi primary / Google backup through Credential Broker
```

## Data Ownership

- `AppState.trips` is the trip source of truth.
- `activeTripId` drives Dashboard, Timeline, Weather, Stats, History, receipt stamping, currency snapshot, and Notion trip notes.
- Receipts keep trip snapshots: `tripId`, `tripVersion`, `tripDayId`, `regionSnapshot`, `currency`, `originalAmount`, `originalCurrency`, `hkdAmount`.
- `customItinerary` is kept as a legacy compatibility mirror.
- Settings meta sync is non-secret only: budget, currency, active trip, persons, share ratios, and timestamps.

## AI Flow

- Kimi is primary for receipt image OCR, voice/email parsing, and trip paragraph analysis.
- Google backup is broker-routed and tested server-side before use.
- MiniMax, GLM/ZAI, and OpenRouter are not shown in the new React model picker.
- Trip update always creates a preview first. Apply updates local trip state; Notion sync creates/updates the trip page when the broker session is active.

## Notion Flow

- React never sends a Notion token. It sends a signed broker session plus the Notion request shape to `/notion/request`.
- One trip is one Notion page with `Object Type = trip` and `SourceID = trip_<tripId>`.
- Receipts use `Object Type = receipt` and preserve deterministic `SourceID`.
- Settings use `SourceID = __meta_settings__` and never contain credentials.
- Schema migration only adds optional fields; it does not rename or delete legacy fields.

## Mobile Web Flow

- The first loaded screen is the lock screen.
- Same Chrome profile/device can reopen without retyping after successful unlock.
- Settings includes a clear device trust action.
- Settings includes an expandable `Credentials & Connection` card for broker status and admin credential rotation.
- Offline work remains local; sync queue only starts when the broker session is active.

## UI And Mobile Interaction Layer

- Tailwind CSS v4 is present only as an additive theme/utility layer. The app avoids Tailwind preflight so existing custom Liquid Glass CSS remains the source of truth.
- `ui.tsx` owns local primitives such as `GlassCard`, `LiquidGlassSurface`, `BottomDock`, `ProgressRing`, `AnimatedNumber`, `SegmentedControl`, and receipt/timeline rows.
- The app shell uses a warm parchment background, subtle animated light, scroll-linked paper/parallax motion, a short windmill tab transition, Liquid Glass surfaces, and reduced-motion fallbacks.
- Visual emoji are progressively replaced in UI by code-native generated SVG icons and non-realistic illustrated avatars. The legacy `emoji` data field remains for compatibility and Notion text snapshots.
- Scan camera/gallery/email screenshot inputs use accessible native labels connected to visually hidden file inputs. This keeps mobile Chrome picker activation inside the browser's trusted input path.
- Weather forecast fetches detailed Open-Meteo hourly variables and renders fixed daily slots at 09:00, 12:00, 16:00, and 21:00. Japan trips may use JMA model candidates; non-Japan trips stay on Open-Meteo.
- Settings parity additions remain broker-safe: split settlement details, equal split reset, local settings save, server-side settings push, and pending-email pull never store raw provider credentials in React state.

## Deployment Targets

- GitHub Pages remains the canonical public legacy deployment. Root `index.html` stays at `/travel-expense/`; the React build is copied to `/travel-expense/react/`.
- Vercel Hobby can host the standalone React app from `app-react/` at `/` with `vercel.json`.
- `vite.config.ts` resolves base path in this order: `VITE_BASE_PATH`, then Vercel `/`, then the GitHub Pages/local `/travel-expense/react/` default.
- Vercel Preview Deployments should be Git-connected branch/PR previews only. Provider credentials do not belong in Vercel frontend env vars; live Notion/Kimi/Google access still goes through the Credential Broker.

## Credential Broker Flow

```text
Unlock password
  -> React WebCrypto local unlock
  -> POST /session/unlock
  -> short-lived broker session
  -> /notion/request, /kimi/json, /google/json
  -> Worker injects provider credentials from encrypted KV vault
```

- Worker source and `wrangler.jsonc` contain no live provider credential.
- Immutable secrets are set with `wrangler secret put`.
- Rotatable provider credentials live in KV as AES-GCM ciphertext.
- Rotation requires an active session and admin maintenance passphrase.
