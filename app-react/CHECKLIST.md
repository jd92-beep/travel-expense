# Travel Expense React Checklist Status

Status labels:
- `已驗證`: implemented and smoke/type/build covered in this pass.
- `已實作`: implemented in code, needs live credential or real device data to fully verify.
- `保留`: legacy remains available at root.
- `待 live`: blocked by missing local credential/token in this run.

## A. Boot / Mobile Web / Deploy

| ID | Status | Evidence |
|---|---|---|
| A01 | 已驗證 | Local baseline opened at `/travel-expense/react/`. |
| A02 | 保留 | Root `index.html` is not moved; deploy copies it to root. |
| A03 | 已驗證 | Vite base and deploy output target `_site/react/`. |
| A04 | 已驗證 | React app code is inside `app-react/src`; no legacy import. |
| A05 | 已驗證 | Mobile viewport smoke at 390px showed tab shell and Settings. |
| A06 | 已驗證 | `ErrorBoundary` wraps tab content. |
| A07 | 已實作 | Shell listens to online/offline and keeps local data. |
| A08 | 已實作 | Service worker controller update notice is supported. |
| A09 | 已實作 | No AI/Notion request is cached by app code. |
| A10 | 已驗證 | Workflow keeps root legacy and `/react/`; no key injection. |

## B. Lock / Auth Gate

| ID | Status | Evidence |
|---|---|---|
| B01 | 已驗證 | First page is `AuthGate` lock screen. |
| B02 | 已驗證 | WebCrypto decrypt unlock smoke passed. |
| B03 | 已驗證 | Reload after unlock skipped password on same browser profile. |
| B04 | 已驗證 | Settings clear device trust button works. |
| B05 | 已實作 | Site data reset naturally removes local trust marker. |
| B06 | 已驗證 | Tabs are not mounted before unlock. |
| B07 | 已驗證 | Repo/dist scan found no plaintext PIN/API token hit. |

## C. Local Storage / IndexedDB / Migration

| ID | Status | Evidence |
|---|---|---|
| C01 | 已驗證 | IndexedDB snapshot store added; smoke read/write passed. |
| C02 | 已驗證 | `boss-japan-tracker` compatibility retained. |
| C03 | 已驗證 | `APP_SCHEMA_VERSION` and migration path added. |
| C04 | 已驗證 | Receipt migration stamps trip/currency fields without dropping legacy fields. |
| C05 | 已驗證 | Legacy itinerary becomes active trip itinerary. |
| C06 | 已實作 | Spot IDs added; old date/index overrides still read. |
| C07 | 已實作 | Currency/rate fields migrate to receipt snapshots and rate table. |
| C08 | 已驗證 | Credentials are stripped from app state and backup. |
| C09 | 已實作 | JSON restore runs migration/normalization. |
| C10 | 已驗證 | Backup export excludes credentials. |

## D. Trip / Itinerary / Multi-trip

| ID | Status | Evidence |
|---|---|---|
| D01-D05 | 已驗證 | `TripProfile`, active trip selector, trip-driven tabs implemented. |
| D06-D07 | 已實作 | Trip paragraph preview can create new or update existing trip. |
| D08 | 已實作 | Archive/restore control added. |
| D09 | 已驗證 | Stable trip/day/spot IDs generated. |
| D10 | 已驗證 | Receipts keep trip/currency/region snapshot fields. |

## E. AI / Kimi / Google Backup

| ID | Status | Evidence |
|---|---|---|
| E01 | 已驗證 | Model registry shows Kimi primary and Google backup only. |
| E02 | 已驗證 | Kimi client and test action implemented; live smoke passed via local-only stdin key handling. |
| E03 | 已實作 | Google backup uses `models.list` before generation. |
| E04 | 已驗證 | JSON extractor handles fenced JSON and embedded JSON. |
| E05-E09 | 已實作 | OCR, voice, email, trip parser, diff preview paths implemented. |
| E10-E11 | 已實作 | Invalid/failed AI output falls back or reports a safe error. |
| E12 | 已驗證 | Deprecated providers removed from React UI. |

## F. Notion Database / Sync

