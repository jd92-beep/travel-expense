# Travel Expense Compact

This is the independent compact version of the Travel Expense app.

- Local dev: `npm run dev`
- Local URL: `http://localhost:8903/travel-expense/compact/`
- Netlify production URL: `https://travel-expense-compact.netlify.app`
- Vercel production URL: `https://travel-expense-compact.vercel.app`
- Netlify site: `travel-expense-compact`
- Vercel project: `travel-expense-compact`
- Compact UI system: `DESIGN_SYSTEM.md`
- Mobile visual QA: `npm run smoke:contact-sheet`
- Accessibility/touch QA: `npm run smoke:a11y-touch`
- Live broker preflight: `npm run smoke:broker-live`
- Prepare local broker proof session: `npm run broker-vault:prepare`
- Broker vault guard: `npm run smoke:broker-vault:guard`
- Authenticated broker vault proof: `npm run smoke:broker-vault`
- Core release gate: `npm run smoke:production-gate`
- Post-deploy live proof: `npm run smoke:deploy-live`

The compact version is an independent React + Vite app with its own package,
Vite base path, Netlify site, Vercel project, mobile scroll contract, and centered circular Scan
dock. The Pages root is a stateless CSP-protected redirect to this maintained app. Changes here
should not be mirrored into `app-react/`
unless Boss explicitly asks for parity work.

## Local export downloads

Settings → 資料管理 → 下載旅程資料 exports a current-trip ZIP. The default is data only;
check **連同收據圖片下載** to add receipt images. Extract the entire archive, then open
`summary.html` to read/print an offline report, or open the organized CSV files in Excel/Numbers.
`backup.json` restores text data through the existing import preview; it does not restore photos.
Cloud originals use the initiating account's private Storage access. Locally available thumbnails
and unavailable images are explicitly reported. Cancellation creates no download.

See [the format contract](../docs/compact-export-format.md) for the file inventory and limits.
Run `npm run test:trip-export` for mocked photo-access contracts, `npm run smoke:exports` for
actual ZIP/download/restore/offline-link checks, and `npm run smoke:settings` for both Settings
and export browser suites. All use disposable fixtures; no production receipt writes are needed.

## Shared Trip Contract Notes

Compact and React must keep the same trip/itinerary data contract. In particular,
`src/domain/trip/normalize.ts` normalizes itinerary dates before generating
`dayId` and `spotId`. It accepts ISO dates plus common copied-itinerary formats
such as `2026/6/13`, `2026年6月13日`, `6/13`, and `6月13日`. Month/day-only values
infer the year from another itinerary day or the trip id, avoiding browser
timezone parsing that can shift dates to the previous day.

`normalizeItinerary()` has CRITICAL blast radius in GitNexus because Timeline,
Weather, Settings, Stats, receipt stamping, Supabase, and Notion sync all depend
on stable itinerary days. After touching it, run at least typecheck plus targeted
Timeline/Weather/Settings/shared-contract checks before claiming live proof.

## Weather data and current location

The Weather tab and Dashboard share `src/lib/weather.ts`. Observations, daily
bulletins and hourly forecasts retain separate sources, issue times and destination
timezones. Missing readings remain unknown; daily temperatures and HKO significant
rain categories never generate invented hourly numbers.

| Region | Direct official data | Hourly supplement |
| --- | --- | --- |
| Hong Kong | HKO current observations and nine-day bulletin | Open-Meteo, labelled model data |
| Japan | JMA mapped forecast areas and nearest quality-checked AMeDAS station within 30 km | Open-Meteo JMA model, labelled model data |
| Singapore | NEA/data.gov.sg station readings and current two-hour bulletin | Open-Meteo, labelled model data |
| United States | NWS point-specific hourly forecast | Model only if official hours unavailable |
| Canada | MSC City Page Weather observation and native hours, nearest city within 50 km | Model only if official hours unavailable |
| Other supported destinations | Official agency link; no claim of a live official connection | Available regional government model through Open-Meteo; generic fallback labelled separately |

Taiwan CWA, Korea KMA and UK Met Office credentials, and MET Norway production
proxy identification/caching, need a separately configured backend. This release
adds no keys, subscriptions or backend deployment. Existing authenticated
WeatherAPI broker fallback is retained when public hourly services fail.

“使用目前位置” requests browser geolocation only on click, resolves country and
timezone via BigDataCloud, and displays accuracy/permission recovery. BigDataCloud
receives coordinates and uses anonymous GPS/IP associations as disclosed beside
the button. Device location is not written to app storage or the weather cache.
Weather queries require an identified timezone; an Open-Meteo timezone lookup can
complete missing metadata.

Trip forecast cache: 20-minute freshness, at most six hours of explicitly stale
fallback, 24 entries, keyed by coordinates/country/timezone/date. Refresh bypasses
both report and endpoint caches. Past dates and dates beyond the 16-day model
window show actionable limits instead of another date's forecast.

See [the audit and provider evidence](../docs/reviews/2026-10-03-compact-audit.md).

## Broker Vault Proof

`npm run smoke:broker-vault:guard` is safe for normal release gates. It sends no
session, expects the live broker to reject the request, and proves provider calls
fail closed.

`npm run smoke:broker-vault` is optional authenticated proof. It only runs provider
checks when you supply a local ignored session through `.broker-vault-session.local.json`
or local env. Do not commit or print these values.

`npm run broker-vault:prepare` helps create that ignored local session file. It
prompts locally without echoing the input, calls
the live broker `/session/unlock`, writes only `.broker-vault-session.local.json`
with permission `0600`, and prints only redacted status/expiry metadata. Use
`npm run broker-vault:prepare -- --dry-run` first if you only want to check the
target file is git-ignored.

```json
{
  "credentialSession": "redacted local broker session",
  "credentialSessionExpiresAt": 1790000000000
}
```

You may also use `supabaseAccessToken` instead of `credentialSession` for a
public-user proof. The script redacts provider output and prints only status/shape
summaries.

If `broker-vault:prepare` reports `status: "ready"` but
`smoke:broker-vault` exits `2`, the unlock password/session path has already
worked. Read the redacted `failures` list: Kimi billing-cycle quota, unavailable
Google/Gemma model ids, Mimo provider config/backend 404s, or temporary provider
high-demand messages are live provider/account blockers, not local folder or
password failures. Do not add frontend fallback calls after quota/rate-limit
errors.
