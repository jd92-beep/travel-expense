import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'vite';

const outDir = await mkdtemp(join(tmpdir(), 'travel-expense-itinerary-test-'));
try {
  await build({
    configFile: false,
    logLevel: 'error',
    build: {
      emptyOutDir: true,
      outDir,
      ssr: resolve('scripts/itinerary-sync-merge.test.ts'),
      rollupOptions: { output: { entryFileNames: 'test.mjs' } },
    },
  });
  await import(`${pathToFileURL(join(outDir, 'test.mjs')).href}?${Date.now()}`);
} finally {
  await rm(outDir, { recursive: true, force: true });
}
