import { deletePreview, handler, readJson, requireMethod, send, verifySession } from './_lib/admin.js';

export default function preview(req, res) {
  return handler(req, res, async () => {
    if (!requireMethod(req, res, 'POST')) return;
    verifySession(req);
    const body = await readJson(req);
    send(res, 200, { ok: true, preview: await deletePreview(String(body.userId || '')) });
  });
}
