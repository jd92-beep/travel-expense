# Travel Expense Compact

This is the independent compact version of the Travel Expense app.

- Local dev: `npm run dev`
- Local URL: `http://localhost:8903/travel-expense/compact/`
- Production URL: `https://travel-expense-compact.vercel.app`
- Vercel project: `travel-expense-compact`
- Compact UI system: `DESIGN_SYSTEM.md`
- Mobile visual QA: `npm run smoke:contact-sheet`
- Live broker preflight: `npm run smoke:broker-live`

The compact version is an independent React + Vite app with its own package,
Vite base path, Vercel project, mobile scroll contract, and centered circular Scan
dock. Changes here should not be mirrored into `app-react/` or the legacy root app
unless Boss explicitly asks for parity work.
