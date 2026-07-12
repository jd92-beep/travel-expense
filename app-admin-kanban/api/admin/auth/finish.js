import { authStateCall } from '../../_lib/auth-state.js';
import { passphraseFingerprint } from '../../_lib/crypto.js';
import { handler, HttpError, readJson, requireMethod, requireSameOriginMutation, sendData } from '../../_lib/http.js';
import { recordLoginRate } from '../../_lib/rate.js';
import { createOpaqueSession } from '../../_lib/session.js';
import { challengeContext, verifyAuthentication } from '../../_lib/webauthn.js';

export default function finishAdminAuthentication(req, res) {
  return handler(req, res, async (requestId) => {
    requireMethod(req, 'POST');
    requireSameOriginMutation(req);
    const body = await readJson(req, 24 * 1024);
    const flowId = String(body.flowId || '');
    if (!/^[0-9a-f-]{36}$/i.test(flowId) || !body.response || typeof body.response !== 'object') {
      throw new HttpError('VALIDATION_FAILED', 'Authentication response is invalid', 400);
    }

    const contextHash = challengeContext('authentication', flowId, passphraseFingerprint());
    const challenge = await authStateCall('/internal/challenge/consume', {
      id: flowId,
      kind: 'authentication',
      contextHash,
    });
    if (!challenge?.challenge) throw new HttpError('MFA_REQUIRED', 'Passkey challenge expired', 403);

    const bucketKey = String(challenge.payload?.bucketKey || '');
    try {
      const credentials = await authStateCall('/internal/credentials/list');
      const credential = Array.isArray(credentials)
        ? credentials.find((entry) => entry.credentialId === body.response.id)
        : null;
      if (!credential || !challenge.payload?.credentialIds?.includes(credential.credentialId)) {
        throw new Error('Passkey credential is not allowed');
      }
      const info = await verifyAuthentication(body.response, challenge.challenge, credential);
      const updated = await authStateCall('/internal/credential/update', {
        credentialId: credential.credentialId,
        counter: info.newCounter,
        deviceType: info.credentialDeviceType,
        backedUp: info.credentialBackedUp,
      });
      if (updated !== true) throw new Error('Passkey counter update failed');
      await recordLoginRate(bucketKey, true, 'login');
    } catch {
      if (/^[0-9a-f]{64}$/.test(bucketKey)) await recordLoginRate(bucketKey, false, 'login').catch(() => null);
      throw new HttpError('MFA_REQUIRED', 'Passkey verification failed', 403);
    }

    const session = await createOpaqueSession(res);
    sendData(res, 200, {
      actor: session.actor,
      idleExpiresAt: session.idleExpiresAt,
      absoluteExpiresAt: session.absoluteExpiresAt,
    }, requestId);
  });
}
