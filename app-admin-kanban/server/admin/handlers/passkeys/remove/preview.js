import { authStateCall } from '../../../auth-state.js';
import { handler, HttpError, readJson, requireMethod, sendData } from '../../../http.js';
import { passkeyRemovalContext, passkeyRemovalPreview } from '../../../passkeys.js';
import { requireAdminSession } from '../../../session.js';

function removalInput(body) {
  const selector = String(body.selector || '');
  const setHash = String(body.setHash || '');
  if (!/^[0-9a-f]{64}$/.test(selector) || !/^[0-9a-f]{64}$/.test(setHash)
    || Object.keys(body).some((key) => !['selector', 'setHash'].includes(key))) {
    throw new HttpError('VALIDATION_FAILED', 'Passkey removal context is invalid', 400);
  }
  return { selector, setHash };
}

export function publicPreviewError(error) {
  if (error instanceof HttpError) return error;
  const message = String(error?.message || error);
  if (/final passkey/i.test(message)) {
    return new HttpError('PROTECTED_TARGET', 'Final passkey requires the break-glass runbook', 403);
  }
  if (/target/i.test(message)) return new HttpError('NOT_FOUND', 'Passkey removal target is unavailable', 404);
  return new HttpError('UPSTREAM_UNAVAILABLE', 'Passkey store unavailable', 503, { retryable: true });
}

export default function previewPasskeyRemoval(req, res) {
  return handler(req, res, async (requestId) => {
    requireMethod(req, 'POST');
    const session = await requireAdminSession(req, { mutation: true });
    const input = removalInput(await readJson(req, 1024));
    const credentials = await authStateCall('/internal/credentials/list', {}, {
      actor: session.actor,
      sessionHash: session.tokenHash,
    });
    try {
      const preview = passkeyRemovalPreview(credentials, input.selector);
      if (preview.setHash !== input.setHash) {
        throw new HttpError('PREVIEW_STALE', 'Passkey set changed; refresh before removing', 409);
      }
      sendData(res, 200, { ...preview, context: passkeyRemovalContext(preview.selector, preview.setHash) }, requestId);
    } catch (error) {
      throw publicPreviewError(error);
    }
  });
}
