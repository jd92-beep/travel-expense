import crypto from 'node:crypto';

import { authStateCall } from '../../auth-state.js';
import { passphraseFingerprint } from '../../crypto.js';
import { handler, HttpError, readJson, requireMethod, sendData } from '../../http.js';
import { recordLoginRate } from '../../rate.js';
import { requireAdminSession, rotateOpaqueSession } from '../../session.js';
import { challengeContext, verifyAuthentication } from '../../webauthn.js';

export default function finishAdminReauthentication(req, res) {
  return handler(req, res, async (requestId) => {
    requireMethod(req, 'POST');
    const session = await requireAdminSession(req, { mutation: true });
    const body = await readJson(req, 24 * 1024);
    const flowId = String(body.flowId || '');
    if (!/^[0-9a-f-]{36}$/i.test(flowId) || !body.response || typeof body.response !== 'object') {
      throw new HttpError('VALIDATION_FAILED', 'Re-authentication response is invalid', 400);
    }
    const contextHash = challengeContext(
      'reauth',
      flowId,
      `${session.tokenHash}:${passphraseFingerprint()}`,
    );
    const challenge = await authStateCall('/internal/challenge/consume', {
      id: flowId,
      kind: 'reauth',
      contextHash,
    }, { sessionHash: session.tokenHash, actor: session.actor });
    if (!challenge?.challenge || challenge.payload?.sessionHash !== session.tokenHash) {
      throw new HttpError('MFA_REQUIRED', 'Re-authentication challenge expired', 403);
    }

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
    } catch {
      if (/^[0-9a-f]{64}$/.test(bucketKey)) await recordLoginRate(bucketKey, false, 'reauth');
      throw new HttpError('MFA_REQUIRED', 'Passkey verification failed', 403);
    }
    await recordLoginRate(bucketKey, true, 'reauth');

    const rotated = await rotateOpaqueSession(res, session);
    const grantId = crypto.randomUUID();
    const grant = await authStateCall('/internal/step-up/create', {
      id: grantId,
      sessionHash: rotated.tokenHash,
      action: challenge.payload.action,
      targetHash: challenge.payload.targetHash,
      previewHash: challenge.payload.previewHash,
    }, { sessionHash: rotated.tokenHash, actor: session.actor });
    sendData(res, 200, {
      grantId: grant.grantId,
      expiresAt: grant.expiresAt,
    }, requestId);
  });
}
