import { buildSnapshot, fixtureSnapshot, handler, requireMethod, send, verifySession } from './_lib/admin.js';

export default function snapshot(req, res) {
  return handler(req, res, async () => {
    if (!requireMethod(req, res, 'GET')) return;
    verifySession(req);
    const range = String(req.query?.range || '7d').match(/^\d+/)?.[0] || '7';
    if (process.env.ADMIN_KANBAN_FIXTURE_MODE === '1') {
      send(res, 200, { ok: true, snapshot: fixtureSnapshot() });
      return;
    }
    send(res, 200, { ok: true, snapshot: await buildSnapshot(Number(range)) });
  });
}
