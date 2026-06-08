# Travel Expense Compact

This is the independent compact version of the Travel Expense app.

- Local dev: `npm run dev`
- Local URL: `http://localhost:8903/travel-expense/compact/`
- Production URL: `https://travel-expense-compact.vercel.app`
- Vercel project: `travel-expense-compact`
- Compact UI system: `DESIGN_SYSTEM.md`
- Mobile visual QA: `npm run smoke:contact-sheet`
- Live broker preflight: `npm run smoke:broker-live`
- Broker vault guard: `npm run smoke:broker-vault:guard`
- Authenticated broker vault proof: `npm run smoke:broker-vault`
- Core release gate: `npm run smoke:production-gate`

The compact version is an independent React + Vite app with its own package,
Vite base path, Vercel project, mobile scroll contract, and centered circular Scan
dock. Changes here should not be mirrored into `app-react/` or the legacy root app
unless Boss explicitly asks for parity work.

## Broker Vault Proof

`npm run smoke:broker-vault:guard` is safe for normal release gates. It sends no
session, expects the live broker to reject the request, and proves provider calls
fail closed.

`npm run smoke:broker-vault` is optional authenticated proof. It only runs provider
checks when you supply a local ignored session through `.broker-vault-session.local.json`
or local env. Do not commit or print these values.

```json
{
  "credentialSession": "redacted local broker session",
  "credentialSessionExpiresAt": 1790000000000
}
```

You may also use `supabaseAccessToken` instead of `credentialSession` for a
public-user proof. The script redacts provider output and prints only status/shape
summaries.
