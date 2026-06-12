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
dock. Changes here should not be mirrored into `app-react/` or the legacy root app
unless Boss explicitly asks for parity work.

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

## Weather Provider Priority

Compact Weather should prefer official local meteorological data when an itinerary
country/region has a safe source. Current browser-direct official providers are:

- Japan: JMA official public JSON (`www.jma.go.jp` forecast + AMeDAS observations).
- Singapore: NEA/data.gov.sg real-time readings and two-hour forecast.
- United States: NWS `api.weather.gov` point and hourly forecast APIs.
- Canada: MSC GeoMet City Page Weather current conditions.

Official data remains the displayed provider. Broker-backed WeatherAPI or
Open-Meteo should only fill fields the official source does not provide, such as
feels-like, UV, cloud cover, or wind gusts. Do not let a private WeatherAPI cache
replace fresh official data.

Official providers with required keys or strict User-Agent/cache rules must go
through the Credential Broker or another backend proxy, not the public frontend.
Korea KMA, Taiwan CWA, UK Met Office, DWD, Meteo-France, BOM, and MET Norway
production use should be broker/proxy-backed because of keys, CORS, User-Agent,
parsing, cache, or licence constraints.

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
