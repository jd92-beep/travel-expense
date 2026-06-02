import { createAdminSession, handler, readJson, requireMethod, send, verifyAdminPassphrase } from './_lib/admin.js';

export default function session(req, res) {
  return handler(req, res, async () => {
    if (!requireMethod(req, res, 'POST')) return;
    const body = await readJson(req);
    if (!verifyAdminPassphrase(body.passphrase)) {
      send(res, 403, { ok: false, error: 'Admin login failed' });
      return;
    }
    send(res, 200, { ok: true, session: createAdminSession() });
  });
}
