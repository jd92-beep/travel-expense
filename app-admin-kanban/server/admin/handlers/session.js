import { handler, requireMethod, sendData } from '../http.js';
import { requireAdminSession, revokeAdminSession } from '../session.js';

export default function adminSession(req, res) {
  return handler(req, res, async (requestId) => {
    if (req.method === 'GET') {
      const session = await requireAdminSession(req);
      sendData(res, 200, {
        actor: session.actor,
        authMethod: session.authMethod,
        idleExpiresAt: session.idleExpiresAt,
        absoluteExpiresAt: session.absoluteExpiresAt,
      }, requestId);
      return;
    }
    requireMethod(req, 'DELETE');
    await requireAdminSession(req, { mutation: true });
    await revokeAdminSession(req, res, 'logout');
    sendData(res, 200, { revoked: true }, requestId);
  });
}
