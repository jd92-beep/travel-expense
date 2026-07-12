import { authStateCall } from '../../_lib/auth-state.js';
import { handler, HttpError, requireMethod, sendData } from '../../_lib/http.js';
import { passkeyEnrollmentContext, sanitizePasskeyCredentials } from '../../_lib/passkeys.js';
import { requireAdminSession } from '../../_lib/session.js';

export default function listAdminPasskeys(req, res) {
  return handler(req, res, async (requestId) => {
    requireMethod(req, 'GET');
    const session = await requireAdminSession(req);
    const credentials = await authStateCall('/internal/credentials/list', {}, {
      actor: session.actor,
      sessionHash: session.tokenHash,
    });
    if (!Array.isArray(credentials)) {
      throw new HttpError('UPSTREAM_UNAVAILABLE', 'Passkey store unavailable', 503);
    }
    sendData(res, 200, {
      credentials: sanitizePasskeyCredentials(credentials),
      count: credentials.length,
      max: 3,
      context: passkeyEnrollmentContext(),
    }, requestId);
  });
}
