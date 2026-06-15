# Travel Expense Admin KanBan Architecture

Last updated: 2026-06-15 HKT

## Objective

Create an independent cyber-themed admin KanBan board for monitoring the Travel
Expense production system. The board must show real, reliable operational data
for users, trips, expenses, Supabase, Notion mirror status, app usage, and LLM
provider health. It must also support normal KanBan workflows and high-privilege
admin actions such as deleting a user and that user's related trips/records.

This board must not weaken the public privacy model. Public users must only see
their own app data in the normal React/Compact apps. Cross-user visibility and
destructive admin actions belong only in an authenticated server-side admin
surface.

## Current Evidence

- Repo HEAD during planning: `bd0e62b`.
- GitNexus refreshed during planning: 9,007 nodes, 15,307 edges, 243 clusters,
  300 flows.
- Supabase project discovered through the Supabase connector:
  `travel-expense-public`, project ref `fbnnjoahvtdrnigevrtw`, region
  `ap-southeast-1`, status `ACTIVE_HEALTHY`, Postgres `17.6.1.121`.
- Live aggregate probe through the Supabase connector:
  - `auth.users`: 3
  - `public.profiles`: 3
  - `public.trips`: 1
  - `public.receipts`: 0
  - `public.receipt_items`: 0
  - `public.receipt_photos`: 0
  - `public.integrations`: 0
  - `public.receipt_sync_jobs`: 0
- RLS probe showed the core public tables all have `relrowsecurity=true` and
  `relforcerowsecurity=true`:
  `profiles`, `trips`, `trip_members`, `receipts`, `receipt_items`,
  `receipt_photos`, `integrations`, `receipt_sync_jobs`.
- Notion workspace search found the older shared Nagoya Notion data, but public
  production truth should not depend on that shared workspace. Notion should be
  monitored through `integrations`, receipt mirror columns, sync jobs, and
  broker-scoped status.
- Credential Broker has provider health endpoints:
  - `GET /health`
  - `GET /credentials/status`
  - `POST /credentials/test-all`
- Credential Broker currently supports Notion, Kimi, Google, WeatherAPI, and
  Mimo v2.5 provider paths and daily Supabase AI quota counters in KV.

## Non-Negotiable Security Rules

1. Do not expose Supabase service role credentials in any Vercel frontend.
2. Do not query all users or all receipts from the public React/Compact browser
   clients.
3. Do not show raw provider secrets, Notion tokens, API keys, session tokens, or
   database URLs.
4. Do not delete a user from the browser directly. Use a server-side admin API
   with re-authentication, preview counts, confirmation, and audit logging.
5. Do not use the Notion MCP workspace connector as the production app's
   source of truth. It is useful for discovery only.
6. Keep the admin board independent from the React and Compact apps. Shared data
   contracts are allowed; shared UI state is not.

## Proposed Shape

### Frontend

Create a new independent Vite/React app:

```text
app-admin-kanban/
  src/
    App.tsx
    components/
    lib/adminApi.ts
    lib/types.ts
    styles.css
  tests/
  package.json
  vite.config.ts
```

Deploy it as a separate Vercel project, for example:

```text
https://travel-expense-admin-kanban.vercel.app
```

The frontend is a cyber operations KanBan:

- Dark operational shell with neon cyan, magenta, amber, green, and red accents.
- Large-screen layout:
  - Left rail: board scope, live/stale state, filters, admin identity.
  - Top command bar: refresh, date range, data source status, search.
  - Main KanBan lanes.
  - Right inspector drawer for user/trip/receipt/provider detail.
- Mobile layout:
  - Scrollable tab page.
  - Horizontal lane picker.
  - One lane visible at a time.
  - Inspector opens as a full-screen sheet.

### Backend

Add a server-side admin API. Current implementation is split by authority:

```text
app-admin-kanban/api/                  # Vercel login + session verification
supabase/functions/admin-kanban/       # Supabase Edge live data/admin actions
```

Reason: keep admin service-role permissions inside Supabase Edge runtime instead
of Vercel or the browser. Vercel owns the admin passphrase, short-lived session
token, and `/api/verify-session`. The Supabase Edge Function validates each
Bearer session through Vercel, then owns cross-user reads and destructive admin
actions using Supabase runtime service-role env. The public Credential Broker
keeps provider credentials and user-facing AI calls.

A future hardening pass can move the same API contract to a separate
`workers/admin-kanban-api/` Cloudflare Worker if we want an even clearer runtime
boundary.

Admin API responsibilities:

- Verify admin identity and issue a short-lived admin session in Vercel.
- Verify the session from Supabase Edge before any cross-user read.
- Read aggregate and detail data from Supabase with Edge service-role env.
- Query Auth admin user data through Supabase Admin API.
- Read provider health from the Credential Broker.
- Optionally request a provider test run through the Credential Broker.
- Create audit records for every admin action.
- Perform two-step user deletion.

The Vercel session API needs these server-only secrets:

```text
ADMIN_KANBAN_SESSION_SECRET
ADMIN_KANBAN_HASH
ADMIN_KANBAN_SUBJECT
```

