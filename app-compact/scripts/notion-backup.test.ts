// The Notion backup snapshot has one property that matters more than the rest:
// it must never report success after writing a partial snapshot. richTextChunks
// caps at 80 chunks of 1800 chars and silently drops everything past that, so a
// payload that overflows has to be refused, not trimmed.
import assert from 'node:assert/strict';
import { createServer } from 'vite';

const server = await createServer({
  appType: 'custom',
  logLevel: 'error',
  optimizeDeps: { noDiscovery: true },
  server: { middlewareMode: true, hmr: false },
});

try {
  const notion: typeof import('../src/lib/notion.ts') = await server.ssrLoadModule('/src/lib/notion.ts');

  // The ceiling is the one richTextChunks actually enforces.
  assert.equal(notion.NOTION_BACKUP_MAX_CHARS, 80 * 1800);
  assert.equal(notion.BACKUP_META_SOURCE_ID, '__meta_backup__');

  // Photo thumbnails are dropped: a couple of them alone would breach the ceiling.
  const portable = {
    receipts: [
      { id: 'r1', store: 'A', total: 100, photoThumb: 'x'.repeat(40_000) },
      { id: 'r2', store: 'B', total: 200 },
    ],
  } as never;
  const payload = notion.buildNotionBackupPayload(portable);
  assert.equal(payload.receipts?.length, 2);
  for (const receipt of payload.receipts || []) {
    assert.equal('photoThumb' in receipt, false, 'photoThumb must not reach Notion');
  }
  // Everything else survives.
  assert.equal(payload.receipts?.[0]?.store, 'A');
  assert.equal(payload.receipts?.[1]?.total, 200);
  // The source object is untouched.
  assert.equal((portable as { receipts: Array<{ photoThumb?: string }> }).receipts[0].photoThumb?.length, 40_000);

  // An oversized snapshot is refused before any write, and the error names the
  // fallback rather than leaving the user with a silently truncated backup.
  const oversized = {
    receipts: [{ id: 'big', store: 'C', total: 1, note: 'y'.repeat(notion.NOTION_BACKUP_MAX_CHARS + 1) }],
  } as never;
  let threw = false;
  try {
    await notion.pushBackupSnapshot(
      { notionDb: 'a'.repeat(32), trips: [], receipts: [] } as never,
      oversized,
    );
  } catch (error) {
    threw = true;
    const message = String((error as Error).message);
    assert.match(message, /備份太大|匯出 Backup/, `unexpected refusal message: ${message}`);
  }
  assert.ok(threw, 'an oversized snapshot must be refused, never truncated');

  console.log('notion backup snapshot contract passed');
} finally {
  await server.close();
}
