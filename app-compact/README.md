# Travel Expense Compact

This is the independent compact version of the Travel Expense app.

- Local dev: `npm run dev`
- Local URL: `http://localhost:8903/travel-expense/compact/`
- Production URL: `https://travel-expense-compact.vercel.app`
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
Vite base path, Vercel project, mobile scroll contract, and centered circular Scan
dock. Changes here should not be mirrored into `app-react/` or the legacy root app
unless Boss explicitly asks for parity work.

## Weather Provider Priority

Compact Weather should prefer official local meteorological data when an itinerary
country/region has a safe source. Japan trips currently use JMA official public
JSON first (`www.jma.go.jp` forecast + AMeDAS observations), then fill missing
fields with broker-backed WeatherAPI or Open-Meteo fallback data. Do not let a
private WeatherAPI cache replace fresh JMA official data for Japan.

Official providers with required keys or strict User-Agent/cache rules must go
through the Credential Broker or another backend proxy, not the public frontend.
Current research notes: Singapore NEA/data.gov.sg and US NWS are strong
browser-direct candidates; Canada MSC GeoMet is promising but needs
normalization; Korea KMA, Taiwan CWA, UK Met Office, DWD, Meteo-France, BOM, and
MET Norway production use should be broker/proxy-backed because of keys, CORS,
User-Agent, parsing, cache, or licence constraints.

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