The Supabase Edge Function reads Supabase runtime env and optional URLs:

```text
SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
CREDENTIAL_BROKER_URL
ADMIN_KANBAN_VERIFY_URL
ADMIN_KANBAN_LOGIN_URL
```

The Vercel frontend stores no service-role secrets. It stores the public Edge API
base URL:

```text
VITE_ADMIN_API_URL
```

When `VITE_ADMIN_API_URL` is not set, the app can still use the same-origin
Vercel serverless routes under `/api/*` as a fallback, but production uses the
Supabase Edge Function.

### Supabase Additions

The existing tables are enough for users/trips/receipts/sync state, but not
enough for reliable app-usage frequency. Add telemetry and audit tables:

```sql
create table public.app_usage_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  session_id text not null,
  app_surface text not null check (app_surface in ('react', 'compact', 'legacy')),
  event_name text not null,
  tab_name text,
  trip_id uuid references public.trips(id) on delete set null,
  receipt_id uuid references public.receipts(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  user_agent text,
  created_at timestamptz not null default now()
);

create table public.admin_audit_events (
  id uuid primary key default gen_random_uuid(),
  admin_subject text not null,
  action text not null,
  target_type text not null,
  target_id text,
  request_id text,
  before_counts jsonb,
  result jsonb,
  created_at timestamptz not null default now()
);
```

RLS approach:

- `app_usage_events`: authenticated users can insert their own events and select
  only their own events if needed.
- `admin_audit_events`: no public browser select/insert. Admin API writes with
  service role only.
- Admin cross-user reads remain server-side only.

### App Usage Telemetry

Instrumentation should be small and event-based:

- `app_open`
- `tab_view`
- `receipt_create`
- `receipt_update`
- `receipt_delete`
- `trip_create`
- `trip_update`
- `notion_connect`
- `notion_pull`
- `notion_push`
- `ai_request_start`
- `ai_request_success`
- `ai_request_error`

React and Compact can share a tiny client helper that inserts into Supabase with
the signed-in user's JWT. Legacy can either be excluded from the first release or
send only local/no-auth events after a later privacy review.

### KanBan Lanes

Recommended first board:

1. `Live Users`
   - user cards: masked email, profile status, last seen, sessions, trip count,
     receipt count, Notion connected, AI usage today.
2. `Trip Ops`
   - trip cards: owner, trip name, date range, country/currency intelligence,
     active/archived, receipt count, updated time.
3. `Expense Flow`
   - receipt cards grouped by status: draft, pending, confirmed, archived,
     deleted.
4. `Notion Mirror`
   - integration status, mirror-ready users, receipts with Notion page IDs,
     failed sync jobs, last sync time.
5. `LLM Health`
   - broker status and provider cards for Kimi, Google Gemma, Mimo, WeatherAPI,
     and Notion.
6. `Backend Health`
   - Supabase table counts, RLS state, FORCE RLS state, migration scan result,
     API latency, stale-data warnings.
7. `Admin Actions`
   - deletion requests, pending confirmation, completed actions, audit trail.

Normal KanBan functions:

- Drag/move local cards between operational lanes for triage labels.
- Search users/trips/receipts.
- Filter by date range, app surface, user, trip, provider, status.
- Sort by last activity, total spend, error count, stale age, risk.
- Card detail inspector.
- Refresh now and auto-refresh.
- Local board preferences.
- Export filtered board summary as JSON/CSV.

Operational lane moves should not mutate production user/trip/receipt status
unless the action is explicitly an admin command with confirmation. Triage state
can live in a separate admin-only table later if needed.

## Reliable Data Contract

Admin API should expose one snapshot endpoint:

```http
GET /api/snapshot?range=7d
```

Response shape:

```ts
type AdminKanbanSnapshot = {
  generatedAt: string;
  staleAfterSeconds: number;
  supabase: {
    projectRef: string;
    status: 'healthy' | 'degraded' | 'unknown';
    counts: Record<string, number>;
    rls: Array<{ table: string; enabled: boolean; force: boolean }>;
  };
  usage: {
    rangeDays: number;
    events: number;
    activeUsers: number;
    sessions: number;
    bySurface: Array<{ surface: string; events: number; users: number }>;
  };
  users: AdminUserCard[];
  trips: AdminTripCard[];
  receipts: AdminReceiptCard[];
  notion: AdminNotionSummary;
  llm: AdminProviderHealth[];
  audit: AdminAuditEvent[];
};
```

For user information:

- Use masked email by default.
- Detail drawer can reveal full email only after admin re-auth in the same
  session.
- Show IDs only when copied or expanded.

## Delete User Workflow

Two-step workflow:

1. Preview:

```http
POST /admin/users/:userId/delete-preview
```

Returns counts:

- profile rows
- trips
- trip members
- receipts
- receipt items
- receipt photos
- integrations
- sync jobs
- usage events
- encrypted Notion credential presence

2. Confirm:

```http
POST /admin/users/:userId/delete
```

Body:

```json
{
  "confirmPhrase": "DELETE USER <masked-email-or-user-id>",
  "adminPassphrase": "<one-time reauth>"
}
```

