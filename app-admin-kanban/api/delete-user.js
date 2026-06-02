import { deleteUser, handler, readJson, requireMethod, send, verifySession } from './_lib/admin.js';

export default function removeUser(req, res) {
  return handler(req, res, async () => {
    if (!requireMethod(req, res, 'POST')) return;
    const session = verifySession(req);
    const body = await readJson(req);
    const result = await deleteUser(
      String(body.userId || ''),
      String(body.confirmPhrase || ''),
      String(body.adminPassphrase || ''),
      session.sub || 'admin',
    );
    send(res, 200, { ok: true, result });
  });
}
