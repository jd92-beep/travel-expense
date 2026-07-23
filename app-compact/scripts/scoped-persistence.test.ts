import assert from 'node:assert/strict';
import { createServer } from 'vite';
import type { SnapshotAdapter } from '../src/lib/scopedPersistence.ts';
import { DEFAULT_STATE } from '../src/lib/constants.ts';

const server = await createServer({
  appType: 'custom',
  logLevel: 'error',
  optimizeDeps: { noDiscovery: true },
  server: { middlewareMode: true },
});
const persistenceModule: typeof import('../src/lib/scopedPersistence.ts') =
  await server.ssrLoadModule('/src/lib/scopedPersistence.ts');
const { createScopedPersistence } = persistenceModule;

function memoryAdapter(initial: unknown = null, failure: 'read' | 'write' | null = null) {
  let value = initial;
  const adapter: SnapshotAdapter = {
    async load() {
      if (failure === 'read') throw new Error('read failed');
      return value;
    },
    async save(_scope, next) {
      if (failure === 'write') throw new Error('write failed');
      value = structuredClone(next);
    },
  };
  return { adapter, read: () => value };
}

const indexedOnly = memoryAdapter({
  ...DEFAULT_STATE,
  settingsUpdatedAt: 20,
  trips: [{ ...DEFAULT_STATE.trips[0], id: 'cloud-trip' }],
  activeTripId: 'cloud-trip',
});
let persistence = createScopedPersistence(memoryAdapter().adapter, indexedOnly.adapter);
let state = await persistence.hydrateScope('supabase:user-1', 'member@example.com');
assert.equal(state.activeTripId, 'cloud-trip');
assert.equal(state.trips.some((trip) => trip.id === DEFAULT_STATE.activeTripId), false);

const localNewer = memoryAdapter({
  ...DEFAULT_STATE,
  settingsUpdatedAt: 30,
  receipts: [{ id: 'r1', store: 'local', total: 2, date: '2026-01-01', category: 'other', payment: 'cash', updatedAt: 30 }],
});
const indexedOlder = memoryAdapter({
  ...DEFAULT_STATE,
  settingsUpdatedAt: 10,
  receipts: [{ id: 'r1', store: 'indexed', total: 1, date: '2026-01-01', category: 'other', payment: 'cash', updatedAt: 10 }],
});
persistence = createScopedPersistence(localNewer.adapter, indexedOlder.adapter);
state = await persistence.hydrateScope('local', 'vc06456@gmail.com');
assert.equal(state.receipts[0].store, 'local');

const indexedGlobalNewer = memoryAdapter({
  ...DEFAULT_STATE,
  settingsUpdatedAt: 40,
  receipts: [
    { id: 'r1', store: 'indexed-old-receipt', total: 1, date: '2026-01-01', category: 'other', payment: 'cash', updatedAt: 10 },
    { id: 'r2', store: 'indexed-new', total: 3, date: '2026-01-02', category: 'other', payment: 'cash', updatedAt: 40 },
  ],
});
persistence = createScopedPersistence(localNewer.adapter, indexedGlobalNewer.adapter);
state = await persistence.hydrateScope('local', 'vc06456@gmail.com');
assert.equal(state.receipts.find((receipt) => receipt.id === 'r1')?.store, 'local');
assert.equal(state.receipts.find((receipt) => receipt.id === 'r2')?.store, 'indexed-new');

const scopedLocal = memoryAdapter({
  ...DEFAULT_STATE,
  trips: [{ ...DEFAULT_STATE.trips[0], id: 'scope-b-trip' }],
  activeTripId: 'scope-b-trip',
  receipts: [],
});
const scopedIndexed = memoryAdapter({
  receipts: [{
    id: 'indexed-private-b',
    store: 'Indexed Private B',
    total: 1200,
    date: '2026-05-04',
    category: 'food',
    payment: 'cash',
    tripId: 'scope-b-trip',
    createdAt: 40,
  }],
});
persistence = createScopedPersistence(scopedLocal.adapter, scopedIndexed.adapter);
state = await persistence.hydrateScope('supabase:user-b', 'user-b@example.com');
assert.equal(state.activeTripId, 'scope-b-trip');
assert.equal(state.receipts[0]?.id, 'indexed-private-b');

const poisoned = memoryAdapter({ ...DEFAULT_STATE, kimiKey: 'must-not-survive' });
persistence = createScopedPersistence(poisoned.adapter, memoryAdapter(null, 'read').adapter);
state = await persistence.hydrateScope('local', 'vc06456@gmail.com');
assert.equal('kimiKey' in state, false);

