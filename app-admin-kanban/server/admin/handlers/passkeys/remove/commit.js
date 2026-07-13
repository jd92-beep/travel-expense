import { authStateCall } from '../../../auth-state.js';
import { clearSessionCookies } from '../../../cookies.js';
import { handler, HttpError, readJson, requireMethod, sendData } from '../../../http.js';
import { requireAdminSession } from '../../../session.js';

function removalCommitInput(body) {
  const selector = String(body.selector || '');
  const setHash = String(body.setHash || '');
  const grantId = String(body.grantId || '');
  if (!/^[0-9a-f]{64}$/.test(selector) || !/^[0-9a-f]{64}$/.test(setHash)
    || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(grantId)
    || Object.keys(body).some((key) => !['selector', 'setHash', 'grantId'].includes(key))) {
    throw new HttpError('VALIDATION_FAILED', 'Passkey removal commit is invalid', 400);
  }
  return { selector, setHash, grantId };
}

export function publicRemovalError(code) {
  const errors = {
    FINAL_PASSKEY_PROTECTED: ['PROTECTED_TARGET', 403, 'Final passkey requires the break-glass runbook'],
    MFA_STEP_UP_REQUIRED: ['MFA_REQUIRED', 403, 'Fresh passphrase and passkey approval required'],
    PREVIEW_STALE: ['PREVIEW_STALE', 409, 'Passkey set changed; refresh before removing'],
    TARGET_NOT_FOUND: ['NOT_FOUND', 404, 'Passkey removal target is unavailable'],
    UNAUTHORIZED: ['UNAUTHORIZED', 401, 'Admin session expired'],
    VALIDATION_FAILED: ['VALIDATION_FAILED', 400, 'Passkey removal commit is invalid'],
  };
  const known = errors[String(code)];
  if (!known) {
    return new HttpError('UPSTREAM_UNAVAILABLE', 'Passkey removal is temporarily unavailable', 503, { retryable: true });
  }
  const [publicCode, status, message] = known;
  return new HttpError(publicCode, message, status);
}

export default function commitPasskeyRemoval(req, res) {
  return handler(req, res, async (requestId) => {
    requireMethod(req, 'POST');
    const session = await requireAdminSession(req, { mutation: true });
    const input = removalCommitInput(await readJson(req, 1024));
    const result = await authStateCall('/internal/credential/remove', {
      ...input,
      sessionHash: session.tokenHash,
      requestId,
    }, { actor: session.actor, sessionHash: session.tokenHash });
    if (result?.removed !== true) {
      throw publicRemovalError(result?.errorCode);
    }
    res.setHeader('Set-Cookie', clearSessionCookies());
    sendData(res, 200, { removed: true, revokedSessions: Number(result.revokedSessions || 0) }, requestId);
  });
}
