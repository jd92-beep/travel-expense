# Travel Expense Compact Architecture

## Safety Contract

- Root `index.html` is a stateless CSP-protected redirect to the maintained Compact app.
- `/travel-expense/compact/` and the `travel-expense-compact` Vercel project are built from `app-compact/` only.
- Compact does not import or depend on legacy `app/`, `app3/`, or the main `app-react/` UI.
- Provider credentials are server-only. Compact stores only the Credential Broker URL and a short-lived broker session; provider keys are stripped from local backup, IndexedDB snapshots, Notion settings meta rows, docs, and production build output.
- No password verifier or encrypted verifier payload is shipped to the browser. Device trust is stored only after the Credential Broker accepts the password and registers the device.

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

## Timeline Orientation

- The Compact Itinerary tab is schedule-first: it renders planned spots, loose receipts, edit/reset actions, and safe map links without turning receipt events into timeline stops.
- The animated rail progress is based on the current itinerary spot index, not the whole 24-hour clock percentage.
- If the current date is outside the itinerary date window, rails use `.is-outside-trip`: the same red/gold/green palette is dimmed, live marker is hidden, and the bright sweep is paused.
- Mobile layout keeps the rail in its own gutter and uses compact card columns so the beam does not cover event text.

## AI Flow

- The user's valid selected model is primary for scan, voice, email and trip analysis; stale model settings migrate to the reviewed catalog defaults.
- Broker-routed fallback models are tested server-side before use.
- MiniMax, GLM/ZAI, and OpenRouter are not shown in the Compact model picker.
- Trip update always creates a preview first. Apply updates local trip state; Notion sync creates/updates the trip page when the broker session is active.

## Notion Flow

- Compact never sends a Notion token. It sends a signed broker session plus the Notion request shape to `/notion/request`.
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
- Weather uses one report service for the tab and Dashboard. `weather/providers.ts` separates official observations/daily bulletins/native hourly feeds from labelled model hours; `locations.ts` resolves itinerary coordinates; `currentLocation.ts` owns explicit device permission and location metadata; `http.ts` owns bounded requests/memoization; `useWeatherReport.ts` rejects stale UI responses. Native provider times are retained, with no synthetic fixed slots. The responsive screen styles live in `styles/weather.css`.
- Settings parity additions remain broker-safe: split settlement details, equal split reset, local settings save, server-side settings push, and pending-email pull never store raw provider credentials in Compact state.

## Deployment Targets

- GitHub Pages root redirects to `/travel-expense/compact/` without application state or credentials; Compact is the canonical Pages UI.
- Vercel hosts the standalone Compact app from `app-compact/` at `/` through the linked `travel-expense-compact` project.
- `vite.config.ts` resolves base path in this order: `VITE_BASE_PATH`, then Vercel `/`, then the GitHub Pages/local `/travel-expense/compact/` default.
- Vercel Preview Deployments should be Git-connected branch/PR previews only. Provider credentials do not belong in Vercel frontend env vars; live Notion/Kimi/Google access still goes through the Credential Broker.

## Credential Broker Flow

```text
Unlock password
  -> POST /session/unlock (server-side password verification)
  -> trusted-device registration + local trust marker
  -> short-lived broker session
  -> /notion/request, /kimi/json, /google/json
  -> Worker injects provider credentials from encrypted KV vault
```

- Worker source and `wrangler.jsonc` contain no live provider credential.
- Immutable secrets are set with `wrangler secret put`.
- Rotatable provider credentials live in KV as AES-GCM ciphertext.
- Rotation requires an active session and admin maintenance passphrase.

## Account and persistence boundaries (0.25.0)

`useAppState` resets state before the next account commits and binds mutation
callbacks to that scope identity. Deferred hydration preserves pre-hydrate edits
and deletions. LocalStorage/IndexedDB merge trips and receipts by their own
freshness, retaining tombstones, settings timestamps and all pending work.

`useSyncEngine` invalidates async operations on account changes/unmounts. Data
requests use a Supabase client bound to the initiating session token, while the
auth client remains responsible for session refresh. A successful older receipt
write may supply cloud identity/version without overwriting a newer local edit;
a delete during creation inherits the returned identity for its durable delete.

Only recognized transient, non-exhausted work resumes after reload. Permanent
errors, exhausted attempts and `40001` conflicts remain visible. RPC idempotency
keys identify receipt content plus its mutation timestamp, so two distinct edits
of the same base version cannot silently share a success. Explicit missing trip
references fail closed; deletes retain their original trip UUID.

Portable backups omit credentials, cloud identities, deletion state and sharing
metadata; per-trip maps stay within the exported trip set. Storage keys and the
cross-client persisted schema remain compatible.
