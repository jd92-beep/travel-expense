import { queryClient } from "../app/queryClient";
import { adminGet } from "./api/adminClient";

// Hover/focus intent prefetch for detail routes. Every admin read is a
// BFF -> auth-state -> Edge chain, so starting it ~200 ms before the click
// lands removes most of the perceived latency. Keys mirror the detail pages.
const PREFETCH_STALE_MS = 30_000;

const DETAIL = {
  account: (id: string) => ({ queryKey: ["admin", "account", id], path: `/accounts/${id}` }),
  trip: (id: string) => ({ queryKey: ["admin", "trip", id], path: `/trips/${id}` }),
  receipt: (id: string) => ({ queryKey: ["admin", "receipt", id], path: `/receipts/${id}` }),
} as const;

export type DetailKind = keyof typeof DETAIL;

export function prefetchDetail(kind: DetailKind, id: string) {
  if (!id) return;
  const { queryKey, path } = DETAIL[kind](id);
  void queryClient.prefetchQuery({
    queryKey,
    queryFn: ({ signal }) => adminGet(path, undefined, signal),
    staleTime: PREFETCH_STALE_MS,
  });
}

/** Spread onto a <Link> to prefetch its detail payload on hover or keyboard focus. */
export function prefetchProps(kind: DetailKind, id: string) {
  const run = () => prefetchDetail(kind, id);
  return { onMouseEnter: run, onFocus: run, onTouchStart: run };
}
