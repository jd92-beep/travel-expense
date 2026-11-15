import assert from 'node:assert/strict';
import { createServer } from 'vite';

const server = await createServer({
  appType: 'custom',
  logLevel: 'error',
  optimizeDeps: { noDiscovery: true },
  server: { middlewareMode: true, hmr: false },
});

try {
  const constants: typeof import('../src/lib/constants.ts') = await server.ssrLoadModule('/src/lib/constants.ts');
  const trip: typeof import('../src/domain/trip/normalize.ts') = await server.ssrLoadModule('/src/domain/trip/normalize.ts');
  const supabase: typeof import('../src/lib/supabase.ts') = await server.ssrLoadModule('/src/lib/supabase.ts');

  assert.equal(trip.migrateAppState({}).themePreference, 'auto');
  assert.equal(trip.migrateAppState({ themePreference: 'not-a-theme' }).themePreference, 'auto');
  assert.equal(constants.parseThemePreference('not-a-theme'), undefined);
  assert.equal(constants.parseThemePreference('cyberpunk_hud'), 'cyberpunk_hud');
  assert.equal(trip.migrateAppState({ themePreference: 'sketch_notebook' }).themePreference, 'sketch_notebook');
  for (const key of ['night_ledger', 'harbor_blueprint', 'sunset_terrace', 'pocket_planner', 'alpine_postcard'] as const) {
    assert.equal(constants.parseThemePreference(key), key);
    assert.equal(trip.migrateAppState({ themePreference: key }).themePreference, key);
    assert.equal(supabase.rowToSettings({ app_settings: { themePreference: key } })?.themePreference, key);
    assert.equal(supabase.buildAppSettings({ ...constants.DEFAULT_STATE, themePreference: key }).themePreference, key);
  }

  const remoteInvalid = supabase.rowToSettings({ app_settings: { themePreference: 'not-a-theme' } });
  assert.equal(remoteInvalid?.themePreference, undefined);
  const remoteMissing = supabase.rowToSettings({ app_settings: { settingsUpdatedAt: 200 } });
  assert.equal(remoteMissing?.themePreference, undefined);

  const remoteValid = supabase.rowToSettings({ app_settings: { themePreference: 'europe_rail', settingsUpdatedAt: 200 } });
  assert.equal(remoteValid?.themePreference, 'europe_rail');
  const settings = supabase.buildAppSettings({ ...constants.DEFAULT_STATE, themePreference: 'taiwan_nightmarket' });
  assert.equal(settings.themePreference, 'taiwan_nightmarket');

  console.log('theme preference tests passed');
} finally {
  await server.close();
}
