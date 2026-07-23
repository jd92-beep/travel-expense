# AI Provider Catalog Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make one tracked, secret-free AI model catalog authoritative across Compact, Broker, Admin BFF, and Supabase Edge while restoring Admin recognition of `volcano/kimi-k3`.

**Architecture:** Store model metadata in root JSON and give each runtime one thin local adapter. Runtimes import the JSON at build time; no network fetch, runtime config service, or new dependency is introduced.

**Tech Stack:** JSON, Node 22 ESM, TypeScript 5.8, Vite 8, Wrangler 4, Deno, Supabase Edge

## Global Constraints

- Start only after the first three architecture milestones are green on `origin/main`.
- The catalog contains no key, token, endpoint secret, session material, or vault value.
- Compact Web keeps its current selector set and does not expose `volcano/kimi-k3`.
- Android and Broker keep `volcano/kimi-k3`; Admin BFF and Supabase Edge must recognize all six safe Volcano LLMs.
- Seedance and every media/video model remain absent.
- Selected-model tests remain exact model, `kind=test`, eight output tokens, and no fallback.
- Quota, daily-limit, and `429` responses remain hard stops.
- Do not change Broker routes, provider base URLs, Admin write mode, database, RLS, credentials, or live data.
- Bump Compact `0.16.15` to `0.16.16`, Admin `1.3.1` to `1.3.2`, and Broker `2026.07.20.1` to `2026.07.23.1`.
- Keep Boss's unrelated `CLAUDE.md` change unstaged.

---

### Task 1: Add the catalog contract and runtime adapters

**Files:**
- Create: `contracts/ai-provider-catalog.json`
- Create: `scripts/provider-catalog-contract.test.mjs`
- Create: `app-compact/src/lib/providerCatalog.ts`
- Create: `workers/credential-broker/src/provider-catalog.js`
- Create: `app-admin-kanban/server/admin/provider-catalog.js`
- Create: `supabase/functions/admin-kanban/provider_catalog.ts`
- Modify: `app-compact/src/lib/constants.ts`
- Modify: `workers/credential-broker/src/index.js`
- Modify: `workers/credential-broker/test/self-test.mjs`
- Modify: `app-admin-kanban/server/admin/gateway-routes.js`
- Modify: `app-admin-kanban/tests/server/gateway-routes.test.js`
- Modify: `supabase/functions/admin-kanban/system_status.ts`
- Modify: `supabase/functions/admin-kanban/operations.ts`
- Modify: `supabase/functions/admin-kanban/system_status_test.ts`
- Modify: `supabase/functions/admin-kanban/operations_test.ts`
- Modify: `app-compact/package.json`
- Modify: `app-compact/package-lock.json`
- Modify: `app-admin-kanban/package.json`
- Modify: `app-admin-kanban/package-lock.json`
- Modify: `HANDOVER.md`

**Interfaces:**
- Consumes: model IDs already accepted by Compact, Broker, Admin BFF, and Supabase Edge.
- Produces: catalog records `{ id, label, tasks, defaultFor, surfaces }`; each adapter exports its runtime's model list/map.

- [ ] **Step 1: Record impacts and prove build-time JSON syntax**

Run:

```bash
node .gitnexus/run.cjs status
node .gitnexus/run.cjs impact AI_MODELS --direction upstream
node .gitnexus/run.cjs impact PROVIDER_MODELS --direction upstream
node --input-type=module -e 'import value from "./app-compact/package.json" with { type: "json" }; console.log(value.name)'
deno eval 'import value from "./app-compact/package.json" with { type: "json" }; console.log(value.name)'
```

Expected: model selector/probe flows are listed; both runtimes print `travel-expense-compact`. Stop and notify Boss before edits if impact is HIGH or CRITICAL.

- [ ] **Step 2: Add the failing cross-runtime contract test**

Create `scripts/provider-catalog-contract.test.mjs`:

