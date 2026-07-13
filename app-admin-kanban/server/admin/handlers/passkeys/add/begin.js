import crypto from 'node:crypto';

import { authStateCall } from '../../../auth-state.js';
import { handler, HttpError, readJson, requireMethod, sendData } from '../../../http.js';
import { passkeyEnrollmentContext } from '../../../passkeys.js';
import { requireAdminSession } from '../../../session.js';
import { challengeContext, registrationOptions } from '../../../webauthn.js';

export default function beginBackupPasskeyEnrollment(req, res) {
  return handler(req, res, async (requestId) => {
    requireMethod(req, 'POST');
    const session = await requireAdminSession(req, { mutation: true });
    const body = await readJson(req, 1024);
    const grantId = String(body.grantId || '');
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(grantId)
      || Object.keys(body).some((key) => key !== 'grantId')) {
      throw new HttpError('VALIDATION_FAILED', 'Passkey enrollment grant is invalid', 400);
    }

    const credentials = await authStateCall('/internal/credentials/list', {}, {
      actor: session.actor,
      sessionHash: session.tokenHash,
    });
    if (!Array.isArray(credentials)) {
      throw new HttpError('UPSTREAM_UNAVAILABLE', 'Passkey store unavailable', 503);
    }
    if (credentials.length === 0 || credentials.length >= 3) {
      throw new HttpError('PROTECTED_TARGET', 'Backup passkey enrollment is unavailable', 403);
    }

    const context = passkeyEnrollmentContext();
    const consumed = await authStateCall('/internal/step-up/consume', {
      id: grantId,
      sessionHash: session.tokenHash,
      ...context,
    }, { actor: session.actor, sessionHash: session.tokenHash });
    if (consumed !== true) {
      throw new HttpError('MFA_REQUIRED', 'Fresh passphrase and passkey approval required', 403);
    }

    const flowId = crypto.randomUUID();
    const contextHash = challengeContext('registration', flowId, session.tokenHash);
    const options = await registrationOptions(credentials, session.actor);
    await authStateCall('/internal/challenge/create', {
      id: flowId,
      kind: 'registration',
      challenge: options.challenge,
      contextHash,
      payload: {
        sessionHash: session.tokenHash,
        credentialIds: credentials.map((credential) => credential.credentialId),
      },
    }, { actor: session.actor, sessionHash: session.tokenHash });
    sendData(res, 200, { flowId, options }, requestId);
  });
}
