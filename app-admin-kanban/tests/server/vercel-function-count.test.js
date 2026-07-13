import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import test from 'node:test';

const apiRoot = fileURLToPath(new URL('../../api/', import.meta.url));

function functionFiles(directory, prefix = '') {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const relative = `${prefix}${entry.name}`;
    if (entry.isDirectory()) return functionFiles(join(directory, entry.name), `${relative}/`);
    return entry.isFile() && entry.name.endsWith('.js') ? [relative] : [];
  });
}

test('Vercel Hobby function glob contains only the three API entrypoints', () => {
  const files = functionFiles(apiRoot);
  assert.deepEqual(files, ['admin/[...path].js', 'health.js', 'readiness.js']);
  assert.ok(files.length <= 12);
});