```js
import assert from 'node:assert/strict';
import catalog from '../contracts/ai-provider-catalog.json' with { type: 'json' };
import { COMPACT_AI_MODELS } from '../app-compact/src/lib/providerCatalog.ts';
import { PROVIDER_MODELS as BROKER_MODELS } from '../workers/credential-broker/src/provider-catalog.js';
import { PROVIDER_MODELS as BFF_MODELS } from '../app-admin-kanban/server/admin/provider-catalog.js';
import { PROVIDER_MODELS as EDGE_MODELS } from '../supabase/functions/admin-kanban/provider_catalog.ts';

const records = catalog.providers.flatMap((provider) => provider.models);
const ids = records.map((record) => record.id);
assert.equal(new Set(ids).size, ids.length);
for (const provider of catalog.providers) {
  assert.ok(provider.models.every((record) =>
    record.id.startsWith(`${provider.id}/`)));
}
assert.equal(ids.some((id) => /seedance/i.test(id)), false);

const surfaceIds = (surface) => records
  .filter((record) => record.surfaces.includes(surface))
  .map((record) => record.id)
  .sort();
const flatten = (record) => Object.values(record).flat().sort();

assert.deepEqual(COMPACT_AI_MODELS.map((model) => model.id).sort(), surfaceIds('compact'));
assert.deepEqual(flatten(BROKER_MODELS), surfaceIds('broker'));
assert.deepEqual(flatten(BFF_MODELS), surfaceIds('admin-bff'));
assert.deepEqual(flatten(EDGE_MODELS), surfaceIds('admin-edge'));

const safeVolcano = [
  'volcano/doubao-seed-2.0-lite',
  'volcano/doubao-seed-2.0-pro',
  'volcano/minimax-m3',
  'volcano/minimax-m2.7',
  'volcano/doubao-seed-2.0-mini',
  'volcano/kimi-k3',
].sort();
assert.deepEqual(BFF_MODELS.volcano.slice().sort(), safeVolcano);
assert.deepEqual(EDGE_MODELS.volcano.slice().sort(), safeVolcano);
assert.equal(COMPACT_AI_MODELS.some((model) => model.id === 'volcano/kimi-k3'), false);
assert.ok(records.find((record) => record.id === 'volcano/kimi-k3')
  ?.surfaces.includes('android'));

for (const task of ['scan', 'voice', 'email', 'trip-update']) {
  const defaults = records.filter((record) => record.defaultFor.includes(task));
  assert.equal(defaults.length, 1, `one safe default required for ${task}`);
}

console.log('provider catalog contract passed');
```

Run:

```bash
node --experimental-strip-types scripts/provider-catalog-contract.test.mjs
```

Expected: FAIL because the catalog and adapter modules do not exist.

- [ ] **Step 3: Add the complete root catalog**

Create `contracts/ai-provider-catalog.json`:

