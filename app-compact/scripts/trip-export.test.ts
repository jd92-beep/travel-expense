import assert from 'node:assert/strict';
import { createServer } from 'vite';

// A disposable service and a fake account only. No .env, real auth or production access.
const server = await createServer({ configFile: false, envDir: false, appType: 'custom', logLevel: 'error',
  define: { 'import.meta.env.VITE_SUPABASE_URL': JSON.stringify('https://export-fixture.supabase.co'), 'import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY': JSON.stringify('export-fixture-publishable-key-placeholder') },
  optimizeDeps: { noDiscovery: true }, server: { middlewareMode: true, hmr: false },
});
const oldFetch = globalThis.fetch;
const oldWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
const png = Uint8Array.from(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6ZKAAAAAASUVORK5CYII=', 'base64'));
const session = { access_token: 'fixture-account-A-token', user: { id: '11111111-1111-4111-8111-111111111111' } };
Object.defineProperty(globalThis, 'window', { configurable: true, value: { location: { origin: 'https://export-fixture.example' } } });
try {
  const module: typeof import('../src/lib/receiptExportPhotos.ts') = await server.ssrLoadModule('/src/lib/receiptExportPhotos.ts');
  const calls: string[] = [];
  let denied = false;
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    calls.push(url);
    if (url.startsWith('data:')) return oldFetch(input, init);
    if (url.includes('/rest/v1/receipt_photos')) {
      assert.equal(new Headers(init?.headers).get('authorization'), ['Bearer', session.access_token].join(' '));
      return new Response(JSON.stringify({ storage_path: 'account-a/receipt.png' }), { headers: { 'Content-Type': 'application/json' } });
    }
    if (url.includes('/storage/v1/object/sign/') && !url.includes('fixture-signature')) {
      assert.equal(new Headers(init?.headers).get('authorization'), ['Bearer', session.access_token].join(' '));
      if (denied) return new Response(JSON.stringify({ message: 'Forbidden' }), { status: 403, headers: { 'Content-Type': 'application/json' } });
      return new Response(JSON.stringify({ signedURL: '/object/sign/receipt-photos/account-a/receipt.png?token=fixture-signature' }), { headers: { 'Content-Type': 'application/json' } });
    }
    if (url.includes('/oversized')) return new Response(png, { headers: { 'Content-Type': 'image/png', 'Content-Length': '6000001' } });
    if (url.includes('/html')) return new Response('<html>not a receipt</html>', { headers: { 'Content-Type': 'image/png' } });
    if (url.includes('fixture-signature')) {
      assert.equal(init?.credentials, 'omit');
      assert.equal(init?.referrerPolicy, 'no-referrer');
      return new Response(png, { headers: { 'Content-Type': 'application/octet-stream' } });
    }
    throw new Error('Unexpected fixture request');
  };
  const signal = new AbortController().signal;
  const cloud = await module.loadReceiptExportPhoto(session as never, { id: 'r1', supabaseId: '22222222-2222-4222-8222-222222222222', photoUrl: 'https://export-fixture.example/expired' } as never, signal);
  assert.equal(cloud?.source, 'cloud');
  assert.equal(cloud?.extension, 'png');
  assert.deepEqual(cloud?.bytes, png);
  assert.equal(calls.some((url) => url.includes('/expired')), false, 'renewed original wins over stale URL');

  denied = true;
  const thumb = await module.loadReceiptExportPhoto(session as never, { id: 'r2', supabasePhotoPath: 'account-a/receipt.png', photoThumb: `data:image/png;base64,${Buffer.from(png).toString('base64')}` } as never, signal);
  assert.equal(thumb?.source, 'thumbnail', 'permission denial must use only a locally held thumbnail');
  assert.deepEqual(thumb?.bytes, png);
  await assert.rejects(module.loadReceiptExportPhoto(null, { id: 'r3', photoUrl: 'https://export-fixture.example/oversized' } as never, signal), /unavailable/);
  await assert.rejects(module.loadReceiptExportPhoto(null, { id: 'r4', photoUrl: 'https://export-fixture.example/html' } as never, signal), /unavailable/);
  assert.equal(await module.loadReceiptExportPhoto(null, { id: 'manual' } as never, signal), null);
  const canceled = new AbortController(); canceled.abort();
  const beforeCancel = calls.length;
  await assert.rejects(module.loadReceiptExportPhoto(null, { id: 'r5', photoUrl: 'https://export-fixture.example/oversized' } as never, canceled.signal), { name: 'AbortError' });
  assert.equal(calls.length, beforeCancel);
  console.log('Trip export photo contracts passed: account-bound renewal, denied thumbnail fallback, byte validation, size ceiling, no-photo and cancellation.');
} finally {
  globalThis.fetch = oldFetch;
  if (oldWindow) Object.defineProperty(globalThis, 'window', oldWindow);
  else Reflect.deleteProperty(globalThis, 'window');
  await server.close();
}
