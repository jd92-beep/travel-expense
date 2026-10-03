# Compact audit and weather rebuild — 0.25.0

Local implementation and validation on 2026-10-03. No push, deployment, live
migration, credential change or production data write was performed. Existing
unrelated edits were preserved. This report describes verified findings and test
coverage; it is not a claim that every possible defect has been eliminated.

## Implemented corrections

| Area | Finding and resulting behavior | Regression evidence |
| --- | --- | --- |
| Account isolation | Account changes could leave prior state/callbacks or late requests active. State now resets before the next account commits; scoped setters and generation checks reject obsolete work, including A → B → A and StrictMode. | `account-scope-regression`, existing security/account switch smokes |
| Request identity | A shared mutable auth client could change bearer identity between awaits. Data clients now retain the initiating session token; auth refresh remains on the auth client. | Actual service calls against mocked HTTP assert A/B bearer identity |
| Hydration | Late IndexedDB hydration could overwrite settings or resurrect pre-hydrate deletions. Edited fields and tombstones survive; trip freshness is compared per trip rather than against unrelated receipt timestamps. | Scoped persistence unit tests and deferred hydration browser fixture |
| Durable changes | A 500-item queue cap silently discarded work. Pending changes are retained; deletes supersede queued saves and remain durable when automatic sync is disabled. | Change journal tests, in-flight create/delete browser fixture |
| Error visibility | Reload could resurrect permanent/exhausted/conflicting work. Only recognized transient errors with attempts remaining resume automatically; permission errors and `40001` remain visible for explicit action. | Offline and sync regression smokes |
| Receipt writes | A late success could overwrite newer content or lose its cloud identity/version. Newer local content survives while returned identity/version is adopted; a deletion during creation inherits the returned row identity. | Account regression and existing stale push smokes |
| Mutation identity | Distinct edits of the same base version could share an idempotency key. The key now includes a SHA-256 digest of the mutation content/timestamp, remaining stable for the same retry. | Actual service fixture checks identical retries vs different edits |
| Trip targeting | An explicit missing receipt trip could fall back to the active trip. Writes fail closed; durable deletes capture the original trip UUID, with exact-row lookup for a late create. Empty successful cloud pulls can enqueue local-only trips for upload. | Service, repeated SourceID, backfill and sync regression smokes |
| Bulk reads | A 20,000-row cap could silently return an incomplete authoritative snapshot. Reaching the cap now raises an error; timeout timers are cleared. | Typecheck/build and existing paginated pull paths; cap boundary itself is not load-tested |
| Portable backups | Deletion state, ownership/sharing metadata and foreign per-trip maps could leak into a portable backup. They are now removed/scoped alongside existing secret/cloud-ID stripping. | Audit unit assertions and Settings backup/restore smokes |
| Dates and amounts | Receipt dates were clamped to a trip boundary on adjacent days; refund conversion could discard a negative historical HKD snapshot. Both now preserve the real date/value. | Audit unit assertions and currency/math suite |
| Geography | Null/empty coordinates could become 0,0; a default JPY value could override a known non-Japan destination/timezone. Coordinates require valid finite ranges and destination identity takes precedence. | Audit unit, timeline/weather and shared contract checks |
| Receipt → itinerary | A date miss could insert into day one and bypass itinerary edit bookkeeping. The exact date is required, existing days/overrides survive, and the shared versioned edit path is used. Read-only editors omit the action. | Receipt itinerary and sharing browser regressions |
| CSV and development entry | Spreadsheet formulas were not escaped. CSV text cells are now escaped while signed numeric amounts remain numeric-looking. Automatic `secrets.local.js` loading/serving was removed and those files denied by the dev server. | Audit CSV assertions, security scan and security smokes |
| Mobile header | Themes without the Japan decoration still reserved its fixed grid column, truncating the title. The header now allocates space to the actual children. | Mobile weather screenshot, title-width assertion, theme and navigation checks |

## Weather architecture and interface

The old Weather layout and forecasting orchestration were replaced. The screen
now uses a date rail, explicit destination/current-location choices, a station or
selected-hour overview, an independently attributed daily bulletin, native hourly
chart/selection and a source/time section. Desktop uses a two-column reading
layout; mobile uses a single column with 44-pixel controls and bounded horizontal
rails. Light and dark modes were rendered and inspected.

The former 1,445-line `weather.ts` is a 132-line coordinator; the former 869-line
Weather tab is about 193 lines. Provider parsing, location resolution, bounded HTTP
requests, data types, current-location handling and response-race protection live
in focused `src/lib/weather/` modules. Dashboard consumes the same report service.
Unused WeatherFX code/styles were removed. No new dependency was added.

Important data rules:

- Observations, daily bulletins and hourly forecasts keep independent source
  attribution, station/area coverage and timestamps.
- Daily minima/maxima do not generate hourly temperatures. HKO's categorical
  probability of significant rain is not converted into an invented percentage.
