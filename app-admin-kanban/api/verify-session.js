import { handler, requireMethod, send, verifySession } from './_lib/admin.js';

export default function verifyAdminSession(req, res) {
  return handler(req, res, async () => {
    if (!['GET', 'POST'].includes(req.method)) {
      requireMethod(req, res, 'GET');
      return;
    }
    const session = verifySession(req);
    send(res, 200, {
      ok: true,
      adminSubject: session.sub || 'admin',
      expiresAt: new Date(Number(session.exp)).toISOString(),
    });
  });
}
