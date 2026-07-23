# Architecture Deepening Design

**Status:** Approved by Boss on 2026-07-23; implementation pending spec review.

## Objective

Deepen four recently stressed areas without changing the established product
contracts:

1. Offline Change Journal
2. Scoped Hydration
3. Shared-trip Notion Outbox
4. Provider Catalog

The work proceeds as four independently reversible milestones. Main Compact,
Broker, Admin BFF, and Supabase Edge are completed and verified first. Applicable
Compact changes are then ported to the isolated Android worktree.

## Non-goals

- No UI redesign or new user workflow.
- No storage-key or `AppState` schema migration.
- No Supabase table, migration, RLS, or live user-data change.
- No Broker route, credential, vault, quota, or production write-mode change.
- No generic queue or outbox framework.
- No direct merge between the main and Android worktrees.
- No release APK or AAB.

The one observable correction is restoring the existing safe-catalog invariant:
Admin Providers must recognize all six documented Volcano LLMs, including
`volcano/kimi-k3`. Compact Web keeps its current selector exposure; Android keeps
Kimi K3 for its four recognition tasks.

## Existing Contracts To Preserve

- Storage key remains `boss-japan-tracker`, including account-scoped keys.
- Queue identity remains `type + entityId`.
- Queue size remains bounded at 500 items.
- Retryable offline/network failures may recover automatically.
- Exhausted attempts, `40001`, and version conflicts remain terminal evidence.
- Manual retry is the only action that resets terminal attempts.
- Supabase remains the primary public ledger; Notion remains a mirror.
- Shared-ledger Receipt writes continue through Supabase and its outbox.
- A Mirror Job failure never erases the successful ledger write.
- AI `429`, quota, and daily-limit responses remain hard stops.
- Selected-model tests remain exact-model, `kind=test`, eight output tokens, and
  no fallback.

## Rollout Order

```text
Offline Change Journal
  -> Scoped Hydration
  -> Shared-trip Notion Outbox
  -> Provider Catalog
  -> Android port and QA
```

Each milestone gets its own implementation commit, app version bump when app code
changes, focused tests, full required gates, and HANDOVER evidence. A later
milestone does not start until the previous milestone is green.

## Milestone 1: Offline Change Journal

### Module

Create one Compact-internal deep module that owns Change Journal identity,
deduplication, metadata retention, attempt transitions, terminal evidence,
tombstones, restoration, and the 500-item bound.

`useSyncEngine` remains the external synchronization seam. React lifecycle,
Supabase, and Notion stay outside the Change Journal implementation.

### Interface

The interface has three behavior-level entry points:

```ts
enqueueChange(queue, change): SyncQueueItem[]
settleChange(queue, itemId, outcome): JournalResult
restoreJournal(queue): JournalResult
```

`change` omits generated identity, status, attempts, and timestamps. The module
generates those values and preserves older cloud metadata when deduplicating.
Clock and ID generation are internal test seams, not caller requirements.

`JournalResult` contains the canonical queue plus its pending count, failed count,
status signal, and safe error evidence. Callers do not recalculate those facts.

### Callers

The following code must stop constructing or transitioning queue items directly:

- `app-compact/src/lib/useAppState.ts`
- `app-compact/src/lib/useSyncEngine.ts`
- `app-compact/src/lib/storage.ts`
- `app-compact/src/tabs/Settings.tsx`

### Verification

Tests exercise the interface with sequences, not internal helpers:

- offline Receipt save followed by reconnect;
- duplicate enqueue while an upload is active;
- earlier cloud metadata retained by a newer local change;
- transient failure and bounded retry;
- exhausted failure preserved across cold open;
- `40001` and version conflict preserved;
- manual retry explicitly resets attempts;
- Receipt deletion retains tombstone evidence;
- queue remains bounded and deterministic.

Existing browser smokes remain as end-to-end evidence. Tests that only assert old
private helper details are removed after equivalent interface coverage exists.

## Milestone 2: Scoped Hydration

### Module

Create one internal persistence module with authority over Account Scope
hydration and persistence. localStorage and IndexedDB remain two real adapters.

The module owns:

- scope-key resolution;
- snapshot availability and freshness;
- per-Receipt merge;
- `AppState` migration and normalization;
- public-demo Trip removal;
- legacy secret stripping;
- Change Journal restoration;
- compatibility fallback when one adapter fails.

`useAppState` keeps React lifecycle and receives one canonical `AppState`. It no
longer decides which snapshot wins.

### Interface

The behavior-level interface is:

```ts
hydrateScope(scope, userEmail): Promise<AppState>
persistScope(scope, userEmail, state): Promise<PersistResult>
```

Adapter seams remain internal to the implementation. Production uses localStorage
and IndexedDB; tests use in-memory adapters.

`PersistResult` reports which adapters succeeded without exposing stored secrets
or raw snapshot contents. One successful adapter is a degraded success, not data
loss. Two failures preserve the current state in memory and return safe evidence.

### Verification

- no primary snapshot, valid IndexedDB snapshot;
- newer localStorage with older IndexedDB;
- newer IndexedDB with per-Receipt local wins;
- malformed snapshot on either adapter;
- account switch during asynchronous hydration;
- public Account Scope does not inherit the demo Trip;
- legacy secret fields are removed;
- terminal Change Journal evidence survives both adapters;
- write failure on one adapter leaves the other usable.

No storage key or serialized field changes in this milestone.

## Milestone 3: Shared-trip Notion Outbox