```json
{
  "schemaVersion": 1,
  "providers": [
    {
      "id": "kimi",
      "label": "Kimi",
      "models": [
        { "id": "kimi/kimi-code", "label": "Kimi (kimi-code)", "tasks": ["scan", "voice", "email", "trip-update", "test"], "defaultFor": [], "surfaces": ["compact", "android", "broker", "admin-bff", "admin-edge"] },
        { "id": "kimi/kimi-8k", "label": "Kimi (kimi-8k)", "tasks": ["scan", "voice", "email", "trip-update", "test"], "defaultFor": [], "surfaces": ["compact", "android", "broker", "admin-bff", "admin-edge"] },
        { "id": "kimi/kimi-32k", "label": "Kimi (kimi-32k)", "tasks": ["scan", "voice", "email", "trip-update", "test"], "defaultFor": [], "surfaces": ["compact", "android", "broker", "admin-bff", "admin-edge"] },
        { "id": "kimi/kimi-k2.6", "label": "Kimi (kimi-k2.6)", "tasks": ["scan", "voice", "email", "trip-update", "test"], "defaultFor": [], "surfaces": ["compact", "android", "broker", "admin-bff", "admin-edge"] },
        { "id": "kimi/kimi-for-coding", "label": "Kimi (kimi-for-coding)", "tasks": ["scan", "voice", "email", "trip-update", "test"], "defaultFor": [], "surfaces": ["compact", "android", "broker", "admin-bff", "admin-edge"] }
      ]
    },
    {
      "id": "google",
      "label": "Google",
      "models": [
        { "id": "google/gemini-2.5-flash", "label": "Google Gemini 2.5 Flash", "tasks": ["scan", "voice", "email", "trip-update", "test"], "defaultFor": [], "surfaces": ["compact", "android", "broker", "admin-bff", "admin-edge"] },
        { "id": "google/gemini-3.1-flash", "label": "Google Gemini 3.1 Flash", "tasks": ["scan", "voice", "email", "trip-update", "test"], "defaultFor": [], "surfaces": ["compact", "android", "broker", "admin-bff", "admin-edge"] },
        { "id": "google/gemini-3.1-flash-lite", "label": "Google Gemini 3.1 Flash Lite", "tasks": ["scan", "voice", "email", "trip-update", "test"], "defaultFor": [], "surfaces": ["compact", "android", "broker", "admin-bff", "admin-edge"] },
        { "id": "google/gemma-4-31b-it", "label": "Google Gemma 4 31B", "tasks": ["scan", "voice", "email", "trip-update", "test"], "defaultFor": [], "surfaces": ["compact", "android", "broker", "admin-bff", "admin-edge"] },
        { "id": "google/gemma-4-26b", "label": "Google Gemma 4 26B", "tasks": ["scan", "voice", "email", "trip-update", "test"], "defaultFor": [], "surfaces": ["compact", "android", "broker", "admin-bff", "admin-edge"] }
      ]
    },
    {
      "id": "mimo",
      "label": "Mimo",
      "models": [
        { "id": "mimo/mimo-v2.5", "label": "Mimo v2.5", "tasks": ["scan", "voice", "email", "trip-update", "test"], "defaultFor": ["scan", "voice"], "surfaces": ["compact", "android", "broker", "admin-bff", "admin-edge"] },
        { "id": "mimo/mimo-v2.5-pro", "label": "Mimo v2.5 Pro", "tasks": ["scan", "voice", "email", "trip-update", "test"], "defaultFor": ["email", "trip-update"], "surfaces": ["compact", "android", "broker", "admin-bff", "admin-edge"] }
      ]
    },
    {
      "id": "volcano",
      "label": "Volcano",
      "models": [
        { "id": "volcano/doubao-seed-2.0-lite", "label": "Volcano (doubao-seed-2.0-lite)", "tasks": ["scan", "voice", "email", "trip-update", "test"], "defaultFor": [], "surfaces": ["compact", "android", "broker", "admin-bff", "admin-edge"] },
        { "id": "volcano/doubao-seed-2.0-pro", "label": "Volcano (doubao-seed-2.0-pro)", "tasks": ["scan", "voice", "email", "trip-update", "test"], "defaultFor": [], "surfaces": ["compact", "android", "broker", "admin-bff", "admin-edge"] },
        { "id": "volcano/minimax-m3", "label": "Volcano (minimax-m3)", "tasks": ["scan", "voice", "email", "trip-update", "test"], "defaultFor": [], "surfaces": ["compact", "android", "broker", "admin-bff", "admin-edge"] },
        { "id": "volcano/minimax-m2.7", "label": "Volcano (minimax-m2.7)", "tasks": ["scan", "voice", "email", "trip-update", "test"], "defaultFor": [], "surfaces": ["compact", "android", "broker", "admin-bff", "admin-edge"] },
        { "id": "volcano/doubao-seed-2.0-mini", "label": "Volcano (doubao-seed-2.0-mini)", "tasks": ["scan", "voice", "email", "trip-update", "test"], "defaultFor": [], "surfaces": ["compact", "android", "broker", "admin-bff", "admin-edge"] },
        { "id": "volcano/kimi-k3", "label": "Volcano (Kimi K3)", "tasks": ["scan", "voice", "email", "trip-update", "test"], "defaultFor": [], "surfaces": ["android", "broker", "admin-bff", "admin-edge"] }
      ]
    }
  ]
}
```

- [ ] **Step 4: Add four thin adapters**

Use this TypeScript shape in `app-compact/src/lib/providerCatalog.ts`, filtering only `compact`:

```ts
import catalog from '../../../contracts/ai-provider-catalog.json';

type CatalogModel = {
  id: string;
  label: string;
  tasks: string[];
  defaultFor: string[];
  surfaces: string[];
};

export const COMPACT_AI_MODELS = catalog.providers
  .flatMap((provider) => provider.models as CatalogModel[])
  .filter((model) => model.surfaces.includes('compact'))
  .map((model) => ({ id: model.id, name: model.label }));
```

Use this ESM adapter pattern in Broker and Admin BFF, changing only the surface:

```js
import catalog from '../../../contracts/ai-provider-catalog.json' with { type: 'json' };

const forSurface = (surface) => Object.fromEntries(
  catalog.providers
    .map((provider) => [
      provider.id,
      provider.models
        .filter((model) => model.surfaces.includes(surface))
        .map((model) => model.id),
    ])
    .filter(([, models]) => models.length),
);

export const PROVIDER_MODELS = Object.freeze(forSurface('broker'));
```

`app-admin-kanban/server/admin/provider-catalog.js` uses `admin-bff`.

Use the typed equivalent in `supabase/functions/admin-kanban/provider_catalog.ts`:

```ts
import catalog from "../../../contracts/ai-provider-catalog.json" with { type: "json" };

export const PROVIDER_MODELS: Record<string, string[]> = Object.fromEntries(
  catalog.providers
    .map((provider) => [
      provider.id,
      provider.models
        .filter((model) => model.surfaces.includes("admin-edge"))
        .map((model) => model.id),
    ])
    .filter(([, models]) => (models as string[]).length),
) as Record<string, string[]>;
```

Direct Deno/Node JSON import was proven in Step 1, so no generated adapter or runtime fetch is required.

- [ ] **Step 5: Replace duplicate model arrays**

In Compact constants:

```ts
import { COMPACT_AI_MODELS } from './providerCatalog';
export const AI_MODELS = COMPACT_AI_MODELS;
```

In Broker `index.js`:

```js
import { PROVIDER_MODELS } from './provider-catalog.js';
```

In Admin BFF `gateway-routes.js`:

```js
import { PROVIDER_MODELS as PROVIDER_MODEL_LISTS } from './provider-catalog.js';
const PROVIDER_MODELS = new Map(
  Object.entries(PROVIDER_MODEL_LISTS).map(([provider, models]) =>
    [provider, new Set(models)]),
);
```

In both Supabase Edge files:

```ts
import { PROVIDER_MODELS } from "./provider_catalog.ts";
```

Delete only the replaced inline model arrays. Keep non-LLM providers, provider regex validation, base URLs, defaults, and route behavior unchanged.

- [ ] **Step 6: Run the contract and update runtime assertions**

Run:

```bash
node --experimental-strip-types scripts/provider-catalog-contract.test.mjs
```

Expected: `provider catalog contract passed`.

Add exact K3 assertions:

```js
assert.equal(PROVIDER_MODELS.volcano.includes('volcano/kimi-k3'), true);
```

Use that assertion in Broker self-test, Admin gateway contract test, and Edge test through each runtime's exported adapter. Also assert Compact does not include K3.

- [ ] **Step 7: Bump versions and run all runtime gates**

Set:

```text
Compact package/lock/APP_VERSION       0.16.16
Admin package/lock                     1.3.2
Broker VERSION                         2026.07.23.1
```

Run:

```bash
node --experimental-strip-types scripts/provider-catalog-contract.test.mjs
cd app-compact
npm run typecheck
npm run build
npm run security:scan
npm run smoke:ai-routing
npm run smoke:settings
cd ../workers/credential-broker
npm run check
npm run self-test
cd ../../app-admin-kanban
npm run typecheck
npm run build
npm run security:scan
npm run test:unit
npm run test:contract
cd ..
deno fmt --check supabase/functions/_shared supabase/functions/admin-auth-state supabase/functions/admin-kanban supabase/functions/receipt-sync-worker
deno lint supabase/functions/_shared supabase/functions/admin-auth-state supabase/functions/admin-kanban supabase/functions/receipt-sync-worker
deno check supabase/functions/admin-kanban/index.ts
deno test --allow-env supabase/functions
node scripts/security-scan.mjs
node .gitnexus/run.cjs detect-changes
git diff --check
```

Expected: contract pass line; all builds, security checks, runtime suites, Deno checks, and tests exit `0`; Admin tests recognize six Volcano models; Compact selector still excludes K3.

- [ ] **Step 8: Record evidence, commit, and push**

Update Open Item 18 to `All four main milestones complete; Android port and QA remain`. Do not close authenticated operator click items 16 or 17.

```bash
git add contracts/ai-provider-catalog.json scripts/provider-catalog-contract.test.mjs app-compact/package.json app-compact/package-lock.json app-compact/src/lib/constants.ts app-compact/src/lib/providerCatalog.ts workers/credential-broker/src/index.js workers/credential-broker/src/provider-catalog.js workers/credential-broker/test/self-test.mjs app-admin-kanban/package.json app-admin-kanban/package-lock.json app-admin-kanban/server/admin/gateway-routes.js app-admin-kanban/server/admin/provider-catalog.js app-admin-kanban/tests/server/gateway-routes.test.js supabase/functions/admin-kanban/provider_catalog.ts supabase/functions/admin-kanban/system_status.ts supabase/functions/admin-kanban/operations.ts supabase/functions/admin-kanban/system_status_test.ts supabase/functions/admin-kanban/operations_test.ts HANDOVER.md
git diff --cached --check
git status --short
git commit -m "refactor: centralize AI provider catalog"
git push origin main
```

Expected: `CLAUDE.md` remains unstaged; one cross-runtime catalog commit reaches `origin/main`. Production deployment remains a separate reviewed action and is not implied by this commit.
