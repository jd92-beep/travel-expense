---
name: supabase-edge-testing
description: Test Supabase Edge Functions via curl with correct auth headers, common endpoints, and deployment verification. Covers the dual-header auth gotcha and sleep timing for propagation.
---

# Supabase Edge Function Testing

Test Edge Functions locally via curl before and after deployment. This skill documents the auth patterns, common endpoints, and gotchas that cause debugging loops.

## Auth Patterns

### Dual-Header Requirement (CRITICAL)

Supabase Edge Function gateway has TWO hard requirements on the `Authorization` header, even with `verify_jwt: false`:

1. **Rejects non-JWT format** — `UNAUTHORIZED_INVALID_JWT_FORMAT` if you send an HMAC token as `Authorization: Bearer <hmac>`
2. **Requires header presence** — `UNAUTHORIZED_NO_AUTH_HEADER` if you send ONLY `X-Admin-Token` without `Authorization`

**Solution**: Send BOTH headers:
```bash
curl -s "$EDGE_FUNCTION_URL" \
  -H "Authorization: Bearer $ANON_KEY" \
  -H "X-Admin-Token: admin-console-secret-token-2026" \
  -H "Content-Type: application/json"
```

- `Authorization: Bearer $ANON_KEY` — satisfies gateway presence check
- `X-Admin-Token: <token>` — actual HMAC verification in user code

### Key Types

| Key | Use for |
|-----|---------|
| `ANON_KEY` | Client-side calls, Edge Function with `verify_jwt: false` |
| `SERVICE_KEY` | Server-side admin operations, bypass RLS |
| `X-Admin-Token` | Admin Console HMAC verification |

### Edge Function `verify_jwt` Config

- Default is `true` — gateway validates JWT format before user code runs
- Set `verify_jwt: false` in the function config for custom auth schemes (HMAC, service role key)
- Config location: `supabase/functions/<function-name>/index.ts` → `export const config = { verify_jwt: false }`

## Deployment

```bash
# Deploy Edge Function
npx supabase functions deploy admin-kanban --project-ref fbnnjoahvtdrnigevrtw 2>&1 | tail -2

# Wait for propagation (Edge Functions need ~8s after deploy)
sleep 8
```

**Important**: Always wait 5-8 seconds after deploy before testing. Edge Function propagation is not instant.

## Common Endpoints (admin-kanban)

| Endpoint | Method | Auth | Description |
|----------|--------|------|-------------|
| `/api/snapshot?range=7d` | GET | ANON_KEY + X-Admin-Token | Dashboard snapshot (users, trips, receipts, health) |
| `/api/test-provider` | POST | ANON_KEY + X-Admin-Token | Test AI provider connectivity |
| `/api/test-provider` | POST (with provider body) | ANON_KEY + X-Admin-Token | Test specific provider |
| `/api/health` | GET | ANON_KEY | Edge Function health check |
| `/api/rls-state` | GET | SERVICE_KEY | RLS enabled/forced state |

## Test Template

```bash
sleep 8

ANON_KEY="<supabase-anon-key>"
EDGE_URL="https://fbnnjoahvtdrnigevrtw.supabase.co/functions/v1/admin-kanban"

echo "=== Test Snapshot ==="
curl -s "$EDGE_URL/api/snapshot?range=7d" \
  -H "Authorization: Bearer $ANON_KEY" \
  -H "X-Admin-Token: admin-console-secret-token-2026" \
  -H "Content-Type: application/json" 2>&1 | python3 -c "
import sys, json
d = json.load(sys.stdin)
print('ok:', d.get('ok'))
if d.get('error'): print('error:', d['error'])
if d.get('data'): print('data keys:', list(d['data'].keys()))
"
```

## Gotchas

1. **Sleep after deploy**: Edge Functions need ~8s to propagate. Testing immediately after deploy returns stale or 404 responses.
2. **Supabase gateway validates JWT format**: Even with `verify_jwt: false`, the gateway rejects non-JWT `Authorization` headers before user code runs.
3. **Service role key cannot call `/auth/v1/user`**: Returns `403 bad_jwt: missing sub claim` because service role JWTs lack a `sub` claim.
4. **Edge Function secrets show digests only**: `npx supabase secrets list` shows SHA-256 digests. Use `npx supabase projects api-keys` for full JWT-format keys.
5. **Broker requires session or X-Admin-Internal**: All `/credentials/*` endpoints (except `/health`) check auth. Server-to-server calls must send `X-Admin-Internal` header.
6. **CORS requires Origin header**: Edge Function server-side `fetch()` has no Origin header. Must set `Origin: https://travel-expense-compact.vercel.app` in broker calls.

## Verification Flow

After deploying an Edge Function change:

1. Wait 8 seconds
2. Test the endpoint with curl (using dual-header auth)
3. Verify response structure (check `ok` field, data keys)
4. If testing auth changes, test with each auth path:
   - Path 0: `X-Admin-Token` header (HMAC)
   - Path 0.5: `X-Admin-Token` via broker verify-session
   - Path 1: Service role key direct
   - Path 2: Supabase user JWT + isBoss email
   - Path 3: Fallback
