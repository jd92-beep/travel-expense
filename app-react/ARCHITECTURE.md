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
