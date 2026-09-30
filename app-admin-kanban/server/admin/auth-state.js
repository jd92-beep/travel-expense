import { adminAuthStateUrl, callSignedEdge } from './edge.js';
import { HttpError, redact } from './http.js';

export async function authStateCall(route, body = {}, context = {}) {
  let response;
  try {
    response = await callSignedEdge({
      actor: context.actor,
      baseUrl: adminAuthStateUrl(),
      body,
      method: 'POST',
      route,
      sessionHash: context.sessionHash || 'unauthenticated',
      timeoutMs: 10_000,
    });
  } catch (error) {
    // Fail closed to the client, but keep the transport cause in the server log.
    console.error(JSON.stringify({
      event: 'admin_auth_state_transport_failed',
      message: redact(error instanceof Error ? error.message : error),
      route,
    }));
    throw new HttpError('UPSTREAM_UNAVAILABLE', 'Admin session store unavailable', 503, { retryable: true });
  }

  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload?.ok) {
    const code = payload?.error?.code || 'UPSTREAM_UNAVAILABLE';
    const status = response.status >= 400 && response.status < 600 ? response.status : 503;
    throw new HttpError(code, payload?.error?.message || 'Admin session store unavailable', status, {
      retryable: payload?.error?.retryable === true,
    });
  }
  return payload.data;
}
