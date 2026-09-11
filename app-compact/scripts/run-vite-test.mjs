import { createServer } from 'vite';

const testFile = process.argv[2]?.replace(/^\.\//, '');

if (!testFile || !testFile.startsWith('scripts/') || testFile.includes('..') || !testFile.endsWith('.test.ts')) {
  console.error('Usage: node scripts/run-vite-test.mjs scripts/<name>.test.ts');
  process.exit(1);
}

const server = await createServer({
  appType: 'custom',
  logLevel: 'error',
  optimizeDeps: { noDiscovery: true },
  server: { middlewareMode: true, hmr: false },
});

try {
  await server.ssrLoadModule(`/${testFile}`);
} finally {
  await server.close();
}
