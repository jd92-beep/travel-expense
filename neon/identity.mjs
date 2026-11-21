import { createRemoteJWKSet, customFetch, jwtVerify } from 'jose';

const uuid = /^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/i;
const neonHost = /^ep-[a-z\d-]+\.neonauth\.(?:c-\d+\.)?[a-z\d-]+\.(?:aws|azure)\.neon\.(?:tech|build)$/;
const supabaseHost = /^[a-z\d-]+\.supabase\.co$/;

function authorityUrl(raw, hostname, pathname) {
  const url = new URL(raw);
  if (url.protocol !== 'https:' || !hostname.test(url.hostname) || !pathname.test(url.pathname) ||
      url.port || url.username || url.password || url.search || url.hash) {
    throw new Error('Invalid authentication authority');
  }
  return url;
}

export function createIdentityBridge({ neonAuthUrl, supabaseUrl, publishableKey, link, resolve, fetcher = fetch }) {
  const neon = authorityUrl(neonAuthUrl, neonHost, /^\/[a-z\d_-]+\/auth\/?$/i);
  const supabase = authorityUrl(supabaseUrl, supabaseHost, /^\/$/);
  if (!publishableKey || typeof link !== 'function' || typeof resolve !== 'function') {
    throw new Error('Account linking configuration is incomplete');
  }
  const jwks = createRemoteJWKSet(new URL(neon.pathname.replace(/\/$/, '') + '/.well-known/jwks.json', neon), {
    [customFetch]: (url, options) => fetcher(url, { ...options, redirect: 'error' }),
  });

  async function verifyNeon(token) {
    if (typeof token !== 'string' || token.length > 8192) return null;
    let payload;
    try {
      ({ payload } = await jwtVerify(token, jwks, {
        algorithms: ['EdDSA'],
        issuer: neon.origin,
        audience: neon.origin,
        requiredClaims: ['sub', 'iat', 'exp'],
        maxTokenAge: '15 minutes',
        clockTolerance: 5,
      }));
    } catch {
      return null;
    }
    return typeof payload.sub === 'string' && uuid.test(payload.sub) &&
      payload.role === 'authenticated' && payload.banned !== true ? payload : null;
  }

  async function account(token) {
    const user = await verifyNeon(token);
    if (!user) return null;
    const ledgerId = await resolve(user.sub);
    return {
      ledgerId: typeof ledgerId === 'string' && uuid.test(ledgerId) ? ledgerId : null,
      email: user.emailVerified === true && typeof user.email === 'string' ? user.email : null,
    };
  }

  return {
    account,
    async resolve(token) {
      return (await account(token))?.ledgerId ?? null;
    },
    async link({ neonToken, legacyToken }) {
      const user = await verifyNeon(neonToken);
      if (!user || user.emailVerified !== true || typeof user.email !== 'string' ||
          typeof legacyToken !== 'string' || !legacyToken || legacyToken.length > 8192) return null;

      const response = await fetcher(new URL('/auth/v1/user', supabase), {
        headers: { apikey: publishableKey, authorization: 'Bearer ' + legacyToken },
        redirect: 'error',
        signal: AbortSignal.timeout(8000),
      });
      if (response.status === 401 || response.status === 403) return null;
      if (!response.ok) throw new Error('Unable to verify the previous account');

      const old = await response.json();
      if (typeof old.id !== 'string' || !uuid.test(old.id) || old.is_anonymous ||
          !old.email_confirmed_at || typeof old.email !== 'string' ||
          old.email.trim().toLowerCase() !== user.email.trim().toLowerCase()) return null;
      return link(old.id, user.sub, user.email);
    },
  };
}
