import crypto from 'node:crypto';

import { authStateCall } from '../../auth-state.js';
import { passphraseFingerprint, verifyAdminPassphrase } from '../../crypto.js';
import { handler, HttpError, readJson, requireMethod, requireSameOriginMutation, sendData } from '../../http.js';
import { precheckLoginRate, recordLoginRate } from '../../rate.js';
import { authenticationOptions, challengeContext } from '../../webauthn.js';

export default function beginAdminAuthentication(req, res) {
  return handler(req, res, async (requestId) => {
    requireMethod(req, 'POST');
    requireSameOriginMutation(req);
    const body = await readJson(req, 1024);
    const bucketKey = await precheckLoginRate(req, 'login');
    if (!await verifyAdminPassphrase(body.passphrase)) {
      await recordLoginRate(bucketKey, false, 'login');
      throw new HttpError('UNAUTHORIZED', 'Admin authentication failed', 401);
    }

    const credentials = await authStateCall('/internal/credentials/list');
    if (!Array.isArray(credentials) || credentials.length === 0) {
      throw new HttpError('MFA_REQUIRED', 'Boss passkey enrollment required', 403);
    }

    const flowId = crypto.randomUUID();
    const contextHash = challengeContext('authentication', flowId, passphraseFingerprint());
    const options = await authenticationOptions(credentials);
    await authStateCall('/internal/challenge/create', {
      id: flowId,
      kind: 'authentication',
      challenge: options.challenge,
      contextHash,
      payload: {
        bucketKey,
        credentialIds: credentials.map((credential) => credential.credentialId),
      },
    });
    sendData(res, 200, { flowId, options }, requestId);
  });
}
