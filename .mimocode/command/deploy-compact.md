---
description: Typecheck, build, and deploy the compact app to Vercel production, then verify the live URL returns 200.
---

# Deploy Compact App

Run the full deploy cycle for `app-compact/`:

1. Typecheck: `npm run typecheck` (in `app-compact/`)
2. Build: `npm run build` (in `app-compact/`)
3. Deploy: `npx vercel --prod --yes` (in `app-compact/`)
4. Verify: `curl -s -o /dev/null -w "%{http_code}" https://travel-expense-compact.vercel.app/`

If typecheck fails, fix errors before proceeding. If build fails, check for missing dependencies or TypeScript errors. If deploy fails, check Vercel auth and project link.

After deploy, wait 10-15 seconds for Vercel propagation before verifying the live URL.