### Module

Move Mirror Job orchestration out of the Supabase adapter into one deep module.
The module owns the flow; Supabase and Notion remain separate adapters.

### Interface

The external interface is one operation:

```ts
drainSharedTripOutbox(context, adapters): Promise<OutboxSummary>
```

The implementation hides:

1. claiming the existing bounded batch;
2. reading the Receipt and optional signed photo;
3. creating, updating, or archiving the Notion page;
4. recording Supabase completion or safe failure evidence;
5. continuing after one Mirror Job fails.

The current batch count and per-cycle limits remain unchanged.

### Adapter Ports

The Supabase port covers claim, Receipt/photo lookup, completion, and failure.
The Notion port covers Receipt upsert and archive. Production adapters reuse the
existing functions. Tests use in-memory adapters.

The module is specific to shared-trip Notion mirroring. It does not become a
generic outbox framework.

### Verification

- empty outbox;
- duplicate claim is not processed twice;
- text-only Receipt success;
- signed-photo success;
- photo lookup/upload failure preserves the Mirror Job;
- Notion failure records safe evidence and continues;
- Notion success followed by Supabase completion failure remains recoverable;
- archive job uses the Notion archive path;
- one failed job does not fail global synchronization;
- summary counts match observable adapter outcomes.

The existing positive live shared-Receipt-to-Notion proof remains a separate
HANDOVER open item; architecture tests do not claim that production evidence.

## Milestone 4: Provider Catalog

### Contract

Add a tracked, secret-free root contract:

```text
contracts/ai-provider-catalog.json
```

Each model record contains only:

- full provider/model ID;
- display label;
- safe default role, when applicable;
- permitted tasks;
- permitted surfaces.

Surfaces distinguish Compact Web, Android, Broker, Admin BFF, and Supabase Edge.
This preserves current selector behavior while making cross-runtime allowlists
authoritative.

### Runtime Adapters

Each runtime keeps a thin adapter that converts the JSON into its required
array, `Set`, or typed record. Runtime adapters may further restrict a surface;
they may not add a model absent from the catalog.

Direct JSON import is preferred because Compact already supports JSON modules,
Vite allows the repository root, and the Node/Worker runtimes are ESM. Supabase
Edge import is proven in its local check before adoption. If its deployment
bundle cannot include the root JSON, one deterministic generator emits only the
Edge adapter and CI rejects stale generated output.

Runtime network fetch is forbidden.

### Verification

A contract test proves:

- every Broker model is present and provider-correct;
- every Admin probe model is Broker-allowed;
- every Compact/Android selector model is surface-allowed;
- every default points to an existing model;
- task capability matches selector use;
- Admin Providers includes all six safe Volcano LLMs;
- `volcano/kimi-k3` is accepted by Broker, Android, Admin BFF, and Edge;
- Compact Web exposure remains unchanged;
- media models such as Seedance are absent;
- no duplicate provider/model ID exists.

Provider credentials, endpoints, quotas, and health state never enter the
catalog.

## Error Handling

- Errors crossing a module interface are safe, bounded, and credential-redacted.
- Journal terminal evidence is data and is never cleared to hide a banner.
- Hydration never replaces a fresher Receipt with an older adapter copy.
- Outbox failures are recorded per Mirror Job and do not erase ledger success.
- Catalog validation fails builds and tests; it does not silently drop unknown
  models at runtime.
- No milestone weakens an existing fail-closed authentication or authorization
  path.

## Verification Gates

### Main Compact

```bash
cd app-compact
npm run typecheck
npm run build
npm run security:scan
npm run smoke:offline
npm run smoke:sync-regression
npm run smoke:supabase-backfill
npm run smoke:settings
npm run smoke:ai-routing
npm run smoke:mobile-layout
```

Run only scripts that exist in `package.json`; use the equivalent focused
Playwright file when a named wrapper is absent.

### Credential Broker

```bash
cd workers/credential-broker
npm run check
npm run self-test
```

### Admin And Edge

Run Admin typecheck, build, security, unit, contract, and focused provider smoke.
Run Edge format, lint, check, and tests. Production deployment is not part of an
architecture milestone unless separately authorized by the existing protected
workflow.

### Android Port

After all four main milestones are green, port applicable Compact files to
`/Users/tommy/Documents/Codex/travel-expense-android-shell` on
`codex/admin-console-1.0-android` in separate commits. Reconcile Android-only
Kimi K3 and version metadata rather than overwriting them.

Run:

```bash
cd /Users/tommy/Documents/Codex/travel-expense-android-shell/app-compact
npm run typecheck
npm run build
npm run security:scan
npm run smoke:offline
npm run smoke:sync-regression
npm run android:debug
npm run android:qa
```

Focused Android evidence must include reconnect during upload, duplicate change
enqueue, terminal conflict persistence, and App Links. No release artifact is
created.

## Rollback

Each milestone is independently revertible. Reverting a milestone restores its
previous module placement without requiring data migration. The Provider Catalog
milestone reverts its runtime adapters and root JSON together so no runtime is
left with a partial contract.

## Documentation

Every implementation milestone updates:

- the touched app version metadata;
- `CHANGELOG.md` for user-visible fixes;
- `HANDOVER.md` with exact commands and results;
- GitNexus index only after meaningful symbol or execution-flow changes.

This design introduces no ADR. The rollout is reversible, follows existing
contracts, and does not resolve a hard-to-reverse trade-off.
