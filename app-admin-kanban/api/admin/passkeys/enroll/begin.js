import crypto from 'node:crypto';

import { authStateCall } from '../../../_lib/auth-state.js';
import { passphraseFingerprint, verifyAdminPassphrase } from '../../../_lib/crypto.js';
import { handler, HttpError, readJson, requireMethod, requireSameOriginMutation, sendData } from '../../../_lib/http.js';
import { precheckLoginRate, recordLoginRate } from '../../../_lib/rate.js';
import {
  bootstrapFingerprint,
  challengeContext,
  registrationOptions,
  verifyBootstrapSecret,
} from '../../../_lib/webauthn.js';

export default function beginPasskeyEnrollment(req, res) {
  return handler(req, res, async (requestId) => {
    requireMethod(req, 'POST');
    requireSameOriginMutation(req);
    const body = await readJson(req, 2048);
    const bucketKey = await precheckLoginRate(req, 'login');
    if (!await verifyAdminPassphrase(body.passphrase) || !verifyBootstrapSecret(body.bootstrapSecret)) {
      await recordLoginRate(bucketKey, false, 'login');
      throw new HttpError('UNAUTHORIZED', 'Passkey enrollment authentication failed', 401);
    }

    const credentials = await authStateCall('/internal/credentials/list');
    if (!Array.isArray(credentials)) throw new HttpError('UPSTREAM_UNAVAILABLE', 'Passkey store unavailable', 503);
    if (credentials.length > 0) {
      throw new HttpError('PROTECTED_TARGET', 'Bootstrap enrollment is permanently closed', 403);
    }

    const flowId = crypto.randomUUID();
    const contextHash = challengeContext(
      'registration',
      flowId,
      `${passphraseFingerprint()}:${bootstrapFingerprint()}`,
    );
    const options = await registrationOptions(credentials, process.env.ADMIN_KANBAN_SUBJECT || 'boss');
    await authStateCall('/internal/challenge/create', {
      id: flowId,
      kind: 'registration',
      challenge: options.challenge,
      contextHash,
      payload: { bucketKey },
    });
    sendData(res, 200, { flowId, options }, requestId);
  });
}