- Missing/null values stay unknown. NWS/MSC native hours and destination-local
  dates are preserved; Fahrenheit/wind unit conversion is explicit.
- JMA daily area and temperature forecast point are disclosed separately from
  nearby AMeDAS observations; mountain/local differences remain visible.
- Cache identity includes actual coordinates, country, timezone and date. Fresh
  lifetime is 20 minutes; explicitly stale fallback is bounded to six hours and
  24 entries. Refresh bypasses both cache layers.
- Current location requires a click and browser permission. Accuracy and permission
  recovery are displayed. BigDataCloud receives coordinates for country/timezone
  lookup and its anonymous GPS/IP usage is disclosed. Device coordinates are not
  persisted in app storage or weather cache. Missing timezone metadata must be
  resolved before querying a forecast.

## Provider evidence and limits

| Country/region | Implemented path | Evidence and limit |
| --- | --- | --- |
| Hong Kong | HKO `rhrread` observation + `fnd` daily bulletin | Public JSON/CORS response checked; hourly model remains separately labelled. [HKO open data](https://www.hko.gov.hk/en/abouthko/opendata_intro.htm) |
| Japan | JMA regional daily JSON + nearest quality-checked AMeDAS station within 30 km | Public response shape/CORS checked; finite mapped daily regions, no invented nationwide point forecast. [JMA developer information](https://www.data.jma.go.jp/developer/) |
| Singapore | NEA/data.gov.sg air-temperature stations + two-hour bulletin | Public v2 JSON shapes checked; two-hour notice is not expanded into hourly numbers. [Real-time API guide](https://guide.data.gov.sg/developer-guide/real-time-apis) |
| United States | NWS point metadata and native hourly forecast | Official API documentation and deterministic parsing/timezone/unit fixtures. [NWS API](https://www.weather.gov/documentation/services-web-api) |
| Canada | MSC GeoMet City Page Weather observation/native hours within 50 km | Public JSON/CORS and native hourly shape checked. [MSC GeoMet](https://eccc-msc.github.io/open-data/msc-geomet/readme_en/) |
| Other destinations | Available regional models through Open-Meteo; generic model fallback | Clearly labelled model data, not a direct official connection. [Open-Meteo docs](https://open-meteo.com/en/docs) |

Taiwan CWA, Korea KMA and UK Met Office direct integrations require provisioned
credentials; MET Norway production needs compliant identification/proxy/cache
handling. These are not configured or deployed by this change. Official links
and honest model attribution are provided. The existing authenticated WeatherAPI
broker fallback is retained. No real device GPS query or paid weather call was
used during verification. [BigDataCloud browser API](https://www.bigdatacloud.com/free-api/free-reverse-geocode-to-city-api)

## Validation

- All 12 `test:*` unit commands passed: journal, scoped persistence, shared Notion
  outbox, tombstones, Notion backup, itinerary merge, theme preference, local trip
  parser, archived trip rehome, currency math, audit and current location.
- Compact `typecheck`, `build`, `security:scan`, and canonical shared-ledger scan
  passed. The static shared-ledger matcher requires the existing contiguous
  `.in(...).order(...)` chain; formatting was kept compatible.
- React/Compact shared-contract browser check passed for schema v4, trip/receipt/
  people/settings, ownership, sharing, tombstone/version, split and backend identity
  metadata. Runtime queue recovery intentionally differs; persisted contracts agree.
- Full browser run: 124 passed, 21 pre-existing skips, one Scan timeout. The Scan
  flow passed on an isolated rerun, together with two added receipt/date cases and
  the updated read-only assertion. In total, 127 distinct browser cases have passed;
  the 21 skipped cases are not counted as verified. After visual fixes, all 31
  weather/theme/navigation/accessibility cases passed again.
- Weather covers 14 cases, including all five direct provider paths, current
  location/denial/privacy, 320-pixel layout, cache refresh/offline provenance,
  country-aware geocoding, trip switches and date bounds. Dark weather text samples
  exceeded 4.5:1 contrast; visual review additionally found and corrected the light
  overview heading contrast and mobile shell title truncation.
- Tests use disposable browser profiles and mocked external calls. Playwright
  blocks unmocked external DNS and service workers. Live provider evidence is
  read-only and separate from deterministic regression fixtures.

Earlier failures included outdated retry/title expectations, tests reseeding
storage on reload, missing network fixtures, and measuring an animated element
before it settled. Those fixtures were corrected with their behavioral assertions
retained. No failing check was disabled to obtain a pass.

This is local readiness evidence. Production authentication, provider availability,
real-device GPS, deployment and a live DB/RLS migration were not exercised.

## Design-hook follow-up — 0.25.1

Reviewed the Weather bulletin's single-side accent border as unnecessary decoration.
Removed the 3-pixel colored left edge and asymmetric corners; retained the uniform
1-pixel theme border with 12-pixel corners. No suppression was added and no finding
was left unresolved. Mobile/light and dark previews were regenerated.
