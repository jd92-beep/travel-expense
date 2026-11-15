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
  -> capability-filtered selected AI model / automatic policy through Credential Broker
```

## Data Ownership

- `AppState.trips` is the trip source of truth.
- `activeTripId` drives Dashboard, Timeline, Weather, Stats, History, receipt stamping, currency snapshot, and Notion trip notes.
- Receipts keep trip snapshots: `tripId`, `tripVersion`, `tripDayId`, `regionSnapshot`, `currency`, `originalAmount`, `originalCurrency`, `hkdAmount`.
- `customItinerary` is kept as a legacy compatibility mirror.
- Settings meta sync is non-secret only: budget, currency, active trip, persons, share ratios, model selections, translation language, and timestamps.

## Timeline Orientation

- The Compact Itinerary tab is schedule-first: it renders planned spots, loose receipts, edit/reset actions, and safe map links without turning receipt events into timeline stops.
- `JourneyPlanner` places day, calendar, route, flight, stay, checklist and play views above the existing itinerary editors. The date rail scrolls within itself and preserves reduced-motion preferences.
- The selected-day view and optional all-days view keep date identity, spot editing, moves and swaps in the existing trip update path.
- Route diagrams show stop order, with deliberate external map links; they do not claim geographic accuracy or live travel status.

## Exchange Rate Settings

- A standalone `settings-exchange-rates` accordion starts collapsed. Trip Manager retains separate statistics controls.
- `ExchangeRateSection` stages fixed/live selection and the active-currency rate locally; `TripRateInput` does not write on blur. Confirmation commits the existing `rateMode`, `rate` and `rateTable` keys through `updateState`, preserving sync compatibility.
- Live confirmation requires a valid current-currency API rate before switching. Failed or stale-trip requests preserve the confirmed setting; fixed rates survive boot without a live refresh. New records use the confirmed rate, while stored receipts retain their own rate/HKD snapshots.

- Scan shares the rate helpers in `lib/rateMode.ts`. Its fixed-rate input needs an explicit apply; live confirmation rejects responses after a newer choice, trip/currency change or unmount.
- `CurrencyTools` renders its calculator in a body portal to avoid transformed tab wrappers. Its rate choice is local to the calculator, arithmetic preserves signed results, and keyboard focus stays within the dialog.
- Currency requests share one in-flight fetch with an eight-second timeout. Cached quotes expire after one hour; provider publication times older than three days or in the future are rejected. A failed refresh leaves confirmed fixed rates and receipt snapshots unchanged.
- `RateReference` labels the feed as daily indicative data and distinguishes publication from retrieval time. Visa, Mastercard and ECB comparisons are ordinary external links, never automatic rate replacements. Currency displays use ISO minor units; stored receipt HKD snapshots retain the existing whole-dollar contract.
- New manual/OCR editor drafts bind explicitly to the selected trip, including a known default trip. Existing unbound legacy receipts retain date-based fallback. Locked rate input remains raw until validation; blank, malformed or overflowing conversions cannot silently save a substitute rate.

## AI Flow

- Task categories start collapsed and show the currently selected model. Expanding a category reveals collapsed provider groups with accessible radio choices. Photo choices are filtered by image support. Direct Kimi/MiMo/Volcano choices are hidden; validated OpenRouter and OpenCode choices are available.
- An explicit category selection runs only that provider/model and reports its failure. Stale/hidden settings migrate to `auto`; automatic photo routing is Muse Contributor → MiMo-V2.6-Flash, and automatic text routing is Nemotron Super → North Mini Code → Apodex Mini → Qwen3.7 Flash. Quota failures stop the chain.
- Voice uses browser speech transcription followed by text extraction. Translation language persists; original names accompany translations. Unknown dates/payment stay blank, and currency cents/line totals are retained.
- Broker keys remain private. Health checks make one exact-model request with eight output tokens; Muse Contributor uses its required 16-token minimum, approved by Boss on 2026-10-10. These limits apply to availability probes only. Native response JSON and capability validation apply to normal tasks.
- Trip update always creates a preview first. Apply updates local trip state; Notion sync creates/updates the trip page when the broker session is active.
- Welcome Guide uses `parseNewTripParagraph`: AI prompts and local/failure fallbacks receive an empty trip context, and each result gets fresh trip/day/spot identities. Existing trip dates, itinerary, budget and cloud metadata are not inherited. Settings continues using `parseTripParagraph` for current-trip partial/full updates.
- [2026-10-10 model rollout, measured results and limitations](../docs/ai-model-rollout-2026-10-10.md).

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
- `styles/journey.css` owns the 沿途 visual system, loaded after legacy styles. Home leads with local landscape artwork, the active trip and planned stops. Automatic mode uses mineral teal; manual theme palettes remain compatible. Mobile exposes five equal navigation targets and a keyboard-accessible More sheet; desktop exposes all seven existing routes. Glass is confined to navigation, with opaque content surfaces and reduced-motion support.
- Visual emoji are progressively replaced in UI by code-native generated SVG icons and non-realistic illustrated avatars. The legacy `emoji` data field remains for compatibility and Notion text snapshots.
- Scan camera/gallery/email screenshot inputs use accessible native labels connected to visually hidden file inputs. This keeps mobile Chrome picker activation inside the browser's trusted input path.
- Weather uses one report service for the tab and Dashboard. `weather/providers.ts` separates official observations/daily bulletins/native hourly feeds from labelled model hours; `locations.ts` resolves itinerary coordinates; `currentLocation.ts` owns explicit device permission and location metadata; `http.ts` owns bounded requests/memoization; `useWeatherReport.ts` rejects stale UI responses. Native provider times are retained, with no synthetic fixed slots. The responsive screen styles live in `styles/weather.css`.
- Settings parity additions remain broker-safe: split settlement details, equal split reset, local settings save, server-side settings push, and pending-email pull never store raw provider credentials in Compact state.
- Theme selection offers 12 regional themes and 11 manual styles. Night Ledger, Harbor Blueprint and Sunset Terrace use static surfaces and system fonts. The pre-React theme bootstrap and CSS palettes match runtime tokens; preview fonts load only when the theme accordion opens.
- Tab wrappers stay mounted across effects-tier changes so drafts survive an OS motion-preference change. Tab navigation resets scroll; reduced-motion cards render without reveal delay or visibility-observer dependency. Deployment discovery coalesces boot/focus/visibility checks into a five-minute budget, skipping hidden and offline states; it never forces a reload.
- Receipt extraction captures its initiating trip. Completion callbacks reject results after leaving that trip, while same-trip background work can finish after tab navigation. Partial batch saves retain selected incomplete rows for correction.
- Timeline sheets give only the active modal keyboard ownership; nested spot editing preserves the underlying day draft. Trip-review dismissal guards dirty edits and its body portal keeps the sheet outside transformed tab clipping.

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

Compact 0.32.1 also restores signed refund amounts and legacy trips without timezone lists.
Hydration resolves saved settings by their own timestamp, independently of receipt freshness.
A successful configured cloud pull is authoritative even when empty; failed or unconfigured
pulls cannot purge cached trips or clear uploaded-photo flags. Cloud receipts are stamped
against their resolved trip before the local trip cache exists; unknown-trip receipts and
tombstones are ignored, not attached to the selected trip.

### Current-trip downloadable exports (Compact 0.30.0)

`tripExport.ts` assembles a version-1 ZIP manifest, offline escaped HTML report, UTF-8 BOM CSVs
and a text-only portable backup. `portableTripBackup()` scopes trip maps, translation caches and
itinerary overrides to the exported trip; it uses the existing credential/cloud-ID sanitizer.
Receipt IDs map CSV rows to separate image files; cloud SourceIDs and signed URLs are never
written into the archive. Restore rules and the shared schema remain unchanged.

`ExportDownloads` owns the explicit image checkbox, progress and cancellation. Image loading
is skipped entirely for data-only downloads. `receiptExportPhotos.ts` renews private Storage
URLs through the initiating session-bound client, validates image bytes, limits each image to
6 MB and bounds cloud work to 20 seconds per receipt. The ZIP has a 100 MB photo ceiling;
failed/oversized images stay visible in the manifest and `photos.csv`, while data remains intact.
Trip/account changes and unmount cancel an in-flight export. Only cached thumbnails may substitute
for unavailable originals; they are labelled. No bucket policy or database changes are involved.

## Journey planning additions (0.33.0)

- `components/journey/` contains the shared date rail, trip cover/mark, overview, planner, booking summaries, local checklist and offline matching game. Existing receipt, weather, settlement and settings data services remain the owners of their data.
- Flights and stays use existing itinerary spots and lodging fields. Create/edit actions use the existing itinerary editor; shared viewers cannot write bookings. No booking-provider API or live status is added.
- `lib/journeyTools.ts` validates checklist imports and creates RFC 5545 calendar downloads with UTF-8 line folding. Valid per-spot IANA time zones are converted to UTC; absent zones retain floating local time. Invalid zones and nonexistent daylight-saving times produce a visible export error.
- Checklist storage keys encode both authenticated account and active trip. Save failures remain visible; importing merges only whitelisted checklist fields, and export/import is separate from the existing trip backup contract. Checklists do not sync to the shared cloud database.
- The game is local UI state and performs no network request. New features require no migration, provider credential or new dependency.

## Connected planner (0.34.0)

- `JourneyTimetable` and `lib/plannerLayout.ts` lay out entered start/end times, overnight durations, overlapping lanes and untimed stops. Short blocks keep a minimum hit area; missing end times are labelled, never treated as an inferred travel duration.
- Timeline owns the shared selected date/place for Day, Multi-day and Map. `JourneyMap` loads its external preview only on explicit activation, keeps loading/fallback copy visible, and provides selected-place navigation plus bounded whole-day routes.
- `TripTools` is a body portal with focus containment, Escape/restore, scroll lock and reduced-motion-aware entry/exit. Downloads reuse `itineraryCalendar` and `portableTripBackup`; import opens the existing Settings review flow. Sync text comes from actual engine state.
- The day rail animates its marker; day content uses a short directional transition. The checklist supports grouped counts, search and pending filtering. Quantity/bag details remain plain notes.
- Scan remains a primary destination, with themed camera/gallery/voice/email/manual capture and calculator access. Revealed inputs scroll into view and receive focus without losing their draft.
