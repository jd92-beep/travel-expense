export type ReceiptRevisionRef = {
  id?: string;
  sourceId?: string;
  tripId?: string;
  syncRevision?: number;
};

export type CanonicalReceiptTombstone = {
  supabaseId: string;
  sourceId: string;
  tripId: string;
  syncRevision: number;
};

export function canonicalReceiptKey(receipt: ReceiptRevisionRef): string {
  const scopedPrefix = receipt.tripId ? `${receipt.tripId}::` : '';
  const source = String(receipt.sourceId || receipt.id || '').trim();
  const rawSource = scopedPrefix && source.startsWith(scopedPrefix)
    ? source.slice(scopedPrefix.length)
    : source.includes('::') ? source.slice(source.indexOf('::') + 2) : source;
  return receipt.tripId && rawSource ? `${receipt.tripId}::${rawSource}` : rawSource;
}

export function canonicalTombstoneWins(
  tombstones: Record<string, CanonicalReceiptTombstone> | undefined,
  receipt: ReceiptRevisionRef,
): boolean {
  const tombstone = tombstones?.[canonicalReceiptKey(receipt)];
  return !!tombstone && Number(receipt.syncRevision || 0) <= tombstone.syncRevision;
}

export function mergeCanonicalReceiptTombstones<T extends CanonicalReceiptTombstone>(
  existing: Record<string, T> | undefined,
  activeReceipts: ReceiptRevisionRef[],
  pulledTombstones: T[],
): Record<string, T> {
  const next = { ...(existing || {}) };
  for (const tombstone of pulledTombstones) {
    const key = canonicalReceiptKey({ id: tombstone.supabaseId, ...tombstone });
    const current = next[key];
    if (!current || tombstone.syncRevision >= current.syncRevision) next[key] = tombstone;
  }
  for (const receipt of activeReceipts) {
    const key = canonicalReceiptKey(receipt);
    const current = next[key];
    if (current && Number(receipt.syncRevision || 0) > current.syncRevision) delete next[key];
  }
  return next;
}
