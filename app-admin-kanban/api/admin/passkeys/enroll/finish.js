import { authStateCall } from '../../../_lib/auth-state.js';
import { passphraseFingerprint } from '../../../_lib/crypto.js';
import { handler, HttpError, readJson, requireMethod, requireSameOriginMutation, sendData } from '../../../_lib/http.js';
import { recordLoginRate } from '../../../_lib/rate.js';
import { createOpaqueSession } from '../../../_lib/session.js';
import {
  bootstrapFingerprint,
  challengeContext,
  registrationRecord,
  verifyBootstrapSecret,
  verifyRegistration,
} from '../../../_lib/webauthn.js';

export default function finishPasskeyEnrollment(req, res) {
  return handler(req, res, async (requestId) => {
    requireMethod(req, 'POST');
    requireSameOriginMutation(req);
    const body = await readJson(req, 28 * 1024);
    const flowId = String(body.flowId || '');
    if (!/^[0-9a-f-]{36}$/i.test(flowId) || !body.response || typeof body.response !== 'object'
      || !verifyBootstrapSecret(body.bootstrapSecret)) {
      throw new HttpError('VALIDATION_FAILED', 'Passkey enrollment response is invalid', 400);
    }

    const contextHash = challengeContext(
      'registration',
      flowId,
      `${passphraseFingerprint()}:${bootstrapFingerprint()}`,
    );
    const challenge = await authStateCall('/internal/challenge/consume', {
      id: flowId,
      kind: 'registration',
      contextHash,
    });
    if (!challenge?.challenge) throw new HttpError('MFA_REQUIRED', 'Passkey enrollment challenge expired', 403);
    const bucketKey = String(challenge.payload?.bucketKey || '');

    try {
      const credentials = await authStateCall('/internal/credentials/list');
      if (!Array.isArray(credentials) || credentials.length > 0) {
        throw new Error('Bootstrap enrollment is closed');
      }
      const info = await verifyRegistration(body.response, challenge.challenge);
      await authStateCall('/internal/credential/register', registrationRecord(info, body.label));
      await recordLoginRate(bucketKey, true, 'login');
      await authStateCall('/internal/session/revoke-all', { reason: 'first_passkey_enrolled' });
    } catch {
      if (/^[0-9a-f]{64}$/.test(bucketKey)) await recordLoginRate(bucketKey, false, 'login').catch(() => null);
      throw new HttpError('MFA_REQUIRED', 'Passkey enrollment failed', 403);
    }

    const session = await createOpaqueSession(res);
    sendData(res, 200, {
      enrolled: true,
      actor: session.actor,
      idleExpiresAt: session.idleExpiresAt,
      absoluteExpiresAt: session.absoluteExpiresAt,
    }, requestId);
  });
}
