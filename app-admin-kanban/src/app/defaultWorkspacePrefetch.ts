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
  for (let index = 0; index < reads.length; index += 2) {
    await Promise.allSettled(reads.slice(index, index + 2).map(({ prefetch }) => prefetch()));
  }
}
