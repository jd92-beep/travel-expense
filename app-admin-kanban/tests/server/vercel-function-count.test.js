import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import test from 'node:test';

const apiRoot = fileURLToPath(new URL('../../api/', import.meta.url));
const vercelConfig = JSON.parse(readFileSync(fileURLToPath(new URL('../../vercel.json', import.meta.url)), 'utf8'));

function functionFiles(directory, prefix = '') {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const relative = `${prefix}${entry.name}`;
    if (entry.isDirectory()) return functionFiles(join(directory, entry.name), `${relative}/`);
    return entry.isFile() && entry.name.endsWith('.js') ? [relative] : [];
  });
}

test('Vercel Hobby function glob contains only the three API entrypoints', () => {
  const files = functionFiles(apiRoot);
  assert.deepEqual(files, ['admin.js', 'health.js', 'readiness.js']);
  assert.equal(files.length, 3);
});

test('Vercel routes every admin API request through the gateway before the SPA fallback', () => {
  assert.deepEqual(vercelConfig.rewrites, [
    {
      source: '/api/admin/:path*',
      destination: '/api/admin?__admin_path=:path*',
    },
    {
      source: '/(.*)',
      destination: '/index.html',
    },
  ]);
});
