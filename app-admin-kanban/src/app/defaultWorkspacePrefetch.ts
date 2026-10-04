import { queryClient } from "./queryClient";
import { adminGet } from "../lib/api/adminClient";
import type { AccountRow, IncidentRow, OverviewData, PagedData } from "../lib/contracts/admin";

const EMPTY_PARAMS = {};
const AUDIT_START_BUCKET_MS = 5 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

export function defaultAuditStartAt(now = Date.now()) {
  return new Date(Math.floor(now / AUDIT_START_BUCKET_MS) * AUDIT_START_BUCKET_MS - DAY_MS)
    .toISOString();
}

const DEFAULT_WORKSPACE_READS = [
  {
    route: "/overview",
    prefetch: () =>
      queryClient.prefetchQuery({
        queryKey: ["admin", "overview"],
        queryFn: ({ signal }) => adminGet<OverviewData>("/overview", undefined, signal),
        staleTime: 30_000,
      }),
  },
  {
    route: "/data/accounts",
    prefetch: () =>
      queryClient.prefetchQuery({
        queryKey: ["admin", "accounts", EMPTY_PARAMS],
        queryFn: ({ signal }) =>
          adminGet<PagedData<AccountRow>>("/accounts", EMPTY_PARAMS, signal),
      }),
  },
  {
    route: "/reliability/incidents",
    prefetch: () =>
      queryClient.prefetchQuery({
        queryKey: ["admin", "incidents", EMPTY_PARAMS],
        queryFn: ({ signal }) =>
          adminGet<PagedData<IncidentRow>>("/incidents", EMPTY_PARAMS, signal),
        staleTime: 30_000,
      }),
  },
  {
    route: "/system/providers",
    prefetch: () =>
      queryClient.prefetchQuery({
        queryKey: ["admin", "providers"],
        queryFn: ({ signal }) => adminGet("/providers", undefined, signal),
        staleTime: 60_000,
      }),
  },
  {
    route: "/audit",
    prefetch: () => {
      const params = { startAt: defaultAuditStartAt() };
      return queryClient.prefetchQuery({
        queryKey: ["admin", "audit", params],
        queryFn: ({ signal }) => adminGet("/audit", params, signal),
      });
    },
  },
];

export async function prefetchDefaultWorkspaceReads(currentPathname: string) {
  const reads = DEFAULT_WORKSPACE_READS.filter(({ route }) => route !== currentPathname);
  // All reads fire at once instead of serialized two-at-a-time rounds — each prefetchQuery
  // already catches and caches its own failure, and allSettled guarantees one rejected read
  // can never block or fail the rest of the batch.
  await Promise.allSettled(reads.map(({ prefetch }) => prefetch()));
}

// Route chunks are lazy (routes.tsx); without a warm-up the first click into
// each workspace waits for its JS before its data request can even start.
const ROUTE_CHUNKS = [
  () => import("../features/overview/OverviewPage"),
  () => import("../features/data/accounts/AccountsPage"),
  () => import("../features/data/trips/TripsPage"),
  () => import("../features/data/receipts/ReceiptsPage"),
  () => import("../features/reliability/ReliabilityPages"),
  () => import("../features/system/SystemPages"),
  () => import("../features/audit/AuditPages"),
  () => import("../features/search/SearchPage"),
];

export function warmRouteChunks() {
  const run = () => {
    for (const load of ROUTE_CHUNKS) void load().catch(() => undefined);
  };
  const idle = (window as Window & {
    requestIdleCallback?: (callback: () => void, options?: { timeout: number }) => number;
  }).requestIdleCallback;
  if (idle) idle(run, { timeout: 3000 });
  else window.setTimeout(run, 1200);
}
