import assert from 'node:assert/strict';
import {
  canonicalReceiptKey,
  canonicalTombstoneWins,
  mergeCanonicalReceiptTombstones,
} from '../src/lib/receiptTombstones.ts';

const deleted = {
  supabaseId: '00000000-0000-4000-8000-000000000001',
  sourceId: 'receipt-1',
  tripId: 'trip-a',
  version: 3,
  syncRevision: 9,
  deletedAt: 1_700_000_000_000,
};

assert.equal(canonicalReceiptKey(deleted), 'trip-a::receipt-1');
assert.equal(canonicalReceiptKey({ sourceId: 'trip-a::receipt-1', tripId: 'trip-a' }), 'trip-a::receipt-1');

const afterDelete = mergeCanonicalReceiptTombstones({}, [], [deleted]);
assert.equal(afterDelete['trip-a::receipt-1']?.syncRevision, 9, 'server tombstone is retained');
assert.equal(
  canonicalTombstoneWins(afterDelete, { id: 'local-1', sourceId: 'receipt-1', tripId: 'trip-a', syncRevision: 8 }),
  true,
  'an older offline receipt cannot resurrect a deleted row',
);

const afterStalePull = mergeCanonicalReceiptTombstones(afterDelete, [
  { id: 'local-1', sourceId: 'receipt-1', tripId: 'trip-a', syncRevision: 9 },
], []);
assert.ok(afterStalePull['trip-a::receipt-1'], 'equal revision still leaves delete authoritative');

const afterRestore = mergeCanonicalReceiptTombstones(afterStalePull, [
  { id: 'local-1', sourceId: 'receipt-1', tripId: 'trip-a', syncRevision: 10 },
], []);
assert.equal(afterRestore['trip-a::receipt-1'], undefined, 'higher server revision is an explicit restore');

const crossTrip = mergeCanonicalReceiptTombstones({}, [], [
  deleted,
  { ...deleted, supabaseId: '00000000-0000-4000-8000-000000000002', tripId: 'trip-b' },
]);
assert.equal(Object.keys(crossTrip).length, 2, 'the same source ID stays isolated by trip');

console.log('receipt-tombstone: delete/restore/version assertions passed');