const poisonedScopedLocal = memoryAdapter({
  ...DEFAULT_STATE,
  credentialSession: 'local-snapshot-session',
  credentialSessionExpiresAt: 99_999,
  credentialBrokerUrl: 'https://poisoned.example/broker',
  trips: [{
    ...DEFAULT_STATE.trips[0],
    id: 'poisoned-trip',
    sharing: {
      role: 'owner',
      isShared: true,
      memberCount: 1,
      pendingInviteCount: 1,
      invites: [{ id: 'local-invite', email: 'local@example.com', role: 'editor', token: 'local-invite-token' }],
    },
  }],
});
const poisonedScopedIndexed = memoryAdapter({
  ...DEFAULT_STATE,
  settingsUpdatedAt: 10,
  credentialSession: 'indexed-snapshot-session',
  credentialSessionExpiresAt: 88_888,
  trips: [{
    ...DEFAULT_STATE.trips[0],
    id: 'poisoned-trip',
    sharing: {
      role: 'owner',
      isShared: true,
      memberCount: 1,
      pendingInviteCount: 1,
      invites: [{ id: 'indexed-invite', email: 'indexed@example.com', role: 'editor', token: 'indexed-invite-token' }],
    },
  }],
});
persistence = createScopedPersistence(poisonedScopedLocal.adapter, poisonedScopedIndexed.adapter);
state = await persistence.hydrateScope('supabase:user-1', 'member@example.com');
assert.equal(state.credentialSession, '');
assert.equal(state.credentialSessionExpiresAt, 0);
assert.notEqual(state.credentialBrokerUrl, 'https://poisoned.example/broker');
assert.equal('token' in (state.trips[0]?.sharing?.invites?.[0] || {}), false);

const oldLiveReceipt = {
  id: 'receipt-live',
  sourceId: 'receipt-source',
  tripId: 'tombstone-trip',
  store: 'Old live receipt',
  total: 2,
  date: '2026-01-01',
  category: 'other',
  payment: 'cash',
  updatedAt: 10,
  syncRevision: 1,
};
const newerTombstone = {
  supabaseId: 'receipt-live',
  sourceId: 'receipt-source',
  tripId: 'tombstone-trip',
  version: 1,
  syncRevision: 1,
  deletedAt: 20,
  pending: true,
};
persistence = createScopedPersistence(
  memoryAdapter({ ...DEFAULT_STATE, receipts: [oldLiveReceipt] }).adapter,
  memoryAdapter({ ...DEFAULT_STATE, receiptTombstones: { 'tombstone-trip::receipt-source': newerTombstone } }).adapter,
);
state = await persistence.hydrateScope('local', 'vc06456@gmail.com');
assert.equal(state.receipts.some((receipt) => receipt.id === oldLiveReceipt.id), false);
assert.deepEqual(state.receiptTombstones, { 'tombstone-trip::receipt-source': newerTombstone });

const oldTombstone = { ...newerTombstone, deletedAt: 10, pending: false };
const newerLiveReceipt = { ...oldLiveReceipt, updatedAt: 20, syncRevision: 2, store: 'New live receipt' };
persistence = createScopedPersistence(
  memoryAdapter({ ...DEFAULT_STATE, receiptTombstones: { 'tombstone-trip::receipt-source': oldTombstone } }).adapter,
  memoryAdapter({ ...DEFAULT_STATE, receipts: [newerLiveReceipt] }).adapter,
);
state = await persistence.hydrateScope('local', 'vc06456@gmail.com');
assert.equal(state.receipts.find((receipt) => receipt.id === newerLiveReceipt.id)?.store, 'New live receipt');
assert.equal(state.receiptTombstones?.['tombstone-trip::receipt-source'], undefined);

const terminalSnapshot = {
  ...DEFAULT_STATE,
  syncQueue: [{
    id: 'sync-conflict',
    type: 'receipt',
    entityId: 'conflict',
    op: 'update',
    status: 'error',
    attempts: 3,
    error: '40001 version conflict',
    createdAt: 1,
    updatedAt: 2,
  }],
};
persistence = createScopedPersistence(
  memoryAdapter(terminalSnapshot).adapter,
  memoryAdapter(terminalSnapshot).adapter,
);
state = await persistence.hydrateScope('local', 'vc06456@gmail.com');
assert.equal(state.syncQueue[0].status, 'error');
assert.equal(state.syncQueue[0].attempts, 3);
assert.equal(state.syncQueue[0].error, '40001 version conflict');

const malformedPrimary = memoryAdapter('not-an-app-state');
persistence = createScopedPersistence(malformedPrimary.adapter, indexedOnly.adapter);
state = await persistence.hydrateScope('supabase:user-1', 'member@example.com');
assert.equal(state.activeTripId, 'cloud-trip');

const healthy = memoryAdapter();
persistence = createScopedPersistence(memoryAdapter(null, 'write').adapter, healthy.adapter);
const degraded = await persistence.persistScope('local', 'vc06456@gmail.com', DEFAULT_STATE);
assert.deepEqual(degraded, {
  localStorage: 'failed',
  indexedDb: 'succeeded',
  status: 'degraded',
  error: 'localStorage write failed',
});
assert.ok(healthy.read());

const failed = await createScopedPersistence(
  memoryAdapter(null, 'write').adapter,
  memoryAdapter(null, 'write').adapter,
).persistScope('local', 'vc06456@gmail.com', DEFAULT_STATE);
assert.deepEqual(failed, {
  localStorage: 'failed',
  indexedDb: 'failed',
  status: 'failed',
  error: 'localStorage write failed; IndexedDB write failed',
});

console.log('scoped persistence tests passed');
await server.close();
