import crypto from 'node:crypto';

import { authStateCall } from '../../_lib/auth-state.js';
import { passphraseFingerprint, verifyAdminPassphrase } from '../../_lib/crypto.js';
import { handler, HttpError, readJson, requireMethod, sendData } from '../../_lib/http.js';
import { precheckLoginRate, recordLoginRate } from '../../_lib/rate.js';
import { requireAdminSession } from '../../_lib/session.js';
import { authenticationOptions, challengeContext } from '../../_lib/webauthn.js';

function operationContext(body) {
  const action = String(body.action || '');
  const targetHash = String(body.targetHash || '');
  const previewHash = String(body.previewHash || '');
  if (!/^[a-z0-9_]{1,64}$/.test(action)
    || !/^[0-9a-f]{64}$/.test(targetHash)
    || !/^[0-9a-f]{64}$/.test(previewHash)) {
    throw new HttpError('VALIDATION_FAILED', 'Step-up operation context is invalid', 400);
  }
  return { action, targetHash, previewHash };
}

export default function beginAdminReauthentication(req, res) {
  return handler(req, res, async (requestId) => {
    requireMethod(req, 'POST');
    const session = await requireAdminSession(req, { mutation: true });
    const body = await readJson(req, 4096);
    const operation = operationContext(body);
    const bucketKey = await precheckLoginRate(req, 'reauth');
    if (!await verifyAdminPassphrase(body.passphrase)) {
      await recordLoginRate(bucketKey, false, 'reauth');
      throw new HttpError('UNAUTHORIZED', 'Admin re-authentication failed', 401);
    }

    const credentials = await authStateCall('/internal/credentials/list');
    if (!Array.isArray(credentials) || credentials.length === 0) {
      throw new HttpError('MFA_REQUIRED', 'Boss passkey required', 403);
    }
    const flowId = crypto.randomUUID();
    const contextHash = challengeContext(
      'reauth',
      flowId,
      `${session.tokenHash}:${passphraseFingerprint()}`,
    );
    const options = await authenticationOptions(credentials);
    await authStateCall('/internal/challenge/create', {
      id: flowId,
      kind: 'reauth',
      challenge: options.challenge,
      contextHash,
      payload: {
        bucketKey,
        sessionHash: session.tokenHash,
        credentialIds: credentials.map((credential) => credential.credentialId),
        ...operation,
      },
    }, { sessionHash: session.tokenHash, actor: session.actor });
    sendData(res, 200, { flowId, options }, requestId);
  });
}
