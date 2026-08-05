import { authStateCall } from './auth-state.js';
import { loginBucketKey } from './crypto.js';
import { HttpError } from './http.js';

export async function precheckLoginRate(req, bucketKind = 'login') {
  const bucketKey = loginBucketKey(req, bucketKind);
  const result = await authStateCall('/internal/rate/precheck', { bucketKey, bucketKind });
  if (!result?.allowed) {
    const retryAfterSeconds = Math.max(1, Number(result?.retryAfterSeconds || 1));
    throw new HttpError('RATE_LIMITED', 'Too many authentication attempts', 429, {
      retryable: true,
      retryAfterSeconds,
    });
  }
  return bucketKey;
}

export function recordLoginRate(bucketKey, succeeded, bucketKind = 'login') {
  return authStateCall('/internal/rate/record', { bucketKey, bucketKind, succeeded });
}
