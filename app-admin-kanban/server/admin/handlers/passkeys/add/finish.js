import { authStateCall } from '../../../auth-state.js';
import { handler, HttpError, readJson, requireMethod, sendData } from '../../../http.js';
import { sameCredentialIds } from '../../../passkeys.js';
import { requireAdminSession, rotateOpaqueSession } from '../../../session.js';
import { challengeContext, registrationRecord, verifyRegistration } from '../../../webauthn.js';

export default function finishBackupPasskeyEnrollment(req, res) {
  return handler(req, res, async (requestId) => {
    requireMethod(req, 'POST');
    const session = await requireAdminSession(req, { mutation: true });
    const body = await readJson(req, 28 * 1024);
    const flowId = String(body.flowId || '');
    const label = String(body.label || '').trim().slice(0, 128);
    if (!/^[0-9a-f-]{36}$/i.test(flowId) || !body.response || typeof body.response !== 'object'
      || Object.keys(body).some((key) => !['flowId', 'label', 'response'].includes(key))) {
      throw new HttpError('VALIDATION_FAILED', 'Passkey enrollment response is invalid', 400);
    }

    const contextHash = challengeContext('registration', flowId, session.tokenHash);
    const challenge = await authStateCall('/internal/challenge/consume', {
      id: flowId,
      kind: 'registration',
      contextHash,
    }, { actor: session.actor, sessionHash: session.tokenHash });
    if (!challenge?.challenge || challenge.payload?.sessionHash !== session.tokenHash) {
      throw new HttpError('MFA_REQUIRED', 'Passkey enrollment challenge expired', 403);
    }

    try {
      const credentials = await authStateCall('/internal/credentials/list', {}, {
        actor: session.actor,
        sessionHash: session.tokenHash,
      });
      if (!Array.isArray(credentials) || credentials.length === 0 || credentials.length >= 3
        || !sameCredentialIds(credentials, challenge.payload?.credentialIds)) {
        throw new Error('Passkey enrollment state changed');
      }
      const info = await verifyRegistration(body.response, challenge.challenge);
      const record = registrationRecord(info, label);
      const rotated = await rotateOpaqueSession(res, session);
      const credential = await authStateCall('/internal/credential/register-backup', {
        ...record,
        sessionHash: rotated.tokenHash,
        requestId,
      }, { actor: session.actor, sessionHash: rotated.tokenHash });
      sendData(res, 200, {
        enrolled: true,
        credential,
        actor: rotated.actor,
        authMethod: rotated.authMethod,
        idleExpiresAt: rotated.idleExpiresAt,
        absoluteExpiresAt: rotated.absoluteExpiresAt,
      }, requestId);
    } catch (error) {
      if (error instanceof HttpError) throw error;
      throw new HttpError('MFA_REQUIRED', 'Passkey enrollment failed', 403);
    }
  });
}