Action:

- Insert admin audit row with preview counts.
- Delete/purge personal Notion credential through a broker admin endpoint, or
  mark it deleted if broker deletion is unavailable.
- Call `supabase.auth.admin.deleteUser(userId)`.
- Rely on `on delete cascade` for profile/trips/receipts child data.
- Verify post-delete counts are zero.
- Insert admin audit completion row.

This action is hard delete by design. A later safer option could add `suspended`
or `archived` status first, but Boss explicitly asked for delete-user/admin
authority.

## LLM Health

Use Credential Broker for live provider truth:

- `/health`: broker online/version.
- `/credentials/status`: provider stored status.
- `/credentials/test-all`: active live provider test, admin-triggered only.

LLM cards:

- Kimi `kimi-code`
- Google Gemma 4 31B
- Mimo v2.5
- WeatherAPI
- Notion provider

Show:

- stored status
- last tested at
- live test result
- recent quota counters if available
- error message redacted
- last successful AI event from `app_usage_events`

## Visual Design Plan

Theme: cyber command center, not marketing hero.

Concept references saved in this repo:

- Desktop: `docs/assets/admin-kanban/cyber-kanban-desktop-concept.png`
- Mobile: `docs/assets/admin-kanban/cyber-kanban-mobile-concept.png`

Concept fidelity note: the mobile generated concept shows a broad
`Delete All Data` action. The implementation must narrow that to a selected
user delete workflow with preview counts, confirm phrase, admin re-auth, and
audit logging. There must be no one-click global destructive action.

Tokens:

- background: near-black graphite
- panels: translucent dark glass with sharp 6px radius
- primary accent: cyan
- secondary accent: magenta
- warning: amber
- danger: red
- success: green
- text: high-contrast cool white
- charts: direct labels, no hover-only values

Data visualization choices:

- User frequency: compact sparklines and heatmap strips.
- Supabase counts: metric tiles plus RLS status matrix.
- Receipts: status columns with amount chips and currency badges.
- Notion: pipeline cards and failure queue.
- LLM: provider status cards with latency/error strips.
- Backend health: small multiples and direct status labels.

Avoid fake decorative charts. Every glowing element should correspond to a
status, severity, freshness, or selected state.

## Implementation Phases (Status: Fully Implemented & Deployed)

### Phase 1: Plan and concept

- Finalize architecture plan.
- Generate cyber admin dashboard concept for desktop and mobile.
- Extract design tokens and component inventory.

### Phase 2: Backend foundations

- Add `app_usage_events` and `admin_audit_events` migrations.
- Add telemetry helper to React and Compact.
- Add server-side admin API with snapshot endpoint and admin session.
- Add read-only Supabase aggregates and provider health checks.

### Phase 3: KanBan frontend

- Create `app-admin-kanban/`.
- Implement cyber shell, lanes, cards, filters, inspector, and mobile lane
  navigation.
- Connect to admin snapshot endpoint.
- Add loading, stale, offline, empty, and partial-data states.

### Phase 4: Admin actions

- Add delete preview.
- Add confirm delete with warning dialog and re-auth.
- Add audit log view.
- Add post-delete verification.

### Phase 5: Verification and deploy

- Unit/type/build checks for admin app and worker.
- Worker self-test for admin auth, snapshot redaction, delete preview, delete
  confirm guardrails, audit writing.
- Playwright smoke for:
  - login gate
  - board lanes
  - live snapshot rendering
  - filtering/search
  - provider health cards
  - delete preview requires confirmation
  - mobile no-overflow
- Supabase connector/sql verification:
  - aggregate counts match snapshot counts
  - RLS/FORCE RLS shown correctly
  - usage events are inserted by normal users only for themselves
  - admin audit events are not public-readable
- Deploy admin frontend to Vercel.
- Verify live Vercel URL returns `200` and renders real snapshot data.

## Open Decisions

These are the only decisions that may need Boss confirmation:

1. Admin identity model:
   - Recommended: admin passphrase plus allowlisted email/session.
   - Alternative: Supabase user with custom admin claim.
2. Delete semantics:
   - Recommended for requested authority: hard delete after preview and
     confirm phrase.
   - Safer alternative: suspend/archive first, hard delete only after second
     confirmation.
3. Notion depth:
   - Recommended first release: integration/sync metadata only.
   - Deeper option: admin broker endpoint that tests each user's Personal
     Notion credential without exposing content.
4. Legacy telemetry:
   - Recommended first release: React + Compact only.
   - Later: legacy telemetry if there is a secure auth/session path.

## Success Criteria

The goal is not complete until:

- The independent KanBan app is deployed to Vercel with a working link.
- The board renders real data from the production Supabase/admin API, not static
  seed data.
- Supabase aggregate counts in the board match a direct Supabase connector/sql
  verification.
- LLM provider health is read from the Credential Broker.
- Notion status is represented from app-owned integration/sync data.
- User deletion is server-side, previewed, confirmed, audited, and verified.
- Smoke tests pass on desktop and mobile.
- No secrets or service-role keys are present in frontend code, Vercel client
  env, git, screenshots, or logs.
