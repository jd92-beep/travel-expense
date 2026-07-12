import assert from 'node:assert/strict';
import test from 'node:test';

const routeModules = [
  '../api/admin/auth/begin.js',
  '../api/admin/auth/finish.js',
  '../api/admin/passkeys/enroll/begin.js',
  '../api/admin/passkeys/enroll/finish.js',
  '../api/admin/reauth/begin.js',
  '../api/admin/reauth/finish.js',
  '../api/admin/session.js',
  '../api/admin/[...path].js',
];

test('all fixed browser admin routes import as handlers', async () => {
  for (const path of routeModules) {
    const route = await import(path);
    assert.equal(typeof route.default, 'function', `${path} must export a handler`);
  }
});
