import { useEffect, useState } from "react";

// Session-scoped receipt photo cache. Photos stream through the BFF with
// Cache-Control: no-store (they are private), so the browser re-downloaded
// the whole BFF -> Edge -> Storage chain on every revisit. Object URLs live
// only in this tab's memory and are revoked on eviction/logout.
const MAX_ENTRIES = 40;
const cache = new Map<string, Promise<string>>();

function evict() {
  while (cache.size > MAX_ENTRIES) {
    const [oldestKey, oldest] = cache.entries().next().value as [string, Promise<string>];
    cache.delete(oldestKey);
    void oldest.then((url) => URL.revokeObjectURL(url)).catch(() => undefined);
  }
}

export function loadReceiptPhoto(receiptId: string): Promise<string> {
  const existing = cache.get(receiptId);
  if (existing) {
    // Refresh recency.
    cache.delete(receiptId);
    cache.set(receiptId, existing);
    return existing;
  }
  const pending = fetch(`/api/admin/receipts/${receiptId}/photo`, {
    credentials: "same-origin",
    headers: { Accept: "image/*" },
  }).then(async (response) => {
    if (response.status === 401) window.dispatchEvent(new Event("admin:unauthorized"));
    if (!response.ok) throw new Error(`photo ${response.status}`);
    return URL.createObjectURL(await response.blob());
  });
  // Failed loads must not poison the cache; retry gets a fresh request.
  pending.catch(() => {
    if (cache.get(receiptId) === pending) cache.delete(receiptId);
  });
  cache.set(receiptId, pending);
  evict();
  return pending;
}

/** Start loading as soon as the operator commits to opening a receipt (click, not hover: every load is audited). */
export function prefetchReceiptPhoto(receiptId: string) {
  void loadReceiptPhoto(receiptId).catch(() => undefined);
}

export function clearReceiptPhotoCache() {
  for (const pending of cache.values()) {
    void pending.then((url) => URL.revokeObjectURL(url)).catch(() => undefined);
  }
  cache.clear();
}

export function useReceiptPhoto(receiptId: string, enabled: boolean, attempt: number) {
  const [state, setState] = useState<{ url: string | null; error: boolean }>({ url: null, error: false });
  useEffect(() => {
    if (!enabled || !receiptId) return;
    let active = true;
    setState({ url: null, error: false });
    loadReceiptPhoto(receiptId)
      .then((url) => active && setState({ url, error: false }))
      .catch(() => active && setState({ url: null, error: true }));
    return () => {
      active = false;
    };
  }, [receiptId, enabled, attempt]);
  return state;
}