| ID | Status | Evidence |
|---|---|---|
| F01 | 已驗證 | Notion credential rotation is broker-only; no browser-held Notion token input remains. |
| F02-F03 | 已實作 | Schema detect/migration adds optional fields only. |
| F04-F06 | 已實作 | Trip page create/update/pull implemented. |
| F07-F10 | 已實作 | Receipt push/pull/update/archive preserve SourceID and guards. |
| F11 | 已實作 | Settings meta row excludes credentials. |
| F12 | 已實作 | Sync queue records local-first writes only when the broker session exists. |
| F13 | 已實作 | Pull merges by stable id; destructive overwrite avoided. |
| F14-F15 | 已實作 | Email SourceID and itinerary update markers are recognized/preserved. |
| F16 | 已實作 | Notion errors are caught and displayed without token text. |

## G-P. Feature Parity

| Range | Status | Evidence |
|---|---|---|
| G01-G13 Dashboard | 已驗證 | Active-trip totals, budget, pending banner, person overview, today itinerary, map links, rows. |
| H01-H18 Scan | 已實作 | Manual, edit/delete, camera/gallery OCR, voice/email parse, batch confirm, Gmail copy, currency tool, photo/booking fields. |
| I01-I09 History | 已實作 | Search/filter/group/pending confirm/edit/delete/pull/merge by active trip. |
| J01-J09 Timeline | 已實作 | Planned spots, lodging/transport overlays, loose receipts, spot edit/reset, maps, trip marker flow. |
| K01-K06 Weather | 已實作 | Open-Meteo by trip coordinates, Japan-only JMA attempt, missing coord warning/cache/horizon handling. |
| L01-L09 Stats | 已實作 | Settlement, private/cross-private, person/category/payment totals, top 10, trend, toggle mirror. |
| M01-M25 Settings | 已實作 | All Settings cards are expandable; trip selector/update, currency, persons, broker credential rotation, Notion controls, export/import/reset/trust/version status remain available. |
| N01-N07 Money | 已實作 | HKD anchor, per-trip/per-receipt currencies, rate snapshots, CSV/Notion currency fields. |
| O01-O06 Maps | 已實作 | Google/Apple map URL, modal links, touch-safe React event handling, fallback address cascade. |
| P01-P07 Email/App Script | 已實作 | Gmail address, SourceID, pending prefix, itinerary marker, safe helper text with no credential injection. |

## Q. Graphify / GitNexus / Docs

| ID | Status | Evidence |
|---|---|---|
| Q01 | 已驗證 | GitNexus impact checked before major symbol edits. |
| Q02 | 已驗證 | `npx gitnexus analyze` reported index already up to date. |
| Q03 | 已驗證 | GitNexus detect changes returned low risk for tracked diff. |
| Q04 | 已驗證 | Graphify refreshed `app-react/src` code graph. |
| Q05-Q07 | 已實作 | `ARCHITECTURE.md` and this checklist document added. |

## R. Final Verification

| ID | Status | Evidence |
|---|---|---|
| R01 | 已驗證 | `npm run typecheck` passed. |
| R02 | 已驗證 | `npm run build` passed. |
| R03-R04 | 已驗證 | Repo/dist secret scan found no plaintext PIN/key/token patterns. |
| R05 | 已驗證 | Mobile viewport lock/settings/manual entry smoke covered. |
| R06 | 已驗證 | Desktop viewport snapshot opened without layout breakage. |
| R07 | 已驗證 | Lock, trusted reopen, clear trust smoke passed. |
| R08 | 已實作 | Migration code covered by type/build and local smoke. |
| R09 | 待 live | Requires deployed Credential Broker with Notion vault entry and database permission. |
| R10 | 待 live | Requires deployed Credential Broker with Kimi vault entry. Browser code no longer accepts/stores Kimi keys. |
| R11 | 待 live | Requires deployed Credential Broker with Google backup vault entry. Browser code no longer accepts/stores Google keys. |
| R12 | 已實作 | Offline queue guarded; network toggle smoke not yet run. |
| R13 | 已實作 | Map links generated without API key. |
| R14 | 已實作 | Multi-trip create/switch code path implemented. |
| R15 | 已驗證 | Checklist reviewed after implementation pass. |
