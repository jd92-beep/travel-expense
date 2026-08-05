import assert from 'node:assert/strict';
import catalog from '../contracts/ai-provider-catalog.json' with { type: 'json' };
import { COMPACT_AI_MODELS } from '../app-compact/src/lib/providerCatalog.ts';
import { PROVIDER_MODELS as BROKER_MODELS } from '../workers/credential-broker/src/provider-catalog.js';
import { PROVIDER_MODELS as BFF_MODELS } from '../app-admin-kanban/server/admin/provider-catalog.js';
import { PROVIDER_MODELS as EDGE_MODELS } from '../supabase/functions/admin-kanban/provider_catalog.ts';

const records = catalog.providers.flatMap((provider) => provider.models);
const ids = records.map((record) => record.id);
assert.equal(new Set(ids).size, ids.length);
for (const provider of catalog.providers) {
  assert.ok(provider.models.every((record) =>
    record.id.startsWith(`${provider.id}/`)));
}
assert.equal(ids.some((id) => /seedance/i.test(id)), false);

const surfaceIds = (surface) => records
  .filter((record) => record.surfaces.includes(surface))
  .map((record) => record.id)
  .sort();
const flatten = (record) => Object.values(record).flat().sort();

assert.deepEqual(COMPACT_AI_MODELS.map((model) => model.id).sort(), surfaceIds('compact'));
assert.deepEqual(flatten(BROKER_MODELS), surfaceIds('broker'));
assert.deepEqual(flatten(BFF_MODELS), surfaceIds('admin-bff'));
assert.deepEqual(flatten(EDGE_MODELS), surfaceIds('admin-edge'));

const safeVolcano = [
  'volcano/doubao-seed-2.0-lite',
  'volcano/doubao-seed-2.0-pro',
  'volcano/minimax-m3',
  'volcano/minimax-m2.7',
  'volcano/doubao-seed-2.0-mini',
  'volcano/kimi-k3',
].sort();
assert.deepEqual(BFF_MODELS.volcano.slice().sort(), safeVolcano);
assert.deepEqual(EDGE_MODELS.volcano.slice().sort(), safeVolcano);
assert.equal(COMPACT_AI_MODELS.some((model) => model.id === 'volcano/kimi-k3'), false);
assert.ok(records.find((record) => record.id === 'volcano/kimi-k3')
  ?.surfaces.includes('android'));

for (const task of ['scan', 'voice', 'email', 'trip-update']) {
  const defaults = records.filter((record) => record.defaultFor.includes(task));
  assert.equal(defaults.length, 1, `one safe default required for ${task}`);
}

console.log('provider catalog contract passed');
