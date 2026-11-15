import assert from 'node:assert/strict';
import { DEFAULT_STATE } from '../src/lib/constants';
import { createScopedPersistence, type SnapshotAdapter } from '../src/lib/scopedPersistence';
import { buildBackupImportPreview, sanitizeImportedTrips, validateBackupSchema } from '../src/tabs/settings/backup';
import { migrateAppState } from '../src/domain/trip/normalize';

const tripA = { ...DEFAULT_STATE.trips[0], id: 'trip-a', name: 'Trip A', createdAt: 1, updatedAt: 1 };
const tripB = { ...tripA, id: 'trip-b', name: 'Trip B', startDate: '2026-11-01', endDate: '2026-11-02' };
const receipt = { id: 'local-receipt', store: 'Local receipt', total: 20, date: '', tripId: 'unknown-trip' };
const failures: string[] = [];
async function check(name: string, run: () => unknown | Promise<unknown>) {
  try { await run(); } catch (error) { failures.push(`${name}: ${error instanceof Error ? error.message : String(error)}`); }
}
const adapter = (value: unknown): SnapshotAdapter => ({ async load() { return value; }, async save() {} });

await check('receipt freshness must not revert saved trip and synchronization settings', async () => {
  const recentSettings = { ...DEFAULT_STATE, trips: [tripA, tripB], activeTripId: tripB.id, tripName: tripB.name,
    settingsUpdatedAt: 30, autoSync: false, aiTranslationLanguage: 'en', persons: [{ ...DEFAULT_STATE.persons[0], name: 'Saved name' }], receipts: [] };
  const recentReceipt = { ...DEFAULT_STATE, trips: [tripA, tripB], activeTripId: tripA.id, tripName: tripA.name,
    settingsUpdatedAt: 10, autoSync: true, receipts: [{ ...receipt, tripId: tripA.id, updatedAt: 100 }] };
  for (const [local, indexed] of [[recentSettings, recentReceipt], [recentReceipt, recentSettings]]) {
    const hydrated = await createScopedPersistence(adapter(local), adapter(indexed)).hydrateScope('local', null);
    assert.equal(hydrated.activeTripId, tripB.id);
    assert.equal(hydrated.tripName, tripB.name);
    assert.equal(hydrated.autoSync, false);
    assert.equal(hydrated.aiTranslationLanguage, 'en');
    assert.equal(hydrated.persons[0].name, 'Saved name');
    assert.equal(hydrated.receipts[0].id, receipt.id);
  }
});

await check('restore fallback must belong to the imported trip set', () => {
  const state = { ...DEFAULT_STATE, trips: [tripA], activeTripId: tripA.id };
  const preview = buildBackupImportPreview('trip.json', { trips: [tripB], receipts: [receipt as any] }, state, tripA);
  assert.equal(preview.nextActiveTripId, tripB.id);
  assert.equal(preview.targetTripName, tripB.name);
  assert.equal(preview.receipts[0].tripId, tripB.id);
  assert.equal(preview.receipts[0].date, tripB.startDate);
});

await check('restore strips cloud sharing metadata', () => {
  const trips = sanitizeImportedTrips([{ ...tripB, sharing: { isShared: true, role: 'viewer', members: [], invites: [{ token: 'synthetic-invite-token' }] } }]);
  assert.equal(trips?.[0].sharing, undefined);
});

await check('backup root must be an object, not an array', () => {
  assert.equal(validateBackupSchema([]), false);
});

await check('a legacy backup trip without timezones can be restored and hydrated', async () => {
  const { timezones: _timezones, ...legacyTrip } = tripB;
  const payload = { trips: [legacyTrip], activeTripId: legacyTrip.id, receipts: [receipt] };
  assert.equal(validateBackupSchema(payload), true);
  const preview = buildBackupImportPreview('legacy.json', payload as any, DEFAULT_STATE, tripA);
  const restored = migrateAppState({ ...DEFAULT_STATE, ...preview.safePayload, trips: preview.importedTrips, receipts: preview.receipts });
  assert.equal(restored.activeTripId, legacyTrip.id);
  assert.equal(restored.receipts[0].id, receipt.id);
  assert.ok(restored.trips?.[0].intelligence?.timezone);
  assert.ok(Array.isArray(restored.trips?.[0].timezones));
  const hydrated = await createScopedPersistence(adapter(payload), adapter(null)).hydrateScope('local', null);
  assert.equal(hydrated.activeTripId, legacyTrip.id);
  assert.equal(hydrated.receipts[0].id, receipt.id);
});

assert.deepEqual(failures, []);
console.log('data integrity regressions passed (5 cases)');
